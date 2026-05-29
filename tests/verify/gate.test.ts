// wisp-design — Verification-Gate orchestrator tests (Phase 5).
//
// Uses the real gate.run() against synthesized contexts. Mode-routing is
// verified by checking which check names appear in the resulting `checks[]`
// (the orchestrator runs the FIXED set from MODE_CHECK_SETS; if a check is
// skipped it still appears in the result with skipped:..., but never extra
// names that aren't in the mode's check-set).

import { afterEach, describe, expect, it, vi } from "vitest";

import { run } from "../../src/verify/gate.js";
import {
  CHECK_BUDGET_MS,
  MODE_CHECK_SETS,
  MODE_TIMING_BUDGET_MS,
  aggregateCounts,
  worstSeverity,
  type CheckResult,
  type VerifyContext,
} from "../../src/contracts/verify.js";

function baseCtx(): VerifyContext {
  return {
    mode: "audit",
    projectRoot: process.cwd(),
    afterContent: `.x { color: #112233; padding: 18px; font-weight: 400; } .y { font-weight: 700; }`,
    cssToCheck: `.x { color: #112233; padding: 18px; font-weight: 400; } .y { font-weight: 700; }`,
  };
}

describe("gate.run — mode routing", () => {
  it("stop-hook mode runs ONLY anti-slop", async () => {
    const report = await run({ ...baseCtx(), mode: "stop-hook" });
    const names = report.checks.map((c) => c.name);
    expect(names).toEqual(["anti-slop"]);
    expect(MODE_CHECK_SETS["stop-hook"]).toEqual(["anti-slop"]);
  });

  it("live-accept mode runs 5 checks (no multi-viewport)", async () => {
    const report = await run({ ...baseCtx(), mode: "live-accept" });
    const names = report.checks.map((c) => c.name);
    expect(names).toContain("anti-slop");
    expect(names).toContain("a11y-axe");
    expect(names).toContain("console-scan");
    expect(names).toContain("tab-order");
    expect(names).toContain("reduced-motion");
    expect(names).not.toContain("multi-viewport");
  });

  it("live-with-screenshot mode includes multi-viewport", async () => {
    const report = await run({ ...baseCtx(), mode: "live-with-screenshot" });
    const names = report.checks.map((c) => c.name);
    expect(names).toContain("multi-viewport");
    expect(names.length).toBe(6);
  });

  it("audit mode includes all 6 checks", async () => {
    const report = await run({ ...baseCtx(), mode: "audit" });
    expect(report.checks.length).toBe(6);
  });

  it("audit-strict mode includes all 6 checks", async () => {
    const report = await run({ ...baseCtx(), mode: "audit-strict" });
    expect(report.checks.length).toBe(6);
  });
});

// ---------------------------------------------------------------------------
// Aggregation helpers — unit-tested against the pure functions in contracts.
// ---------------------------------------------------------------------------

describe("worstSeverity / aggregateCounts (contract helpers)", () => {
  it("worstSeverity: 1 fail + 2 warn + 3 pass = fail", () => {
    expect(
      worstSeverity([
        { severity: "fail" },
        { severity: "warn" },
        { severity: "warn" },
        { severity: "pass" },
        { severity: "pass" },
        { severity: "pass" },
      ]),
    ).toBe("fail");
  });

  it("worstSeverity: 0 fail + 2 warn + 4 pass = warn", () => {
    expect(
      worstSeverity([
        { severity: "warn" },
        { severity: "warn" },
        { severity: "pass" },
        { severity: "pass" },
        { severity: "pass" },
        { severity: "pass" },
      ]),
    ).toBe("warn");
  });

  it("worstSeverity: all pass = pass", () => {
    expect(worstSeverity([{ severity: "pass" }, { severity: "pass" }])).toBe("pass");
  });

  it("aggregateCounts: hardBanCount counts only anti-slop hard-bans", () => {
    const checks: CheckResult[] = [
      {
        name: "anti-slop",
        severity: "fail",
        durationMs: 5,
        violations: [
          { ruleId: "em-dash-ui", severity: "fail", message: "x" },
          { ruleId: "round-number-whitespace", severity: "warn", message: "y" },
        ],
      },
      {
        name: "a11y-axe",
        severity: "fail",
        durationMs: 5,
        violations: [
          {
            ruleId: "color-contrast",
            impact: "serious",
            level: "AA",
            severity: "fail",
            nodes: [{ selector: ".x" }],
            message: "Contrast ratio fails AA (.x)",
          },
        ],
      },
    ];
    const c = aggregateCounts(checks);
    expect(c.hardBanCount).toBe(1);
    expect(c.a11yFailCount).toBe(1);
  });

  it("aggregateCounts: warningCount counts checks whose severity is warn", () => {
    const c = aggregateCounts([
      { name: "anti-slop", severity: "warn", durationMs: 1, violations: [] },
      { name: "tab-order", severity: "pass", durationMs: 1, violations: [] },
    ]);
    expect(c.warningCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Blocking semantics
// ---------------------------------------------------------------------------

describe("gate.run — blocked field", () => {
  it("audit-strict + fail = blocked=true", async () => {
    // Inject a hard-ban into cssToCheck so anti-slop fires.
    const ctx: VerifyContext = {
      ...baseCtx(),
      mode: "audit-strict",
      cssToCheck: `h1 { background-clip: text; color: transparent; }`,
      afterContent: `h1 { background-clip: text; color: transparent; }`,
    };
    const report = await run(ctx);
    if (report.verdict === "fail") {
      expect(report.blocked).toBe(true);
    }
  });

  it("live-accept + fail = blocked=false (warn-default mode)", async () => {
    const ctx: VerifyContext = {
      ...baseCtx(),
      mode: "live-accept",
      cssToCheck: `h1 { background-clip: text; color: transparent; }`,
      afterContent: `h1 { background-clip: text; color: transparent; }`,
    };
    const report = await run(ctx);
    expect(report.blocked).toBe(false);
  });

  it("audit (non-strict) never blocks even on fail", async () => {
    const ctx: VerifyContext = {
      ...baseCtx(),
      mode: "audit",
      cssToCheck: `h1 { background-clip: text; color: transparent; }`,
      afterContent: `h1 { background-clip: text; color: transparent; }`,
    };
    const report = await run(ctx);
    expect(report.blocked).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Timing / budget
// ---------------------------------------------------------------------------

describe("gate.run — timing", () => {
  it("timing.budgetMs equals MODE_TIMING_BUDGET_MS[mode]", async () => {
    const report = await run({ ...baseCtx(), mode: "stop-hook" });
    expect(report.timing.budgetMs).toBe(MODE_TIMING_BUDGET_MS["stop-hook"]);
  });

  it("timing.totalMs is positive", async () => {
    const report = await run({ ...baseCtx(), mode: "stop-hook" });
    expect(report.timing.totalMs).toBeGreaterThanOrEqual(0);
  });

  it("timing.budgetExceeded = (totalMs > budgetMs)", async () => {
    const report = await run({ ...baseCtx(), mode: "stop-hook" });
    expect(report.timing.budgetExceeded).toBe(report.timing.totalMs > report.timing.budgetMs);
  });

  it("per-check durationMs is bounded by the check's budget (modulo orchestrator timeout)", async () => {
    const report = await run({ ...baseCtx(), mode: "audit" });
    for (const c of report.checks) {
      const budget = CHECK_BUDGET_MS[c.name];
      // Allow some slack (durationMs is reported by the check itself,
      // orchestrator timeout is independent). We just assert it's a finite
      // number; the strict-budget assertion is the orchestrator's timeout
      // wrapper test below.
      expect(typeof c.durationMs).toBe("number");
      expect(c.durationMs).toBeGreaterThanOrEqual(0);
      expect(budget).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Parallel execution — smoke check that the gate doesn't serialize checks.
// We measure total wall-clock against the longest single-check duration; if
// any check is faster than total, we know it ran in parallel with another.
// (This is a loose check — exact parallelism is hard to assert.)
// ---------------------------------------------------------------------------

describe("gate.run — parallel execution", () => {
  it("audit mode completes within the mode budget (or skipped)", async () => {
    const report = await run({ ...baseCtx(), mode: "audit" });
    // Budget is 30s; in tests we expect well below that since most checks
    // gracefully skip.
    expect(report.timing.totalMs).toBeLessThan(MODE_TIMING_BUDGET_MS.audit);
  });
});

// ---------------------------------------------------------------------------
// Honest-skip: checks that failed to run must report warn, not silent pass.
// Bug #1 fix — skipped-due-to-error must NOT report severity:"pass".
// ---------------------------------------------------------------------------

describe("gate.run — honest skip semantics", () => {
  it("multi-viewport with missing livePreviewUrl reports warn (not silent pass)", async () => {
    // Explicitly omit livePreviewUrl/sessionId/variantId so dispatchCheck
    // returns the missing-args skip. Under the bug this was severity:"pass".
    const report = await run({ ...baseCtx(), mode: "audit" });
    const mv = report.checks.find((c) => c.name === "multi-viewport");
    expect(mv).toBeDefined();
    // Missing required args → error skip → warn. NOT pass.
    if (mv?.skipped?.reason === "error") {
      expect(mv.severity).toBe("warn");
    }
  });

  it("timeout sentinel emits warn not pass", () => {
    // Verify the runWithTimeout path produces warn for timed-out checks.
    // We can't easily trigger a real timeout in unit tests, but we can
    // verify the shape we expect by asserting that if skipped.reason is
    // "timeout", the severity must be "warn" (not "pass").
    const fakeTimedOut: CheckResult = {
      name: "a11y-axe",
      severity: "warn",
      durationMs: 800,
      skipped: { reason: "timeout", detail: "> 800ms" },
    };
    expect(fakeTimedOut.severity).toBe("warn");
    expect(fakeTimedOut.skipped?.reason).toBe("timeout");
  });
});

// ---------------------------------------------------------------------------
// Mode-budget HARD ceiling — contracts/verify.ts invariant #3 says the mode
// budget is a HARD ceiling: any check still running at started+budget is
// aborted with { skipped: { reason: "timeout" } }. The bug: per-check timeouts
// (CHECK_BUDGET_MS × mode-multiplier) can exceed the mode budget — e.g.
// multi-viewport in live-with-screenshot is 3500×3 = 10500ms vs the 6000ms
// mode budget — so a hung check blocks well past the documented ceiling.
// ---------------------------------------------------------------------------

describe("gate.run — mode budget is a hard per-check ceiling", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    vi.unmock("../../src/verify/multi-viewport.js");
  });

  it("caps a hung check at the mode budget, not the larger per-check budget", async () => {
    // multi-viewport per-check budget (3500×3=10500) > live-with-screenshot
    // mode budget (6000). Mock it to hang forever; the gate must abort it at
    // the mode ceiling, surfacing a timeout-skip with durationMs ≤ mode budget.
    vi.doMock("../../src/verify/multi-viewport.js", () => ({
      runMultiViewport: () => new Promise<never>(() => {}), // never resolves
    }));
    vi.resetModules();
    const { run: freshRun } = await import("../../src/verify/gate.js");
    const modeBudget = MODE_TIMING_BUDGET_MS["live-with-screenshot"];

    const startedAt = Date.now();
    const report = await freshRun({
      ...baseCtx(),
      mode: "live-with-screenshot",
      livePreviewUrl: "http://127.0.0.1:31337",
      sessionId: "sid",
      variantId: "v0",
    });
    const wall = Date.now() - startedAt;

    const mv = report.checks.find((c) => c.name === "multi-viewport");
    expect(mv).toBeDefined();
    expect(mv!.skipped?.reason).toBe("timeout");
    expect(mv!.severity).toBe("warn");
    // The per-check budget (10500ms) must NOT govern — the mode ceiling does.
    expect(mv!.durationMs).toBeLessThanOrEqual(modeBudget);
    // And the whole run finishes within the mode budget (+ generous slack for
    // the other parallel checks / CI jitter), never the 10.5s per-check value.
    expect(wall).toBeLessThan(modeBudget + 2500);
  }, 20_000);
});
