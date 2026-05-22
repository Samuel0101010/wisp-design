// wisp-design — Bridge auth & path-traversal guard (Phase 1).
//
// Implements `AuthModule` from src/contracts/bridge.ts. Three pure functions,
// no shared mutable state, all node-builtin dependencies.
//
// Defense in depth:
//  - tokens: UUIDv4 + format-check + length-check + timing-safe compare
//  - paths: 5-rule guard (absolute / ..-segment / prefix / symlink / hard-deny)
//
// Spec source: docs/bridge-api.md § "Path Traversal Rules".

import { randomUUID, timingSafeEqual } from "node:crypto";
import { realpathSync } from "node:fs";
import { isAbsolute, normalize, resolve, sep } from "node:path";

import type { AuthError, AuthModule } from "../contracts/bridge.js";

// UUIDv4 (loose: also matches non-v4 UUIDs — sufficient for shape-validation;
// real entropy comes from `randomUUID` on the issuing side).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Windows file-systems are case-insensitive; Linux/macOS may be sensitive.
// We hard-deny segments regardless of platform — use case-insensitive match
// on Windows so `NODE_MODULES` aliases can't slip past, sensitive on POSIX.
const IS_WINDOWS = process.platform === "win32";

// ---------------------------------------------------------------------------
// generateToken
// ---------------------------------------------------------------------------

export function generateToken(): string {
  return randomUUID();
}

// ---------------------------------------------------------------------------
// validateToken — constant-time compare, defensive against missing/wrong-type.
// ---------------------------------------------------------------------------

function authError(code: AuthError["code"], message: string, detail?: unknown): AuthError {
  return detail !== undefined ? { code, message, detail } : { code, message };
}

export function validateToken(
  provided: string | undefined,
  expected: string,
): { ok: true } | { ok: false; error: AuthError } {
  if (provided === undefined || provided === null || provided === "") {
    return { ok: false, error: authError("UNAUTHORIZED", "missing token") };
  }
  if (typeof provided !== "string") {
    return { ok: false, error: authError("MALFORMED_TOKEN", "token must be a string") };
  }
  if (!UUID_RE.test(provided)) {
    return { ok: false, error: authError("MALFORMED_TOKEN", "token is not a valid UUID") };
  }

  // Length-mismatch short-circuit: NOT a malformed-token signal (the provided
  // value is well-formed by shape), just a wrong token. Avoid leaking length
  // info via different error codes.
  if (provided.length !== expected.length) {
    return { ok: false, error: authError("UNAUTHORIZED", "invalid token") };
  }

  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  // Buffer.from of equal-length strings yields equal-length buffers; guard
  // anyway because timingSafeEqual throws on length mismatch.
  if (a.length !== b.length) {
    return { ok: false, error: authError("UNAUTHORIZED", "invalid token") };
  }
  if (!timingSafeEqual(a, b)) {
    return { ok: false, error: authError("UNAUTHORIZED", "invalid token") };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// guardPath — 5-rule traversal guard per docs/bridge-api.md.
// ---------------------------------------------------------------------------

function denyPath(
  requested: string,
  message: string,
  code: AuthError["code"] = "PATH_TRAVERSAL",
): { ok: false; error: AuthError } {
  return {
    ok: false,
    error: authError(code, message, { requested }),
  };
}

function hasParentSegment(normalized: string): boolean {
  // Use both separators because normalize on Windows may leave `..` against
  // either `/` or `\`. Splitting on both is cheap and bulletproof.
  const parts = normalized.split(/[\\/]/);
  return parts.includes("..");
}

function startsWithRoot(absPath: string, rootWithSep: string, root: string): boolean {
  // Equal to root → allowed (caller may want to list the root itself, though
  // currently we don't expose that). Otherwise must be a strict descendant.
  if (absPath === root) return true;
  if (IS_WINDOWS) {
    return absPath.toLowerCase().startsWith(rootWithSep.toLowerCase());
  }
  return absPath.startsWith(rootWithSep);
}

function violatesHardDeny(absPath: string): string | null {
  // Build a normalized form for matching. We need to match path segments,
  // not arbitrary substrings, so wrap with separators on both ends and
  // search for `<sep>SEGMENT<sep>`.
  const probe = IS_WINDOWS ? absPath.toLowerCase() : absPath;
  const s = sep;
  const padded = `${probe}${s}`;

  // .git directory (segment match — not a basename containing ".git").
  if (padded.includes(`${s}.git${s}`)) {
    return "git internals are off-limits";
  }
  // node_modules directory.
  if (padded.includes(`${s}node_modules${s}`)) {
    return "node_modules is off-limits";
  }
  // .wisp/sessions directory (private session logs).
  if (padded.includes(`${s}.wisp${s}sessions${s}`)) {
    return "session logs are private";
  }
  // .env* basename — `.env`, `.env.local`, `.env.production`, etc.
  // Match the final segment after the last separator.
  const lastSepIdx = absPath.lastIndexOf(sep);
  const basename = lastSepIdx >= 0 ? absPath.slice(lastSepIdx + 1) : absPath;
  const basenameProbe = IS_WINDOWS ? basename.toLowerCase() : basename;
  if (basenameProbe === ".env" || basenameProbe.startsWith(".env.")) {
    return "environment files are off-limits";
  }

  return null;
}

export function guardPath(
  requestedPath: string,
  projectRoot: string,
): { ok: true; resolved: string } | { ok: false; error: AuthError } {
  // Empty / non-string defensive guard. Empty path canonicalizes to "." which
  // would resolve to projectRoot itself — reject explicitly so callers don't
  // accidentally serve a directory listing.
  if (typeof requestedPath !== "string" || requestedPath === "") {
    return denyPath(String(requestedPath), "empty path");
  }

  // Rule 1: reject absolute paths (POSIX `/foo`, Windows `C:\...`).
  if (isAbsolute(requestedPath)) {
    return denyPath(requestedPath, "absolute paths are not allowed");
  }

  // Rule 2: normalize, then reject if any `..` segment remains.
  const normalized = normalize(requestedPath);
  if (hasParentSegment(normalized)) {
    return denyPath(requestedPath, "`..` segments are not allowed");
  }
  // After normalization a pure `..` becomes `..`; a `.` becomes `.` — both
  // would resolve back to projectRoot. The `.` case is harmless (handled by
  // Rule 3's equality branch), but `..` was caught above.

  // Rule 3: resolve against the root and require strict-descendant prefix.
  // Note: we resolve projectRoot too so caller passing a relative root still
  // produces an absolute prefix for comparison.
  const absRoot = resolve(projectRoot);
  const joined = resolve(absRoot, normalized);
  const rootWithSep = absRoot.endsWith(sep) ? absRoot : `${absRoot}${sep}`;
  if (!startsWithRoot(joined, rootWithSep, absRoot)) {
    return denyPath(requestedPath, "resolved path escapes project root");
  }

  // Rule 5 (run before Rule 4 because hard-deny is cheap and pre-existing
  // file existence isn't required): hard-deny on path segments.
  const denyReason = violatesHardDeny(joined);
  if (denyReason !== null) {
    return {
      ok: false,
      error: authError("FORBIDDEN", denyReason, { requested: requestedPath }),
    };
  }

  // Rule 4: realpath check for symlink-escape. If the file doesn't exist yet
  // (ENOENT) we accept — read endpoints will 404 naturally. Any other fs
  // error (EACCES, etc.) is treated as a 404-equivalent: we still let the
  // caller try and let fs.readFile produce the real error.
  try {
    const real = realpathSync(joined);
    if (!startsWithRoot(real, rootWithSep, absRoot)) {
      return denyPath(requestedPath, "symlink target escapes project root");
    }
    // Also re-check hard-deny against the realpath (a symlink could point at
    // node_modules even if the requested name doesn't).
    const realDeny = violatesHardDeny(real);
    if (realDeny !== null) {
      return {
        ok: false,
        error: authError("FORBIDDEN", realDeny, { requested: requestedPath }),
      };
    }
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "ENOENT" && code !== "ENOTDIR") {
      // Unknown fs error — don't leak details, just allow the joined path
      // through; the read endpoint will produce its own 404.
    }
    // ENOENT: file not present yet → allow; the read endpoint owns 404.
  }

  return { ok: true, resolved: joined };
}

// ---------------------------------------------------------------------------
// AuthModule export for ergonomic single-import wiring in bridge/server.ts.
// ---------------------------------------------------------------------------

export const authModule: AuthModule = { generateToken, validateToken, guardPath };
