// wisp-design — Source-edit-engine contracts (Phase 3).
//
// Pure-TS shared type surface for the Phase-3 modules that read, mutate, and
// write actual project source files: inject script-tag, wrap variant blocks,
// accept a chosen variant (splice + carbonize), discard, refuse-list, and
// append to the per-session undo log.
//
// No runtime side effects. No `fs` or `path` imports — those live in the
// implementations. This file owns: zod schemas, derived TS types, module
// interfaces, REGEXP-only constants, and the canonical marker-syntax table.
//
// Three invariants downstream code MUST respect:
//   1. Marker syntax is per-file-type (see `MARKER_SYNTAX`). JSX files MUST
//      use `{/* … */}` expression comments; HTML-family files use `<!-- … -->`;
//      CSS uses `/* … */`. Never mix.
//   2. EOL convention is detected once per read and preserved on write. The
//      engine canonicalises to `\n` internally; writers re-apply the detected
//      convention. Mixed line-endings inside a single file are allowed by the
//      reader but the splice region always emits the file's dominant EOL.
//   3. `safetyCheck` is the first call on every accept/discard/inject path;
//      no other module trusts its filePath argument. This mirrors `guardPath`
//      in `bridge/auth.ts` — defense in depth, no shortcuts.

import { z } from "zod";

// ---------------------------------------------------------------------------
// Supported file types
// ---------------------------------------------------------------------------

export const SourceFileTypeSchema = z.enum([
  "tsx",
  "jsx",
  "html",
  "vue",
  "svelte",
  "css",
]);
export type SourceFileType = z.infer<typeof SourceFileTypeSchema>;

// Extension → file type. `safetyCheck` resolves the file type via this table
// before anything else looks at the content; `.vue` and `.svelte` always
// pick the HTML-comment marker convention because the marker lives in the
// `<template>` block, never inside the `<script>` block.
export const SUPPORTED_EXTENSIONS: Readonly<Record<string, SourceFileType>> = {
  ".tsx": "tsx",
  ".jsx": "jsx",
  ".html": "html",
  ".htm": "html",
  ".vue": "vue",
  ".svelte": "svelte",
  ".css": "css",
} as const;

// ---------------------------------------------------------------------------
// EOL detection
// ---------------------------------------------------------------------------

export type EolConvention = "\n" | "\r\n" | "\r";

// First newline run in the buffer wins. Files with no newline default to `\n`.
// Coder implements; this signature is the contract.
export type DetectEol = (content: string) => EolConvention;
export declare function detectEol(content: string): EolConvention;

// ---------------------------------------------------------------------------
// Marker syntax — the central architecture decision of Phase 3.
//
// Every wisp marker is a single comment line of the shape:
//   wisp-<kind>:<key>=<val> <key2>=<val2> …
//
// `<kind>` is one of `inject-start`, `inject-end`, `variants-start`,
// `variants-end`, `style-start`, `style-end` (see `MarkerKindSchema`).
//
// Values are URL-encoded when they contain whitespace, `=`, or `"`. Parsers
// must `decodeURIComponent` each value. Booleans use `true`/`false`. Numbers
// are decimal strings. Multiline payloads (e.g. base64 originalLines on a
// variant-block marker) are split onto the next line as a follow-up comment;
// see `VariantBlockMarkerSchema` + the algorithm spec in
// `docs/source-edit-engine.md` § findMarkerBlock.
// ---------------------------------------------------------------------------

export const MarkerKindSchema = z.enum([
  "inject-start",
  "inject-end",
  "variants-start",
  "variants-end",
  "style-start",
  "style-end",
]);
export type MarkerKind = z.infer<typeof MarkerKindSchema>;

// Aggregated "group" for findMarkerBlock filtering — caller wants ALL inject,
// ALL variants, or ALL style markers, not the individual open/close.
export const MarkerGroupSchema = z.enum(["inject", "variants", "style"]);
export type MarkerGroup = z.infer<typeof MarkerGroupSchema>;

export interface MarkerSyntax {
  // Wrap a payload string in the file-type-appropriate comment delimiter.
  // The payload is the full marker body (e.g. `wisp-inject-start:injectId=…`).
  open: (payload: string) => string;
  close: (payload: string) => string;
  // Anchored regex matching one marker line. MUST capture the marker body
  // (everything after `wisp-` up to the closing delimiter) in group 1 so the
  // parser can split key=val pairs without re-running the regex per pair.
  pattern: RegExp;
}

// Patterns are anchored to start-of-line (multiline mode applied by callers).
// All use the colon after the kind name to disambiguate from arbitrary
// "wisp" mentions in user code; key=val pairs are space-separated.
//
// JSX:    {/* wisp-<kind>:k=v k2=v2 */}
// HTML/Vue/Svelte: <!-- wisp-<kind>:k=v k2=v2 -->
// CSS:    /* wisp-<kind>:k=v k2=v2 */
export const MARKER_SYNTAX: Readonly<Record<SourceFileType, MarkerSyntax>> = {
  tsx: {
    open: (p) => `{/* ${p} */}`,
    close: (p) => `{/* ${p} */}`,
    pattern: /\{\/\*\s*(wisp-[a-z-]+:[^*]*?)\*\/\}/,
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
    pattern: /\{\/\*\s*(wisp-[a-z-]+:[\s\S]*?)\*\/\}/,
  },
  html: {
    open: (p) => `<!-- ${p} -->`,
    close: (p) => `<!-- ${p} -->`,
    pattern: /<!--\s*(wisp-[a-z-]+:[\s\S]*?)-->/,
  },
  vue: {
    open: (p) => `<!-- ${p} -->`,
    close: (p) => `<!-- ${p} -->`,
    pattern: /<!--\s*(wisp-[a-z-]+:[\s\S]*?)-->/,
  },
  svelte: {
    open: (p) => `<!-- ${p} -->`,
    close: (p) => `<!-- ${p} -->`,
    pattern: /<!--\s*(wisp-[a-z-]+:[\s\S]*?)-->/,
  },
  css: {
    open: (p) => `/* ${p} */`,
    close: (p) => `/* ${p} */`,
    pattern: /\/\*\s*(wisp-[a-z-]+:[\s\S]*?)\*\//,
  },
} as const;

// ---------------------------------------------------------------------------
// Marker payloads — strict shape per kind.
// ---------------------------------------------------------------------------

// `inject-start` / `inject-end` carry the injection's identity + bridge wiring
// so that `removeLiveScript` can verify it's removing its own injection (not
// a hand-edited or stale one) before rewriting bytes.
export const InjectMarkerSchema = z.object({
  injectId: z.string().min(1), // ULID or UUID
  insertedAt: z.string(), // ISO timestamp
  bridgeUrl: z.string().url(),
  token: z.string().uuid(),
  // SHA256 hex of the original first 256 bytes of the file (before inject).
  // `removeLiveScript` recomputes the hash AFTER stripping the inject and
  // refuses if it doesn't match — protects against partial edits.
  beforeHash: z.string().regex(/^[0-9a-f]{64}$/i),
  scriptSrc: z.string().url().optional(),
  inline: z.boolean().default(false),
});
export type InjectMarker = z.infer<typeof InjectMarkerSchema>;

// `variants-start` / `variants-end` mark the wrap. `originalLines` is the
// base64 of the original snippet that was wrapped — discard reads it back
// when restoring the pre-wrap state byte-for-byte.
export const VariantBlockMarkerSchema = z.object({
  sessionId: z.string().min(1),
  targetId: z.string().min(1),
  wrappedAt: z.string(), // ISO
  variantCount: z.number().int().min(1).max(8),
  originalLines: z.string(), // base64 of the wrapped original snippet
});
export type VariantBlockMarker = z.infer<typeof VariantBlockMarkerSchema>;

// `style-start` / `style-end` bracket an embedded `<style data-wisp-css>`
// block. Needed because JSX has no direct-nested HTML — we emit the style
// block as a string child via `{`<style>…</style>`}` and need bracketing
// markers to find + carbonize it.
export const StyleBlockMarkerSchema = z.object({
  sessionId: z.string().min(1),
  targetId: z.string().min(1),
  // `@scope` selector base (without the `[data-wisp-variant="N"]` index).
  // Lets carbonize rewrite scope rules into permanent selectors targeting
  // the accepted variant's host.
  scopeBase: z.string().min(1),
});
export type StyleBlockMarker = z.infer<typeof StyleBlockMarkerSchema>;

// ---------------------------------------------------------------------------
// MarkerBlock — return shape of `findMarkerBlock`.
// Both offset-based (for splicing) and line-based (for diagnostics) ranges.
// `endOffset` is EXCLUSIVE; `endLine` is INCLUSIVE.
// ---------------------------------------------------------------------------

export const MarkerBlockSchema = z.object({
  startLine: z.number().int().min(0),
  endLine: z.number().int().min(0),
  startOffset: z.number().int().min(0),
  endOffset: z.number().int().min(0),
  group: MarkerGroupSchema,
  // Parsed `k=v` pairs from the OPEN marker. Decoded via `decodeURIComponent`.
  payload: z.record(z.string(), z.string()),
});
export type MarkerBlock = z.infer<typeof MarkerBlockSchema>;

export interface MarkerBlockFilter {
  sessionId?: string;
  targetId?: string;
}

// ---------------------------------------------------------------------------
// Inject / Wrap / Accept / Discard operations.
// ---------------------------------------------------------------------------

export const InjectOptionsSchema = z.object({
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
  preferredAnchor: z
    .enum(["before-head-close", "after-head-open", "auto"])
    .default("auto"),
  // Optional caller-supplied injectId; useful for tests that need determinism.
  injectId: z.string().min(1).optional(),
});
export type InjectOptions = z.infer<typeof InjectOptionsSchema>;

export interface InjectResult {
  injectId: string;
  startLine: number;
  endLine: number;
  // SHA256 of the file BEFORE the inject (so removal can verify).
  beforeHash: string;
  afterHash: string;
}

export interface RemoveResult {
  removed: true;
  injectId: string;
  // Byte-equivalent restore proof: hash of file after removal matches
  // `beforeHash` from the inject marker.
  restoredByteEquivalent: boolean;
}

export interface WrapResult {
  sessionId: string;
  targetId: string;
  variantsStartLine: number;
  variantsEndLine: number;
  styleStartLine: number;
  styleEndLine: number;
  // Base64-encoded original snippet that was wrapped. Mirror of the value
  // persisted in the variant-block marker — coder may use it to assert
  // byte-equivalence on `discardVariantBlock`.
  originalBase64: string;
}

export interface DiscardResult {
  discarded: true;
  sessionId: string;
  targetId: string;
  restoredByteEquivalent: boolean;
}

export const AcceptOperationSchema = z.object({
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
  eolConvention: z.enum(["\n", "\r\n", "\r"]).optional(),
});
export type AcceptOperation = z.infer<typeof AcceptOperationSchema>;

export interface AcceptResult {
  filePath: string;
  variantId: string;
  // Line range that was replaced (inclusive).
  replacedStartLine: number;
  replacedEndLine: number;
  beforeHash: string;
  afterHash: string;
  // The final CSS text that was spliced in (post-carbonize, post-bake).
  emittedCss: string;
}

export const DiscardOperationSchema = z.object({
  filePath: z.string().min(1),
  sessionId: z.string().min(1),
  targetId: z.string().min(1),
});
export type DiscardOperation = z.infer<typeof DiscardOperationSchema>;

// ---------------------------------------------------------------------------
// Safety
// ---------------------------------------------------------------------------

export const SafetyErrorCodeSchema = z.enum([
  "PATH_OUTSIDE_ROOT",
  "REFUSE_LIST_MATCH", // dist/, .next/, node_modules/, etc.
  "GENERATED_MAGIC_COMMENT", // `@generated` in first 200 bytes
  "BINARY_FILE", // not utf-8 decodable
  "FILE_TOO_LARGE", // > MAX_SOURCE_FILE_BYTES
  "UNSUPPORTED_FILE_TYPE", // extension not in SUPPORTED_EXTENSIONS
  "READ_ONLY_FILE", // fs.access W_OK rejected
  "SYMLINK_ESCAPE", // realpath resolves outside projectRoot
]);
export type SafetyErrorCode = z.infer<typeof SafetyErrorCodeSchema>;

export interface SafetyError {
  code: SafetyErrorCode;
  message: string;
  // What the caller (agent loop) should try next:
  //   "agent-driven" — hand off freeText + context to the LLM and let it use
  //                    the native Edit tool instead of `fs.writeFileSync`.
  //   "manual"       — surface a notice to the human; no automated fallback.
  //   "skip"         — silently no-op (e.g. accept against a refused file
  //                    becomes a discard).
  suggestedFallback?: "agent-driven" | "manual" | "skip";
  detail?: Record<string, unknown>;
}

export interface SafetyOk {
  ok: true;
  filePath: string;
  fileType: SourceFileType;
  eolConvention: EolConvention;
}

export type SafetyResult = SafetyOk | { ok: false; error: SafetyError };

// ---------------------------------------------------------------------------
// Undo stack — JSONL append-only at `.wisp/sessions/<sessionId>.jsonl`.
// ---------------------------------------------------------------------------

export const UndoEntryKindSchema = z.enum([
  "inject-script",
  "remove-script",
  "wrap-variants",
  "discard-variants",
  "accept-variant",
  "param-change",
  "safety-refused",
]);
export type UndoEntryKind = z.infer<typeof UndoEntryKindSchema>;

export const UndoEntrySchema = z.object({
  ts: z.string(), // ISO timestamp
  sessionId: z.string().min(1),
  kind: UndoEntryKindSchema,
  filePath: z.string().min(1),
  detail: z.record(z.string(), z.unknown()).optional(),
  // Hex SHA256 of the file before / after the operation. `safety-refused`
  // entries omit both. `param-change` omits `afterHash` (the param change is
  // a runtime DOM update; no file mutation has happened yet).
  beforeSha256: z
    .string()
    .regex(/^[0-9a-f]{64}$/i)
    .optional(),
  afterSha256: z
    .string()
    .regex(/^[0-9a-f]{64}$/i)
    .optional(),
});
export type UndoEntry = z.infer<typeof UndoEntrySchema>;

// ---------------------------------------------------------------------------
// Module interfaces — what coder implements in src/source/*.ts.
// ---------------------------------------------------------------------------

export interface InjectModule {
  injectLiveScript(
    filePath: string,
    opts: InjectOptions,
  ): Promise<InjectResult>;
  removeLiveScript(filePath: string): Promise<RemoveResult>;
}

export interface WrapModule {
  wrapVariantBlock(
    filePath: string,
    target: { id: string; selector: string },
    sessionId: string,
    variantCount: number,
  ): Promise<WrapResult>;

  discardVariantBlock(
    filePath: string,
    sessionId: string,
    targetId: string,
  ): Promise<DiscardResult>;
}

export interface AcceptModule {
  acceptVariant(op: AcceptOperation): Promise<AcceptResult>;

  // Pure parsers — easy to test and reusable by Phase 5 verification-gate.
  findMarkerBlock(
    content: string,
    fileType: SourceFileType,
    group: MarkerGroup,
    filter?: MarkerBlockFilter,
  ): MarkerBlock | null;

  extractVariant(
    content: string,
    block: MarkerBlock,
    variantId: string,
  ): { css: string; cssVars: Record<string, string> } | null;

  expandReplaceRange(
    content: string,
    block: MarkerBlock,
    replacement: string,
    eolConvention: EolConvention,
  ): string;
}

export interface CarbonizeOptions {
  paramOverrides: Record<string, string>;
  // Selector to anchor the carbonized rules on. Typically the accepted
  // variant's host (e.g. `[data-wisp-target="<id>"]` or the target's own
  // stable selector). The `@scope` rule's `:scope { … }` becomes
  // `<scopeSelector> { … }`; child selectors are prefixed accordingly.
  scopeSelector: string;
}

export interface CarbonizeModule {
  // Pure: CSS-in, CSS-out. No fs. Used by AcceptModule.
  carbonize(
    css: string,
    opts: { paramOverrides: Record<string, string>; scopeSelector: string },
  ): string;
}

export interface SafetyModule {
  safetyCheck(filePath: string, projectRoot: string): Promise<SafetyResult>;
}

export interface UndoStackModule {
  append(entry: UndoEntry): Promise<void>;
  read(sessionId: string): Promise<UndoEntry[]>;
  // Rotates `<sessionId>.jsonl` to `<sessionId>.<n>.jsonl` once `maxBytes` is
  // exceeded. Default cap = `MAX_UNDO_LOG_BYTES`.
  rotateIfTooLarge(sessionId: string, maxBytes: number): Promise<void>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const WISP_INJECT_SCRIPT_ID = "wisp-design-live";
export const WISP_INJECT_DATA_ATTRIBUTE = "data-wisp-inject";

export const MAX_SOURCE_FILE_BYTES = 1_048_576; // 1 MB
export const MAX_UNDO_LOG_BYTES = 10_485_760; // 10 MB

// Case-insensitive scan of the first 200 bytes for `@generated`. Catches the
// pragmas used by codegen tools (graphql-codegen, prettier-via-formatter,
// auto-generated proto clients, …). Anchored to the start of the file so
// arbitrary `@generated` mentions deeper in user prose don't trigger.
export const GENERATED_MAGIC_COMMENT_REGEX = /^[\s\S]{0,200}@generated/i;

// Refuse-list — match against the ABSOLUTE resolved path on either separator.
// Implementations should test each regex against the resolved path; the
// first match wins. Rationale lives in docs/source-edit-engine.md § refuse-list.
export const REFUSE_LIST: readonly RegExp[] = [
  // Build / dependency / generated output directories.
  /[\/\\](node_modules|dist|build|out|\.next|\.nuxt|\.svelte-kit|coverage|__generated__|target)[\/\\]/,
  // `.generated.<ext>` basename — auto-generated single files.
  /\.generated\.[a-z]+$/i,
  // `.git` internals.
  /[\/\\]\.git[\/\\]/,
] as const;

// Comment-syntax delimiters by file type — convenience export for tests that
// want to assemble custom payloads without re-deriving the rules from
// `MARKER_SYNTAX`.
export const COMMENT_DELIMITERS: Readonly<
  Record<SourceFileType, { open: string; close: string }>
> = {
  tsx: { open: "{/* ", close: " */}" },
  jsx: { open: "{/* ", close: " */}" },
  html: { open: "<!-- ", close: " -->" },
  vue: { open: "<!-- ", close: " -->" },
  svelte: { open: "<!-- ", close: " -->" },
  css: { open: "/* ", close: " */" },
} as const;

// ---------------------------------------------------------------------------
// Marker body helpers — small typed builders the engine uses to emit markers
// the regex in `MARKER_SYNTAX` will round-trip. Signatures only; coder owns
// the implementation in `src/source/wrap.ts` and `src/source/inject.ts`.
// ---------------------------------------------------------------------------

export type SerializeMarkerBody = (
  kind: MarkerKind,
  payload: Record<string, string | number | boolean>,
) => string;

export type ParseMarkerBody = (
  body: string,
) =>
  | { kind: MarkerKind; payload: Record<string, string> }
  | { kind: null; payload: Record<string, string>; raw: string };

export declare const serializeMarkerBody: SerializeMarkerBody;
export declare const parseMarkerBody: ParseMarkerBody;
