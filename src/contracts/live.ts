// wisp-design — `live` command contracts (Phase 7).
//
// Pure-TS shapes shared between `src/agent/live.ts` (CLI runner) and any
// downstream caller (tests, hooks). Mirrors the pattern in `contracts/agent.ts`
// + `contracts/verify.ts`: zod schemas with derived TS types, no runtime
// side effects, no I/O.
//
// Contract surface for the Phase-7 `live` command:
//   1. LiveCliFlagsSchema     — argv → typed flags.
//   2. LiveSessionStateSchema — in-process state the runner owns + reports.
//   3. LiveVariantBatchSchema — payload emitted on configure → variants ready.
//   4. LiveAcceptResultSchema — output of accept-with-verification-gate.
//
// Coder fills `src/agent/live.ts` against these. The verify-gate's
// `VerifyReport` is referenced via structural type-only import; we keep the
// raw `unknown`-typed `gateVerdict` slot in the zod schema (zod can't model
// the structural VerifyReport without an awkward re-derivation) but type
// the TS surface tightly via the manual `LiveAcceptResult` interface below.

import { z } from "zod";

import type { VerifyReport } from "./verify.js";

// ---------------------------------------------------------------------------
// CLI flags
// ---------------------------------------------------------------------------

export const LIVE_MIN_VARIANTS = 1;
export const LIVE_MAX_VARIANTS = 8;
export const LIVE_DEFAULT_VARIANTS = 3;

export const LiveVerifyModeSchema = z.enum([
  "stop-hook",
  "live-accept",
  "live-with-screenshot",
]);
export type LiveVerifyMode = z.infer<typeof LiveVerifyModeSchema>;

export const LiveCliFlagsSchema = z
  .object({
    // Target dev-server URL. Required when --inject is set (we need to know
    // where the dev server is running so the bridge can resolve livePreviewUrl
    // for multi-viewport verify). Optional when the user opts to paste the
    // <script src> manually — they're providing the URL implicitly.
    target: z.string().url().optional(),
    // Preferred bridge port. Undefined → port-discovery picks 31337..31400.
    port: z.number().int().min(1).max(65535).optional(),
    // Project-relative path to the HTML entry file that should host the
    // <script src=".../live.js"> tag. When undefined, runner prints
    // instructions to stdout and does NOT touch source files.
    inject: z.string().min(1).optional(),
    quiet: z.boolean().default(false),
    strict: z.boolean().default(false),
    verifyMode: LiveVerifyModeSchema.default("live-accept"),
    maxVariants: z
      .number()
      .int()
      .min(LIVE_MIN_VARIANTS)
      .max(LIVE_MAX_VARIANTS)
      .default(LIVE_DEFAULT_VARIANTS),
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
    agentDriven: z.boolean().default(false),
    // Phase 7.10 — when true, agent-driven mode does NOT spawn claude
    // internally. Use this when an interactive Claude session (e.g. Opus)
    // is actively polling the bridge and wants to be the variant designer.
    externalAgent: z.boolean().default(false),
  })
  .refine((v) => !(v.inject !== undefined && v.target === undefined), {
    message: "--target is required when --inject is set",
    path: ["target"],
  });
export type LiveCliFlags = z.infer<typeof LiveCliFlagsSchema>;

// ---------------------------------------------------------------------------
// Session state
// ---------------------------------------------------------------------------

export const LiveSessionStateSchema = z.object({
  sessionId: z.string().min(1),
  bridge: z.object({
    port: z.number().int().positive(),
    token: z.string().uuid(),
  }),
  // The dev-server URL the user pointed us at (or undefined when no --target).
  target: z.string().url().optional(),
  // Project-relative paths injected with <script>. Tracked so SIGINT can
  // reverse them via `removeLiveScript`. Append-only over the run.
  injectedFiles: z.array(z.string().min(1)),
  started: z.string().datetime(),
});
export type LiveSessionState = z.infer<typeof LiveSessionStateSchema>;

// ---------------------------------------------------------------------------
// Variant batch — emitted to the browser after a `configure` event arrives.
// `id`/`css` are the minimum the browser needs to mount a variant; `rationale`
// is the one-sentence string surfaced in the floating-bar (Improvement: per-
// variant rationale). v1.0.0 uses a deterministic placeholder generator;
// post-1.0 swaps in the real LLM-call without changing this shape.
// ---------------------------------------------------------------------------

export const LiveVariantBatchSchema = z.object({
  pickerEventId: z.string().min(1),
  selector: z.string().min(1),
  variants: z
    .array(
      z.object({
        id: z.string().min(1),
        css: z.string(),
        rationale: z.string().min(1),
      }),
    )
    .min(LIVE_MIN_VARIANTS)
    .max(LIVE_MAX_VARIANTS),
});
export type LiveVariantBatch = z.infer<typeof LiveVariantBatchSchema>;

// ---------------------------------------------------------------------------
// Accept result — what the runner returns after accept-event + gate.
// `gateVerdict` is typed as the structural `VerifyReport` from verify.ts; the
// schema below uses `z.unknown()` because re-deriving VerifyReport in zod
// would duplicate ~200 lines from contracts/verify.ts. Callers should narrow
// via the TS interface, not the schema.
// ---------------------------------------------------------------------------

export const LiveAcceptResultSchema = z.object({
  accepted: z.boolean(),
  variantId: z.string().min(1),
  gateVerdict: z.unknown(),
  sourceFile: z.string().min(1).optional(),
  splice: z
    .object({
      start: z.number().int().nonnegative(),
      end: z.number().int().nonnegative(),
      replaced: z.number().int().nonnegative(),
    })
    .optional(),
});

export interface LiveAcceptResult {
  accepted: boolean;
  variantId: string;
  gateVerdict: VerifyReport;
  sourceFile?: string;
  splice?: { start: number; end: number; replaced: number };
}

// ---------------------------------------------------------------------------
// Runner module interface — what `src/agent/live.ts` exposes.
// ---------------------------------------------------------------------------

export interface LiveModule {
  runLive(args: string[]): Promise<number>;
}
