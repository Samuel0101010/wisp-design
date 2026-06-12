#!/usr/bin/env node
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/contracts/bridge.ts
import { z } from "zod";
var PortLockSchema, ElementRectSchema, ElementTargetSchema, sessionId, AnnotationKindSchema, StructuredAnnotationSchema, VariantSchema, PickEventSchema, ConfigureEventSchema, GeneratingEventSchema, CyclingEventSchema, ParameterChangeEventSchema, AcceptEventSchema, DiscardEventSchema, AnnotationEventSchema, ErrorEventSchema, HeartbeatEventSchema, BridgeEventSchema, LONG_POLL_CAP_MS, LONG_POLL_DEFAULT_LEASE_MS, LONG_POLL_MIN_TIMEOUT_MS, LongPollRequestSchema, LongPollResponseSchema, BridgeHttpErrorSchema, BridgeStatusSchema, BridgeHealthSchema;
var init_bridge = __esm({
  "src/contracts/bridge.ts"() {
    "use strict";
    PortLockSchema = z.object({
      port: z.number().int().min(31337).max(31400),
      token: z.string().uuid(),
      pid: z.number().int().positive(),
      startedAt: z.string().datetime(),
      projectRoot: z.string().min(1)
    });
    ElementRectSchema = z.object({
      x: z.number(),
      y: z.number(),
      w: z.number().nonnegative(),
      h: z.number().nonnegative()
    });
    ElementTargetSchema = z.object({
      selector: z.string().min(1),
      rect: ElementRectSchema,
      tag: z.string().min(1)
    });
    sessionId = z.string().min(1);
    AnnotationKindSchema = z.enum([
      "padding",
      "color",
      "size",
      "content",
      "other"
    ]);
    StructuredAnnotationSchema = z.object({
      kind: AnnotationKindSchema,
      note: z.string().min(1).max(2e3)
    });
    VariantSchema = z.object({
      id: z.string().min(1),
      css: z.string(),
      rationale: z.string().min(1).max(280)
    });
    PickEventSchema = z.object({
      kind: z.literal("pick"),
      target: ElementTargetSchema,
      sessionId
    });
    ConfigureEventSchema = z.object({
      kind: z.literal("configure"),
      target: ElementTargetSchema,
      freeText: z.string().min(1).max(4e3),
      sessionId
    });
    GeneratingEventSchema = z.object({
      kind: z.literal("generating"),
      target: ElementTargetSchema,
      freeText: z.string().min(1).max(4e3),
      variantCount: z.number().int().min(1).max(8),
      // Phase 7.15 — deviation tells the agent how far variants should drift
      // from the original design. 1 = subtle (typography weight, light spacing
      // tweaks), 3 = balanced (mix of axes, the previous default behavior),
      // 5 = radical (reimagined layout/structure/color, may break conventions).
      // Optional so older clients / scripted POSTs keep working at the default.
      deviation: z.number().int().min(1).max(5).optional(),
      sessionId
    });
    CyclingEventSchema = z.object({
      kind: z.literal("cycling"),
      target: ElementTargetSchema,
      variants: z.array(VariantSchema).min(1).max(8),
      activeIndex: z.number().int().nonnegative(),
      sessionId
    });
    ParameterChangeEventSchema = z.object({
      kind: z.literal("parameter-change"),
      target: ElementTargetSchema,
      varName: z.string().min(1),
      value: z.string(),
      sessionId
    });
    AcceptEventSchema = z.object({
      kind: z.literal("accept"),
      target: ElementTargetSchema,
      variantId: z.string().min(1),
      sessionId,
      // Phase 7.8 — Browser includes the accepted variant's CSS so the in-process
      // accept handler can splice it into source without regenerating from a stub.
      // Optional for back-compat: older browsers / tests omit this and the handler
      // falls back to stub regeneration.
      variantCss: z.string().optional(),
      rationale: z.string().optional()
    });
    DiscardEventSchema = z.object({
      kind: z.literal("discard"),
      target: ElementTargetSchema,
      sessionId
    });
    AnnotationEventSchema = z.object({
      kind: z.literal("annotation"),
      target: ElementTargetSchema,
      annotation: StructuredAnnotationSchema,
      sessionId
    });
    ErrorEventSchema = z.object({
      kind: z.literal("error"),
      message: z.string().min(1),
      code: z.string().optional(),
      sessionId: sessionId.optional()
    });
    HeartbeatEventSchema = z.object({
      kind: z.literal("heartbeat"),
      at: z.string().datetime()
    });
    BridgeEventSchema = z.discriminatedUnion("kind", [
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
    LONG_POLL_CAP_MS = 27e4;
    LONG_POLL_DEFAULT_LEASE_MS = 3e4;
    LONG_POLL_MIN_TIMEOUT_MS = 1e3;
    LongPollRequestSchema = z.object({
      token: z.string().uuid(),
      timeout: z.number().int().min(LONG_POLL_MIN_TIMEOUT_MS).optional(),
      leaseMs: z.number().int().min(1e3).optional(),
      cursor: z.string().optional()
    }).refine(
      (v) => v.timeout === void 0 || v.timeout <= LONG_POLL_CAP_MS,
      {
        message: `timeout must be <= ${LONG_POLL_CAP_MS}ms (Node fetch header cap is 300_000ms)`,
        path: ["timeout"]
      }
    );
    LongPollResponseSchema = z.object({
      events: z.array(BridgeEventSchema),
      cursor: z.string(),
      // Server-wall-clock at which it sliced the response. Lets the agent measure
      // drift against its own local clock when budgeting the next slice.
      slicedAt: z.number().int().nonnegative()
    });
    BridgeHttpErrorSchema = z.object({
      error: z.object({
        code: z.string().min(1),
        message: z.string().min(1),
        detail: z.unknown().optional()
      })
    });
    BridgeStatusSchema = z.object({
      port: z.number().int().positive(),
      startedAt: z.string().datetime(),
      uptimeMs: z.number().int().nonnegative(),
      sessionId: z.string().min(1),
      pendingEvents: z.number().int().nonnegative(),
      connectedSseClients: z.number().int().nonnegative(),
      projectRoot: z.string().min(1)
    });
    BridgeHealthSchema = z.object({
      ok: z.literal(true),
      version: z.string().min(1)
    });
  }
});

// src/agent/_helpers.ts
import { readFile as readFile3 } from "fs/promises";
import { resolve as resolve4 } from "path";
function isPidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    const code = err.code;
    if (code === "EPERM") return true;
    return false;
  }
}
async function readPortLock(projectRoot) {
  const lockPath = resolve4(projectRoot, ".wisp/live/port.lock");
  let raw;
  try {
    raw = await readFile3(lockPath, "utf8");
  } catch (err) {
    const code = err.code;
    if (code === "ENOENT" || code === "ENOTDIR") {
      throw new PortLockMissingError(lockPath);
    }
    throw err;
  }
  let json;
  try {
    json = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `port-lock at ${lockPath} is not valid JSON: ${err.message}`
    );
  }
  const parsed = PortLockSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error(
      `port-lock at ${lockPath} failed schema validation: ` + parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")
    );
  }
  const lock = parsed.data;
  if (!isPidAlive(lock.pid)) {
    throw new PortLockStaleError(lockPath, lock.pid);
  }
  return {
    port: lock.port,
    token: lock.token,
    pid: lock.pid,
    bridgeUrl: `http://127.0.0.1:${lock.port}`
  };
}
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
var PortLockMissingError, PortLockStaleError, EXIT_OK, EXIT_IO, EXIT_ARG, EXIT_HTTP;
var init_helpers = __esm({
  "src/agent/_helpers.ts"() {
    "use strict";
    init_bridge();
    PortLockMissingError = class extends Error {
      constructor(lockPath) {
        super(
          `bridge not running: no port-lock at ${lockPath}. Start the bridge with \`wisp-design live\`.`
        );
        this.lockPath = lockPath;
      }
      lockPath;
      name = "PortLockMissingError";
    };
    PortLockStaleError = class extends Error {
      constructor(lockPath, pid) {
        super(
          `bridge not running: port-lock at ${lockPath} references stale PID ${pid}. Remove the lock and restart the bridge.`
        );
        this.lockPath = lockPath;
        this.pid = pid;
      }
      lockPath;
      pid;
      name = "PortLockStaleError";
    };
    EXIT_OK = 0;
    EXIT_IO = 1;
    EXIT_ARG = 2;
    EXIT_HTTP = 3;
  }
});

// src/contracts/source.ts
import { z as z3 } from "zod";
var SourceFileTypeSchema, SUPPORTED_EXTENSIONS, MarkerKindSchema, MarkerGroupSchema, MARKER_SYNTAX, InjectMarkerSchema, VariantBlockMarkerSchema, StyleBlockMarkerSchema, MarkerBlockSchema, InjectOptionsSchema, AcceptOperationSchema, DiscardOperationSchema, SafetyErrorCodeSchema, UndoEntryKindSchema, UndoEntrySchema, WISP_INJECT_SCRIPT_ID, WISP_INJECT_DATA_ATTRIBUTE, MAX_SOURCE_FILE_BYTES, MAX_UNDO_LOG_BYTES, GENERATED_MAGIC_COMMENT_REGEX, REFUSE_LIST;
var init_source = __esm({
  "src/contracts/source.ts"() {
    "use strict";
    SourceFileTypeSchema = z3.enum([
      "tsx",
      "jsx",
      "html",
      "vue",
      "svelte",
      "css"
    ]);
    SUPPORTED_EXTENSIONS = {
      ".tsx": "tsx",
      ".jsx": "jsx",
      ".html": "html",
      ".htm": "html",
      ".vue": "vue",
      ".svelte": "svelte",
      ".css": "css"
    };
    MarkerKindSchema = z3.enum([
      "inject-start",
      "inject-end",
      "variants-start",
      "variants-end",
      "style-start",
      "style-end"
    ]);
    MarkerGroupSchema = z3.enum(["inject", "variants", "style"]);
    MARKER_SYNTAX = {
      tsx: {
        open: (p) => `{/* ${p} */}`,
        close: (p) => `{/* ${p} */}`,
        pattern: /\{\/\*\s*(wisp-[a-z-]+:[^*]*?)\*\/\}/
      },
      // Body uses `[\s\S]*?` (any char, non-greedy) — NOT `[^X]*?` where X is the
      // terminator's first char — because our payloads contain hyphens (UUID
      // injectIds, ISO timestamps) and base64. The trailing close-comment is the
      // natural unique terminator: `-->` cannot appear inside an HTML comment per
      // spec; `*/` cannot appear in JSX/CSS payloads (URL-safe base64 has no `*`,
      // and our key=val structure never emits it).
      jsx: {
        open: (p) => `{/* ${p} */}`,
        close: (p) => `{/* ${p} */}`,
        pattern: /\{\/\*\s*(wisp-[a-z-]+:[\s\S]*?)\*\/\}/
      },
      html: {
        open: (p) => `<!-- ${p} -->`,
        close: (p) => `<!-- ${p} -->`,
        pattern: /<!--\s*(wisp-[a-z-]+:[\s\S]*?)-->/
      },
      vue: {
        open: (p) => `<!-- ${p} -->`,
        close: (p) => `<!-- ${p} -->`,
        pattern: /<!--\s*(wisp-[a-z-]+:[\s\S]*?)-->/
      },
      svelte: {
        open: (p) => `<!-- ${p} -->`,
        close: (p) => `<!-- ${p} -->`,
        pattern: /<!--\s*(wisp-[a-z-]+:[\s\S]*?)-->/
      },
      css: {
        open: (p) => `/* ${p} */`,
        close: (p) => `/* ${p} */`,
        pattern: /\/\*\s*(wisp-[a-z-]+:[\s\S]*?)\*\//
      }
    };
    InjectMarkerSchema = z3.object({
      injectId: z3.string().min(1),
      // ULID or UUID
      insertedAt: z3.string(),
      // ISO timestamp
      bridgeUrl: z3.string().url(),
      token: z3.string().uuid(),
      // SHA256 hex of the original first 256 bytes of the file (before inject).
      // `removeLiveScript` recomputes the hash AFTER stripping the inject and
      // refuses if it doesn't match — protects against partial edits.
      beforeHash: z3.string().regex(/^[0-9a-f]{64}$/i),
      scriptSrc: z3.string().url().optional(),
      inline: z3.boolean().default(false)
    });
    VariantBlockMarkerSchema = z3.object({
      sessionId: z3.string().min(1),
      targetId: z3.string().min(1),
      wrappedAt: z3.string(),
      // ISO
      variantCount: z3.number().int().min(1).max(8),
      originalLines: z3.string()
      // base64 of the wrapped original snippet
    });
    StyleBlockMarkerSchema = z3.object({
      sessionId: z3.string().min(1),
      targetId: z3.string().min(1),
      // `@scope` selector base (without the `[data-wisp-variant="N"]` index).
      // Lets carbonize rewrite scope rules into permanent selectors targeting
      // the accepted variant's host.
      scopeBase: z3.string().min(1)
    });
    MarkerBlockSchema = z3.object({
      startLine: z3.number().int().min(0),
      endLine: z3.number().int().min(0),
      startOffset: z3.number().int().min(0),
      endOffset: z3.number().int().min(0),
      group: MarkerGroupSchema,
      // Parsed `k=v` pairs from the OPEN marker. Decoded via `decodeURIComponent`.
      payload: z3.record(z3.string(), z3.string())
    });
    InjectOptionsSchema = z3.object({
      bridgeUrl: z3.string().url(),
      token: z3.string().uuid(),
      // If true, the marker payload sets `inline=true` and the injected element
      // is `<script>…inline body…</script>`; otherwise it's
      // `<script src="${bridgeUrl}/live.js?token=${token}">`. Inline form is used
      // by tests; production always uses the src form.
      inline: z3.boolean().default(false),
      // Where to splice the script tag. JSX/TSX: just inside `<head>` if present,
      // else at top of the file's first top-level JSX expression. HTML/Vue/Svelte:
      // before `</head>`. CSS: rejected by safetyCheck — CSS cannot host a script.
      preferredAnchor: z3.enum(["before-head-close", "after-head-open", "auto"]).default("auto"),
      // Optional caller-supplied injectId; useful for tests that need determinism.
      injectId: z3.string().min(1).optional()
    });
    AcceptOperationSchema = z3.object({
      filePath: z3.string().min(1),
      sessionId: z3.string().min(1),
      targetId: z3.string().min(1),
      variantId: z3.string().min(1),
      // The full variant CSS (the `@scope ([data-wisp-variant="N"]) { … }` body).
      // The agent supplies this; the engine does not re-fetch it.
      variantCss: z3.string(),
      // CSS-var overrides accumulated from slider tuning. Keys must match the
      // `--name` form; values are baked literal into the carbonized output.
      paramOverrides: z3.record(z3.string(), z3.string()).default({}),
      // If false: leave the `@scope` rule verbatim (debugging mode). Default true:
      // rewrite the rule into permanent selectors targeting the chosen variant's
      // host node.
      carbonize: z3.boolean().default(true),
      // Optional override of the auto-detected EOL convention. Default = detect.
      eolConvention: z3.enum(["\n", "\r\n", "\r"]).optional()
    });
    DiscardOperationSchema = z3.object({
      filePath: z3.string().min(1),
      sessionId: z3.string().min(1),
      targetId: z3.string().min(1)
    });
    SafetyErrorCodeSchema = z3.enum([
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
    UndoEntryKindSchema = z3.enum([
      "inject-script",
      "remove-script",
      "wrap-variants",
      "discard-variants",
      "accept-variant",
      "param-change",
      "safety-refused"
    ]);
    UndoEntrySchema = z3.object({
      ts: z3.string(),
      // ISO timestamp
      sessionId: z3.string().min(1),
      kind: UndoEntryKindSchema,
      filePath: z3.string().min(1),
      detail: z3.record(z3.string(), z3.unknown()).optional(),
      // Hex SHA256 of the file before / after the operation. `safety-refused`
      // entries omit both. `param-change` omits `afterHash` (the param change is
      // a runtime DOM update; no file mutation has happened yet).
      beforeSha256: z3.string().regex(/^[0-9a-f]{64}$/i).optional(),
      afterSha256: z3.string().regex(/^[0-9a-f]{64}$/i).optional()
    });
    WISP_INJECT_SCRIPT_ID = "wisp-design-live";
    WISP_INJECT_DATA_ATTRIBUTE = "data-wisp-inject";
    MAX_SOURCE_FILE_BYTES = 1048576;
    MAX_UNDO_LOG_BYTES = 10485760;
    GENERATED_MAGIC_COMMENT_REGEX = /^[\s\S]{0,200}@generated/i;
    REFUSE_LIST = [
      // Build / dependency / generated output directories.
      /[\/\\](node_modules|dist|build|out|\.next|\.nuxt|\.svelte-kit|coverage|__generated__|target)[\/\\]/i,
      // `.generated.<ext>` basename — auto-generated single files.
      /\.generated\.[a-z]+$/i,
      // `.git` internals.
      /[\/\\]\.git[\/\\]/i
    ];
  }
});

// src/source/undo-stack.ts
import { promises as fs } from "fs";
import { dirname as dirname2, isAbsolute as isAbsolute2, join, resolve as resolve5, sep as sep2 } from "path";
function sessionLogPath(sessionId2, projectRoot) {
  if (sessionId2.length === 0) {
    throw new Error("undo-stack: sessionId must not be empty");
  }
  if (sessionId2.includes("/") || sessionId2.includes("\\") || sessionId2 === "." || sessionId2 === "..") {
    throw new Error(
      `undo-stack: sessionId must not contain path separators, got "${sessionId2}"`
    );
  }
  const root = resolve5(projectRoot ?? DEFAULT_PROJECT_ROOT);
  return join(root, ".wisp", "sessions", `${sessionId2}.jsonl`);
}
async function ensureDir2(filePath) {
  await fs.mkdir(dirname2(filePath), { recursive: true });
}
async function append(entry, opts = {}) {
  const parsed = UndoEntrySchema.parse(entry);
  const path = sessionLogPath(parsed.sessionId, opts.projectRoot);
  const maxBytes = opts.maxBytes ?? MAX_UNDO_LOG_BYTES;
  await ensureDir2(path);
  await rotateIfTooLarge(parsed.sessionId, maxBytes, {
    projectRoot: opts.projectRoot
  });
  const line = JSON.stringify(parsed) + "\n";
  await fs.appendFile(path, line, { encoding: "utf8" });
}
async function rotateIfTooLarge(sessionId2, maxBytes, opts = {}) {
  const path = sessionLogPath(sessionId2, opts.projectRoot);
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
function sessionLogPathForTest(sessionId2, projectRoot) {
  return sessionLogPath(sessionId2, projectRoot);
}
var DEFAULT_PROJECT_ROOT;
var init_undo_stack = __esm({
  "src/source/undo-stack.ts"() {
    "use strict";
    init_source();
    DEFAULT_PROJECT_ROOT = process.cwd();
  }
});

// src/contracts/session.ts
import { z as z4 } from "zod";
var SessionEventKindSchema, SessionEventEntrySchema, PolicyAxisSchema, PolicyProposalSchema, PolicyDocumentSchema, MORPH_T_MIN, MORPH_T_MAX, MorphVariableDiffSchema, MorphSourceSchema, MorphConfigSchema, StructureVariantKindSchema, STRUCTURE_VARIANT_RATIONALE_MAX_LEN, StructureVariantSpecSchema;
var init_session = __esm({
  "src/contracts/session.ts"() {
    "use strict";
    init_source();
    SessionEventKindSchema = z4.enum([
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
    SessionEventEntrySchema = z4.object({
      ts: z4.string(),
      // ISO timestamp
      sessionId: z4.string().min(1),
      kind: SessionEventKindSchema,
      filePath: z4.string().optional(),
      detail: z4.record(z4.string(), z4.unknown()).optional(),
      beforeSha256: z4.string().regex(/^[0-9a-f]{64}$/i).optional(),
      afterSha256: z4.string().regex(/^[0-9a-f]{64}$/i).optional()
    });
    PolicyAxisSchema = z4.enum([
      "hierarchy",
      "layout",
      "typography",
      "color",
      "density"
    ]);
    PolicyProposalSchema = z4.object({
      axis: PolicyAxisSchema,
      observation: z4.string().min(1),
      // human-readable: "3 high-density variants accepted in a row"
      proposed: z4.string().min(1),
      // proposed change: "add density: 'generous' to .wisp/policy.md"
      evidence: z4.array(
        z4.object({
          ts: z4.string(),
          variantId: z4.string().min(1),
          primaryAxis: PolicyAxisSchema
        })
      ),
      triggerThreshold: z4.number().int().min(2).default(3)
    });
    PolicyDocumentSchema = z4.object({
      axes: z4.record(PolicyAxisSchema, z4.string().min(1)).default({}),
      acceptedAt: z4.string(),
      source: z4.enum(["user-confirmed", "wisp-proposed-then-confirmed"])
    });
    MORPH_T_MIN = 0;
    MORPH_T_MAX = 1;
    MorphVariableDiffSchema = z4.object({
      name: z4.string().regex(/^--[a-z][a-z0-9-]*$/i, "must be a CSS custom property"),
      valueA: z4.string(),
      valueB: z4.string(),
      interpolatable: z4.boolean(),
      unit: z4.string().optional()
    });
    MorphSourceSchema = z4.object({
      variantIdA: z4.string().min(1),
      variantIdB: z4.string().min(1),
      // Auto-extracted diff of CSS-vars between A and B.
      variableDiff: z4.array(MorphVariableDiffSchema)
    });
    MorphConfigSchema = z4.object({
      source: MorphSourceSchema,
      t: z4.number().min(MORPH_T_MIN).max(MORPH_T_MAX),
      interpolatedCss: z4.string()
    });
    StructureVariantKindSchema = z4.enum([
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
    STRUCTURE_VARIANT_RATIONALE_MAX_LEN = 180;
    StructureVariantSpecSchema = z4.object({
      kind: StructureVariantKindSchema,
      rationale: z4.string().min(1).max(STRUCTURE_VARIANT_RATIONALE_MAX_LEN),
      // Full JSX subtree as a STRING — agent-emitted. Lives in a markdown-fenced
      // block during transport; the source-edit layer parses it as the raw
      // replacement payload.
      jsx: z4.string().min(1),
      // CSS to inject alongside (optional — purely structural variants may have
      // no CSS; tied to the JSX via the structure-variant-emitted log entry).
      css: z4.string().default("")
    });
  }
});

// src/session/logger.ts
var logger_exports = {};
__export(logger_exports, {
  _appendEntryForTest: () => appendEntry,
  ensureWispGitignored: () => ensureWispGitignored,
  resetGitignoreGuardForTest: () => resetGitignoreGuardForTest,
  sessionLogger: () => sessionLogger
});
import { promises as fs2 } from "fs";
import { dirname as dirname3, join as join2 } from "path";
async function ensureWispGitignored(projectRoot) {
  if (gitignoreEnsuredFor === projectRoot) return;
  gitignoreEnsuredFor = projectRoot;
  const giPath = join2(projectRoot, ".gitignore");
  try {
    const text = await fs2.readFile(giPath, "utf8").catch(() => "");
    const covered = text.split(/\r?\n/).map((l) => l.trim()).some((l) => l === ".wisp" || l === ".wisp/" || l === "/.wisp" || l === "/.wisp/");
    if (covered) return;
    const nl = text.length === 0 || text.endsWith("\n") ? "" : "\n";
    await fs2.appendFile(giPath, `${nl}# wisp-design session logs (auto-added \u2014 prevents dev-server reload loops)
.wisp
`, "utf8");
  } catch {
  }
}
function resetGitignoreGuardForTest() {
  gitignoreEnsuredFor = null;
}
async function appendEntry(entry, projectRoot) {
  const parsed = SessionEventEntrySchema.parse(entry);
  await ensureWispGitignored(projectRoot);
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
  await fs2.mkdir(dirname3(path), { recursive: true });
  const line = JSON.stringify(parsed) + "\n";
  await fs2.appendFile(path, line, { encoding: "utf8" });
}
function isUndoKind(kind) {
  return UNDO_KINDS.has(kind);
}
function nowIso() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
async function start(sessionId2, opts) {
  await appendEntry(
    {
      ts: nowIso(),
      sessionId: sessionId2,
      kind: "session-start",
      detail: { meta: opts.meta ?? { projectRoot: opts.projectRoot } }
    },
    opts.projectRoot
  );
}
async function end(sessionId2, opts) {
  await appendEntry(
    {
      ts: nowIso(),
      sessionId: sessionId2,
      kind: "session-end",
      detail: {}
    },
    opts.projectRoot
  );
}
async function logVariantsEmitted(sessionId2, evt, opts) {
  await appendEntry(
    {
      ts: nowIso(),
      sessionId: sessionId2,
      kind: "variants-emitted",
      detail: {
        targetId: evt.targetId,
        variants: evt.variants
      }
    },
    opts.projectRoot
  );
}
async function logAccept(sessionId2, evt, opts) {
  await appendEntry(
    {
      ts: nowIso(),
      sessionId: sessionId2,
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
async function logVerifyReport(sessionId2, evt, opts) {
  await appendEntry(
    {
      ts: nowIso(),
      sessionId: sessionId2,
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
async function logPick(sessionId2, evt, opts) {
  await appendEntry(
    {
      ts: nowIso(),
      sessionId: sessionId2,
      kind: "pick",
      detail: { selector: evt.selector, tag: evt.tag, targetId: evt.targetId }
    },
    opts.projectRoot
  );
}
async function logConfigure(sessionId2, evt, opts) {
  await appendEntry(
    {
      ts: nowIso(),
      sessionId: sessionId2,
      kind: "configure",
      detail: { targetId: evt.targetId, freeText: evt.freeText }
    },
    opts.projectRoot
  );
}
async function logCycleActiveChanged(sessionId2, evt, opts) {
  await appendEntry(
    {
      ts: nowIso(),
      sessionId: sessionId2,
      kind: "cycle-active-changed",
      detail: { fromIndex: evt.fromIndex, toIndex: evt.toIndex }
    },
    opts.projectRoot
  );
}
async function logParamChanged(sessionId2, evt, opts) {
  await appendEntry(
    {
      ts: nowIso(),
      sessionId: sessionId2,
      kind: "param-changed",
      detail: { varName: evt.varName, from: evt.from, to: evt.to }
    },
    opts.projectRoot
  );
}
async function logAnnotationAdded(sessionId2, evt, opts) {
  await appendEntry(
    {
      ts: nowIso(),
      sessionId: sessionId2,
      kind: "annotation-added",
      detail: {
        targetId: evt.targetId,
        annotationKind: evt.annotationKind,
        note: evt.note
      }
    },
    opts.projectRoot
  );
}
async function logPolicyProposalShown(sessionId2, evt, opts) {
  await appendEntry(
    {
      ts: nowIso(),
      sessionId: sessionId2,
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
async function logPolicyProposalAccepted(sessionId2, evt, opts) {
  await appendEntry(
    {
      ts: nowIso(),
      sessionId: sessionId2,
      kind: "policy-proposal-accepted",
      detail: { axis: evt.axis }
    },
    opts.projectRoot
  );
}
async function logPolicyProposalDeclined(sessionId2, evt, opts) {
  await appendEntry(
    {
      ts: nowIso(),
      sessionId: sessionId2,
      kind: "policy-proposal-declined",
      detail: { axis: evt.axis }
    },
    opts.projectRoot
  );
}
async function logMorphEngaged(sessionId2, evt, opts) {
  await appendEntry(
    {
      ts: nowIso(),
      sessionId: sessionId2,
      kind: "morph-engaged",
      detail: { variantIdA: evt.variantIdA, variantIdB: evt.variantIdB, t: evt.t }
    },
    opts.projectRoot
  );
}
async function logStructureVariantEmitted(sessionId2, evt, opts) {
  await appendEntry(
    {
      ts: nowIso(),
      sessionId: sessionId2,
      kind: "structure-variant-emitted",
      detail: { targetId: evt.targetId, kinds: evt.kinds }
    },
    opts.projectRoot
  );
}
async function logComponentLibDetected(sessionId2, evt, opts) {
  await appendEntry(
    {
      ts: nowIso(),
      sessionId: sessionId2,
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
var gitignoreEnsuredFor, UNDO_KINDS, sessionLogger;
var init_logger = __esm({
  "src/session/logger.ts"() {
    "use strict";
    init_undo_stack();
    init_session();
    init_undo_stack();
    gitignoreEnsuredFor = null;
    UNDO_KINDS = /* @__PURE__ */ new Set([
      "inject-script",
      "remove-script",
      "wrap-variants",
      "discard-variants",
      "accept-variant",
      "param-change",
      "safety-refused"
    ]);
    sessionLogger = {
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
      logAnnotationAdded,
      logPolicyProposalShown,
      logPolicyProposalAccepted,
      logPolicyProposalDeclined,
      logMorphEngaged,
      logStructureVariantEmitted,
      logComponentLibDetected
    };
  }
});

// src/contracts/agent.ts
import { z as z5 } from "zod";
var POLL_LOOP_DEFAULT_TIMEOUT_MS, POLL_LOOP_DEFAULT_LEASE_MS, POLL_LOOP_MIN_TIMEOUT_MS, DEFAULT_SKILLS_NAMESPACE, VARIANT_AXES, VariantAxisSchema, PollTransportSchema, PollOnceOptionsSchema, VoiceDistanceSchema, VoiceTemperatureSchema, VisualDirectionSchema, ALLOWED_VARIANT_ANCHORS, VariantAnchorSchema, PaletteModeSchema, BrandSpecSchema, DesignTokensSchema, ComponentLibSchema, SkillsIndexOptionsSchema, SkillsIndexResultSchema, SkillsSearchOptionsSchema, SkillsSearchResultSchema, SyncSourceSchema;
var init_agent = __esm({
  "src/contracts/agent.ts"() {
    "use strict";
    POLL_LOOP_DEFAULT_TIMEOUT_MS = 27e4;
    POLL_LOOP_DEFAULT_LEASE_MS = 3e4;
    POLL_LOOP_MIN_TIMEOUT_MS = 1e3;
    DEFAULT_SKILLS_NAMESPACE = "wisp-design";
    VARIANT_AXES = [
      "hierarchy",
      // size/weight relationships, primary action prominence
      "layout",
      // arrangement, density grid, spacing, alignment
      "typography",
      // family pairing, scale, leading
      "color",
      // accent role, semantic colour, surface treatment
      "density"
      // padding/margin scale, breathing room, information density
    ];
    VariantAxisSchema = z5.enum(VARIANT_AXES);
    PollTransportSchema = z5.enum(["sse", "long-poll"]);
    PollOnceOptionsSchema = z5.object({
      bridgeUrl: z5.string().url(),
      token: z5.string().uuid(),
      timeoutMs: z5.number().int().min(POLL_LOOP_MIN_TIMEOUT_MS).max(POLL_LOOP_DEFAULT_TIMEOUT_MS).default(POLL_LOOP_DEFAULT_TIMEOUT_MS),
      leaseMs: z5.number().int().min(1e3).default(POLL_LOOP_DEFAULT_LEASE_MS),
      cursor: z5.string().optional(),
      transport: PollTransportSchema.default("long-poll")
    });
    VoiceDistanceSchema = z5.enum([
      "intimate",
      "conversational",
      "formal"
    ]);
    VoiceTemperatureSchema = z5.enum(["warm", "cool", "neutral"]);
    VisualDirectionSchema = z5.enum([
      "editorial",
      "modern-minimal",
      "tech-utility",
      "brutalist",
      "soft-warm"
    ]);
    ALLOWED_VARIANT_ANCHORS = [
      "linear",
      "stripe",
      "anthropic",
      "aceternity",
      "apple",
      "vercel",
      "raycast",
      "notion",
      "github",
      "tailwind-ui",
      "shadcn-default",
      "shadcn-soft",
      "shadcn-bold"
    ];
    VariantAnchorSchema = z5.enum(ALLOWED_VARIANT_ANCHORS);
    PaletteModeSchema = z5.enum(["oklch", "hsl", "hex"]);
    BrandSpecSchema = z5.object({
      name: z5.string().min(1),
      oneLiner: z5.string().min(1).max(280),
      audience: z5.array(z5.string().min(1)).default([]),
      voice: z5.object({
        tone: z5.string().min(1),
        distance: VoiceDistanceSchema,
        temperature: VoiceTemperatureSchema
      }).optional(),
      visualDirection: VisualDirectionSchema.optional(),
      variantAnchor: VariantAnchorSchema.optional(),
      palette: z5.object({
        mode: PaletteModeSchema,
        // Keys are role tokens (`bg`, `fg`, `accent`, `muted`, …); values are
        // literal strings in the declared `mode`. The variant prompt prefers
        // these over sampled colors when both are present.
        values: z5.record(z5.string().min(1), z5.string().min(1))
      }).optional(),
      typeScale: z5.object({
        baseSize: z5.number().positive(),
        step: z5.number().positive().default(1.333)
      }).optional(),
      motion: z5.object({
        // Common keys: `--ease-smooth`, `--ease-sharp`, `--ease-spring`, `--ease-power`.
        // Free-form so brand-asset-extract can store proprietary easings.
        tokens: z5.record(z5.string().min(1), z5.string().min(1))
      }).optional(),
      brandAssets: z5.object({
        logo: z5.string().min(1).optional(),
        wordmark: z5.string().min(1).optional()
      }).optional()
    });
    DesignTokensSchema = z5.object({
      extractedAt: z5.string(),
      spacing: z5.array(z5.number().nonnegative()).default([]),
      radii: z5.array(z5.number().nonnegative()).default([]),
      fontSizes: z5.array(z5.number().positive()).default([]),
      fontWeights: z5.array(z5.number().int().positive()).default([]),
      colors: z5.array(z5.string().min(1)).default([]),
      fontFamilies: z5.array(z5.string().min(1)).default([]),
      zIndex: z5.array(z5.number().int()).default([])
    });
    ComponentLibSchema = z5.enum([
      "shadcn",
      "radix",
      "mui",
      "tailwind",
      "vanilla"
    ]);
    SkillsIndexOptionsSchema = z5.object({
      skillsRoot: z5.string().min(1),
      namespace: z5.string().min(1).default(DEFAULT_SKILLS_NAMESPACE)
    });
    SkillsIndexResultSchema = z5.object({
      indexedFiles: z5.number().int().nonnegative(),
      // Counts per sub-namespace (`anchors`, `directions`, `corpus`, `patterns`,
      // `policy`, `methodology`, `reference`). Lets `doctor` warn when a slice
      // is missing.
      byNamespace: z5.record(z5.string(), z5.number().int().nonnegative()),
      durationMs: z5.number().nonnegative(),
      // The AgentDB controller key the corpus was indexed under. Searches MUST
      // pass the same key to retrieve consistent results.
      agentDbController: z5.string().min(1)
    });
    SkillsSearchOptionsSchema = z5.object({
      topK: z5.number().int().min(1).max(50).default(8),
      namespace: z5.string().min(1).default(DEFAULT_SKILLS_NAMESPACE)
    });
    SkillsSearchResultSchema = z5.object({
      filePath: z5.string().min(1),
      score: z5.number(),
      snippet: z5.string(),
      namespace: z5.string().min(1)
    });
    SyncSourceSchema = z5.object({
      fromPath: z5.string().min(1),
      patterns: z5.array(z5.string().min(1)).default(["**/*.md"]),
      // Destination is fixed; the schema literal lets the doctor check that
      // `wisp-design sync` is correctly wired without re-reading config.
      destination: z5.literal("skills/data/patterns/"),
      attribution: z5.object({
        owner: z5.string().min(1),
        license: z5.string().min(1)
      }).optional()
    });
  }
});

// src/agent/poll-loop.ts
var poll_loop_exports = {};
__export(poll_loop_exports, {
  BridgeRequestError: () => BridgeRequestError,
  pollOnce: () => pollOnce,
  postEvent: () => postEvent,
  routeEvent: () => routeEvent,
  runPollOnce: () => runPollOnce,
  runPostEvent: () => runPostEvent
});
async function pollOnce(opts) {
  const parsed = PollOnceOptionsSchema.parse(opts);
  if (parsed.transport === "sse") {
    throw new Error(
      "pollOnce: transport=sse is browser-only; the agent loop uses long-poll"
    );
  }
  const url = buildPollUrl(parsed);
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    parsed.timeoutMs + ABORT_HEADROOM_MS
  );
  let res;
  try {
    res = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: { Accept: "application/json" }
    });
  } catch (err) {
    if (err.name === "AbortError") {
      throw new BridgeRequestError(
        "TIMEOUT",
        `pollOnce aborted after ${parsed.timeoutMs + ABORT_HEADROOM_MS}ms`
      );
    }
    throw new BridgeRequestError(
      "FETCH_FAILED",
      `pollOnce fetch failed: ${err.message}`
    );
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    const body = await safeReadBody(res);
    throw new BridgeRequestError(
      `HTTP_${res.status}`,
      `pollOnce: bridge returned ${res.status}`,
      body
    );
  }
  const json = await res.json();
  const parsedBody = parseLongPollResponse(json);
  const shouldRetry = parsedBody.events.length === 0 || // Belt-and-suspenders: even if events were delivered, if the wall-clock
  // is within 1s of the caller's deadline we likely sliced.
  Date.now() - parsedBody.slicedAt < 1e3 && parsed.timeoutMs >= POLL_LOOP_DEFAULT_TIMEOUT_MS;
  return {
    events: parsedBody.events,
    cursor: parsedBody.cursor,
    slicedAt: parsedBody.slicedAt,
    shouldRetry
  };
}
function buildPollUrl(opts) {
  const u = new URL(`${opts.bridgeUrl.replace(/\/+$/, "")}/poll`);
  u.searchParams.set("token", opts.token);
  u.searchParams.set("timeout", String(opts.timeoutMs));
  u.searchParams.set("leaseMs", String(opts.leaseMs));
  if (opts.cursor !== void 0 && opts.cursor.length > 0) {
    u.searchParams.set("cursor", opts.cursor);
  }
  return u.toString();
}
function parseLongPollResponse(raw) {
  if (typeof raw !== "object" || raw === null) {
    throw new BridgeRequestError(
      "BAD_RESPONSE",
      "pollOnce: bridge response was not an object"
    );
  }
  const obj = raw;
  const events = obj["events"];
  const cursor = obj["cursor"];
  const slicedAt = obj["slicedAt"];
  if (!Array.isArray(events) || typeof cursor !== "string" || typeof slicedAt !== "number") {
    throw new BridgeRequestError(
      "BAD_RESPONSE",
      "pollOnce: bridge response missing events/cursor/slicedAt"
    );
  }
  const validated = [];
  for (const ev of events) {
    const v = BridgeEventSchema.safeParse(ev);
    if (!v.success) {
      throw new BridgeRequestError(
        "BAD_RESPONSE",
        `pollOnce: event failed schema: ${v.error.issues.map((i) => i.message).join("; ")}`
      );
    }
    validated.push(v.data);
  }
  return { events: validated, cursor, slicedAt };
}
async function postEvent(opts) {
  if (opts.bridgeUrl === "" || opts.token === "") {
    throw new BridgeRequestError(
      "BAD_REQUEST",
      "postEvent: bridgeUrl and token are required"
    );
  }
  const eventCheck = BridgeEventSchema.safeParse(opts.event);
  if (!eventCheck.success) {
    throw new BridgeRequestError(
      "BAD_REQUEST",
      "postEvent: event failed schema validation",
      eventCheck.error.issues
    );
  }
  const url = new URL(`${opts.bridgeUrl.replace(/\/+$/, "")}/events`);
  url.searchParams.set("token", opts.token);
  let res;
  try {
    res = await fetch(url.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify(opts.event)
    });
  } catch (err) {
    throw new BridgeRequestError(
      "FETCH_FAILED",
      `postEvent fetch failed: ${err.message}`
    );
  }
  if (!res.ok) {
    const body = await safeReadBody(res);
    throw new BridgeRequestError(
      `HTTP_${res.status}`,
      `postEvent: bridge returned ${res.status}`,
      body
    );
  }
  const json = await res.json();
  const cursor = parsePostEventResponse(json);
  return { ok: true, cursor };
}
function parsePostEventResponse(raw) {
  if (typeof raw !== "object" || raw === null) {
    throw new BridgeRequestError(
      "BAD_RESPONSE",
      "postEvent: bridge response was not an object"
    );
  }
  const obj = raw;
  if (typeof obj["cursor"] !== "string") {
    throw new BridgeRequestError(
      "BAD_RESPONSE",
      "postEvent: bridge response missing cursor"
    );
  }
  return obj["cursor"];
}
async function safeReadBody(res) {
  try {
    return await res.json();
  } catch {
    try {
      return await res.text();
    } catch {
      return void 0;
    }
  }
}
function routeEvent(evt) {
  let action;
  switch (evt.kind) {
    // `generating` is the live browser trigger for variant generation (the
    // browser POSTs it on configure-submit — see src/browser/index.ts:496 +
    // src/browser/state-machine.ts:218). `configure` is a legacy alias kept
    // for back-compat with scripted POSTs against the older vocabulary; the
    // browser no longer emits it. If the browser vocabulary changes, revisit
    // this switch + skills/wisp-design/SKILL.md row 39 + docs/agent-loop.md
    // together (Bug #22).
    case "generating":
    case "configure":
      action = "generate-variants";
      break;
    case "accept":
      action = "write-accept";
      break;
    case "discard":
      action = "clean-discard";
      break;
    case "annotation":
      action = "log-annotation";
      break;
    case "pick":
    case "cycling":
    case "parameter-change":
    case "heartbeat":
    case "error":
      action = "ignore";
      break;
    default: {
      const _exhaustive = evt;
      void _exhaustive;
      action = "ignore";
    }
  }
  return { action, source: evt };
}
async function runPollOnce(args) {
  const parsed = parseFlags(args);
  const timeoutMs = flagAsNumber(parsed, "timeout") ?? POLL_LOOP_DEFAULT_TIMEOUT_MS;
  const leaseMs = flagAsNumber(parsed, "lease") ?? POLL_LOOP_DEFAULT_LEASE_MS;
  const cursor = flagAsString(parsed, "cursor");
  const transportRaw = flagAsString(parsed, "transport") ?? "long-poll";
  if (transportRaw !== "long-poll" && transportRaw !== "sse") {
    writeError({
      code: "BAD_FLAG",
      message: `--transport must be "long-poll" or "sse"; got "${transportRaw}"`
    });
    return EXIT_ARG;
  }
  if (timeoutMs < POLL_LOOP_MIN_TIMEOUT_MS) {
    writeError({
      code: "BAD_FLAG",
      message: `--timeout must be >= ${POLL_LOOP_MIN_TIMEOUT_MS}ms; got ${timeoutMs}`
    });
    return EXIT_ARG;
  }
  if (timeoutMs > POLL_LOOP_DEFAULT_TIMEOUT_MS) {
    writeError({
      code: "BAD_FLAG",
      message: `--timeout must be <= ${POLL_LOOP_DEFAULT_TIMEOUT_MS}ms; got ${timeoutMs}`
    });
    return EXIT_ARG;
  }
  if (leaseMs < 1e3) {
    writeError({
      code: "BAD_FLAG",
      message: `--lease must be >= 1000ms; got ${leaseMs}`
    });
    return EXIT_ARG;
  }
  let bridge;
  try {
    bridge = await readPortLock(process.cwd());
  } catch (err) {
    if (err instanceof PortLockMissingError || err instanceof PortLockStaleError) {
      writeError({ code: "BRIDGE_NOT_RUNNING", message: err.message });
      return EXIT_IO;
    }
    writeError({
      code: "PORT_LOCK_READ_FAILED",
      message: err.message
    });
    return EXIT_IO;
  }
  const options = {
    bridgeUrl: bridge.bridgeUrl,
    token: bridge.token,
    timeoutMs,
    leaseMs,
    cursor: cursor ?? void 0,
    transport: transportRaw
  };
  try {
    const result = await pollOnce(options);
    writeJsonResult(result);
    return EXIT_OK;
  } catch (err) {
    if (err instanceof BridgeRequestError) {
      writeError({ code: err.code, message: err.message, detail: err.detail });
      return EXIT_HTTP;
    }
    writeError({
      code: "POLL_ONCE_FAILED",
      message: err.message
    });
    return EXIT_HTTP;
  }
}
async function runPostEvent(args) {
  const parsed = parseFlags(args);
  const eventJson = flagAsString(parsed, "event");
  const kind = flagAsString(parsed, "kind");
  const payloadJson = flagAsString(parsed, "payload");
  let candidate;
  if (eventJson !== void 0) {
    try {
      candidate = JSON.parse(eventJson);
    } catch (err) {
      writeError({
        code: "BAD_FLAG",
        message: `--event must be valid JSON: ${err.message}`
      });
      return EXIT_ARG;
    }
  } else if (kind !== void 0 && payloadJson !== void 0) {
    let payload;
    try {
      payload = JSON.parse(payloadJson);
    } catch (err) {
      writeError({
        code: "BAD_FLAG",
        message: `--payload must be valid JSON: ${err.message}`
      });
      return EXIT_ARG;
    }
    if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
      writeError({
        code: "BAD_FLAG",
        message: "--payload must be a JSON object"
      });
      return EXIT_ARG;
    }
    candidate = { kind, ...payload };
  } else {
    writeError({
      code: "BAD_FLAG",
      message: "post-event requires --event <json> OR (--kind K --payload <json>)"
    });
    return EXIT_ARG;
  }
  const validated = BridgeEventSchema.safeParse(candidate);
  if (!validated.success) {
    writeError({
      code: "BAD_EVENT",
      message: "event failed schema validation",
      detail: validated.error.issues
    });
    return EXIT_ARG;
  }
  let bridge;
  try {
    bridge = await readPortLock(process.cwd());
  } catch (err) {
    if (err instanceof PortLockMissingError || err instanceof PortLockStaleError) {
      writeError({ code: "BRIDGE_NOT_RUNNING", message: err.message });
      return EXIT_IO;
    }
    writeError({
      code: "PORT_LOCK_READ_FAILED",
      message: err.message
    });
    return EXIT_IO;
  }
  try {
    const result = await postEvent({
      bridgeUrl: bridge.bridgeUrl,
      token: bridge.token,
      event: validated.data
    });
    writeJsonResult(result);
    return EXIT_OK;
  } catch (err) {
    if (err instanceof BridgeRequestError) {
      writeError({ code: err.code, message: err.message, detail: err.detail });
      return EXIT_HTTP;
    }
    writeError({
      code: "POST_EVENT_FAILED",
      message: err.message
    });
    return EXIT_HTTP;
  }
}
var ABORT_HEADROOM_MS, BridgeRequestError;
var init_poll_loop = __esm({
  "src/agent/poll-loop.ts"() {
    "use strict";
    init_agent();
    init_bridge();
    init_helpers();
    ABORT_HEADROOM_MS = 5e3;
    BridgeRequestError = class extends Error {
      constructor(code, message, detail) {
        super(message);
        this.code = code;
        this.detail = detail;
      }
      code;
      detail;
      name = "BridgeRequestError";
    };
  }
});

// src/source/carbonize.ts
function carbonize(css, opts) {
  const stripped = stripComments(css);
  const trimmed = stripped.trim();
  if (trimmed === "") return "";
  const root = parseRule(trimmed, 0);
  if (root === null) {
    throw new Error("carbonize: empty input after comment-strip");
  }
  if (!root.rule.selector.startsWith("@scope")) {
    throw new Error(
      `carbonize: expected @scope rule, got "${root.rule.selector.slice(0, 40)}"`
    );
  }
  const scopeVars = collectScopeVars(root.rule);
  const merged = { ...scopeVars, ...opts.paramOverrides };
  const lines = [];
  for (const child of root.rule.children) {
    if (child.kind === "rule") {
      if (child.selector === ":scope") {
        const nonVarDecls = [];
        for (const decl of child.children) {
          if (decl.kind !== "decl") continue;
          const clean = decl.text.replace(/;\s*$/, "").trim();
          if (clean === "") continue;
          const idx = clean.indexOf(":");
          if (idx === -1) continue;
          const prop = clean.slice(0, idx).trim();
          if (prop.startsWith("--")) continue;
          const baked = bakeDeclaration(decl.text, merged);
          if (baked !== null) nonVarDecls.push(`  ${baked};`);
        }
        if (nonVarDecls.length > 0) {
          lines.push(`${opts.scopeSelector} {`);
          for (const d of nonVarDecls) lines.push(d);
          lines.push(`}`);
        }
        continue;
      }
      emitRule(child, opts.scopeSelector, merged, lines, 0);
    } else {
      lines.push(`${opts.scopeSelector} { ${child.text} }`);
    }
  }
  return lines.join("\n") + (lines.length > 0 ? "\n" : "");
}
function stripComments(input) {
  let out = "";
  let i = 0;
  let quote = null;
  while (i < input.length) {
    const ch = input[i];
    if (quote !== null) {
      out += ch;
      if (ch === "\\" && i + 1 < input.length) {
        out += input[i + 1];
        i += 2;
        continue;
      }
      if (ch === quote) quote = null;
      i += 1;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      out += ch;
      i += 1;
      continue;
    }
    if (ch === "/" && input[i + 1] === "*") {
      const end2 = input.indexOf("*/", i + 2);
      if (end2 === -1) return out;
      i = end2 + 2;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}
function parseRule(input, from) {
  let i = skipWs(input, from);
  if (i >= input.length) return null;
  const selStart = i;
  let quote = null;
  let parenDepth = 0;
  while (i < input.length) {
    const ch = input[i];
    if (quote !== null) {
      if (ch === "\\" && i + 1 < input.length) {
        i += 2;
        continue;
      }
      if (ch === quote) quote = null;
      i += 1;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      i += 1;
      continue;
    }
    if (ch === "(") {
      parenDepth += 1;
      i += 1;
      continue;
    }
    if (ch === ")") {
      parenDepth = Math.max(0, parenDepth - 1);
      i += 1;
      continue;
    }
    if (ch === "{" && parenDepth === 0) break;
    if (ch === ";" && parenDepth === 0) {
      const sel = input.slice(selStart, i).trim();
      if (sel === "") return parseRule(input, i + 1);
      return { rule: { selector: sel, children: [], isAtMedia: false }, end: i + 1 };
    }
    i += 1;
  }
  if (i >= input.length) {
    throw new Error(
      `carbonize: unterminated rule starting at offset ${selStart} (expected "{")`
    );
  }
  const selector = input.slice(selStart, i).trim();
  const isAtMedia = selector.startsWith("@media") || selector.startsWith("@supports");
  i += 1;
  const children = [];
  while (true) {
    i = skipWs(input, i);
    if (i >= input.length) {
      throw new Error("carbonize: unterminated block (missing `}`)");
    }
    if (input[i] === "}") {
      i += 1;
      break;
    }
    if (looksLikeRule(input, i)) {
      const nested = parseRule(input, i);
      if (nested === null) break;
      children.push({
        kind: "rule",
        selector: nested.rule.selector,
        children: nested.rule.children,
        isAtMedia: nested.rule.isAtMedia
      });
      i = nested.end;
    } else {
      const declStart = i;
      let q = null;
      while (i < input.length) {
        const ch = input[i];
        if (q !== null) {
          if (ch === "\\" && i + 1 < input.length) {
            i += 2;
            continue;
          }
          if (ch === q) q = null;
          i += 1;
          continue;
        }
        if (ch === '"' || ch === "'") {
          q = ch;
          i += 1;
          continue;
        }
        if (ch === ";") {
          i += 1;
          break;
        }
        if (ch === "}") break;
        i += 1;
      }
      const declText = input.slice(declStart, i).trim();
      if (declText !== "") children.push({ kind: "decl", text: declText });
    }
  }
  return {
    rule: { selector, children, isAtMedia },
    end: i
  };
}
function looksLikeRule(input, from) {
  let i = from;
  let q = null;
  let parenDepth = 0;
  while (i < input.length) {
    const ch = input[i];
    if (q !== null) {
      if (ch === "\\" && i + 1 < input.length) {
        i += 2;
        continue;
      }
      if (ch === q) q = null;
      i += 1;
      continue;
    }
    if (ch === '"' || ch === "'") {
      q = ch;
      i += 1;
      continue;
    }
    if (ch === "(") {
      parenDepth += 1;
      i += 1;
      continue;
    }
    if (ch === ")") {
      parenDepth = Math.max(0, parenDepth - 1);
      i += 1;
      continue;
    }
    if (parenDepth === 0) {
      if (ch === "{") return true;
      if (ch === ";" || ch === "}") return false;
    }
    i += 1;
  }
  return false;
}
function skipWs(input, from) {
  let i = from;
  while (i < input.length) {
    const ch = input[i];
    if (ch === " " || ch === "	" || ch === "\n" || ch === "\r") {
      i += 1;
      continue;
    }
    break;
  }
  return i;
}
function collectScopeVars(rootRule) {
  const out = {};
  for (const child of rootRule.children) {
    if (child.kind !== "rule") continue;
    if (child.selector !== ":scope") continue;
    for (const decl of child.children) {
      if (decl.kind !== "decl") continue;
      const idx = decl.text.indexOf(":");
      if (idx === -1) continue;
      const name = decl.text.slice(0, idx).trim();
      const value = decl.text.slice(idx + 1).trim().replace(/;$/, "").trim();
      if (name.startsWith("--")) out[name] = value;
    }
  }
  return out;
}
function bakeVars(value, vars, seen = /* @__PURE__ */ new Set()) {
  let out = "";
  let i = 0;
  while (i < value.length) {
    if (value.startsWith("var(", i)) {
      let depth = 1;
      let j = i + 4;
      while (j < value.length && depth > 0) {
        const ch = value[j];
        if (ch === "(") depth += 1;
        else if (ch === ")") depth -= 1;
        if (depth === 0) break;
        j += 1;
      }
      if (depth !== 0) {
        out += value.slice(i);
        return out;
      }
      const inner = value.slice(i + 4, j);
      const commaIdx = findTopLevelComma(inner);
      const rawName = (commaIdx === -1 ? inner : inner.slice(0, commaIdx)).trim();
      const fallback = commaIdx === -1 ? "" : inner.slice(commaIdx + 1).trim();
      if (rawName in vars && !seen.has(rawName)) {
        out += bakeVars(
          vars[rawName],
          vars,
          new Set(seen).add(rawName)
        );
      } else if (fallback !== "") {
        out += bakeVars(fallback, vars, seen);
      } else {
        out += value.slice(i, j + 1);
      }
      i = j + 1;
      continue;
    }
    out += value[i];
    i += 1;
  }
  return out;
}
function findTopLevelComma(s) {
  let depth = 0;
  let q = null;
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i];
    if (q !== null) {
      if (ch === "\\" && i + 1 < s.length) {
        i += 1;
        continue;
      }
      if (ch === q) q = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      q = ch;
      continue;
    }
    if (ch === "(") depth += 1;
    else if (ch === ")") depth -= 1;
    else if (ch === "," && depth === 0) return i;
  }
  return -1;
}
function rewriteSelector(selector, scopeSelector) {
  const groups = [];
  let depth = 0;
  let q = null;
  let start2 = 0;
  for (let i = 0; i < selector.length; i += 1) {
    const ch = selector[i];
    if (q !== null) {
      if (ch === "\\" && i + 1 < selector.length) {
        i += 1;
        continue;
      }
      if (ch === q) q = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      q = ch;
      continue;
    }
    if (ch === "(" || ch === "[") depth += 1;
    else if (ch === ")" || ch === "]") depth -= 1;
    else if (ch === "," && depth === 0) {
      groups.push(selector.slice(start2, i).trim());
      start2 = i + 1;
    }
  }
  groups.push(selector.slice(start2).trim());
  return groups.map((g) => rewriteSingleSelector(g, scopeSelector)).filter((g) => g !== "").join(", ");
}
function rewriteSingleSelector(sel, scopeSelector) {
  if (sel === "") return "";
  if (sel === ":scope") return scopeSelector;
  const pickedTag = extractTagFromScopeSelector(scopeSelector);
  if (pickedTag !== null) {
    const re = new RegExp(`^:scope\\s*>\\s*${pickedTag}(?![\\w-])`, "i");
    const m = sel.match(re);
    if (m !== null) {
      return `${scopeSelector}${sel.slice(m[0].length)}`;
    }
  }
  if (sel.startsWith(":scope")) return `${scopeSelector}${sel.slice(":scope".length)}`;
  if (pickedTag !== null) {
    const re = new RegExp(`^${pickedTag}(?=\\s|[>+~,:]|$)`, "i");
    const m = sel.match(re);
    if (m !== null) {
      const rest = sel.slice(m[0].length);
      if (rest === "") return scopeSelector;
      return `${scopeSelector}${rest}`;
    }
  }
  return `${scopeSelector} ${sel}`;
}
function extractTagFromScopeSelector(scopeSelector) {
  const trimmed = scopeSelector.trim();
  const m = trimmed.match(/^([a-zA-Z][a-zA-Z0-9-]*)/);
  return m !== null ? m[1].toLowerCase() : null;
}
function emitRule(rule, scopeSelector, vars, out, depth) {
  if (rule.isAtMedia) {
    const innerLines = [];
    for (const child of rule.children) {
      if (child.kind === "rule") {
        emitRule(child, scopeSelector, vars, innerLines, depth + 1);
      } else {
        innerLines.push(`${scopeSelector} { ${child.text}; }`);
      }
    }
    const pad2 = "  ".repeat(depth);
    out.push(`${pad2}${rule.selector} {`);
    for (const line of innerLines) out.push(`${pad2}  ${line}`);
    out.push(`${pad2}}`);
    return;
  }
  const newSel = rewriteSelector(rule.selector, scopeSelector);
  if (newSel === "") return;
  const decls = [];
  for (const child of rule.children) {
    if (child.kind === "decl") {
      const baked = bakeDeclaration(child.text, vars);
      if (baked !== null) decls.push(`  ${baked};`);
    } else {
      const combined = `${newSel} ${child.selector}`;
      const fake = {
        kind: "rule",
        selector: combined,
        children: child.children,
        isAtMedia: child.isAtMedia
      };
      emitRule(fake, "", vars, out, depth);
    }
  }
  if (decls.length === 0) return;
  const pad = "  ".repeat(depth);
  out.push(`${pad}${newSel} {`);
  for (const d of decls) out.push(`${pad}${d}`);
  out.push(`${pad}}`);
}
function bakeDeclaration(text, vars) {
  const clean = text.replace(/;\s*$/, "").trim();
  if (clean === "") return null;
  const idx = clean.indexOf(":");
  if (idx === -1) return null;
  const prop = clean.slice(0, idx).trim();
  const value = clean.slice(idx + 1).trim();
  const baked = bakeVars(value, vars);
  return `${prop}: ${baked}`;
}
var init_carbonize = __esm({
  "src/source/carbonize.ts"() {
    "use strict";
  }
});

// src/source/safety.ts
import {
  accessSync,
  constants as fsConstants,
  openSync,
  closeSync,
  readSync,
  realpathSync as realpathSync2,
  statSync
} from "fs";
import { extname, isAbsolute as isAbsolute3, normalize as normalize2, resolve as resolve6, sep as sep3 } from "path";
function detectEol(content) {
  for (let i = 0; i < content.length; i++) {
    const ch = content.charCodeAt(i);
    if (ch === 13) {
      if (i + 1 < content.length && content.charCodeAt(i + 1) === 10) {
        return "\r\n";
      }
      return "\r";
    }
    if (ch === 10) {
      return "\n";
    }
  }
  return "\n";
}
function makeError(code, message, suggestedFallback, detail) {
  const error = { code, message, suggestedFallback };
  if (detail !== void 0) error.detail = detail;
  return { ok: false, error };
}
function isDescendantOf(absPath, root) {
  if (absPath === root) return true;
  const rootWithSep = root.endsWith(sep3) ? root : `${root}${sep3}`;
  if (IS_WINDOWS2) {
    return absPath.toLowerCase().startsWith(rootWithSep.toLowerCase());
  }
  return absPath.startsWith(rootWithSep);
}
function checkPathInsideRoot(filePath, projectRoot) {
  if (typeof filePath !== "string" || filePath === "") {
    return makeError("PATH_OUTSIDE_ROOT", "empty file path", "skip", {
      requested: filePath
    });
  }
  const absRoot = resolve6(projectRoot);
  const resolved = isAbsolute3(filePath) ? resolve6(filePath) : resolve6(absRoot, filePath);
  if (normalize2(filePath).split(/[\\/]/).includes("..")) {
    return makeError("PATH_OUTSIDE_ROOT", "`..` segments are not allowed", "skip", {
      requested: filePath
    });
  }
  if (!isDescendantOf(resolved, absRoot)) {
    return makeError(
      "PATH_OUTSIDE_ROOT",
      "resolved path escapes project root",
      "skip",
      { requested: filePath, resolved, projectRoot: absRoot }
    );
  }
  return { ok: true, resolved, absRoot };
}
function checkSymlinkEscape(resolvedPath, absRoot) {
  let real;
  try {
    real = realpathSync2(resolvedPath);
  } catch (err) {
    const code = err.code;
    if (code === "ENOENT" || code === "ENOTDIR") return { ok: true };
    return { ok: true };
  }
  if (!isDescendantOf(real, absRoot)) {
    return makeError(
      "SYMLINK_ESCAPE",
      "symlink target escapes project root",
      "skip",
      { resolved: resolvedPath, real, projectRoot: absRoot }
    );
  }
  return { ok: true };
}
function checkRefuseList(resolvedPath) {
  for (const pattern of REFUSE_LIST) {
    if (pattern.test(resolvedPath)) {
      return makeError(
        "REFUSE_LIST_MATCH",
        "file is inside a refused directory or has a refused basename",
        "skip",
        { resolved: resolvedPath, matched: pattern.source }
      );
    }
  }
  return { ok: true };
}
function checkSupportedExtension(resolvedPath) {
  const ext = extname(resolvedPath).toLowerCase();
  const fileType = SUPPORTED_EXTENSIONS[ext];
  if (fileType === void 0) {
    return makeError(
      "UNSUPPORTED_FILE_TYPE",
      `extension "${ext}" is not in the supported list`,
      "agent-driven",
      { resolved: resolvedPath, extension: ext }
    );
  }
  return { ok: true, fileType };
}
function checkFileSize(resolvedPath) {
  let size;
  try {
    size = statSync(resolvedPath).size;
  } catch (err) {
    const code = err.code;
    if (code === "ENOENT" || code === "ENOTDIR") return { ok: true };
    return { ok: true };
  }
  if (size > MAX_SOURCE_FILE_BYTES) {
    return makeError(
      "FILE_TOO_LARGE",
      `file size ${size} exceeds limit of ${MAX_SOURCE_FILE_BYTES} bytes`,
      "agent-driven",
      { resolved: resolvedPath, size, limit: MAX_SOURCE_FILE_BYTES }
    );
  }
  return { ok: true };
}
function readHead(resolvedPath) {
  let fd;
  try {
    fd = openSync(resolvedPath, "r");
  } catch (err) {
    const code = err.code;
    if (code === "ENOENT" || code === "ENOTDIR") {
      return { bytes: Buffer.alloc(0), fileExists: false };
    }
    return { bytes: Buffer.alloc(0), fileExists: false };
  }
  const buf = Buffer.alloc(512);
  let bytesRead = 0;
  try {
    bytesRead = readSync(fd, buf, 0, 512, 0);
  } catch {
    bytesRead = 0;
  } finally {
    try {
      closeSync(fd);
    } catch {
    }
  }
  return { bytes: buf.subarray(0, bytesRead), fileExists: true };
}
function checkBinary(head) {
  for (let i = 0; i < head.length; i++) {
    if (head[i] === 0) {
      return makeError(
        "BINARY_FILE",
        "NULL byte detected in first 512 bytes \u2014 file appears binary",
        "skip",
        { nullByteOffset: i }
      );
    }
  }
  return { ok: true };
}
function checkGenerated(head) {
  if (head.length === 0) return { ok: true };
  const slice = head.subarray(0, Math.min(head.length, 200));
  const text = slice.toString("utf8");
  if (GENERATED_MAGIC_COMMENT_REGEX.test(text)) {
    return makeError(
      "GENERATED_MAGIC_COMMENT",
      "`@generated` magic comment in first 200 bytes",
      "manual",
      { firstBytes: text }
    );
  }
  return { ok: true };
}
function checkWritable(resolvedPath) {
  try {
    accessSync(resolvedPath, fsConstants.W_OK);
    return { ok: true };
  } catch (err) {
    const code = err.code;
    if (code === "ENOENT" || code === "ENOTDIR") return { ok: true };
    return makeError("READ_ONLY_FILE", "file is not writable", "manual", {
      resolved: resolvedPath,
      errno: code ?? "UNKNOWN"
    });
  }
}
async function safetyCheck(filePath, projectRoot) {
  const pathCheck = checkPathInsideRoot(filePath, projectRoot);
  if (!pathCheck.ok) return pathCheck;
  const symlinkCheck = checkSymlinkEscape(pathCheck.resolved, pathCheck.absRoot);
  if (!symlinkCheck.ok) return symlinkCheck;
  const refuseCheck = checkRefuseList(pathCheck.resolved);
  if (!refuseCheck.ok) return refuseCheck;
  const extCheck = checkSupportedExtension(pathCheck.resolved);
  if (!extCheck.ok) return extCheck;
  const sizeCheck = checkFileSize(pathCheck.resolved);
  if (!sizeCheck.ok) return sizeCheck;
  const head = readHead(pathCheck.resolved);
  const binaryCheck = checkBinary(head.bytes);
  if (!binaryCheck.ok) return binaryCheck;
  const generatedCheck = checkGenerated(head.bytes);
  if (!generatedCheck.ok) return generatedCheck;
  const writableCheck = checkWritable(pathCheck.resolved);
  if (!writableCheck.ok) return writableCheck;
  const eolConvention = head.bytes.length > 0 ? detectEol(head.bytes.toString("utf8")) : "\n";
  return {
    ok: true,
    filePath: pathCheck.resolved,
    fileType: extCheck.fileType,
    eolConvention
  };
}
var IS_WINDOWS2;
var init_safety = __esm({
  "src/source/safety.ts"() {
    "use strict";
    init_source();
    IS_WINDOWS2 = process.platform === "win32";
  }
});

// src/source/_helpers.ts
import { promises as fs3 } from "fs";
import { createHash } from "crypto";
import { extname as extname2 } from "path";
function detectEol2(content) {
  for (let i = 0; i < content.length; i += 1) {
    const ch = content[i];
    if (ch === "\n") return "\n";
    if (ch === "\r") {
      if (content[i + 1] === "\n") return "\r\n";
      return "\r";
    }
  }
  return "\n";
}
function canonicalize(content) {
  let s = content;
  if (s.charCodeAt(0) === 65279) s = s.slice(1);
  return s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}
function applyEol(content, eol) {
  if (eol === "\n") return content;
  return content.replace(/\n/g, eol);
}
function sha256Hex(s) {
  const h = createHash("sha256");
  h.update(typeof s === "string" ? Buffer.from(s, "utf8") : s);
  return h.digest("hex");
}
function sha256First256Bytes(s) {
  const buf = Buffer.from(s, "utf8");
  return sha256Hex(buf.slice(0, 256));
}
function serializeMarkerBody(kind, payload) {
  const parts = [];
  for (const [k, v] of Object.entries(payload)) {
    const sv = typeof v === "boolean" ? v ? "true" : "false" : String(v);
    parts.push(`${k}=${encodeURIComponent(sv)}`);
  }
  return `wisp-${kind}:${parts.join(" ")}`;
}
function parseMarkerBody(body) {
  let s = body.trim();
  if (s.startsWith("wisp-")) s = s.slice("wisp-".length);
  const colonIdx = s.indexOf(":");
  if (colonIdx === -1) return { kind: null, payload: {}, raw: body };
  const kindRaw = s.slice(0, colonIdx).trim();
  const rest = s.slice(colonIdx + 1).trim();
  if (!MARKER_KIND_VALUES.has(kindRaw)) {
    return { kind: null, payload: {}, raw: body };
  }
  const kind = kindRaw;
  const payload = {};
  if (rest !== "") {
    const tokens = rest.split(/\s+/);
    for (const tok of tokens) {
      if (tok === "") continue;
      const eqIdx = tok.indexOf("=");
      if (eqIdx === -1) {
        payload[tok] = "";
        continue;
      }
      const k = tok.slice(0, eqIdx);
      const v = tok.slice(eqIdx + 1);
      try {
        payload[k] = decodeURIComponent(v);
      } catch {
        payload[k] = v;
      }
    }
  }
  return { kind, payload };
}
function groupOfKind(kind) {
  if (kind === "inject-start" || kind === "inject-end") return "inject";
  if (kind === "variants-start" || kind === "variants-end") return "variants";
  return "style";
}
function findMarkerBlock(content, fileType, group, filter = {}) {
  const pattern = new RegExp(MARKER_SYNTAX[fileType].pattern.source, "");
  const lines = content.split("\n");
  const lineOffsets = new Array(lines.length);
  let cursor = 0;
  for (let i = 0; i < lines.length; i += 1) {
    lineOffsets[i] = cursor;
    cursor += lines[i].length + 1;
  }
  let openLine = -1;
  let openOffset = -1;
  let openPayload = {};
  let depth = 0;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const m = pattern.exec(line);
    if (!m) continue;
    const bodyMatch = m[1];
    if (bodyMatch === void 0) continue;
    const parsed = parseMarkerBody(bodyMatch);
    if (parsed.kind === null) continue;
    if (groupOfKind(parsed.kind) !== group) continue;
    if (parsed.kind.endsWith("-start")) {
      if (openLine === -1) {
        if (filter.sessionId !== void 0 && parsed.payload.sessionId !== filter.sessionId) {
          continue;
        }
        if (filter.targetId !== void 0 && parsed.payload.targetId !== filter.targetId) {
          continue;
        }
        openLine = i;
        openOffset = lineOffsets[i];
        openPayload = parsed.payload;
      }
      depth += 1;
    } else {
      if (openLine === -1) continue;
      depth -= 1;
      if (depth === 0) {
        const endLine = i;
        const nextStart = i + 1 < lines.length ? lineOffsets[i + 1] : content.length;
        return {
          startLine: openLine,
          endLine,
          startOffset: openOffset,
          endOffset: nextStart,
          group,
          payload: openPayload
        };
      }
    }
  }
  return null;
}
function expandReplaceRange(content, block, replacement, _eolConvention) {
  return content.slice(0, block.startOffset) + replacement + content.slice(block.endOffset);
}
async function atomicWrite(filePath, content) {
  const tmp = `${filePath}.wisp-tmp`;
  await fs3.writeFile(tmp, content, { encoding: "utf8" });
  await fs3.rename(tmp, filePath);
}
var MARKER_KIND_VALUES;
var init_helpers2 = __esm({
  "src/source/_helpers.ts"() {
    "use strict";
    init_source();
    MARKER_KIND_VALUES = /* @__PURE__ */ new Set([
      "inject-start",
      "inject-end",
      "variants-start",
      "variants-end",
      "style-start",
      "style-end"
    ]);
  }
});

// src/source/accept.ts
var accept_exports = {};
__export(accept_exports, {
  acceptModule: () => acceptModule,
  acceptVariant: () => acceptVariant,
  applyEol: () => applyEol,
  atomicWrite: () => atomicWrite,
  canonicalize: () => canonicalize,
  detectEol: () => detectEol2,
  expandReplaceRange: () => expandReplaceRange,
  extractVariant: () => extractVariant,
  findMarkerBlock: () => findMarkerBlock,
  parseMarkerBody: () => parseMarkerBody,
  randomUUID: () => randomUUID3,
  serializeMarkerBody: () => serializeMarkerBody,
  sha256First256Bytes: () => sha256First256Bytes,
  sha256Hex: () => sha256Hex
});
import { promises as fs4 } from "fs";
import { randomUUID as randomUUID3 } from "crypto";
function extractVariant(content, block, variantId) {
  const inner = content.slice(block.startOffset, block.endOffset);
  const cssText = extractStyleBlockText(inner);
  if (cssText === null) return null;
  const variantNeedle = `[data-wisp-variant="${variantId}"]`;
  const variantNeedleSq = `[data-wisp-variant='${variantId}']`;
  let i = 0;
  while (i < cssText.length) {
    const idx = cssText.indexOf("@scope", i);
    if (idx === -1) break;
    const openParen = cssText.indexOf("(", idx);
    if (openParen === -1) break;
    const closeParen = matchParen(cssText, openParen);
    if (closeParen === -1) break;
    const inside = cssText.slice(openParen + 1, closeParen).trim();
    if (inside === variantNeedle || inside === variantNeedleSq) {
      const braceOpen = cssText.indexOf("{", closeParen);
      if (braceOpen === -1) return null;
      const braceClose = matchBrace(cssText, braceOpen);
      if (braceClose === -1) return null;
      const body = cssText.slice(braceOpen + 1, braceClose).trim();
      return { css: body, cssVars: extractScopeCssVars(body) };
    }
    i = closeParen + 1;
  }
  return null;
}
function extractStyleBlockText(inner) {
  const openIdx = inner.indexOf("<style");
  if (openIdx === -1) return null;
  const openTagEnd = inner.indexOf(">", openIdx);
  if (openTagEnd === -1) return null;
  const closeIdx = inner.indexOf("</style>", openTagEnd);
  if (closeIdx === -1) return null;
  const raw = inner.slice(openTagEnd + 1, closeIdx);
  let s = raw.trim();
  if (s.startsWith("{") && s.endsWith("}")) s = s.slice(1, -1).trim();
  if (s.startsWith("`") && s.endsWith("`")) s = s.slice(1, -1);
  return s;
}
function matchParen(s, openIdx) {
  let depth = 0;
  let q = null;
  for (let i = openIdx; i < s.length; i += 1) {
    const ch = s[i];
    if (q !== null) {
      if (ch === "\\" && i + 1 < s.length) {
        i += 1;
        continue;
      }
      if (ch === q) q = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      q = ch;
      continue;
    }
    if (ch === "(") depth += 1;
    else if (ch === ")") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}
function matchBrace(s, openIdx) {
  let depth = 0;
  let q = null;
  for (let i = openIdx; i < s.length; i += 1) {
    const ch = s[i];
    if (q !== null) {
      if (ch === "\\" && i + 1 < s.length) {
        i += 1;
        continue;
      }
      if (ch === q) q = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      q = ch;
      continue;
    }
    if (ch === "/" && s[i + 1] === "*") {
      const end2 = s.indexOf("*/", i + 2);
      if (end2 === -1) return -1;
      i = end2 + 1;
      continue;
    }
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}
function extractScopeCssVars(body) {
  const idx = body.indexOf(":scope");
  if (idx === -1) return {};
  const braceOpen = body.indexOf("{", idx);
  if (braceOpen === -1) return {};
  const braceClose = matchBrace(body, braceOpen);
  if (braceClose === -1) return {};
  const decls = body.slice(braceOpen + 1, braceClose);
  const out = {};
  for (const rawLine of decls.split(";")) {
    const line = rawLine.trim();
    if (line === "") continue;
    const c = line.indexOf(":");
    if (c === -1) continue;
    const name = line.slice(0, c).trim();
    const value = line.slice(c + 1).trim();
    if (name.startsWith("--")) out[name] = value;
  }
  return out;
}
async function acceptVariant(op, modOpts) {
  const parsed = AcceptOperationSchema.parse(op);
  const safety = await safetyCheck(
    parsed.filePath,
    modOpts.projectRoot
  );
  if (!safety.ok) {
    await append(
      {
        ts: (/* @__PURE__ */ new Date()).toISOString(),
        sessionId: parsed.sessionId,
        kind: "safety-refused",
        filePath: parsed.filePath,
        detail: {
          code: safety.error.code,
          suggestedFallback: safety.error.suggestedFallback ?? null,
          message: safety.error.message,
          operation: "accept-variant"
        }
      },
      { projectRoot: modOpts.projectRoot }
    );
    throw new Error(
      `acceptVariant: safety refused \u2014 ${safety.error.code}: ${safety.error.message}`
    );
  }
  const { fileType } = safety;
  const original = await fs4.readFile(parsed.filePath, { encoding: "utf8" });
  const beforeHash = sha256Hex(original);
  const eol = parsed.eolConvention ?? detectEol2(original);
  const canonical = canonicalize(original);
  const block = findMarkerBlock(canonical, fileType, "variants", {
    sessionId: parsed.sessionId,
    targetId: parsed.targetId
  });
  if (block === null) {
    throw new Error(
      `acceptVariant: no variants block for session=${parsed.sessionId} target=${parsed.targetId}`
    );
  }
  const extracted = extractVariant(canonical, block, parsed.variantId);
  const variantCss = extracted?.css ?? parsed.variantCss;
  if (variantCss.trim() === "") {
    throw new Error(
      `acceptVariant: variantId=${parsed.variantId} produced empty CSS`
    );
  }
  const scopeSelector = sanitizeScopeSelector(parsed.targetId);
  const emittedCss = parsed.carbonize ? carbonize(
    `@scope ([data-wisp-variant="${parsed.variantId}"]) {
${variantCss}
}`,
    { paramOverrides: parsed.paramOverrides, scopeSelector }
  ) : variantCss;
  const replacement = buildPermanentReplacement({
    fileType,
    sessionId: parsed.sessionId,
    targetId: parsed.targetId,
    emittedCss,
    originalLinesB64: block.payload.originalLines ?? ""
  });
  const next = expandReplaceRange(canonical, block, replacement, eol);
  const final = applyEol(next, eol);
  await atomicWrite(parsed.filePath, final);
  const afterHash = sha256Hex(final);
  await append(
    {
      ts: (/* @__PURE__ */ new Date()).toISOString(),
      sessionId: parsed.sessionId,
      kind: "accept-variant",
      filePath: parsed.filePath,
      beforeSha256: beforeHash,
      afterSha256: afterHash,
      detail: {
        targetId: parsed.targetId,
        variantId: parsed.variantId,
        paramOverrides: parsed.paramOverrides,
        carbonized: parsed.carbonize,
        byteSize: Buffer.byteLength(final, "utf8")
      }
    },
    { projectRoot: modOpts.projectRoot }
  );
  return {
    filePath: parsed.filePath,
    variantId: parsed.variantId,
    replacedStartLine: block.startLine,
    replacedEndLine: block.endLine,
    beforeHash,
    afterHash,
    emittedCss
  };
}
function buildPermanentReplacement(input) {
  let originalSnippet = "";
  if (input.originalLinesB64 !== "") {
    try {
      originalSnippet = Buffer.from(input.originalLinesB64, "base64").toString(
        "utf8"
      );
    } catch {
      originalSnippet = "";
    }
  }
  const cssBody = input.emittedCss.replace(/\n+$/, "");
  if (input.fileType === "tsx" || input.fileType === "jsx") {
    return [
      `<style data-wisp-permanent="${input.sessionId}">{\`${cssBody}\`}</style>`,
      originalSnippet
    ].filter((s) => s !== "").join("\n");
  }
  if (input.fileType === "css") {
    return [cssBody, originalSnippet].filter((s) => s !== "").join("\n");
  }
  return [
    `<style data-wisp-permanent="${input.sessionId}">${cssBody}</style>`,
    originalSnippet
  ].filter((s) => s !== "").join("\n");
}
function sanitizeScopeSelector(targetId) {
  const t = targetId.trim();
  if (!/^[A-Za-z0-9_\-\.#:\[\]"'\s>*,()=^$|~]+$/.test(t)) {
    throw new Error(
      `acceptVariant: targetId contains unsafe characters \u2014 ${JSON.stringify(t.slice(0, 40))}`
    );
  }
  return t;
}
var acceptModule;
var init_accept = __esm({
  "src/source/accept.ts"() {
    "use strict";
    init_source();
    init_carbonize();
    init_safety();
    init_undo_stack();
    init_helpers2();
    acceptModule = {
      acceptVariant,
      findMarkerBlock,
      extractVariant,
      expandReplaceRange
    };
  }
});

// src/source/wrap.ts
var wrap_exports = {};
__export(wrap_exports, {
  cleanupStaleWraps: () => cleanupStaleWraps,
  discardVariantBlock: () => discardVariantBlock,
  wrapModule: () => wrapModule,
  wrapVariantBlock: () => wrapVariantBlock
});
import { promises as fs5 } from "fs";
async function wrapVariantBlock(filePath, target, sessionId2, variantCount, modOpts) {
  const safety = await safetyCheck(filePath, modOpts.projectRoot);
  if (!safety.ok) {
    await append(
      {
        ts: (/* @__PURE__ */ new Date()).toISOString(),
        sessionId: sessionId2,
        kind: "safety-refused",
        filePath,
        detail: {
          code: safety.error.code,
          message: safety.error.message,
          suggestedFallback: safety.error.suggestedFallback ?? null,
          operation: "wrap-variants"
        }
      },
      { projectRoot: modOpts.projectRoot }
    );
    return {
      ok: false,
      reason: "safety_refused",
      ...safety.error.suggestedFallback !== void 0 ? { suggestedFallback: safety.error.suggestedFallback } : {},
      detail: { code: safety.error.code, message: safety.error.message }
    };
  }
  const { fileType } = safety;
  const original = await fs5.readFile(filePath, { encoding: "utf8" });
  const beforeHash = sha256Hex(original);
  const eol = detectEol2(original);
  const canonical = canonicalize(original);
  const span = locateTargetSpan(canonical, fileType, target.selector);
  if (span.kind === "not_found") {
    return {
      ok: false,
      reason: "target_not_found",
      suggestedFallback: "agent-driven",
      detail: { selector: target.selector }
    };
  }
  if (span.kind === "ambiguous") {
    return {
      ok: false,
      reason: "ambiguous_target",
      suggestedFallback: "agent-driven",
      detail: { selector: target.selector, matchCount: span.matchCount }
    };
  }
  if (span.kind === "dynamic_classname") {
    const line = span.line + 1;
    return {
      ok: false,
      reason: "dynamic_classname",
      code: "DYNAMIC_CLASSNAME",
      suggestedFallback: "agent-driven",
      message: `className={...} JSX expression at line ${line} \u2014 wisp cannot statically locate; use agent-driven mode`,
      detail: { selector: target.selector, line }
    };
  }
  const { startOffset, endOffset, startLine, endLine } = span;
  const originalSnippet = canonical.slice(startOffset, endOffset);
  const originalBase64 = Buffer.from(originalSnippet, "utf8").toString("base64");
  const marker = VariantBlockMarkerSchema.parse({
    sessionId: sessionId2,
    targetId: target.id,
    wrappedAt: (/* @__PURE__ */ new Date()).toISOString(),
    variantCount,
    originalLines: originalBase64
  });
  const syntax = MARKER_SYNTAX[fileType];
  const variantsStartBody = serializeMarkerBody("variants-start", {
    sessionId: marker.sessionId,
    targetId: marker.targetId,
    wrappedAt: marker.wrappedAt,
    variantCount: marker.variantCount,
    originalLines: marker.originalLines
  });
  const variantsEndBody = serializeMarkerBody("variants-end", {
    sessionId: marker.sessionId,
    targetId: marker.targetId
  });
  const styleStartBody = serializeMarkerBody("style-start", {
    sessionId: marker.sessionId,
    targetId: marker.targetId,
    scopeBase: `[data-wisp-target="${marker.targetId}"]`
  });
  const styleEndBody = serializeMarkerBody("style-end", {
    sessionId: marker.sessionId,
    targetId: marker.targetId
  });
  const styleTag = renderStyleHost(fileType, marker.sessionId);
  const hostOpen = renderHostOpen(fileType, marker.targetId);
  const hostInner = renderVariantZeroWrap(fileType, originalSnippet);
  const hostClose = renderHostClose(fileType);
  const replacement = [
    syntax.open(variantsStartBody),
    syntax.open(styleStartBody),
    styleTag,
    syntax.close(styleEndBody),
    hostOpen,
    hostInner,
    hostClose,
    syntax.close(variantsEndBody)
  ].join("\n") + "\n";
  const appendedTrailingNewline = true;
  const next = canonical.slice(0, startOffset) + replacement + canonical.slice(endOffset);
  const final = applyEol(next, eol);
  await atomicWrite(filePath, final);
  const afterHash = sha256Hex(final);
  await append(
    {
      ts: (/* @__PURE__ */ new Date()).toISOString(),
      sessionId: sessionId2,
      kind: "wrap-variants",
      filePath,
      beforeSha256: beforeHash,
      afterSha256: afterHash,
      detail: {
        targetId: marker.targetId,
        variantCount: marker.variantCount,
        originalByteSize: originalSnippet.length,
        startLine,
        endLine,
        appendedTrailingNewline,
        originalEndsWithNewline: originalSnippet.endsWith("\n")
      }
    },
    { projectRoot: modOpts.projectRoot }
  );
  const replacementLineCount = countNewlines(replacement);
  return {
    ok: true,
    sessionId: marker.sessionId,
    targetId: marker.targetId,
    variantsStartLine: startLine,
    styleStartLine: startLine + 1,
    styleEndLine: startLine + 3,
    variantsEndLine: startLine + replacementLineCount,
    originalBase64
  };
}
async function cleanupStaleWraps(filePath, modOpts) {
  const safety = await safetyCheck(filePath, modOpts.projectRoot);
  if (!safety.ok) return 0;
  const { fileType } = safety;
  let cleaned = 0;
  for (let i = 0; i < 20; i += 1) {
    const original = await fs5.readFile(filePath, { encoding: "utf8" });
    const canonical = canonicalize(original);
    const block = findMarkerBlock(canonical, fileType, "variants");
    if (block === null) break;
    const sessionId2 = typeof block.payload.sessionId === "string" ? block.payload.sessionId : "";
    const targetId = typeof block.payload.targetId === "string" ? block.payload.targetId : "";
    if (sessionId2 === "" || targetId === "") break;
    try {
      await discardVariantBlock(filePath, sessionId2, targetId, modOpts);
      cleaned += 1;
    } catch {
      break;
    }
  }
  return cleaned;
}
async function discardVariantBlock(filePath, sessionId2, targetId, modOpts) {
  const safety = await safetyCheck(filePath, modOpts.projectRoot);
  if (!safety.ok) {
    throw new Error(
      `discardVariantBlock: safety refused \u2014 ${safety.error.code}: ${safety.error.message}`
    );
  }
  const { fileType } = safety;
  const original = await fs5.readFile(filePath, { encoding: "utf8" });
  const beforeHash = sha256Hex(original);
  const eol = detectEol2(original);
  const canonical = canonicalize(original);
  const block = findMarkerBlock(canonical, fileType, "variants", {
    sessionId: sessionId2,
    targetId
  });
  if (block === null) {
    throw new Error(
      `discardVariantBlock: no variants block for session=${sessionId2} target=${targetId}`
    );
  }
  const b64 = block.payload.originalLines ?? "";
  let restoredSnippet = "";
  let decodeOk = false;
  try {
    restoredSnippet = Buffer.from(b64, "base64").toString("utf8");
    decodeOk = b64 !== "";
  } catch {
    restoredSnippet = "";
    decodeOk = false;
  }
  const next = expandReplaceRange(canonical, block, restoredSnippet, eol);
  const final = applyEol(next, eol);
  await atomicWrite(filePath, final);
  const afterHash = sha256Hex(final);
  const byteEquivalent = decodeOk && restoredSnippet !== "";
  await append(
    {
      ts: (/* @__PURE__ */ new Date()).toISOString(),
      sessionId: sessionId2,
      kind: "discard-variants",
      filePath,
      beforeSha256: beforeHash,
      afterSha256: afterHash,
      detail: {
        targetId,
        restoredByteEquivalent: byteEquivalent,
        snippetEndsWithNewline: restoredSnippet.endsWith("\n")
      }
    },
    { projectRoot: modOpts.projectRoot }
  );
  return {
    discarded: true,
    sessionId: sessionId2,
    targetId,
    restoredByteEquivalent: byteEquivalent
  };
}
function locateTargetSpan(canonical, fileType, selector) {
  const parsed = parseLeafSelector(selector);
  if (parsed === null) {
    return locateBySubstring(canonical, fileType, selectorToAnchor(selector));
  }
  const { tag, classes, idAttr } = parsed;
  if (idAttr !== null) {
    return locateBySubstring(canonical, fileType, `id="${idAttr}"`);
  }
  const tagPositions = [];
  if (tag !== null) {
    const tagAnchor = `<${tag}`;
    let from = 0;
    while (from < canonical.length) {
      const idx = canonical.indexOf(tagAnchor, from);
      if (idx === -1) break;
      const nextChar = canonical[idx + tagAnchor.length];
      if (nextChar !== void 0 && /[\s/>]/.test(nextChar)) {
        tagPositions.push(idx);
      }
      from = idx + tagAnchor.length;
      if (tagPositions.length > 200) break;
    }
  } else {
    for (let i = 0; i < canonical.length - 1; i += 1) {
      if (canonical[i] === "<") {
        const c = canonical[i + 1];
        if (c !== void 0 && /[A-Za-z]/.test(c)) {
          tagPositions.push(i);
          if (tagPositions.length > 1e3) break;
        }
      }
    }
  }
  if (tagPositions.length === 0) return { kind: "not_found" };
  const matchingPositions = [];
  let firstDynamicTagPos = null;
  for (const tagPos of tagPositions) {
    const result = extractClassAttribute(canonical, tagPos);
    if (result.kind === "dynamic-jsx-expression") {
      if (firstDynamicTagPos === null) firstDynamicTagPos = tagPos;
      continue;
    }
    if (result.kind === "none") {
      if (classes.length === 0) {
        matchingPositions.push(tagPos);
        if (matchingPositions.length > 8) break;
      }
      continue;
    }
    if (classes.every((c) => result.classes.has(c))) {
      matchingPositions.push(tagPos);
      if (matchingPositions.length > 8) break;
    }
  }
  if (matchingPositions.length === 0) {
    if (firstDynamicTagPos !== null) {
      return {
        kind: "dynamic_classname",
        line: lineOfOffset(canonical, firstDynamicTagPos)
      };
    }
    return { kind: "not_found" };
  }
  if (matchingPositions.length > 1) {
    return { kind: "ambiguous", matchCount: matchingPositions.length };
  }
  const openLt = matchingPositions[0];
  return finalizeSpan(canonical, fileType, openLt);
}
function parseLeafSelector(selector) {
  const t = selector.trim();
  if (t === "") return null;
  const segments = t.split(">").map((s) => s.trim()).filter((s) => s !== "");
  const leaf = segments[segments.length - 1] ?? t;
  const cleaned = leaf.replace(/:[a-z-]+(?:\([^)]*\))?/g, "");
  if (cleaned === "") return null;
  if (cleaned.startsWith("[")) return null;
  const idMatch = /#([A-Za-z][\w-]*)/.exec(cleaned);
  const idAttr = idMatch ? idMatch[1] ?? null : null;
  const withoutId = cleaned.replace(/#[A-Za-z][\w-]*/, "");
  const dotIdx = withoutId.indexOf(".");
  const tagPart = dotIdx === -1 ? withoutId : withoutId.slice(0, dotIdx);
  const classPart = dotIdx === -1 ? "" : withoutId.slice(dotIdx + 1);
  const tag = tagPart.length > 0 ? tagPart : null;
  const classes = classPart === "" ? [] : classPart.split(".").map((c) => c.trim()).filter((c) => c !== "");
  if (tag === null && classes.length === 0 && idAttr === null) return null;
  return { tag, classes, idAttr };
}
function extractClassAttribute(canonical, openLt) {
  let i = openLt + 1;
  let inQuote = null;
  let braceDepth = 0;
  while (i < canonical.length) {
    const ch = canonical[i];
    if (inQuote !== null) {
      if (ch === inQuote) inQuote = null;
    } else if (ch === '"' || ch === "'") {
      inQuote = ch;
    } else if (ch === "{") {
      braceDepth += 1;
    } else if (ch === "}") {
      if (braceDepth > 0) braceDepth -= 1;
    } else if (ch === ">" && braceDepth === 0) {
      break;
    }
    i += 1;
  }
  const tagText = canonical.slice(openLt, i);
  const dynamicMatch = /\b(?:class|className)\s*=\s*\{/.exec(tagText);
  if (dynamicMatch) {
    return { kind: "dynamic-jsx-expression" };
  }
  const m = /\b(?:class|className)\s*=\s*("([^"]*)"|'([^']*)')/.exec(tagText);
  if (!m) return { kind: "none" };
  const value = m[2] ?? m[3] ?? "";
  return {
    kind: "static",
    classes: new Set(value.split(/\s+/).filter((c) => c !== ""))
  };
}
function locateBySubstring(canonical, fileType, anchor) {
  if (anchor === null) return { kind: "not_found" };
  const positions = [];
  let from = 0;
  while (from < canonical.length) {
    const idx = canonical.indexOf(anchor, from);
    if (idx === -1) break;
    positions.push(idx);
    from = idx + anchor.length;
    if (positions.length > 8) break;
  }
  if (positions.length === 0) return { kind: "not_found" };
  if (positions.length > 1) {
    return { kind: "ambiguous", matchCount: positions.length };
  }
  const pos = positions[0];
  const openLt = canonical.lastIndexOf("<", pos);
  if (openLt === -1) return { kind: "not_found" };
  return finalizeSpan(canonical, fileType, openLt);
}
function finalizeSpan(canonical, fileType, openLt) {
  const endOffset = walkElementEnd(canonical, fileType, openLt);
  if (endOffset === -1) return { kind: "not_found" };
  const startLineOffset = lineStartOffset(canonical, openLt);
  const endLineOffset = lineEndOffset(canonical, endOffset);
  return {
    kind: "found",
    startOffset: startLineOffset,
    endOffset: endLineOffset,
    startLine: lineOfOffset(canonical, startLineOffset),
    endLine: lineOfOffset(canonical, endLineOffset)
  };
}
function selectorToAnchor(selector) {
  const t = selector.trim();
  if (t === "") return null;
  const segments = t.split(">").map((s) => s.trim()).filter((s) => s !== "");
  const leaf = segments[segments.length - 1] ?? t;
  const cleaned = leaf.replace(/:[a-z-]+(?:\([^)]*\))?/g, "");
  if (cleaned.startsWith("#")) {
    return cleaned.length > 1 ? `id="${cleaned.slice(1).split(/[.[]/)[0]}"` : null;
  }
  if (cleaned.startsWith("[")) return cleaned.replace(/^\[/, "").replace(/\]$/, "");
  const dotIdx = cleaned.indexOf(".");
  const tag = dotIdx === -1 ? cleaned : cleaned.slice(0, dotIdx);
  const classList = dotIdx === -1 ? [] : cleaned.slice(dotIdx + 1).split(".").map((c) => c.trim()).filter((c) => c !== "");
  if (classList.length === 0) {
    return tag.length > 0 ? `<${tag}` : null;
  }
  const anchor = classList.slice().sort((a, b) => b.length - a.length)[0];
  return anchor;
}
function walkElementEnd(source, fileType, openIdx) {
  const nameMatch = /^<\/?([A-Za-z][A-Za-z0-9_:.-]*)/.exec(source.slice(openIdx));
  if (!nameMatch) return -1;
  const tagName = (nameMatch[1] ?? "").toLowerCase();
  void fileType;
  let i = openIdx;
  let inQuote = null;
  let inTag = true;
  let depth = 0;
  while (i < source.length) {
    const ch = source[i];
    if (inQuote !== null) {
      if (ch === "\\" && i + 1 < source.length) {
        i += 2;
        continue;
      }
      if (ch === inQuote) inQuote = null;
      i += 1;
      continue;
    }
    if (inTag && (ch === '"' || ch === "'")) {
      inQuote = ch;
      i += 1;
      continue;
    }
    if (inTag && ch === ">") {
      inTag = false;
    }
    if (ch === "<") {
      const m = /^<\/?([A-Za-z][A-Za-z0-9_:.-]*)/.exec(source.slice(i));
      if (m) {
        const isClose = source[i + 1] === "/";
        const innerName = (m[1] ?? "").toLowerCase();
        if (innerName === tagName) {
          if (isClose) {
            depth -= 1;
            if (depth === 0) {
              const gt = source.indexOf(">", i);
              return gt === -1 ? -1 : gt + 1;
            }
          } else {
            const gt = source.indexOf(">", i);
            if (gt === -1) return -1;
            const isSelf = source[gt - 1] === "/";
            if (isSelf) {
              if (depth === 0) return gt + 1;
            } else {
              depth += 1;
            }
          }
        }
        inTag = true;
      }
    }
    i += 1;
  }
  return -1;
}
function lineStartOffset(s, at) {
  let i = at;
  while (i > 0 && s[i - 1] !== "\n") i -= 1;
  return i;
}
function lineEndOffset(s, at) {
  let i = at;
  while (i < s.length && s[i] !== "\n") i += 1;
  if (i < s.length && s[i] === "\n") i += 1;
  return i;
}
function lineOfOffset(s, offset) {
  let line = 0;
  for (let i = 0; i < offset && i < s.length; i += 1) {
    if (s[i] === "\n") line += 1;
  }
  return line;
}
function renderStyleHost(fileType, sessionId2) {
  if (fileType === "tsx" || fileType === "jsx") {
    return `<style data-wisp-css="${sessionId2}">{\`/* variants populated at runtime */\`}</style>`;
  }
  return `<style data-wisp-css="${sessionId2}">/* variants populated at runtime */</style>`;
}
function renderHostOpen(fileType, targetId) {
  void fileType;
  return `<div data-wisp-variants-host="${targetId}">`;
}
function renderVariantZeroWrap(fileType, snippet2) {
  void fileType;
  return `  <div data-wisp-variant="0">
${indent(snippet2, "    ")}
  </div>`;
}
function renderHostClose(fileType) {
  void fileType;
  return `</div>`;
}
function indent(s, pad) {
  return s.split("\n").map((l) => l.length === 0 ? l : pad + l).join("\n");
}
function countNewlines(s) {
  let n = 0;
  for (let i = 0; i < s.length; i += 1) if (s[i] === "\n") n += 1;
  return n;
}
var wrapModule;
var init_wrap = __esm({
  "src/source/wrap.ts"() {
    "use strict";
    init_source();
    init_accept();
    init_safety();
    init_undo_stack();
    wrapModule = { wrapVariantBlock, discardVariantBlock };
  }
});

// src/agent/claude-invoke.ts
var claude_invoke_exports = {};
__export(claude_invoke_exports, {
  buildVariantPrompt: () => buildVariantPrompt,
  detectClaudeBin: () => detectClaudeBin,
  extractJsonObject: () => extractJsonObject,
  invokeClaudeForVariants: () => invokeClaudeForVariants,
  parseClaudeEnvelope: () => parseClaudeEnvelope
});
import { execFile } from "child_process";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join as join3 } from "path";
import { promisify } from "util";
function getNeutralCwd() {
  if (neutralCwd === null) {
    neutralCwd = mkdtempSync(join3(tmpdir(), "wisp-claude-cwd-"));
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
      (resolve9, reject) => {
        let out = "";
        let err = "";
        child.stdout?.on("data", (c) => out += c.toString());
        child.stderr?.on("data", (c) => err += c.toString());
        child.on("error", reject);
        child.on("close", (code) => {
          resolve9({ stdout: out, stderr: err, code });
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
var execFileP, neutralCwd, SYSTEM_PROMPT, VARIANTS_JSON_SCHEMA;
var init_claude_invoke = __esm({
  "src/agent/claude-invoke.ts"() {
    "use strict";
    execFileP = promisify(execFile);
    neutralCwd = null;
    SYSTEM_PROMPT = "You are wisp-design's variant generator. You design CSS variants for a live frontend design overlay. You respond with ONLY raw JSON matching the user-provided schema. No preamble, no explanation, no markdown fences. Follow the anti-slop rules in every variant. Be concise.";
    VARIANTS_JSON_SCHEMA = JSON.stringify({
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
  }
});

// src/contracts/verify.ts
import { z as z6 } from "zod";
function worstSeverity(results) {
  let worst = "pass";
  for (const r of results) {
    if (r.severity === "fail") return "fail";
    if (r.severity === "warn") worst = "warn";
  }
  return worst;
}
function aggregateCounts(checks) {
  let hardBanCount = 0;
  let a11yFailCount = 0;
  let warningCount = 0;
  for (const c of checks) {
    if (c.severity === "warn") warningCount += 1;
    if (c.violations === void 0) continue;
    if (c.name === "anti-slop") {
      for (const v of c.violations) {
        const av = v;
        if (av.ruleId !== void 0 && HARD_BAN_RULES.has(av.ruleId)) {
          hardBanCount += 1;
        }
      }
    }
    if (c.name === "a11y-axe") {
      for (const v of c.violations) {
        if (v.severity === "fail") a11yFailCount += 1;
      }
    }
  }
  return { hardBanCount, a11yFailCount, warningCount };
}
var VerifyModeSchema, SeveritySchema, CheckNameSchema, MODE_CHECK_SETS, MODE_BLOCKS_ON_FAIL, MODE_TIMING_BUDGET_MS, AntiSlopRuleIdSchema, HARD_BAN_RULES, AuditOptionsSchema, ANTI_SLOP_LINTER_BUDGET_MS, A11Y_AXE_BUDGET_MS, CONSOLE_SCAN_BUDGET_MS, TAB_ORDER_BUDGET_MS, REDUCED_MOTION_BUDGET_MS, MULTI_VIEWPORT_BUDGET_MS, CHECK_BUDGET_MS, DEFAULT_VIEWPORTS, DEFAULT_COLOR_SCHEMES;
var init_verify = __esm({
  "src/contracts/verify.ts"() {
    "use strict";
    VerifyModeSchema = z6.enum([
      "stop-hook",
      "live-accept",
      "live-with-screenshot",
      "audit",
      "audit-strict"
    ]);
    SeveritySchema = z6.enum(["pass", "warn", "fail"]);
    CheckNameSchema = z6.enum([
      "anti-slop",
      "a11y-axe",
      "console-scan",
      "tab-order",
      "reduced-motion",
      "multi-viewport"
    ]);
    MODE_CHECK_SETS = {
      "stop-hook": ["anti-slop"],
      "live-accept": [
        "anti-slop",
        "a11y-axe",
        "console-scan",
        "tab-order",
        "reduced-motion"
      ],
      "live-with-screenshot": [
        "anti-slop",
        "a11y-axe",
        "console-scan",
        "tab-order",
        "reduced-motion",
        "multi-viewport"
      ],
      audit: [
        "anti-slop",
        "a11y-axe",
        "console-scan",
        "tab-order",
        "reduced-motion",
        "multi-viewport"
      ],
      "audit-strict": [
        "anti-slop",
        "a11y-axe",
        "console-scan",
        "tab-order",
        "reduced-motion",
        "multi-viewport"
      ]
    };
    MODE_BLOCKS_ON_FAIL = {
      "stop-hook": false,
      "live-accept": false,
      "live-with-screenshot": false,
      audit: false,
      "audit-strict": true
    };
    MODE_TIMING_BUDGET_MS = {
      "stop-hook": 100,
      // p99 hard limit — hot path on every Claude turn
      "live-accept": 3e3,
      // p95 hot-path budget per synthesis.md
      "live-with-screenshot": 6e3,
      // + Playwright launch + 4 viewports × 2 modes
      audit: 3e4,
      // best-effort, single-shot CLI
      "audit-strict": 3e4
      // same; blocking decision after results assembled
    };
    AntiSlopRuleIdSchema = z6.enum([
      // Hard-bans (severity: fail in all modes; blocks accept only when mode
      // blocks on fail).
      "em-dash-ui",
      "gradient-text-headline",
      "default-glassmorphism",
      "hero-metric-template",
      "side-stripe-decoration",
      "purple-blue-gradient",
      "generic-ai-illustration",
      // Soft suggestions (severity: warn even in strict modes).
      "too-perfect-alignment",
      "round-number-whitespace",
      "default-tailwind-blue",
      "single-weight-typography",
      "all-rounded-corners"
    ]);
    HARD_BAN_RULES = /* @__PURE__ */ new Set([
      "em-dash-ui",
      "gradient-text-headline",
      "default-glassmorphism",
      "hero-metric-template",
      "side-stripe-decoration",
      "purple-blue-gradient",
      "generic-ai-illustration"
    ]);
    AuditOptionsSchema = z6.object({
      // User-facing names (`fast`/`full`/`strict`) are friendlier than the
      // internal VerifyMode enum. Mapping handled by the audit runner:
      //   fast   → "stop-hook"
      //   full   → "audit"   (+ "live-with-screenshot" if --screenshot)
      //   strict → "audit-strict"
      mode: z6.enum(["fast", "full", "strict"]).default("fast"),
      // File globs to audit. Empty array = audit `git diff HEAD --name-only`.
      paths: z6.array(z6.string()).default([]),
      outputFormat: z6.enum(["text", "json", "markdown"]).default("text"),
      // CI knob: treat warn-level findings as exit-1. Default false (warn-only
      // is informational for v0.x).
      failOnWarn: z6.boolean().default(false),
      // Force multi-viewport screenshot (requires playwright optionalDep).
      screenshotEnabled: z6.boolean().default(false)
    });
    ANTI_SLOP_LINTER_BUDGET_MS = 50;
    A11Y_AXE_BUDGET_MS = 1500;
    CONSOLE_SCAN_BUDGET_MS = 2e3;
    TAB_ORDER_BUDGET_MS = 300;
    REDUCED_MOTION_BUDGET_MS = 600;
    MULTI_VIEWPORT_BUDGET_MS = 3500;
    CHECK_BUDGET_MS = {
      "anti-slop": ANTI_SLOP_LINTER_BUDGET_MS,
      "a11y-axe": A11Y_AXE_BUDGET_MS,
      "console-scan": CONSOLE_SCAN_BUDGET_MS,
      "tab-order": TAB_ORDER_BUDGET_MS,
      "reduced-motion": REDUCED_MOTION_BUDGET_MS,
      "multi-viewport": MULTI_VIEWPORT_BUDGET_MS
    };
    DEFAULT_VIEWPORTS = [
      { w: 375, h: 812, label: "mobile-375" },
      { w: 768, h: 1024, label: "tablet-768" },
      { w: 1280, h: 800, label: "desktop-1280" },
      { w: 1920, h: 1080, label: "wide-1920" }
    ];
    DEFAULT_COLOR_SCHEMES = [
      "light",
      "dark"
    ];
  }
});

// src/verify/anti-slop-linter.ts
var anti_slop_linter_exports = {};
__export(anti_slop_linter_exports, {
  extractCssFromFile: () => extractCssFromFile,
  formatBlockMessage: () => formatBlockMessage,
  formatWarnMessage: () => formatWarnMessage,
  loadBrandColors: () => loadBrandColors,
  runAntiSlop: () => runAntiSlop,
  runAntiSlopOnFiles: () => runAntiSlopOnFiles
});
import { promises as fs6 } from "fs";
import { extname as extname3, join as join4 } from "path";
function extractClassNameValues(content) {
  const results = [];
  CLASS_ATTR_RE.lastIndex = 0;
  let m;
  while ((m = CLASS_ATTR_RE.exec(content)) !== null) {
    const fullMatch = m[0] ?? "";
    const value = m[1] ?? "";
    const valueOffset = m.index + fullMatch.length - value.length - 1;
    results.push({ value, offset: valueOffset });
  }
  return results;
}
function matchGradientTextClassName(value, offset, content) {
  if (/bg-gradient-to-\w+/.test(value) && /bg-clip-text/.test(value) && /text-transparent/.test(value)) {
    const { line, column } = lineColAt(content, offset);
    return {
      ruleId: "gradient-text-headline",
      severity: "fail",
      message: "gradient text via Tailwind classes (bg-clip-text text-transparent) \u2014 kills scanability.",
      suggestedFix: "Use a solid colour. Gradient text only for purely decorative, non-interactive accents.",
      location: { line, column, cssSnippet: snippet(value, 0, value.length) }
    };
  }
  return null;
}
function matchHeroMetricClassName(value, offset, content) {
  const hasBigText = /text-[789]xl\b/.test(value) || /text-\[(\d+)px\]/.test(value);
  const hasBorderlineHeavy = /text-[456]xl\b/.test(value) && /font-(black|extrabold)\b/.test(value);
  if (!hasBigText && !hasBorderlineHeavy) return null;
  const arbitraryMatch = /text-\[(\d+)px\]/.exec(value);
  if (arbitraryMatch !== null && !hasBorderlineHeavy) {
    const px = parseInt(arbitraryMatch[1] ?? "0", 10);
    if (px < 80) return null;
  }
  const window = content.slice(offset, offset + 400);
  if (!/>\s*[^<]*\d+(%|x|K\+?|M\+?|\+|\/\d+)[^<]*</.test(window)) return null;
  const { line, column } = lineColAt(content, offset);
  return {
    ruleId: "hero-metric-template",
    severity: "fail",
    message: "hero-metric template via Tailwind huge/bold text with metric suffix \u2014 over-used AI hero pattern.",
    suggestedFix: "Use a real proof-point with attribution, a testimonial, or remove the metric.",
    location: { line, column, cssSnippet: snippet(value, 0, value.length) }
  };
}
function matchGlassmorphismClassName(value, offset, content) {
  if (/backdrop-blur(-\w+)?/.test(value) && /bg-(white|black)\/\d+/.test(value)) {
    const before = content.slice(Math.max(0, offset - 100), offset);
    const after = content.slice(offset, Math.min(content.length, offset + 100));
    if (/wisp-justify/.test(before) || /wisp-justify/.test(after)) return null;
    const { line, column } = lineColAt(content, offset);
    return {
      ruleId: "default-glassmorphism",
      severity: "fail",
      message: "glassmorphism via Tailwind classes (backdrop-blur + bg-white/black opacity) \u2014 default AI vibe.",
      suggestedFix: "Add `/* wisp-justify: <reason> */` within 100 chars, or remove the backdrop-filter.",
      location: { line, column, cssSnippet: snippet(value, 0, value.length) }
    };
  }
  return null;
}
function matchPurpleBlueGradientClassName(value, offset, content) {
  if (/(from|via|to)-purple-\d+/.test(value) && /(from|via|to)-blue-\d+/.test(value)) {
    const { line, column } = lineColAt(content, offset);
    return {
      ruleId: "purple-blue-gradient",
      severity: "fail",
      message: "purple\u2192blue gradient via Tailwind classes \u2014 generic AI brand vibe.",
      suggestedFix: "Modulate lightness within one hue, or use the project palette colours from `.wisp/brand-spec.json`.",
      location: { line, column, cssSnippet: snippet(value, 0, value.length) }
    };
  }
  return null;
}
function matchDefaultBlueClassName(value, offset, content, ctx) {
  const m = DEFAULT_BLUE_TW_CLASS_RE.exec(value);
  if (m === null) return null;
  const token = `${m[1]}-blue-${m[2]}`;
  if (ctx.brandColors.has(token) || ctx.brandColors.has("#3b82f6")) {
    return null;
  }
  const { line, column } = lineColAt(content, offset);
  return {
    ruleId: "default-tailwind-blue",
    severity: "warn",
    message: `default Tailwind blue utility (${token}) \u2014 single most over-used AI brand colour.`,
    suggestedFix: "Use a project-defined accent OKLch with stated chroma, or pull from `.wisp/brand-spec.json`.",
    location: { line, column, cssSnippet: snippet(value, 0, value.length) }
  };
}
function runTailwindClassMatchers(content, ctx) {
  const matches = extractClassNameValues(content);
  const violations = [];
  const defaultBlueClassHits = [];
  const seen = /* @__PURE__ */ new Set();
  const seenBlue = /* @__PURE__ */ new Set();
  for (const { value, offset } of matches) {
    const candidates = [
      matchGradientTextClassName(value, offset, content),
      matchHeroMetricClassName(value, offset, content),
      matchGlassmorphismClassName(value, offset, content),
      matchPurpleBlueGradientClassName(value, offset, content)
    ];
    for (const v of candidates) {
      if (v === null) continue;
      const key = `${v.ruleId}:${v.location?.line ?? 0}`;
      if (seen.has(key)) continue;
      seen.add(key);
      violations.push(v);
    }
    const blue = matchDefaultBlueClassName(value, offset, content, ctx);
    if (blue !== null) {
      const key = `${blue.ruleId}:${blue.location?.line ?? 0}:${blue.location?.column ?? 0}`;
      if (!seenBlue.has(key)) {
        seenBlue.add(key);
        defaultBlueClassHits.push(blue);
      }
    }
  }
  return { violations, defaultBlueClassHits };
}
function runJsxInlineStyleMatchers(content) {
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  function push(v) {
    const key = `${v.ruleId}:${v.location?.line ?? 0}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(v);
  }
  JSX_BACKDROP_FILTER_RE.lastIndex = 0;
  let m;
  while ((m = JSX_BACKDROP_FILTER_RE.exec(content)) !== null) {
    const before = content.slice(Math.max(0, m.index - 100), m.index);
    const after = content.slice(m.index, Math.min(content.length, m.index + 100));
    if (/wisp-justify/.test(before) || /wisp-justify/.test(after)) continue;
    const { line, column } = lineColAt(content, m.index);
    push({
      ruleId: "default-glassmorphism",
      severity: "fail",
      message: "glassmorphism via JSX inline style (backdropFilter: blur) \u2014 default AI vibe.",
      suggestedFix: "Add `/* wisp-justify: <reason> */` within 100 chars, or remove the backdropFilter.",
      location: { line, column, cssSnippet: snippet(content, m.index, m[0].length) }
    });
    if (m.index === JSX_BACKDROP_FILTER_RE.lastIndex) JSX_BACKDROP_FILTER_RE.lastIndex += 1;
  }
  JSX_BACKGROUND_CLIP_TEXT_RE.lastIndex = 0;
  while ((m = JSX_BACKGROUND_CLIP_TEXT_RE.exec(content)) !== null) {
    const start2 = Math.max(0, m.index - 200);
    const end2 = Math.min(content.length, m.index + m[0].length + 200);
    const window = content.slice(start2, end2);
    if (JSX_COLOR_TRANSPARENT_RE.test(window)) {
      const { line, column } = lineColAt(content, m.index);
      push({
        ruleId: "gradient-text-headline",
        severity: "fail",
        message: "gradient text via JSX inline style (backgroundClip: 'text' + color: 'transparent') \u2014 kills scanability.",
        suggestedFix: "Use a solid colour. Gradient text only for purely decorative, non-interactive accents.",
        location: { line, column, cssSnippet: snippet(content, m.index, m[0].length) }
      });
    }
    if (m.index === JSX_BACKGROUND_CLIP_TEXT_RE.lastIndex) JSX_BACKGROUND_CLIP_TEXT_RE.lastIndex += 1;
  }
  return out;
}
function aggregateRoundNumberWhitespace(content, _ctx) {
  let totalCount = 0;
  let roundCount = 0;
  let firstRoundOffset = -1;
  let firstRoundLen = 0;
  ANY_SPACING_DECL_RE.lastIndex = 0;
  let m;
  while ((m = ANY_SPACING_DECL_RE.exec(content)) !== null) {
    totalCount += 1;
    const value = m[2] ?? "";
    if (ROUND_NUMBER_VALUES.has(value)) {
      roundCount += 1;
      if (firstRoundOffset === -1) {
        firstRoundOffset = m.index;
        firstRoundLen = m[0].length;
      }
    }
  }
  if (totalCount < ROUND_NUMBER_WHITESPACE_MIN_TOTAL) return [];
  const ratio = roundCount / totalCount;
  if (ratio <= ROUND_NUMBER_WHITESPACE_RATIO_THRESHOLD) return [];
  const rule = RULES_BY_ID.get("round-number-whitespace");
  if (rule === void 0) return [];
  const location = {};
  if (firstRoundOffset !== -1) {
    const { line, column } = lineColAt(content, firstRoundOffset);
    location.line = line;
    location.column = column;
    location.cssSnippet = snippet(content, firstRoundOffset, firstRoundLen);
  }
  return [
    {
      ruleId: rule.id,
      severity: rule.severity,
      message: `${rule.message} (${roundCount}/${totalCount} declarations on the 16/24/32/48px grid)`,
      suggestedFix: rule.suggestedFix,
      location
    }
  ];
}
function normalizeBlueValue(value) {
  const v = value.toLowerCase().trim();
  if (v === "#3b82f6") return "#3b82f6";
  if (/^rgb\(\s*59\s*,\s*130\s*,\s*246\s*\)$/.test(v)) return "#3b82f6";
  if (v === "var(--tw-blue-500)" || v === "var(--color-blue-500)") return v;
  return v;
}
function aggregateDefaultTailwindBlue(content, ctx, additionalClassHits = []) {
  const cssHits = [];
  DEFAULT_BLUE_CSS_RE.lastIndex = 0;
  let m;
  const seenLocations = /* @__PURE__ */ new Set();
  const rule = RULES_BY_ID.get("default-tailwind-blue");
  if (rule === void 0) return [];
  while ((m = DEFAULT_BLUE_CSS_RE.exec(content)) !== null) {
    const value = m[2] ?? "";
    const normalized = normalizeBlueValue(value);
    if (ctx.brandColors.has(normalized)) continue;
    const { line, column } = lineColAt(content, m.index);
    const locKey = `${line}:${column}`;
    if (seenLocations.has(locKey)) continue;
    seenLocations.add(locKey);
    cssHits.push({
      ruleId: rule.id,
      severity: rule.severity,
      message: rule.message,
      suggestedFix: rule.suggestedFix,
      location: {
        line,
        column,
        cssSnippet: snippet(content, m.index, m[0].length)
      }
    });
    if (cssHits.length >= 10) break;
  }
  const totalOccurrences = cssHits.length + additionalClassHits.length;
  if (totalOccurrences < DEFAULT_BLUE_MIN_OCCURRENCES) return [];
  return [...cssHits, ...additionalClassHits].slice(0, 10);
}
function lineColAt(content, offset) {
  let line = 1;
  let column = 1;
  for (let i = 0; i < offset && i < content.length; i += 1) {
    if (content.charCodeAt(i) === 10) {
      line += 1;
      column = 1;
    } else {
      column += 1;
    }
  }
  return { line, column };
}
function snippet(content, offset, length, max = 80) {
  const end2 = Math.min(content.length, offset + length);
  const raw = content.slice(offset, end2);
  const trimmed = raw.replace(/\s+/g, " ").trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}\u2026`;
}
function forEachRuleBlock(content) {
  const blocks = [];
  let i = 0;
  let blockStart = 0;
  while (i < content.length) {
    const ch = content.charCodeAt(i);
    if (ch === 123) {
      const selector = content.slice(blockStart, i).trim();
      const bodyStart = i + 1;
      let depth = 1;
      let j = bodyStart;
      while (j < content.length && depth > 0) {
        const c = content.charCodeAt(j);
        if (c === 123) depth += 1;
        else if (c === 125) depth -= 1;
        if (depth === 0) break;
        j += 1;
      }
      const body = content.slice(bodyStart, j);
      blocks.push({ selector, body, offset: i });
      i = j + 1;
      blockStart = i;
      continue;
    }
    i += 1;
  }
  return blocks;
}
function blockIsTextBearing(block) {
  if (TEXT_DECL_RE.test(block.body)) return true;
  if (TEXT_TAG_RE.test(block.selector) && !ICON_HINT_RE.test(block.selector)) return true;
  return false;
}
function analyseFontWeights(content) {
  const distinctValues = /* @__PURE__ */ new Set();
  let occurrenceCount = 0;
  const blocks = forEachRuleBlock(content);
  const scanBodies = blocks.length === 0 ? [content] : blocks.filter(blockIsTextBearing).map((b) => b.body);
  for (const body of scanBodies) {
    FONT_WEIGHT_RE.lastIndex = 0;
    let m;
    while ((m = FONT_WEIGHT_RE.exec(body)) !== null) {
      const value = (m[1] ?? "").toLowerCase();
      let canonical;
      if (value === "normal") canonical = "400";
      else if (value === "bold") canonical = "700";
      else canonical = value;
      distinctValues.add(canonical);
      occurrenceCount += 1;
      if (distinctValues.size >= 2) return null;
    }
  }
  if (distinctValues.size === 1 && occurrenceCount >= MIN_SINGLE_WEIGHT_OCCURRENCES) {
    const rule = RULES_BY_ID.get("single-weight-typography");
    if (rule === void 0) return null;
    return {
      ruleId: rule.id,
      severity: rule.severity,
      message: rule.message,
      suggestedFix: rule.suggestedFix,
      location: { cssSnippet: `font-weight: ${Array.from(distinctValues)[0] ?? ""}` }
    };
  }
  return null;
}
async function runAntiSlop(css, ctx) {
  const startedAt = Date.now();
  const budgetMs = ctx?.budgetMs ?? ANTI_SLOP_LINTER_BUDGET_MS;
  const violations = [];
  const aggCtx = {
    brandColors: ctx?.brandColors ?? /* @__PURE__ */ new Set()
  };
  let parkedDefaultBlueClassHits = [];
  const tailwindBudgetOkUp = ctx?.budgetStartedAt === void 0 || Date.now() - ctx.budgetStartedAt <= budgetMs;
  if (tailwindBudgetOkUp) {
    const sourceForClassScan = ctx?.rawSource ?? css;
    const tw = runTailwindClassMatchers(sourceForClassScan, aggCtx);
    for (const v of tw.violations) violations.push(v);
    parkedDefaultBlueClassHits = tw.defaultBlueClassHits;
    for (const v of runJsxInlineStyleMatchers(sourceForClassScan)) violations.push(v);
  }
  for (const rule of RULES) {
    if (rule.id === "single-weight-typography") continue;
    if (rule.aggregator !== void 0) {
      const aggregated = rule.id === "default-tailwind-blue" ? aggregateDefaultTailwindBlue(css, aggCtx, parkedDefaultBlueClassHits) : rule.aggregator(css, aggCtx);
      for (const v of aggregated) violations.push(v);
      if (ctx?.budgetStartedAt !== void 0 && Date.now() - ctx.budgetStartedAt > budgetMs) {
        break;
      }
      continue;
    }
    const re = new RegExp(rule.pattern.source, rule.pattern.flags);
    let match;
    let matchCount = 0;
    while ((match = re.exec(css)) !== null) {
      const { line, column } = lineColAt(css, match.index);
      violations.push({
        ruleId: rule.id,
        severity: rule.severity,
        message: rule.message,
        suggestedFix: rule.suggestedFix,
        location: {
          line,
          column,
          cssSnippet: snippet(css, match.index, match[0].length)
        }
      });
      matchCount += 1;
      if (matchCount >= 10) break;
      if (match.index === re.lastIndex) re.lastIndex += 1;
    }
    if (ctx?.budgetStartedAt !== void 0 && Date.now() - ctx.budgetStartedAt > budgetMs) {
      break;
    }
  }
  const fwViolation = analyseFontWeights(css);
  if (fwViolation !== null) violations.push(fwViolation);
  const severity = violations.some((v) => v.severity === "fail") ? "fail" : violations.some((v) => v.severity === "warn") ? "warn" : "pass";
  return {
    name: "anti-slop",
    severity,
    durationMs: Date.now() - startedAt,
    violations
  };
}
function extractCssFromFile(filePath, content) {
  const ext = extname3(filePath).toLowerCase();
  if (ext === ".css" || ext === ".scss" || ext === ".sass") return content;
  if (ext === ".tsx" || ext === ".jsx" || ext === ".ts" || ext === ".js") {
    const out = [];
    let m;
    JSX_INLINE_STYLE_RE.lastIndex = 0;
    while ((m = JSX_INLINE_STYLE_RE.exec(content)) !== null) {
      const body = (m[1] ?? "").replace(/([a-z])([A-Z])/g, (_, a, b) => `${a}-${b.toLowerCase()}`).replace(/['"]/g, "'").replace(/,/g, ";");
      out.push(body);
    }
    out.push(content);
    return out.join("\n");
  }
  if (ext === ".vue" || ext === ".svelte" || ext === ".html" || ext === ".htm" || ext === ".astro") {
    const out = [];
    let m;
    STYLE_BLOCK_RE.lastIndex = 0;
    while ((m = STYLE_BLOCK_RE.exec(content)) !== null) {
      out.push(m[1] ?? "");
    }
    INLINE_STYLE_ATTR_RE.lastIndex = 0;
    while ((m = INLINE_STYLE_ATTR_RE.exec(content)) !== null) {
      out.push(m[1] ?? "");
    }
    out.push(content);
    return out.join("\n");
  }
  return content;
}
async function loadBrandColors(projectRoot) {
  const out = /* @__PURE__ */ new Set();
  try {
    const path = join4(projectRoot, ".wisp", "brand-spec.json");
    const raw = await fs6.readFile(path, "utf8");
    const json = JSON.parse(raw);
    let arr = void 0;
    let primary = void 0;
    let accent = void 0;
    if (json !== null && typeof json === "object") {
      const j = json;
      const brand = j["brand"];
      if (brand !== void 0 && typeof brand === "object" && brand !== null) {
        const b = brand;
        arr = b["colors"];
        primary = b["primary"];
        accent = b["accent"];
      }
      if (arr === void 0) arr = j["colors"];
    }
    if (Array.isArray(arr)) {
      for (const v of arr) {
        if (typeof v === "string") out.add(v.toLowerCase().trim());
      }
    }
    if (typeof primary === "string") out.add(primary.toLowerCase().trim());
    if (typeof accent === "string") out.add(accent.toLowerCase().trim());
  } catch {
  }
  return out;
}
async function runAntiSlopOnFiles(files, opts) {
  const startedAt = Date.now();
  const budgetBase = opts.budgetStartedAt ?? startedAt;
  const budgetMs = opts.perCallBudgetMs ?? ANTI_SLOP_LINTER_BUDGET_MS;
  const violations = [];
  const brandColors = opts.brandColors ?? await loadBrandColors(opts.projectRoot);
  for (const filePath of files) {
    const ext = extname3(filePath).toLowerCase();
    if (!UI_EXTENSIONS.has(ext)) continue;
    if (Date.now() - budgetBase > budgetMs) break;
    let content;
    try {
      content = await fs6.readFile(filePath, "utf8");
    } catch {
      continue;
    }
    const css = extractCssFromFile(filePath, content);
    const result = await runAntiSlop(css, {
      mode: opts.mode,
      budgetStartedAt: budgetBase,
      rawSource: content,
      brandColors,
      // Phase-7.12 — propagate the per-call budget so inner rule-loop and
      // tailwind-scanner don't truncate against the 50ms stop-hook ceiling
      // when called from audit modes.
      budgetMs
    });
    if (result.violations !== void 0) {
      const rawAnti = result.violations;
      for (const v of rawAnti) {
        const annotated = {
          ruleId: v.ruleId,
          severity: v.severity,
          message: v.message,
          location: {
            ...v.location ?? {},
            cssSnippet: `${filePath}: ${v.location?.cssSnippet ?? ""}`.trim()
          }
        };
        if (v.suggestedFix !== void 0) annotated.suggestedFix = v.suggestedFix;
        violations.push(annotated);
      }
    }
  }
  const severity = violations.some((v) => v.severity === "fail") ? "fail" : violations.some((v) => v.severity === "warn") ? "warn" : "pass";
  return {
    name: "anti-slop",
    severity,
    durationMs: Date.now() - startedAt,
    violations
  };
}
function isHardBan(v) {
  return HARD_BAN_RULES.has(v.ruleId);
}
function formatBlockMessage(hits) {
  const hardBans = hits.filter(isHardBan);
  if (hardBans.length === 0) return "wisp-design anti-slop: (no hard-bans)";
  const head = `wisp-design anti-slop blocked: ${hardBans.length} hard-ban${hardBans.length > 1 ? "s" : ""}`;
  const lines = hardBans.slice(0, 5).map((v) => {
    const where = v.location !== void 0 && v.location.cssSnippet !== void 0 ? `
    ${v.location.cssSnippet}` : "";
    return `  \u2022 ${v.ruleId} \u2014 ${v.message}${where}
    fix: ${v.suggestedFix ?? "(no suggestion)"}`;
  });
  if (hardBans.length > 5) {
    lines.push(`  \u2022 \u2026and ${hardBans.length - 5} more.`);
  }
  return [head, ...lines].join("\n");
}
function formatWarnMessage(hits) {
  if (hits.length === 0) return "wisp-design anti-slop: clean.";
  const head = `wisp-design anti-slop warn: ${hits.length} finding${hits.length > 1 ? "s" : ""}`;
  const lines = hits.slice(0, 8).map((v) => {
    const sev = isHardBan(v) ? "FAIL" : "warn";
    return `  [${sev}] ${v.ruleId}: ${v.message}`;
  });
  if (hits.length > 8) {
    lines.push(`  \u2026and ${hits.length - 8} more (run \`wisp-design audit --mode full\` for the full report).`);
  }
  return [head, ...lines].join("\n");
}
var CLASS_ATTR_RE, JSX_BACKDROP_FILTER_RE, JSX_BACKGROUND_CLIP_TEXT_RE, JSX_COLOR_TRANSPARENT_RE, ROUND_NUMBER_WHITESPACE_MIN_TOTAL, ROUND_NUMBER_WHITESPACE_RATIO_THRESHOLD, ROUND_NUMBER_VALUES, ANY_SPACING_DECL_RE, DEFAULT_BLUE_CSS_RE, DEFAULT_BLUE_TW_CLASS_RE, DEFAULT_BLUE_MIN_OCCURRENCES, RULES, RULES_BY_ID, TEXT_TAG_RE, TEXT_DECL_RE, ICON_HINT_RE, FONT_WEIGHT_RE, MIN_SINGLE_WEIGHT_OCCURRENCES, STYLE_BLOCK_RE, JSX_INLINE_STYLE_RE, INLINE_STYLE_ATTR_RE, UI_EXTENSIONS;
var init_anti_slop_linter = __esm({
  "src/verify/anti-slop-linter.ts"() {
    "use strict";
    init_verify();
    CLASS_ATTR_RE = /\b(?:className|class)\s*=\s*"([^"]*)"/g;
    JSX_BACKDROP_FILTER_RE = /\bbackdropFilter\s*:\s*['"][^'"]*\bblur\(\s*(?!0(?:px)?\s*\))[^)]+\)/g;
    JSX_BACKGROUND_CLIP_TEXT_RE = /\b(?:backgroundClip|WebkitBackgroundClip)\s*:\s*['"]\s*text\s*['"]/g;
    JSX_COLOR_TRANSPARENT_RE = /\bcolor\s*:\s*['"]\s*transparent\s*['"]/;
    ROUND_NUMBER_WHITESPACE_MIN_TOTAL = 4;
    ROUND_NUMBER_WHITESPACE_RATIO_THRESHOLD = 0.7;
    ROUND_NUMBER_VALUES = /* @__PURE__ */ new Set(["16", "24", "32", "48"]);
    ANY_SPACING_DECL_RE = /(padding|margin|gap)\s*:\s*(\d+)px(?![0-9])/g;
    DEFAULT_BLUE_CSS_RE = /(color|background-color|border-color|fill|stroke)\s*:\s*(#3b82f6|rgb\(\s*59\s*,\s*130\s*,\s*246\s*\)|var\(--tw-blue-500\)|var\(--color-blue-500\))/gi;
    DEFAULT_BLUE_TW_CLASS_RE = /\b(bg|text|border)-blue-(500|600|700)\b/;
    DEFAULT_BLUE_MIN_OCCURRENCES = 2;
    RULES = [
      // ── Hard-bans ────────────────────────────────────────────────────────────
      {
        id: "em-dash-ui",
        severity: "fail",
        // T1 (2026-05-24): broadened element scope to button|h1-6|label|a|p|span
        // (UI copy lives in p/span too) and allowed multi-line text content via
        // `[^<]*?` (was `[^<\n]*` which excluded newlines — caused the canonical
        // sample/index.html line 129 FN where `<h3 class="...">\n  10x...velocity—instantly\n</h3>`
        // spans multiple lines). `[^<]` still blocks bridging across tag boundaries.
        // Em-dash can appear anywhere mid-text now, not only at start/end.
        pattern: /(content\s*:\s*['"][^'"]*[—–][^'"]*['"])|(>[^<]*?[—–][^<]*?<\s*\/(button|h[1-6]|label|a|p|span)\b)/gi,
        message: "em-dash in UI text \u2014 reads as docs-prose, not interface copy.",
        suggestedFix: "Replace with explicit punctuation, comma, or line break."
      },
      {
        id: "gradient-text-headline",
        severity: "fail",
        // `background-clip: text` paired with `color: transparent` on/near an
        // interactive or headline selector. Window: 200 chars to give the
        // declaration room without bridging across whole files.
        pattern: /(h[1-6]|button|a\b|\.btn|\.button|\.heading|nav\s|\[role=['"]link['"]\])[\s\S]{0,200}?background-clip\s*:\s*text[\s\S]{0,120}?color\s*:\s*transparent/gi,
        message: "gradient text on headline/button/link \u2014 kills scanability and contrast.",
        suggestedFix: "Use a solid colour. Gradient text only for purely decorative, non-interactive accents."
      },
      {
        id: "default-glassmorphism",
        severity: "fail",
        // `backdrop-filter: blur(...)` without a wisp-justify comment within
        // 100 chars. Negative lookahead is bounded so cost stays linear.
        pattern: /backdrop-filter\s*:\s*blur\([^)]+\)(?![\s\S]{0,100}\/\*\s*wisp-justify)/gi,
        message: "glassmorphism without explicit rationale \u2014 default AI vibe.",
        suggestedFix: "Add `/* wisp-justify: <reason> */` within 100 chars, or remove the backdrop-filter."
      },
      {
        id: "hero-metric-template",
        severity: "fail",
        // Big font-size (≥80px) in close proximity to a "Nk+" / "Nx" / "$NM"
        // content string. Catches `font-size: 96px; ... content: "100k+"`.
        pattern: /font-size\s*:\s*(8\d|9\d|1[0-9]\d)px[\s\S]{0,300}?content\s*:\s*['"][^'"]*\d+(k\+|K\+|x|M\+|m\+|\+)[^'"]*['"]/g,
        message: "hero-metric template (huge number + 'k+'/'10x'/'$M+' suffix) \u2014 over-used AI hero pattern.",
        suggestedFix: "Use a real proof-point with attribution, a testimonial, or remove the metric."
      },
      {
        id: "side-stripe-decoration",
        severity: "fail",
        // ::before pseudo with absolute positioning at left:0, small width, and
        // a gradient background. Width bounded to 1-8px so we don't false-flag
        // legitimate sidebars.
        pattern: /::before\s*\{[\s\S]{0,300}?position\s*:\s*absolute[\s\S]{0,200}?left\s*:\s*0[\s\S]{0,150}?width\s*:\s*[1-8]px[\s\S]{0,200}?background\s*:[^;}]*linear-gradient/gi,
        message: "decorative side-stripe via ::before \u2014 Linear-clone tell, invisibly over-used.",
        suggestedFix: "Replace with a semantic priority indicator (icon + label) or remove the decoration."
      },
      {
        id: "purple-blue-gradient",
        severity: "fail",
        // linear-gradient containing BOTH a purple-ish stop AND a blue-ish stop.
        // Two alternations:
        //   (a) Hex/named-colour list — Tailwind v3 + CSS named colours.
        //   (b) [T3, 2026-05-24] OKLch colour-space with hue in 270-300deg (purple)
        //       co-occurring with hue in 240-265deg (blue). Tailwind v4 / Radix
        //       palettes emit oklch() so the hex-only path would miss them.
        //       Pattern is intentionally permissive: any `linear-gradient(...)`
        //       containing one purple-hue oklch and one blue-hue oklch, in either
        //       order. `(?:2[7-9]\d|300)` covers 270-300; `(?:24\d|25\d|26[0-5])`
        //       covers 240-265.
        pattern: /linear-gradient\([^)]*(?:(?:#5b21b6|#6d28d9|#7c3aed|#8b5cf6|#a855f7|#c084fc|purple|violet)[^)]*(?:#1d4ed8|#2563eb|#3b82f6|#60a5fa|#93c5fd|blue|indigo)|(?:#1d4ed8|#2563eb|#3b82f6|#60a5fa|#93c5fd|blue|indigo)[^)]*(?:#5b21b6|#6d28d9|#7c3aed|#8b5cf6|#a855f7|#c084fc|purple|violet)|oklch\([^)]*?(?:2[7-9]\d|300)(?:\.\d+)?(?:deg)?[^)]*?\)[^)]*?oklch\([^)]*?(?:24\d|25\d|26[0-5])(?:\.\d+)?(?:deg)?[^)]*?\)|oklch\([^)]*?(?:24\d|25\d|26[0-5])(?:\.\d+)?(?:deg)?[^)]*?\)[^)]*?oklch\([^)]*?(?:2[7-9]\d|300)(?:\.\d+)?(?:deg)?[^)]*?\))[^)]*\)/gi,
        message: "purple\u2192blue gradient \u2014 generic AI brand vibe.",
        suggestedFix: "Modulate lightness within one hue, or use the project palette colours from `.wisp/brand-spec.json`."
      },
      {
        id: "generic-ai-illustration",
        severity: "fail",
        // background-image referencing well-known generic illustration sources.
        pattern: /background-image\s*:\s*url\(['"]?[^'"]*?(undraw|drawkit|illustration\.[a-z]+|cartoon|blob\s*avatar|3d-blob)[^'"]*?['"]?\)/gi,
        message: "generic illustration reference (undraw/drawkit/3D-blob) \u2014 instantly-recognisable AI vibe.",
        suggestedFix: "Use a custom illustration or remove the illustration entirely."
      },
      // ── Soft suggestions ─────────────────────────────────────────────────────
      {
        id: "too-perfect-alignment",
        severity: "warn",
        // Symmetric `margin:0 auto` + `text-align:center` + symmetric padding +
        // explicit gap. Heuristic; tolerant of variance via 0,100 windows.
        pattern: /margin\s*:\s*0\s+auto\s*;[\s\S]{0,150}?text-align\s*:\s*center\s*;[\s\S]{0,150}?padding\s*:\s*\d+px\s+\d+px\s*;[\s\S]{0,150}?gap\s*:\s*\d+px/g,
        message: "too-perfect symmetric block \u2014 reads as wireframe, not designed page.",
        suggestedFix: "Introduce a small asymmetry (offset margin, sibling-specific padding, or asymmetric grid)."
      },
      {
        id: "round-number-whitespace",
        severity: "warn",
        // padding/margin/gap exactly equal to the Tailwind defaults 16/24/32/48.
        // The `pattern` field stays exported for tests that introspect it; the
        // RUNNER actually invokes `aggregator` below, which makes a single file-
        // level decision based on the round/total ratio.
        pattern: /(padding|margin|gap)\s*:\s*(16|24|32|48)px(?![0-9])/g,
        message: "round-number whitespace (16/24/32/48px) \u2014 reads as Tailwind-default.",
        suggestedFix: "Mix nearby steps (18/22/26/50) within a 4px grid to add considered rhythm.",
        aggregator: aggregateRoundNumberWhitespace
      },
      {
        id: "default-tailwind-blue",
        severity: "warn",
        // T5 (2026-05-24): extended scope.
        //   (a) property set: color | background-color | border-color | fill | stroke
        //       (was: color only; `background-color` was matched incidentally via
        //       substring of `color:` — explicit list is clearer and adds the
        //       fill/stroke FN).
        //   (b) brand-color whitelist: when `.wisp/brand-spec.json` is present
        //       and the offending colour matches any entry in `brand.colors`,
        //       the rule is skipped. Implemented via `aggregator` so the runner
        //       can pass the pre-loaded brand-color set in via closure.
        //   (c) Tailwind utility classes `(bg|text|border)-blue-{500..700}` —
        //       scanned in the className matcher pass, not here.
        // The exported `pattern` stays for tests that introspect it; the
        // RUNNER invokes `aggregator` which does the brand-whitelist filtering.
        pattern: /(color|background-color|border-color|fill|stroke)\s*:\s*(#3b82f6|rgb\(\s*59\s*,\s*130\s*,\s*246\s*\)|var\(--tw-blue-500\)|var\(--color-blue-500\))/gi,
        message: "default Tailwind blue (#3b82f6) used directly \u2014 single most over-used AI brand colour.",
        suggestedFix: "Use a project-defined accent OKLch with stated chroma, or pull from `.wisp/brand-spec.json`.",
        aggregator: aggregateDefaultTailwindBlue
      },
      // single-weight-typography is handled separately by `analyseFontWeights`
      // (counting distinct values across the file is a state-ful scan, not a
      // single-pass regex). Below entry stays for `RuleId` exhaustiveness only —
      // its pattern never matches.
      {
        id: "single-weight-typography",
        severity: "warn",
        pattern: / never /,
        // sentinel — `analyseFontWeights` decides.
        message: "only one font-weight in this file \u2014 flat typographic hierarchy.",
        suggestedFix: "Use 2-3 weights (e.g. 400 body, 500 label, 600 headline) to create scannable hierarchy."
      },
      {
        id: "all-rounded-corners",
        severity: "warn",
        // 4+ distinct selector-or-rule blocks each ending in border-radius:Npx.
        // Cheap heuristic: count `border-radius` occurrences in a single file.
        pattern: /border-radius\s*:\s*\d+px\s*;[\s\S]{0,2000}?border-radius\s*:\s*\d+px\s*;[\s\S]{0,2000}?border-radius\s*:\s*\d+px\s*;[\s\S]{0,2000}?border-radius\s*:\s*\d+px\s*;/g,
        message: "every surface has the same border-radius \u2014 no visual hierarchy.",
        suggestedFix: "Mix sharp + rounded across surfaces (0 / 4 / 8 / 16) instead of one value everywhere."
      }
    ];
    RULES_BY_ID = new Map(
      RULES.map((r) => [r.id, r])
    );
    TEXT_TAG_RE = /(^|[\s,>+~])(h[1-6]|p|span|a|button|label|li|blockquote|code|td|th|strong|em|small|figcaption|caption)\b/;
    TEXT_DECL_RE = /(?:^|[\s;{])(font-family|font-size|line-height|letter-spacing|color|text-[a-z-]+)\s*:/i;
    ICON_HINT_RE = /\.(icon|sr-only|visually-hidden|svg|chev|caret|spinner)\b|\[aria-hidden\b/;
    FONT_WEIGHT_RE = /font-weight\s*:\s*([1-9]\d{2}|normal|bold|lighter|bolder)/gi;
    MIN_SINGLE_WEIGHT_OCCURRENCES = 2;
    STYLE_BLOCK_RE = /<style[^>]*>([\s\S]*?)<\/style>/gi;
    JSX_INLINE_STYLE_RE = /\bstyle\s*=\s*\{\{([\s\S]*?)\}\}/g;
    INLINE_STYLE_ATTR_RE = /\bstyle\s*=\s*"([^"]*)"/g;
    UI_EXTENSIONS = /* @__PURE__ */ new Set([
      ".tsx",
      ".jsx",
      ".ts",
      ".js",
      ".vue",
      ".svelte",
      ".astro",
      ".html",
      ".htm",
      ".css",
      ".scss",
      ".sass"
    ]);
  }
});

// src/verify/_sandbox.ts
var sandbox_exports = {};
__export(sandbox_exports, {
  SandboxError: () => SandboxError,
  isLoopbackUrl: () => isLoopbackUrl,
  safeBrowserLaunch: () => safeBrowserLaunch
});
function isLoopbackUrl(u) {
  let parsed;
  try {
    parsed = new URL(u);
  } catch {
    return false;
  }
  const host = parsed.hostname.toLowerCase();
  return host === "127.0.0.1" || host === "localhost" || host === "[::1]";
}
function validateLivePreviewUrl(raw) {
  if (typeof raw !== "string" || raw === "") {
    throw new SandboxError("livePreviewUrl must be a non-empty string", "INVALID_URL", { raw });
  }
  let url;
  try {
    url = new URL(raw);
  } catch (err) {
    throw new SandboxError("livePreviewUrl is not a valid URL", "INVALID_URL", {
      raw,
      cause: err.message
    });
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new SandboxError(
      `livePreviewUrl protocol must be http or https, got "${url.protocol}"`,
      "INVALID_PROTOCOL",
      { raw, protocol: url.protocol }
    );
  }
  if (url.username !== "" || url.password !== "") {
    throw new SandboxError(
      "livePreviewUrl must not contain user:password credentials",
      "USERINFO_FORBIDDEN",
      { raw }
    );
  }
  if (!isLoopbackUrl(raw)) {
    throw new SandboxError(
      `livePreviewUrl host "${url.hostname}" is not loopback (only 127.0.0.1, localhost, [::1] allowed)`,
      "NON_LOOPBACK_URL",
      { raw, hostname: url.hostname }
    );
  }
  const portStr = url.port;
  if (portStr === "") {
    throw new SandboxError("livePreviewUrl must specify an explicit port", "INVALID_PORT", { raw });
  }
  const port = Number.parseInt(portStr, 10);
  if (!Number.isFinite(port) || port <= 1024 || port >= 65536) {
    throw new SandboxError(
      `livePreviewUrl port ${portStr} is out of allowed range (1025-65535)`,
      "INVALID_PORT",
      { raw, port: portStr }
    );
  }
  return { url, hostname: url.hostname.toLowerCase(), port };
}
function isLoopbackHostname(hostname) {
  const h = hostname.toLowerCase();
  return h === "127.0.0.1" || h === "localhost" || h === "::1" || h === "[::1]";
}
async function importChromium() {
  let mod;
  try {
    mod = await import("playwright");
  } catch (err) {
    const e = err;
    const isMissing = e.code === "ERR_MODULE_NOT_FOUND" || e.code === "MODULE_NOT_FOUND" || /Cannot find module 'playwright'/.test(e.message ?? "");
    if (isMissing) {
      throw new SandboxError(
        "playwright is not installed (optional dependency). Install with `npm i playwright` and then `npx playwright install chromium`.",
        "PLAYWRIGHT_MISSING"
      );
    }
    throw new SandboxError(
      `failed to load playwright: ${e.message ?? String(err)}`,
      "PLAYWRIGHT_MISSING",
      { cause: e }
    );
  }
  if (typeof mod.chromium?.launch !== "function") {
    throw new SandboxError("playwright loaded but `chromium.launch` is not a function", "PLAYWRIGHT_MISSING");
  }
  return mod.chromium;
}
async function safeBrowserLaunch(opts) {
  validateLivePreviewUrl(opts.livePreviewUrl);
  const budgetMs = opts.budgetMs ?? 5e3;
  const consoleBufferSize = opts.consoleBufferSize ?? 200;
  const chromium = await importChromium();
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: [
        "--disable-extensions",
        "--no-default-browser-check",
        "--no-first-run",
        "--disable-component-extensions-with-background-pages",
        "--disable-background-networking",
        "--disable-sync",
        "--disable-translate",
        "--metrics-recording-only",
        "--mute-audio",
        "--no-pings"
      ],
      timeout: budgetMs
    });
  } catch (err) {
    const msg = err.message ?? String(err);
    if (/Executable doesn't exist|browserType\.launch/i.test(msg)) {
      throw new SandboxError(
        "chromium binary missing. Run `npx playwright install chromium` once.",
        "CHROMIUM_MISSING",
        { cause: msg }
      );
    }
    throw new SandboxError(`chromium.launch failed: ${msg}`, "LAUNCH_FAILED", {
      cause: msg
    });
  }
  const context = await browser.newContext({
    acceptDownloads: false,
    permissions: []
  });
  let blockedRequestCount = 0;
  await context.route("**/*", (route, request) => {
    let reqHost;
    try {
      reqHost = new URL(request.url()).hostname;
    } catch {
      blockedRequestCount += 1;
      void route.abort("blockedbyclient");
      return;
    }
    if (!isLoopbackHostname(reqHost)) {
      blockedRequestCount += 1;
      void route.abort("blockedbyclient");
      return;
    }
    void route.continue();
  });
  const messages = [];
  const errors = [];
  let closed = false;
  function pushRing(buf, item) {
    if (buf.length >= consoleBufferSize) {
      buf.shift();
    }
    buf.push(item);
  }
  async function newPage() {
    const page = await context.newPage();
    page.setDefaultTimeout(budgetMs);
    page.on("dialog", (dialog) => {
      void dialog.dismiss().catch(() => void 0);
    });
    page.on("download", (download) => {
      void download.cancel().catch(() => void 0);
    });
    page.on("console", (msg) => {
      pushRing(messages, {
        type: msg.type(),
        text: msg.text(),
        capturedAt: (/* @__PURE__ */ new Date()).toISOString()
      });
    });
    page.on("pageerror", (err) => {
      pushRing(errors, {
        message: err.message,
        stack: err.stack,
        capturedAt: (/* @__PURE__ */ new Date()).toISOString()
      });
    });
    return page;
  }
  async function close() {
    if (closed) return;
    closed = true;
    try {
      await context.close();
    } catch {
    }
    try {
      await browser.close();
    } catch {
    }
  }
  function drainConsole() {
    const out = { messages: messages.slice(), errors: errors.slice() };
    messages.length = 0;
    errors.length = 0;
    return out;
  }
  const handle = {
    newPage,
    close,
    get blockedRequestCount() {
      return blockedRequestCount;
    },
    drainConsole
  };
  return handle;
}
var SandboxError;
var init_sandbox = __esm({
  "src/verify/_sandbox.ts"() {
    "use strict";
    SandboxError = class extends Error {
      constructor(message, code, detail) {
        super(message);
        this.code = code;
        this.detail = detail;
        this.name = "SandboxError";
      }
      code;
      detail;
    };
  }
});

// src/verify/a11y-axe.ts
var a11y_axe_exports = {};
__export(a11y_axe_exports, {
  runA11yAxe: () => runA11yAxe
});
async function loadAxe() {
  try {
    const mod = await import("axe-core");
    if (mod.default !== void 0 && typeof mod.default.run === "function") {
      return mod.default;
    }
    return mod;
  } catch {
    return null;
  }
}
async function loadJsdom() {
  try {
    return await import("jsdom");
  } catch {
    return null;
  }
}
async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch {
    return null;
  }
}
function levelFromTags(tags) {
  let highest = "A";
  for (const t of tags) {
    if (/^wcag\d{1,2}aaa$/i.test(t)) return "AAA";
    if (/^wcag\d{1,2}aa$/i.test(t)) highest = highest === "AAA" ? "AAA" : "AA";
  }
  return highest;
}
function severityFor(level, impact) {
  if (level === "AAA") return "warn";
  if (level === "AA" && (impact === "serious" || impact === "critical")) {
    return "fail";
  }
  return "warn";
}
function mapAxeViolation(v) {
  const impact = v.impact ?? "moderate";
  const level = levelFromTags(v.tags);
  const severity = severityFor(level, impact);
  const nodes = v.nodes.map((n) => {
    const selector = n.target.length === 0 ? "" : Array.isArray(n.target[0]) ? n.target[0].join(" >>> ") : n.target[0];
    return n.html !== void 0 ? { selector, html: n.html } : { selector };
  });
  const vUnknown = v;
  const baseHelp = typeof vUnknown.help === "string" ? vUnknown.help : v.id;
  const firstSelector = nodes.length > 0 ? nodes[0]?.selector ?? "" : "";
  const message = firstSelector !== "" ? `${baseHelp} (${firstSelector}${nodes.length > 1 ? ` +${nodes.length - 1} more` : ""})` : baseHelp;
  const out = {
    ruleId: v.id,
    impact,
    level,
    severity,
    nodes,
    message
  };
  if (v.helpUrl !== void 0) out.helpUrl = v.helpUrl;
  return out;
}
async function loadSandbox() {
  try {
    return await Promise.resolve().then(() => (init_sandbox(), sandbox_exports));
  } catch {
    return null;
  }
}
async function runViaPlaywright(livePreviewUrl, axe) {
  const sandbox = await loadSandbox();
  if (sandbox === null) {
    throw new Error("sandbox not available");
  }
  const handle = await sandbox.safeBrowserLaunch({
    livePreviewUrl,
    budgetMs: A11Y_AXE_BUDGET_MS
  });
  try {
    const page = await handle.newPage();
    try {
      await page.goto(livePreviewUrl, {
        timeout: A11Y_AXE_BUDGET_MS,
        waitUntil: "domcontentloaded"
      });
      await page.addScriptTag({
        content: axe.source
      });
      const results = await page.evaluate(async () => {
        const a = globalThis.axe;
        return a.run(document, {
          runOnly: {
            type: "tag",
            values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]
          },
          // Exclude wisp's own floating-bar UI from the audit.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          exclude: [["[data-wisp-ui]"]]
        });
      });
      return results.violations.map(mapAxeViolation);
    } finally {
      try {
        await page.close();
      } catch {
      }
    }
  } finally {
    try {
      await handle.close();
    } catch {
    }
  }
}
async function runViaJsdom(html, axe) {
  const jsdomMod = await loadJsdom();
  if (jsdomMod === null) {
    throw new Error("jsdom not available \u2014 install jsdom for non-live a11y-axe");
  }
  const dom = new jsdomMod.JSDOM(html, {
    // Don't run scripts — axe is injected manually and we don't want
    // arbitrary author JS to execute.
    runScripts: "outside-only",
    pretendToBeVisual: true,
    // Suppress jsdom console noise (resource-load warnings etc.) so they
    // don't leak into the wisp-design audit output.
    virtualConsole: new jsdomMod.VirtualConsole()
    // Default `resources` (undefined) means jsdom does NOT fetch external
    // resources — <link href="cdn.tailwind..."> is silently ignored. This is
    // what we want: no network I/O, no timeout hanging on CDN fetches.
  });
  const win = dom.window;
  const spliceGlobal = (key, value) => {
    const desc = Object.getOwnPropertyDescriptor(globalThis, key);
    const prev = desc !== void 0 && "value" in desc ? desc.value : globalThis[key];
    Object.defineProperty(globalThis, key, {
      value,
      configurable: true,
      writable: true,
      enumerable: true
    });
    return prev;
  };
  const restoreGlobal = (key, value) => {
    Object.defineProperty(globalThis, key, {
      value,
      configurable: true,
      writable: true,
      enumerable: true
    });
  };
  const savedWindow = spliceGlobal("window", win);
  const savedDocument = spliceGlobal("document", win.document);
  const savedNavigator = spliceGlobal("navigator", win.navigator);
  try {
    const results = await axe.run(win.document.documentElement, {
      runOnly: {
        type: "tag",
        values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]
      }
    });
    return results.violations.map(mapAxeViolation);
  } finally {
    restoreGlobal("window", savedWindow);
    restoreGlobal("document", savedDocument);
    restoreGlobal("navigator", savedNavigator);
    try {
      dom.window.close();
    } catch {
    }
  }
}
async function runA11yAxe(opts) {
  const startedAt = Date.now();
  const axe = await loadAxe();
  if (axe === null) {
    return {
      name: "a11y-axe",
      severity: "warn",
      durationMs: Date.now() - startedAt,
      skipped: { reason: "error", detail: "axe-core import failed" }
    };
  }
  try {
    let violations;
    if (opts.livePreviewUrl !== void 0) {
      const pw = await loadPlaywright();
      if (pw !== null) {
        violations = await runViaPlaywright(opts.livePreviewUrl, axe);
      } else if (opts.html !== void 0) {
        violations = await runViaJsdom(opts.html, axe);
      } else {
        return {
          name: "a11y-axe",
          severity: "pass",
          durationMs: Date.now() - startedAt,
          skipped: {
            reason: "optional-dep-missing",
            detail: "playwright missing and no html fallback supplied"
          }
        };
      }
    } else if (opts.html !== void 0) {
      violations = await runViaJsdom(opts.html, axe);
    } else {
      return {
        name: "a11y-axe",
        severity: "warn",
        durationMs: Date.now() - startedAt,
        skipped: { reason: "error", detail: "neither html nor livePreviewUrl supplied" }
      };
    }
    const durationMs = Date.now() - startedAt;
    const severity = violations.some((v) => v.severity === "fail") ? "fail" : violations.some((v) => v.severity === "warn") ? "warn" : "pass";
    return {
      name: "a11y-axe",
      severity,
      durationMs,
      violations
    };
  } catch (err) {
    return {
      name: "a11y-axe",
      severity: "warn",
      durationMs: Date.now() - startedAt,
      skipped: {
        reason: "error",
        detail: err.message
      }
    };
  }
}
var init_a11y_axe = __esm({
  "src/verify/a11y-axe.ts"() {
    "use strict";
    init_verify();
  }
});

// src/verify/console-scan.ts
var console_scan_exports = {};
__export(console_scan_exports, {
  runConsoleScan: () => runConsoleScan
});
import { promises as fs7 } from "fs";
function scanText(text, source, cap = 50, startedIso = (/* @__PURE__ */ new Date()).toISOString()) {
  if (text === "") return [];
  const out = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    if (line === "") continue;
    if (PATTERN_RE.test(line)) {
      const trimmed = line.length > 240 ? `${line.slice(0, 239)}\u2026` : line;
      out.push({
        message: `[${source}] ${trimmed}`,
        pattern: PATTERN_SRC,
        firstSeenAt: startedIso
      });
      if (out.length >= cap) break;
    }
  }
  return out;
}
async function scanSessionLog(sessionLogPath2) {
  let raw;
  try {
    raw = await fs7.readFile(sessionLogPath2, "utf8");
  } catch (err) {
    const code = err.code;
    if (code === "ENOENT" || code === "ENOTDIR") return [];
    throw err;
  }
  const out = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === "") continue;
    if (PATTERN_RE.test(trimmed)) {
      let parsedTs;
      try {
        const obj = JSON.parse(trimmed);
        if (typeof obj.at === "string") parsedTs = obj.at;
      } catch {
      }
      const truncated = trimmed.length > 240 ? `${trimmed.slice(0, 239)}\u2026` : trimmed;
      out.push({
        message: `[session-log] ${truncated}`,
        pattern: PATTERN_SRC,
        firstSeenAt: parsedTs ?? (/* @__PURE__ */ new Date()).toISOString()
      });
      if (out.length >= 50) break;
    }
  }
  return out;
}
async function scanBridgePoll(bridgeUrl, token, timeoutMs) {
  const url = `${bridgeUrl.replace(/\/$/, "")}/poll?token=${encodeURIComponent(
    token
  )}&timeout=${Math.max(1e3, Math.min(timeoutMs, 1500))}&leaseMs=0`;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ac.signal });
    if (!res.ok) return [];
    const body = await res.json();
    const out = [];
    for (const ev of body.events ?? []) {
      if (ev.kind === "error") {
        out.push({
          message: `[bridge] ${ev.message ?? "(no message)"}`,
          pattern: PATTERN_SRC,
          firstSeenAt: (/* @__PURE__ */ new Date()).toISOString()
        });
      }
    }
    return out;
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}
async function runConsoleScan(opts) {
  const startedAt = Date.now();
  const budgetBase = opts.budgetStartedAt ?? startedAt;
  const aggregate = [];
  try {
    if (opts.sessionLogPath !== void 0) {
      const items = await scanSessionLog(opts.sessionLogPath);
      aggregate.push(...items);
    }
    if (opts.bridgeUrl !== void 0 && opts.token !== void 0 && Date.now() - budgetBase < CONSOLE_SCAN_BUDGET_MS - 300) {
      const items = await scanBridgePoll(
        opts.bridgeUrl,
        opts.token,
        // Reserve 300ms for the final assembly tail.
        CONSOLE_SCAN_BUDGET_MS - (Date.now() - budgetBase) - 300
      );
      aggregate.push(...items);
    }
    if (opts.cssOrHtml !== void 0) {
      const scripts = [];
      const blockRe = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
      let m;
      while ((m = blockRe.exec(opts.cssOrHtml)) !== null) {
        scripts.push(m[1] ?? "");
      }
      const text = scripts.join("\n");
      if (text !== "") {
        aggregate.push(...scanText(text, "static-script"));
      }
    }
    const noInputs = opts.sessionLogPath === void 0 && opts.bridgeUrl === void 0 && (opts.cssOrHtml === void 0 || !/<script\b/i.test(opts.cssOrHtml));
    if (noInputs && aggregate.length === 0) {
      return {
        name: "console-scan",
        severity: "pass",
        durationMs: Date.now() - startedAt,
        skipped: {
          reason: "error",
          detail: "no session log, bridge, or <script> content to scan"
        }
      };
    }
    const severity = aggregate.some((c) => SEVERE_RE.test(c.message)) ? "fail" : aggregate.length > 0 ? "warn" : "pass";
    return {
      name: "console-scan",
      severity,
      durationMs: Date.now() - startedAt,
      violations: aggregate
    };
  } catch (err) {
    return {
      name: "console-scan",
      severity: "pass",
      durationMs: Date.now() - startedAt,
      skipped: {
        reason: "error",
        detail: err.message
      }
    };
  }
}
var PATTERN_SRC, PATTERN_RE, SEVERE_RE;
var init_console_scan = __esm({
  "src/verify/console-scan.ts"() {
    "use strict";
    init_verify();
    PATTERN_SRC = "error|warn|fail|exception|uncaught|cannot read";
    PATTERN_RE = new RegExp(`(?:${PATTERN_SRC})`, "i");
    SEVERE_RE = /\b(error|exception|uncaught|cannot read)\b/i;
  }
});

// src/verify/tab-order.ts
var tab_order_exports = {};
__export(tab_order_exports, {
  runTabOrder: () => runTabOrder
});
async function loadJsdom2() {
  try {
    return await import("jsdom");
  } catch {
    return null;
  }
}
function mkTabViolation(kind, selector, message) {
  return { kind, selector, detail: message, message };
}
function detectNonzeroTabindex(doc) {
  const out = [];
  const elements = doc.querySelectorAll("[tabindex]");
  elements.forEach((el) => {
    const raw = el.getAttribute("tabindex");
    if (raw === null) return;
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) return;
    const sel = cssPathFor(el);
    out.push(
      mkTabViolation(
        "nonzero-tabindex",
        sel,
        `${sel} has tabindex=${raw} (positive) \u2014 disrupts natural tab order; use tabindex="0" or remove`
      )
    );
  });
  return out;
}
function detectMissingFocusRing(doc) {
  const css = [];
  const styles = doc.querySelectorAll("style");
  styles.forEach((s) => {
    css.push(s.textContent ?? "");
  });
  const inline = css.join("\n");
  const hasFocusVisibleRule = /:focus(-visible)?\b/.test(inline);
  const out = [];
  const elements = doc.querySelectorAll(INTERACTIVE_SELECTORS.join(","));
  elements.forEach((el) => {
    if (hasFocusVisibleRule) return;
    const sel = cssPathFor(el);
    out.push(
      mkTabViolation(
        "missing-focus-ring",
        sel,
        `${sel} has no :focus or :focus-visible rule \u2014 keyboard users will see no focus indicator`
      )
    );
  });
  return out.slice(0, 10);
}
function detectFocusTrapLeak(doc) {
  const dialogs = [];
  doc.querySelectorAll('[role="dialog"],[role="alertdialog"],dialog').forEach((d) => {
    const aria = d.getAttribute("aria-modal");
    if (d.tagName.toLowerCase() === "dialog" || aria === "true") {
      dialogs.push(d);
    }
  });
  if (dialogs.length === 0) return [];
  const out = [];
  for (const dialog of dialogs) {
    const all = doc.querySelectorAll(INTERACTIVE_SELECTORS.join(","));
    const leaks = [];
    all.forEach((el) => {
      if (dialog.contains(el)) return;
      let p = el;
      let hidden = false;
      while (p !== null) {
        if (p.getAttribute("aria-hidden") === "true" || p.hasAttribute("inert")) {
          hidden = true;
          break;
        }
        p = p.parentElement;
      }
      if (!hidden) leaks.push(el);
    });
    if (leaks.length > 0) {
      const sel = cssPathFor(dialog);
      const n = leaks.length;
      out.push(
        mkTabViolation(
          "focus-trap-leak",
          sel,
          `${sel} is an open modal but ${n} focusable element${n > 1 ? "s are" : " is"} reachable outside \u2014 tab focus escapes the trap`
        )
      );
    }
  }
  return out;
}
function cssPathFor(el) {
  if (el.id !== "") return `#${el.id}`;
  const tag = el.tagName.toLowerCase();
  const cls = el.getAttribute("class");
  if (cls !== null && cls.trim() !== "") {
    const first = cls.trim().split(/\s+/)[0];
    return `${tag}.${first}`;
  }
  return tag;
}
async function runTabOrder(opts) {
  const startedAt = Date.now();
  const jsdomMod = await loadJsdom2();
  if (jsdomMod === null) {
    return {
      name: "tab-order",
      severity: "warn",
      durationMs: Date.now() - startedAt,
      skipped: {
        reason: "error",
        detail: "jsdom not available"
      }
    };
  }
  try {
    const dom = new jsdomMod.JSDOM(opts.html);
    const doc = dom.window.document;
    const violations = [
      ...detectFocusTrapLeak(doc),
      ...detectMissingFocusRing(doc),
      ...detectNonzeroTabindex(doc)
    ];
    try {
      dom.window.close();
    } catch {
    }
    const severity = violations.length > 0 ? "warn" : "pass";
    const durationMs = Date.now() - startedAt;
    if (durationMs > TAB_ORDER_BUDGET_MS) {
    }
    return {
      name: "tab-order",
      severity,
      durationMs,
      violations
    };
  } catch (err) {
    return {
      name: "tab-order",
      severity: "warn",
      durationMs: Date.now() - startedAt,
      skipped: {
        reason: "error",
        detail: err.message
      }
    };
  }
}
var INTERACTIVE_SELECTORS;
var init_tab_order = __esm({
  "src/verify/tab-order.ts"() {
    "use strict";
    init_verify();
    INTERACTIVE_SELECTORS = [
      "a[href]",
      "button:not([disabled])",
      "input:not([disabled])",
      "select:not([disabled])",
      "textarea:not([disabled])",
      "[tabindex]",
      '[contenteditable="true"]'
    ];
  }
});

// src/verify/reduced-motion.ts
var reduced_motion_exports = {};
__export(reduced_motion_exports, {
  runReducedMotion: () => runReducedMotion
});
async function runReducedMotion(opts) {
  const startedAt = Date.now();
  const css = opts.css ?? "";
  let combined = css;
  if (opts.html !== void 0) {
    const blocks = [];
    const blockRe = /<style[^>]*>([\s\S]*?)<\/style>/gi;
    let m;
    while ((m = blockRe.exec(opts.html)) !== null) {
      blocks.push(m[1] ?? "");
    }
    if (blocks.length > 0) {
      combined = `${combined}
${blocks.join("\n")}`;
    }
  }
  if (combined === "") {
    return {
      name: "reduced-motion",
      severity: "pass",
      durationMs: Date.now() - startedAt,
      violations: []
    };
  }
  if (Date.now() - (opts.budgetStartedAt ?? startedAt) > REDUCED_MOTION_BUDGET_MS) {
    return {
      name: "reduced-motion",
      severity: "pass",
      durationMs: Date.now() - startedAt,
      skipped: { reason: "timeout" }
    };
  }
  const hasMotion = MOTION_RE.test(combined);
  const hasGuard = PREFERS_REDUCED_RE.test(combined);
  const violations = [];
  if (hasMotion && !hasGuard) {
    violations.push({
      selector: "@stylesheet",
      diffArea: 0,
      threshold: 0
    });
  }
  if (!hasGuard) {
    LONG_DURATION_RE.lastIndex = 0;
    let m;
    let hits = 0;
    while ((m = LONG_DURATION_RE.exec(combined)) !== null) {
      violations.push({
        selector: `@long-motion[${m[2] ?? "?"}s]`,
        diffArea: 1e3,
        // synthetic — represents "would-diff-a-lot"
        threshold: 50
      });
      hits += 1;
      if (hits >= 5) break;
      if (m.index === LONG_DURATION_RE.lastIndex) {
        LONG_DURATION_RE.lastIndex += 1;
      }
    }
  }
  const severity = violations.length > 0 ? "warn" : "pass";
  return {
    name: "reduced-motion",
    severity,
    durationMs: Date.now() - startedAt,
    violations
  };
}
var MOTION_RE, PREFERS_REDUCED_RE, LONG_DURATION_RE;
var init_reduced_motion = __esm({
  "src/verify/reduced-motion.ts"() {
    "use strict";
    init_verify();
    MOTION_RE = /\b(transition|animation|transform)\s*:/i;
    PREFERS_REDUCED_RE = /@media\s*\([^)]*prefers-reduced-motion\s*:\s*reduce/i;
    LONG_DURATION_RE = /\b(animation|transition)\b[^{};]*?(\b[5-9]s|\b[1-9]\d+s)\b/gi;
  }
});

// src/verify/multi-viewport.ts
var multi_viewport_exports = {};
__export(multi_viewport_exports, {
  runMultiViewport: () => runMultiViewport
});
import { promises as fs8 } from "fs";
import { dirname as dirname4, join as join5, resolve as resolve7 } from "path";
async function loadPlaywright2() {
  try {
    const m = await import("playwright");
    return m;
  } catch {
    return null;
  }
}
async function chromiumInstalled(pw) {
  try {
    if (typeof pw.chromium.executablePath !== "function") return true;
    const p = pw.chromium.executablePath();
    if (p === "") return false;
    await fs8.stat(p);
    return true;
  } catch {
    return false;
  }
}
async function loadSandbox2() {
  try {
    return await Promise.resolve().then(() => (init_sandbox(), sandbox_exports));
  } catch {
    return null;
  }
}
async function inlineLaunch(pw, url) {
  const u = new URL(url);
  if (u.hostname !== "localhost" && u.hostname !== "127.0.0.1") {
    throw new Error(`multi-viewport refuses non-localhost URL: ${url}`);
  }
  const browser = await pw.chromium.launch({
    headless: true,
    args: [
      "--disable-extensions",
      "--no-default-browser-check",
      "--no-first-run"
    ]
  });
  const context = await browser.newContext();
  return {
    newPage: () => context.newPage(),
    async close() {
      try {
        await context.close();
      } catch {
      }
      try {
        await browser.close();
      } catch {
      }
    }
  };
}
async function runMultiViewport(opts) {
  const startedAt = Date.now();
  const budgetBase = opts.budgetStartedAt ?? startedAt;
  const pw = await loadPlaywright2();
  if (pw === null) {
    return {
      name: "multi-viewport",
      severity: "pass",
      durationMs: Date.now() - startedAt,
      skipped: {
        reason: "optional-dep-missing",
        detail: "playwright not installed (optional dependency)"
      }
    };
  }
  if (!await chromiumInstalled(pw)) {
    return {
      name: "multi-viewport",
      severity: "pass",
      durationMs: Date.now() - startedAt,
      skipped: {
        reason: "optional-dep-missing",
        detail: "chromium binary not found \u2014 run `npx playwright install chromium`"
      }
    };
  }
  const dest = resolve7(
    opts.projectRoot,
    ".wisp/sessions",
    opts.sessionId,
    "screenshots",
    opts.variantId
  );
  try {
    await fs8.mkdir(dest, { recursive: true });
  } catch (err) {
    return {
      name: "multi-viewport",
      severity: "warn",
      durationMs: Date.now() - startedAt,
      skipped: {
        reason: "error",
        detail: `mkdir failed: ${err.message}`
      }
    };
  }
  const sandbox = await loadSandbox2();
  let handle = null;
  try {
    handle = sandbox !== null ? await sandbox.safeBrowserLaunch({
      livePreviewUrl: opts.livePreviewUrl,
      budgetMs: MULTI_VIEWPORT_BUDGET_MS - 500
    }) : await inlineLaunch(pw, opts.livePreviewUrl);
    const screenshots = [];
    for (const vp of DEFAULT_VIEWPORTS) {
      if (Date.now() - budgetBase > MULTI_VIEWPORT_BUDGET_MS - 400) break;
      const page = await handle.newPage();
      try {
        await page.setViewportSize({ width: vp.w, height: vp.h });
        await page.goto(opts.livePreviewUrl, {
          timeout: 4e3,
          waitUntil: "domcontentloaded"
        });
        for (const scheme of DEFAULT_COLOR_SCHEMES) {
          if (Date.now() - budgetBase > MULTI_VIEWPORT_BUDGET_MS - 400) break;
          await page.emulateMedia({ colorScheme: scheme });
          const outPath = join5(dest, `${vp.label}.${scheme}.png`);
          await fs8.mkdir(dirname4(outPath), { recursive: true });
          await page.screenshot({ path: outPath, fullPage: false });
          screenshots.push({
            viewport: { w: vp.w, h: vp.h, label: vp.label },
            mode: scheme,
            path: outPath
          });
        }
      } finally {
        try {
          await page.close();
        } catch {
        }
      }
    }
    return {
      name: "multi-viewport",
      // Phase 5: no automatic regression detection. We capture; Phase 6
      // compares against baselines for an actual fail/warn signal.
      severity: "pass",
      durationMs: Date.now() - startedAt,
      screenshots,
      violations: []
    };
  } catch (err) {
    return {
      name: "multi-viewport",
      severity: "warn",
      durationMs: Date.now() - startedAt,
      skipped: {
        reason: "error",
        detail: err.message
      }
    };
  } finally {
    if (handle !== null) {
      try {
        await handle.close();
      } catch {
      }
    }
  }
}
var init_multi_viewport = __esm({
  "src/verify/multi-viewport.ts"() {
    "use strict";
    init_verify();
  }
});

// src/verify/gate.ts
var gate_exports = {};
__export(gate_exports, {
  gate: () => gate,
  run: () => run,
  runAntiSlop: () => runAntiSlopDirect
});
function budgetForCheck(name, mode) {
  return CHECK_BUDGET_MS[name] * MODE_CHECK_BUDGET_MULTIPLIER[mode];
}
function runWithTimeout(name, work, budgetMs) {
  return new Promise((resolveOuter) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolveOuter({
        name,
        severity: "warn",
        durationMs: budgetMs,
        skipped: { reason: "timeout", detail: `> ${budgetMs}ms` }
      });
    }, budgetMs);
    work.then(
      (v) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolveOuter(v);
      },
      (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolveOuter({
          name,
          severity: "warn",
          durationMs: 0,
          skipped: {
            reason: "error",
            detail: err instanceof Error ? err.message : String(err)
          }
        });
      }
    );
  });
}
async function dispatchCheck(name, ctx) {
  const budgetStartedAt = Date.now();
  switch (name) {
    case "anti-slop": {
      const { runAntiSlop: runAntiSlop2, runAntiSlopOnFiles: runAntiSlopOnFiles2 } = await Promise.resolve().then(() => (init_anti_slop_linter(), anti_slop_linter_exports));
      const cssSource = ctx.cssToCheck ?? ctx.afterContent ?? ctx.beforeContent ?? "";
      if (ctx.diffSummary !== void 0 && ctx.diffSummary.files.length > 0) {
        return runAntiSlopOnFiles2(ctx.diffSummary.files, {
          mode: ctx.mode,
          projectRoot: ctx.projectRoot,
          budgetStartedAt,
          // Inner per-call budget MUST match the outer runWithTimeout budget
          // (set in run() via budgetForCheck). Both scale by mode multiplier.
          perCallBudgetMs: budgetForCheck("anti-slop", ctx.mode)
        });
      }
      return runAntiSlop2(cssSource, { mode: ctx.mode, budgetStartedAt });
    }
    case "a11y-axe": {
      const { runA11yAxe: runA11yAxe2 } = await Promise.resolve().then(() => (init_a11y_axe(), a11y_axe_exports));
      const args = { budgetStartedAt };
      if (ctx.afterContent !== void 0) args.html = ctx.afterContent;
      if (ctx.livePreviewUrl !== void 0) args.livePreviewUrl = ctx.livePreviewUrl;
      return runA11yAxe2(args);
    }
    case "console-scan": {
      const { runConsoleScan: runConsoleScan2 } = await Promise.resolve().then(() => (init_console_scan(), console_scan_exports));
      const args = { budgetStartedAt };
      if (ctx.sessionId !== void 0) {
        args.sessionLogPath = `${ctx.projectRoot}/.wisp/sessions/${ctx.sessionId}.jsonl`;
      }
      if (ctx.bridgeUrl !== void 0) args.bridgeUrl = ctx.bridgeUrl;
      if (ctx.token !== void 0) args.token = ctx.token;
      if (ctx.afterContent !== void 0) args.cssOrHtml = ctx.afterContent;
      return runConsoleScan2(args);
    }
    case "tab-order": {
      const { runTabOrder: runTabOrder2 } = await Promise.resolve().then(() => (init_tab_order(), tab_order_exports));
      const html = ctx.afterContent ?? "";
      return runTabOrder2({ html, budgetStartedAt });
    }
    case "reduced-motion": {
      const { runReducedMotion: runReducedMotion2 } = await Promise.resolve().then(() => (init_reduced_motion(), reduced_motion_exports));
      const args = {
        css: ctx.cssToCheck ?? ctx.afterContent ?? "",
        budgetStartedAt
      };
      if (ctx.afterContent !== void 0) args.html = ctx.afterContent;
      return runReducedMotion2(args);
    }
    case "multi-viewport": {
      const { runMultiViewport: runMultiViewport2 } = await Promise.resolve().then(() => (init_multi_viewport(), multi_viewport_exports));
      if (ctx.livePreviewUrl === void 0 || ctx.sessionId === void 0 || ctx.variantId === void 0) {
        return {
          name: "multi-viewport",
          severity: "warn",
          durationMs: Date.now() - budgetStartedAt,
          skipped: {
            reason: "error",
            detail: "missing livePreviewUrl / sessionId / variantId \u2014 multi-viewport requires all three"
          }
        };
      }
      return runMultiViewport2({
        livePreviewUrl: ctx.livePreviewUrl,
        sessionId: ctx.sessionId,
        variantId: ctx.variantId,
        projectRoot: ctx.projectRoot,
        budgetStartedAt
      });
    }
    default: {
      const _exhaustive = name;
      return {
        name: _exhaustive,
        severity: "pass",
        durationMs: 0,
        skipped: { reason: "error", detail: "unknown check name" }
      };
    }
  }
}
async function run(ctx) {
  const startedAt = Date.now();
  const mode = ctx.mode;
  const checks = MODE_CHECK_SETS[mode];
  const budgetMs = MODE_TIMING_BUDGET_MS[mode];
  const promises = checks.map(
    (name) => runWithTimeout(
      name,
      dispatchCheck(name, ctx),
      Math.min(budgetForCheck(name, mode), budgetMs)
    )
  );
  const settled = await Promise.allSettled(promises);
  const resolved = settled.map((s, i) => {
    if (s.status === "fulfilled") return s.value;
    return {
      name: checks[i] ?? "anti-slop",
      severity: "warn",
      durationMs: 0,
      skipped: {
        reason: "error",
        detail: s.reason instanceof Error ? s.reason.message : String(s.reason)
      }
    };
  });
  const totalMs = Date.now() - startedAt;
  const verdict = worstSeverity(resolved);
  const counts = aggregateCounts(resolved);
  const blocked = verdict === "fail" && MODE_BLOCKS_ON_FAIL[mode];
  return {
    verdict,
    mode,
    checks: resolved,
    timing: {
      totalMs,
      budgetMs,
      budgetExceeded: totalMs > budgetMs
    },
    ...counts,
    blocked
  };
}
async function runAntiSlopDirect(css, ctx) {
  const { runAntiSlop: runAntiSlop2 } = await Promise.resolve().then(() => (init_anti_slop_linter(), anti_slop_linter_exports));
  const args = {};
  if (ctx.mode !== void 0) args.mode = ctx.mode;
  return runAntiSlop2(css, args);
}
var MODE_CHECK_BUDGET_MULTIPLIER, gate;
var init_gate = __esm({
  "src/verify/gate.ts"() {
    "use strict";
    init_verify();
    MODE_CHECK_BUDGET_MULTIPLIER = {
      "stop-hook": 1,
      "live-accept": 3,
      "live-with-screenshot": 3,
      audit: 100,
      "audit-strict": 100
    };
    gate = {
      run,
      runAntiSlop: runAntiSlopDirect
    };
  }
});

// src/source/inject.ts
var inject_exports = {};
__export(inject_exports, {
  discoverInjectedFiles: () => discoverInjectedFiles,
  injectLiveScript: () => injectLiveScript,
  injectModule: () => injectModule,
  refreshInjectToken: () => refreshInjectToken,
  removeLiveScript: () => removeLiveScript
});
import { promises as fs9 } from "fs";
import { promises as fsp } from "fs";
import * as nodePath from "path";
async function injectLiveScript(filePath, opts, modOpts) {
  const parsedOpts = InjectOptionsSchema.parse(opts);
  const safety = await safetyCheck(filePath, modOpts.projectRoot);
  if (!safety.ok) {
    await append(
      {
        ts: (/* @__PURE__ */ new Date()).toISOString(),
        sessionId: modOpts.sessionId ?? "no-session",
        kind: "safety-refused",
        filePath,
        detail: {
          code: safety.error.code,
          message: safety.error.message,
          suggestedFallback: safety.error.suggestedFallback ?? null,
          operation: "inject-script"
        }
      },
      { projectRoot: modOpts.projectRoot }
    );
    throw new Error(
      `injectLiveScript: safety refused \u2014 ${safety.error.code}: ${safety.error.message}`
    );
  }
  const { fileType } = safety;
  if (fileType === "tsx" || fileType === "jsx") {
    await append(
      {
        ts: (/* @__PURE__ */ new Date()).toISOString(),
        sessionId: modOpts.sessionId ?? "no-session",
        kind: "safety-refused",
        filePath,
        detail: {
          code: "UNSUPPORTED_FILE_TYPE",
          message: "JSX/TSX is not supported for inject; inject the parent HTML instead.",
          suggestedFallback: "agent-driven",
          operation: "inject-script"
        }
      },
      { projectRoot: modOpts.projectRoot }
    );
    throw new Error(
      "injectLiveScript: JSX/TSX is not a script-host; inject the parent HTML entry instead."
    );
  }
  if (fileType === "css") {
    throw new Error(
      "injectLiveScript: CSS cannot host a script tag (safetyCheck should have refused)."
    );
  }
  const original = await fs9.readFile(filePath, { encoding: "utf8" });
  const beforeHash = sha256Hex(original);
  const eol = detectEol2(original);
  const canonical = canonicalize(original);
  const existing = findMarkerBlock(canonical, fileType, "inject");
  if (existing !== null) {
    throw new Error(
      "injectLiveScript: an existing wisp-inject block was found; remove first."
    );
  }
  const injectId = parsedOpts.injectId ?? randomUUID3();
  const marker = InjectMarkerSchema.parse({
    injectId,
    insertedAt: (/* @__PURE__ */ new Date()).toISOString(),
    bridgeUrl: parsedOpts.bridgeUrl,
    token: parsedOpts.token,
    beforeHash: sha256First256Bytes(canonical),
    scriptSrc: parsedOpts.inline ? void 0 : `${parsedOpts.bridgeUrl}/live.js?token=${encodeURIComponent(parsedOpts.token)}`,
    inline: parsedOpts.inline
  });
  const { startOffset, endOffset, startLine, endLine } = chooseInsertionPoint(
    canonical,
    parsedOpts.preferredAnchor,
    fileType
  );
  const atEof = startOffset === canonical.length;
  const needsLeadingNl = atEof && canonical.length > 0 && canonical[canonical.length - 1] !== "\n";
  const startBody = serializeMarkerBody("inject-start", {
    injectId: marker.injectId,
    insertedAt: marker.insertedAt,
    bridgeUrl: marker.bridgeUrl,
    token: marker.token,
    beforeHash: marker.beforeHash,
    inline: marker.inline,
    eofPrefixNl: needsLeadingNl
  });
  const endBody = serializeMarkerBody("inject-end", {
    injectId: marker.injectId
  });
  const syntax = MARKER_SYNTAX[fileType];
  const scriptTag = parsedOpts.inline ? `<script id="${WISP_INJECT_SCRIPT_ID}" ${WISP_INJECT_DATA_ATTRIBUTE}="${marker.injectId}">/* wisp-design live inline */</script>` : `<script id="${WISP_INJECT_SCRIPT_ID}" ${WISP_INJECT_DATA_ATTRIBUTE}="${marker.injectId}" src=${JSON.stringify(marker.scriptSrc ?? "")} async></script>`;
  const block = `${syntax.open(startBody)}
${scriptTag}
${syntax.close(endBody)}`;
  const next = canonical.slice(0, startOffset) + (needsLeadingNl ? "\n" : "") + block + "\n" + canonical.slice(endOffset);
  const final = applyEol(next, eol);
  await atomicWrite(filePath, final);
  const afterHash = sha256Hex(final);
  await append(
    {
      ts: (/* @__PURE__ */ new Date()).toISOString(),
      sessionId: modOpts.sessionId ?? "no-session",
      kind: "inject-script",
      filePath,
      beforeSha256: beforeHash,
      afterSha256: afterHash,
      detail: {
        injectId: marker.injectId,
        bridgeUrl: marker.bridgeUrl,
        inline: marker.inline,
        insertionLine: startLine
      }
    },
    { projectRoot: modOpts.projectRoot }
  );
  return {
    injectId: marker.injectId,
    startLine,
    endLine,
    beforeHash,
    afterHash
  };
}
async function removeLiveScript(filePath, modOpts) {
  const safety = await safetyCheck(filePath, modOpts.projectRoot);
  if (!safety.ok) {
    throw new Error(
      `removeLiveScript: safety refused \u2014 ${safety.error.code}: ${safety.error.message}`
    );
  }
  const { fileType } = safety;
  const original = await fs9.readFile(filePath, { encoding: "utf8" });
  const beforeHash = sha256Hex(original);
  const eol = detectEol2(original);
  const canonical = canonicalize(original);
  const block = findMarkerBlock(canonical, fileType, "inject");
  if (block === null) {
    throw new Error(
      "removeLiveScript: no wisp-inject block found in this file."
    );
  }
  const startLine = canonical.split("\n")[block.startLine];
  const payloadMatch = startLine ? MARKER_SYNTAX[fileType].pattern.exec(startLine) : null;
  const parsed = payloadMatch ? parseMarkerBody(payloadMatch[1] ?? "") : { payload: {} };
  const injectId = parsed.payload.injectId ?? "";
  const expectedBeforeHash = parsed.payload.beforeHash ?? "";
  const eofPrefixNl = parsed.payload.eofPrefixNl === "true";
  const removeBlock = eofPrefixNl && block.startOffset > 0 && canonical[block.startOffset - 1] === "\n" ? { ...block, startOffset: block.startOffset - 1 } : block;
  const next = expandReplaceRange(canonical, removeBlock, "", eol);
  const collapsed = collapseDoubleBlank(next, removeBlock.startOffset);
  const restoredHash = sha256First256Bytes(collapsed);
  const byteEquivalent = expectedBeforeHash !== "" && restoredHash === expectedBeforeHash;
  const final = applyEol(collapsed, eol);
  await atomicWrite(filePath, final);
  const afterHash = sha256Hex(final);
  await append(
    {
      ts: (/* @__PURE__ */ new Date()).toISOString(),
      sessionId: modOpts.sessionId ?? "no-session",
      kind: "remove-script",
      filePath,
      beforeSha256: beforeHash,
      afterSha256: afterHash,
      detail: {
        injectId,
        restoredByteEquivalent: byteEquivalent,
        expectedBeforeHash,
        observedRestoredHash: restoredHash
      }
    },
    { projectRoot: modOpts.projectRoot }
  );
  return {
    removed: true,
    injectId,
    restoredByteEquivalent: byteEquivalent
  };
}
function chooseInsertionPoint(canonical, _preferred, fileType) {
  if (fileType === "html") {
    const idx = canonical.search(/<\/head\s*>/i);
    if (idx !== -1) {
      return offsetToInsertionPoint(canonical, lineStartOffset2(canonical, idx));
    }
    const bodyIdx = canonical.search(/<\/body\s*>/i);
    if (bodyIdx !== -1) {
      return offsetToInsertionPoint(
        canonical,
        lineStartOffset2(canonical, bodyIdx)
      );
    }
  }
  const eof = canonical.length;
  return {
    startOffset: eof,
    endOffset: eof,
    startLine: lineOfOffset2(canonical, eof),
    endLine: lineOfOffset2(canonical, eof)
  };
}
function offsetToInsertionPoint(canonical, atOffset) {
  return {
    startOffset: atOffset,
    endOffset: atOffset,
    startLine: lineOfOffset2(canonical, atOffset),
    endLine: lineOfOffset2(canonical, atOffset)
  };
}
function lineOfOffset2(s, offset) {
  let line = 0;
  for (let i = 0; i < offset && i < s.length; i += 1) {
    if (s[i] === "\n") line += 1;
  }
  return line;
}
function lineStartOffset2(s, off) {
  const nl = s.lastIndexOf("\n", off - 1);
  return nl === -1 ? 0 : nl + 1;
}
function collapseDoubleBlank(s, near) {
  const lo = Math.max(0, near - 2);
  const hi = Math.min(s.length, near + 2);
  const window = s.slice(lo, hi);
  if (!window.includes("\n\n\n")) return s;
  return s.slice(0, lo) + window.replace(/\n{3,}/g, "\n\n") + s.slice(hi);
}
async function discoverInjectedFiles(opts) {
  const maxFiles = opts.maxFiles ?? 32;
  const found = [];
  const stack = [opts.projectRoot];
  let visited = 0;
  while (stack.length > 0 && found.length < maxFiles && visited < 5e3) {
    const dir = stack.shift();
    visited += 1;
    let entries;
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const ent of entries) {
      if (ent.name.startsWith(".") && !INJECT_SCAN_SKIP_DIRS.has(ent.name)) {
        continue;
      }
      const abs = nodePath.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (INJECT_SCAN_SKIP_DIRS.has(ent.name)) continue;
        stack.push(abs);
        continue;
      }
      const ext = nodePath.extname(ent.name).toLowerCase();
      if (!INJECT_SCAN_EXTENSIONS.has(ext)) continue;
      let text;
      try {
        const fh = await fsp.open(abs, "r");
        try {
          const buf = Buffer.alloc(32 * 1024);
          const { bytesRead } = await fh.read(buf, 0, buf.length, 0);
          text = buf.subarray(0, bytesRead).toString("utf8");
        } finally {
          await fh.close();
        }
      } catch {
        continue;
      }
      if (INJECT_MARKER_RE.test(text)) {
        found.push(abs);
      }
    }
  }
  return found;
}
async function refreshInjectToken(filePath, opts, ctx) {
  void ctx;
  let text;
  try {
    text = await fsp.readFile(filePath, "utf8");
  } catch {
    return;
  }
  let next = text;
  const scriptMatch = SCRIPT_SRC_RE.exec(next);
  if (scriptMatch && scriptMatch[1]) {
    const oldSrc = scriptMatch[1];
    let newSrc = oldSrc;
    try {
      const u = new URL(oldSrc);
      u.searchParams.set("token", opts.token);
      const newBase = new URL(opts.bridgeUrl);
      u.protocol = newBase.protocol;
      u.host = newBase.host;
      newSrc = u.toString();
    } catch {
      newSrc = `${opts.bridgeUrl}/live.js?token=${encodeURIComponent(opts.token)}`;
    }
    next = next.replace(
      SCRIPT_SRC_RE,
      (full) => full.replace(oldSrc, newSrc)
    );
  }
  next = next.replace(
    INJECT_START_TOKEN_RE,
    (_m, prefix) => `${prefix}${opts.token}`
  );
  if (next !== text) {
    await fsp.writeFile(filePath, next, "utf8");
  }
}
var INJECT_SCAN_EXTENSIONS, INJECT_SCAN_SKIP_DIRS, INJECT_MARKER_RE, SCRIPT_SRC_RE, INJECT_START_TOKEN_RE, injectModule;
var init_inject = __esm({
  "src/source/inject.ts"() {
    "use strict";
    init_source();
    init_accept();
    init_safety();
    init_undo_stack();
    INJECT_SCAN_EXTENSIONS = /* @__PURE__ */ new Set([
      ".html",
      ".htm",
      ".jsx",
      ".tsx",
      ".js",
      ".ts",
      ".vue",
      ".svelte",
      ".astro"
    ]);
    INJECT_SCAN_SKIP_DIRS = /* @__PURE__ */ new Set([
      "node_modules",
      "dist",
      "build",
      ".git",
      ".next",
      ".nuxt",
      ".svelte-kit",
      ".astro",
      "out",
      "coverage",
      ".wisp",
      ".turbo",
      ".cache",
      ".vite"
    ]);
    INJECT_MARKER_RE = /<!--\s*wisp-inject-start:/;
    SCRIPT_SRC_RE = /<script\s+id=["']wisp-design-live["'][^>]*\bsrc=["']([^"']+)["'][^>]*>/;
    INJECT_START_TOKEN_RE = /(<!--\s*wisp-inject-start:[^>]*?\btoken=)([^\s>]*)/;
    injectModule = { injectLiveScript, removeLiveScript, discoverInjectedFiles, refreshInjectToken };
  }
});

// src/agent/live.ts
import { resolve as resolve8 } from "path";
import { randomUUID as randomUUID4 } from "crypto";

// src/bridge/server.ts
init_bridge();
import { createServer as createServer2 } from "http";
import { randomUUID as randomUUID2 } from "crypto";
import { readFile as readFile2, stat } from "fs/promises";
import { resolve as resolve3 } from "path";
import { fileURLToPath } from "url";

// src/bridge/auth.ts
import { randomUUID, timingSafeEqual } from "crypto";
import { realpathSync } from "fs";
import { isAbsolute, normalize, resolve, sep } from "path";
var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
var IS_WINDOWS = process.platform === "win32";
function authError(code, message, detail) {
  return detail !== void 0 ? { code, message, detail } : { code, message };
}
function validateToken(provided, expected) {
  if (provided === void 0 || provided === null || provided === "") {
    return { ok: false, error: authError("UNAUTHORIZED", "missing token") };
  }
  if (typeof provided !== "string") {
    return { ok: false, error: authError("MALFORMED_TOKEN", "token must be a string") };
  }
  if (!UUID_RE.test(provided)) {
    return { ok: false, error: authError("MALFORMED_TOKEN", "token is not a valid UUID") };
  }
  if (provided.length !== expected.length) {
    return { ok: false, error: authError("UNAUTHORIZED", "invalid token") };
  }
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) {
    return { ok: false, error: authError("UNAUTHORIZED", "invalid token") };
  }
  if (!timingSafeEqual(a, b)) {
    return { ok: false, error: authError("UNAUTHORIZED", "invalid token") };
  }
  return { ok: true };
}
function denyPath(requested, message, code = "PATH_TRAVERSAL") {
  return {
    ok: false,
    error: authError(code, message, { requested })
  };
}
function hasParentSegment(normalized) {
  const parts = normalized.split(/[\\/]/);
  return parts.includes("..");
}
function startsWithRoot(absPath, rootWithSep, root) {
  if (absPath === root) return true;
  if (IS_WINDOWS) {
    return absPath.toLowerCase().startsWith(rootWithSep.toLowerCase());
  }
  return absPath.startsWith(rootWithSep);
}
function violatesHardDeny(absPath) {
  const probe = IS_WINDOWS ? absPath.toLowerCase() : absPath;
  const s = sep;
  const padded = `${probe}${s}`;
  if (padded.includes(`${s}.git${s}`)) {
    return "git internals are off-limits";
  }
  if (padded.includes(`${s}node_modules${s}`)) {
    return "node_modules is off-limits";
  }
  if (padded.includes(`${s}.wisp${s}sessions${s}`)) {
    return "session logs are private";
  }
  const lastSepIdx = absPath.lastIndexOf(sep);
  const basename = lastSepIdx >= 0 ? absPath.slice(lastSepIdx + 1) : absPath;
  const basenameProbe = IS_WINDOWS ? basename.toLowerCase() : basename;
  if (basenameProbe === ".env" || basenameProbe.startsWith(".env.")) {
    return "environment files are off-limits";
  }
  return null;
}
function guardPath(requestedPath, projectRoot) {
  if (typeof requestedPath !== "string" || requestedPath === "") {
    return denyPath(String(requestedPath), "empty path");
  }
  if (isAbsolute(requestedPath)) {
    return denyPath(requestedPath, "absolute paths are not allowed");
  }
  const normalized = normalize(requestedPath);
  if (hasParentSegment(normalized)) {
    return denyPath(requestedPath, "`..` segments are not allowed");
  }
  const absRoot = resolve(projectRoot);
  const joined = resolve(absRoot, normalized);
  const rootWithSep = absRoot.endsWith(sep) ? absRoot : `${absRoot}${sep}`;
  if (!startsWithRoot(joined, rootWithSep, absRoot)) {
    return denyPath(requestedPath, "resolved path escapes project root");
  }
  const denyReason = violatesHardDeny(joined);
  if (denyReason !== null) {
    return {
      ok: false,
      error: authError("FORBIDDEN", denyReason, { requested: requestedPath })
    };
  }
  try {
    const real = realpathSync(joined);
    if (!startsWithRoot(real, rootWithSep, absRoot)) {
      return denyPath(requestedPath, "symlink target escapes project root");
    }
    const realDeny = violatesHardDeny(real);
    if (realDeny !== null) {
      return {
        ok: false,
        error: authError("FORBIDDEN", realDeny, { requested: requestedPath })
      };
    }
  } catch (err) {
    const code = err.code;
    if (code !== "ENOENT" && code !== "ENOTDIR") {
    }
  }
  return { ok: true, resolved: joined };
}

// src/bridge/port-discovery.ts
init_bridge();
import { createServer } from "net";
import { mkdir, readFile, rename, unlink, writeFile } from "fs/promises";
import { dirname, resolve as resolve2 } from "path";
var DEFAULT_PORT_RANGE = { min: 31337, max: 31400 };
var DEFAULT_LOCK_PATH = ".wisp/live/port.lock";
function tryBind(port) {
  return new Promise((resolveBind) => {
    const server = createServer();
    let settled = false;
    const finish = (free) => {
      if (settled) return;
      settled = true;
      try {
        server.close(() => resolveBind(free));
      } catch {
        resolveBind(free);
      }
    };
    server.once("error", () => finish(false));
    server.once("listening", () => finish(true));
    try {
      server.listen({ port, host: "127.0.0.1", exclusive: true });
    } catch {
      finish(false);
    }
  });
}
async function findFreePort(range = DEFAULT_PORT_RANGE) {
  if (range.min > range.max) {
    throw new Error(
      `findFreePort: invalid range ${range.min}..${range.max}`
    );
  }
  for (let port = range.min; port <= range.max; port += 1) {
    const free = await tryBind(port);
    if (free) return port;
  }
  throw new Error(
    `findFreePort: no free port in ${range.min}..${range.max}`
  );
}
async function ensureDir(filePath) {
  await mkdir(dirname(filePath), { recursive: true });
}
async function writeLockfile(lockPath, lock) {
  const parsed = PortLockSchema.parse(lock);
  const abs = resolve2(lockPath);
  await ensureDir(abs);
  const tmp = `${abs}.tmp`;
  const body = `${JSON.stringify(parsed, null, 2)}
`;
  await writeFile(tmp, body, { encoding: "utf8", mode: 384 });
  await rename(tmp, abs);
}
async function releaseLockfile(lockPath = DEFAULT_LOCK_PATH) {
  const abs = resolve2(lockPath);
  try {
    await unlink(abs);
  } catch (err) {
    if (err.code === "ENOENT") return;
    throw err;
  }
}

// src/bridge/http-helpers.ts
init_bridge();
import { URL as URL2 } from "url";
function errorBody(code, message, detail) {
  return BridgeHttpErrorSchema.parse(
    detail === void 0 ? { error: { code, message } } : { error: { code, message, detail } }
  );
}
function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    "Cache-Control": "no-store"
  });
  res.end(payload);
}
function sendError(res, status, code, message, detail) {
  sendJson(res, status, errorBody(code, message, detail));
}
function sendAuthError(res, err) {
  const status = err.code === "FORBIDDEN" || err.code === "PATH_TRAVERSAL" ? 403 : 401;
  sendError(res, status, err.code, err.message, err.detail);
}
function extractBearer(req) {
  const auth = req.headers["authorization"];
  if (typeof auth !== "string") return void 0;
  const m = /^Bearer\s+(.+)$/i.exec(auth);
  return m === null ? void 0 : m[1];
}
function parseQuery(req) {
  const u = new URL2(req.url ?? "/", "http://localhost");
  const get = (k) => {
    const v = u.searchParams.get(k);
    return v === null ? void 0 : v;
  };
  const timeoutRaw = get("timeout");
  const leaseRaw = get("leaseMs");
  return {
    token: get("token") ?? extractBearer(req),
    path: get("path"),
    timeout: timeoutRaw === void 0 ? void 0 : Number.parseInt(timeoutRaw, 10),
    leaseMs: leaseRaw === void 0 ? void 0 : Number.parseInt(leaseRaw, 10),
    cursor: get("cursor")
  };
}
function urlPath(req) {
  const u = new URL2(req.url ?? "/", "http://localhost");
  return u.pathname;
}
async function readBody(req, maxBytes = 256 * 1024) {
  return new Promise((resolveBody, rejectBody) => {
    let total = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        rejectBody(new Error("BODY_TOO_LARGE"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolveBody(Buffer.concat(chunks).toString("utf8")));
    req.on("error", rejectBody);
  });
}
function safeJson(s) {
  try {
    return { ok: true, value: JSON.parse(s) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}
function withAuthoritativeToken(valueObj, token) {
  return { ...valueObj, token };
}
function parseCursor(cursor) {
  if (cursor === void 0 || cursor.length === 0) return 0;
  const m = /^seq-(\d+)-/.exec(cursor);
  if (m === null || m[1] === void 0) return 0;
  const n = Number.parseInt(m[1], 10);
  return Number.isFinite(n) ? n : 0;
}

// src/bridge/server.ts
var LIVE_JS_FALLBACK_STUB = "// wisp-design live.js \u2014 bundle not found at dist/live.js. Did you run `npm run build`?\n";
var LIVE_JS_BUNDLE_PATH = (() => {
  try {
    const fromModule = fileURLToPath(new URL("../live.js", import.meta.url));
    return fromModule;
  } catch {
    return resolve3(process.cwd(), "dist/live.js");
  }
})();
var SSE_HEARTBEAT_INTERVAL_MS = 15e3;
var EVENT_QUEUE_MAX = 1024;
var VERSION = "0.1.0-prerelease";
async function startBridgeServer(opts) {
  const token = opts.token ?? randomUUID2();
  const sessionId2 = randomUUID2();
  const projectRoot = resolve3(opts.projectRoot);
  const startedAt = /* @__PURE__ */ new Date();
  const startedAtMs = startedAt.getTime();
  const port = opts.preferredPort !== void 0 ? opts.preferredPort : await findFreePort();
  let seqCounter = 0;
  const queue = [];
  const sseSubs = /* @__PURE__ */ new Map();
  const pollWaiters = /* @__PURE__ */ new Set();
  let stopping = false;
  const allocateCursor = () => {
    seqCounter += 1;
    return { cursor: `seq-${seqCounter}-${sessionId2}`, seq: seqCounter };
  };
  const enqueue = (event) => {
    const c = allocateCursor();
    queue.push({ cursor: c.cursor, event, seq: c.seq });
    if (queue.length > EVENT_QUEUE_MAX) queue.shift();
    queueMicrotask(() => fanout(event, c.seq));
    return c;
  };
  const fanout = (event, seq) => {
    const line = `data: ${JSON.stringify(event)}

`;
    for (const sub of sseSubs.values()) {
      try {
        sub.res.write(line);
      } catch {
      }
    }
    for (const w of pollWaiters) {
      if (w.sinceSeq < seq) {
        deliverWaiter(w);
      }
    }
  };
  const eventsSince = (sinceSeq) => {
    if (sinceSeq <= 0) return queue.slice();
    return queue.filter((q) => q.seq > sinceSeq);
  };
  const deliverWaiter = (w) => {
    if (!pollWaiters.has(w)) return;
    pollWaiters.delete(w);
    clearTimeout(w.timer);
    const events = eventsSince(w.sinceSeq);
    const last = events.length === 0 ? void 0 : events[events.length - 1];
    const cursor = last !== void 0 ? last.cursor : `seq-${seqCounter}-${sessionId2}`;
    w.resolve({
      events: events.map((q) => q.event),
      cursor,
      slicedAt: Date.now() - w.startedAt
    });
  };
  const releaseWaiter = (w) => {
    if (!pollWaiters.has(w)) return;
    pollWaiters.delete(w);
    clearTimeout(w.timer);
  };
  const longPoll = (sinceSeq, timeoutMs) => {
    const cap = Math.min(Math.max(timeoutMs, 0), LONG_POLL_CAP_MS);
    const ready = eventsSince(sinceSeq);
    if (ready.length > 0) {
      const last = ready[ready.length - 1];
      return {
        promise: Promise.resolve({
          events: ready.map((q) => q.event),
          cursor: last !== void 0 ? last.cursor : `seq-${seqCounter}-${sessionId2}`,
          slicedAt: 0
        }),
        cancel: () => {
        }
      };
    }
    let waiter;
    const promise = new Promise((res) => {
      waiter = {
        resolve: res,
        sinceSeq,
        startedAt: Date.now(),
        // .unref() so a stray waiter timer never keeps the process alive past
        // shutdown if a poll outlives stopServer's drain.
        timer: setTimeout(() => deliverWaiter(waiter), cap).unref()
      };
      pollWaiters.add(waiter);
    });
    return { promise, cancel: () => releaseWaiter(waiter) };
  };
  const handleHealth = (res) => {
    sendJson(res, 200, {
      ok: true,
      version: VERSION,
      uptimeMs: Date.now() - startedAtMs,
      pid: process.pid
    });
  };
  const handleStatus = (res) => {
    const status = {
      port,
      startedAt: startedAt.toISOString(),
      uptimeMs: Date.now() - startedAtMs,
      sessionId: sessionId2,
      pendingEvents: queue.length,
      connectedSseClients: sseSubs.size,
      projectRoot
    };
    sendJson(res, 200, status);
  };
  const handleLiveJs = async (res) => {
    let body;
    let bodyFromBundle = false;
    try {
      body = await readFile2(LIVE_JS_BUNDLE_PATH, "utf8");
      bodyFromBundle = true;
    } catch {
      body = LIVE_JS_FALLBACK_STUB;
    }
    res.writeHead(200, {
      "Content-Type": "application/javascript; charset=utf-8",
      // The IIFE bundle is small and content-addressed by token. Allow short
      // browser caching when serving the real bundle so multi-tab demos
      // don't refetch it on every reload.
      "Cache-Control": bodyFromBundle ? "public, max-age=60" : "no-store",
      "Access-Control-Allow-Origin": "*"
    });
    res.end(body);
  };
  const handleDesignSystem = async (res) => {
    const path = resolve3(projectRoot, ".wisp/design-tokens.json");
    try {
      const body = await readFile2(path, "utf8");
      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store"
      });
      res.end(body);
    } catch (err) {
      if (err.code === "ENOENT") {
        sendError(res, 404, "TOKENS_MISSING", ".wisp/design-tokens.json not found");
        return;
      }
      sendError(res, 500, "READ_FAILED", err.message);
    }
  };
  const handleSessions = async (res) => {
    const sessionsDir = resolve3(projectRoot, ".wisp/sessions");
    const entries = [];
    let dir;
    try {
      const { readdir } = await import("fs/promises");
      dir = await readdir(sessionsDir);
    } catch (err) {
      if (err.code === "ENOENT") {
        res.writeHead(200, {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store"
        });
        res.end(JSON.stringify({ entries: [] }));
        return;
      }
      sendError(res, 500, "READ_FAILED", err.message);
      return;
    }
    const files = dir.filter((f) => f.endsWith(".jsonl")).slice(0, 50);
    for (const fname of files) {
      let text;
      try {
        text = await readFile2(resolve3(sessionsDir, fname), "utf8");
      } catch {
        continue;
      }
      for (const line of text.split("\n")) {
        if (line.length === 0) continue;
        let parsed;
        try {
          parsed = JSON.parse(line);
        } catch {
          continue;
        }
        if (typeof parsed !== "object" || parsed === null) continue;
        const obj = parsed;
        if (obj.kind !== "accept-variant") continue;
        const detail = obj.detail;
        if (!detail || typeof detail.targetId !== "string") continue;
        entries.push({
          ts: typeof obj.ts === "string" ? obj.ts : "",
          sessionId: typeof obj.sessionId === "string" ? obj.sessionId : "",
          targetId: detail.targetId,
          variantId: typeof detail.variantId === "string" ? detail.variantId : "",
          filePath: typeof obj.filePath === "string" ? obj.filePath : "",
          byteSize: typeof detail.byteSize === "number" ? detail.byteSize : 0
        });
      }
    }
    entries.sort((a, b) => a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0);
    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    });
    res.end(JSON.stringify({ entries: entries.slice(0, 20) }));
  };
  const handleSource = async (res, requestedPath) => {
    if (requestedPath === void 0 || requestedPath.length === 0) {
      sendError(res, 400, "BAD_PATH", "path query parameter required");
      return;
    }
    const guard = guardPath(requestedPath, projectRoot);
    if (!guard.ok) {
      sendAuthError(res, guard.error);
      return;
    }
    try {
      const st = await stat(guard.resolved);
      if (!st.isFile()) {
        sendError(res, 404, "NOT_A_FILE", `not a regular file: ${requestedPath}`);
        return;
      }
      const body = await readFile2(guard.resolved, "utf8");
      res.writeHead(200, {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store"
      });
      res.end(body);
    } catch (err) {
      if (err.code === "ENOENT") {
        sendError(res, 404, "NOT_FOUND", `file not found: ${requestedPath}`);
        return;
      }
      sendError(res, 500, "READ_FAILED", err.message);
    }
  };
  const handlePostEvent = async (req, res, requireKind) => {
    let raw;
    try {
      raw = await readBody(req);
    } catch (err) {
      sendError(res, 413, "BODY_TOO_LARGE", err.message);
      return;
    }
    const parsedJson = safeJson(raw);
    if (!parsedJson.ok) {
      sendError(res, 400, "BAD_BODY", `invalid JSON: ${parsedJson.error}`);
      return;
    }
    const parsed = BridgeEventSchema.safeParse(parsedJson.value);
    if (!parsed.success) {
      sendError(res, 400, "BAD_BODY", "event failed schema validation", parsed.error.issues);
      return;
    }
    if (requireKind !== void 0 && parsed.data.kind !== requireKind) {
      sendError(
        res,
        400,
        "BAD_BODY",
        `expected kind=${requireKind}, got kind=${parsed.data.kind}`
      );
      return;
    }
    const { cursor } = enqueue(parsed.data);
    sendJson(res, 200, { accepted: true, cursor });
  };
  const handleGetEventsSse = (req, res) => {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      "Access-Control-Allow-Origin": "*"
    });
    res.write(": connected\n\n");
    const subId = randomUUID2();
    const heartbeat = setInterval(() => {
      try {
        res.write(": keepalive\n\n");
      } catch {
      }
    }, SSE_HEARTBEAT_INTERVAL_MS);
    const sub = { res, heartbeat };
    sseSubs.set(subId, sub);
    const cleanup = () => {
      clearInterval(heartbeat);
      sseSubs.delete(subId);
      try {
        res.end();
      } catch {
      }
    };
    req.on("close", cleanup);
    req.on("error", cleanup);
  };
  const handleGetPoll = async (req, res, q) => {
    const timeout = Number.isFinite(q.timeout) ? q.timeout : LONG_POLL_DEFAULT_LEASE_MS;
    const sinceSeq = parseCursor(q.cursor);
    const aborted = { v: false };
    const { promise, cancel } = longPoll(sinceSeq, timeout);
    req.on("close", () => {
      aborted.v = true;
      cancel();
    });
    const response = await promise;
    if (aborted.v) return;
    sendJson(res, 200, response);
  };
  const handlePostPoll = async (req, res) => {
    let raw;
    try {
      raw = await readBody(req);
    } catch (err) {
      sendError(res, 413, "BODY_TOO_LARGE", err.message);
      return;
    }
    const parsedJson = safeJson(raw.length === 0 ? "{}" : raw);
    if (!parsedJson.ok) {
      sendError(res, 400, "BAD_BODY", `invalid JSON: ${parsedJson.error}`);
      return;
    }
    const valueObj = typeof parsedJson.value === "object" && parsedJson.value !== null ? parsedJson.value : {};
    const withToken = withAuthoritativeToken(valueObj, token);
    const parsed = LongPollRequestSchema.safeParse(withToken);
    let timeoutMs;
    let sinceSeq;
    if (!parsed.success) {
      const fallbackTimeout = typeof valueObj["timeout"] === "number" ? Math.min(valueObj["timeout"], LONG_POLL_CAP_MS) : LONG_POLL_DEFAULT_LEASE_MS;
      timeoutMs = fallbackTimeout;
      sinceSeq = parseCursor(typeof valueObj["cursor"] === "string" ? valueObj["cursor"] : void 0);
    } else {
      timeoutMs = parsed.data.timeout ?? LONG_POLL_DEFAULT_LEASE_MS;
      sinceSeq = parseCursor(parsed.data.cursor);
    }
    const aborted = { v: false };
    const { promise, cancel } = longPoll(sinceSeq, timeoutMs);
    req.on("close", () => {
      aborted.v = true;
      cancel();
    });
    const response = await promise;
    if (aborted.v) return;
    sendJson(res, 200, response);
  };
  const stopServer = async (graceMs = 500) => {
    if (stopping) return;
    stopping = true;
    if (opts.onBeforeStop !== void 0) {
      try {
        await opts.onBeforeStop();
      } catch {
      }
    }
    for (const w of [...pollWaiters]) deliverWaiter(w);
    for (const sub of sseSubs.values()) {
      clearInterval(sub.heartbeat);
      try {
        sub.res.end();
      } catch {
      }
    }
    sseSubs.clear();
    await new Promise((res) => {
      server.close(() => res());
      setTimeout(() => res(), Math.max(graceMs, 0)).unref();
    });
  };
  const handleStop = (res) => {
    sendJson(res, 200, { stopping: true, graceMs: 500 });
    setTimeout(() => {
      void stopServer(500);
    }, 50).unref();
  };
  const setCorsHeaders = (res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept, Cache-Control");
    res.setHeader("Access-Control-Max-Age", "600");
  };
  const router = async (req, res) => {
    const method = req.method ?? "GET";
    const path = urlPath(req);
    const q = parseQuery(req);
    setCorsHeaders(res);
    if (method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }
    if (method === "GET" && path === "/health") {
      handleHealth(res);
      return;
    }
    if (method === "GET" && path === "/live.js") {
      handleLiveJs(res);
      return;
    }
    const auth = validateToken(q.token, token);
    if (!auth.ok) {
      sendAuthError(res, auth.error);
      return;
    }
    if (method === "GET" && path === "/status") {
      handleStatus(res);
      return;
    }
    if (method === "GET" && path === "/design-system.json") {
      await handleDesignSystem(res);
      return;
    }
    if (method === "GET" && path === "/sessions") {
      await handleSessions(res);
      return;
    }
    if (method === "GET" && path === "/source") {
      await handleSource(res, q.path);
      return;
    }
    if (method === "GET" && path === "/events") {
      handleGetEventsSse(req, res);
      return;
    }
    if (method === "POST" && path === "/events") {
      await handlePostEvent(req, res);
      return;
    }
    if (method === "POST" && path === "/annotation") {
      await handlePostEvent(req, res, "annotation");
      return;
    }
    if (method === "GET" && path === "/poll") {
      await handleGetPoll(req, res, q);
      return;
    }
    if (method === "POST" && path === "/poll") {
      await handlePostPoll(req, res);
      return;
    }
    if (method === "GET" && path === "/stop") {
      handleStop(res);
      return;
    }
    sendError(res, 404, "NOT_FOUND", `${method} ${path} has no handler`);
  };
  const server = createServer2((req, res) => {
    router(req, res).catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      try {
        sendError(res, 500, "INTERNAL", msg);
      } catch {
      }
    });
  });
  await new Promise((res, rej) => {
    server.once("error", rej);
    server.listen({ port, host: "127.0.0.1" }, () => res());
  });
  const handle = {
    port,
    token,
    sessionId: sessionId2,
    status: async () => ({
      port,
      startedAt: startedAt.toISOString(),
      uptimeMs: Date.now() - startedAtMs,
      sessionId: sessionId2,
      pendingEvents: queue.length,
      connectedSseClients: sseSubs.size,
      projectRoot
    }),
    stop: (graceMs) => stopServer(graceMs)
  };
  Object.defineProperty(handle, "pendingWaiters", {
    value: () => pollWaiters.size,
    enumerable: false
  });
  return handle;
}

// src/agent/variant-catalog.ts
function generateVariantsFromIntent(ctx) {
  const intent = classifyIntent(ctx.freeText);
  const tagClass = classifyTag(ctx.targetTag);
  const catalog = CATALOG[intent][tagClass] ?? CATALOG[intent].default ?? CATALOG.default.default;
  const count = clamp(ctx.maxVariants, 1, catalog.length);
  return catalog.slice(0, count);
}
var INTENT_RULES = [
  // Vibes (high-level — checked first so "modern button" → modern, not button)
  [/\b(premium|luxury|elegant|refined|sophisticated|upscale|expensive)\b/i, "premium"],
  [/\b(modern|sleek|cutting[\s-]?edge|fresh|contemporary|new)\b/i, "modern"],
  // Visual chrome
  [/\b(ghost|outlined?|transparent|see[\s-]?through|hollow|borderless)\b/i, "ghost"],
  [/\b(elev|elevation|shadowy?|lift|lifted|float|floating|raise|raised|hover|deep|drop[\s-]?shadow)\b/i, "elevated"],
  [/\b(flat|minimal|minimalist|clean|simple|plain|stripped)\b/i, "flat"],
  // Shape
  [/\b(round|rounded|circle|circular|pill[\s-]?shaped|pill|soft[\s-]?corners?|curved|softer)\b/i, "rounded"],
  [/\b(square|squarer|squared|sharp|sharper|crisp|harsh|edgy|edged|angular)\b/i, "squared"],
  // Color
  [/\b(contrast|high[\s-]?contrast|stark|legible|punchy|punch|stronger[\s-]?color|darker[\s-]?text|maximum)\b/i, "contrast"],
  [/\b(accent|brand|colorful|colour[a-z]*|primary[\s-]?color)\b/i, "accent"],
  [/\b(mute|muted|quiet|subtle|gentle|faded|gray|grey|desaturated|softer[\s-]?color)\b/i, "muted"],
  // Spacing
  [/\b(spac|spacious|breath|breathing|airy|loose|generous|roomy|open|wider|broader|padded)\b/i, "spacious"],
  [/\b(compact|tight|tighter|dense|crammed|cramped|condensed|squeeze|squeezed|narrow|narrower)\b/i, "compact"],
  // Weight  (typography emphasis)
  [/\b(bold|bolder|heavy|heavier|thicker|stronger|strong|emphasi[sz]ed?)\b/i, "weight-heavier"],
  [/\b(light|lighter|thin|thinner|delicate|softer[\s-]?text|softer)\b/i, "weight-lighter"],
  // Size  (broad — applies to text font-size OR container padding depending on tag)
  [/\b(big|bigger|large|larger|huge|enormous|grand|increase|increased)\b/i, "size-bigger"],
  [/\b(small|smaller|tiny|tinier|petite|mini|reduce|reduced|shrink|shrunk)\b/i, "size-smaller"]
];
function classifyIntent(freeText) {
  const text = (freeText || "").trim();
  if (text.length === 0) return "default";
  for (const [re, intent] of INTENT_RULES) {
    if (re.test(text)) return intent;
  }
  return "default";
}
var TEXT_TAGS = /* @__PURE__ */ new Set([
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "p",
  "span",
  "a",
  "label",
  "em",
  "strong",
  "small",
  "sub",
  "sup",
  "blockquote",
  "code",
  "pre",
  "li"
]);
var CONTAINER_TAGS = /* @__PURE__ */ new Set([
  "div",
  "section",
  "article",
  "aside",
  "header",
  "footer",
  "nav",
  "main",
  "form",
  "ul",
  "ol",
  "figure",
  "fieldset"
]);
function classifyTag(tag) {
  const t = (tag || "").toLowerCase();
  if (t === "") return "default";
  if (t === "button") return "button";
  if (t === "input" || t === "textarea" || t === "select") return "input";
  if (t === "img" || t === "picture" || t === "video" || t === "svg") return "image";
  if (TEXT_TAGS.has(t)) return "text";
  if (CONTAINER_TAGS.has(t)) return "container";
  return "default";
}
var BASELINE = {
  css: "/* identity \u2014 baseline */",
  rationale: "Baseline: no changes applied \u2014 compare other variants against this."
};
var CONTAINER_VARIANTS = {
  default: [
    BASELINE,
    {
      css: `:scope { padding: 2em !important; }`,
      rationale: "More padding: generous internal whitespace improves readability and feels less cramped."
    },
    {
      css: `:scope { border-radius: 16px !important; box-shadow: 0 6px 20px -4px rgba(0,0,0,0.10) !important; }`,
      rationale: "Soft + elevated: rounder corners + a subtle drop shadow signals importance without shouting."
    }
  ],
  spacious: [
    BASELINE,
    {
      css: `:scope { /* @param: kind=range min=16 max=64 step=4 label="padding" */ --wisp-pad: 32px; padding: var(--wisp-pad) !important; gap: 1em !important; }`,
      rationale: "Generous padding: doubles internal spacing \u2014 feels premium and unhurried."
    },
    {
      css: `:scope { /* @param: kind=range min=16 max=64 step=4 label="padding" */ --wisp-pad: 48px; padding: var(--wisp-pad) !important; gap: 1.5em !important; }`,
      rationale: "Maximum breathing room: even more space for content to settle."
    }
  ],
  compact: [
    BASELINE,
    {
      css: `:scope { /* @param: kind=range min=0 max=24 step=2 label="padding" */ --wisp-pad: 12px; padding: var(--wisp-pad) !important; gap: 0.25em !important; }`,
      rationale: "Compact: tighter internal spacing \u2014 suits dense info or small cards."
    },
    {
      css: `:scope { /* @param: kind=range min=0 max=24 step=2 label="padding" */ --wisp-pad: 8px; padding: var(--wisp-pad) !important; gap: 0 !important; }`,
      rationale: "Ultra-tight: minimal padding, edge-to-edge content."
    }
  ],
  rounded: [
    BASELINE,
    {
      css: `:scope { border-radius: 16px !important; }`,
      rationale: "Soft corners: rounded 16px feels friendly and modern."
    },
    {
      css: `:scope { border-radius: 24px !important; overflow: hidden !important; }`,
      rationale: "Pillowy: 24px radius with clipped content for a fully soft feel."
    }
  ],
  squared: [
    BASELINE,
    {
      css: `:scope { border-radius: 0 !important; }`,
      rationale: "Sharp corners: removes the radius \u2014 more architectural, editorial."
    },
    {
      css: `:scope { border-radius: 0 !important; border: 2px solid currentColor !important; }`,
      rationale: "Sharp + bordered: hard edges with a 2px outline for a wireframe look."
    }
  ],
  elevated: [
    BASELINE,
    {
      css: `:scope { box-shadow: 0 8px 24px -4px rgba(0,0,0,0.12), 0 2px 8px -2px rgba(0,0,0,0.08) !important; }`,
      rationale: "Soft elevation: layered shadows signal the card is liftable."
    },
    {
      css: `:scope { box-shadow: 0 20px 48px -8px rgba(0,0,0,0.18), 0 6px 16px -2px rgba(0,0,0,0.10) !important; transform: translateY(-2px) !important; }`,
      rationale: "Floating: deeper shadow + 2px translateY makes the card feel detached from the page."
    }
  ],
  flat: [
    BASELINE,
    {
      css: `:scope { box-shadow: none !important; border: 1px solid rgb(229,229,229) !important; }`,
      rationale: "Flat: drops all shadows for a sharp 1px hairline border."
    },
    {
      css: `:scope { box-shadow: none !important; border: 0 !important; background: transparent !important; }`,
      rationale: "Truly flat: no border, no shadow, no background \u2014 pure content."
    }
  ],
  ghost: [
    BASELINE,
    {
      css: `:scope { background: transparent !important; border: 1px dashed currentColor !important; }`,
      rationale: "Ghost outline: dashed border + transparent fill signals secondary state."
    },
    {
      css: `:scope { background: transparent !important; opacity: 0.7 !important; border: 1px solid currentColor !important; }`,
      rationale: "Faded ghost: 70% opacity for a clearly deprioritised look."
    }
  ],
  contrast: [
    BASELINE,
    {
      css: `:scope { background: #000 !important; color: #fff !important; }`,
      rationale: "Inverted: black background + white text for maximum visual punch."
    },
    {
      css: `:scope { background: #fafafa !important; color: #000 !important; border: 2px solid #000 !important; }`,
      rationale: "Bordered + bold: 2px black border on near-white for editorial clarity."
    }
  ],
  accent: [
    BASELINE,
    {
      css: `:scope { border: 2px solid var(--color-accent, oklch(55% 0.2 260)) !important; }`,
      rationale: "Accent border: 2px brand-accent outline draws the eye."
    },
    {
      css: `:scope { background: var(--color-accent, oklch(55% 0.2 260)) !important; color: white !important; }`,
      rationale: "Accent fill: full accent background with white text \u2014 highest-emphasis card."
    }
  ],
  muted: [
    BASELINE,
    {
      css: `:scope { background: rgb(245,245,245) !important; }`,
      rationale: "Muted backdrop: pale gray background recedes into the page."
    },
    {
      css: `:scope { background: rgb(250,250,250) !important; box-shadow: none !important; opacity: 0.92 !important; }`,
      rationale: "Whisper-quiet: very pale, no shadow, slight transparency."
    }
  ],
  modern: [
    BASELINE,
    {
      css: `:scope { border-radius: 12px !important; padding: 1.5em !important; box-shadow: 0 4px 14px -4px rgba(0,0,0,0.08) !important; }`,
      rationale: "Modern: 12px radius + soft shadow + 1.5em padding \u2014 current design-system feel."
    },
    {
      css: `:scope { border-radius: 14px !important; padding: 2em !important; background: white !important; box-shadow: 0 8px 28px -6px rgba(0,0,0,0.12) !important; border: 1px solid rgb(245,245,245) !important; }`,
      rationale: "Premium modern: layered shadow + thin border + generous padding."
    }
  ],
  premium: [
    BASELINE,
    {
      css: `:scope { padding: 2.5em !important; border-radius: 4px !important; box-shadow: 0 1px 2px rgba(0,0,0,0.06) !important; border: 1px solid rgb(229,229,229) !important; }`,
      rationale: "Editorial: more padding + minimal radius + 1px line \u2014 restrained, expensive."
    },
    {
      css: `:scope { padding: 3em !important; border-radius: 0 !important; border-top: 4px solid currentColor !important; }`,
      rationale: "Top-rule: bold horizontal accent line + generous padding \u2014 magazine cover energy."
    }
  ],
  "weight-heavier": [
    BASELINE,
    {
      css: `:scope, :scope :is(h1,h2,h3,h4,h5,h6,p,span,a,button) { font-weight: 700 !important; }`,
      rationale: "Heavier text: bumps font-weight on all text inside to 700."
    },
    {
      css: `:scope, :scope :is(h1,h2,h3,h4,h5,h6,p,span,a,button) { font-weight: 800 !important; letter-spacing: -0.01em !important; }`,
      rationale: "Display-heavy: weight 800 + tighter letter-spacing for a confident voice."
    }
  ],
  "weight-lighter": [
    BASELINE,
    {
      css: `:scope, :scope :is(h1,h2,h3,h4,h5,h6,p,span,a,button) { font-weight: 300 !important; }`,
      rationale: "Lighter text: bumps all text to weight 300 for a delicate, airy feel."
    },
    {
      css: `:scope, :scope :is(h1,h2,h3,h4,h5,h6,p,span,a,button) { font-weight: 200 !important; letter-spacing: 0.02em !important; }`,
      rationale: "Whisper: weight 200 + wider tracking \u2014 elegant, restrained."
    }
  ],
  "size-bigger": [
    BASELINE,
    {
      css: `:scope { padding: 2em !important; }`,
      rationale: "Bigger card: doubles padding for a larger overall footprint."
    },
    {
      css: `:scope { padding: 2.5em !important; transform: scale(1.05) !important; transform-origin: top left !important; }`,
      rationale: "Hero-sized: 2.5em padding + 5% scale-up for a hero presence."
    }
  ],
  "size-smaller": [
    BASELINE,
    {
      css: `:scope { padding: 0.75em !important; }`,
      rationale: "Compact card: half the padding \u2014 sits quieter in a list."
    },
    {
      css: `:scope { padding: 0.5em !important; transform: scale(0.95) !important; transform-origin: top left !important; }`,
      rationale: "Mini card: tight padding + 5% scale-down \u2014 chip-like."
    }
  ]
};
var TEXT_VARIANTS = {
  default: [
    BASELINE,
    {
      css: `:scope, :scope * { font-weight: 700 !important; }`,
      rationale: "Bolder: weight 700 for stronger hierarchy."
    },
    {
      css: `:scope, :scope * { font-weight: 300 !important; letter-spacing: 0.01em !important; }`,
      rationale: "Lighter: weight 300 + wider tracking \u2014 recedes elegantly."
    }
  ],
  "weight-heavier": [
    BASELINE,
    {
      css: `:scope { /* @param: kind=range min=300 max=900 step=100 label="weight" */ --wisp-weight: 600; } :scope, :scope * { font-weight: var(--wisp-weight) !important; }`,
      rationale: "Semi-bold: weight 600 \u2014 substantial without shouting."
    },
    {
      css: `:scope { /* @param: kind=range min=300 max=900 step=100 label="weight" */ --wisp-weight: 800; } :scope, :scope * { font-weight: var(--wisp-weight) !important; letter-spacing: -0.02em !important; }`,
      rationale: "Display heavy: weight 800 + tight tracking."
    }
  ],
  "weight-lighter": [
    BASELINE,
    {
      css: `:scope { /* @param: kind=range min=100 max=500 step=100 label="weight" */ --wisp-weight: 300; } :scope, :scope * { font-weight: var(--wisp-weight) !important; }`,
      rationale: "Light: weight 300 reads as delicate."
    },
    {
      css: `:scope { /* @param: kind=range min=100 max=500 step=100 label="weight" */ --wisp-weight: 200; } :scope, :scope * { font-weight: var(--wisp-weight) !important; letter-spacing: 0.02em !important; }`,
      rationale: "Hairline: weight 200 + wider tracking \u2014 minimalist."
    }
  ],
  "size-bigger": [
    BASELINE,
    {
      css: `:scope, :scope * { font-size: calc(1em * 1.15) !important; }`,
      rationale: "Larger: 15% bigger font-size for stronger presence."
    },
    {
      css: `:scope, :scope * { font-size: calc(1em * 1.30) !important; letter-spacing: -0.01em !important; }`,
      rationale: "Display: 30% bigger + tighter tracking \u2014 hero treatment."
    }
  ],
  "size-smaller": [
    BASELINE,
    {
      css: `:scope, :scope * { font-size: calc(1em * 0.85) !important; }`,
      rationale: "Smaller: 15% reduction \u2014 secondary text feel."
    },
    {
      css: `:scope, :scope * { font-size: calc(1em * 0.75) !important; letter-spacing: 0.02em !important; }`,
      rationale: "Caption: 25% smaller + wider tracking \u2014 caption / legal text size."
    }
  ],
  spacious: [
    BASELINE,
    {
      css: `:scope { /* @param: kind=range min=1 max=2.4 step=0.1 label="line height" */ --wisp-leading: 1.6; } :scope, :scope * { line-height: var(--wisp-leading) !important; letter-spacing: 0.01em !important; }`,
      rationale: "Open reading: 1.6 line-height + slight tracking \u2014 easier to scan."
    },
    {
      css: `:scope { /* @param: kind=range min=1 max=2.4 step=0.1 label="line height" */ --wisp-leading: 1.8; } :scope, :scope * { line-height: var(--wisp-leading) !important; letter-spacing: 0.03em !important; word-spacing: 0.1em !important; }`,
      rationale: "Long-form: 1.8 line-height + wider tracking \u2014 magazine reading feel."
    }
  ],
  compact: [
    BASELINE,
    {
      css: `:scope { /* @param: kind=range min=1 max=2 step=0.05 label="line height" */ --wisp-leading: 1.25; } :scope, :scope * { line-height: var(--wisp-leading) !important; }`,
      rationale: "Tight: 1.25 line-height \u2014 denser block of type."
    },
    {
      css: `:scope { /* @param: kind=range min=1 max=2 step=0.05 label="line height" */ --wisp-leading: 1.1; } :scope, :scope * { line-height: var(--wisp-leading) !important; letter-spacing: -0.01em !important; }`,
      rationale: "Ultra-tight: 1.1 line-height + tighter tracking \u2014 micro-typography."
    }
  ],
  contrast: [
    BASELINE,
    {
      css: `:scope, :scope * { color: #000 !important; font-weight: 600 !important; }`,
      rationale: "Maximum contrast: pure-black + semi-bold for highest readability."
    },
    {
      css: `:scope, :scope * { color: #fff !important; background: #000 !important; padding: 0.5em !important; }`,
      rationale: "Inverted: white text on black \u2014 strongest visual impact."
    }
  ],
  accent: [
    BASELINE,
    {
      css: `:scope, :scope * { color: var(--color-accent, oklch(55% 0.2 260)) !important; }`,
      rationale: "Accent colored: brand color text."
    },
    {
      css: `:scope, :scope * { color: var(--color-accent, oklch(55% 0.2 260)) !important; font-weight: 700 !important; }`,
      rationale: "Accent + bold: brand color + weight 700 for emphasis."
    }
  ],
  muted: [
    BASELINE,
    {
      css: `:scope, :scope * { color: rgb(115,115,115) !important; }`,
      rationale: "Muted: mid-gray text \u2014 recedes from primary content."
    },
    {
      css: `:scope, :scope * { color: rgb(163,163,163) !important; font-weight: 400 !important; }`,
      rationale: "Soft-mute: paler gray + normal weight."
    }
  ],
  rounded: [
    BASELINE,
    {
      css: `:scope { padding: 0.4em 0.8em !important; border-radius: 6px !important; background: rgba(0,0,0,0.04) !important; }`,
      rationale: "Pill text: rounded background bubble around the text."
    },
    {
      css: `:scope { padding: 0.5em 1em !important; border-radius: 9999px !important; background: rgba(0,0,0,0.06) !important; }`,
      rationale: "Full pill: rounded-full bubble for a tag-style treatment."
    }
  ],
  squared: [
    BASELINE,
    {
      css: `:scope, :scope * { letter-spacing: 0.05em !important; text-transform: uppercase !important; font-weight: 500 !important; }`,
      rationale: "Editorial caps: wide-tracked uppercase \u2014 architectural."
    },
    {
      css: `:scope, :scope * { letter-spacing: 0.1em !important; text-transform: uppercase !important; font-weight: 600 !important; }`,
      rationale: "Tracked caps: extra-wide uppercase for fashion/editorial vibe."
    }
  ],
  elevated: [
    BASELINE,
    {
      css: `:scope, :scope * { text-shadow: 0 1px 2px rgba(0,0,0,0.10) !important; }`,
      rationale: "Subtle drop-shadow: 1px text shadow lifts the type off the page."
    },
    {
      css: `:scope, :scope * { text-shadow: 0 2px 8px rgba(0,0,0,0.15) !important; }`,
      rationale: "Floating type: deeper text shadow for a clear lift."
    }
  ],
  flat: [
    BASELINE,
    {
      css: `:scope, :scope * { text-shadow: none !important; }`,
      rationale: "Flat: strips any text-shadow."
    },
    {
      css: `:scope, :scope * { text-shadow: none !important; font-weight: 400 !important; letter-spacing: 0 !important; }`,
      rationale: "Stripped: normal weight, no shadow, default tracking."
    }
  ],
  ghost: [
    BASELINE,
    {
      css: `:scope, :scope * { opacity: 0.55 !important; }`,
      rationale: "Ghost: 55% opacity \u2014 clearly secondary."
    },
    {
      css: `:scope, :scope * { opacity: 0.4 !important; }`,
      rationale: "Faded ghost: 40% opacity \u2014 very deprioritised."
    }
  ],
  modern: [
    BASELINE,
    {
      css: `:scope, :scope * { font-weight: 600 !important; letter-spacing: -0.01em !important; }`,
      rationale: "Modern semibold: weight 600 + slight negative tracking \u2014 current design language."
    },
    {
      css: `:scope, :scope * { font-weight: 700 !important; letter-spacing: -0.02em !important; line-height: 1.1 !important; }`,
      rationale: "Hero modern: heavy + tight tracking + tight leading \u2014 display type."
    }
  ],
  premium: [
    BASELINE,
    {
      css: `:scope, :scope * { font-weight: 400 !important; letter-spacing: 0.02em !important; line-height: 1.4 !important; }`,
      rationale: "Editorial: regular weight + slight extra tracking \u2014 refined typography."
    },
    {
      css: `:scope, :scope * { font-weight: 300 !important; letter-spacing: 0.04em !important; line-height: 1.5 !important; }`,
      rationale: "Luxury: light weight + wider tracking \u2014 fashion/luxury voice."
    }
  ]
};
var BUTTON_VARIANTS = {
  default: [
    BASELINE,
    {
      css: `:scope { padding: 0.75em 1.5em !important; border-radius: 8px !important; }`,
      rationale: "Comfortable: more padding + standard 8px radius."
    },
    {
      css: `:scope { padding: 0.5em 1.25em !important; border-radius: 9999px !important; }`,
      rationale: "Pill button: pill-shape with relaxed padding."
    }
  ],
  rounded: [
    BASELINE,
    {
      css: `:scope { border-radius: 12px !important; }`,
      rationale: "Soft button: 12px corners."
    },
    {
      css: `:scope { border-radius: 9999px !important; padding-inline: 1.5em !important; }`,
      rationale: "Pill: fully rounded with wider horizontal padding."
    }
  ],
  squared: [
    BASELINE,
    {
      css: `:scope { border-radius: 0 !important; }`,
      rationale: "Sharp button: removes radius \u2014 architectural."
    },
    {
      css: `:scope { border-radius: 2px !important; border: 2px solid currentColor !important; background: transparent !important; }`,
      rationale: "Wireframe outline: 2px radius, 2px border, transparent fill."
    }
  ],
  ghost: [
    BASELINE,
    {
      css: `:scope { background: transparent !important; color: currentColor !important; border: 1px solid currentColor !important; }`,
      rationale: "Ghost outline: transparent fill with 1px border."
    },
    {
      css: `:scope { background: transparent !important; text-decoration: underline !important; padding: 0 !important; border: 0 !important; }`,
      rationale: "Link button: text-only with underline \u2014 least emphasis."
    }
  ],
  accent: [
    BASELINE,
    {
      css: `:scope { background: var(--color-accent, oklch(55% 0.2 260)) !important; color: white !important; border: 0 !important; }`,
      rationale: "Accent button: brand accent fill + white text."
    },
    {
      css: `:scope { background: var(--color-accent, oklch(55% 0.2 260)) !important; color: white !important; border-radius: 9999px !important; padding: 0.7em 1.8em !important; }`,
      rationale: "Accent pill: brand color + pill shape + roomy padding."
    }
  ],
  contrast: [
    BASELINE,
    {
      css: `:scope { background: #000 !important; color: #fff !important; font-weight: 600 !important; }`,
      rationale: "High contrast: black fill + white text + semibold."
    },
    {
      css: `:scope { background: #000 !important; color: #fff !important; border: 2px solid #000 !important; font-weight: 700 !important; padding: 0.8em 1.6em !important; }`,
      rationale: "Hero CTA: bold black button with thicker padding."
    }
  ],
  "size-bigger": [
    BASELINE,
    {
      css: `:scope { padding: 0.8em 1.8em !important; font-size: calc(1em * 1.1) !important; }`,
      rationale: "Bigger CTA: more padding + 10% bigger text."
    },
    {
      css: `:scope { padding: 1em 2em !important; font-size: calc(1em * 1.25) !important; font-weight: 600 !important; }`,
      rationale: "Hero CTA: big padding + 25% bigger text + semibold."
    }
  ],
  "size-smaller": [
    BASELINE,
    {
      css: `:scope { padding: 0.35em 0.75em !important; font-size: calc(1em * 0.875) !important; }`,
      rationale: "Smaller: tighter padding + 12.5% smaller text."
    },
    {
      css: `:scope { padding: 0.25em 0.5em !important; font-size: calc(1em * 0.75) !important; }`,
      rationale: "Tag-sized: micro button for chip-style usage."
    }
  ],
  "weight-heavier": [
    BASELINE,
    {
      css: `:scope { font-weight: 600 !important; }`,
      rationale: "Semibold label: weight 600."
    },
    {
      css: `:scope { font-weight: 700 !important; letter-spacing: 0.02em !important; }`,
      rationale: "Bold tracked: weight 700 + slight tracking \u2014 confident CTA."
    }
  ],
  "weight-lighter": [
    BASELINE,
    {
      css: `:scope { font-weight: 400 !important; }`,
      rationale: "Regular weight: drops emphasis to 400."
    },
    {
      css: `:scope { font-weight: 300 !important; letter-spacing: 0.02em !important; }`,
      rationale: "Light label: weight 300 \u2014 text-link feel."
    }
  ],
  elevated: [
    BASELINE,
    {
      css: `:scope { box-shadow: 0 4px 14px -4px rgba(0,0,0,0.20) !important; }`,
      rationale: "Lifted: soft drop shadow on the button."
    },
    {
      css: `:scope { box-shadow: 0 8px 20px -4px rgba(0,0,0,0.25) !important; transform: translateY(-1px) !important; }`,
      rationale: "Hovering: deeper shadow + 1px lift \u2014 feels clickable."
    }
  ],
  flat: [
    BASELINE,
    {
      css: `:scope { box-shadow: none !important; border: 0 !important; }`,
      rationale: "Flat: no shadow, no border."
    },
    {
      css: `:scope { box-shadow: none !important; border: 0 !important; background: transparent !important; color: currentColor !important; padding: 0.5em !important; }`,
      rationale: "Plain text button: stripped to text-only."
    }
  ],
  spacious: [
    BASELINE,
    {
      css: `:scope { padding: 0.9em 1.8em !important; }`,
      rationale: "Roomy: extra padding all around."
    },
    {
      css: `:scope { padding: 1.1em 2.4em !important; letter-spacing: 0.04em !important; }`,
      rationale: "Spacious + tracked: extra padding + open tracking \u2014 confident."
    }
  ],
  compact: [
    BASELINE,
    {
      css: `:scope { padding: 0.35em 0.75em !important; }`,
      rationale: "Compact: tighter padding for dense layouts."
    },
    {
      css: `:scope { padding: 0.25em 0.5em !important; font-size: calc(1em * 0.9) !important; }`,
      rationale: "Mini button: very tight + slightly smaller text."
    }
  ],
  muted: [
    BASELINE,
    {
      css: `:scope { background: rgb(245,245,245) !important; color: rgb(64,64,64) !important; }`,
      rationale: "Quiet button: pale gray fill + dark-gray text."
    },
    {
      css: `:scope { background: rgb(250,250,250) !important; color: rgb(115,115,115) !important; border: 1px solid rgb(229,229,229) !important; }`,
      rationale: "Ghost-quiet: very pale + thin border + muted text."
    }
  ],
  modern: [
    BASELINE,
    {
      css: `:scope { border-radius: 10px !important; padding: 0.7em 1.4em !important; font-weight: 500 !important; }`,
      rationale: "Modern button: 10px radius + medium weight."
    },
    {
      css: `:scope { border-radius: 12px !important; padding: 0.8em 1.6em !important; font-weight: 500 !important; box-shadow: 0 2px 4px rgba(0,0,0,0.06) !important; }`,
      rationale: "Modern + shadow: subtle shadow + soft corners + medium weight."
    }
  ],
  premium: [
    BASELINE,
    {
      css: `:scope { border-radius: 2px !important; padding: 0.8em 2em !important; letter-spacing: 0.08em !important; text-transform: uppercase !important; font-weight: 500 !important; }`,
      rationale: "Editorial CTA: sharp corners + tracked uppercase \u2014 luxury fashion CTA."
    },
    {
      css: `:scope { background: #000 !important; color: #fff !important; border-radius: 0 !important; padding: 1em 2.4em !important; letter-spacing: 0.1em !important; text-transform: uppercase !important; font-weight: 500 !important; }`,
      rationale: "Hero editorial: black + sharp + extra-tracked uppercase \u2014 high-end retail."
    }
  ]
};
var IMAGE_VARIANTS = {
  default: [
    BASELINE,
    {
      css: `:scope { border-radius: 12px !important; }`,
      rationale: "Rounded: 12px radius softens the edges."
    },
    {
      css: `:scope { border-radius: 9999px !important; aspect-ratio: 1 !important; object-fit: cover !important; }`,
      rationale: "Circular: full-round avatar treatment."
    }
  ],
  rounded: [
    BASELINE,
    {
      css: `:scope { border-radius: 12px !important; }`,
      rationale: "Soft 12px corners."
    },
    {
      css: `:scope { border-radius: 9999px !important; aspect-ratio: 1 !important; object-fit: cover !important; }`,
      rationale: "Avatar circle."
    }
  ],
  squared: [
    BASELINE,
    {
      css: `:scope { border-radius: 0 !important; }`,
      rationale: "Sharp: no radius."
    },
    {
      css: `:scope { border-radius: 0 !important; border: 2px solid currentColor !important; }`,
      rationale: "Bordered: 2px frame + sharp corners."
    }
  ],
  elevated: [
    BASELINE,
    {
      css: `:scope { box-shadow: 0 8px 24px -4px rgba(0,0,0,0.18) !important; border-radius: 8px !important; }`,
      rationale: "Lifted: drop shadow + soft corners."
    },
    {
      css: `:scope { box-shadow: 0 20px 48px -8px rgba(0,0,0,0.25) !important; border-radius: 12px !important; transform: translateY(-2px) !important; }`,
      rationale: "Floating: deeper shadow + 2px lift."
    }
  ],
  muted: [
    BASELINE,
    {
      css: `:scope { opacity: 0.85 !important; filter: saturate(0.8) !important; }`,
      rationale: "Soft: 85% opacity + 80% saturation."
    },
    {
      css: `:scope { opacity: 0.7 !important; filter: grayscale(1) !important; }`,
      rationale: "Grayscale: fully desaturated + 70% opacity."
    }
  ],
  contrast: [
    BASELINE,
    {
      css: `:scope { filter: contrast(1.2) saturate(1.1) !important; }`,
      rationale: "Punchy: 120% contrast + slightly bumped saturation."
    },
    {
      css: `:scope { filter: contrast(1.4) saturate(1.2) !important; }`,
      rationale: "Vivid: 140% contrast + 120% saturation."
    }
  ],
  // Reasonable fallbacks for other intents on images.
  spacious: [
    BASELINE,
    { css: `:scope { padding: 1em !important; background: white !important; box-shadow: 0 2px 8px rgba(0,0,0,0.08) !important; }`, rationale: "Polaroid: 1em white padding + soft shadow \u2014 photo print look." },
    { css: `:scope { padding: 1.5em !important; background: white !important; box-shadow: 0 6px 16px rgba(0,0,0,0.12) !important; }`, rationale: "Wide polaroid: more padding for a magazine-print feel." }
  ],
  compact: [
    BASELINE,
    { css: `:scope { padding: 0 !important; margin: 0 !important; }`, rationale: "Edge-to-edge: removes all surrounding space." },
    { css: `:scope { padding: 0 !important; margin: 0 !important; border-radius: 4px !important; }`, rationale: "Edge + slight curve: 4px radius keeps it crisp." }
  ],
  ghost: [
    BASELINE,
    { css: `:scope { opacity: 0.5 !important; }`, rationale: "Translucent: 50% opacity." },
    { css: `:scope { opacity: 0.3 !important; filter: grayscale(0.5) !important; }`, rationale: "Faded grayscale: 30% opacity + partial desaturation." }
  ],
  flat: [
    BASELINE,
    { css: `:scope { box-shadow: none !important; border: 0 !important; }`, rationale: "Flat: removes shadows and borders." },
    { css: `:scope { box-shadow: none !important; border: 0 !important; border-radius: 0 !important; }`, rationale: "Edge-flat: also drops the radius." }
  ],
  accent: [
    BASELINE,
    { css: `:scope { border: 3px solid var(--color-accent, oklch(55% 0.2 260)) !important; }`, rationale: "Accent frame: 3px brand-accent border." },
    { css: `:scope { box-shadow: 0 0 0 4px var(--color-accent, oklch(55% 0.2 260)) !important; }`, rationale: "Accent halo: 4px brand-accent ring around the image." }
  ],
  "weight-heavier": [
    BASELINE,
    { css: `:scope { filter: contrast(1.15) !important; }`, rationale: "Punchier: 15% more contrast \u2014 heavier visual weight." },
    { css: `:scope { filter: contrast(1.25) saturate(1.1) !important; }`, rationale: "Strong: 25% more contrast + bumped saturation." }
  ],
  "weight-lighter": [
    BASELINE,
    { css: `:scope { filter: contrast(0.9) brightness(1.05) !important; }`, rationale: "Soft: reduced contrast + slight brightness lift." },
    { css: `:scope { filter: contrast(0.8) brightness(1.1) saturate(0.9) !important; }`, rationale: "Hazy: faded vibe \u2014 less contrast, more brightness, less saturation." }
  ],
  "size-bigger": [
    BASELINE,
    { css: `:scope { transform: scale(1.1) !important; transform-origin: center !important; }`, rationale: "10% larger via transform." },
    { css: `:scope { transform: scale(1.25) !important; transform-origin: center !important; }`, rationale: "25% larger via transform." }
  ],
  "size-smaller": [
    BASELINE,
    { css: `:scope { transform: scale(0.9) !important; transform-origin: center !important; }`, rationale: "10% smaller via transform." },
    { css: `:scope { transform: scale(0.75) !important; transform-origin: center !important; }`, rationale: "25% smaller via transform." }
  ],
  modern: [
    BASELINE,
    { css: `:scope { border-radius: 10px !important; box-shadow: 0 4px 12px rgba(0,0,0,0.08) !important; }`, rationale: "Modern image: 10px radius + soft shadow." },
    { css: `:scope { border-radius: 16px !important; box-shadow: 0 8px 24px rgba(0,0,0,0.12) !important; }`, rationale: "Premium modern: bigger radius + deeper shadow." }
  ],
  premium: [
    BASELINE,
    { css: `:scope { border-radius: 0 !important; box-shadow: 0 2px 4px rgba(0,0,0,0.06) !important; }`, rationale: "Editorial: sharp corners + minimal shadow." },
    { css: `:scope { border-radius: 0 !important; box-shadow: none !important; outline: 1px solid currentColor !important; outline-offset: 8px !important; }`, rationale: "Framed: 1px outline offset 8px \u2014 luxury gallery frame." }
  ]
};
var INPUT_VARIANTS = {
  default: [
    BASELINE,
    { css: `:scope { padding: 0.6em 0.9em !important; border-radius: 8px !important; border: 1px solid rgb(212,212,212) !important; }`, rationale: "Comfortable: more padding + 8px radius + neutral border." },
    { css: `:scope { padding: 0.5em 0.75em !important; border: 0 !important; border-bottom: 2px solid currentColor !important; border-radius: 0 !important; background: transparent !important; }`, rationale: "Underline only: borderless except 2px underline \u2014 minimal." }
  ],
  rounded: [
    BASELINE,
    { css: `:scope { border-radius: 9999px !important; padding-inline: 1em !important; }`, rationale: "Pill input." },
    { css: `:scope { border-radius: 12px !important; padding: 0.7em 1em !important; }`, rationale: "Soft 12px corners + roomy padding." }
  ],
  squared: [
    BASELINE,
    { css: `:scope { border-radius: 0 !important; }`, rationale: "Sharp: no radius." },
    { css: `:scope { border-radius: 0 !important; border: 2px solid currentColor !important; }`, rationale: "Wireframe: sharp + 2px border." }
  ],
  ghost: [
    BASELINE,
    { css: `:scope { background: transparent !important; border: 1px dashed currentColor !important; }`, rationale: "Ghost: transparent + dashed border." },
    { css: `:scope { background: transparent !important; border: 0 !important; border-bottom: 1px dashed currentColor !important; border-radius: 0 !important; }`, rationale: "Ghost underline only." }
  ],
  accent: [
    BASELINE,
    { css: `:scope { border: 2px solid var(--color-accent, oklch(55% 0.2 260)) !important; }`, rationale: "Accent border on the field." },
    { css: `:scope:focus { box-shadow: 0 0 0 3px var(--color-accent, oklch(55% 0.2 260)) !important; }`, rationale: "Accent focus ring: 3px brand-color halo on focus." }
  ],
  "size-bigger": [
    BASELINE,
    { css: `:scope { padding: 0.8em 1em !important; font-size: 1.05em !important; }`, rationale: "Larger input: more padding + 5% bigger text." },
    { css: `:scope { padding: 1em 1.25em !important; font-size: 1.15em !important; }`, rationale: "XL input: very roomy + 15% bigger text." }
  ],
  "size-smaller": [
    BASELINE,
    { css: `:scope { padding: 0.35em 0.6em !important; font-size: 0.9em !important; }`, rationale: "Smaller: tighter padding + smaller text." },
    { css: `:scope { padding: 0.25em 0.5em !important; font-size: 0.85em !important; }`, rationale: "Compact: very tight." }
  ],
  spacious: [
    BASELINE,
    { css: `:scope { padding: 0.8em 1.2em !important; }`, rationale: "Roomy input." },
    { css: `:scope { padding: 1em 1.4em !important; }`, rationale: "Very roomy." }
  ],
  compact: [
    BASELINE,
    { css: `:scope { padding: 0.35em 0.5em !important; }`, rationale: "Tight input." },
    { css: `:scope { padding: 0.2em 0.4em !important; }`, rationale: "Mini input." }
  ],
  contrast: [
    BASELINE,
    { css: `:scope { border: 2px solid currentColor !important; }`, rationale: "Strong 2px border." },
    { css: `:scope { background: #000 !important; color: #fff !important; border: 0 !important; }`, rationale: "Inverted: black bg + white text." }
  ],
  muted: [
    BASELINE,
    { css: `:scope { background: rgb(245,245,245) !important; border: 0 !important; }`, rationale: "Pale fill, no border." },
    { css: `:scope { background: rgb(250,250,250) !important; border: 1px solid rgb(229,229,229) !important; color: rgb(64,64,64) !important; }`, rationale: "Very quiet input." }
  ],
  elevated: [
    BASELINE,
    { css: `:scope { box-shadow: 0 2px 8px rgba(0,0,0,0.06) !important; }`, rationale: "Subtle lift." },
    { css: `:scope { box-shadow: 0 4px 14px rgba(0,0,0,0.10) !important; transform: translateY(-1px) !important; }`, rationale: "Hovering input." }
  ],
  flat: [
    BASELINE,
    { css: `:scope { box-shadow: none !important; border: 0 !important; border-bottom: 1px solid currentColor !important; border-radius: 0 !important; background: transparent !important; }`, rationale: "Underline only \u2014 minimal." },
    { css: `:scope { box-shadow: none !important; border: 0 !important; background: rgb(245,245,245) !important; }`, rationale: "Filled-flat: pale fill, no border." }
  ],
  "weight-heavier": [
    BASELINE,
    { css: `:scope { font-weight: 500 !important; }`, rationale: "Medium-weight input text." },
    { css: `:scope { font-weight: 600 !important; }`, rationale: "Semibold input text." }
  ],
  "weight-lighter": [
    BASELINE,
    { css: `:scope { font-weight: 300 !important; }`, rationale: "Light-weight input text." },
    { css: `:scope { font-weight: 200 !important; }`, rationale: "Hairline input text." }
  ],
  modern: [
    BASELINE,
    { css: `:scope { padding: 0.7em 1em !important; border-radius: 10px !important; border: 1px solid rgb(229,229,229) !important; }`, rationale: "Modern field: 10px radius + roomy padding." },
    { css: `:scope { padding: 0.8em 1.2em !important; border-radius: 12px !important; border: 1px solid rgb(229,229,229) !important; background: white !important; }`, rationale: "Premium modern field." }
  ],
  premium: [
    BASELINE,
    { css: `:scope { border-radius: 0 !important; border: 0 !important; border-bottom: 1px solid currentColor !important; padding-block: 0.5em !important; background: transparent !important; letter-spacing: 0.02em !important; }`, rationale: "Editorial input: underline only + slight tracking." },
    { css: `:scope { border-radius: 0 !important; border: 0 !important; border-bottom: 2px solid currentColor !important; padding-block: 0.6em !important; background: transparent !important; letter-spacing: 0.04em !important; font-weight: 300 !important; }`, rationale: "Couture field: 2px underline + light + tracked." }
  ]
};
var DEFAULT_VARIANTS = CONTAINER_VARIANTS;
var CATALOG = (() => {
  const intents = [
    "default",
    "weight-heavier",
    "weight-lighter",
    "size-bigger",
    "size-smaller",
    "rounded",
    "squared",
    "spacious",
    "compact",
    "contrast",
    "accent",
    "muted",
    "ghost",
    "elevated",
    "flat",
    "modern",
    "premium"
  ];
  const out = {};
  for (const intent of intents) {
    out[intent] = {
      container: CONTAINER_VARIANTS[intent] ?? CONTAINER_VARIANTS.default,
      text: TEXT_VARIANTS[intent] ?? TEXT_VARIANTS.default,
      button: BUTTON_VARIANTS[intent] ?? BUTTON_VARIANTS.default,
      input: INPUT_VARIANTS[intent] ?? INPUT_VARIANTS.default,
      image: IMAGE_VARIANTS[intent] ?? IMAGE_VARIANTS.default,
      default: DEFAULT_VARIANTS[intent] ?? DEFAULT_VARIANTS.default
    };
  }
  return out;
})();
function clamp(n, lo, hi) {
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, Math.floor(n)));
}

// src/contracts/live.ts
import { z as z2 } from "zod";
var LIVE_MIN_VARIANTS = 1;
var LIVE_MAX_VARIANTS = 8;
var LIVE_DEFAULT_VARIANTS = 3;
var LiveVerifyModeSchema = z2.enum([
  "stop-hook",
  "live-accept",
  "live-with-screenshot"
]);
var LiveCliFlagsSchema = z2.object({
  // Target dev-server URL. Required when --inject is set (we need to know
  // where the dev server is running so the bridge can resolve livePreviewUrl
  // for multi-viewport verify). Optional when the user opts to paste the
  // <script src> manually — they're providing the URL implicitly.
  target: z2.string().url().optional(),
  // Preferred bridge port. Undefined → port-discovery picks 31337..31400.
  port: z2.number().int().min(1).max(65535).optional(),
  // Project-relative path to the HTML entry file that should host the
  // <script src=".../live.js"> tag. When undefined, runner prints
  // instructions to stdout and does NOT touch source files.
  inject: z2.string().min(1).optional(),
  quiet: z2.boolean().default(false),
  strict: z2.boolean().default(false),
  verifyMode: LiveVerifyModeSchema.default("live-accept"),
  maxVariants: z2.number().int().min(LIVE_MIN_VARIANTS).max(LIVE_MAX_VARIANTS).default(LIVE_DEFAULT_VARIANTS),
  // Phase 7.8 — `agent-driven` mode. When true, the in-process loop does
  // NOT generate variants via the deterministic stub catalog. Two
  // sub-modes (see `externalAgent` below):
  //   - In-process claude spawn (default): daemon shells out to
  //     `claude -p --model haiku` for each generating event.
  //   - External-agent mode (`--external-agent`): daemon leaves
  //     `generating` events in the bridge queue. An active Claude
  //     conversation polls and posts back.
  // The in-process loop ALWAYS handles accept/discard/annotation events
  // regardless of mode.
  agentDriven: z2.boolean().default(false),
  // Phase 7.10 — when true, agent-driven mode does NOT spawn claude
  // internally. Use this when an interactive Claude session (e.g. Opus)
  // is actively polling the bridge and wants to be the variant designer.
  externalAgent: z2.boolean().default(false)
}).refine((v) => !(v.inject !== void 0 && v.target === void 0), {
  message: "--target is required when --inject is set",
  path: ["target"]
});
var LiveSessionStateSchema = z2.object({
  sessionId: z2.string().min(1),
  bridge: z2.object({
    port: z2.number().int().positive(),
    token: z2.string().uuid()
  }),
  // The dev-server URL the user pointed us at (or undefined when no --target).
  target: z2.string().url().optional(),
  // Project-relative paths injected with <script>. Tracked so SIGINT can
  // reverse them via `removeLiveScript`. Append-only over the run.
  injectedFiles: z2.array(z2.string().min(1)),
  started: z2.string().datetime()
});
var LiveVariantBatchSchema = z2.object({
  pickerEventId: z2.string().min(1),
  selector: z2.string().min(1),
  variants: z2.array(
    z2.object({
      id: z2.string().min(1),
      css: z2.string(),
      rationale: z2.string().min(1)
    })
  ).min(LIVE_MIN_VARIANTS).max(LIVE_MAX_VARIANTS)
});
var LiveAcceptResultSchema = z2.object({
  accepted: z2.boolean(),
  variantId: z2.string().min(1),
  gateVerdict: z2.unknown(),
  sourceFile: z2.string().min(1).optional(),
  splice: z2.object({
    start: z2.number().int().nonnegative(),
    end: z2.number().int().nonnegative(),
    replaced: z2.number().int().nonnegative()
  }).optional()
});

// src/agent/live.ts
init_helpers();
var lastConfigureContext = /* @__PURE__ */ new Map();
var LIVE_HELP_TEXT = `wisp-design live \u2014 boot bridge + inject live.js into your dev page.

Usage:
  wisp-design live [options]

Options:
  --target <url>                Your dev-server URL (e.g. http://localhost:5173).
                                Required when --inject is set.
  --inject <path>               Path to an HTML file to inject the <script> into.
  --port <n>                    Preferred bridge port. Default: auto-discover (31337..31400).
  --strict                      Verify-gate blocks accept on hard-bans (default: warn).
  --max-variants <n>            Cap variants per generate (1..8). Default: 3.
  --verify-mode <m>             stop-hook | live-accept | live-with-screenshot. Default: live-accept.
  --agent-driven                Delegate variant generation to an external agent
                                (e.g. the Claude session running /wisp-design live).
                                The in-process loop only handles accept/discard/
                                annotation. Variants come from
                                "wisp-design post-event --kind cycling".
  --quiet                       Emit boot info as one-line JSON to stdout; no banner.
  --non-interactive             Skip wizard; use sensible defaults.
  --help, -h                    Print this help.

Examples:
  # Auto-discover port, print connect snippet:
  wisp-design live

  # Inject into your Next.js page + connect to dev server:
  wisp-design live --inject pages/index.tsx --target http://localhost:3000

  # Strict mode for CI:
  wisp-design live --strict --quiet --inject src/App.tsx --target http://localhost:5173
`;
function mapFlags(args) {
  const parsed = parseFlags(args);
  const raw = {
    target: flagAsString(parsed, "target"),
    port: flagAsNumber(parsed, "port"),
    inject: flagAsString(parsed, "inject"),
    quiet: flagAsBoolean(parsed, "quiet", false),
    strict: flagAsBoolean(parsed, "strict", false),
    verifyMode: flagAsString(parsed, "verify-mode") ?? flagAsString(parsed, "verifyMode"),
    maxVariants: flagAsNumber(parsed, "max-variants") ?? flagAsNumber(parsed, "maxVariants"),
    // Phase 7.8 — defaults to TRUE when the flag is present in any form.
    // Old runs (no flag) keep the legacy stub behaviour for back-compat.
    // Accept three aliases: `--agent-driven`, `--agentDriven`, `--no-stub-variants`.
    agentDriven: parsed.flags["agent-driven"] === true || parsed.flags["agentDriven"] === true || parsed.flags["no-stub-variants"] === true || parsed.flags["external-agent"] === true || void 0,
    // Phase 7.10 — when set, agent-driven mode does NOT spawn `claude -p`
    // internally. Instead it leaves `generating` events in the bridge queue
    // for an external poller (an active Claude conversation) to handle.
    externalAgent: parsed.flags["external-agent"] === true || parsed.flags["externalAgent"] === true || void 0
    // non-interactive is consumed by tests but not in the schema — strip it.
  };
  for (const k of Object.keys(raw)) {
    if (raw[k] === void 0) delete raw[k];
  }
  const checked = LiveCliFlagsSchema.safeParse(raw);
  if (!checked.success) {
    return {
      ok: false,
      message: checked.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")
    };
  }
  return { ok: true, flags: checked.data };
}
var VARIANT_DELTAS = [
  {
    css: "/* identity \u2014 baseline */",
    rationale: "Baseline: no changes applied \u2014 compare other variants against this."
  },
  {
    css: `:scope, :scope * { font-weight: calc(var(--font-weight, 400) + 200) !important; font-size: calc(1em * 1.1) !important; letter-spacing: -0.02em !important; }`,
    rationale: "Increased weight: heavier type creates stronger visual hierarchy and draws the eye."
  },
  {
    css: `:scope, :scope * { font-weight: max(100, calc(var(--font-weight, 400) - 100)) !important; filter: saturate(0.8); opacity: 0.9; }`,
    rationale: "Reduced weight: lighter, desaturated treatment recedes into the background."
  },
  {
    css: `:scope, :scope * { line-height: 1.8 !important; } :scope { padding: 1.5em; }`,
    rationale: "Open air: generous line-height and padding improves readability for long-form content."
  },
  {
    css: `:scope, :scope * { line-height: 1.2 !important; } :scope { padding: 0.25em; }`,
    rationale: "Compact: tight spacing suits dense data tables or navigation lists."
  },
  {
    css: `:scope, :scope * { color: #111 !important; } :scope { background-color: #fafafa; outline: 1px solid #333; }`,
    rationale: "High contrast: pure-black type on near-white meets WCAG AAA contrast ratio."
  },
  {
    css: `:scope, :scope * { color: var(--color-accent, oklch(55% 0.2 260)) !important; font-weight: 600 !important; }`,
    rationale: "Accent shift: uses your design-system accent token for brand-aligned emphasis."
  },
  {
    css: `:scope { opacity: 0.65; border: 1px dashed currentColor; background: transparent; }`,
    rationale: "Ghost: transparent background with dashed border signals a secondary or disabled state."
  }
];
function generateVariantsStub(selector, maxVariants, context) {
  if (context !== void 0) {
    const catalogVariants = generateVariantsFromIntent({
      freeText: context.freeText ?? "",
      targetTag: context.targetTag ?? "",
      maxVariants
    });
    const out = [];
    for (let i = 0; i < catalogVariants.length; i += 1) {
      out.push({
        id: `v${i}`,
        css: catalogVariants[i].css,
        rationale: catalogVariants[i].rationale
      });
    }
    return out;
  }
  const count = Math.min(Math.max(1, maxVariants), LIVE_MAX_VARIANTS, VARIANT_DELTAS.length);
  const variants = [];
  for (let i = 0; i < count; i += 1) {
    const delta = VARIANT_DELTAS[i];
    const id = `v${i}`;
    variants.push({ id, css: delta.css, rationale: delta.rationale });
  }
  void selector;
  return variants;
}
async function dispatchEvent(ev, state, flags, cwd) {
  const { sessionLogger: sessionLogger2 } = await Promise.resolve().then(() => (init_logger(), logger_exports));
  const { postEvent: postEvent2 } = await Promise.resolve().then(() => (init_poll_loop(), poll_loop_exports));
  const bridgeUrl = `http://127.0.0.1:${state.bridge.port}`;
  const token = state.bridge.token;
  const logOpts = { projectRoot: cwd };
  switch (ev.kind) {
    case "generating": {
      const selector = ev.target.selector;
      const targetId = ev.target.selector;
      await sessionLogger2.logConfigure(state.sessionId, { targetId, freeText: ev.freeText }, logOpts);
      lastConfigureContext.set(selector, {
        freeText: ev.freeText,
        targetTag: ev.target.tag
      });
      const variantCount = Math.min(ev.variantCount, flags.maxVariants);
      if (flags.agentDriven) {
        if (state.injectedFiles.length > 0) {
          const filePath = state.injectedFiles[0];
          try {
            const { wrapVariantBlock: wrapVariantBlock2 } = await Promise.resolve().then(() => (init_wrap(), wrap_exports));
            await wrapVariantBlock2(
              filePath,
              { id: targetId, selector },
              state.sessionId,
              variantCount,
              { projectRoot: cwd }
            );
          } catch {
          }
        }
        if (flags.externalAgent) {
          if (!flags.quiet) {
            process.stdout.write(
              `wisp-design live: external-agent \u2014 generating event waiting for active Claude session to design variants. freeText="${ev.freeText.slice(0, 60)}\u2026"
`
            );
          }
          break;
        }
        if (!flags.quiet) {
          process.stdout.write(
            `wisp-design live: designing ${variantCount} variants for "${ev.freeText.slice(0, 60)}\u2026" via claude (haiku)\u2026
`
          );
        }
        let claudeVariants;
        let claudeMeta = {};
        try {
          const { invokeClaudeForVariants: invokeClaudeForVariants2 } = await Promise.resolve().then(() => (init_claude_invoke(), claude_invoke_exports));
          const result = await invokeClaudeForVariants2(
            {
              target: { selector: ev.target.selector, tag: ev.target.tag },
              freeText: ev.freeText,
              variantCount
            },
            {}
          );
          if (result.ok) {
            claudeVariants = result.variants.map((v) => ({
              id: v.id,
              css: v.css,
              rationale: v.rationale
            }));
            claudeMeta = { costUsd: result.costUsd, durationMs: result.durationMs };
            if (!flags.quiet) {
              process.stdout.write(
                `wisp-design live: \u2713 ${claudeVariants.length} variants from claude (${result.durationMs}ms, $${result.costUsd.toFixed(4)})
`
              );
            }
          } else {
            if (!flags.quiet) {
              process.stderr.write(
                `wisp-design live: claude invocation failed (${result.reason})` + (result.detail ? ` \u2014 ${result.detail.slice(0, 200)}` : "") + `. Falling back to intent-catalog stub.
`
              );
            }
            claudeVariants = generateVariantsStub(selector, variantCount, {
              freeText: ev.freeText,
              targetTag: ev.target.tag
            });
          }
        } catch (err) {
          if (!flags.quiet) {
            process.stderr.write(
              `wisp-design live: claude-invoke threw (${err.message}). Falling back to stub.
`
            );
          }
          claudeVariants = generateVariantsStub(selector, variantCount, {
            freeText: ev.freeText,
            targetTag: ev.target.tag
          });
        }
        await postEvent2({
          bridgeUrl,
          token,
          event: {
            kind: "cycling",
            sessionId: state.sessionId,
            target: ev.target,
            variants: claudeVariants,
            activeIndex: 0
          }
        });
        await sessionLogger2.logVariantsEmitted(
          state.sessionId,
          {
            targetId,
            variants: claudeVariants.map((v) => ({
              id: v.id,
              rationale: v.rationale,
              primaryAxis: "claude-designed"
            }))
          },
          logOpts
        );
        void claudeMeta;
        break;
      }
      const variants = generateVariantsStub(selector, variantCount, {
        freeText: ev.freeText,
        targetTag: ev.target.tag
      });
      if (state.injectedFiles.length > 0) {
        const filePath = state.injectedFiles[0];
        try {
          const { wrapVariantBlock: wrapVariantBlock2 } = await Promise.resolve().then(() => (init_wrap(), wrap_exports));
          const wrapResult = await wrapVariantBlock2(
            filePath,
            { id: targetId, selector },
            state.sessionId,
            variantCount,
            { projectRoot: cwd }
          );
          if (!wrapResult.ok && !flags.quiet) {
            process.stderr.write(
              `wisp-design live: wrap-variants refused (${wrapResult.reason}) for selector "${selector.slice(0, 80)}\u2026" \u2014 accept-splice will be unavailable for this target.
`
            );
          }
        } catch (err) {
          if (!flags.quiet) {
            process.stderr.write(
              `wisp-design live: wrap-variants threw: ${err.message}
`
            );
          }
        }
      }
      await postEvent2({
        bridgeUrl,
        token,
        event: {
          kind: "cycling",
          sessionId: state.sessionId,
          target: ev.target,
          variants,
          activeIndex: 0
        }
      });
      await sessionLogger2.logVariantsEmitted(
        state.sessionId,
        {
          targetId,
          variants: variants.map((v) => ({
            id: v.id,
            rationale: v.rationale,
            primaryAxis: "typography"
          }))
        },
        logOpts
      );
      break;
    }
    case "accept": {
      const { run: gateRun } = await Promise.resolve().then(() => (init_gate(), gate_exports));
      const report = await gateRun({
        mode: flags.verifyMode,
        projectRoot: cwd,
        sessionId: state.sessionId,
        bridgeUrl,
        token
      });
      const blocked = flags.strict && report.blocked;
      if (blocked) {
        const citations = report.checks.filter((c) => c.severity === "fail").map((c) => c.name).join(", ");
        await postEvent2({
          bridgeUrl,
          token,
          event: {
            kind: "error",
            sessionId: state.sessionId,
            message: `verification-gate blocked accept: ${citations || "hard-ban rule"}`,
            code: "ACCEPT_BLOCKED"
          }
        });
        await sessionLogger2.logVerifyReport(
          state.sessionId,
          {
            verdict: "blocked",
            hardBanCount: report.hardBanCount,
            a11yFailCount: report.a11yFailCount
          },
          logOpts
        );
        break;
      }
      if (state.injectedFiles.length > 0) {
        const filePath = state.injectedFiles[0];
        try {
          let variantCss = ev.variantCss ?? "";
          if (variantCss === "") {
            const ctx = lastConfigureContext.get(ev.target.selector);
            const allVariants = generateVariantsStub(ev.target.selector, flags.maxVariants, ctx);
            const accepted = allVariants.find((v) => v.id === ev.variantId);
            variantCss = accepted?.css ?? "";
          }
          if (variantCss === "") {
            await postEvent2({
              bridgeUrl,
              token,
              event: {
                kind: "error",
                sessionId: state.sessionId,
                message: `accept: variant id "${ev.variantId}" not in stub set`,
                code: "ACCEPT_UNKNOWN_VARIANT"
              }
            });
            break;
          }
          const { acceptVariant: acceptVariant2 } = await Promise.resolve().then(() => (init_accept(), accept_exports));
          const acceptResult = await acceptVariant2(
            {
              filePath,
              sessionId: state.sessionId,
              targetId: ev.target.selector,
              variantId: ev.variantId,
              variantCss,
              paramOverrides: {},
              carbonize: true
            },
            { projectRoot: cwd }
          );
          await sessionLogger2.logAccept(
            state.sessionId,
            { variantId: ev.variantId, filePath },
            logOpts
          );
          void acceptResult;
        } catch (err) {
          await postEvent2({
            bridgeUrl,
            token,
            event: {
              kind: "error",
              sessionId: state.sessionId,
              message: `accept-splice failed: ${err.message}`,
              code: "ACCEPT_SPLICE_FAILED"
            }
          });
        }
      }
      await sessionLogger2.logVerifyReport(
        state.sessionId,
        {
          verdict: report.blocked ? "warn" : "pass",
          hardBanCount: report.hardBanCount,
          a11yFailCount: report.a11yFailCount
        },
        logOpts
      );
      await postEvent2({
        bridgeUrl,
        token,
        event: {
          kind: "cycling",
          sessionId: state.sessionId,
          target: ev.target,
          variants: [{ id: ev.variantId, css: "", rationale: "accepted" }],
          activeIndex: 0
        }
      });
      break;
    }
    case "discard": {
      if (state.injectedFiles.length > 0) {
        const filePath = state.injectedFiles[0];
        try {
          const { discardVariantBlock: discardVariantBlock2 } = await Promise.resolve().then(() => (init_wrap(), wrap_exports));
          await discardVariantBlock2(
            filePath,
            state.sessionId,
            ev.target.selector,
            { projectRoot: cwd }
          );
        } catch {
        }
      }
      await sessionLogger2.log(
        {
          ts: (/* @__PURE__ */ new Date()).toISOString(),
          sessionId: state.sessionId,
          kind: "configure",
          // nearest available kind for a discard note
          detail: { targetId: ev.target.selector, freeText: "discard" }
        },
        logOpts
      );
      break;
    }
    case "annotation": {
      await sessionLogger2.logAnnotationAdded(
        state.sessionId,
        {
          targetId: ev.target.selector,
          annotationKind: ev.annotation.kind,
          note: ev.annotation.note
        },
        logOpts
      );
      break;
    }
    // All other kinds (pick, cycling, parameter-change, generating, heartbeat, error) → ignore.
    default:
      break;
  }
}
async function runLive(args) {
  if (args.includes("--help") || args.includes("-h")) {
    process.stdout.write(LIVE_HELP_TEXT);
    return EXIT_OK;
  }
  const parsed = mapFlags(args);
  if (!parsed.ok) {
    writeError({ code: "BAD_FLAG", message: parsed.message });
    return EXIT_ARG;
  }
  const flags = parsed.flags;
  let lockPath = resolve8(process.cwd(), DEFAULT_LOCK_PATH);
  let handle;
  try {
    handle = await startBridgeServer({
      projectRoot: process.cwd(),
      ...flags.port !== void 0 ? { preferredPort: flags.port } : {},
      onBeforeStop: async () => {
        await safeReleaseLock(lockPath);
      }
    });
  } catch (err) {
    writeError({
      code: "BRIDGE_BOOT_FAILED",
      message: err.message
    });
    return EXIT_IO;
  }
  try {
    await writeLockfile(lockPath, {
      port: handle.port,
      token: handle.token,
      pid: process.pid,
      startedAt: (/* @__PURE__ */ new Date()).toISOString(),
      projectRoot: process.cwd()
    });
  } catch (err) {
    await safeStop(handle);
    writeError({
      code: "PORT_LOCK_WRITE_FAILED",
      message: err.message
    });
    return EXIT_IO;
  }
  const state = {
    sessionId: handle.sessionId,
    bridge: { port: handle.port, token: handle.token },
    ...flags.target !== void 0 ? { target: flags.target } : {},
    injectedFiles: [],
    started: (/* @__PURE__ */ new Date()).toISOString()
  };
  if (flags.inject !== void 0) {
    const bridgeUrl2 = `http://127.0.0.1:${handle.port}`;
    try {
      const { injectLiveScript: injectLiveScript2 } = await Promise.resolve().then(() => (init_inject(), inject_exports));
      await injectLiveScript2(
        flags.inject,
        { bridgeUrl: bridgeUrl2, token: handle.token, inline: false, preferredAnchor: "auto" },
        { projectRoot: process.cwd(), sessionId: handle.sessionId }
      );
      state.injectedFiles.push(flags.inject);
    } catch (err) {
      if (!flags.quiet) {
        process.stderr.write(
          `wisp-design live: inject failed (${err.message}) \u2014 add the script tag manually:
  <script src="${bridgeUrl2}/live.js?token=${handle.token}"></script>
`
        );
      }
    }
  } else if (!flags.quiet) {
    process.stdout.write(
      [
        `wisp-design live: bridge listening on 127.0.0.1:${handle.port}`,
        `session: ${handle.sessionId}`,
        ``,
        `Add this to your dev-server HTML <head>:`,
        `  <script src="http://127.0.0.1:${handle.port}/live.js?token=${handle.token}"></script>`,
        ``
      ].join("\n")
    );
  }
  try {
    const { discoverInjectedFiles: discoverInjectedFiles2 } = await Promise.resolve().then(() => (init_inject(), inject_exports));
    const discovered = await discoverInjectedFiles2({ projectRoot: process.cwd() });
    for (const filePath of discovered) {
      if (!state.injectedFiles.includes(filePath)) {
        state.injectedFiles.push(filePath);
      }
    }
    if (discovered.length > 0) {
      const { refreshInjectToken: refreshInjectToken2 } = await Promise.resolve().then(() => (init_inject(), inject_exports));
      for (const filePath of discovered) {
        try {
          await refreshInjectToken2(
            filePath,
            { bridgeUrl: `http://127.0.0.1:${handle.port}`, token: handle.token },
            { projectRoot: process.cwd() }
          );
        } catch {
        }
      }
    }
    if (discovered.length > 0) {
      const { cleanupStaleWraps: cleanupStaleWraps2 } = await Promise.resolve().then(() => (init_wrap(), wrap_exports));
      for (const filePath of discovered) {
        try {
          const cleaned = await cleanupStaleWraps2(filePath, {
            projectRoot: process.cwd()
          });
          if (cleaned > 0 && !flags.quiet) {
            process.stderr.write(
              `wisp-design live: cleaned ${cleaned} stale wrap-variants block(s) in ${filePath}
`
            );
          }
        } catch {
        }
      }
    }
  } catch {
  }
  const { sessionLogger: sessionLogger2 } = await Promise.resolve().then(() => (init_logger(), logger_exports));
  await sessionLogger2.start(state.sessionId, {
    projectRoot: process.cwd(),
    meta: {
      bridgePort: state.bridge.port,
      target: state.target ?? null,
      injectedFiles: state.injectedFiles,
      verifyMode: flags.verifyMode,
      strict: flags.strict,
      maxVariants: flags.maxVariants
    }
  });
  let terminated = false;
  const cwd = process.cwd();
  const shutdown = async (signal) => {
    if (terminated) return;
    terminated = true;
    try {
      await sessionLogger2.end(state.sessionId, { projectRoot: cwd });
    } catch {
    }
    for (const filePath of state.injectedFiles) {
      try {
        const { removeLiveScript: removeLiveScript2 } = await Promise.resolve().then(() => (init_inject(), inject_exports));
        await removeLiveScript2(filePath, { projectRoot: cwd, sessionId: state.sessionId });
      } catch (err) {
        if (!flags.quiet) {
          process.stderr.write(
            `wisp-design live: could not remove script from ${filePath}: ${err.message}
`
          );
        }
      }
    }
    await safeStop(handle);
    await safeReleaseLock(lockPath);
    if (!flags.quiet) {
      process.stdout.write(`wisp-design live: stopped (${signal}).
`);
    }
  };
  process.on("SIGINT", () => {
    void shutdown("SIGINT").then(() => process.exit(EXIT_OK));
  });
  process.on("SIGTERM", () => {
    void shutdown("SIGTERM").then(() => process.exit(EXIT_OK));
  });
  if (flags.quiet) {
    writeJsonResult({
      sessionId: state.sessionId,
      port: handle.port,
      token: handle.token,
      bridgeUrl: `http://127.0.0.1:${handle.port}`,
      injectedFiles: state.injectedFiles
    });
  }
  const bridgeUrl = `http://127.0.0.1:${handle.port}`;
  const { pollOnce: pollOnce2 } = await Promise.resolve().then(() => (init_poll_loop(), poll_loop_exports));
  let cursor = void 0;
  while (!terminated) {
    let result;
    try {
      result = await pollOnce2({
        bridgeUrl,
        token: handle.token,
        timeoutMs: 27e4,
        leaseMs: 3e4,
        cursor,
        transport: "long-poll"
      });
    } catch {
      if (terminated) break;
      await new Promise((r) => setTimeout(r, 500));
      continue;
    }
    for (const ev of result.events) {
      if (terminated) break;
      try {
        await dispatchEvent(ev, state, flags, cwd);
      } catch {
      }
    }
    cursor = result.cursor;
  }
  return EXIT_OK;
}
async function safeStop(handle) {
  try {
    await handle.stop(500);
  } catch {
  }
}
async function safeReleaseLock(lockPath) {
  try {
    await releaseLockfile(lockPath);
  } catch {
  }
}
export {
  dispatchEvent,
  generateVariantsStub,
  runLive
};
//# sourceMappingURL=live.js.map