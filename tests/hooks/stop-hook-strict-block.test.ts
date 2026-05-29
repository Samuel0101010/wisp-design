// wisp-design — stop-hook strict-mode hard-block tests (cli-core fix-spec).
//
// Findings #1 + #2 from .fix-specs/cli-core.md:
//
//   #1 The strict-mode Stop block MUST emit Claude Code's Stop-hook contract
//      { decision: "block", reason: "..." } — NOT the PreToolUse
//      permissionDecision/message shape, which the Stop event silently ignores.
//
//   #2 The anti-slop budget clock MUST be re-anchored AFTER the git read so
//      git startup latency (147-271ms on Windows) does not consume the
//      linter's 50ms inner budget and short-circuit the per-file loop to zero
//      reads. The dispatcher must hand the linter a FRESH budget start.
//
// We mock git to return a changed file AND to burn >50ms (the old inner
// budget) before returning. With the old code the linter's per-file loop
// breaks on iteration 0 (zero reads, severity "pass") so NO block fires.
// With the fix it reads the file under the remaining ceiling and blocks.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SLOW_GIT_DELAY_MS = 70; // > ANTI_SLOP_LINTER_BUDGET_MS (50)

// Capture stdout/stderr writes for assertions.
const stdoutWrites: string[] = [];
const stderrWrites: string[] = [];

// Track how the linter was invoked.
let antiSlopCallCount = 0;
let lastBudgetStartedAt: number | undefined;
let lastPerCallBudgetMs: number | undefined;

vi.mock("node:child_process", () => ({ execFileSync: vi.fn() }));

// The linter mock asserts the dispatcher's budget hand-off: it records the
// opts it received and (crucially) only "fails" if its own budget window has
// NOT already expired by the time it runs — exactly the behaviour the real
// linter's per-file loop has. With the pre-fix code budgetStartedAt is the
// pre-git timestamp, so `Date.now() - budgetStartedAt` already exceeds the
// 50ms default and the file loop would be skipped → no violations.
vi.mock("../../src/verify/anti-slop-linter.js", () => ({
  runAntiSlopOnFiles: vi.fn(
    (
      _files: string[],
      opts: { budgetStartedAt?: number; perCallBudgetMs?: number },
    ) => {
      antiSlopCallCount += 1;
      lastBudgetStartedAt = opts.budgetStartedAt;
      lastPerCallBudgetMs = opts.perCallBudgetMs;
      const base = opts.budgetStartedAt ?? Date.now();
      const budget = opts.perCallBudgetMs ?? 50;
      // Mirror the real per-file loop guard: if the budget is already blown,
      // read nothing → pass with no violations.
      if (Date.now() - base > budget) {
        return Promise.resolve({
          name: "anti-slop",
          severity: "pass",
          durationMs: 0,
          violations: [],
        });
      }
      return Promise.resolve({
        name: "anti-slop",
        severity: "fail",
        durationMs: 0,
        violations: [
          {
            ruleId: "purple-blue-gradient",
            severity: "fail",
            message: "purple→blue gradient detected",
            location: { cssSnippet: "Hero.tsx: bg-gradient" },
          },
        ],
      });
    },
  ),
  formatBlockMessage: vi.fn(
    (hits: { ruleId: string }[]) =>
      `wisp-design anti-slop blocked: ${hits.length} hard-ban — ${hits
        .map((h) => h.ruleId)
        .join(", ")}`,
  ),
  formatWarnMessage: vi.fn(
    (hits: { ruleId: string }[]) =>
      `wisp-design anti-slop warn: ${hits.length} finding`,
  ),
}));

describe("stop-hook strict-mode hard-block (findings #1 + #2)", async () => {
  const childProcess = await import("node:child_process");
  const { runHook } = await import("../../src/hooks/dispatcher.js");

  beforeEach(() => {
    stdoutWrites.length = 0;
    stderrWrites.length = 0;
    antiSlopCallCount = 0;
    lastBudgetStartedAt = undefined;
    lastPerCallBudgetMs = undefined;

    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      stdoutWrites.push(typeof chunk === "string" ? chunk : chunk.toString());
      return true;
    });
    vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      stderrWrites.push(typeof chunk === "string" ? chunk : chunk.toString());
      return true;
    });
    Object.defineProperty(process.stdin, "isTTY", {
      value: true,
      configurable: true,
    });

    // git returns one changed UI file but burns >50ms first — emulating
    // Windows git startup overhead that consumes the old (pre-git-anchored)
    // inner budget.
    (childProcess.execFileSync as ReturnType<typeof vi.fn>).mockImplementation(
      () => {
        const until = Date.now() + SLOW_GIT_DELAY_MS;
        // Busy-wait: execFileSync is synchronous, so its cost lands on the
        // same clock the dispatcher's pre-git timestamp was captured against.
        while (Date.now() < until) {
          /* burn wall-clock to simulate git startup latency */
        }
        return "src/components/Hero.tsx\n";
      },
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.WISP_DESIGN_STRICT;
  });

  it("emits { decision: 'block', reason } (Stop contract, not permissionDecision)", async () => {
    process.env.WISP_DESIGN_STRICT = "1";

    const code = await runHook("stop");
    expect(code).toBe(0);

    const out = stdoutWrites.join("").trim();
    expect(out.length).toBeGreaterThan(0);
    const parsed = JSON.parse(out) as Record<string, unknown>;
    // Finding #1: must be the Stop-hook shape.
    expect(parsed.decision).toBe("block");
    expect(typeof parsed.reason).toBe("string");
    expect((parsed.reason as string).length).toBeGreaterThan(0);
    // The PreToolUse shape must NOT be used.
    expect(parsed.permissionDecision).toBeUndefined();
    expect(parsed.message).toBeUndefined();
  });

  it("hands the linter a FRESH budget anchored after the git read (finding #2)", async () => {
    process.env.WISP_DESIGN_STRICT = "1";

    await runHook("stop");

    // The linter ran exactly once.
    expect(antiSlopCallCount).toBe(1);
    // The budget anchor must be AFTER the slow git read, i.e. it must not be
    // already-expired relative to the per-call budget. With the pre-fix code
    // budgetStartedAt is the pre-git timestamp, so by the time the linter runs
    // `Date.now() - budgetStartedAt` already exceeds the budget.
    expect(lastBudgetStartedAt).toBeDefined();
    const budget = lastPerCallBudgetMs ?? 50;
    expect(Date.now() - lastBudgetStartedAt!).toBeLessThan(budget);
  });

  it("non-strict mode warns on stderr and emits no block JSON", async () => {
    delete process.env.WISP_DESIGN_STRICT;

    const code = await runHook("stop");
    expect(code).toBe(0);
    expect(stdoutWrites.join("").trim()).toBe("");
    expect(stderrWrites.join("")).toMatch(/wisp-design anti-slop warn/);
  });
});
