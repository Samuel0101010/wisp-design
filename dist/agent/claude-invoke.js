#!/usr/bin/env node

// src/agent/claude-invoke.ts
import { execFile } from "child_process";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { promisify } from "util";
var execFileP = promisify(execFile);
var neutralCwd = null;
function getNeutralCwd() {
  if (neutralCwd === null) {
    neutralCwd = mkdtempSync(join(tmpdir(), "wisp-claude-cwd-"));
  }
  return neutralCwd;
}
async function invokeClaudeForVariants(req, opts = {}) {
  const claudeBin = opts.claudeBin ?? "claude";
  const model = opts.model ?? "haiku";
  const timeoutMs = opts.timeoutMs ?? 6e4;
  const maxBudgetUsd = opts.maxBudgetUsd ?? 0.1;
  const prompt = (opts.buildPrompt ?? buildVariantPrompt)(req);
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
    ""
    // NB: we deliberately do NOT pass --json-schema. With our minimal
    // system-prompt + cleared MCP/settings, --json-schema causes claude to
    // emit `subtype:success` + empty `result` instead of the JSON object.
    // The extractJsonObject helper handles the ```json fences claude wraps
    // in by default.
  ];
  let stdout;
  let stderr;
  try {
    const child = execFile(claudeBin, args, {
      maxBuffer: 20 * 1024 * 1024,
      timeout: timeoutMs,
      cwd: getNeutralCwd()
    });
    if (child.stdin !== null) {
      child.stdin.write(prompt);
      child.stdin.end();
    }
    const result = await new Promise(
      (resolve, reject) => {
        let out = "";
        let err = "";
        child.stdout?.on("data", (c) => out += c.toString());
        child.stderr?.on("data", (c) => err += c.toString());
        child.on("error", reject);
        child.on("close", (code) => {
          resolve({ stdout: out, stderr: err, code });
        });
      }
    );
    stdout = result.stdout;
    stderr = result.stderr;
    if (stdout === "") {
      return {
        ok: false,
        reason: "invocation-failed",
        detail: `claude exited with code ${result.code} and no stdout. stderr=${stderr.slice(0, 500)}`,
        stderr
      };
    }
  } catch (err) {
    const e = err;
    if (e.code === "ENOENT")
      return { ok: false, reason: "claude-not-found", detail: claudeBin };
    if (e.signal === "SIGTERM" || e.killed === true)
      return { ok: false, reason: "timeout", detail: `>${timeoutMs}ms` };
    return {
      ok: false,
      reason: "invocation-failed",
      detail: err.message,
      ...e.stderr !== void 0 ? { stderr: e.stderr } : {}
    };
  }
  const parsed = parseClaudeEnvelope(stdout, model);
  if (!parsed.ok && stderr !== void 0 && stderr !== "") {
    return { ...parsed, stderr };
  }
  return parsed;
}
function parseClaudeEnvelope(stdout, model) {
  let envelope;
  try {
    envelope = JSON.parse(stdout);
  } catch (err) {
    return {
      ok: false,
      reason: "envelope-parse-failed",
      detail: err.message
    };
  }
  if (envelope.is_error === true || envelope.subtype === "error") {
    return {
      ok: false,
      reason: "claude-error",
      detail: envelope.subtype ?? "is_error=true"
    };
  }
  const result = envelope.result ?? "";
  const extracted = extractJsonObject(result);
  if (extracted === null) {
    return {
      ok: false,
      reason: "no-json-in-result",
      detail: result.slice(0, 300)
    };
  }
  let parsed;
  try {
    parsed = JSON.parse(extracted);
  } catch (err) {
    return {
      ok: false,
      reason: "variants-parse-failed",
      detail: `${err.message} | extracted=${extracted.slice(0, 200)}`
    };
  }
  if (!Array.isArray(parsed.variants) || parsed.variants.length === 0) {
    return {
      ok: false,
      reason: "no-variants",
      detail: JSON.stringify(parsed).slice(0, 200)
    };
  }
  const variants = parsed.variants.map((v, i) => ({
    id: `v${i}`,
    css: typeof v.css === "string" ? v.css : "",
    rationale: typeof v.rationale === "string" ? v.rationale : `Variant ${i + 1}`
  }));
  return {
    ok: true,
    variants,
    costUsd: typeof envelope.total_cost_usd === "number" ? envelope.total_cost_usd : 0,
    durationMs: typeof envelope.duration_ms === "number" ? envelope.duration_ms : 0,
    model
  };
}
function buildVariantPrompt(req) {
  const variantCount = Math.max(1, Math.min(8, req.variantCount));
  const remaining = variantCount - 1;
  const tagHints = {
    H1: "typography axes (weight, tracking, line-height, letter-spacing)",
    H2: "typography axes (weight, tracking, line-height)",
    H3: "typography axes (weight, tracking, font-style)",
    BUTTON: "padding, border-radius, weight, color, hover micro-interaction",
    INPUT: "border, padding, focus-ring, background",
    IMG: "aspect-ratio, object-fit, border-radius, filter",
    ARTICLE: "density (padding/gap), border-radius, shadow, accent border",
    SECTION: "density (padding/gap), layout, hierarchy",
    DIV: "density, layout, hierarchy, shadow"
  };
  const tagHint = tagHints[req.target.tag.toUpperCase()] ?? "any primary axis";
  return [
    `You are designing CSS variants for the wisp-design live overlay.`,
    `Respond with ONLY raw JSON (no markdown fences, no preamble, no postscript).`,
    ``,
    `PICKED ELEMENT:`,
    `- Selector: ${req.target.selector}`,
    `- Tag: ${req.target.tag}`,
    `- User wish: "${req.freeText.replace(/"/g, '\\"').slice(0, 1e3)}"`,
    `- Variants requested: ${variantCount}`,
    `- Suggested axes for this tag: ${tagHint}`,
    ``,
    `STRICT RULES:`,
    `1. Variant 0 MUST be identity baseline: css="/* baseline */", rationale="Baseline \u2014 original.".`,
    `2. The remaining ${remaining} variants each on a DIFFERENT primary axis (typography, spacing, color, layout, hierarchy, motion). Three color variations of the same layout is SLOP \u2014 do not do it.`,
    `3. CSS shape: the INNER content of @scope ([data-wisp-variant="N"]) { ... }. Use ":scope > <descendant-selector>" to reach descendants of the picked element. All declarations use !important to override Tailwind/utility classes.`,
    `4. For motion variants: include @media (prefers-reduced-motion: reduce) { :scope, :scope * { animation: none !important; transition: none !important; } } at the END of that variant's css.`,
    `5. Anti-slop HARD bans (NEVER use): purple-blue gradient (from-purple-*/to-blue-*), glassmorphism (backdrop-blur), gradient-text-headline (background-clip:text on h1/h2/h3), hero-metric template (98%/3.2x/24/7 at >24px), default-tailwind-blue without justification, em-dash UI noise.`,
    `6. Rationale: ONE sentence \u2264180 chars, axis-attributed (e.g. "Looser density + larger touch targets \u2014 primary action gains weight from the surrounding breathing room.").`,
    ``,
    `OUTPUT EXACT JSON SHAPE:`,
    `{"variants":[`,
    `  {"css":"/* baseline */","rationale":"Baseline \u2014 original."},`,
    `  {"css":":scope > article { padding: 2em !important; gap: 1em !important; }","rationale":"Generous density \u2014 gives content room to breathe."},`,
    `  ...`,
    `]}`
  ].join("\n");
}
var SYSTEM_PROMPT = "You are wisp-design's variant generator. You design CSS variants for a live frontend design overlay. You respond with ONLY raw JSON matching the user-provided schema. No preamble, no explanation, no markdown fences. Follow the anti-slop rules in every variant. Be concise.";
var VARIANTS_JSON_SCHEMA = JSON.stringify({
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
          rationale: { type: "string" }
        },
        required: ["css", "rationale"]
      }
    }
  },
  required: ["variants"]
});
function extractJsonObject(text) {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;
  const fenceMatch = /```(?:json)?\s*\n([\s\S]*?)\n```/i.exec(trimmed);
  if (fenceMatch !== null && fenceMatch[1] !== void 0) {
    const inner = fenceMatch[1].trim();
    if (inner.startsWith("{") && inner.endsWith("}")) return inner;
  }
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const candidate = trimmed.slice(firstBrace, lastBrace + 1);
    return candidate;
  }
  return null;
}
async function detectClaudeBin(claudeBin = "claude") {
  try {
    const { stdout } = await execFileP(claudeBin, ["--version"], {
      timeout: 5e3
    });
    const m = /(\d+\.\d+\.\d+)/.exec(stdout);
    return { ok: true, version: m?.[1] ?? stdout.trim() };
  } catch (err) {
    const e = err;
    if (e.code === "ENOENT") return { ok: false, reason: "not-in-PATH" };
    return { ok: false, reason: err.message };
  }
}
export {
  buildVariantPrompt,
  detectClaudeBin,
  extractJsonObject,
  invokeClaudeForVariants,
  parseClaudeEnvelope
};
//# sourceMappingURL=claude-invoke.js.map