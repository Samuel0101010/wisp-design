#!/usr/bin/env node

// src/session/logger.ts
import { promises as fs2 } from "fs";
import { dirname as dirname2 } from "path";

// src/source/undo-stack.ts
import { promises as fs } from "fs";
import { dirname, isAbsolute, join, resolve, sep } from "path";

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
var MAX_UNDO_LOG_BYTES = 10485760;

// src/source/undo-stack.ts
var DEFAULT_PROJECT_ROOT = process.cwd();
function sessionLogPath(sessionId, projectRoot) {
  if (sessionId.length === 0) {
    throw new Error("undo-stack: sessionId must not be empty");
  }
  if (sessionId.includes("/") || sessionId.includes("\\") || sessionId === "." || sessionId === "..") {
    throw new Error(
      `undo-stack: sessionId must not contain path separators, got "${sessionId}"`
    );
  }
  const root = resolve(projectRoot ?? DEFAULT_PROJECT_ROOT);
  return join(root, ".wisp", "sessions", `${sessionId}.jsonl`);
}
async function ensureDir(filePath) {
  await fs.mkdir(dirname(filePath), { recursive: true });
}
async function append(entry, opts = {}) {
  const parsed = UndoEntrySchema.parse(entry);
  const path = sessionLogPath(parsed.sessionId, opts.projectRoot);
  const maxBytes = opts.maxBytes ?? MAX_UNDO_LOG_BYTES;
  await ensureDir(path);
  await rotateIfTooLarge(parsed.sessionId, maxBytes, {
    projectRoot: opts.projectRoot
  });
  const line = JSON.stringify(parsed) + "\n";
  await fs.appendFile(path, line, { encoding: "utf8" });
}
async function rotateIfTooLarge(sessionId, maxBytes, opts = {}) {
  const path = sessionLogPath(sessionId, opts.projectRoot);
  let size = 0;
  try {
    const st = await fs.stat(path);
    size = st.size;
  } catch (err) {
    const code = err.code;
    if (code === "ENOENT") return;
    throw err;
  }
  if (size < maxBytes) return;
  const stamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
  const rotated = `${path}.${stamp}.rotated`;
  await fs.rename(path, rotated);
}
function sessionLogPathForTest(sessionId, projectRoot) {
  return sessionLogPath(sessionId, projectRoot);
}

// src/contracts/session.ts
import { z as z2 } from "zod";
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

// src/session/logger.ts
async function appendEntry(entry, projectRoot) {
  const parsed = SessionEventEntrySchema.parse(entry);
  if (isUndoKind(parsed.kind)) {
    if (parsed.filePath === void 0) {
      throw new Error(
        `session-logger: kind "${parsed.kind}" is a Phase-3 file-op and requires filePath; entry omitted it.`
      );
    }
    await append(
      {
        ts: parsed.ts,
        sessionId: parsed.sessionId,
        kind: parsed.kind,
        filePath: parsed.filePath,
        detail: parsed.detail,
        beforeSha256: parsed.beforeSha256,
        afterSha256: parsed.afterSha256
      },
      { projectRoot }
    );
    return;
  }
  const path = sessionLogPathForTest(parsed.sessionId, projectRoot);
  await fs2.mkdir(dirname2(path), { recursive: true });
  const line = JSON.stringify(parsed) + "\n";
  await fs2.appendFile(path, line, { encoding: "utf8" });
}
var UNDO_KINDS = /* @__PURE__ */ new Set([
  "inject-script",
  "remove-script",
  "wrap-variants",
  "discard-variants",
  "accept-variant",
  "param-change",
  "safety-refused"
]);
function isUndoKind(kind) {
  return UNDO_KINDS.has(kind);
}
function nowIso() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
async function start(sessionId, opts) {
  await appendEntry(
    {
      ts: nowIso(),
      sessionId,
      kind: "session-start",
      detail: { meta: opts.meta ?? { projectRoot: opts.projectRoot } }
    },
    opts.projectRoot
  );
}
async function end(sessionId, opts) {
  await appendEntry(
    {
      ts: nowIso(),
      sessionId,
      kind: "session-end",
      detail: {}
    },
    opts.projectRoot
  );
}
async function logVariantsEmitted(sessionId, evt, opts) {
  await appendEntry(
    {
      ts: nowIso(),
      sessionId,
      kind: "variants-emitted",
      detail: {
        targetId: evt.targetId,
        variants: evt.variants
      }
    },
    opts.projectRoot
  );
}
async function logAccept(sessionId, evt, opts) {
  await appendEntry(
    {
      ts: nowIso(),
      sessionId,
      kind: "accept-variant",
      filePath: evt.filePath,
      ...evt.beforeSha256 !== void 0 ? { beforeSha256: evt.beforeSha256 } : {},
      ...evt.afterSha256 !== void 0 ? { afterSha256: evt.afterSha256 } : {},
      detail: {
        variantId: evt.variantId,
        ...evt.targetId !== void 0 ? { targetId: evt.targetId } : {}
      }
    },
    opts.projectRoot
  );
}
async function logVerifyReport(sessionId, evt, opts) {
  await appendEntry(
    {
      ts: nowIso(),
      sessionId,
      kind: "verify-report",
      detail: {
        verdict: evt.verdict,
        hardBanCount: evt.hardBanCount,
        a11yFailCount: evt.a11yFailCount
      }
    },
    opts.projectRoot
  );
}
async function logPick(sessionId, evt, opts) {
  await appendEntry(
    {
      ts: nowIso(),
      sessionId,
      kind: "pick",
      detail: { selector: evt.selector, tag: evt.tag, targetId: evt.targetId }
    },
    opts.projectRoot
  );
}
async function logConfigure(sessionId, evt, opts) {
  await appendEntry(
    {
      ts: nowIso(),
      sessionId,
      kind: "configure",
      detail: { targetId: evt.targetId, freeText: evt.freeText }
    },
    opts.projectRoot
  );
}
async function logCycleActiveChanged(sessionId, evt, opts) {
  await appendEntry(
    {
      ts: nowIso(),
      sessionId,
      kind: "cycle-active-changed",
      detail: { fromIndex: evt.fromIndex, toIndex: evt.toIndex }
    },
    opts.projectRoot
  );
}
async function logParamChanged(sessionId, evt, opts) {
  await appendEntry(
    {
      ts: nowIso(),
      sessionId,
      kind: "param-changed",
      detail: { varName: evt.varName, from: evt.from, to: evt.to }
    },
    opts.projectRoot
  );
}
async function logPolicyProposalShown(sessionId, evt, opts) {
  await appendEntry(
    {
      ts: nowIso(),
      sessionId,
      kind: "policy-proposal-shown",
      detail: {
        axis: evt.axis,
        observation: evt.observation,
        proposed: evt.proposed,
        triggerThreshold: evt.triggerThreshold
      }
    },
    opts.projectRoot
  );
}
async function logPolicyProposalAccepted(sessionId, evt, opts) {
  await appendEntry(
    {
      ts: nowIso(),
      sessionId,
      kind: "policy-proposal-accepted",
      detail: { axis: evt.axis }
    },
    opts.projectRoot
  );
}
async function logPolicyProposalDeclined(sessionId, evt, opts) {
  await appendEntry(
    {
      ts: nowIso(),
      sessionId,
      kind: "policy-proposal-declined",
      detail: { axis: evt.axis }
    },
    opts.projectRoot
  );
}
async function logMorphEngaged(sessionId, evt, opts) {
  await appendEntry(
    {
      ts: nowIso(),
      sessionId,
      kind: "morph-engaged",
      detail: { variantIdA: evt.variantIdA, variantIdB: evt.variantIdB, t: evt.t }
    },
    opts.projectRoot
  );
}
async function logStructureVariantEmitted(sessionId, evt, opts) {
  await appendEntry(
    {
      ts: nowIso(),
      sessionId,
      kind: "structure-variant-emitted",
      detail: { targetId: evt.targetId, kinds: evt.kinds }
    },
    opts.projectRoot
  );
}
async function logComponentLibDetected(sessionId, evt, opts) {
  await appendEntry(
    {
      ts: nowIso(),
      sessionId,
      kind: "component-lib-detected",
      detail: {
        lib: evt.lib,
        confidence: evt.confidence,
        ...evt.preferredStrategy !== void 0 ? { preferredStrategy: evt.preferredStrategy } : {}
      }
    },
    opts.projectRoot
  );
}
var sessionLogger = {
  start,
  // Contract: log(entry). The agent-loop calls log(entry, opts) — accept both.
  // `as never` reconciles the contract's 1-arg shape with the 2-arg call site;
  // the runtime check below picks the projectRoot.
  log: (async (entryOrEntry, maybeOpts) => {
    if (maybeOpts === void 0) {
      await appendEntry(entryOrEntry, process.cwd());
      return;
    }
    await appendEntry(entryOrEntry, maybeOpts.projectRoot);
  }),
  end,
  logVariantsEmitted,
  logAccept,
  logVerifyReport,
  logPick,
  logConfigure,
  logCycleActiveChanged,
  logParamChanged,
  logPolicyProposalShown,
  logPolicyProposalAccepted,
  logPolicyProposalDeclined,
  logMorphEngaged,
  logStructureVariantEmitted,
  logComponentLibDetected
};
export {
  appendEntry as _appendEntryForTest,
  sessionLogger
};
//# sourceMappingURL=logger.js.map