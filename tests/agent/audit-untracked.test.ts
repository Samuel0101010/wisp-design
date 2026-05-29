// wisp-design — regression test for the default changed-files audit mode.
//
// Bug (Fix-Spec #4): with no explicit paths, `wisp-design audit` falls back to
// `git diff HEAD --name-only`, which lists only TRACKED modifications. A
// brand-new (untracked) UI file — the file MOST likely to contain freshly
// generated slop — was silently skipped, so the documented pre-commit gate
// returned EXIT_OK "nothing to check" despite an unaudited hard-ban file.
//
// The fix unions `git ls-files --others --exclude-standard` (untracked,
// gitignore-respecting) into the changed-files set. This test seeds a real git
// repo with a committed clean file plus an untracked .css containing the
// gradient-text hard-ban and asserts `audit --mode strict` blocks (exit 1).

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runAudit } from "../../src/agent/audit.js";

let root: string;

function git(args: string[]): void {
  execFileSync("git", args, { cwd: root, encoding: "utf8" });
}

// Silence stdout/stderr for the duration of an async runner call so the test
// report stays clean.
async function quiet<T>(fn: () => Promise<T>): Promise<T> {
  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);
  process.stdout.write = (() => true) as typeof process.stdout.write;
  process.stderr.write = (() => true) as typeof process.stderr.write;
  try {
    return await fn();
  } finally {
    process.stdout.write = origOut;
    process.stderr.write = origErr;
  }
}

async function withCwd<T>(dir: string, fn: () => Promise<T>): Promise<T> {
  const prev = process.cwd();
  process.chdir(dir);
  try {
    return await fn();
  } finally {
    process.chdir(prev);
  }
}

// Gradient-text hard-ban (background-clip:text + transparent + gradient).
const SLOP_CSS = `h1 { background-clip: text; color: transparent; background: linear-gradient(#7c3aed,#2563eb); }`;

describe("audit — default changed-files mode includes untracked files", () => {
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "wisp-audit-untracked-"));
    git(["init"]);
    git(["config", "user.email", "test@example.com"]);
    git(["config", "user.name", "Test"]);
    // A committed, clean UI file so HEAD exists and `git diff HEAD` has a base.
    writeFileSync(join(root, "clean.css"), `.ok { color: #111; padding: 8px; }`, "utf8");
    git(["add", "clean.css"]);
    git(["commit", "-m", "init", "--no-gpg-sign"]);
  });

  afterEach(() => {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      /* best-effort */
    }
  });

  it("untracked .css with a hard-ban blocks `audit --mode strict` (exit 1)", async () => {
    // Brand-new file the user just created — NOT yet `git add`-ed. `git diff
    // HEAD --name-only` omits it; `git ls-files --others` lists it.
    writeFileSync(join(root, "NewComponent.css"), SLOP_CSS, "utf8");

    const code = await withCwd(root, () => quiet(() => runAudit(["--mode", "strict"])));
    expect(code).toBe(1);
  });

  it("no untracked files + clean HEAD → nothing to check (exit 0)", async () => {
    // Sanity: with nothing changed and nothing untracked, the gate still
    // legitimately returns 0.
    const code = await withCwd(root, () => quiet(() => runAudit(["--mode", "strict"])));
    expect(code).toBe(0);
  });
});
