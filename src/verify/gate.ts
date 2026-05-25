// wisp-design — Verification-Gate orchestrator (Phase 5).
//
// Implements VerifyGateModule from `src/contracts/verify.ts`. Single entry
// `run(ctx)` runs the check-set for the requested mode in parallel via
// `Promise.allSettled`, wraps each check in its per-check timeout, and
// aggregates results into a `VerifyReport`. Idempotent and side-effect-free
// until checks themselves write screenshots.
//
// Each check is loaded via dynamic import so the Stop-hook hot path (which
// uses `runAntiSlop` directly, NOT this orchestrator) pays zero startup cost
// for axe-core / playwright / jsdom.

import {
  CHECK_BUDGET_MS,
  MODE_BLOCKS_ON_FAIL,
  MODE_CHECK_SETS,
  MODE_TIMING_BUDGET_MS,
  aggregateCounts,
  worstSeverity,
  type CheckName,
  type CheckResult,
  type VerifyContext,
  type VerifyGateModule,
  type VerifyMode,
  type VerifyReport,
} from "../contracts/verify.js";

// ---------------------------------------------------------------------------
// Phase-7.12 — Per-mode budget scaling for the outer per-check timeout.
//
// Bug surfaced by the final-review agent: the audit CLI was hitting the
// stop-hook anti-slop 50ms budget on the outer timeout even though the inner
// `runAntiSlopOnFiles` call was passing `perCallBudgetMs * 10`. The outer
// race killed the call before the inner could finish.
//
// Fix: mode-aware scaling. Stop-hook stays at 1x (50ms is the contract);
// live modes get 3x; audit / audit-strict get 10x. The inner perCallBudgetMs
// in dispatchCheck still uses the same 10x factor so they stay in sync.
// ---------------------------------------------------------------------------
const MODE_CHECK_BUDGET_MULTIPLIER: Readonly<Record<VerifyMode, number>> = {
  "stop-hook": 1,
  "live-accept": 3,
  "live-with-screenshot": 3,
  audit: 100,
  "audit-strict": 100,
} as const;

// Audit mode floor: anti-slop with the full Phase-7-tightened regex set
// (brace-walker + brand-spec lookup + all hard-bans + soft-warns) measures
// ~50-200ms on a 10-KB HTML file, so the 50ms × 100 = 5000ms ceiling for
// audit modes gives ample headroom while still surfacing pathological cases.
function budgetForCheck(name: CheckName, mode: VerifyMode): number {
  return CHECK_BUDGET_MS[name] * MODE_CHECK_BUDGET_MULTIPLIER[mode];
}

// ---------------------------------------------------------------------------
// Per-check timeout wrapper. Promise.race against a timer that resolves to
// a skipped result. AbortController would let us actually cancel the
// underlying work, but most of our checks are pure (regex / dom) or call
// optional deps that don't support abort — so we just race and return the
// skipped result while the real promise dangles. Acceptable: the orchestrator
// caller only awaits up to the mode budget.
// ---------------------------------------------------------------------------

function runWithTimeout(
  name: CheckName,
  work: Promise<CheckResult>,
  budgetMs: number,
): Promise<CheckResult> {
  return new Promise<CheckResult>((resolveOuter) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      // A timed-out check is a runtime error — the user should know the check
      // didn't complete. severity:"warn" keeps the gate non-blocking (only
      // audit-strict blocks on fail) while making the failure visible.
      resolveOuter({
        name,
        severity: "warn",
        durationMs: budgetMs,
        skipped: { reason: "timeout", detail: `> ${budgetMs}ms` },
      });
    }, budgetMs);
    work.then(
      (v) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolveOuter(v);
      },
      (err: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        // Unexpected rejection from a check (programming error in dispatchCheck
        // or a check that throws instead of returning a skipped result) →
        // surface as warn, not silent pass.
        resolveOuter({
          name,
          severity: "warn",
          durationMs: 0,
          skipped: {
            reason: "error",
            detail: err instanceof Error ? err.message : String(err),
          },
        });
      },
    );
  });
}

// ---------------------------------------------------------------------------
// Dispatch a single check by name. Dynamic-imports the implementing module
// the first time it is called per process; the Node module-cache keeps
// subsequent calls fast.
// ---------------------------------------------------------------------------

async function dispatchCheck(
  name: CheckName,
  ctx: VerifyContext,
): Promise<CheckResult> {
  const budgetStartedAt = Date.now();
  switch (name) {
    case "anti-slop": {
      const { runAntiSlop, runAntiSlopOnFiles } = await import(
        "./anti-slop-linter.js"
      );
      // Prefer the explicit cssToCheck (stop-hook fast-path); else fall
      // back to whichever content was supplied.
      const cssSource =
        ctx.cssToCheck ??
        ctx.afterContent ??
        ctx.beforeContent ??
        "";
      // Audit-mode is often a multi-file pass; if the caller passed a list
      // via diffSummary, lint each file.
      if (ctx.diffSummary !== undefined && ctx.diffSummary.files.length > 0) {
        return runAntiSlopOnFiles(ctx.diffSummary.files, {
          mode: ctx.mode,
          projectRoot: ctx.projectRoot,
          budgetStartedAt,
          // Inner per-call budget MUST match the outer runWithTimeout budget
          // (set in run() via budgetForCheck). Both scale by mode multiplier.
          perCallBudgetMs: budgetForCheck("anti-slop", ctx.mode),
        });
      }
      return runAntiSlop(cssSource, { mode: ctx.mode, budgetStartedAt });
    }
    case "a11y-axe": {
      const { runA11yAxe } = await import("./a11y-axe.js");
      const args: Parameters<typeof runA11yAxe>[0] = { budgetStartedAt };
      if (ctx.afterContent !== undefined) args.html = ctx.afterContent;
      if (ctx.livePreviewUrl !== undefined) args.livePreviewUrl = ctx.livePreviewUrl;
      return runA11yAxe(args);
    }
    case "console-scan": {
      const { runConsoleScan } = await import("./console-scan.js");
      const args: Parameters<typeof runConsoleScan>[0] = { budgetStartedAt };
      if (ctx.sessionId !== undefined) {
        args.sessionLogPath = `${ctx.projectRoot}/.wisp/sessions/${ctx.sessionId}.jsonl`;
      }
      if (ctx.bridgeUrl !== undefined) args.bridgeUrl = ctx.bridgeUrl;
      if (ctx.token !== undefined) args.token = ctx.token;
      if (ctx.afterContent !== undefined) args.cssOrHtml = ctx.afterContent;
      return runConsoleScan(args);
    }
    case "tab-order": {
      const { runTabOrder } = await import("./tab-order.js");
      const html = ctx.afterContent ?? "";
      return runTabOrder({ html, budgetStartedAt });
    }
    case "reduced-motion": {
      const { runReducedMotion } = await import("./reduced-motion.js");
      const args: Parameters<typeof runReducedMotion>[0] = {
        css: ctx.cssToCheck ?? ctx.afterContent ?? "",
        budgetStartedAt,
      };
      if (ctx.afterContent !== undefined) args.html = ctx.afterContent;
      return runReducedMotion(args);
    }
    case "multi-viewport": {
      const { runMultiViewport } = await import("./multi-viewport.js");
      if (
        ctx.livePreviewUrl === undefined ||
        ctx.sessionId === undefined ||
        ctx.variantId === undefined
      ) {
        // Missing required args for multi-viewport is a caller error (not an
        // optional-dep skip) → warn.
        return {
          name: "multi-viewport",
          severity: "warn",
          durationMs: Date.now() - budgetStartedAt,
          skipped: {
            reason: "error",
            detail:
              "missing livePreviewUrl / sessionId / variantId — multi-viewport requires all three",
          },
        };
      }
      return runMultiViewport({
        livePreviewUrl: ctx.livePreviewUrl,
        sessionId: ctx.sessionId,
        variantId: ctx.variantId,
        projectRoot: ctx.projectRoot,
        budgetStartedAt,
      });
    }
    default: {
      // Exhaustiveness — TypeScript flags any new CheckName addition here.
      const _exhaustive: never = name;
      return {
        name: _exhaustive,
        severity: "pass",
        durationMs: 0,
        skipped: { reason: "error", detail: "unknown check name" },
      };
    }
  }
}

// ---------------------------------------------------------------------------
// run — full orchestrator. Always returns a VerifyReport (never throws).
// ---------------------------------------------------------------------------

async function run(ctx: VerifyContext): Promise<VerifyReport> {
  const startedAt = Date.now();
  const mode = ctx.mode;
  const checks = MODE_CHECK_SETS[mode];
  const budgetMs = MODE_TIMING_BUDGET_MS[mode];

  const promises = checks.map((name) =>
    runWithTimeout(name, dispatchCheck(name, ctx), budgetForCheck(name, mode)),
  );

  // `Promise.allSettled` lets us tolerate a runWithTimeout that rejects (it
  // shouldn't, by construction — we resolve a skipped result on error — but
  // a programming error in dispatchCheck shouldn't poison the run).
  const settled = await Promise.allSettled(promises);
  const resolved: CheckResult[] = settled.map((s, i) => {
    if (s.status === "fulfilled") return s.value;
    // A rejected promise from runWithTimeout means a programming error — the
    // wrapper is designed to never reject. Surface as warn so it's visible.
    return {
      name: checks[i] ?? "anti-slop",
      severity: "warn",
      durationMs: 0,
      skipped: {
        reason: "error",
        detail: s.reason instanceof Error ? s.reason.message : String(s.reason),
      },
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
      budgetExceeded: totalMs > budgetMs,
    },
    ...counts,
    blocked,
  };
}

// ---------------------------------------------------------------------------
// runAntiSlop — Stop-hook fast path. Bypasses the orchestrator overhead.
// ---------------------------------------------------------------------------

async function runAntiSlopDirect(
  css: string,
  ctx: Partial<VerifyContext>,
): Promise<CheckResult> {
  const { runAntiSlop } = await import("./anti-slop-linter.js");
  const args: Parameters<typeof runAntiSlop>[1] = {};
  if (ctx.mode !== undefined) args.mode = ctx.mode;
  return runAntiSlop(css, args);
}

// ---------------------------------------------------------------------------
// Module export — implements VerifyGateModule.
// ---------------------------------------------------------------------------

export const gate: VerifyGateModule = {
  run,
  runAntiSlop: runAntiSlopDirect,
};

// Direct named exports for callers that want to skip the module-object
// indirection (e.g. tests).
export { run, runAntiSlopDirect as runAntiSlop };
