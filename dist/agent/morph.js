#!/usr/bin/env node

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
var MORPH_INTERPOLATABLE_UNITS = [
  "px",
  "rem",
  "em",
  "%",
  "deg",
  "vh",
  "vw",
  "ch",
  "ex",
  "fr",
  "ms",
  "s"
];
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

// src/agent/_helpers.ts
import { readFile } from "fs/promises";
import { resolve } from "path";

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
  // Phase 7.17 — may be empty when `codeSnippet` carries the whole intent
  // (snippet-only generate). The UI enforces text-or-snippet; a zod .refine
  // is not possible here (discriminatedUnion requires plain ZodObject).
  freeText: z3.string().max(4e3),
  // Phase 7.17 — pasted design-reference code from the snippet popup. The
  // agent ports it to the project's stack; it never reaches the DOM raw.
  codeSnippet: z3.string().min(1).max(2e4).optional(),
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
function flagAsNumber(parsed, key) {
  const v = parsed.flags[key];
  if (typeof v !== "string") return void 0;
  const n = Number(v);
  if (!Number.isFinite(n)) return void 0;
  return n;
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

// src/agent/morph.ts
var CSS_VALUE_RE = /^(-?\d+(?:\.\d+)?)([a-z%]*)$/i;
function parseCssValue(s) {
  const trimmed = (s ?? "").trim();
  if (trimmed.length === 0) return null;
  const m = CSS_VALUE_RE.exec(trimmed);
  if (m === null) return null;
  const numeric = Number(m[1]);
  if (!Number.isFinite(numeric)) return null;
  return { numeric, unit: (m[2] ?? "").toLowerCase() };
}
var INTERPOLATABLE_UNIT_SET = new Set(MORPH_INTERPOLATABLE_UNITS);
function unitIsInterpolatable(unit) {
  if (unit === "") return true;
  return INTERPOLATABLE_UNIT_SET.has(unit);
}
function buildSource(variantA, variantB) {
  const allNames = /* @__PURE__ */ new Set([
    ...Object.keys(variantA.cssVars ?? {}),
    ...Object.keys(variantB.cssVars ?? {})
  ]);
  const sortedNames = Array.from(allNames).sort();
  const variableDiff = [];
  for (const name of sortedNames) {
    const rawA = variantA.cssVars?.[name];
    const rawB = variantB.cssVars?.[name];
    const valueA = rawA ?? rawB ?? "";
    const valueB = rawB ?? rawA ?? "";
    const parsedA = parseCssValue(valueA);
    const parsedB = parseCssValue(valueB);
    let interpolatable = false;
    let unit;
    if (parsedA !== null && parsedB !== null && parsedA.unit === parsedB.unit && unitIsInterpolatable(parsedA.unit)) {
      interpolatable = true;
      unit = parsedA.unit;
    }
    const diff = { name, valueA, valueB, interpolatable };
    if (unit !== void 0) diff.unit = unit;
    variableDiff.push(diff);
  }
  return {
    variantIdA: variantA.id,
    variantIdB: variantB.id,
    variableDiff
  };
}
function clampT(t) {
  if (!Number.isFinite(t)) return MORPH_T_MIN;
  if (t < MORPH_T_MIN) return MORPH_T_MIN;
  if (t > MORPH_T_MAX) return MORPH_T_MAX;
  return t;
}
function formatNumeric(n) {
  if (Number.isInteger(n)) return String(n);
  return (Math.round(n * 1e4) / 1e4).toString();
}
function interpolate(source, t) {
  const clampedT = clampT(t);
  const lines = [];
  for (const diff of source.variableDiff) {
    let value;
    if (diff.interpolatable) {
      const parsedA = parseCssValue(diff.valueA);
      const parsedB = parseCssValue(diff.valueB);
      if (parsedA === null || parsedB === null) {
        value = clampedT < 0.5 ? diff.valueA : diff.valueB;
      } else {
        const numeric = parsedA.numeric + (parsedB.numeric - parsedA.numeric) * clampedT;
        const unit = diff.unit ?? parsedA.unit;
        value = `${formatNumeric(numeric)}${unit}`;
      }
    } else {
      value = clampedT < 0.5 ? diff.valueA : diff.valueB;
    }
    lines.push(`  ${diff.name}: ${value};`);
  }
  const interpolatedCss = lines.length === 0 ? "" : `:scope {
${lines.join("\n")}
}`;
  return {
    source,
    t: clampedT,
    interpolatedCss
  };
}
function parseVarsJson(raw, side) {
  if (raw === void 0) {
    writeError({
      code: "MISSING_FLAG",
      message: `--variant-${side}-vars is required`
    });
    return null;
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    writeError({
      code: "BAD_JSON",
      message: `--variant-${side}-vars is not valid JSON: ${err.message}`
    });
    return null;
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    writeError({
      code: "BAD_JSON",
      message: `--variant-${side}-vars must be a JSON object`
    });
    return null;
  }
  const out = {};
  for (const [k, v] of Object.entries(parsed)) {
    if (typeof v !== "string") {
      writeError({
        code: "BAD_JSON",
        message: `--variant-${side}-vars value for "${k}" must be a string (got ${typeof v})`
      });
      return null;
    }
    out[k] = v;
  }
  return out;
}
async function runMorph(args) {
  const parsed = parseFlags(args);
  const idA = flagAsString(parsed, "variant-a-id");
  const idB = flagAsString(parsed, "variant-b-id");
  const tFlag = flagAsNumber(parsed, "t");
  const format = (flagAsString(parsed, "format") ?? "text").toLowerCase();
  if (idA === void 0 || idB === void 0) {
    writeError({
      code: "MISSING_FLAG",
      message: "--variant-a-id and --variant-b-id are required"
    });
    return EXIT_ARG;
  }
  if (tFlag === void 0) {
    writeError({
      code: "MISSING_FLAG",
      message: "--t is required (numeric, 0..1)"
    });
    return EXIT_ARG;
  }
  const varsA = parseVarsJson(flagAsString(parsed, "variant-a-vars"), "a");
  if (varsA === null) return EXIT_ARG;
  const varsB = parseVarsJson(flagAsString(parsed, "variant-b-vars"), "b");
  if (varsB === null) return EXIT_ARG;
  let source;
  let config;
  try {
    source = buildSource(
      { id: idA, cssVars: varsA },
      { id: idB, cssVars: varsB }
    );
    config = interpolate(source, tFlag);
  } catch (err) {
    writeError({
      code: "MORPH_FAILED",
      message: `morph computation failed: ${err.message ?? "unknown"}`
    });
    return EXIT_IO;
  }
  if (format === "json") {
    writeJsonResult(config);
  } else {
    process.stdout.write(`${config.interpolatedCss}
`);
  }
  return EXIT_OK;
}
var morphModeModule = {
  buildSource,
  interpolate
};
export {
  buildSource,
  interpolate,
  morphModeModule,
  parseCssValue,
  runMorph
};
//# sourceMappingURL=morph.js.map