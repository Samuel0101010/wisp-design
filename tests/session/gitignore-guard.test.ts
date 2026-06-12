// wisp-design — Phase 7.16 Reload-Guard tests.
//
// `.wisp/` MUST land in the host project's .gitignore before the first session
// log write: Tailwind v4 content detection scans non-gitignored files, so each
// JSONL append otherwise triggers a Vite full-reload that kills the browser's
// `generating` state (root-caused 2026-06-12 against a Vite 6 + Tailwind v4
// host app). These tests pin the guard: created, appended, idempotent,
// existing-entry respected, best-effort on failure.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  ensureWispGitignored,
  resetGitignoreGuardForTest,
  sessionLogger,
} from "../../src/session/logger.js";

function makeRoot(): string {
  return mkdtempSync(join(tmpdir(), "wisp-gitignore-"));
}

function cleanup(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* best-effort */
  }
}

describe("ensureWispGitignored — Reload-Guard", () => {
  let root: string;

  beforeEach(() => {
    root = makeRoot();
    resetGitignoreGuardForTest();
  });

  afterEach(() => {
    cleanup(root);
  });

  it("creates .gitignore with a .wisp entry when none exists", async () => {
    await ensureWispGitignored(root);
    const gi = readFileSync(join(root, ".gitignore"), "utf8");
    expect(gi).toMatch(/^\.wisp$/m);
  });

  it("appends .wisp to an existing .gitignore without clobbering it", async () => {
    writeFileSync(join(root, ".gitignore"), "node_modules\ndist\n", "utf8");
    await ensureWispGitignored(root);
    const gi = readFileSync(join(root, ".gitignore"), "utf8");
    expect(gi).toMatch(/^node_modules$/m);
    expect(gi).toMatch(/^dist$/m);
    expect(gi).toMatch(/^\.wisp$/m);
  });

  it("is idempotent — a covered .gitignore is left untouched", async () => {
    writeFileSync(join(root, ".gitignore"), "node_modules\n.wisp\n", "utf8");
    await ensureWispGitignored(root);
    resetGitignoreGuardForTest(); // force a re-check against the same root
    await ensureWispGitignored(root);
    const gi = readFileSync(join(root, ".gitignore"), "utf8");
    expect(gi.match(/^\.wisp$/gm)).toHaveLength(1);
  });

  it("recognises the `/.wisp/` spelling as covered", async () => {
    writeFileSync(join(root, ".gitignore"), "/.wisp/\n", "utf8");
    await ensureWispGitignored(root);
    const gi = readFileSync(join(root, ".gitignore"), "utf8");
    expect(gi.match(/wisp/g)).toHaveLength(1);
  });

  it("fires on the session-logger write path (first append guards)", async () => {
    await sessionLogger.logConfigure(
      "guard-session",
      { targetId: "div.x", freeText: "guard" },
      { projectRoot: root },
    );
    expect(existsSync(join(root, ".gitignore"))).toBe(true);
    const gi = readFileSync(join(root, ".gitignore"), "utf8");
    expect(gi).toMatch(/^\.wisp$/m);
  });
});
