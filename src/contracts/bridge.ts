// wisp-design — Bridge contracts (Phase 1).
//
// Pure-TS shared type surface for the local HTTP+SSE bridge between:
//   browser (live.js)  ←→  bridge server (Node HTTP)  ←→  agent (long-poll)
//
// No runtime side effects. No I/O. Only zod schemas, derived TS types,
// and module interfaces that the bridge/auth/source layers must implement.
// Coder + security pick this up to build src/bridge/* without negotiating
// shapes ad-hoc.
//
// Two invariants encoded here that downstream code MUST respect:
//   1. LONG_POLL_CAP_MS = 270_000 (Node fetch headers cap is 300s — never exceed).
//   2. Every browser→bridge event carries `sessionId` so SSE fanout (Phase 6
//      multi-cursor) stays addressable without a schema change.

import { z } from "zod";

// ---------------------------------------------------------------------------
// Auth — interface only. security/src/bridge/auth.ts implements.
// ---------------------------------------------------------------------------

export interface AuthContext {
  token: string;
  sessionId: string;
}

export type AuthErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "PATH_TRAVERSAL"
  | "MALFORMED_TOKEN";

export interface AuthError {
  code: AuthErrorCode;
  message: string;
  detail?: unknown;
}

export type AuthResult<T> = { ok: true } & T | { ok: false; error: AuthError };

export interface AuthModule {
  // Generates a fresh per-session UUIDv4 token. Stable for the lifetime
  // of the bridge process; rotated only on `wisp-design live` restart.
  generateToken(): string;

  // Constant-time compare of `provided` against `expected`. `provided` may
  // be undefined (header missing) — implementations MUST handle that without
  // throwing and return { ok:false, code:"UNAUTHORIZED" }.
  validateToken(
    provided: string | undefined,
    expected: string,
  ): { ok: true } | { ok: false; error: AuthError };

  // Resolves `requestedPath` against `projectRoot`. Refuses any path that
  // escapes the root via `..`, absolute paths outside root, or symlink
  // traversal. Returns the resolved absolute path on success.
  guardPath(
    requestedPath: string,
    projectRoot: string,
  ): { ok: true; resolved: string } | { ok: false; error: AuthError };
}

// ---------------------------------------------------------------------------
// Port lockfile — `.wisp/live/port.lock` (JSON).
// Written on bridge boot; consumed by `wisp-design status` + injected live.js.
// ---------------------------------------------------------------------------

export const PortLockSchema = z.object({
  port: z.number().int().min(31337).max(31400),
  token: z.string().uuid(),
  pid: z.number().int().positive(),
  startedAt: z.string().datetime(),
  projectRoot: z.string().min(1),
});

export type PortLock = z.infer<typeof PortLockSchema>;

// ---------------------------------------------------------------------------
// Element targeting — shared across all event kinds that reference DOM.
// ---------------------------------------------------------------------------

export const ElementRectSchema = z.object({
  x: z.number(),
  y: z.number(),
  w: z.number().nonnegative(),
  h: z.number().nonnegative(),
});
export type ElementRect = z.infer<typeof ElementRectSchema>;

export const ElementTargetSchema = z.object({
  selector: z.string().min(1),
  rect: ElementRectSchema,
  tag: z.string().min(1),
});
export type ElementTarget = z.infer<typeof ElementTargetSchema>;

// ---------------------------------------------------------------------------
// Bridge events — discriminated union on `kind`.
// Browser → bridge → agent (via long-poll) and agent → browser (via SSE) use
// the same shape; direction is implicit in which endpoint carries the event.
// ---------------------------------------------------------------------------

const sessionId = z.string().min(1);

export const AnnotationKindSchema = z.enum([
  "padding",
  "color",
  "size",
  "content",
  "other",
]);
export type AnnotationKind = z.infer<typeof AnnotationKindSchema>;

export const StructuredAnnotationSchema = z.object({
  kind: AnnotationKindSchema,
  note: z.string().min(1).max(2000),
});
export type StructuredAnnotation = z.infer<typeof StructuredAnnotationSchema>;

export const VariantSchema = z.object({
  id: z.string().min(1),
  css: z.string(),
  rationale: z.string().min(1).max(280),
  // Phase 7.18 — optional replacement markup for 1:1 reference fidelity.
  // Rendered (sanitised) INSTEAD of the cloned target inside the variant
  // host; `css` still applies via @scope. Pure-CSS variants omit it.
  html: z.string().min(1).max(30000).optional(),
});
export type Variant = z.infer<typeof VariantSchema>;

export const PickEventSchema = z.object({
  kind: z.literal("pick"),
  target: ElementTargetSchema,
  sessionId,
});

export const ConfigureEventSchema = z.object({
  kind: z.literal("configure"),
  target: ElementTargetSchema,
  freeText: z.string().min(1).max(4000),
  sessionId,
});

export const GeneratingEventSchema = z.object({
  kind: z.literal("generating"),
  target: ElementTargetSchema,
  // Phase 7.17 — may be empty when `codeSnippet` carries the whole intent
  // (snippet-only generate). The UI enforces text-or-snippet; a zod .refine
  // is not possible here (discriminatedUnion requires plain ZodObject).
  freeText: z.string().max(4000),
  // Phase 7.17 — pasted design-reference code from the snippet popup. The
  // agent ports it to the project's stack; it never reaches the DOM raw.
  codeSnippet: z.string().min(1).max(20000).optional(),
  variantCount: z.number().int().min(1).max(8),
  // Phase 7.15 — deviation tells the agent how far variants should drift
  // from the original design. 1 = subtle (typography weight, light spacing
  // tweaks), 3 = balanced (mix of axes, the previous default behavior),
  // 5 = radical (reimagined layout/structure/color, may break conventions).
  // Optional so older clients / scripted POSTs keep working at the default.
  deviation: z.number().int().min(1).max(5).optional(),
  sessionId,
});

export const CyclingEventSchema = z.object({
  kind: z.literal("cycling"),
  target: ElementTargetSchema,
  variants: z.array(VariantSchema).min(1).max(8),
  activeIndex: z.number().int().nonnegative(),
  sessionId,
});

export const ParameterChangeEventSchema = z.object({
  kind: z.literal("parameter-change"),
  target: ElementTargetSchema,
  varName: z.string().min(1),
  value: z.string(),
  sessionId,
});

export const AcceptEventSchema = z.object({
  kind: z.literal("accept"),
  target: ElementTargetSchema,
  variantId: z.string().min(1),
  sessionId,
  // Phase 7.8 — Browser includes the accepted variant's CSS so the in-process
  // accept handler can splice it into source without regenerating from a stub.
  // Optional for back-compat: older browsers / tests omit this and the handler
  // falls back to stub regeneration.
  variantCss: z.string().optional(),
  rationale: z.string().optional(),
  // Phase 7.18 — replacement markup of an accepted html variant.
  variantHtml: z.string().optional(),
});

export const DiscardEventSchema = z.object({
  kind: z.literal("discard"),
  target: ElementTargetSchema,
  sessionId,
});

export const AnnotationEventSchema = z.object({
  kind: z.literal("annotation"),
  target: ElementTargetSchema,
  annotation: StructuredAnnotationSchema,
  sessionId,
});

export const ErrorEventSchema = z.object({
  kind: z.literal("error"),
  message: z.string().min(1),
  code: z.string().optional(),
  sessionId: sessionId.optional(),
});

export const HeartbeatEventSchema = z.object({
  kind: z.literal("heartbeat"),
  at: z.string().datetime(),
});

export const BridgeEventSchema = z.discriminatedUnion("kind", [
  PickEventSchema,
  ConfigureEventSchema,
  GeneratingEventSchema,
  CyclingEventSchema,
  ParameterChangeEventSchema,
  AcceptEventSchema,
  DiscardEventSchema,
  AnnotationEventSchema,
  ErrorEventSchema,
  HeartbeatEventSchema,
]);
export type BridgeEvent = z.infer<typeof BridgeEventSchema>;

export type BridgeEventKind = BridgeEvent["kind"];

// Convenience narrow-by-kind helper type. Coder can use it to type listeners.
export type BridgeEventOf<K extends BridgeEventKind> = Extract<
  BridgeEvent,
  { kind: K }
>;

// ---------------------------------------------------------------------------
// Long-Poll — agent ← bridge. Sliced at 270s because Node fetch caps headers
// timeout at 300s; staying under that lets the agent loop retry cleanly
// without each retry counting as a transport-level failure.
// ---------------------------------------------------------------------------

export const LONG_POLL_CAP_MS = 270_000;
export const LONG_POLL_DEFAULT_LEASE_MS = 30_000;
export const LONG_POLL_MIN_TIMEOUT_MS = 1_000;

export const LongPollRequestSchema = z
  .object({
    token: z.string().uuid(),
    timeout: z
      .number()
      .int()
      .min(LONG_POLL_MIN_TIMEOUT_MS)
      .optional(),
    leaseMs: z.number().int().min(1_000).optional(),
    cursor: z.string().optional(),
  })
  .refine(
    (v) => v.timeout === undefined || v.timeout <= LONG_POLL_CAP_MS,
    {
      message: `timeout must be <= ${LONG_POLL_CAP_MS}ms (Node fetch header cap is 300_000ms)`,
      path: ["timeout"],
    },
  );
export type LongPollRequest = z.infer<typeof LongPollRequestSchema>;

export const LongPollResponseSchema = z.object({
  events: z.array(BridgeEventSchema),
  cursor: z.string(),
  // Server-wall-clock at which it sliced the response. Lets the agent measure
  // drift against its own local clock when budgeting the next slice.
  slicedAt: z.number().int().nonnegative(),
});
export type LongPollResponse = z.infer<typeof LongPollResponseSchema>;

// ---------------------------------------------------------------------------
// HTTP error envelope. Every non-2xx response serializes this shape so the
// browser runtime + agent loop share one error path.
// ---------------------------------------------------------------------------

export const BridgeHttpErrorSchema = z.object({
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
    detail: z.unknown().optional(),
  }),
});
export type BridgeHttpError = z.infer<typeof BridgeHttpErrorSchema>;

// ---------------------------------------------------------------------------
// Bridge status — `GET /status` response shape.
// ---------------------------------------------------------------------------

export const BridgeStatusSchema = z.object({
  port: z.number().int().positive(),
  startedAt: z.string().datetime(),
  uptimeMs: z.number().int().nonnegative(),
  sessionId: z.string().min(1),
  pendingEvents: z.number().int().nonnegative(),
  connectedSseClients: z.number().int().nonnegative(),
  projectRoot: z.string().min(1),
});
export type BridgeStatus = z.infer<typeof BridgeStatusSchema>;

// ---------------------------------------------------------------------------
// Health — `GET /health`, unauthenticated liveness probe.
// ---------------------------------------------------------------------------

export const BridgeHealthSchema = z.object({
  ok: z.literal(true),
  version: z.string().min(1),
});
export type BridgeHealth = z.infer<typeof BridgeHealthSchema>;

// ---------------------------------------------------------------------------
// Per-endpoint request/response type map.
// No runtime artifact — purely a place for the bridge + agent + browser
// to share canonical shapes when typing fetch helpers.
// ---------------------------------------------------------------------------

export interface GetHealthRequest {
  // none
  readonly _kind: "GET-health";
}
export type GetHealthResponse = BridgeHealth;

export interface GetStatusRequest {
  readonly _kind: "GET-status";
  token: string;
}
export type GetStatusResponse = BridgeStatus;

export interface GetLiveJsRequest {
  readonly _kind: "GET-live-js";
  // No auth: must be loadable directly by the dev page <script> tag.
  // CSP concerns are out of scope for /live.js; csp.ts is an opt-in dev-mode
  // CSP patch helper (not auto-wired), separate from token gating.
}
export type GetLiveJsResponse = string; // raw JS body, served as text/javascript

export interface GetDesignSystemRequest {
  readonly _kind: "GET-design-system";
  token: string;
}
// Free-form: `.wisp/design-tokens.json` schema is owned by Phase 4 tokens-extract.
// Bridge does not validate; it only path-traversal-guards and streams.
export type GetDesignSystemResponse = unknown;

export interface GetSourceRequest {
  readonly _kind: "GET-source";
  token: string;
  path: string;
}
export type GetSourceResponse = string; // raw file body, served as text/plain

export interface GetEventsSseRequest {
  readonly _kind: "GET-events-sse";
  token: string;
}
// Response is an event-stream, not a JSON body. Each `data:` line carries
// one `BridgeEvent` JSON. Heartbeats are sent every 15s to keep the
// connection alive through corporate proxies.
export type GetEventsSseFrame = BridgeEvent;

export interface PostEventsRequest {
  readonly _kind: "POST-events";
  token: string;
  body: BridgeEvent;
}
export interface PostEventsResponse {
  accepted: true;
  // monotonic cursor allocated to this event; long-poll clients can use it
  // as their `cursor` parameter to resume after a slice.
  cursor: string;
}

export interface GetPollRequest {
  readonly _kind: "GET-poll";
  query: LongPollRequest;
}
export type GetPollResponse = LongPollResponse;

export interface PostPollRequest {
  readonly _kind: "POST-poll";
  body: LongPollRequest;
}
export type PostPollResponse = LongPollResponse;

export interface PostAnnotationRequest {
  readonly _kind: "POST-annotation";
  token: string;
  body: BridgeEventOf<"annotation">;
}
export interface PostAnnotationResponse {
  accepted: true;
  cursor: string;
}

export interface GetStopRequest {
  readonly _kind: "GET-stop";
  token: string;
}
export interface GetStopResponse {
  stopping: true;
  // ms until the bridge releases the port lock and exits.
  graceMs: number;
}

export type BridgeEndpoint =
  | GetHealthRequest
  | GetStatusRequest
  | GetLiveJsRequest
  | GetDesignSystemRequest
  | GetSourceRequest
  | GetEventsSseRequest
  | PostEventsRequest
  | GetPollRequest
  | PostPollRequest
  | PostAnnotationRequest
  | GetStopRequest;

// ---------------------------------------------------------------------------
// Bridge server module interface — bridge/server.ts implements.
// Coder uses this to compose start/stop without depending on Node `http`.
// ---------------------------------------------------------------------------

export interface BridgeServerOptions {
  projectRoot: string;
  // If undefined, port-discovery.ts assigns the first free port in 31337..31400.
  preferredPort?: number;
  // Auth token; if undefined, the server generates one and writes it to the
  // port-lock file. Exposed for tests that need a deterministic token.
  token?: string;
  // Invoked once at the start of `stopServer()` — whether triggered by the
  // `/stop` HTTP endpoint, by SIGINT/SIGTERM via the live runner's shutdown
  // path, or by the test-harness calling `handle.stop()`. Lets the caller
  // tear down resources the bridge doesn't own (e.g. the live runner's
  // port.lock file). Errors are swallowed — cleanup must be best-effort.
  onBeforeStop?: () => Promise<void>;
}

export interface BridgeServerHandle {
  readonly port: number;
  readonly token: string;
  readonly sessionId: string;
  status(): Promise<BridgeStatus>;
  stop(graceMs?: number): Promise<void>;
}

export interface BridgeServerModule {
  start(opts: BridgeServerOptions): Promise<BridgeServerHandle>;
}
