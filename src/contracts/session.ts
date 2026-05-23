// wisp-design — Session-replay + policy-proposal + morph + structure-variant
// contracts (Phase 6).
//
// Pure-TS shared type surface for Improvements #2 (per-session undo-stack),
// #3 (morph-mode), #5 (in-session policy-proposal), #6 (structure-variant-mode).
// No runtime side effects. No `fs` / `path` imports — implementations live in
// `src/session/*.ts`, `src/agent/policy.ts`, `src/agent/morph.ts`.
//
// Relationship to Phase 3:
//   - `UndoEntry` (Phase 3) is the low-level file-op record; one entry per
//     mutation of an actual source file.
//   - `SessionEventEntry` (Phase 6) is the UNION shape the session-logger
//     writes — it INHERITS every `UndoEntryKind` and adds session-level kinds
//     (pick, configure, variants-emitted, verify-report, policy-proposal-*).
//   - The on-disk file `<projectRoot>/.wisp/sessions/<sessionId>.jsonl` MUST
//     accept both shapes when read; the replay-builder folds the union.
//
// Three invariants downstream code MUST respect:
//   1. Logger writes are append-only — never rewrite a closed entry. Mirrors
//      `undo-stack.ts` invariant.
//   2. Replay reconstruction is IDEMPOTENT across reads. Re-reading the same
//      JSONL MUST produce a byte-equivalent `SessionReplayTimeline`.
//   3. PolicyProposal triggers only on `accept` entries (NOT discards, NOT
//      cycle-active-changed). `triggerThreshold` is the minimum count of
//      consecutive same-axis accepts; ANY accept on a different axis resets
//      the counter for that axis.

import { z } from "zod";
import { UndoEntryKindSchema } from "./source.js";

// ---------------------------------------------------------------------------
// SessionEventKind — Phase-3 UndoEntryKind + Phase-6 session-level kinds.
//
// We deliberately re-use UndoEntryKindSchema.options so future additions to
// the Phase-3 enum surface here automatically; coder additions in
// `src/contracts/source.ts` propagate without a parallel edit.
// ---------------------------------------------------------------------------

export const SessionEventKindSchema = z.enum([
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
  "component-lib-detected",
]);
export type SessionEventKind = z.infer<typeof SessionEventKindSchema>;

// ---------------------------------------------------------------------------
// SessionEventEntry — one line of the JSONL log.
//
// `detail` is a free-form bag scoped per kind. The replay-builder reads it
// with narrow type guards (no schema-per-kind to keep the contract surface
// small — the SCHEMA accepts unknown, the BUILDER inspects).
//
// `beforeSha256` / `afterSha256` are populated only for kinds that mutate a
// real file (the Phase-3 subset). Session-level kinds omit both.
// ---------------------------------------------------------------------------

export const SessionEventEntrySchema = z.object({
  ts: z.string(), // ISO timestamp
  sessionId: z.string().min(1),
  kind: SessionEventKindSchema,
  filePath: z.string().optional(),
  detail: z.record(z.string(), z.unknown()).optional(),
  beforeSha256: z
    .string()
    .regex(/^[0-9a-f]{64}$/i)
    .optional(),
  afterSha256: z
    .string()
    .regex(/^[0-9a-f]{64}$/i)
    .optional(),
});
export type SessionEventEntry = z.infer<typeof SessionEventEntrySchema>;

// ---------------------------------------------------------------------------
// Replay timeline — the folded view a viewer/CLI renders.
//
// Each top-level array is a per-kind slice extracted from the JSONL. Metrics
// (`totalVariantsGenerated`, `acceptRate`, `primaryAxisHistogram`) are
// reconstructed deterministically.
// ---------------------------------------------------------------------------

export interface SessionReplayTimeline {
  sessionId: string;
  startedAt: string;
  endedAt?: string;
  entriesCount: number;
  picks: Array<{ ts: string; selector: string; tag: string }>;
  variantGenerations: Array<{
    ts: string;
    targetId: string;
    variantCount: number;
    rationales: string[];
  }>;
  accepts: Array<{ ts: string; variantId: string; filePath: string }>;
  discards: Array<{ ts: string; reason: string }>;
  policyProposals: Array<{
    ts: string;
    axis: string;
    proposed: string;
    outcome: "accepted" | "declined" | "shown-only";
  }>;
  verifyReports: Array<{
    ts: string;
    verdict: "pass" | "warn" | "fail";
    hardBanCount: number;
    a11yFailCount: number;
  }>;
  componentLibDetections: Array<{
    ts: string;
    lib: string;
    confidence: number;
  }>;
  // Reconstructed metrics.
  totalVariantsGenerated: number;
  acceptRate: number; // accepts / variants (NaN-guarded — 0 when no variants)
  primaryAxisHistogram: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Policy-proposal (Improvement #5).
//
// Pattern: after N consecutive accepts of the same `primaryAxis`, surface a
// proposal that the user accepts / declines. Accepted proposals write to
// `.wisp/policy.md` (markdown body with a known frontmatter). Declined
// proposals are NOT re-triggered for the same axis within the same session.
// ---------------------------------------------------------------------------

export const PolicyAxisSchema = z.enum([
  "hierarchy",
  "layout",
  "typography",
  "color",
  "density",
]);
export type PolicyAxis = z.infer<typeof PolicyAxisSchema>;

export const PolicyProposalSchema = z.object({
  axis: PolicyAxisSchema,
  observation: z.string().min(1), // human-readable: "3 high-density variants accepted in a row"
  proposed: z.string().min(1), // proposed change: "add density: 'generous' to .wisp/policy.md"
  evidence: z.array(
    z.object({
      ts: z.string(),
      variantId: z.string().min(1),
      primaryAxis: PolicyAxisSchema,
    }),
  ),
  triggerThreshold: z.number().int().min(2).default(3),
});
export type PolicyProposal = z.infer<typeof PolicyProposalSchema>;

// `.wisp/policy.md` — markdown body with frontmatter. The frontmatter is the
// canonical machine-readable shape; the markdown body below it is free-form
// rationale + examples authored by either the user or `applyProposal`.
export interface PolicyDocument {
  axes: Partial<Record<PolicyAxis, string>>; // each axis → declarative tendency
  acceptedAt: string;
  source: "user-confirmed" | "wisp-proposed-then-confirmed";
}

export const PolicyDocumentSchema = z.object({
  axes: z.record(PolicyAxisSchema, z.string().min(1)).default({}),
  acceptedAt: z.string(),
  source: z.enum(["user-confirmed", "wisp-proposed-then-confirmed"]),
});

// Default threshold for `analyzeRecentDecisions`. Exported so tests + the CLI
// can override without poking at the contract.
export const POLICY_PROPOSAL_DEFAULT_THRESHOLD = 3;

// Where the policy document lives, relative to `projectRoot`. Doctor's Phase-6
// check reads this. Centralised so refactors touch one symbol.
export const POLICY_DOCUMENT_RELATIVE_PATH = ".wisp/policy.md";

// ---------------------------------------------------------------------------
// Morph-mode (Improvement #3).
//
// Browser-side slider interpolates between two variants A and B. `t=0` →
// variant A, `t=1` → variant B, intermediate values blend each
// numerically-interpolatable CSS-var. Non-interpolatable vars (named colors,
// keywords, gradients) snap at `t=0.5` from A's value to B's value — no
// "halfway-named-color" hack.
// ---------------------------------------------------------------------------

export const MORPH_T_MIN = 0;
export const MORPH_T_MAX = 1;

// Units the morph engine treats as numerically interpolatable. Any value
// matching `<number><unit>` where unit ∈ this set is morphable. Bare numbers
// (no unit) are also morphable. Everything else is a snap-at-0.5 swap.
export const MORPH_INTERPOLATABLE_UNITS: readonly string[] = [
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
  "s",
] as const;

export const MorphVariableDiffSchema = z.object({
  name: z.string().regex(/^--[a-z][a-z0-9-]*$/i, "must be a CSS custom property"),
  valueA: z.string(),
  valueB: z.string(),
  interpolatable: z.boolean(),
  unit: z.string().optional(),
});
export type MorphVariableDiff = z.infer<typeof MorphVariableDiffSchema>;

export const MorphSourceSchema = z.object({
  variantIdA: z.string().min(1),
  variantIdB: z.string().min(1),
  // Auto-extracted diff of CSS-vars between A and B.
  variableDiff: z.array(MorphVariableDiffSchema),
});
export type MorphSource = z.infer<typeof MorphSourceSchema>;

export const MorphConfigSchema = z.object({
  source: MorphSourceSchema,
  t: z.number().min(MORPH_T_MIN).max(MORPH_T_MAX),
  interpolatedCss: z.string(),
});
export type MorphConfig = z.infer<typeof MorphConfigSchema>;

// ---------------------------------------------------------------------------
// Structure-variant-mode (Improvement #6).
//
// CSS-only variants tune the *appearance* of a fixed JSX subtree. Structural
// variants emit a DIFFERENT JSX subtree (2-col split, card layout, hero
// treatment). Coder routes via the `--structural` flag on variant generation;
// the source-edit layer treats them as wholesale subtree replacements rather
// than @scope wrap-and-cycle.
// ---------------------------------------------------------------------------

export const StructureVariantKindSchema = z.enum([
  "as-is", // baseline = original JSX (always present so the user can revert without re-pick)
  "two-col-split", // 2-column layout
  "card-layout", // wrap children in card components
  "stacked-vertical", // simple vertical stack
  "horizontal-row", // row layout
  "hero-style", // hero treatment (large primary)
  "sidebar-left",
  "sidebar-right",
]);
export type StructureVariantKind = z.infer<typeof StructureVariantKindSchema>;

export const STRUCTURE_VARIANT_RATIONALE_MAX_LEN = 180;

export const StructureVariantSpecSchema = z.object({
  kind: StructureVariantKindSchema,
  rationale: z.string().min(1).max(STRUCTURE_VARIANT_RATIONALE_MAX_LEN),
  // Full JSX subtree as a STRING — agent-emitted. Lives in a markdown-fenced
  // block during transport; the source-edit layer parses it as the raw
  // replacement payload.
  jsx: z.string().min(1),
  // CSS to inject alongside (optional — purely structural variants may have
  // no CSS; tied to the JSX via the structure-variant-emitted log entry).
  css: z.string().default(""),
});
export type StructureVariantSpec = z.infer<typeof StructureVariantSpecSchema>;

export interface StructureVariantRequest {
  target: { id: string; selector: string; originalJsx: string };
  // 2-3 distinct kinds. Agent picks; the runtime exposes them in the floating
  // bar as labelled cards (NOT plain arrow-cycle, because structure mismatch
  // makes "next variant" disorienting).
  requestedKinds: StructureVariantKind[];
  brandSpec?: unknown;
  componentLib?: unknown;
}

export interface StructureVariantResponse {
  variants: StructureVariantSpec[];
  generatedAt: string; // ISO
}

// ---------------------------------------------------------------------------
// Logger / Replay / Policy / Morph module interfaces.
//
// These describe what `src/session/*.ts` + `src/agent/policy.ts` +
// `src/agent/morph.ts` export. Type-only contract — no runtime imports.
// ---------------------------------------------------------------------------

export interface SessionLoggerStartOptions {
  projectRoot: string;
  meta?: Record<string, unknown>;
}

export interface SessionLoggerEndOptions {
  projectRoot: string;
}

export interface SessionLoggerOptions {
  projectRoot: string;
}

export interface SessionLoggerModule {
  start(
    sessionId: string,
    opts: SessionLoggerStartOptions,
  ): Promise<void>;
  log(entry: SessionEventEntry): Promise<void>;
  end(sessionId: string, opts: SessionLoggerEndOptions): Promise<void>;

  // Convenience methods — composed shorthands the agent loop calls. Each
  // produces exactly one `log()` entry under the matching kind.
  logVariantsEmitted(
    sessionId: string,
    evt: {
      targetId: string;
      variants: Array<{
        id: string;
        rationale: string;
        primaryAxis: string;
      }>;
    },
    opts: SessionLoggerOptions,
  ): Promise<void>;
  logAccept(
    sessionId: string,
    evt: { variantId: string; filePath: string },
    opts: SessionLoggerOptions,
  ): Promise<void>;
  logVerifyReport(
    sessionId: string,
    evt: {
      verdict: string;
      hardBanCount: number;
      a11yFailCount: number;
    },
    opts: SessionLoggerOptions,
  ): Promise<void>;
}

export interface SessionReplayModule {
  buildTimeline(
    sessionId: string,
    opts: { projectRoot: string },
  ): Promise<SessionReplayTimeline>;
  listSessions(opts: {
    projectRoot: string;
  }): Promise<
    Array<{
      sessionId: string;
      startedAt: string;
      endedAt?: string;
      entriesCount: number;
    }>
  >;
}

export interface PolicyProposalAnalyzeOptions {
  triggerThreshold?: number;
}

export interface PolicyProposalApplyResult {
  written: boolean;
  policyPath: string;
}

export interface PolicyProposalModule {
  // Pure: read recent entries, decide whether to surface a proposal. Returns
  // null when no axis crosses `triggerThreshold` (default
  // POLICY_PROPOSAL_DEFAULT_THRESHOLD). Implementations MUST NOT mutate the
  // input array.
  analyzeRecentDecisions(
    entries: SessionEventEntry[],
    opts?: PolicyProposalAnalyzeOptions,
  ): PolicyProposal | null;

  // Write to `.wisp/policy.md`. Idempotent — repeated `applyProposal` for the
  // same axis updates that axis only; other axes survive.
  applyProposal(
    proposal: PolicyProposal,
    opts: { projectRoot: string },
  ): Promise<PolicyProposalApplyResult>;
}

export interface MorphModeModule {
  // Build the diff between two variants' cssVars. CSS-vars only in BOTH
  // variants land in the diff; uniques are excluded (interpolation requires a
  // paired endpoint). Implementations MUST be deterministic — same inputs →
  // byte-equivalent output.
  buildSource(
    variantA: { id: string; cssVars: Record<string, string> },
    variantB: { id: string; cssVars: Record<string, string> },
  ): MorphSource;

  // Compute the @scope CSS for a given `t`. Pure — no DOM, no fetch, no I/O.
  // The browser applies the result directly; no bridge round-trip.
  interpolate(source: MorphSource, t: number): MorphConfig;
}

// ---------------------------------------------------------------------------
// CLI entrypoints — dynamic-import shape src/index.ts expects.
//
// Mirrors the Phase 4 pattern (RunPollOnce / RunSync). `src/index.ts` resolves
// these via `await import("./session/replay.js")` etc.; type-only at compile
// time keeps `tsc --noEmit` happy while coder commits the implementations in
// parallel.
// ---------------------------------------------------------------------------

export type RunHistory = (args: string[]) => Promise<number>;
export type RunMorph = (args: string[]) => Promise<number>;
export type RunPolicy = (args: string[]) => Promise<number>;
