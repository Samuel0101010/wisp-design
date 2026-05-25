#!/usr/bin/env node

// src/session/replay.ts
import { promises as fs } from "fs";
import { dirname, join, resolve } from "path";

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
function buildVariantAxisLookup(entries) {
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
function foldPolicy(entries) {
  const rows = /* @__PURE__ */ new Map();
  for (const entry of entries) {
    const axis = typeof entry.detail?.["axis"] === "string" ? entry.detail["axis"] : "";
    if (axis === "") continue;
    if (entry.kind === "policy-proposal-shown") {
      const proposed = typeof entry.detail?.["proposed"] === "string" ? entry.detail["proposed"] : "";
      rows.set(axis, {
        ts: entry.ts,
        axis,
        proposed,
        outcome: "shown-only"
      });
    } else if (entry.kind === "policy-proposal-accepted") {
      const existing = rows.get(axis);
      if (existing !== void 0) {
        existing.outcome = "accepted";
        existing.ts = entry.ts;
      } else {
        rows.set(axis, { ts: entry.ts, axis, proposed: "", outcome: "accepted" });
      }
    } else if (entry.kind === "policy-proposal-declined") {
      const existing = rows.get(axis);
      if (existing !== void 0) {
        existing.outcome = "declined";
        existing.ts = entry.ts;
      } else {
        rows.set(axis, { ts: entry.ts, axis, proposed: "", outcome: "declined" });
      }
    }
  }
  return [...rows.values()];
}
function emptyTimeline(sessionId2) {
  return {
    sessionId: sessionId2,
    startedAt: (/* @__PURE__ */ new Date(0)).toISOString(),
    entriesCount: 0,
    picks: [],
    variantGenerations: [],
    accepts: [],
    discards: [],
    policyProposals: [],
    verifyReports: [],
    componentLibDetections: [],
    totalVariantsGenerated: 0,
    acceptRate: 0,
    primaryAxisHistogram: {}
  };
}
async function buildTimeline(sessionId2, opts) {
  const path = sessionLogPath(opts.projectRoot, sessionId2);
  const entries = await readEntries(path);
  if (entries.length === 0) {
    return emptyTimeline(sessionId2);
  }
  const axisLookup = buildVariantAxisLookup(entries);
  const timeline = emptyTimeline(sessionId2);
  timeline.entriesCount = entries.length;
  timeline.startedAt = entries[0]?.ts ?? timeline.startedAt;
  let endedAt;
  for (const entry of entries) {
    if (entry.kind === "session-start") {
      timeline.startedAt = entry.ts;
      continue;
    }
    if (entry.kind === "session-end") {
      endedAt = entry.ts;
      continue;
    }
    if (entry.kind === "pick") {
      const selector = stringDetail(entry, "selector");
      const tag = stringDetail(entry, "tag");
      timeline.picks.push({ ts: entry.ts, selector, tag });
      continue;
    }
    if (entry.kind === "variants-emitted") {
      const targetId = stringDetail(entry, "targetId");
      const variants = arrayDetail(entry, "variants");
      const variantCount = variants.length;
      const rationales = [];
      for (const v of variants) {
        if (typeof v !== "object" || v === null) continue;
        const rationale = v["rationale"];
        if (typeof rationale === "string") rationales.push(rationale);
      }
      timeline.variantGenerations.push({
        ts: entry.ts,
        targetId,
        variantCount,
        rationales
      });
      timeline.totalVariantsGenerated += variantCount;
      continue;
    }
    if (entry.kind === "accept-variant") {
      const variantId = stringDetail(entry, "variantId");
      const filePath = entry.filePath ?? "";
      timeline.accepts.push({ ts: entry.ts, variantId, filePath });
      const axis = axisLookup.get(variantId);
      if (axis !== void 0) {
        timeline.primaryAxisHistogram[axis] = (timeline.primaryAxisHistogram[axis] ?? 0) + 1;
      }
      continue;
    }
    if (entry.kind === "discard-variants") {
      const reason = stringDetail(entry, "reason");
      timeline.discards.push({ ts: entry.ts, reason });
      continue;
    }
    if (entry.kind === "verify-report") {
      const verdictRaw = stringDetail(entry, "verdict");
      const verdict = verdictRaw === "pass" || verdictRaw === "warn" || verdictRaw === "fail" ? verdictRaw : "warn";
      const hardBanCount = numberDetail(entry, "hardBanCount");
      const a11yFailCount = numberDetail(entry, "a11yFailCount");
      timeline.verifyReports.push({
        ts: entry.ts,
        verdict,
        hardBanCount,
        a11yFailCount
      });
      continue;
    }
    if (entry.kind === "component-lib-detected") {
      const lib = stringDetail(entry, "lib");
      const confidence = numberDetail(entry, "confidence");
      timeline.componentLibDetections.push({ ts: entry.ts, lib, confidence });
      continue;
    }
  }
  if (endedAt !== void 0) {
    timeline.endedAt = endedAt;
  } else {
    const last = entries[entries.length - 1];
    if (last !== void 0) timeline.endedAt = last.ts;
  }
  const policyRows = foldPolicy(entries);
  timeline.policyProposals = policyRows.map((r) => ({
    ts: r.ts,
    axis: r.axis,
    proposed: r.proposed,
    outcome: r.outcome
  }));
  timeline.acceptRate = timeline.totalVariantsGenerated > 0 ? timeline.accepts.length / timeline.totalVariantsGenerated : 0;
  return timeline;
}
function stringDetail(entry, key) {
  const v = entry.detail?.[key];
  return typeof v === "string" ? v : "";
}
function numberDetail(entry, key) {
  const v = entry.detail?.[key];
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}
function arrayDetail(entry, key) {
  const v = entry.detail?.[key];
  return Array.isArray(v) ? v : [];
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
var sessionReplay = {
  buildTimeline,
  listSessions
};

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
  // Phase 7.15 — deviation tells the agent how far variants should drift
  // from the original design. 1 = subtle (typography weight, light spacing
  // tweaks), 3 = balanced (mix of axes, the previous default behavior),
  // 5 = radical (reimagined layout/structure/color, may break conventions).
  // Optional so older clients / scripted POSTs keep working at the default.
  deviation: z3.number().int().min(1).max(5).optional(),
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
  sessionId,
  // Phase 7.8 — Browser includes the accepted variant's CSS so the in-process
  // accept handler can splice it into source without regenerating from a stub.
  // Optional for back-compat: older browsers / tests omit this and the handler
  // falls back to stub regeneration.
  variantCss: z3.string().optional(),
  rationale: z3.string().optional()
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
var EXIT_IO = 1;
var EXIT_ARG = 2;

// src/agent/history.ts
var EXIT_NOT_FOUND = 1;
var EXIT_INTERNAL = 3;
function parseFormat(raw) {
  if (raw === void 0) return "text";
  if (raw === "text" || raw === "json" || raw === "markdown") return raw;
  return null;
}
function formatShortTs(ts) {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  const ss = String(d.getUTCSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}
function formatDateTs(ts) {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${formatShortTs(ts)}`;
}
function pct(n) {
  return `${Math.round(n * 100)}%`;
}
function renderText(timeline) {
  const lines = [];
  const endLabel = timeline.endedAt !== void 0 ? formatShortTs(timeline.endedAt) : "\u2014";
  lines.push(
    `Session ${timeline.sessionId} (${formatDateTs(timeline.startedAt)} \u2192 ${endLabel}, ${timeline.entriesCount} entries)`
  );
  lines.push("");
  const rows = [];
  for (const p of timeline.picks) {
    rows.push({ ts: p.ts, line: `pick      ${p.tag} ${p.selector ? `(${p.selector})` : ""}` });
  }
  for (const v of timeline.variantGenerations) {
    const summary = v.rationales.length > 0 ? ` \u2014 ${v.rationales.map((r) => r.split(/[—:.]/)[0]?.trim() ?? r).filter(Boolean).join(" / ")}` : "";
    rows.push({
      ts: v.ts,
      line: `variants-emitted (${v.variantCount})${summary}`
    });
  }
  for (const a of timeline.accepts) {
    rows.push({ ts: a.ts, line: `accept-variant  ${a.variantId} \u2192 ${a.filePath || "?"}` });
  }
  for (const d of timeline.discards) {
    rows.push({ ts: d.ts, line: `discard-variants \u2014 ${d.reason || "(no reason)"}` });
  }
  for (const v of timeline.verifyReports) {
    rows.push({
      ts: v.ts,
      line: `verify-report   verdict=${v.verdict} hardBans=${v.hardBanCount} a11yFails=${v.a11yFailCount}`
    });
  }
  for (const p of timeline.policyProposals) {
    rows.push({
      ts: p.ts,
      line: `policy-proposal axis=${p.axis} outcome=${p.outcome}`
    });
  }
  for (const c of timeline.componentLibDetections) {
    rows.push({
      ts: c.ts,
      line: `component-lib   lib=${c.lib} confidence=${c.confidence.toFixed(2)}`
    });
  }
  rows.sort((a, b) => a.ts.localeCompare(b.ts));
  for (const r of rows) {
    lines.push(`${formatShortTs(r.ts)}  ${r.line}`);
  }
  lines.push("");
  lines.push("Aggregates:");
  lines.push(`  Total variants generated: ${timeline.totalVariantsGenerated}`);
  lines.push(
    `  Accept rate: ${pct(timeline.acceptRate)} (${timeline.accepts.length}/${timeline.totalVariantsGenerated})`
  );
  const histo = Object.entries(timeline.primaryAxisHistogram).sort(
    (a, b) => b[1] - a[1]
  );
  if (histo.length === 0) {
    lines.push(`  Primary-axis histogram: (no accepts)`);
  } else {
    lines.push(
      `  Primary-axis histogram: ${histo.map(([k, v]) => `${k}=${v}`).join(", ")}`
    );
  }
  return lines.join("\n") + "\n";
}
function renderMarkdown(timeline) {
  const lines = [];
  const endLabel = timeline.endedAt !== void 0 ? formatShortTs(timeline.endedAt) : "\u2014";
  lines.push(`# Session \`${timeline.sessionId}\``);
  lines.push("");
  lines.push(
    `**${formatDateTs(timeline.startedAt)} \u2192 ${endLabel}** \xB7 ${timeline.entriesCount} entries`
  );
  lines.push("");
  lines.push("## Timeline");
  lines.push("");
  lines.push("| Time | Kind | Detail |");
  lines.push("|---|---|---|");
  const rows = [];
  for (const p of timeline.picks) {
    rows.push({
      ts: p.ts,
      kind: "pick",
      detail: `\`${p.tag}\` ${p.selector ? `(${p.selector})` : ""}`
    });
  }
  for (const v of timeline.variantGenerations) {
    rows.push({
      ts: v.ts,
      kind: "variants-emitted",
      detail: `${v.variantCount} variants${v.rationales.length > 0 ? ` \u2014 ${v.rationales.join(" \xB7 ")}` : ""}`
    });
  }
  for (const a of timeline.accepts) {
    rows.push({
      ts: a.ts,
      kind: "accept-variant",
      detail: `\`${a.variantId}\` \u2192 \`${a.filePath || "?"}\``
    });
  }
  for (const d of timeline.discards) {
    rows.push({ ts: d.ts, kind: "discard-variants", detail: d.reason });
  }
  for (const v of timeline.verifyReports) {
    rows.push({
      ts: v.ts,
      kind: "verify-report",
      detail: `verdict=${v.verdict}, hardBans=${v.hardBanCount}, a11yFails=${v.a11yFailCount}`
    });
  }
  for (const p of timeline.policyProposals) {
    rows.push({
      ts: p.ts,
      kind: "policy-proposal",
      detail: `axis=${p.axis}, outcome=${p.outcome}`
    });
  }
  for (const c of timeline.componentLibDetections) {
    rows.push({
      ts: c.ts,
      kind: "component-lib-detected",
      detail: `lib=${c.lib}, confidence=${c.confidence.toFixed(2)}`
    });
  }
  rows.sort((a, b) => a.ts.localeCompare(b.ts));
  for (const r of rows) {
    lines.push(`| ${formatShortTs(r.ts)} | ${r.kind} | ${r.detail} |`);
  }
  lines.push("");
  lines.push("## Aggregates");
  lines.push("");
  lines.push("| Metric | Value |");
  lines.push("|---|---|");
  lines.push(
    `| Total variants generated | ${timeline.totalVariantsGenerated} |`
  );
  lines.push(
    `| Accept rate | ${pct(timeline.acceptRate)} (${timeline.accepts.length}/${timeline.totalVariantsGenerated}) |`
  );
  const histo = Object.entries(timeline.primaryAxisHistogram).sort(
    (a, b) => b[1] - a[1]
  );
  for (const [k, v] of histo) {
    lines.push(`| primaryAxis: ${k} | ${v} |`);
  }
  return lines.join("\n") + "\n";
}
function renderListText(sessions) {
  if (sessions.length === 0) {
    return "No sessions found in .wisp/sessions/.\n";
  }
  const lines = [];
  lines.push("Sessions (newest first):");
  lines.push("");
  for (const s of sessions) {
    const end = s.endedAt !== void 0 ? formatDateTs(s.endedAt) : "(open)";
    lines.push(
      `  ${s.sessionId}  ${formatDateTs(s.startedAt)} \u2192 ${end}  (${s.entriesCount} entries)`
    );
  }
  return lines.join("\n") + "\n";
}
function renderListMarkdown(sessions) {
  if (sessions.length === 0) {
    return "No sessions found in `.wisp/sessions/`.\n";
  }
  const lines = [];
  lines.push("# Sessions");
  lines.push("");
  lines.push("| Session | Started | Ended | Entries |");
  lines.push("|---|---|---|---|");
  for (const s of sessions) {
    const end = s.endedAt !== void 0 ? formatDateTs(s.endedAt) : "(open)";
    lines.push(
      `| \`${s.sessionId}\` | ${formatDateTs(s.startedAt)} | ${end} | ${s.entriesCount} |`
    );
  }
  return lines.join("\n") + "\n";
}
async function runHistory(args) {
  const parsed = parseFlags(args);
  const formatRaw = flagAsString(parsed, "format");
  const format = parseFormat(formatRaw);
  if (format === null) {
    writeError({
      code: "BAD_FLAG",
      message: `history: --format must be one of text|json|markdown, got "${formatRaw}"`
    });
    return EXIT_ARG;
  }
  const list = flagAsBoolean(parsed, "list", false);
  const replay = flagAsBoolean(parsed, "replay", false);
  const taskId = flagAsString(parsed, "task");
  const projectRoot = process.cwd();
  if (list) {
    try {
      const sessions = await sessionReplay.listSessions({ projectRoot });
      if (format === "json") {
        writeJsonResult(sessions);
      } else if (format === "markdown") {
        process.stdout.write(renderListMarkdown(sessions));
      } else {
        process.stdout.write(renderListText(sessions));
      }
      return EXIT_OK;
    } catch (err) {
      writeError({
        code: "HISTORY_LIST_FAILED",
        message: err.message
      });
      return EXIT_INTERNAL;
    }
  }
  if (replay) {
    writeError({
      code: "NOT_IMPLEMENTED",
      message: "history --replay: re-executing the timeline against the bridge is a Phase-7+ feature; not implemented yet."
    });
    return EXIT_INTERNAL;
  }
  let sessionId2;
  if (taskId !== void 0 && taskId !== "") {
    sessionId2 = taskId;
  } else {
    try {
      sessionId2 = await findMostRecentSessionId(projectRoot);
    } catch (err) {
      writeError({
        code: "HISTORY_LIST_FAILED",
        message: err.message
      });
      return EXIT_INTERNAL;
    }
  }
  if (sessionId2 === null) {
    writeError({
      code: "SESSION_NOT_FOUND",
      message: "history: no sessions found in .wisp/sessions/. Run `wisp-design live` to start one."
    });
    return EXIT_NOT_FOUND;
  }
  let timeline;
  try {
    timeline = await sessionReplay.buildTimeline(sessionId2, { projectRoot });
  } catch (err) {
    writeError({
      code: "HISTORY_BUILD_FAILED",
      message: err.message
    });
    return EXIT_INTERNAL;
  }
  if (timeline.entriesCount === 0 && taskId !== void 0 && taskId !== "") {
    writeError({
      code: "SESSION_NOT_FOUND",
      message: `history: session "${sessionId2}" has no entries (or file missing).`
    });
    return EXIT_NOT_FOUND;
  }
  if (format === "json") {
    writeJsonResult(timeline);
  } else if (format === "markdown") {
    process.stdout.write(renderMarkdown(timeline));
  } else {
    process.stdout.write(renderText(timeline));
  }
  void EXIT_IO;
  return EXIT_OK;
}
export {
  runHistory
};
//# sourceMappingURL=history.js.map