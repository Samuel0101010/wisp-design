// wisp-design — Phase 4 vault → skills sync tests.

import { afterEach, describe, expect, it } from "vitest";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runSync, syncFromVault } from "../../src/agent/sync.js";
import type { SyncSource } from "../../src/contracts/agent.js";

function captureStdio(): {
  stdout: string[];
  stderr: string[];
  restore: () => void;
} {
  const out: string[] = [];
  const err: string[] = [];
  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);
  process.stdout.write = ((chunk: string | Uint8Array) => {
    out.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
    return true;
  }) as typeof process.stdout.write;
  process.stderr.write = ((chunk: string | Uint8Array) => {
    err.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
    return true;
  }) as typeof process.stderr.write;
  return {
    stdout: out,
    stderr: err,
    restore: () => {
      process.stdout.write = origOut;
      process.stderr.write = origErr;
    },
  };
}

const tmpDirs: string[] = [];
function makeTmpDir(prefix: string): string {
  const d = mkdtempSync(join(tmpdir(), prefix));
  tmpDirs.push(d);
  return d;
}

afterEach(() => {
  while (tmpDirs.length > 0) {
    const d = tmpDirs.pop();
    if (d !== undefined) {
      try {
        rmSync(d, { recursive: true, force: true });
      } catch {
        // best-effort
      }
    }
  }
});

// Build a default SyncSource. Helper avoids repeating boilerplate.
function makeSource(fromPath: string, extras?: Partial<SyncSource>): SyncSource {
  return {
    fromPath,
    patterns: ["**/*.md"],
    destination: "skills/data/patterns/",
    ...extras,
  };
}

describe("syncFromVault — happy path + filtering", () => {
  it("copies 3 .md files (copiedCount=3)", async () => {
    const vault = makeTmpDir("wisp-vault-");
    const project = makeTmpDir("wisp-proj-");
    writeFileSync(join(vault, "a.md"), "# a\n", "utf8");
    writeFileSync(join(vault, "b.md"), "# b\n", "utf8");
    writeFileSync(join(vault, "c.md"), "# c\n", "utf8");

    const result = await syncFromVault(makeSource(vault), {
      projectRoot: project,
      index: false,
    });
    expect(result.copiedCount).toBe(3);
    expect(result.files.length).toBe(3);
    expect(result.skippedCount).toBe(0);
  });

  it("empty source → copiedCount 0", async () => {
    const vault = makeTmpDir("wisp-vault-");
    const project = makeTmpDir("wisp-proj-");
    const result = await syncFromVault(makeSource(vault), {
      projectRoot: project,
      index: false,
    });
    expect(result.copiedCount).toBe(0);
    expect(result.files).toEqual([]);
  });

  it("pattern `**/*.md` recurses into sub-folders", async () => {
    const vault = makeTmpDir("wisp-vault-");
    const project = makeTmpDir("wisp-proj-");
    writeFileSync(join(vault, "top.md"), "# top\n", "utf8");
    mkdirSync(join(vault, "sub", "deeper"), { recursive: true });
    writeFileSync(join(vault, "sub", "child.md"), "# child\n", "utf8");
    writeFileSync(join(vault, "sub", "deeper", "grand.md"), "# grand\n", "utf8");

    const result = await syncFromVault(makeSource(vault), {
      projectRoot: project,
      index: false,
    });
    expect(result.copiedCount).toBe(3);
    // Destination paths preserve the sub-folder structure.
    expect(
      result.files.some((p) => p.replace(/\\/g, "/").endsWith("sub/deeper/grand.md")),
    ).toBe(true);
  });

  it("pattern `top-only/*.md` is flat — does not descend", async () => {
    const vault = makeTmpDir("wisp-vault-");
    const project = makeTmpDir("wisp-proj-");
    mkdirSync(join(vault, "top-only"), { recursive: true });
    writeFileSync(join(vault, "top-only", "flat.md"), "# flat\n", "utf8");
    mkdirSync(join(vault, "top-only", "sub"), { recursive: true });
    writeFileSync(join(vault, "top-only", "sub", "deep.md"), "# deep\n", "utf8");

    const result = await syncFromVault(
      makeSource(vault, { patterns: ["top-only/*.md"] }),
      { projectRoot: project, index: false },
    );
    expect(result.copiedCount).toBe(1);
    expect(
      result.files.some((p) => p.replace(/\\/g, "/").endsWith("top-only/flat.md")),
    ).toBe(true);
  });

  it("idempotent re-run — second run has skippedCount > 0", async () => {
    const vault = makeTmpDir("wisp-vault-");
    const project = makeTmpDir("wisp-proj-");
    writeFileSync(join(vault, "a.md"), "# a\n", "utf8");
    writeFileSync(join(vault, "b.md"), "# b\n", "utf8");

    const first = await syncFromVault(makeSource(vault), {
      projectRoot: project,
      index: false,
    });
    expect(first.copiedCount).toBe(2);
    expect(first.skippedCount).toBe(0);

    const second = await syncFromVault(makeSource(vault), {
      projectRoot: project,
      index: false,
    });
    expect(second.copiedCount).toBe(0);
    expect(second.skippedCount).toBe(2);
  });
});

describe("syncFromVault — attribution frontmatter", () => {
  it("source without frontmatter → frontmatter prepended", async () => {
    const vault = makeTmpDir("wisp-vault-");
    const project = makeTmpDir("wisp-proj-");
    writeFileSync(join(vault, "raw.md"), "# raw heading\nbody.\n", "utf8");

    const result = await syncFromVault(
      makeSource(vault, {
        attribution: { owner: "Samuel H.", license: "MIT" },
      }),
      { projectRoot: project, index: false },
    );
    expect(result.copiedCount).toBe(1);
    const dest = result.files[0];
    expect(dest).toBeDefined();
    if (dest !== undefined) {
      const written = readFileSync(dest, "utf8");
      expect(written.startsWith("---\n")).toBe(true);
      expect(written).toContain("attribution:");
      expect(written).toContain('owner: "Samuel H."');
      expect(written).toContain('license: "MIT"');
      // Body is preserved beneath the frontmatter.
      expect(written).toContain("# raw heading");
    }
  });

  it("source already has frontmatter → NOT prepended (idempotent)", async () => {
    const vault = makeTmpDir("wisp-vault-");
    const project = makeTmpDir("wisp-proj-");
    const existing = "---\ntitle: keep\n---\n\n# already\n";
    writeFileSync(join(vault, "fm.md"), existing, "utf8");

    const result = await syncFromVault(
      makeSource(vault, {
        attribution: { owner: "Samuel H.", license: "MIT" },
      }),
      { projectRoot: project, index: false },
    );
    expect(result.copiedCount).toBe(1);
    const dest = result.files[0];
    expect(dest).toBeDefined();
    if (dest !== undefined) {
      const written = readFileSync(dest, "utf8");
      // No second frontmatter block was injected; the original is intact.
      expect(written).toBe(existing);
      expect(written).not.toContain("attribution:");
    }
  });

  it("no attribution arg → no frontmatter changes regardless of source state", async () => {
    const vault = makeTmpDir("wisp-vault-");
    const project = makeTmpDir("wisp-proj-");
    writeFileSync(join(vault, "raw.md"), "# raw\nbody.\n", "utf8");

    const result = await syncFromVault(makeSource(vault), {
      projectRoot: project,
      index: false,
    });
    const dest = result.files[0];
    expect(dest).toBeDefined();
    if (dest !== undefined) {
      const written = readFileSync(dest, "utf8");
      expect(written).toBe("# raw\nbody.\n");
    }
  });
});

describe("syncFromVault — error paths", () => {
  it("source path does not exist → throws", async () => {
    const project = makeTmpDir("wisp-proj-");
    await expect(
      syncFromVault(makeSource("/this/does/not/exist/anywhere"), {
        projectRoot: project,
        index: false,
      }),
    ).rejects.toThrow(/source path does not exist/);
  });

  it("source path is a file not directory → throws", async () => {
    const vault = makeTmpDir("wisp-vault-");
    const project = makeTmpDir("wisp-proj-");
    const filePath = join(vault, "file.md");
    writeFileSync(filePath, "# x\n", "utf8");

    await expect(
      syncFromVault(makeSource(filePath), {
        projectRoot: project,
        index: false,
      }),
    ).rejects.toThrow(/is not a directory/);
  });

  it("`index: false` → indexedInAgentDb stays false (Phase-4 contract)", async () => {
    const vault = makeTmpDir("wisp-vault-");
    const project = makeTmpDir("wisp-proj-");
    writeFileSync(join(vault, "a.md"), "# a\n", "utf8");
    const result = await syncFromVault(makeSource(vault), {
      projectRoot: project,
      index: false,
    });
    expect(result.indexedInAgentDb).toBe(false);
  });
});

describe("runSync CLI", () => {
  it("`--from <vault>` with attribution flags → exit 0", async () => {
    const vault = makeTmpDir("wisp-vault-");
    const project = makeTmpDir("wisp-proj-");
    writeFileSync(join(vault, "a.md"), "# a\n", "utf8");
    writeFileSync(join(vault, "b.md"), "# b\n", "utf8");

    const cap = captureStdio();
    let code = 99;
    const prev = process.cwd();
    process.chdir(project);
    try {
      code = await runSync([
        "--from",
        vault,
        "--no-index",
        "--attribution-owner",
        "Samuel H.",
        "--attribution-license",
        "MIT",
      ]);
    } finally {
      cap.restore();
      process.chdir(prev);
    }
    expect(code).toBe(0);
    const parsed = JSON.parse(cap.stdout.join(""));
    expect(parsed.copiedCount).toBe(2);
    expect(existsSync(join(project, "skills/data/patterns/a.md"))).toBe(true);
  });

  it("missing --from → exit 2 BAD_FLAG", async () => {
    const cap = captureStdio();
    let code = 99;
    try {
      code = await runSync([]);
    } finally {
      cap.restore();
    }
    expect(code).toBe(2);
    expect(cap.stderr.join("")).toMatch(/BAD_FLAG/);
  });

  it("source is a file, not a directory → exit 1 SYNC_FAILED", async () => {
    const vault = makeTmpDir("wisp-vault-");
    const project = makeTmpDir("wisp-proj-");
    const filePath = join(vault, "lonely.md");
    writeFileSync(filePath, "# x\n", "utf8");

    const cap = captureStdio();
    let code = 99;
    const prev = process.cwd();
    process.chdir(project);
    try {
      code = await runSync(["--from", filePath, "--no-index"]);
    } finally {
      cap.restore();
      process.chdir(prev);
    }
    expect(code).toBe(1);
    expect(cap.stderr.join("")).toMatch(/SYNC_FAILED|not a directory/);
  });

  it("only --attribution-owner (no license) → exit 2", async () => {
    const vault = makeTmpDir("wisp-vault-");
    const project = makeTmpDir("wisp-proj-");
    writeFileSync(join(vault, "a.md"), "# a\n", "utf8");

    const cap = captureStdio();
    let code = 99;
    const prev = process.cwd();
    process.chdir(project);
    try {
      code = await runSync([
        "--from",
        vault,
        "--attribution-owner",
        "S.H.",
      ]);
    } finally {
      cap.restore();
      process.chdir(prev);
    }
    expect(code).toBe(2);
    expect(cap.stderr.join("")).toMatch(/BAD_FLAG|attribution/);
  });
});
