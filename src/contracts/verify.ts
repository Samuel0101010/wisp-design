// wisp-design — Verification-Gate contracts (Phase 5).
//
// Pure-TS shared type surface for the Phase-5 modules that gate every Accept
// signal on a multi-check verification pass. This is the wisp-design USP:
// no other live-edit tool (Impeccable, Stagewise, Onlook, v0, Claude Design)
// gates accept on a11y + screenshot + anti-slop simultaneously.
//
// No runtime side effects. No `fs`, `axe-core`, or `playwright` imports —
// those live in src/verify/*.ts implementations. This file owns: zod
// schemas, derived TS types, mode-hierarchy lookup tables, per-check budgets,
// violation shapes, and the gate-orchestrator module interface.
//
// Five invariants downstream code MUST respect:
//   1. The check-set for each VerifyMode is FIXED in `MODE_CHECK_SETS`.
//      Adding a check to a mode means editing this table — never silently
//      running an extra check.
//   2. Hard-ban anti-slop rules (the 7 in `HARD_BAN_RULES`) emit `severity:
//      "fail"`; soft suggestions emit `severity: "warn"` even in strict mode.
//   3. Per-check timeout budgets in `MODE_TIMING_BUDGET_MS` and the per-check
//      `*_BUDGET_MS` constants are HARD ceilings — the gate must time-out a
//      check that exceeds its budget and emit `{ skipped: { reason: "timeout" } }`.
//   4. Blocking is mode-driven via `MODE_BLOCKS_ON_FAIL`. Lead-confirmed:
//      warn-default for v0.x. Only `audit-strict` hard-blocks. (Open Decision #7,
//      research/synthesis.md.)
//   5. Multi-viewport check MUST gracefully skip when `playwright` is not in
//      `node_modules` — return `{ skipped: { reason: "optional-dep-missing" } }`.
//      Same for `pixelmatch` and reduced-motion diff.
//
// Lifecycle hook integration:
//   - Stop-hook (every Claude turn): runs mode "stop-hook" — anti-slop only,
//     p99 < 100ms. Replaces the no-op stub in src/hooks/dispatcher.ts.
//   - Live-Mode Accept (bridge "accept" event → before fs.writeFileSync):
//     mode "live-accept" (or "live-with-screenshot" if user toggled in
//     floating-bar). p95 ≤ 3s (or ≤ 6s with screenshot).
//   - CLI: `wisp-design audit [--mode fast|full|strict]` runs mode "audit"
//     or "audit-strict" against git diff or supplied paths.

import { z } from "zod";
import type { AcceptOperation } from "./source.js";

// Re-export for src/verify/gate.ts pre-accept hook callers.
export type { AcceptOperation };

// ---------------------------------------------------------------------------
// Verify Mode + Strenge
// ---------------------------------------------------------------------------

// 5 modes — each maps to a fixed check-set, budget, and blocking policy.
//   "stop-hook"            — every Claude turn; anti-slop only; p99 < 100ms
//   "live-accept"          — pre-accept in browser-driven Live-Mode
//   "live-with-screenshot" — same + multi-viewport (user-toggle)
//   "audit"                — CLI batch audit, warn-default
//   "audit-strict"         — CLI batch audit, hard-block on hard-ban / AA-fail
export const VerifyModeSchema = z.enum([
  "stop-hook",
  "live-accept",
  "live-with-screenshot",
  "audit",
  "audit-strict",
]);
export type VerifyMode = z.infer<typeof VerifyModeSchema>;

// Per-check severity. Aggregated to the report verdict via worst-of.
//   "pass" — check ran and produced no violations
//   "warn" — soft violation; does NOT block accept in warn-default modes
//   "fail" — hard violation; blocks accept ONLY in modes where
//            MODE_BLOCKS_ON_FAIL is true (i.e. "audit-strict")
export const SeveritySchema = z.enum(["pass", "warn", "fail"]);
export type Severity = z.infer<typeof SeveritySchema>;

// ---------------------------------------------------------------------------
// Check Names
// ---------------------------------------------------------------------------

export const CheckNameSchema = z.enum([
  "anti-slop",
  "a11y-axe",
  "console-scan",
  "tab-order",
  "reduced-motion",
  "multi-viewport",
]);
export type CheckName = z.infer<typeof CheckNameSchema>;

// ---------------------------------------------------------------------------
// Mode → Check-Set / Budget / Blocking Mapping
//
// These tables ARE the spec. The gate-orchestrator (src/verify/gate.ts)
// reads them directly — there is no other source of truth for which checks
// run in which mode. To add a check, extend `CheckNameSchema` AND every
// row of `MODE_CHECK_SETS` that should include it.
// ---------------------------------------------------------------------------

export const MODE_CHECK_SETS: Readonly<
  Record<VerifyMode, ReadonlyArray<CheckName>>
> = {
  "stop-hook": ["anti-slop"],
  "live-accept": [
    "anti-slop",
    "a11y-axe",
    "console-scan",
    "tab-order",
    "reduced-motion",
  ],
  "live-with-screenshot": [
    "anti-slop",
    "a11y-axe",
    "console-scan",
    "tab-order",
    "reduced-motion",
    "multi-viewport",
  ],
  audit: [
    "anti-slop",
    "a11y-axe",
    "console-scan",
    "tab-order",
    "reduced-motion",
    "multi-viewport",
  ],
  "audit-strict": [
    "anti-slop",
    "a11y-axe",
    "console-scan",
    "tab-order",
    "reduced-motion",
    "multi-viewport",
  ],
} as const;

// Blocking policy. Lead-confirmed: warn-default for v0.x; only `audit-strict`
// hard-blocks. The browser-side floating bar surfaces warn-level violations
// as a non-blocking confirmation. (research/synthesis.md Open Decision #7.)
export const MODE_BLOCKS_ON_FAIL: Readonly<Record<VerifyMode, boolean>> = {
  "stop-hook": false,
  "live-accept": false,
  "live-with-screenshot": false,
  audit: false,
  "audit-strict": true,
} as const;

// Total per-mode time budget. The gate-orchestrator MUST honour this as a
// hard ceiling — any check still running at `started + budget` is aborted
// with `{ skipped: { reason: "timeout" } }`. Per-check budgets below MUST
// sum to ≤ mode budget (modulo parallelism — the orchestrator runs checks
// concurrently via Promise.allSettled).
export const MODE_TIMING_BUDGET_MS: Readonly<Record<VerifyMode, number>> = {
  "stop-hook": 100, // p99 hard limit — hot path on every Claude turn
  "live-accept": 3000, // p95 hot-path budget per synthesis.md
  "live-with-screenshot": 6000, // + Playwright launch + 4 viewports × 2 modes
  audit: 30000, // best-effort, single-shot CLI
  "audit-strict": 30000, // same; blocking decision after results assembled
} as const;

// ---------------------------------------------------------------------------
// Anti-Slop Rules
//
// 7 hard-bans (the gate-blocks list from skills/policy/anti-slop.md §1-7) +
// 5 soft suggestions. The linter compiles every rule's regex / detector at
// module-load time so the Stop-hook stays sub-100ms (no disk I/O on hot
// path).
// ---------------------------------------------------------------------------

export const AntiSlopRuleIdSchema = z.enum([
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
  "all-rounded-corners",
]);
export type AntiSlopRuleId = z.infer<typeof AntiSlopRuleIdSchema>;

// Authoritative hard-ban set. The linter checks each rule against this set
// to assign severity. Anything not in here is a soft suggestion.
export const HARD_BAN_RULES: ReadonlySet<AntiSlopRuleId> = new Set([
  "em-dash-ui",
  "gradient-text-headline",
  "default-glassmorphism",
  "hero-metric-template",
  "side-stripe-decoration",
  "purple-blue-gradient",
  "generic-ai-illustration",
]);

export function isHardBan(ruleId: AntiSlopRuleId): boolean {
  return HARD_BAN_RULES.has(ruleId);
}

// ---------------------------------------------------------------------------
// Violation shapes — one per check kind.
//
// Each check returns a `CheckResult` carrying violations of the matching
// shape (kept loosely-typed in `CheckResult.violations` via a union). The
// distinct shapes mean callers can render check-specific UI in the floating
// bar without re-parsing strings.
// ---------------------------------------------------------------------------

export interface AntiSlopViolation {
  ruleId: AntiSlopRuleId;
  // Hard-ban → "fail"; soft suggestion → "warn".
  severity: "fail" | "warn";
  message: string;
  // Source location of the offending CSS / markup. `line`/`column` are 1-based
  // for editor friendliness. `selector` is the CSS selector when the violation
  // is on a rendered element (axe-driven probes only). `cssSnippet` is the
  // ≤ 80-char excerpt the linter matched.
  location?: {
    line?: number;
    column?: number;
    selector?: string;
    cssSnippet?: string;
  };
  suggestedFix?: string;
}

// Mirrors axe-core's run-result shape (trimmed). The linter resolves
// `severity` from axe's `impact` field + the rule's WCAG level: AA +
// serious|critical → "fail"; everything else → "warn". A-level + minor →
// "warn"; AAA-level always "warn" (we don't fail on AAA in v0.x).
export interface A11yViolation {
  ruleId: string; // axe-core rule id, e.g. "color-contrast"
  impact: "minor" | "moderate" | "serious" | "critical";
  level: "A" | "AA" | "AAA";
  severity: "fail" | "warn";
  nodes: Array<{ selector: string; html?: string }>;
  helpUrl?: string;
  // Human-readable summary — pulled from axe's `help` field at map time so
  // the audit text/markdown formatters (which expect `.message` per
  // violation) render concrete copy instead of "- ruleId: " blanks.
  message: string;
}

// Console-scan walks the session-log + browser-reported console messages
// since the wrap timestamp; one entry per match. The agent loop is
// responsible for forwarding browser console events to the bridge — this
// shape is what the gate consumes.
export interface ConsoleScanResult {
  message: string;
  // Pattern that matched (e.g. "error|warn|fail|exception"). Helpful for
  // false-positive triage.
  pattern: string;
  // ISO timestamp of first occurrence in the scan window.
  firstSeenAt: string;
}

export interface TabOrderViolation {
  kind:
    | "focus-trap-leak" // modal opened but focus escapes on Tab
    | "missing-focus-ring" // interactive element with no visible focus state
    | "nonzero-tabindex"; // tabindex > 0 (forces non-DOM order)
  selector: string;
  detail?: string;
}

export interface ReducedMotionViolation {
  // CSS selector for the element whose render diff exceeded the motion-respect
  // threshold under `prefers-reduced-motion: reduce`.
  selector: string;
  // Pixel-diff area between the two renders. Higher = worse violation.
  diffArea: number;
  // Threshold above which the diff counts as a violation. Configurable per
  // project via `.wisp/policy.md` (Phase 6).
  threshold: number;
}

export interface ViewportScreenshot {
  viewport: {
    w: number;
    h: number;
    // Human-readable label: "mobile-375", "tablet-768", "desktop-1280",
    // "wide-1920". Lets the floating-bar render the trio without parsing
    // pixel widths.
    label: string;
  };
  mode: "light" | "dark";
  // Absolute path to the captured PNG. Multi-viewport check writes to
  // `.wisp/sessions/<sid>/screenshots/<variantId>/<label>.<mode>.png`.
  path: string;
}

// Union of every violation shape. Loose by design — render code switches on
// `name` of the parent CheckResult, not on a discriminator inside the
// violation. Keeps the violation shapes free of bookkeeping fields.
export type CheckViolation =
  | AntiSlopViolation
  | A11yViolation
  | ConsoleScanResult
  | TabOrderViolation
  | ReducedMotionViolation;

// ---------------------------------------------------------------------------
// CheckResult — the per-check return shape.
// ---------------------------------------------------------------------------

export interface CheckSkip {
  reason: "optional-dep-missing" | "mode-excluded" | "timeout" | "error";
  detail?: string;
}

export interface CheckResult {
  name: CheckName;
  severity: Severity;
  // Wall-clock milliseconds from check start to check completion (including
  // the timeout cap). For skipped checks: 0 if pre-flighted, else the time
  // until the skip decision was made.
  durationMs: number;
  // Violations the check found. `undefined` (not `[]`) means the check did
  // not run (skipped). `[]` means it ran and found nothing.
  violations?: CheckViolation[];
  // multi-viewport populates this; other checks leave it undefined.
  screenshots?: ViewportScreenshot[];
  // Set when severity is "pass" but the check did not actually run.
  skipped?: CheckSkip;
}

// ---------------------------------------------------------------------------
// VerifyReport — the gate-orchestrator's return shape.
// ---------------------------------------------------------------------------

export interface VerifyReport {
  // Worst-of (`fail` > `warn` > `pass`) across all `checks[].severity`.
  verdict: Severity;
  mode: VerifyMode;
  checks: CheckResult[];
  timing: {
    totalMs: number;
    budgetMs: number;
    // True iff totalMs > budgetMs. Logged to session-log for tuning.
    budgetExceeded: boolean;
  };
  // Convenience aggregates — derivable from `checks[]` but exposed so the
  // floating-bar and Stop-hook don't need to walk the union.
  hardBanCount: number;
  a11yFailCount: number;
  warningCount: number;
  // Blocking decision. True iff `verdict === "fail"` AND
  // `MODE_BLOCKS_ON_FAIL[mode]`. The browser/CLI checks this single field.
  blocked: boolean;
}

// ---------------------------------------------------------------------------
// Gate Module Interface — what src/verify/gate.ts exports.
// ---------------------------------------------------------------------------

export interface VerifyContext {
  mode: VerifyMode;
  // File the verify is gating on. Required for stop-hook + audit modes;
  // optional for live-accept (the bridge supplies file path via accept
  // event, but the gate may run without it for diff-only checks).
  filePath?: string;
  // Session this verify pass belongs to. Used for session-log correlation
  // and (in multi-viewport) for screenshot directory naming.
  sessionId?: string;
  // Pick + variant identifiers. Required when the verify is gating a
  // browser-driven accept; absent for stop-hook and pure-diff audit.
  targetId?: string;
  variantId?: string;
  // Pre/post file content. `beforeContent` is captured before the splice;
  // `afterContent` is the carbonized result the gate must verify. Stop-hook
  // typically supplies only `cssToCheck` from a diff hunk; live-accept
  // supplies both.
  beforeContent?: string;
  afterContent?: string;
  // CSS-only fast path for stop-hook. When set, the anti-slop check runs
  // against this string instead of trying to extract CSS from
  // `afterContent`. Skips parsing entirely on the hot path.
  cssToCheck?: string;
  // Diff statistics — used by stop-hook to short-circuit when the diff has
  // no UI-relevant lines.
  diffSummary?: {
    added: number;
    removed: number;
    files: string[];
  };
  // Browser-driven checks (a11y-axe, console-scan, multi-viewport) need a
  // live URL to render against. Stop-hook + pure-diff audit leave this
  // undefined and the checks fall back to jsdom-rendering or skip.
  livePreviewUrl?: string;
  // For posting check progress back through the bridge SSE channel.
  bridgeUrl?: string;
  token?: string;
  // User-toggle from floating-bar. Promotes mode "live-accept" →
  // "live-with-screenshot" pre-orchestrate.
  screenshotEnabled?: boolean;
  // Project root for resolving relative paths + writing screenshots to
  // `.wisp/sessions/`.
  projectRoot: string;
}

export interface VerifyGateModule {
  // Run the full check-set for the given mode. Always returns a report
  // (never throws); errors are encoded as `CheckResult { skipped: { reason:
  // "error" } }`.
  run(ctx: VerifyContext): Promise<VerifyReport>;

  // Direct invocation of the anti-slop linter — Stop-hook's hot path uses
  // this rather than `run()` to avoid the orchestrator overhead. Returns a
  // single CheckResult; caller derives the report shape if it needs one.
  runAntiSlop(
    css: string,
    ctx: Partial<VerifyContext>,
  ): Promise<CheckResult>;
}

// ---------------------------------------------------------------------------
// Audit CLI Schema
//
// Lead-confirmed flag surface:
//   wisp-design audit                       # mode=fast (stop-hook subset)
//   wisp-design audit --mode full           # mode=audit
//   wisp-design audit --mode strict         # mode=audit-strict (hard-block)
//   wisp-design audit --screenshot          # forces mode=full + viewport
//   wisp-design audit --format json         # machine-readable output
//   wisp-design audit --fail-on-warn        # treat warn as fail (CI use)
//   wisp-design audit path/to/*.tsx         # explicit paths; else git diff
// ---------------------------------------------------------------------------

export const AuditOptionsSchema = z.object({
  // User-facing names (`fast`/`full`/`strict`) are friendlier than the
  // internal VerifyMode enum. Mapping handled by the audit runner:
  //   fast   → "stop-hook"
  //   full   → "audit"   (+ "live-with-screenshot" if --screenshot)
  //   strict → "audit-strict"
  mode: z.enum(["fast", "full", "strict"]).default("fast"),
  // File globs to audit. Empty array = audit `git diff HEAD --name-only`.
  paths: z.array(z.string()).default([]),
  outputFormat: z.enum(["text", "json", "markdown"]).default("text"),
  // CI knob: treat warn-level findings as exit-1. Default false (warn-only
  // is informational for v0.x).
  failOnWarn: z.boolean().default(false),
  // Force multi-viewport screenshot (requires playwright optionalDep).
  screenshotEnabled: z.boolean().default(false),
});
export type AuditOptions = z.infer<typeof AuditOptionsSchema>;

// CLI entrypoint shape — mirrors src/agent/*.ts pattern. src/index.ts
// lazy-loads `src/agent/audit.ts` and invokes `runAudit(args)`.
export type RunAudit = (args: string[]) => Promise<number>;

// ---------------------------------------------------------------------------
// Per-Check Timing Budgets
//
// HARD ceilings per check. The orchestrator wraps each check in a timeout
// that emits `{ skipped: { reason: "timeout" } }` when exceeded. Sum across
// checks is intentionally > mode budget — Promise.allSettled is parallel.
// ---------------------------------------------------------------------------

export const ANTI_SLOP_LINTER_BUDGET_MS = 50; // regex-only, pre-compiled
// 1500ms covers axe.run on jsdom (~100ms raw) + jsdom JSDOM construction
// (~500ms first-time module load) + Object.defineProperty splice/restore +
// overhead. Audit-mode timeout was 800ms which sufficed in the test-suite's
// already-warm jsdom path but tripped the user-facing CLI audit cold-start.
export const A11Y_AXE_BUDGET_MS = 1500; // axe-core run on rendered HTML
export const CONSOLE_SCAN_BUDGET_MS = 2000; // includes 1.5s HMR-quiesce wait
export const TAB_ORDER_BUDGET_MS = 300; // synchronous DOM traversal
export const REDUCED_MOTION_BUDGET_MS = 600; // 2 jsdom renders + pixelmatch
export const MULTI_VIEWPORT_BUDGET_MS = 3500; // 4 viewports × 2 modes, parallel

// Stop-hook hot-path absolute ceiling. The dispatcher MUST exit before this
// elapses even if the linter is still running.
export const STOP_HOOK_HARD_LIMIT_MS = 100;

// Live-accept hot-path ceiling — matches MODE_TIMING_BUDGET_MS["live-accept"]
// but re-exported for callers that don't want to index into the table.
export const LIVE_ACCEPT_HARD_LIMIT_MS = 3000;

// Quality gate: the anti-slop linter MUST stay below this false-positive
// rate on a 100-real-world-component sample. Phase 5 quality gate per
// CLAUDE.md > Quality-Gates. Enforced by tests/verify/anti-slop-fp-rate.test.ts
// (tester writes that test).
export const ANTI_SLOP_FALSE_POSITIVE_RATE_MAX = 0.05;

// Map per-check budget by name — convenience for the orchestrator.
export const CHECK_BUDGET_MS: Readonly<Record<CheckName, number>> = {
  "anti-slop": ANTI_SLOP_LINTER_BUDGET_MS,
  "a11y-axe": A11Y_AXE_BUDGET_MS,
  "console-scan": CONSOLE_SCAN_BUDGET_MS,
  "tab-order": TAB_ORDER_BUDGET_MS,
  "reduced-motion": REDUCED_MOTION_BUDGET_MS,
  "multi-viewport": MULTI_VIEWPORT_BUDGET_MS,
} as const;

// ---------------------------------------------------------------------------
// Multi-viewport defaults — the trio the live-with-screenshot mode captures.
// 4 widths × 2 modes (light/dark) = 8 PNGs per accept. Sourced from
// research/vault-obsidian.md § "Pflicht-Verifikation nach UI-Edit".
// ---------------------------------------------------------------------------

export interface ViewportPreset {
  w: number;
  h: number;
  label: string;
}

export const DEFAULT_VIEWPORTS: ReadonlyArray<ViewportPreset> = [
  { w: 375, h: 812, label: "mobile-375" },
  { w: 768, h: 1024, label: "tablet-768" },
  { w: 1280, h: 800, label: "desktop-1280" },
  { w: 1920, h: 1080, label: "wide-1920" },
] as const;

export const DEFAULT_COLOR_SCHEMES: ReadonlyArray<"light" | "dark"> = [
  "light",
  "dark",
] as const;

// ---------------------------------------------------------------------------
// Optional-dep probe — used by doctor + the multi-viewport / reduced-motion
// checks. Pure-signature; coder implements via dynamic import probe.
// ---------------------------------------------------------------------------

export const OPTIONAL_DEPS = ["playwright", "pixelmatch"] as const;
export type OptionalDep = (typeof OPTIONAL_DEPS)[number];

export interface OptionalDepProbeResult {
  name: OptionalDep;
  installed: boolean;
  // Version when present, undefined when absent. Doctor surfaces this.
  version?: string;
}

export type ProbeOptionalDep = (
  name: OptionalDep,
) => Promise<OptionalDepProbeResult>;

// ---------------------------------------------------------------------------
// Helpers — derived selectors over the report. Pure functions, signature only.
// ---------------------------------------------------------------------------

// Worst-of severity aggregation. Used by the orchestrator to compute
// `VerifyReport.verdict`.
export function worstSeverity(
  results: ReadonlyArray<{ severity: Severity }>,
): Severity {
  let worst: Severity = "pass";
  for (const r of results) {
    if (r.severity === "fail") return "fail";
    if (r.severity === "warn") worst = "warn";
  }
  return worst;
}

// Whether the report should block the accept signal. The gate writes this
// into `VerifyReport.blocked`; callers may also derive it ad-hoc.
export function shouldBlock(report: VerifyReport): boolean {
  return report.verdict === "fail" && MODE_BLOCKS_ON_FAIL[report.mode];
}

// Convenience aggregator the orchestrator uses to populate VerifyReport's
// count fields without rewalking the violation union.
export function aggregateCounts(
  checks: ReadonlyArray<CheckResult>,
): { hardBanCount: number; a11yFailCount: number; warningCount: number } {
  let hardBanCount = 0;
  let a11yFailCount = 0;
  let warningCount = 0;
  for (const c of checks) {
    if (c.severity === "warn") warningCount += 1;
    if (c.violations === undefined) continue;
    if (c.name === "anti-slop") {
      for (const v of c.violations) {
        const av = v as AntiSlopViolation;
        if (av.ruleId !== undefined && HARD_BAN_RULES.has(av.ruleId)) {
          hardBanCount += 1;
        }
      }
    }
    if (c.name === "a11y-axe") {
      for (const v of c.violations) {
        if ((v as A11yViolation).severity === "fail") a11yFailCount += 1;
      }
    }
  }
  return { hardBanCount, a11yFailCount, warningCount };
}
