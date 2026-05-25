// wisp-design — stop-hook Windows git-timeout tests (Phase 6.5).
//
// Verifies that when execFileSync throws ETIMEDOUT the dispatcher:
//   1. exits 0 (never blocks the user)
//   2. writes a one-line warning to stderr
//   3. does NOT call the anti-slop linter
//
// We test the observable contract via the exported `runHook` function with
// child_process.execFileSync mocked.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// We need to mock child_process.execFileSync BEFORE the dispatcher loads it.
// Vitest's module-mock hoisting handles this when vi.mock is called at the
// top level. We intercept via unstable_mockModule for ESM compatibility.
// ---------------------------------------------------------------------------

// Capture stderr writes for assertions.
const stderrWrites: string[] = [];
const originalStderrWrite = process.stderr.write.bind(process.stderr);

// Track whether the anti-slop linter was imported (proxy: module resolution
// of anti-slop-linter). We do this by mocking the dynamic import path used
// in the dispatcher.
let antiSlopCalled = false;

// ---------------------------------------------------------------------------
// ETIMEDOUT error factory — replicates what Node throws when execFileSync
// times out (SpawnSyncReturns where signal is null and the error is exposed
// through the thrown Error).
// ---------------------------------------------------------------------------

function makeEtimedout(): Error {
  const err = new Error("spawnSync git ETIMEDOUT") as NodeJS.ErrnoException;
  err.code = "ETIMEDOUT";
  return err;
}

// ---------------------------------------------------------------------------
// We test stopHookGitChangedFiles indirectly by running the full hook and
// observing the stderr + exit code. Mock child_process module.
// ---------------------------------------------------------------------------

vi.mock("node:child_process", () => {
  return {
    execFileSync: vi.fn(),
  };
});

// Also mock the anti-slop linter so we can verify it was NOT called.
vi.mock("../../src/verify/anti-slop-linter.js", () => {
  return {
    runAntiSlopOnFiles: vi.fn(() => {
      antiSlopCalled = true;
      return Promise.resolve({ name: "anti-slop", severity: "pass", durationMs: 0, violations: [] });
    }),
    formatBlockMessage: vi.fn(() => ""),
    formatWarnMessage: vi.fn(() => ""),
  };
});

describe("stop-hook: git ETIMEDOUT → graceful skip", async () => {
  const childProcess = await import("node:child_process");
  const { runHook } = await import("../../src/hooks/dispatcher.js");

  beforeEach(() => {
    stderrWrites.length = 0;
    antiSlopCalled = false;
    // Spy on stderr.write to capture output.
    vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      stderrWrites.push(typeof chunk === "string" ? chunk : chunk.toString());
      return true;
    });
    // Spy on stdin to avoid real TTY reads — return empty immediately.
    vi.spyOn(process.stdin, Symbol.asyncIterator as never).mockImplementation(
      // eslint-disable-next-line @typescript-eslint/require-await
      async function* () {
        // yield nothing — simulates no stdin input
      } as never,
    );
    Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("exits 0 when git times out", async () => {
    (childProcess.execFileSync as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw makeEtimedout();
    });

    const code = await runHook("stop");
    expect(code).toBe(0);
  });

  it("writes timeout warning to stderr", async () => {
    (childProcess.execFileSync as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw makeEtimedout();
    });

    await runHook("stop");

    const combined = stderrWrites.join("");
    expect(combined).toMatch(/stop-hook git read timed out/);
  });

  it("does NOT call anti-slop linter when git times out", async () => {
    (childProcess.execFileSync as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw makeEtimedout();
    });

    antiSlopCalled = false;
    await runHook("stop");

    expect(antiSlopCalled).toBe(false);
  });

  it("exits 0 when git is not found (not a repo)", async () => {
    const notFoundErr = new Error("git: command not found") as NodeJS.ErrnoException;
    notFoundErr.code = "ENOENT";
    (childProcess.execFileSync as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw notFoundErr;
    });

    const code = await runHook("stop");
    expect(code).toBe(0);
  });

  it("does NOT write ETIMEDOUT warning when error is ENOENT (not a timeout)", async () => {
    const notFoundErr = new Error("git: command not found") as NodeJS.ErrnoException;
    notFoundErr.code = "ENOENT";
    (childProcess.execFileSync as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw notFoundErr;
    });

    await runHook("stop");

    const combined = stderrWrites.join("");
    expect(combined).not.toMatch(/stop-hook git read timed out/);
  });

  it("returns files when git succeeds", async () => {
    (childProcess.execFileSync as ReturnType<typeof vi.fn>).mockReturnValue(
      "src/components/Button.tsx\nstyles/main.css\n",
    );

    // Just verify the hook runs without error when git succeeds.
    const code = await runHook("stop");
    expect(code).toBe(0);
    // No timeout warning emitted.
    const combined = stderrWrites.join("");
    expect(combined).not.toMatch(/timed out/);
  });
});

// ---------------------------------------------------------------------------
// Non-stop hooks — verify they still exit 0 regardless of git state
// ---------------------------------------------------------------------------

describe("non-stop hooks: drain-and-exit-0 (unaffected by git timeout fix)", async () => {
  const { runHook } = await import("../../src/hooks/dispatcher.js");

  beforeEach(() => {
    Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });
  });

  it("user-prompt-submit exits 0", async () => {
    expect(await runHook("user-prompt-submit")).toBe(0);
  });

  it("post-tool-use exits 0", async () => {
    expect(await runHook("post-tool-use")).toBe(0);
  });

  it("session-end exits 0", async () => {
    expect(await runHook("session-end")).toBe(0);
  });

  it("unknown hook exits 0", async () => {
    expect(await runHook("unknown-future-hook")).toBe(0);
  });
});
