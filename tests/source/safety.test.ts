// wisp-design — Phase 3 safety-gate contract tests.
//
// Pins all 8 rules in src/source/safety.ts in their declared order and the
// happy-path return shape. Fixtures live in os.tmpdir(); each describe block
// owns its own tmpDir and cleans up in afterAll.

import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from "vitest";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { detectEol, safetyCheck } from "../../src/source/safety.js";

const IS_WINDOWS = process.platform === "win32";

function makeRoot(): string {
  return mkdtempSync(join(tmpdir(), "wisp-safety-"));
}

function cleanup(dir: string): void {
  try {
    if (!IS_WINDOWS) {
      // Restore writability on POSIX read-only fixture so rm can proceed.
      try {
        chmodSync(dir, 0o755);
      } catch {
        // ignore
      }
    }
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // best-effort cleanup
  }
}

describe("safetyCheck — Rule 1: PATH_OUTSIDE_ROOT", () => {
  let root: string;
  beforeAll(() => {
    root = makeRoot();
  });
  afterAll(() => cleanup(root));

  it("empty path → PATH_OUTSIDE_ROOT", async () => {
    const r = await safetyCheck("", root);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("PATH_OUTSIDE_ROOT");
  });

  it("relative `..` segment → PATH_OUTSIDE_ROOT", async () => {
    const r = await safetyCheck("../escape.tsx", root);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("PATH_OUTSIDE_ROOT");
  });

  it("absolute path outside root → PATH_OUTSIDE_ROOT", async () => {
    // Pick a path that's definitely not inside `root`.
    const outside = IS_WINDOWS
      ? "C:\\Windows\\System32\\drivers\\etc\\hosts"
      : "/etc/passwd";
    const r = await safetyCheck(outside, root);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("PATH_OUTSIDE_ROOT");
  });
});

describe("safetyCheck — Rule 2: SYMLINK_ESCAPE", () => {
  let root: string;
  let outside: string;
  beforeAll(() => {
    root = makeRoot();
    outside = mkdtempSync(join(tmpdir(), "wisp-safety-outside-"));
    writeFileSync(join(outside, "target.tsx"), "export const x = 1;\n", "utf8");
  });
  afterAll(() => {
    cleanup(root);
    cleanup(outside);
  });

  it("symlink that resolves outside root → SYMLINK_ESCAPE (skip on Windows w/o admin)", async () => {
    const linkPath = join(root, "link.tsx");
    try {
      symlinkSync(join(outside, "target.tsx"), linkPath);
    } catch {
      // On Windows without admin / dev-mode privilege we can't create
      // symlinks. Skip the assertion in that case.
      return;
    }
    const r = await safetyCheck(linkPath, root);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("SYMLINK_ESCAPE");
  });
});

describe("safetyCheck — Rule 3: REFUSE_LIST_MATCH", () => {
  let root: string;
  beforeAll(() => {
    root = makeRoot();
    mkdirSync(join(root, "node_modules", "foo"), { recursive: true });
    writeFileSync(join(root, "node_modules", "foo", "x.tsx"), "x", "utf8");

    mkdirSync(join(root, "src", ".git"), { recursive: true });
    writeFileSync(join(root, "src", ".git", "config"), "x", "utf8");

    mkdirSync(join(root, "dist"), { recursive: true });
    writeFileSync(join(root, "dist", "out.tsx"), "x", "utf8");

    writeFileSync(join(root, "foo.generated.tsx"), "x", "utf8");
  });
  afterAll(() => cleanup(root));

  it("node_modules/foo.tsx → REFUSE_LIST_MATCH", async () => {
    const r = await safetyCheck(
      join(root, "node_modules", "foo", "x.tsx"),
      root,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("REFUSE_LIST_MATCH");
  });

  it("src/.git/config → REFUSE_LIST_MATCH", async () => {
    const r = await safetyCheck(join(root, "src", ".git", "config"), root);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("REFUSE_LIST_MATCH");
  });

  it("dist/out.tsx → REFUSE_LIST_MATCH", async () => {
    const r = await safetyCheck(join(root, "dist", "out.tsx"), root);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("REFUSE_LIST_MATCH");
  });

  it("foo.generated.tsx → REFUSE_LIST_MATCH", async () => {
    const r = await safetyCheck(join(root, "foo.generated.tsx"), root);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("REFUSE_LIST_MATCH");
  });

  // REGRESSION — NTFS is case-insensitive, so `.NEXT`, `DIST`, `Node_Modules`,
  // and `.GIT` all reference the same on-disk dirs the refuse-list protects.
  // path.resolve preserves the caller's casing on Windows, so without the `/i`
  // flag these mixed-case paths bypassed the guard and the engine would write
  // into build output / generated dirs / .git internals.
  const MIXED_CASE_REFUSED: ReadonlyArray<readonly [string, string]> = [
    [".NEXT", join(".NEXT", "index.html")],
    ["DIST", join("DIST", "out.tsx")],
    ["Node_Modules", join("Node_Modules", "foo", "x.tsx")],
  ];
  for (const [label, rel] of MIXED_CASE_REFUSED) {
    it(`mixed-case ${label} → REFUSE_LIST_MATCH (NTFS case-insensitive bypass)`, async () => {
      const r = await safetyCheck(join(root, rel), root);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("REFUSE_LIST_MATCH");
    });
  }

  it("mixed-case .GIT/config → REFUSE_LIST_MATCH", async () => {
    const r = await safetyCheck(join(root, "src", ".GIT", "config"), root);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("REFUSE_LIST_MATCH");
  });
});

describe("safetyCheck — Rule 4: UNSUPPORTED_FILE_TYPE", () => {
  let root: string;
  beforeAll(() => {
    root = makeRoot();
    writeFileSync(join(root, "foo.png"), "x", "utf8");
    writeFileSync(join(root, "foo.txt"), "x", "utf8");
  });
  afterAll(() => cleanup(root));

  it("foo.png → UNSUPPORTED_FILE_TYPE w/ agent-driven fallback", async () => {
    const r = await safetyCheck(join(root, "foo.png"), root);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("UNSUPPORTED_FILE_TYPE");
      expect(r.error.suggestedFallback).toBe("agent-driven");
    }
  });

  it("foo.txt → UNSUPPORTED_FILE_TYPE", async () => {
    const r = await safetyCheck(join(root, "foo.txt"), root);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("UNSUPPORTED_FILE_TYPE");
  });
});

describe("safetyCheck — Rule 5: FILE_TOO_LARGE", () => {
  let root: string;
  beforeAll(() => {
    root = makeRoot();
    // 1 MB + 1 byte.
    const big = "a".repeat(1_048_577);
    writeFileSync(join(root, "huge.tsx"), big, "utf8");
  });
  afterAll(() => cleanup(root));

  it("> 1 MB file → FILE_TOO_LARGE w/ agent-driven fallback", async () => {
    const r = await safetyCheck(join(root, "huge.tsx"), root);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("FILE_TOO_LARGE");
      expect(r.error.suggestedFallback).toBe("agent-driven");
    }
  });
});

describe("safetyCheck — Rule 6: BINARY_FILE", () => {
  let root: string;
  beforeAll(() => {
    root = makeRoot();
    // .tsx extension but NULL byte in the first 512.
    const buf = Buffer.concat([
      Buffer.from("export const x = '", "utf8"),
      Buffer.from([0x00]),
      Buffer.from("';\n", "utf8"),
    ]);
    writeFileSync(join(root, "bin.tsx"), buf);
  });
  afterAll(() => cleanup(root));

  it("file with NULL byte in head → BINARY_FILE", async () => {
    const r = await safetyCheck(join(root, "bin.tsx"), root);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("BINARY_FILE");
  });
});

describe("safetyCheck — Rule 7: GENERATED_MAGIC_COMMENT", () => {
  let root: string;
  beforeAll(() => {
    root = makeRoot();
    writeFileSync(
      join(root, "gen.tsx"),
      "// @generated by codegen — do not edit\nexport const x = 1;\n",
      "utf8",
    );
  });
  afterAll(() => cleanup(root));

  it("file starting with `// @generated` → GENERATED_MAGIC_COMMENT w/ manual fallback", async () => {
    const r = await safetyCheck(join(root, "gen.tsx"), root);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("GENERATED_MAGIC_COMMENT");
      expect(r.error.suggestedFallback).toBe("manual");
    }
  });
});

describe("safetyCheck — Rule 8: READ_ONLY_FILE", () => {
  let root: string;
  let readonlyPath: string;
  beforeAll(() => {
    root = makeRoot();
    readonlyPath = join(root, "ro.tsx");
    writeFileSync(readonlyPath, "export const x = 1;\n", "utf8");
    try {
      // POSIX read-only. On Windows ACLs differ; skip the assertion below if
      // chmod doesn't actually flip writability.
      chmodSync(readonlyPath, 0o444);
    } catch {
      // ignore
    }
  });
  afterAll(() => {
    try {
      chmodSync(readonlyPath, 0o644);
    } catch {
      // ignore
    }
    cleanup(root);
  });

  it("read-only file → READ_ONLY_FILE (skip on Windows where chmod is a no-op)", async () => {
    const r = await safetyCheck(readonlyPath, root);
    if (IS_WINDOWS) {
      // chmod 0o444 on Windows often doesn't actually make file read-only via
      // fs.accessSync — accept either outcome.
      if (!r.ok) {
        expect(r.error.code).toBe("READ_ONLY_FILE");
      } else {
        expect(r.ok).toBe(true);
      }
      return;
    }
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("READ_ONLY_FILE");
  });
});

describe("safetyCheck — happy path + EOL detection", () => {
  let root: string;
  beforeAll(() => {
    root = makeRoot();
    writeFileSync(join(root, "lf.tsx"), "const x = 1;\nconst y = 2;\n", "utf8");
    writeFileSync(
      join(root, "crlf.tsx"),
      "const x = 1;\r\nconst y = 2;\r\n",
      "utf8",
    );
    writeFileSync(join(root, "empty.html"), "", "utf8");
  });
  afterAll(() => cleanup(root));

  it("valid .tsx → ok + fileType=tsx + eol=`\\n`", async () => {
    const r = await safetyCheck(join(root, "lf.tsx"), root);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.fileType).toBe("tsx");
      expect(r.eolConvention).toBe("\n");
      // resolved path is absolute
      expect(resolve(r.filePath)).toBe(r.filePath);
    }
  });

  it("valid CRLF .tsx → ok + eol=`\\r\\n`", async () => {
    const r = await safetyCheck(join(root, "crlf.tsx"), root);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.eolConvention).toBe("\r\n");
  });

  it("empty .html → ok + eol defaults to `\\n`", async () => {
    const r = await safetyCheck(join(root, "empty.html"), root);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.fileType).toBe("html");
      expect(r.eolConvention).toBe("\n");
    }
  });
});

describe("detectEol — first-newline-run wins", () => {
  it("empty content → \\n", () => {
    expect(detectEol("")).toBe("\n");
  });
  it("no-newline content → \\n", () => {
    expect(detectEol("abc")).toBe("\n");
  });
  it("LF-first → \\n", () => {
    expect(detectEol("abc\ndef\r\n")).toBe("\n");
  });
  it("CRLF-first → \\r\\n", () => {
    expect(detectEol("abc\r\ndef\n")).toBe("\r\n");
  });
  it("bare-CR-first → \\r", () => {
    expect(detectEol("abc\rdef")).toBe("\r");
  });
});
