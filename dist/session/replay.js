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
function sessionLogPath(projectRoot, sessionId) {
  return join(sessionsDir(projectRoot), `${sessionId}.jsonl`);
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
function emptyTimeline(sessionId) {
  return {
    sessionId,
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
async function buildTimeline(sessionId, opts) {
  const path = sessionLogPath(opts.projectRoot, sessionId);
  const entries = await readEntries(path);
  if (entries.length === 0) {
    return emptyTimeline(sessionId);
  }
  const axisLookup = buildVariantAxisLookup(entries);
  const timeline = emptyTimeline(sessionId);
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
    const sessionId = name.slice(0, -".jsonl".length);
    if (sessionId === "") continue;
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
      sessionId,
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
  return out.map(({ sessionId, startedAt, endedAt, entriesCount }) => ({
    sessionId,
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
async function readSessionEntries(projectRoot, sessionId) {
  return readEntries(sessionLogPath(projectRoot, sessionId));
}
var sessionReplay = {
  buildTimeline,
  listSessions
};
export {
  findMostRecentSessionId,
  readSessionEntries,
  sessionReplay
};
//# sourceMappingURL=replay.js.map