// wisp-design — `wisp-design live --help` (Phase 7, Task #18).
//
// Verifies that runLive(["--help"]) / runLive(["-h"]):
//   - Returns exit code 0 (EXIT_OK).
//   - Writes "Usage:" to stdout.
//   - Writes "Options:" to stdout.
//   - Does NOT attempt to boot the bridge (no network activity).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runLive } from "../../src/agent/live.js";

describe("runLive --help / -h", () => {
  let stdoutChunks: string[];

  beforeEach(() => {
    stdoutChunks = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
      stdoutChunks.push(typeof chunk === "string" ? chunk : String(chunk));
      return true;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns exit code 0 for --help", async () => {
    const code = await runLive(["--help"]);
    expect(code).toBe(0);
  });

  it("returns exit code 0 for -h", async () => {
    const code = await runLive(["-h"]);
    expect(code).toBe(0);
  });

  it("writes Usage: to stdout for --help", async () => {
    await runLive(["--help"]);
    const output = stdoutChunks.join("");
    expect(output).toContain("Usage:");
  });

  it("writes Options: to stdout for --help", async () => {
    await runLive(["--help"]);
    const output = stdoutChunks.join("");
    expect(output).toContain("Options:");
  });

  it("writes --inject and --strict to stdout", async () => {
    await runLive(["--help"]);
    const output = stdoutChunks.join("");
    expect(output).toContain("--inject");
    expect(output).toContain("--strict");
  });

  it("writes Usage: to stdout for -h", async () => {
    await runLive(["-h"]);
    const output = stdoutChunks.join("");
    expect(output).toContain("Usage:");
  });

  it("does not boot the bridge for --help", async () => {
    // If the bridge booted it would attempt to bind a port; in a test context
    // that would succeed but take time. The guard is: startBridgeServer must
    // NOT be called. We verify indirectly by confirming the function returns
    // quickly (< 200 ms) and returns 0.
    const start = Date.now();
    const code = await runLive(["--help"]);
    const elapsed = Date.now() - start;
    expect(code).toBe(0);
    expect(elapsed).toBeLessThan(200);
  });

  it("includes example snippets in the help output", async () => {
    await runLive(["--help"]);
    const output = stdoutChunks.join("");
    expect(output).toContain("Examples:");
  });
});
