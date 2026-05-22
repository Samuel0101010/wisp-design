// wisp-design — Phase 1 path-traversal edge cases.
//
// Companion to auth.test.ts. Focuses on tricky inputs that don't fit cleanly
// into the 5-rule grouping there: mixed separators, unicode, segments-in-the-
// middle, normalize edge cases.

import { afterAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { guardPath } from "../../src/bridge/auth.js";

const root = mkdtempSync(join(tmpdir(), "wisp-pt-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

describe("path-traversal edge cases", () => {
  it("mixed separators foo/bar\\baz → ok (normalize handles it)", () => {
    const r = guardPath("foo/bar\\baz", root);
    expect(r.ok).toBe(true);
  });

  it("trailing slash src/foo/ → ok", () => {
    const r = guardPath("src/foo/", root);
    expect(r.ok).toBe(true);
  });

  it("doubled slashes src//foo → ok", () => {
    const r = guardPath("src//foo", root);
    expect(r.ok).toBe(true);
  });

  it("`.` segments src/./foo → ok", () => {
    const r = guardPath("src/./foo", root);
    expect(r.ok).toBe(true);
  });

  it("unicode filename srcüü/fooß → ok", () => {
    const r = guardPath("srcüü/fooß", root);
    expect(r.ok).toBe(true);
  });

  it("long path (500 chars) → ok, no crash", () => {
    const longSegment = "a".repeat(500);
    // Don't crash; result may be ok (path doesn't exist, harmless).
    expect(() => guardPath(longSegment, root)).not.toThrow();
    const r = guardPath(longSegment, root);
    expect(r.ok).toBe(true);
  });

  it("`..` mid-path that normalizes to clean inner path → ok", () => {
    const r = guardPath("foo/../bar", root);
    expect(r.ok).toBe(true);
  });

  it(".git/ as mid-segment → FORBIDDEN (segment-match, not just top-level)", () => {
    const r = guardPath("foo/.git/bar", root);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("FORBIDDEN");
  });

  it("node_modules/ as mid-segment → FORBIDDEN", () => {
    const r = guardPath("apps/web/node_modules/pkg", root);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("FORBIDDEN");
  });

  it(".env in subdir → FORBIDDEN", () => {
    const r = guardPath("config/.env", root);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("FORBIDDEN");
  });

  it("filename containing 'env' but not matching .env* → ok", () => {
    // "environment.ts" is a real codebase file. .env-prefix check must not
    // bleed into legitimate filenames.
    const r = guardPath("src/environment.ts", root);
    expect(r.ok).toBe(true);
  });
});
