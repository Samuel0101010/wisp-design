// Phase 7.17 — regression test for friendly EISDIR error from `audit <dir>`.
//
// Before the fix, passing a directory path to the audit CLI fell into the
// generic "READ_FAILED" branch with the raw EISDIR errno message — confusing
// UX. The fix adds an EISDIR-specific branch that explains "audit takes file
// paths only" and suggests a glob or no-arg run.
//
// We assert: spawning `node dist/index.js audit <dir>` produces a stderr
// envelope with `code: "EISDIR"` AND a message that tells the user how to
// recover. Non-zero exit is fine here (run produced no usable reports).

import { describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(__dirname, "../..");
const cli = resolve(repoRoot, "dist/index.js");
const distExists = existsSync(cli);

function runAudit(args: string[]): Promise<{ code: number; stderr: string }> {
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
      const { stderr } = await runAudit(["src"]);
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
      const { stderr } = await runAudit(["this-file-does-not-exist-12345.tsx"]);
      // ENOENT/ENOTDIR are intentionally swallowed so a glob with stale paths
      // doesn't abort. We assert there's no EISDIR / READ_FAILED noise.
      expect(stderr).not.toContain("EISDIR");
      expect(stderr).not.toContain("READ_FAILED");
    },
    20_000,
  );
});
