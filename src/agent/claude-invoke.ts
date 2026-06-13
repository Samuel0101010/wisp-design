// wisp-design — Headless Claude CLI invocation for variant generation (Phase 7.9).
//
// Architecturally clean alternative to "Claude in conversation polls events":
// the live daemon process spawns `claude -p` for each `generating` event,
// parses the JSON envelope, extracts variants, and POSTs cycling back. The
// user's existing Claude Code subscription handles auth — no API key needed.
//
// Why Haiku + minimal flags:
//   - Variant gen is a small focused task (~1k input, ~500 output tokens).
//     Haiku 4.5 nails this in ~3–8s for a few cents.
//   - `--tools ""` disables tools entirely — variant gen is pure text reply.
//   - `--no-session-persistence` — one-shot, don't pollute `.claude/sessions`.
//   - `--disable-slash-commands` — don't load other plugin skills.
//   - `--max-budget-usd 0.10` — safety net per call.
//   - We deliberately do NOT use `--bare` because that flag disables OAuth /
//     keychain auth and requires ANTHROPIC_API_KEY. Subscription users
//     authenticate via OAuth, which `--bare` refuses to read. The cost is
//     5–15s of extra startup (hooks/LSP/plugin sync), but it's the price for
//     using the user's existing Claude Code subscription instead of asking
//     them to provide an API key.
//
// The wisp-design plugin folder itself is NOT loaded into the spawned claude
// (no --plugin-dir flag) so the nested claude doesn't re-trigger this skill.
// We deliberately do NOT pass --permission-mode auto / --dangerously-skip-permissions
// because (a) we're not using tools and (b) the parent Claude Code classifier
// will refuse to spawn nested claude with those flags from inside a CC session.

import { execFile } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileP = promisify(execFile);

// One temp working dir per process, reused across invocations. Spawning
// claude from this neutral cwd prevents it from auto-discovering the
// wisp-design plugin's CLAUDE.md and recursing into this skill.
let neutralCwd: string | null = null;
function getNeutralCwd(): string {
  if (neutralCwd === null) {
    neutralCwd = mkdtempSync(join(tmpdir(), "wisp-claude-cwd-"));
  }
  return neutralCwd;
}

// Match the schema shape in src/contracts/bridge.ts (VariantSchema).
export interface InvokedVariant {
  id: string;
  css: string;
  rationale: string;
}

export interface GeneratingTarget {
  selector: string;
  tag: string;
}

export interface InvokeClaudeRequest {
  target: GeneratingTarget;
  freeText: string;
  /** Phase 7.17 — pasted design-reference code from the snippet popup. */
  codeSnippet?: string;
  variantCount: number;
}

export type InvokeClaudeResult =
  | { ok: true; variants: InvokedVariant[]; costUsd: number; durationMs: number; model: string }
  | {
      ok: false;
      reason:
        | "claude-not-found"
        | "invocation-failed"
        | "envelope-parse-failed"
        | "no-json-in-result"
        | "variants-parse-failed"
        | "no-variants"
        | "claude-error"
        | "timeout";
      detail?: string;
      stderr?: string;
    };

export interface InvokeClaudeOptions {
  /** Path to the claude CLI binary. Default: "claude" (PATH lookup). */
  claudeBin?: string;
  /** Model alias: "haiku" | "sonnet" | "opus". Default: "haiku". */
  model?: string;
  /** Per-invocation timeout in ms. Default: 60_000. */
  timeoutMs?: number;
  /** Spending cap per invocation in USD. Default: 0.10. */
  maxBudgetUsd?: number;
  /** Override prompt builder for testing. */
  buildPrompt?: (req: InvokeClaudeRequest) => string;
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export async function invokeClaudeForVariants(
  req: InvokeClaudeRequest,
  opts: InvokeClaudeOptions = {},
): Promise<InvokeClaudeResult> {
  const claudeBin = opts.claudeBin ?? "claude";
  const model = opts.model ?? "haiku";
  const timeoutMs = opts.timeoutMs ?? 60_000;
  const maxBudgetUsd = opts.maxBudgetUsd ?? 0.1;
  const prompt = (opts.buildPrompt ?? buildVariantPrompt)(req);

  // We pipe the prompt via stdin (-p with no positional arg) so even multi-KB
  // prompts work without quoting hell. The schema is passed inline so claude
  // refuses non-conforming output. We deliberately do NOT pass
  // --dangerously-skip-permissions or --permission-mode auto: the user runs
  // this from their own terminal (or via a wisp-design slash command that
  // launches a background process), and the parent CC classifier refuses
  // to spawn nested claude with those flags anyway.
  const args = [
    "-p",
    "--model",
    model,
    "--tools",
    "",
    "--output-format",
    "json",
    "--no-session-persistence",
    "--disable-slash-commands",
    "--max-budget-usd",
    String(maxBudgetUsd),
    // Custom system prompt that REPLACES claude's default 50k-token system
    // prompt. Combined with --strict-mcp-config and --setting-sources ""
    // below, this drops cache_creation_input_tokens from ~62k → ~6k tokens,
    // taking variant-gen cost from ~$0.16/call down to ~$0.04/call (4x).
    "--system-prompt",
    SYSTEM_PROMPT,
    // Skip all MCP server loading. Without this, claude auto-loads every
    // MCP server in the user's settings (claude-flow, ruflo, github, etc.)
    // adding tens of thousands of tokens for tool descriptions.
    "--strict-mcp-config",
    // Skip auto-loading user/project/local settings. Without this, claude
    // loads ~/.claude/CLAUDE.md and any project CLAUDE.md it discovers.
    "--setting-sources",
    "",
    // NB: we deliberately do NOT pass --json-schema. With our minimal
    // system-prompt + cleared MCP/settings, --json-schema causes claude to
    // emit `subtype:success` + empty `result` instead of the JSON object.
    // The extractJsonObject helper handles the ```json fences claude wraps
    // in by default.
  ];

  let stdout: string;
  let stderr: string;
  try {
    const child = execFile(claudeBin, args, {
      maxBuffer: 20 * 1024 * 1024,
      timeout: timeoutMs,
      cwd: getNeutralCwd(),
    });
    // Write prompt to stdin and close — claude --print reads from stdin when
    // no positional prompt is provided.
    if (child.stdin !== null) {
      child.stdin.write(prompt);
      child.stdin.end();
    }
    const result = await new Promise<{ stdout: string; stderr: string; code: number | null }>(
      (resolve, reject) => {
        let out = "";
        let err = "";
        child.stdout?.on("data", (c: Buffer | string) => (out += c.toString()));
        child.stderr?.on("data", (c: Buffer | string) => (err += c.toString()));
        child.on("error", reject);
        child.on("close", (code) => {
          // Don't reject on non-zero — claude often returns 0 even on
          // is_error:true envelopes, and we want the parser to surface the
          // error reason from the JSON. Reject only when there's NO stdout
          // at all to parse.
          resolve({ stdout: out, stderr: err, code });
        });
      },
    );
    stdout = result.stdout;
    stderr = result.stderr;
    if (stdout === "") {
      return {
        ok: false,
        reason: "invocation-failed",
        detail: `claude exited with code ${result.code} and no stdout. stderr=${stderr.slice(0, 500)}`,
        stderr,
      };
    }
  } catch (err) {
    const e = err as NodeJS.ErrnoException & {
      signal?: string;
      stderr?: string;
    };
    if (e.code === "ENOENT")
      return { ok: false, reason: "claude-not-found", detail: claudeBin };
    if (e.signal === "SIGTERM" || (e as { killed?: boolean }).killed === true)
      return { ok: false, reason: "timeout", detail: `>${timeoutMs}ms` };
    return {
      ok: false,
      reason: "invocation-failed",
      detail: (err as Error).message,
      ...(e.stderr !== undefined ? { stderr: e.stderr } : {}),
    };
  }

  const parsed = parseClaudeEnvelope(stdout, model);
  if (!parsed.ok && stderr !== undefined && stderr !== "") {
    return { ...parsed, stderr };
  }
  return parsed;
}

// ---------------------------------------------------------------------------
// parseClaudeEnvelope — pure parsing logic. Exported for unit testing.
// Takes the raw claude --output-format=json stdout, returns the same
// InvokeClaudeResult shape (minus stderr passthrough which the caller adds).
// ---------------------------------------------------------------------------

export function parseClaudeEnvelope(
  stdout: string,
  model: string,
): InvokeClaudeResult {
  interface Envelope {
    result?: string;
    total_cost_usd?: number;
    duration_ms?: number;
    is_error?: boolean;
    subtype?: string;
    permission_denials?: unknown[];
  }
  let envelope: Envelope;
  try {
    envelope = JSON.parse(stdout) as Envelope;
  } catch (err) {
    return {
      ok: false,
      reason: "envelope-parse-failed",
      detail: (err as Error).message,
    };
  }
  if (envelope.is_error === true || envelope.subtype === "error") {
    return {
      ok: false,
      reason: "claude-error",
      detail: envelope.subtype ?? "is_error=true",
    };
  }
  const result = envelope.result ?? "";

  // The model may wrap in markdown fences despite the json-schema. Strip and
  // extract the FIRST balanced JSON object (greedy match on the variants key).
  const extracted = extractJsonObject(result);
  if (extracted === null) {
    return {
      ok: false,
      reason: "no-json-in-result",
      detail: result.slice(0, 300),
    };
  }

  let parsed: { variants?: Array<{ css?: unknown; rationale?: unknown }> };
  try {
    parsed = JSON.parse(extracted) as typeof parsed;
  } catch (err) {
    return {
      ok: false,
      reason: "variants-parse-failed",
      detail: `${(err as Error).message} | extracted=${extracted.slice(0, 200)}`,
    };
  }
  if (!Array.isArray(parsed.variants) || parsed.variants.length === 0) {
    return {
      ok: false,
      reason: "no-variants",
      detail: JSON.stringify(parsed).slice(0, 200),
    };
  }

  const variants: InvokedVariant[] = parsed.variants.map((v, i) => ({
    id: `v${i}`,
    css: typeof v.css === "string" ? v.css : "",
    rationale: typeof v.rationale === "string" ? v.rationale : `Variant ${i + 1}`,
  }));

  return {
    ok: true,
    variants,
    costUsd: typeof envelope.total_cost_usd === "number" ? envelope.total_cost_usd : 0,
    durationMs: typeof envelope.duration_ms === "number" ? envelope.duration_ms : 0,
    model,
  };
}

// ---------------------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------------------

export function buildVariantPrompt(req: InvokeClaudeRequest): string {
  const variantCount = Math.max(1, Math.min(8, req.variantCount));
  const remaining = variantCount - 1;
  const tagHints: Record<string, string> = {
    H1: "typography axes (weight, tracking, line-height, letter-spacing)",
    H2: "typography axes (weight, tracking, line-height)",
    H3: "typography axes (weight, tracking, font-style)",
    BUTTON: "padding, border-radius, weight, color, hover micro-interaction",
    INPUT: "border, padding, focus-ring, background",
    IMG: "aspect-ratio, object-fit, border-radius, filter",
    ARTICLE: "density (padding/gap), border-radius, shadow, accent border",
    SECTION: "density (padding/gap), layout, hierarchy",
    DIV: "density, layout, hierarchy, shadow",
  };
  const tagHint = tagHints[req.target.tag.toUpperCase()] ?? "any primary axis";

  // Phase 7.17 — pasted design-reference code rides along as its own block.
  // Cap mirrors CODE_SNIPPET_MAX_LEN; the snippet describes the LOOK the
  // user wants, in whatever framework they copied it from.
  const snippetBlock =
    req.codeSnippet !== undefined && req.codeSnippet.length > 0
      ? [
          `DESIGN REFERENCE CODE (user-pasted, any framework — reproduce the LOOK via CSS variants, do not echo the code):`,
          "```",
          req.codeSnippet.slice(0, 20000),
          "```",
          ``,
        ]
      : [];

  return [
    `You are designing CSS variants for the wisp-design live overlay.`,
    `Respond with ONLY raw JSON (no markdown fences, no preamble, no postscript).`,
    ``,
    `PICKED ELEMENT:`,
    `- Selector: ${req.target.selector}`,
    `- Tag: ${req.target.tag}`,
    `- User wish: "${req.freeText.replace(/"/g, '\\"').slice(0, 1000)}"`,
    `- Variants requested: ${variantCount}`,
    `- Suggested axes for this tag: ${tagHint}`,
    ``,
    ...snippetBlock,
    `STRICT RULES:`,
    `1. Variant 0 MUST be identity baseline: css="/* baseline */", rationale="Baseline — original.".`,
    `2. The remaining ${remaining} variants each on a DIFFERENT primary axis (typography, spacing, color, layout, hierarchy, motion). Three color variations of the same layout is SLOP — do not do it.`,
    `3. CSS shape: the INNER content of @scope ([data-wisp-variant="N"]) { ... }. Use ":scope > <descendant-selector>" to reach descendants of the picked element. All declarations use !important to override Tailwind/utility classes.`,
    `4. For motion variants: include @media (prefers-reduced-motion: reduce) { :scope, :scope * { animation: none !important; transition: none !important; } } at the END of that variant's css.`,
    `5. Anti-slop HARD bans (NEVER use): purple-blue gradient (from-purple-*/to-blue-*), glassmorphism (backdrop-blur), gradient-text-headline (background-clip:text on h1/h2/h3), hero-metric template (98%/3.2x/24/7 at >24px), default-tailwind-blue without justification, em-dash UI noise.`,
    `6. Rationale: ONE sentence ≤180 chars, axis-attributed (e.g. "Looser density + larger touch targets — primary action gains weight from the surrounding breathing room.").`,
    ``,
    `OUTPUT EXACT JSON SHAPE:`,
    `{"variants":[`,
    `  {"css":"/* baseline */","rationale":"Baseline — original."},`,
    `  {"css":":scope > article { padding: 2em !important; gap: 1em !important; }","rationale":"Generous density — gives content room to breathe."},`,
    `  ...`,
    `]}`,
  ].join("\n");
}

// Minimal system prompt — replaces claude's default 50k-token system prompt
// so we don't pay for hooks/LSP/CLAUDE.md auto-loading on every variant call.
const SYSTEM_PROMPT =
  "You are wisp-design's variant generator. You design CSS variants for a " +
  "live frontend design overlay. You respond with ONLY raw JSON matching " +
  "the user-provided schema. No preamble, no explanation, no markdown fences. " +
  "Follow the anti-slop rules in every variant. Be concise.";

// JSON schema for --json-schema flag. Keeps claude honest about output shape.
const VARIANTS_JSON_SCHEMA = JSON.stringify({
  type: "object",
  properties: {
    variants: {
      type: "array",
      minItems: 1,
      maxItems: 8,
      items: {
        type: "object",
        properties: {
          css: { type: "string" },
          rationale: { type: "string" },
        },
        required: ["css", "rationale"],
      },
    },
  },
  required: ["variants"],
});

// ---------------------------------------------------------------------------
// JSON extraction — tolerant of markdown fences and surrounding text.
// ---------------------------------------------------------------------------

export function extractJsonObject(text: string): string | null {
  // Strip leading/trailing whitespace + markdown fence blocks.
  const trimmed = text.trim();
  // Case 1: pure JSON.
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;
  // Case 2: fenced ```json ... ``` block.
  const fenceMatch = /```(?:json)?\s*\n([\s\S]*?)\n```/i.exec(trimmed);
  if (fenceMatch !== null && fenceMatch[1] !== undefined) {
    const inner = fenceMatch[1].trim();
    if (inner.startsWith("{") && inner.endsWith("}")) return inner;
  }
  // Case 3: find first { and last } and try.
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const candidate = trimmed.slice(firstBrace, lastBrace + 1);
    return candidate;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Convenience: detect whether claude CLI is reachable. Used at daemon boot
// to surface a clear error message rather than failing per-event.
// ---------------------------------------------------------------------------

export async function detectClaudeBin(claudeBin = "claude"): Promise<{
  ok: boolean;
  version?: string;
  reason?: string;
}> {
  try {
    const { stdout } = await execFileP(claudeBin, ["--version"], {
      timeout: 5_000,
    });
    const m = /(\d+\.\d+\.\d+)/.exec(stdout);
    return { ok: true, version: m?.[1] ?? stdout.trim() };
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === "ENOENT") return { ok: false, reason: "not-in-PATH" };
    return { ok: false, reason: (err as Error).message };
  }
}
