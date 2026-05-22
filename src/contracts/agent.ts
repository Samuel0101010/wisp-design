// wisp-design — Agent-loop contracts (Phase 4).
//
// Pure-TS shared type surface for the Phase-4 agent layer. The agent loop
// itself does NOT run as a daemon. Claude Code's reasoning IS the loop:
//
//   while bridge alive:
//     result = Bash(wisp-design poll-once --timeout 270000)
//     for event in result.events:
//       if event.kind === "configure":
//         variants = reason-about-design(target, freeText, skills/reference/live.md prompt)
//         Bash(wisp-design post-event --kind cycling --variants <json>)
//       elif event.kind === "accept":
//         Bash(wisp-design accept --session SID --variant VID)
//
// The CLI provides ONE-SHOT primitives (`pollOnce`, `postEvent`), and
// `skills/wisp-design/SKILL.md` instructs the model to call them in a loop.
//
// No runtime side effects. No I/O. Only zod schemas, derived TS types, and
// module interfaces that the agent/skills/sync layers must implement.
//
// Three invariants downstream code MUST respect:
//   1. `pollOnce` returns `shouldRetry: true` whenever it sliced before the
//      caller's deadline. The skill prompt re-invokes it; the bridge re-emits
//      events past the same cursor at-least-once (callers MUST be idempotent).
//   2. Variant generation requests carry `requestedVariantCount ∈ {1,3,5,8}`.
//      Anything else is rejected at the zod boundary.
//   3. Sync is EXPLICIT — `/wisp-design sync --from <path>` runs only when the
//      user invokes it. No file-watcher, no push-script (research/synthesis.md
//      Open Decision #6 confirms).

import { z } from "zod";
import type { BridgeEvent } from "./bridge.js";
import type { PickResult } from "./browser.js";

// ---------------------------------------------------------------------------
// Constants — agent-loop tuning + sane caps that the bridge already validates,
// re-exported so callers can budget without importing from bridge.ts.
// ---------------------------------------------------------------------------

export const POLL_LOOP_DEFAULT_TIMEOUT_MS = 270_000;
export const POLL_LOOP_DEFAULT_LEASE_MS = 30_000;
export const POLL_LOOP_MIN_TIMEOUT_MS = 1_000;

// Rationale string is shown verbatim under each variant tile in the floating
// bar. Hard-cap to one sentence so the UI doesn't reflow on long axes-prose.
export const VARIANT_RATIONALE_MAX_LEN = 180;

// Namespace used when indexing the local skills/data/* corpus into AgentDB
// HNSW. Sync writes into the same namespace so user-vault patterns become
// searchable alongside the curated MIT-fork corpus.
export const DEFAULT_SKILLS_NAMESPACE = "wisp-design";

// Allowed variant counts. Adaptive ladder (Improvement #9 vs Impeccable's
// hardcoded 3). 1 = brand-asset bake-off; 3 = default cycle; 5 = exploration
// mode; 8 = stress-test ladder for layout-density work.
export const ALLOWED_VARIANT_COUNTS = [1, 3, 5, 8] as const;
export type AllowedVariantCount = (typeof ALLOWED_VARIANT_COUNTS)[number];

// ---------------------------------------------------------------------------
// Variant axes — the 5 dimensions the prompt asks the model to differentiate
// across. Distinct variants MUST emphasise distinct axes; micro-variations of
// the same axis are slop. (See skills/reference/live.md for the full prompt.)
// ---------------------------------------------------------------------------

export const VARIANT_AXES = [
  "hierarchy", // size/weight relationships, primary action prominence
  "layout", // arrangement, density grid, spacing, alignment
  "typography", // family pairing, scale, leading
  "color", // accent role, semantic colour, surface treatment
  "density", // padding/margin scale, breathing room, information density
] as const;
export type VariantAxis = (typeof VARIANT_AXES)[number];

export const VariantAxisSchema = z.enum(VARIANT_AXES);

// ---------------------------------------------------------------------------
// Poll-Once — agent ← bridge primitive. Wraps GET/POST /poll with sane
// defaults so the skill prompt invokes `wisp-design poll-once` without
// remembering long-poll headers.
// ---------------------------------------------------------------------------

export const PollTransportSchema = z.enum(["sse", "long-poll"]);
export type PollTransport = z.infer<typeof PollTransportSchema>;

export const PollOnceOptionsSchema = z.object({
  bridgeUrl: z.string().url(),
  token: z.string().uuid(),
  timeoutMs: z
    .number()
    .int()
    .min(POLL_LOOP_MIN_TIMEOUT_MS)
    .max(POLL_LOOP_DEFAULT_TIMEOUT_MS)
    .default(POLL_LOOP_DEFAULT_TIMEOUT_MS),
  leaseMs: z
    .number()
    .int()
    .min(1_000)
    .default(POLL_LOOP_DEFAULT_LEASE_MS),
  cursor: z.string().optional(),
  transport: PollTransportSchema.default("long-poll"),
});
export type PollOnceOptions = z.infer<typeof PollOnceOptionsSchema>;

export interface PollOnceResult {
  events: BridgeEvent[];
  cursor: string;
  // Server wall-clock at which the response was sliced. Mirrors
  // LongPollResponse.slicedAt so the agent can budget the next slice.
  slicedAt: number;
  // True if the timeout was sliced before the caller's deadline (the bridge
  // reached its 270s cap before any new events arrived, or before the
  // requested timeout). The skill prompt re-invokes `pollOnce` immediately
  // when this is true; the next call resumes from `cursor`.
  shouldRetry: boolean;
}

// ---------------------------------------------------------------------------
// Post-Event — agent → bridge primitive. Used to push `cycling`, `generating`,
// or `error` events back to the browser after the skill reasons about a
// `configure` event.
// ---------------------------------------------------------------------------

export interface PostEventOptions {
  bridgeUrl: string;
  token: string;
  event: BridgeEvent;
}

export interface PostEventResult {
  ok: true;
  // Monotonic cursor allocated to the posted event; useful for tests that
  // assert ordering across post→poll roundtrips.
  cursor: string;
}

// ---------------------------------------------------------------------------
// Event routing — `routeEvent` lets test code and the skill prompt classify
// what action a BridgeEvent demands, without importing the bridge schema
// every time. The agent does NOT loop in code; this is a pure helper.
// ---------------------------------------------------------------------------

export type AgentActionKind =
  | "generate-variants" // configure → reason about design → post cycling
  | "write-accept" // accept → call wisp-design accept (Phase 3 source-edit)
  | "clean-discard" // discard → call discardVariantBlock (Phase 3)
  | "log-annotation" // annotation → append to .wisp/sessions/<id>.jsonl
  | "ignore"; // pick, cycling, parameter-change, generating, heartbeat, error

// Type-only signature; coder implements as a discriminated-union switch in
// src/agent/poll-loop.ts.
export type RouteEvent = (evt: BridgeEvent) => {
  action: AgentActionKind;
  // Echo of the source event for handlers that want to type-narrow without
  // re-importing BridgeEvent.
  source: BridgeEvent;
};

// ---------------------------------------------------------------------------
// Brand-spec — `.wisp/brand-spec.json`. 9-section schema adapted from
// research/repos/open-design.md, trimmed to fields the variant-generation
// prompt actually consumes. `name` and `oneLiner` are the only required
// fields; everything else is opt-in and the prompt falls back to "house style"
// when missing.
// ---------------------------------------------------------------------------

export const VoiceDistanceSchema = z.enum([
  "intimate",
  "conversational",
  "formal",
]);
export type VoiceDistance = z.infer<typeof VoiceDistanceSchema>;

export const VoiceTemperatureSchema = z.enum(["warm", "cool", "neutral"]);
export type VoiceTemperature = z.infer<typeof VoiceTemperatureSchema>;

export const VisualDirectionSchema = z.enum([
  "editorial",
  "modern-minimal",
  "tech-utility",
  "brutalist",
  "soft-warm",
]);
export type VisualDirection = z.infer<typeof VisualDirectionSchema>;

// Known variant anchors. 5 from research/repos/* + 8 from
// research/vault-obsidian.md. New anchors land here as ALLOWED_VARIANT_ANCHORS
// expands; the prompt looks up exemplar CSS by name.
export const ALLOWED_VARIANT_ANCHORS = [
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
  "shadcn-bold",
] as const;
export type VariantAnchor = (typeof ALLOWED_VARIANT_ANCHORS)[number];
export const VariantAnchorSchema = z.enum(ALLOWED_VARIANT_ANCHORS);

export const PaletteModeSchema = z.enum(["oklch", "hsl", "hex"]);
export type PaletteMode = z.infer<typeof PaletteModeSchema>;

export const BrandSpecSchema = z.object({
  name: z.string().min(1),
  oneLiner: z.string().min(1).max(280),
  audience: z.array(z.string().min(1)).default([]),
  voice: z
    .object({
      tone: z.string().min(1),
      distance: VoiceDistanceSchema,
      temperature: VoiceTemperatureSchema,
    })
    .optional(),
  visualDirection: VisualDirectionSchema.optional(),
  variantAnchor: VariantAnchorSchema.optional(),
  palette: z
    .object({
      mode: PaletteModeSchema,
      // Keys are role tokens (`bg`, `fg`, `accent`, `muted`, …); values are
      // literal strings in the declared `mode`. The variant prompt prefers
      // these over sampled colors when both are present.
      values: z.record(z.string().min(1), z.string().min(1)),
    })
    .optional(),
  typeScale: z
    .object({
      baseSize: z.number().positive(),
      step: z.number().positive().default(1.333),
    })
    .optional(),
  motion: z
    .object({
      // Common keys: `--ease-smooth`, `--ease-sharp`, `--ease-spring`, `--ease-power`.
      // Free-form so brand-asset-extract can store proprietary easings.
      tokens: z.record(z.string().min(1), z.string().min(1)),
    })
    .optional(),
  brandAssets: z
    .object({
      logo: z.string().min(1).optional(),
      wordmark: z.string().min(1).optional(),
    })
    .optional(),
});
export type BrandSpec = z.infer<typeof BrandSpecSchema>;

// ---------------------------------------------------------------------------
// Design-tokens — `.wisp/design-tokens.json`. Written by
// `/wisp-design tokens extract`; consumed by the variant-generation prompt as
// "this codebase already uses these values — prefer them over freshly
// invented ones". Empty arrays are valid (a clean slate).
// ---------------------------------------------------------------------------

export const DesignTokensSchema = z.object({
  extractedAt: z.string(),
  spacing: z.array(z.number().nonnegative()).default([]),
  radii: z.array(z.number().nonnegative()).default([]),
  fontSizes: z.array(z.number().positive()).default([]),
  fontWeights: z.array(z.number().int().positive()).default([]),
  colors: z.array(z.string().min(1)).default([]),
  fontFamilies: z.array(z.string().min(1)).default([]),
  zIndex: z.array(z.number().int()).default([]),
});
export type DesignTokens = z.infer<typeof DesignTokensSchema>;

// ---------------------------------------------------------------------------
// Component-library detection — Phase 4 records the hint; Phase 6 acts on it
// (prefer prop-edits over CSS-overrides for shadcn/Radix).
// ---------------------------------------------------------------------------

export const ComponentLibSchema = z.enum([
  "shadcn",
  "radix",
  "mui",
  "tailwind",
  "vanilla",
]);
export type ComponentLib = z.infer<typeof ComponentLibSchema>;

// ---------------------------------------------------------------------------
// Variant generation contract — the prompt-API. The agent constructs a
// `VariantGenerationRequest` from `configure` event + project metadata, runs
// reasoning, and returns `VariantGenerationResponse`. The actual prompt body
// lives in `skills/reference/live.md`.
// ---------------------------------------------------------------------------

export interface VariantGenerationRequest {
  target: PickResult;
  freeText: string;
  requestedVariantCount: AllowedVariantCount;
  sessionId: string;
  brandSpec?: BrandSpec;
  designTokens?: DesignTokens;
  componentLib?: ComponentLib;
  // Subset of VARIANT_AXES to emphasise (e.g. user said "tighter spacing" →
  // ["density","layout"]). Defaults to all 5.
  axesEmphasis?: VariantAxis[];
}

export interface GeneratedVariant {
  id: string;
  // Full `@scope ([data-wisp-variant="N"]) { :scope { … } }` body. Browser
  // injects verbatim into `<style data-wisp-css="<sessionId>">`.
  css: string;
  // Initial values for the CSS custom properties declared in `css`. Sliders
  // bind to the same names; zero bridge roundtrip per tick.
  cssVars: Record<string, string>;
  // One-sentence rationale, axis-attributed. Shown verbatim under each tile.
  // Hard-capped at VARIANT_RATIONALE_MAX_LEN.
  rationale: string;
  primaryAxis: VariantAxis;
}

export interface VariantGenerationResponse {
  variants: GeneratedVariant[];
  generatedAt: string;
  // Free-form provenance: `claude-opus-4-7`, `claude-sonnet-4-5`, …
  modelUsed: string;
}

// ---------------------------------------------------------------------------
// Skills corpus — indexed via AgentDB HNSW. `index` is rerun whenever
// `skills/data/*` changes (after a `sync` or a manual edit); `search` is the
// retrieval path the variant prompt uses to fetch top-k pattern-cards.
// ---------------------------------------------------------------------------

export const SkillsIndexOptionsSchema = z.object({
  skillsRoot: z.string().min(1),
  namespace: z.string().min(1).default(DEFAULT_SKILLS_NAMESPACE),
});
export type SkillsIndexOptions = z.infer<typeof SkillsIndexOptionsSchema>;

export const SkillsIndexResultSchema = z.object({
  indexedFiles: z.number().int().nonnegative(),
  // Counts per sub-namespace (`anchors`, `directions`, `corpus`, `patterns`,
  // `policy`, `methodology`, `reference`). Lets `doctor` warn when a slice
  // is missing.
  byNamespace: z.record(z.string(), z.number().int().nonnegative()),
  durationMs: z.number().nonnegative(),
  // The AgentDB controller key the corpus was indexed under. Searches MUST
  // pass the same key to retrieve consistent results.
  agentDbController: z.string().min(1),
});
export type SkillsIndexResult = z.infer<typeof SkillsIndexResultSchema>;

export const SkillsSearchOptionsSchema = z.object({
  topK: z.number().int().min(1).max(50).default(8),
  namespace: z.string().min(1).default(DEFAULT_SKILLS_NAMESPACE),
});
export type SkillsSearchOptions = z.infer<typeof SkillsSearchOptionsSchema>;

export const SkillsSearchResultSchema = z.object({
  filePath: z.string().min(1),
  score: z.number(),
  snippet: z.string(),
  namespace: z.string().min(1),
});
export type SkillsSearchResult = z.infer<typeof SkillsSearchResultSchema>;

// ---------------------------------------------------------------------------
// Sync — `/wisp-design sync --from <vault-path>`. Explicit user-triggered
// copy of vault md files into `skills/data/patterns/`. NOT a daemon, NOT a
// file-watcher. Open Decision #6 (research/synthesis.md) confirms.
// ---------------------------------------------------------------------------

export const SyncSourceSchema = z.object({
  fromPath: z.string().min(1),
  patterns: z.array(z.string().min(1)).default(["**/*.md"]),
  // Destination is fixed; the schema literal lets the doctor check that
  // `wisp-design sync` is correctly wired without re-reading config.
  destination: z.literal("skills/data/patterns/"),
  attribution: z
    .object({
      owner: z.string().min(1),
      license: z.string().min(1),
    })
    .optional(),
});
export type SyncSource = z.infer<typeof SyncSourceSchema>;

export interface SyncResult {
  copiedCount: number;
  skippedCount: number;
  // Absolute paths of files copied (post-resolve). Useful for the CLI's
  // post-summary block.
  files: string[];
  // True when `index()` ran successfully after the copy. False if the user
  // passed `--no-index` (tests use this to assert isolation).
  indexedInAgentDb: boolean;
}

// ---------------------------------------------------------------------------
// Module interfaces — what coder implements in src/agent/*.ts.
// ---------------------------------------------------------------------------

export interface PollLoopModule {
  pollOnce(opts: PollOnceOptions): Promise<PollOnceResult>;
  postEvent(opts: PostEventOptions): Promise<PostEventResult>;
  routeEvent: RouteEvent;
}

export interface SkillsIndexModule {
  index(opts: SkillsIndexOptions): Promise<SkillsIndexResult>;
  search(
    query: string,
    opts?: Partial<SkillsSearchOptions>,
  ): Promise<SkillsSearchResult[]>;
}

export interface SyncModule {
  sync(
    source: SyncSource,
    opts: { projectRoot: string; index?: boolean },
  ): Promise<SyncResult>;
}

// ---------------------------------------------------------------------------
// CLI entrypoints — the dynamic-import shape src/index.ts expects from
// src/agent/*.ts. Keeping these as named exports lets src/index.ts compile
// even when coder's commit hasn't landed yet (type-only at compile time,
// runtime resolution via `await import()`).
// ---------------------------------------------------------------------------

export type RunPollOnce = (args: string[]) => Promise<number>;
export type RunPostEvent = (args: string[]) => Promise<number>;
export type RunSkills = (args: string[]) => Promise<number>;
export type RunSync = (args: string[]) => Promise<number>;
