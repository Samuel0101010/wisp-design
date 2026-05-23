#!/usr/bin/env node

// src/agent/policy.ts
import { promises as fs2 } from "fs";
import { dirname as dirname2, join as join2, resolve as resolve3 } from "path";

// src/contracts/session.ts
import { z as z2 } from "zod";

// src/contracts/source.ts
import { z } from "zod";
var SourceFileTypeSchema = z.enum([
  "tsx",
  "jsx",
  "html",
  "vue",
  "svelte",
  "css"
]);
var MarkerKindSchema = z.enum([
  "inject-start",
  "inject-end",
  "variants-start",
  "variants-end",
  "style-start",
  "style-end"
]);
var MarkerGroupSchema = z.enum(["inject", "variants", "style"]);
var InjectMarkerSchema = z.object({
  injectId: z.string().min(1),
  // ULID or UUID
  insertedAt: z.string(),
  // ISO timestamp
  bridgeUrl: z.string().url(),
  token: z.string().uuid(),
  // SHA256 hex of the original first 256 bytes of the file (before inject).
  // `removeLiveScript` recomputes the hash AFTER stripping the inject and
  // refuses if it doesn't match — protects against partial edits.
  beforeHash: z.string().regex(/^[0-9a-f]{64}$/i),
  scriptSrc: z.string().url().optional(),
  inline: z.boolean().default(false)
});
var VariantBlockMarkerSchema = z.object({
  sessionId: z.string().min(1),
  targetId: z.string().min(1),
  wrappedAt: z.string(),
  // ISO
  variantCount: z.number().int().min(1).max(8),
  originalLines: z.string()
  // base64 of the wrapped original snippet
});
var StyleBlockMarkerSchema = z.object({
  sessionId: z.string().min(1),
  targetId: z.string().min(1),
  // `@scope` selector base (without the `[data-wisp-variant="N"]` index).
  // Lets carbonize rewrite scope rules into permanent selectors targeting
  // the accepted variant's host.
  scopeBase: z.string().min(1)
});
var MarkerBlockSchema = z.object({
  startLine: z.number().int().min(0),
  endLine: z.number().int().min(0),
  startOffset: z.number().int().min(0),
  endOffset: z.number().int().min(0),
  group: MarkerGroupSchema,
  // Parsed `k=v` pairs from the OPEN marker. Decoded via `decodeURIComponent`.
  payload: z.record(z.string(), z.string())
});
var InjectOptionsSchema = z.object({
  bridgeUrl: z.string().url(),
  token: z.string().uuid(),
  // If true, the marker payload sets `inline=true` and the injected element
  // is `<script>…inline body…</script>`; otherwise it's
  // `<script src="${bridgeUrl}/live.js?token=${token}">`. Inline form is used
  // by tests; production always uses the src form.
  inline: z.boolean().default(false),
  // Where to splice the script tag. JSX/TSX: just inside `<head>` if present,
  // else at top of the file's first top-level JSX expression. HTML/Vue/Svelte:
  // before `</head>`. CSS: rejected by safetyCheck — CSS cannot host a script.
  preferredAnchor: z.enum(["before-head-close", "after-head-open", "auto"]).default("auto"),
  // Optional caller-supplied injectId; useful for tests that need determinism.
  injectId: z.string().min(1).optional()
});
var AcceptOperationSchema = z.object({
  filePath: z.string().min(1),
  sessionId: z.string().min(1),
  targetId: z.string().min(1),
  variantId: z.string().min(1),
  // The full variant CSS (the `@scope ([data-wisp-variant="N"]) { … }` body).
  // The agent supplies this; the engine does not re-fetch it.
  variantCss: z.string(),
  // CSS-var overrides accumulated from slider tuning. Keys must match the
  // `--name` form; values are baked literal into the carbonized output.
  paramOverrides: z.record(z.string(), z.string()).default({}),
  // If false: leave the `@scope` rule verbatim (debugging mode). Default true:
  // rewrite the rule into permanent selectors targeting the chosen variant's
  // host node.
  carbonize: z.boolean().default(true),
  // Optional override of the auto-detected EOL convention. Default = detect.
  eolConvention: z.enum(["\n", "\r\n", "\r"]).optional()
});
var DiscardOperationSchema = z.object({
  filePath: z.string().min(1),
  sessionId: z.string().min(1),
  targetId: z.string().min(1)
});
var SafetyErrorCodeSchema = z.enum([
  "PATH_OUTSIDE_ROOT",
  "REFUSE_LIST_MATCH",
  // dist/, .next/, node_modules/, etc.
  "GENERATED_MAGIC_COMMENT",
  // `@generated` in first 200 bytes
  "BINARY_FILE",
  // not utf-8 decodable
  "FILE_TOO_LARGE",
  // > MAX_SOURCE_FILE_BYTES
  "UNSUPPORTED_FILE_TYPE",
  // extension not in SUPPORTED_EXTENSIONS
  "READ_ONLY_FILE",
  // fs.access W_OK rejected
  "SYMLINK_ESCAPE"
  // realpath resolves outside projectRoot
]);
var UndoEntryKindSchema = z.enum([
  "inject-script",
  "remove-script",
  "wrap-variants",
  "discard-variants",
  "accept-variant",
  "param-change",
  "safety-refused"
]);
var UndoEntrySchema = z.object({
  ts: z.string(),
  // ISO timestamp
  sessionId: z.string().min(1),
  kind: UndoEntryKindSchema,
  filePath: z.string().min(1),
  detail: z.record(z.string(), z.unknown()).optional(),
  // Hex SHA256 of the file before / after the operation. `safety-refused`
  // entries omit both. `param-change` omits `afterHash` (the param change is
  // a runtime DOM update; no file mutation has happened yet).
  beforeSha256: z.string().regex(/^[0-9a-f]{64}$/i).optional(),
  afterSha256: z.string().regex(/^[0-9a-f]{64}$/i).optional()
});

// src/contracts/session.ts
var SessionEventKindSchema = z2.enum([
  // Inherit Phase-3 file-op kinds verbatim.
  ...UndoEntryKindSchema.options,
  // Phase-6 session-level kinds.
  "session-start",
  "session-end",
  "pick",
  "configure",
  "variants-emitted",
  "cycle-active-changed",
  "param-changed",
  "annotation-added",
  "verify-report",
  "policy-proposal-shown",
  "policy-proposal-accepted",
  "policy-proposal-declined",
  "morph-engaged",
  "structure-variant-emitted",
  "component-lib-detected"
]);
var SessionEventEntrySchema = z2.object({
  ts: z2.string(),
  // ISO timestamp
  sessionId: z2.string().min(1),
  kind: SessionEventKindSchema,
  filePath: z2.string().optional(),
  detail: z2.record(z2.string(), z2.unknown()).optional(),
  beforeSha256: z2.string().regex(/^[0-9a-f]{64}$/i).optional(),
  afterSha256: z2.string().regex(/^[0-9a-f]{64}$/i).optional()
});
var PolicyAxisSchema = z2.enum([
  "hierarchy",
  "layout",
  "typography",
  "color",
  "density"
]);
var PolicyProposalSchema = z2.object({
  axis: PolicyAxisSchema,
  observation: z2.string().min(1),
  // human-readable: "3 high-density variants accepted in a row"
  proposed: z2.string().min(1),
  // proposed change: "add density: 'generous' to .wisp/policy.md"
  evidence: z2.array(
    z2.object({
      ts: z2.string(),
      variantId: z2.string().min(1),
      primaryAxis: PolicyAxisSchema
    })
  ),
  triggerThreshold: z2.number().int().min(2).default(3)
});
var PolicyDocumentSchema = z2.object({
  axes: z2.record(PolicyAxisSchema, z2.string().min(1)).default({}),
  acceptedAt: z2.string(),
  source: z2.enum(["user-confirmed", "wisp-proposed-then-confirmed"])
});
var POLICY_PROPOSAL_DEFAULT_THRESHOLD = 3;
var POLICY_DOCUMENT_RELATIVE_PATH = ".wisp/policy.md";
var MORPH_T_MIN = 0;
var MORPH_T_MAX = 1;
var MorphVariableDiffSchema = z2.object({
  name: z2.string().regex(/^--[a-z][a-z0-9-]*$/i, "must be a CSS custom property"),
  valueA: z2.string(),
  valueB: z2.string(),
  interpolatable: z2.boolean(),
  unit: z2.string().optional()
});
var MorphSourceSchema = z2.object({
  variantIdA: z2.string().min(1),
  variantIdB: z2.string().min(1),
  // Auto-extracted diff of CSS-vars between A and B.
  variableDiff: z2.array(MorphVariableDiffSchema)
});
var MorphConfigSchema = z2.object({
  source: MorphSourceSchema,
  t: z2.number().min(MORPH_T_MIN).max(MORPH_T_MAX),
  interpolatedCss: z2.string()
});
var StructureVariantKindSchema = z2.enum([
  "as-is",
  // baseline = original JSX (always present so the user can revert without re-pick)
  "two-col-split",
  // 2-column layout
  "card-layout",
  // wrap children in card components
  "stacked-vertical",
  // simple vertical stack
  "horizontal-row",
  // row layout
  "hero-style",
  // hero treatment (large primary)
  "sidebar-left",
  "sidebar-right"
]);
var STRUCTURE_VARIANT_RATIONALE_MAX_LEN = 180;
var StructureVariantSpecSchema = z2.object({
  kind: StructureVariantKindSchema,
  rationale: z2.string().min(1).max(STRUCTURE_VARIANT_RATIONALE_MAX_LEN),
  // Full JSX subtree as a STRING — agent-emitted. Lives in a markdown-fenced
  // block during transport; the source-edit layer parses it as the raw
  // replacement payload.
  jsx: z2.string().min(1),
  // CSS to inject alongside (optional — purely structural variants may have
  // no CSS; tied to the JSX via the structure-variant-emitted log entry).
  css: z2.string().default("")
});

// src/session/replay.ts
import { promises as fs } from "fs";
import { dirname, join, resolve } from "path";
var SESSIONS_DIR = join(".wisp", "sessions");
function sessionsDir(projectRoot) {
  return join(resolve(projectRoot), SESSIONS_DIR);
}
function sessionLogPath(projectRoot, sessionId2) {
  return join(sessionsDir(projectRoot), `${sessionId2}.jsonl`);
}
async function readEntries(path) {
  let raw;
  try {
    raw = await fs.readFile(path, "utf8");
  } catch (err) {
    const code = err.code;
    if (code === "ENOENT" || code === "ENOTDIR") return [];
    throw err;
  }
  const out = [];
  const lines = raw.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line === void 0 || line === "") continue;
    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      process.stderr.write(
        `[wisp-design] session-replay: skipping malformed JSON on line ${i + 1} of ${path}
`
      );
      continue;
    }
    const parsed = SessionEventEntrySchema.safeParse(obj);
    if (!parsed.success) {
      process.stderr.write(
        `[wisp-design] session-replay: skipping schema-invalid entry on line ${i + 1} of ${path}
`
      );
      continue;
    }
    out.push(parsed.data);
  }
  return out;
}
async function listSessions(opts) {
  const dir = sessionsDir(opts.projectRoot);
  let dirents;
  try {
    dirents = await fs.readdir(dir, { withFileTypes: true });
  } catch (err) {
    const code = err.code;
    if (code === "ENOENT" || code === "ENOTDIR") return [];
    throw err;
  }
  const out = [];
  for (const entry of dirents) {
    if (!entry.isFile()) continue;
    const name = entry.name;
    if (!name.endsWith(".jsonl")) continue;
    const sessionId2 = name.slice(0, -".jsonl".length);
    if (sessionId2 === "") continue;
    const abs = join(dir, name);
    let mtimeMs = 0;
    try {
      const st = await fs.stat(abs);
      mtimeMs = st.mtimeMs;
    } catch {
      continue;
    }
    const entries = await readEntries(abs);
    if (entries.length === 0) continue;
    const first = entries[0];
    const last = entries[entries.length - 1];
    if (first === void 0) continue;
    const summary = {
      sessionId: sessionId2,
      startedAt: first.kind === "session-start" ? first.ts : first.ts,
      entriesCount: entries.length,
      mtimeMs
    };
    if (last !== void 0 && last.kind === "session-end") {
      summary.endedAt = last.ts;
    }
    out.push(summary);
  }
  out.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return out.map(({ sessionId: sessionId2, startedAt, endedAt, entriesCount }) => ({
    sessionId: sessionId2,
    startedAt,
    ...endedAt !== void 0 ? { endedAt } : {},
    entriesCount
  }));
}
async function findMostRecentSessionId(projectRoot) {
  const sessions = await listSessions({ projectRoot });
  if (sessions.length === 0) return null;
  return sessions[0]?.sessionId ?? null;
}
async function readSessionEntries(projectRoot, sessionId2) {
  return readEntries(sessionLogPath(projectRoot, sessionId2));
}

// src/agent/_helpers.ts
import { readFile } from "fs/promises";
import { resolve as resolve2 } from "path";

// src/contracts/bridge.ts
import { z as z3 } from "zod";
var PortLockSchema = z3.object({
  port: z3.number().int().min(31337).max(31400),
  token: z3.string().uuid(),
  pid: z3.number().int().positive(),
  startedAt: z3.string().datetime(),
  projectRoot: z3.string().min(1)
});
var ElementRectSchema = z3.object({
  x: z3.number(),
  y: z3.number(),
  w: z3.number().nonnegative(),
  h: z3.number().nonnegative()
});
var ElementTargetSchema = z3.object({
  selector: z3.string().min(1),
  rect: ElementRectSchema,
  tag: z3.string().min(1)
});
var sessionId = z3.string().min(1);
var AnnotationKindSchema = z3.enum([
  "padding",
  "color",
  "size",
  "content",
  "other"
]);
var StructuredAnnotationSchema = z3.object({
  kind: AnnotationKindSchema,
  note: z3.string().min(1).max(2e3)
});
var VariantSchema = z3.object({
  id: z3.string().min(1),
  css: z3.string(),
  rationale: z3.string().min(1).max(280)
});
var PickEventSchema = z3.object({
  kind: z3.literal("pick"),
  target: ElementTargetSchema,
  sessionId
});
var ConfigureEventSchema = z3.object({
  kind: z3.literal("configure"),
  target: ElementTargetSchema,
  freeText: z3.string().min(1).max(4e3),
  sessionId
});
var GeneratingEventSchema = z3.object({
  kind: z3.literal("generating"),
  target: ElementTargetSchema,
  freeText: z3.string().min(1).max(4e3),
  variantCount: z3.number().int().min(1).max(8),
  sessionId
});
var CyclingEventSchema = z3.object({
  kind: z3.literal("cycling"),
  target: ElementTargetSchema,
  variants: z3.array(VariantSchema).min(1).max(8),
  activeIndex: z3.number().int().nonnegative(),
  sessionId
});
var ParameterChangeEventSchema = z3.object({
  kind: z3.literal("parameter-change"),
  target: ElementTargetSchema,
  varName: z3.string().min(1),
  value: z3.string(),
  sessionId
});
var AcceptEventSchema = z3.object({
  kind: z3.literal("accept"),
  target: ElementTargetSchema,
  variantId: z3.string().min(1),
  sessionId
});
var DiscardEventSchema = z3.object({
  kind: z3.literal("discard"),
  target: ElementTargetSchema,
  sessionId
});
var AnnotationEventSchema = z3.object({
  kind: z3.literal("annotation"),
  target: ElementTargetSchema,
  annotation: StructuredAnnotationSchema,
  sessionId
});
var ErrorEventSchema = z3.object({
  kind: z3.literal("error"),
  message: z3.string().min(1),
  code: z3.string().optional(),
  sessionId: sessionId.optional()
});
var HeartbeatEventSchema = z3.object({
  kind: z3.literal("heartbeat"),
  at: z3.string().datetime()
});
var BridgeEventSchema = z3.discriminatedUnion("kind", [
  PickEventSchema,
  ConfigureEventSchema,
  GeneratingEventSchema,
  CyclingEventSchema,
  ParameterChangeEventSchema,
  AcceptEventSchema,
  DiscardEventSchema,
  AnnotationEventSchema,
  ErrorEventSchema,
  HeartbeatEventSchema
]);
var LONG_POLL_CAP_MS = 27e4;
var LONG_POLL_MIN_TIMEOUT_MS = 1e3;
var LongPollRequestSchema = z3.object({
  token: z3.string().uuid(),
  timeout: z3.number().int().min(LONG_POLL_MIN_TIMEOUT_MS).optional(),
  leaseMs: z3.number().int().min(1e3).optional(),
  cursor: z3.string().optional()
}).refine(
  (v) => v.timeout === void 0 || v.timeout <= LONG_POLL_CAP_MS,
  {
    message: `timeout must be <= ${LONG_POLL_CAP_MS}ms (Node fetch header cap is 300_000ms)`,
    path: ["timeout"]
  }
);
var LongPollResponseSchema = z3.object({
  events: z3.array(BridgeEventSchema),
  cursor: z3.string(),
  // Server-wall-clock at which it sliced the response. Lets the agent measure
  // drift against its own local clock when budgeting the next slice.
  slicedAt: z3.number().int().nonnegative()
});
var BridgeHttpErrorSchema = z3.object({
  error: z3.object({
    code: z3.string().min(1),
    message: z3.string().min(1),
    detail: z3.unknown().optional()
  })
});
var BridgeStatusSchema = z3.object({
  port: z3.number().int().positive(),
  startedAt: z3.string().datetime(),
  uptimeMs: z3.number().int().nonnegative(),
  sessionId: z3.string().min(1),
  pendingEvents: z3.number().int().nonnegative(),
  connectedSseClients: z3.number().int().nonnegative(),
  projectRoot: z3.string().min(1)
});
var BridgeHealthSchema = z3.object({
  ok: z3.literal(true),
  version: z3.string().min(1)
});

// src/agent/_helpers.ts
function parseFlags(args) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < args.length; i += 1) {
    const token = args[i];
    if (!token.startsWith("--")) {
      positional.push(token);
      continue;
    }
    const key = token.slice(2);
    if (key.startsWith("no-")) {
      flags[key.slice(3)] = false;
      continue;
    }
    const next = args[i + 1];
    if (next === void 0 || next.startsWith("--")) {
      flags[key] = true;
      continue;
    }
    flags[key] = next;
    i += 1;
  }
  return { flags, positional };
}
function flagAsString(parsed, key) {
  const v = parsed.flags[key];
  if (typeof v === "string") return v;
  return void 0;
}
function flagAsBoolean(parsed, key, defaultValue) {
  const v = parsed.flags[key];
  if (typeof v === "boolean") return v;
  return defaultValue;
}
function writeJsonResult(obj) {
  process.stdout.write(`${JSON.stringify(obj, null, 2)}
`);
}
function writeError(err) {
  process.stderr.write(`${JSON.stringify({ error: err })}
`);
}
var EXIT_OK = 0;
var EXIT_ARG = 2;

// src/agent/policy.ts
var EXIT_IO = 3;
function buildAxisLookup(entries) {
  const lookup = /* @__PURE__ */ new Map();
  for (const entry of entries) {
    if (entry.kind !== "variants-emitted") continue;
    const variants = entry.detail?.["variants"];
    if (!Array.isArray(variants)) continue;
    for (const v of variants) {
      if (typeof v !== "object" || v === null) continue;
      const candidate = v;
      const id = candidate["id"];
      const axis = candidate["primaryAxis"];
      if (typeof id === "string" && typeof axis === "string" && !lookup.has(id)) {
        lookup.set(id, axis);
      }
    }
  }
  return lookup;
}
function collectDeclinedAxes(entries) {
  const declined = /* @__PURE__ */ new Set();
  for (const entry of entries) {
    if (entry.kind !== "policy-proposal-declined") continue;
    const axis = entry.detail?.["axis"];
    if (typeof axis === "string") declined.add(axis);
  }
  return declined;
}
function collectAcceptsWithAxis(entries, axisLookup) {
  const out = [];
  for (const entry of entries) {
    if (entry.kind !== "accept-variant") continue;
    const variantId = entry.detail?.["variantId"];
    if (typeof variantId !== "string") continue;
    const axis = axisLookup.get(variantId);
    if (axis === void 0) continue;
    out.push({ ts: entry.ts, variantId, axis });
  }
  return out;
}
function isPolicyAxis(value) {
  return PolicyAxisSchema.safeParse(value).success;
}
function observationFor(axis, count) {
  return `${count} high-${axis} variants accepted in a row`;
}
function proposedFor(axis) {
  const defaults = {
    density: "generous",
    hierarchy: "bold-primary",
    typography: "calmer",
    color: "muted-accent",
    layout: "editorial-column"
  };
  return `set ${axis}: '${defaults[axis]}' in .wisp/policy.md`;
}
function analyzeRecentDecisions(entries, opts) {
  const threshold = opts?.triggerThreshold ?? POLICY_PROPOSAL_DEFAULT_THRESHOLD;
  if (threshold < 2) return null;
  const axisLookup = buildAxisLookup(entries);
  const declined = collectDeclinedAxes(entries);
  const accepts = collectAcceptsWithAxis(entries, axisLookup);
  if (accepts.length < threshold) return null;
  const counters = /* @__PURE__ */ new Map();
  let triggeredAxis = null;
  let evidence = [];
  for (const accept of accepts) {
    const { axis } = accept;
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
      primaryAxis: triggeredAxis
    })),
    triggerThreshold: threshold
  };
}
var POLICY_BODY_HEADER = `## How this project tends

Auto-generated tendencies appear above in the frontmatter. The free-form prose
below survives \`applyProposal\` rewrites \u2014 use it to capture rationale or
exceptions.
`;
function emptyPolicy() {
  return {
    acceptedAt: (/* @__PURE__ */ new Date(0)).toISOString(),
    source: "user-confirmed",
    axes: /* @__PURE__ */ new Map(),
    body: POLICY_BODY_HEADER
  };
}
function parsePolicyMarkdown(content) {
  if (content === "") return emptyPolicy();
  const trimmedStart = content.replace(/^﻿/, "");
  if (!trimmedStart.startsWith("---\n") && !trimmedStart.startsWith("---\r\n")) {
    return { ...emptyPolicy(), body: trimmedStart };
  }
  const lines = trimmedStart.split(/\r?\n/);
  let endIdx = -1;
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i] === "---") {
      endIdx = i;
      break;
    }
  }
  if (endIdx === -1) {
    return { ...emptyPolicy(), body: trimmedStart };
  }
  const fm = lines.slice(1, endIdx);
  const body = lines.slice(endIdx + 1).join("\n");
  const parsed = emptyPolicy();
  parsed.body = body.length > 0 ? body : POLICY_BODY_HEADER;
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
        const key2 = m[1];
        let value2 = m[2].trim();
        if (value2.startsWith('"') && value2.endsWith('"') || value2.startsWith("'") && value2.endsWith("'")) {
          value2 = value2.slice(1, -1);
        }
        parsed.axes.set(key2, value2);
      }
      continue;
    }
    inAxes = false;
    const kvMatch = /^([a-z][a-z0-9-]*)\s*:\s*(.+)$/i.exec(line);
    if (kvMatch === null) continue;
    const key = kvMatch[1];
    let value = kvMatch[2].trim();
    if (value.startsWith('"') && value.endsWith('"') || value.startsWith("'") && value.endsWith("'")) {
      value = value.slice(1, -1);
    }
    if (key === "acceptedAt") parsed.acceptedAt = value;
    else if (key === "source" && (value === "user-confirmed" || value === "wisp-proposed-then-confirmed")) {
      parsed.source = value;
    }
  }
  return parsed;
}
function renderPolicyMarkdown(p) {
  const lines = [];
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
  const body = p.body.trim() === "" ? POLICY_BODY_HEADER : p.body;
  lines.push(body);
  let out = lines.join("\n");
  if (!out.endsWith("\n")) out += "\n";
  return out;
}
async function readPolicyFile(projectRoot) {
  const path = join2(resolve3(projectRoot), POLICY_DOCUMENT_RELATIVE_PATH);
  try {
    return await fs2.readFile(path, "utf8");
  } catch (err) {
    const code = err.code;
    if (code === "ENOENT" || code === "ENOTDIR") return "";
    throw err;
  }
}
async function writePolicyFile(projectRoot, content) {
  const path = join2(resolve3(projectRoot), POLICY_DOCUMENT_RELATIVE_PATH);
  await fs2.mkdir(dirname2(path), { recursive: true });
  await fs2.writeFile(path, content, "utf8");
  return path;
}
async function applyProposal(proposal, opts) {
  const existing = await readPolicyFile(opts.projectRoot);
  const parsed = parsePolicyMarkdown(existing);
  parsed.axes.set(proposal.axis, extractValueFromProposed(proposal.proposed) ?? proposal.proposed);
  parsed.acceptedAt = (/* @__PURE__ */ new Date()).toISOString();
  parsed.source = "wisp-proposed-then-confirmed";
  const rendered = renderPolicyMarkdown(parsed);
  const path = await writePolicyFile(opts.projectRoot, rendered);
  return { written: true, policyPath: path };
}
function extractValueFromProposed(proposed) {
  const m = /['"]([^'"]+)['"]/.exec(proposed);
  return m === null ? null : m[1];
}
var policyProposal = {
  analyzeRecentDecisions,
  applyProposal
};
async function runPolicy(args) {
  const parsed = parseFlags(args);
  const propose = flagAsBoolean(parsed, "propose", false);
  const show = flagAsBoolean(parsed, "show", false);
  const apply = flagAsString(parsed, "apply");
  const taskId = flagAsString(parsed, "task");
  const thresholdRaw = flagAsString(parsed, "threshold");
  const modes = [propose, show, apply !== void 0].filter(Boolean).length;
  if (modes === 0) {
    writeError({
      code: "BAD_FLAG",
      message: "policy: need one of --propose, --apply <axis>=<value>, or --show"
    });
    return EXIT_ARG;
  }
  if (modes > 1) {
    writeError({
      code: "BAD_FLAG",
      message: "policy: --propose, --apply, and --show are mutually exclusive"
    });
    return EXIT_ARG;
  }
  const projectRoot = process.cwd();
  if (show) {
    try {
      const content = await readPolicyFile(projectRoot);
      if (content === "") {
        process.stdout.write(
          `No policy file at ${POLICY_DOCUMENT_RELATIVE_PATH}. Run \`wisp-design policy --propose\` to surface a starter.
`
        );
        return EXIT_OK;
      }
      process.stdout.write(content.endsWith("\n") ? content : content + "\n");
      return EXIT_OK;
    } catch (err) {
      writeError({ code: "POLICY_READ_FAILED", message: err.message });
      return EXIT_IO;
    }
  }
  if (apply !== void 0) {
    const m = /^([a-z][a-z0-9-]*)=(.+)$/i.exec(apply);
    if (m === null) {
      writeError({
        code: "BAD_FLAG",
        message: `policy: --apply expects <axis>=<value>, got "${apply}"`
      });
      return EXIT_ARG;
    }
    const axis = m[1];
    const value = m[2];
    if (!isPolicyAxis(axis)) {
      writeError({
        code: "BAD_FLAG",
        message: `policy: unknown axis "${axis}". Allowed: hierarchy, layout, typography, color, density.`
      });
      return EXIT_ARG;
    }
    try {
      const existing = await readPolicyFile(projectRoot);
      const parsed2 = parsePolicyMarkdown(existing);
      parsed2.axes.set(axis, value);
      parsed2.acceptedAt = (/* @__PURE__ */ new Date()).toISOString();
      parsed2.source = "user-confirmed";
      const rendered = renderPolicyMarkdown(parsed2);
      const path = await writePolicyFile(projectRoot, rendered);
      writeJsonResult({ written: true, policyPath: path, axis, value });
      return EXIT_OK;
    } catch (err) {
      writeError({ code: "POLICY_WRITE_FAILED", message: err.message });
      return EXIT_IO;
    }
  }
  let threshold = POLICY_PROPOSAL_DEFAULT_THRESHOLD;
  if (thresholdRaw !== void 0) {
    const n = Number(thresholdRaw);
    if (!Number.isFinite(n) || n < 2 || !Number.isInteger(n)) {
      writeError({
        code: "BAD_FLAG",
        message: `policy: --threshold must be an integer >= 2, got "${thresholdRaw}"`
      });
      return EXIT_ARG;
    }
    threshold = n;
  }
  let sessionId2;
  if (taskId !== void 0 && taskId !== "") {
    sessionId2 = taskId;
  } else {
    try {
      sessionId2 = await findMostRecentSessionId(projectRoot);
    } catch (err) {
      writeError({ code: "POLICY_READ_FAILED", message: err.message });
      return EXIT_IO;
    }
  }
  if (sessionId2 === null) {
    writeJsonResult({ proposal: null, reason: "no sessions found" });
    return EXIT_OK;
  }
  let entries;
  try {
    entries = await readSessionEntries(projectRoot, sessionId2);
  } catch (err) {
    writeError({ code: "POLICY_READ_FAILED", message: err.message });
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
export {
  policyProposal,
  runPolicy
};
//# sourceMappingURL=policy.js.map