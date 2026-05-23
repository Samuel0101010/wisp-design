// wisp-design — Policy-proposal module + `wisp-design policy` CLI (Phase 6).
//
// Improvement #5: after N consecutive accepts of the same primaryAxis, surface
// a proposal that, if accepted, writes to `.wisp/policy.md`. Declined axes are
// excluded from re-proposal in the same session.
//
// Surface:
//   wisp-design policy --propose                # scan recent decisions
//   wisp-design policy --apply <axis>=<value>   # manual override
//   wisp-design policy --show                   # print current policy.md
//
// Exit codes: 0 ok / 1 not-found / 2 bad-flag / 3 IO error.

import { promises as fs } from "node:fs";
import { dirname, join, resolve } from "node:path";

import {
  POLICY_DOCUMENT_RELATIVE_PATH,
  POLICY_PROPOSAL_DEFAULT_THRESHOLD,
  PolicyAxisSchema,
  type PolicyAxis,
  type PolicyProposal,
  type PolicyProposalAnalyzeOptions,
  type PolicyProposalApplyResult,
  type PolicyProposalModule,
  type SessionEventEntry,
} from "../contracts/session.js";
import { findMostRecentSessionId, readSessionEntries } from "../session/replay.js";
import {
  EXIT_ARG,
  EXIT_OK,
  flagAsBoolean,
  flagAsString,
  parseFlags,
  writeError,
  writeJsonResult,
} from "./_helpers.js";

const EXIT_NOT_FOUND = 1;
const EXIT_IO = 3;

// ---------------------------------------------------------------------------
// analyzeRecentDecisions — pure detector.
//
// Algorithm:
//   1. Build a variantId → primaryAxis lookup from `variants-emitted` entries.
//   2. Collect declined axes (from `policy-proposal-declined`) — those are
//      excluded from re-proposal in the same session.
//   3. Walk accepts in CHRONOLOGICAL order; maintain a per-axis consecutive
//      counter. Any accept on a different axis resets the counter for ALL
//      other axes (matches contract invariant 3).
//   4. First axis whose counter hits `triggerThreshold` wins; emit a
//      PolicyProposal carrying the last N accepts as evidence.
//
// Returns null when no axis triggers. NEVER mutates input.
// ---------------------------------------------------------------------------

function buildAxisLookup(entries: SessionEventEntry[]): Map<string, string> {
  const lookup = new Map<string, string>();
  for (const entry of entries) {
    if (entry.kind !== "variants-emitted") continue;
    const variants = entry.detail?.["variants"];
    if (!Array.isArray(variants)) continue;
    for (const v of variants) {
      if (typeof v !== "object" || v === null) continue;
      const candidate = v as Record<string, unknown>;
      const id = candidate["id"];
      const axis = candidate["primaryAxis"];
      if (typeof id === "string" && typeof axis === "string" && !lookup.has(id)) {
        lookup.set(id, axis);
      }
    }
  }
  return lookup;
}

function collectDeclinedAxes(entries: SessionEventEntry[]): Set<string> {
  const declined = new Set<string>();
  for (const entry of entries) {
    if (entry.kind !== "policy-proposal-declined") continue;
    const axis = entry.detail?.["axis"];
    if (typeof axis === "string") declined.add(axis);
  }
  return declined;
}

interface AcceptWithAxis {
  ts: string;
  variantId: string;
  axis: string;
}

function collectAcceptsWithAxis(
  entries: SessionEventEntry[],
  axisLookup: Map<string, string>,
): AcceptWithAxis[] {
  const out: AcceptWithAxis[] = [];
  for (const entry of entries) {
    if (entry.kind !== "accept-variant") continue;
    const variantId = entry.detail?.["variantId"];
    if (typeof variantId !== "string") continue;
    const axis = axisLookup.get(variantId);
    if (axis === undefined) continue;
    out.push({ ts: entry.ts, variantId, axis });
  }
  return out;
}

function isPolicyAxis(value: string): value is PolicyAxis {
  return PolicyAxisSchema.safeParse(value).success;
}

function observationFor(axis: string, count: number): string {
  return `${count} high-${axis} variants accepted in a row`;
}

function proposedFor(axis: PolicyAxis): string {
  // Conservative defaults — the user can edit the policy.md after accept.
  // These are starting suggestions only.
  const defaults: Record<PolicyAxis, string> = {
    density: "generous",
    hierarchy: "bold-primary",
    typography: "calmer",
    color: "muted-accent",
    layout: "editorial-column",
  };
  return `set ${axis}: '${defaults[axis]}' in .wisp/policy.md`;
}

function analyzeRecentDecisions(
  entries: SessionEventEntry[],
  opts?: PolicyProposalAnalyzeOptions,
): PolicyProposal | null {
  const threshold = opts?.triggerThreshold ?? POLICY_PROPOSAL_DEFAULT_THRESHOLD;
  if (threshold < 2) return null;

  const axisLookup = buildAxisLookup(entries);
  const declined = collectDeclinedAxes(entries);
  const accepts = collectAcceptsWithAxis(entries, axisLookup);
  if (accepts.length < threshold) return null;

  // Per-axis consecutive counter. Reset all-but-current when a new axis
  // surfaces (invariant 3 in contracts/session.ts).
  const counters = new Map<string, AcceptWithAxis[]>();
  let triggeredAxis: PolicyAxis | null = null;
  let evidence: AcceptWithAxis[] = [];

  for (const accept of accepts) {
    const { axis } = accept;
    // Reset counters for all OTHER axes; current one accumulates.
    for (const key of [...counters.keys()]) {
      if (key !== axis) counters.delete(key);
    }
    const bucket = counters.get(axis) ?? [];
    bucket.push(accept);
    counters.set(axis, bucket);
    if (bucket.length >= threshold && isPolicyAxis(axis) && !declined.has(axis)) {
      triggeredAxis = axis;
      evidence = bucket.slice(-threshold);
      break;
    }
  }

  if (triggeredAxis === null) return null;

  return {
    axis: triggeredAxis,
    observation: observationFor(triggeredAxis, evidence.length),
    proposed: proposedFor(triggeredAxis),
    evidence: evidence.map((e) => ({
      ts: e.ts,
      variantId: e.variantId,
      primaryAxis: triggeredAxis as PolicyAxis,
    })),
    triggerThreshold: threshold,
  };
}

// ---------------------------------------------------------------------------
// applyProposal — merge into `.wisp/policy.md`. Frontmatter is the
// machine-readable source of truth; body below it is human prose.
//
// Algorithm:
//   1. Read existing file (or seed an empty document).
//   2. Parse frontmatter (`--- … ---`) into a {axes, acceptedAt, source} map.
//      Hand-rolled, just enough for our schema — no full YAML.
//   3. Merge proposal.axis into the map. Update acceptedAt + source.
//   4. Write frontmatter + body back.
// ---------------------------------------------------------------------------

const POLICY_BODY_HEADER = `## How this project tends

Auto-generated tendencies appear above in the frontmatter. The free-form prose
below survives \`applyProposal\` rewrites — use it to capture rationale or
exceptions.
`;

interface ParsedPolicy {
  acceptedAt: string;
  source: "user-confirmed" | "wisp-proposed-then-confirmed";
  axes: Map<string, string>;
  body: string;
}

function emptyPolicy(): ParsedPolicy {
  return {
    acceptedAt: new Date(0).toISOString(),
    source: "user-confirmed",
    axes: new Map<string, string>(),
    body: POLICY_BODY_HEADER,
  };
}

function parsePolicyMarkdown(content: string): ParsedPolicy {
  if (content === "") return emptyPolicy();
  const trimmedStart = content.replace(/^﻿/, ""); // strip BOM
  if (!trimmedStart.startsWith("---\n") && !trimmedStart.startsWith("---\r\n")) {
    return { ...emptyPolicy(), body: trimmedStart };
  }
  // Find the closing `---` line.
  const lines = trimmedStart.split(/\r?\n/);
  // lines[0] === "---". Find next "---".
  let endIdx = -1;
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i] === "---") {
      endIdx = i;
      break;
    }
  }
  if (endIdx === -1) {
    // Malformed frontmatter; treat whole content as body.
    return { ...emptyPolicy(), body: trimmedStart };
  }
  const fm = lines.slice(1, endIdx);
  const body = lines.slice(endIdx + 1).join("\n");

  const parsed = emptyPolicy();
  parsed.body = body.length > 0 ? body : POLICY_BODY_HEADER;

  // Minimal YAML — supports:
  //   acceptedAt: <iso>
  //   source: <string>
  //   axes:
  //     <axis>: <value>
  //     ...
  let inAxes = false;
  for (const rawLine of fm) {
    const line = rawLine.replace(/\s+$/, "");
    if (line === "") continue;
    if (line.startsWith("axes:")) {
      inAxes = true;
      continue;
    }
    if (inAxes && /^\s+/.test(line)) {
      const m = /^\s+([a-z][a-z0-9-]*)\s*:\s*(.+)$/i.exec(line);
      if (m !== null) {
        const key = m[1] as string;
        let value = (m[2] as string).trim();
        // Strip surrounding quotes.
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        parsed.axes.set(key, value);
      }
      continue;
    }
    inAxes = false;
    const kvMatch = /^([a-z][a-z0-9-]*)\s*:\s*(.+)$/i.exec(line);
    if (kvMatch === null) continue;
    const key = kvMatch[1] as string;
    let value = (kvMatch[2] as string).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key === "acceptedAt") parsed.acceptedAt = value;
    else if (key === "source" && (value === "user-confirmed" || value === "wisp-proposed-then-confirmed")) {
      parsed.source = value;
    }
  }
  return parsed;
}

function renderPolicyMarkdown(p: ParsedPolicy): string {
  const lines: string[] = [];
  lines.push("---");
  lines.push(`acceptedAt: ${p.acceptedAt}`);
  lines.push(`source: ${p.source}`);
  lines.push("axes:");
  const sortedAxes = [...p.axes.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  for (const [k, v] of sortedAxes) {
    lines.push(`  ${k}: ${v}`);
  }
  lines.push("---");
  lines.push("");
  // Body — keep existing body verbatim. If empty/whitespace, drop in the
  // default header so the file is human-readable from day one.
  const body = p.body.trim() === "" ? POLICY_BODY_HEADER : p.body;
  lines.push(body);
  // Ensure trailing newline.
  let out = lines.join("\n");
  if (!out.endsWith("\n")) out += "\n";
  return out;
}

async function readPolicyFile(projectRoot: string): Promise<string> {
  const path = join(resolve(projectRoot), POLICY_DOCUMENT_RELATIVE_PATH);
  try {
    return await fs.readFile(path, "utf8");
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return "";
    throw err;
  }
}

async function writePolicyFile(
  projectRoot: string,
  content: string,
): Promise<string> {
  const path = join(resolve(projectRoot), POLICY_DOCUMENT_RELATIVE_PATH);
  await fs.mkdir(dirname(path), { recursive: true });
  await fs.writeFile(path, content, "utf8");
  return path;
}

async function applyProposal(
  proposal: PolicyProposal,
  opts: { projectRoot: string },
): Promise<PolicyProposalApplyResult> {
  const existing = await readPolicyFile(opts.projectRoot);
  const parsed = parsePolicyMarkdown(existing);
  parsed.axes.set(proposal.axis, extractValueFromProposed(proposal.proposed) ?? proposal.proposed);
  parsed.acceptedAt = new Date().toISOString();
  parsed.source = "wisp-proposed-then-confirmed";
  const rendered = renderPolicyMarkdown(parsed);
  const path = await writePolicyFile(opts.projectRoot, rendered);
  return { written: true, policyPath: path };
}

// `proposedFor` formats `set <axis>: '<value>' in .wisp/policy.md`. Extract
// the quoted value back out so the policy axis map stores just the bare value.
function extractValueFromProposed(proposed: string): string | null {
  const m = /['"]([^'"]+)['"]/.exec(proposed);
  return m === null ? null : (m[1] as string);
}

// ---------------------------------------------------------------------------
// Module export
// ---------------------------------------------------------------------------

export const policyProposal: PolicyProposalModule = {
  analyzeRecentDecisions,
  applyProposal,
};

// ---------------------------------------------------------------------------
// CLI entry — runPolicy.
// ---------------------------------------------------------------------------

export async function runPolicy(args: string[]): Promise<number> {
  const parsed = parseFlags(args);
  const propose = flagAsBoolean(parsed, "propose", false);
  const show = flagAsBoolean(parsed, "show", false);
  const apply = flagAsString(parsed, "apply");
  const taskId = flagAsString(parsed, "task");
  const thresholdRaw = flagAsString(parsed, "threshold");

  const modes = [propose, show, apply !== undefined].filter(Boolean).length;
  if (modes === 0) {
    writeError({
      code: "BAD_FLAG",
      message:
        "policy: need one of --propose, --apply <axis>=<value>, or --show",
    });
    return EXIT_ARG;
  }
  if (modes > 1) {
    writeError({
      code: "BAD_FLAG",
      message: "policy: --propose, --apply, and --show are mutually exclusive",
    });
    return EXIT_ARG;
  }

  const projectRoot = process.cwd();

  // --show: print the current policy.md.
  if (show) {
    try {
      const content = await readPolicyFile(projectRoot);
      if (content === "") {
        process.stdout.write(
          `No policy file at ${POLICY_DOCUMENT_RELATIVE_PATH}. Run \`wisp-design policy --propose\` to surface a starter.\n`,
        );
        return EXIT_OK;
      }
      process.stdout.write(content.endsWith("\n") ? content : content + "\n");
      return EXIT_OK;
    } catch (err) {
      writeError({ code: "POLICY_READ_FAILED", message: (err as Error).message });
      return EXIT_IO;
    }
  }

  // --apply <axis>=<value>: manual override.
  if (apply !== undefined) {
    const m = /^([a-z][a-z0-9-]*)=(.+)$/i.exec(apply);
    if (m === null) {
      writeError({
        code: "BAD_FLAG",
        message: `policy: --apply expects <axis>=<value>, got "${apply}"`,
      });
      return EXIT_ARG;
    }
    const axis = m[1] as string;
    const value = m[2] as string;
    if (!isPolicyAxis(axis)) {
      writeError({
        code: "BAD_FLAG",
        message: `policy: unknown axis "${axis}". Allowed: hierarchy, layout, typography, color, density.`,
      });
      return EXIT_ARG;
    }
    try {
      const existing = await readPolicyFile(projectRoot);
      const parsed = parsePolicyMarkdown(existing);
      parsed.axes.set(axis, value);
      parsed.acceptedAt = new Date().toISOString();
      parsed.source = "user-confirmed";
      const rendered = renderPolicyMarkdown(parsed);
      const path = await writePolicyFile(projectRoot, rendered);
      writeJsonResult({ written: true, policyPath: path, axis, value });
      return EXIT_OK;
    } catch (err) {
      writeError({ code: "POLICY_WRITE_FAILED", message: (err as Error).message });
      return EXIT_IO;
    }
  }

  // --propose: scan recent decisions.
  let threshold = POLICY_PROPOSAL_DEFAULT_THRESHOLD;
  if (thresholdRaw !== undefined) {
    const n = Number(thresholdRaw);
    if (!Number.isFinite(n) || n < 2 || !Number.isInteger(n)) {
      writeError({
        code: "BAD_FLAG",
        message: `policy: --threshold must be an integer >= 2, got "${thresholdRaw}"`,
      });
      return EXIT_ARG;
    }
    threshold = n;
  }

  let sessionId: string | null;
  if (taskId !== undefined && taskId !== "") {
    sessionId = taskId;
  } else {
    try {
      sessionId = await findMostRecentSessionId(projectRoot);
    } catch (err) {
      writeError({ code: "POLICY_READ_FAILED", message: (err as Error).message });
      return EXIT_IO;
    }
  }
  if (sessionId === null) {
    writeJsonResult({ proposal: null, reason: "no sessions found" });
    return EXIT_OK;
  }

  let entries: SessionEventEntry[];
  try {
    entries = await readSessionEntries(projectRoot, sessionId);
  } catch (err) {
    writeError({ code: "POLICY_READ_FAILED", message: (err as Error).message });
    return EXIT_IO;
  }
  const proposal = analyzeRecentDecisions(entries, { triggerThreshold: threshold });
  if (proposal === null) {
    writeJsonResult({ proposal: null });
    return EXIT_OK;
  }
  writeJsonResult({ proposal });
  return EXIT_OK;
}

// Keep an unused symbol referenced so tsc doesn't trim it on strict-unused.
void EXIT_NOT_FOUND;
