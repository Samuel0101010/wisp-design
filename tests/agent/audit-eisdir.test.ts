// Phase 7.17 — regression test for friendly EISDIR error from `audit <dir>`.
//
// Before the fix, passing a directory path to the audit CLI fell into the
// generic "READ_FAILED" branch with the raw EISDIR errno message — confusing
// UX. The fix adds an EISDIR-specific branch that explains "audit takes file
// paths only" and suggests a glob or no-arg run.
//
// Fix-Spec #6: an EISDIR (or unreadable) explicit path that produced ZERO
// usable reports must NOT exit 0 — a `wisp-design audit ./components` (a dir)
// that audited nothing while printing an error must fail a CI gate. The fix
// returns a non-zero exit when an explicit path hit a HARD read error, while
// ENOENT/ENOTDIR (stale glob entries) still silently skip with exit 0.
//
// We assert (in-process, via runAudit) the exact exit-code contract, AND
// (via the dist CLI when present) the friendly stderr envelope.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { runAudit } from "../../src/agent/audit.js";

const repoRoot = resolve(__dirname, "../..");
const cli = resolve(repoRoot, "dist/index.js");
const distExists = existsSync(cli);

function spawnAudit(args: string[]): Promise<{ code: number; stderr: string }> {
  return new Promise((resolveP) => {
    const child = spawn(process.execPath, [cli, "audit", ...args], {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("close", (code) => {
      resolveP({ code: code ?? -1, stderr });
    });
  });
}

describe("audit CLI / EISDIR friendly error", () => {
  it.skipIf(!distExists)(
    "directory path emits EISDIR-coded error with recovery hint",
    async () => {
      const { stderr } = await spawnAudit(["src"]);
      // Find the JSON envelope line in stderr (writeError writes one per line).
      const lines = stderr
        .split("\n")
        .filter((l) => l.trim().startsWith("{") && l.includes("error"));
      const eisdirLine = lines.find((l) => l.includes("EISDIR"));
      expect(eisdirLine, `expected an EISDIR envelope in stderr; got:\n${stderr}`).toBeDefined();
      const parsed = JSON.parse(eisdirLine!);
      expect(parsed.error.code).toBe("EISDIR");
      expect(parsed.error.message).toMatch(/is a directory/);
      // Recovery hint: explicitly mention file-only OR a fallback path.
      expect(parsed.error.message).toMatch(/file paths|files only|fall back/i);
    },
    20_000,
  );

  it.skipIf(!distExists)(
    "non-existent file silently skips (no envelope, exit 0)",
    async () => {
      const { code, stderr } = await spawnAudit(["this-file-does-not-exist-12345.tsx"]);
      // ENOENT/ENOTDIR are intentionally swallowed so a glob with stale paths
      // doesn't abort. We assert there's no EISDIR / READ_FAILED noise and a
      // clean exit 0 (stale glob entries must not fail the gate).
      expect(stderr).not.toContain("EISDIR");
      expect(stderr).not.toContain("READ_FAILED");
      expect(code).toBe(0);
    },
    20_000,
  );
});

// In-process exit-code contract (Fix-Spec #6). Runs runAudit() directly so the
// assertions exercise the current source, not a possibly-stale dist/ build.
describe("audit / runAudit exit-code on unauditable explicit paths", () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "wisp-audit-eisdir-"));
  });
  afterEach(() => {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      /* best-effort */
    }
  });

  async function withCwd<T>(dir: string, fn: () => Promise<T>): Promise<T> {
    const prev = process.cwd();
    process.chdir(dir);
    try {
      return await fn();
    } finally {
      process.chdir(prev);
    }
  }

  async function quiet<T>(fn: () => Promise<T>): Promise<T> {
    const o = process.stdout.write.bind(process.stdout);
    const e = process.stderr.write.bind(process.stderr);
    process.stdout.write = (() => true) as typeof process.stdout.write;
    process.stderr.write = (() => true) as typeof process.stderr.write;
    try {
      return await fn();
    } finally {
      process.stdout.write = o;
      process.stderr.write = e;
    }
  }

  it("a directory arg produces zero reports → non-zero exit (no silent CI pass)", async () => {
    // `root` itself is a directory; passing it as the only explicit path must
    // not return EXIT_OK while having audited nothing.
    const code = await withCwd(root, () => quiet(() => runAudit([root])));
    expect(code).not.toBe(0);
  });

  it("only a non-existent (ENOENT) explicit file → exit 0 (stale glob silently skips)", async () => {
    const code = await withCwd(root, () =>
      quiet(() => runAudit(["does-not-exist-98765.tsx"])),
    );
    expect(code).toBe(0);
  });
});
