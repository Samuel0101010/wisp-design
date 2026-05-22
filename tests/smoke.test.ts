// Phase 0 smoke test: verify the doctor passes against the live repo scaffold.
// This is the contract that Phase 1 builds on top of.

import { describe, expect, it } from "vitest";
import { runDoctor } from "../src/cli/doctor.js";

describe("doctor (Phase 0 gate)", () => {
  it("returns exit code 0 against the current repo", async () => {
    const result = await runDoctor({ cwd: process.cwd(), fix: false });
    const failures = result.checks.filter((c) => c.status === "fail");
    expect(failures, JSON.stringify(failures, null, 2)).toEqual([]);
    expect(result.exitCode).toBe(0);
  });

  it("flags missing dist/", async () => {
    // Use a clearly nonexistent cwd — every check should fail. We're testing
    // that the doctor doesn't crash on missing files, just reports them.
    const result = await runDoctor({ cwd: "/nonexistent-path-xyz", fix: false });
    expect(result.exitCode).toBe(1);
    expect(result.checks.some((c) => c.status === "fail")).toBe(true);
  });
});
