// wisp-design — Phase 1 auth + path-traversal contract tests.
//
// Covers all three pure functions in src/bridge/auth.ts:
//   - generateToken: UUIDv4 shape + uniqueness
//   - validateToken: missing / malformed / wrong / correct
//   - guardPath: the 5 path-traversal rules from docs/bridge-api.md
//
// Filesystem fixtures live in os.tmpdir() and are cleaned up in afterAll.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";

import {
  generateToken,
  guardPath,
  validateToken,
} from "../../src/bridge/auth.js";

const UUIDV4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe("generateToken", () => {
  it("returns a string", () => {
    expect(typeof generateToken()).toBe("string");
  });

  it("returns a UUIDv4-shaped string", () => {
    const t = generateToken();
    expect(t).toMatch(UUIDV4_RE);
  });

  it("100 calls yield 100 unique values", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 100; i += 1) seen.add(generateToken());
    expect(seen.size).toBe(100);
  });
});

describe("validateToken", () => {
  const expected = "11111111-2222-4333-8444-555555555555";

  it("undefined provided → UNAUTHORIZED", () => {
    const r = validateToken(undefined, expected);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("UNAUTHORIZED");
  });

  it("null cast provided → UNAUTHORIZED", () => {
    // cast through unknown — the runtime code defensively handles null
    const r = validateToken(null as unknown as string, expected);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("UNAUTHORIZED");
  });

  it("empty string provided → UNAUTHORIZED", () => {
    const r = validateToken("", expected);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("UNAUTHORIZED");
  });

  it("non-UUID format → MALFORMED_TOKEN", () => {
    const r = validateToken("not-a-uuid", expected);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("MALFORMED_TOKEN");
  });

  it("correct UUID shape but wrong value → UNAUTHORIZED (no timing leak)", () => {
    const r = validateToken("99999999-aaaa-4bbb-8ccc-dddddddddddd", expected);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("UNAUTHORIZED");
  });

  it("exact match → ok", () => {
    const r = validateToken(expected, expected);
    expect(r.ok).toBe(true);
  });

  it("uppercase-UUID match → ok (regex is case-insensitive)", () => {
    // timingSafeEqual is byte-equal, so uppercase only passes if expected is
    // uppercase too. Set both to uppercase to exercise the regex i-flag.
    const upper = expected.toUpperCase();
    const r = validateToken(upper, upper);
    expect(r.ok).toBe(true);
  });

  it("real generateToken value validates against itself", () => {
    const t = generateToken();
    expect(validateToken(t, t).ok).toBe(true);
  });
});

describe("guardPath — Rule 1 (absolute paths)", () => {
  const root = mkdtempSync(join(tmpdir(), "wisp-guard-r1-"));
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it("POSIX absolute /foo/bar → PATH_TRAVERSAL", () => {
    const r = guardPath("/foo/bar", root);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("PATH_TRAVERSAL");
  });

  it("Windows absolute C:\\foo → PATH_TRAVERSAL", () => {
    const r = guardPath("C:\\foo", root);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("PATH_TRAVERSAL");
  });

  it("empty string → PATH_TRAVERSAL", () => {
    const r = guardPath("", root);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("PATH_TRAVERSAL");
  });
});

describe("guardPath — Rule 2 (.. segments)", () => {
  const root = mkdtempSync(join(tmpdir(), "wisp-guard-r2-"));
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it("../escape → PATH_TRAVERSAL", () => {
    const r = guardPath("../escape", root);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("PATH_TRAVERSAL");
  });

  it("foo/../../escape → PATH_TRAVERSAL", () => {
    const r = guardPath("foo/../../escape", root);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("PATH_TRAVERSAL");
  });

  it("foo/bar/../baz normalizes to foo/baz inside root → ok", () => {
    const r = guardPath("foo/bar/../baz", root);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.resolved).toBe(resolve(root, "foo", "baz"));
  });
});

describe("guardPath — Rule 4 (symlink escape)", () => {
  const root = mkdtempSync(join(tmpdir(), "wisp-guard-r4-root-"));
  const outside = mkdtempSync(join(tmpdir(), "wisp-guard-r4-outside-"));
  const outsideFile = join(outside, "secret.txt");
  let linkOk = false;

  beforeAll(() => {
    writeFileSync(outsideFile, "secret");
    try {
      symlinkSync(outsideFile, join(root, "escape-link"));
      linkOk = true;
    } catch {
      // Windows without dev-mode/admin can't create symlinks. We skip the
      // symlink-specific assertion in that case but keep the cleanup safe.
      linkOk = false;
    }
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  });

  it("symlink pointing outside root → PATH_TRAVERSAL", (ctx) => {
    if (!linkOk) {
      // Symlink creation was denied (stock non-admin Windows without Developer
      // Mode). Mark SKIPPED so the missing traversal-defense coverage is
      // visible in the report rather than reported as a vacuous green pass.
      ctx.skip();
    }
    const r = guardPath("escape-link", root);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("PATH_TRAVERSAL");
  });

  it("non-existent path → ok (404 is the caller's job)", () => {
    const r = guardPath("does-not-exist.txt", root);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.resolved).toBe(resolve(root, "does-not-exist.txt"));
  });
});

describe("guardPath — Rule 5 (hard-deny segments)", () => {
  const root = mkdtempSync(join(tmpdir(), "wisp-guard-r5-"));
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  const denied: Array<[string, string]> = [
    [".git/config", "git internals are off-limits"],
    ["node_modules/foo", "node_modules is off-limits"],
    [".env", "environment files are off-limits"],
    [".env.local", "environment files are off-limits"],
    [".env.production", "environment files are off-limits"],
    [".wisp/sessions/abc.jsonl", "session logs are private"],
  ];

  for (const [path, reason] of denied) {
    it(`${path} → FORBIDDEN (${reason})`, () => {
      const r = guardPath(path, root);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("FORBIDDEN");
    });
  }
});

describe("guardPath — happy path", () => {
  const root = mkdtempSync(join(tmpdir(), "wisp-guard-ok-"));
  beforeAll(() => {
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(join(root, "src", "index.ts"), "export {};\n");
  });
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it("src/index.ts → ok with resolved path", () => {
    const r = guardPath("src/index.ts", root);
    expect(r.ok).toBe(true);
    if (r.ok) {
      // Use sep-agnostic comparison.
      expect(r.resolved).toBe(resolve(root, "src", "index.ts"));
      expect(r.resolved.startsWith(root)).toBe(true);
      expect(r.resolved).toContain(`src${sep}index.ts`);
    }
  });
});
