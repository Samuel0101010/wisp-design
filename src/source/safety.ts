// wisp-design — Source-edit-engine safety gate (Phase 3).
//
// Implements `SafetyModule` from src/contracts/source.ts. `safetyCheck` is
// the FIRST call on every accept/discard/inject path; no other source-edit
// module trusts its `filePath` argument. Mirror of `bridge/auth.ts`
// `guardPath` — defense in depth, no shortcuts. Eight rules, fixed order.
// First failing rule decides the `suggestedFallback`.
//
// Rule ordering (cheap → expensive, refuse as early as possible so we never
// open a file we shouldn't touch):
//   1. PATH_OUTSIDE_ROOT      — pure-string path-traversal defense.
//   2. SYMLINK_ESCAPE         — realpath re-check (skip if file doesn't exist).
//   3. REFUSE_LIST_MATCH      — build / generated / .git dirs we won't rewrite.
//   4. UNSUPPORTED_FILE_TYPE  — extension must be in SUPPORTED_EXTENSIONS.
//   5. FILE_TOO_LARGE         — > 1 MB → defer to agent-driven freeform Edit.
//   6. BINARY_FILE            — NULL byte in first 512 bytes.
//   7. GENERATED_MAGIC_COMMENT — `@generated` in first 200 bytes (codegen).
//   8. READ_ONLY_FILE         — fs.access W_OK fails.

import {
  accessSync,
  constants as fsConstants,
  openSync,
  closeSync,
  readSync,
  realpathSync,
  statSync,
} from "node:fs";
import { extname, isAbsolute, normalize, resolve, sep } from "node:path";

import {
  GENERATED_MAGIC_COMMENT_REGEX,
  MAX_SOURCE_FILE_BYTES,
  REFUSE_LIST,
  SUPPORTED_EXTENSIONS,
  type EolConvention,
  type SafetyError,
  type SafetyModule,
  type SafetyResult,
  type SourceFileType,
} from "../contracts/source.js";

// ---------------------------------------------------------------------------
// detectEol — first newline run in the buffer wins. CRLF MUST be tested
// before LF so `\r\n` isn't mis-classified as `\n`. No newline → default `\n`.
// ---------------------------------------------------------------------------

export function detectEol(content: string): EolConvention {
  for (let i = 0; i < content.length; i++) {
    const ch = content.charCodeAt(i);
    if (ch === 0x0d /* \r */) {
      if (i + 1 < content.length && content.charCodeAt(i + 1) === 0x0a /* \n */) {
        return "\r\n";
      }
      return "\r";
    }
    if (ch === 0x0a /* \n */) {
      return "\n";
    }
  }
  return "\n";
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const IS_WINDOWS = process.platform === "win32";

function makeError(
  code: SafetyError["code"],
  message: string,
  suggestedFallback: NonNullable<SafetyError["suggestedFallback"]>,
  detail?: Record<string, unknown>,
): { ok: false; error: SafetyError } {
  const error: SafetyError = { code, message, suggestedFallback };
  if (detail !== undefined) error.detail = detail;
  return { ok: false, error };
}

// Path-prefix check. Windows case-insensitive; POSIX sensitive.
function isDescendantOf(absPath: string, root: string): boolean {
  if (absPath === root) return true;
  const rootWithSep = root.endsWith(sep) ? root : `${root}${sep}`;
  if (IS_WINDOWS) {
    return absPath.toLowerCase().startsWith(rootWithSep.toLowerCase());
  }
  return absPath.startsWith(rootWithSep);
}

// ---------------------------------------------------------------------------
// Rule 1: PATH_OUTSIDE_ROOT
// Pure-string path-traversal defense. Attack vector: `../../etc/passwd` or
// `C:\Windows\System32\drivers\etc\hosts` as filePath; agent-loop callers may
// bypass the bridge's guardPath entirely, so we recheck here.
// ---------------------------------------------------------------------------

interface PathCheckOk {
  ok: true;
  resolved: string;
  absRoot: string;
}

function checkPathInsideRoot(
  filePath: string,
  projectRoot: string,
): PathCheckOk | { ok: false; error: SafetyError } {
  if (typeof filePath !== "string" || filePath === "") {
    return makeError("PATH_OUTSIDE_ROOT", "empty file path", "skip", {
      requested: filePath,
    });
  }

  const absRoot = resolve(projectRoot);
  const resolved = isAbsolute(filePath) ? resolve(filePath) : resolve(absRoot, filePath);

  // Even after resolve(), if the normalised form retained `..`, reject.
  // Catches degenerate inputs like a literal `..` segment that resolve()
  // would collapse silently.
  if (normalize(filePath).split(/[\\/]/).includes("..")) {
    return makeError("PATH_OUTSIDE_ROOT", "`..` segments are not allowed", "skip", {
      requested: filePath,
    });
  }

  if (!isDescendantOf(resolved, absRoot)) {
    return makeError(
      "PATH_OUTSIDE_ROOT",
      "resolved path escapes project root",
      "skip",
      { requested: filePath, resolved, projectRoot: absRoot },
    );
  }

  return { ok: true, resolved, absRoot };
}

// ---------------------------------------------------------------------------
// Rule 2: SYMLINK_ESCAPE
// `path.resolve` operates on strings; `realpathSync` follows on-disk links.
// Attack vector: a dep creates `node_modules/foo/link.tsx` → symlink to
// `/etc/passwd`. ENOENT is fine — file doesn't exist yet; nothing to escape.
// ---------------------------------------------------------------------------

function checkSymlinkEscape(
  resolvedPath: string,
  absRoot: string,
): { ok: true } | { ok: false; error: SafetyError } {
  let real: string;
  try {
    real = realpathSync(resolvedPath);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return { ok: true };
    // Opaque errors (EACCES, EPERM…): don't leak; downstream write surfaces.
    return { ok: true };
  }
  if (!isDescendantOf(real, absRoot)) {
    return makeError(
      "SYMLINK_ESCAPE",
      "symlink target escapes project root",
      "skip",
      { resolved: resolvedPath, real, projectRoot: absRoot },
    );
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Rule 3: REFUSE_LIST_MATCH
// Rationale: `node_modules/` is overwritten by `npm install`; `dist/`,
// `build/`, `out/`, `.next/`, `.nuxt/`, `.svelte-kit/`, `coverage/`,
// `__generated__/`, `target/` are build output blown away on next build;
// `.git/` editing corrupts repo history. `REFUSE_LIST` regexes use `[\/\\]`
// to match both POSIX and Windows. First match wins.
// ---------------------------------------------------------------------------

function checkRefuseList(
  resolvedPath: string,
): { ok: true } | { ok: false; error: SafetyError } {
  for (const pattern of REFUSE_LIST) {
    if (pattern.test(resolvedPath)) {
      return makeError(
        "REFUSE_LIST_MATCH",
        "file is inside a refused directory or has a refused basename",
        "skip",
        { resolved: resolvedPath, matched: pattern.source },
      );
    }
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Rule 4: UNSUPPORTED_FILE_TYPE
// Extension-first detection. Fallback `agent-driven` → Phase 4 hands freeText
// to the LLM, which uses native Edit (no fs.writeFileSync from the engine).
// ---------------------------------------------------------------------------

function checkSupportedExtension(
  resolvedPath: string,
): { ok: true; fileType: SourceFileType } | { ok: false; error: SafetyError } {
  const ext = extname(resolvedPath).toLowerCase();
  const fileType = SUPPORTED_EXTENSIONS[ext];
  if (fileType === undefined) {
    return makeError(
      "UNSUPPORTED_FILE_TYPE",
      `extension "${ext}" is not in the supported list`,
      "agent-driven",
      { resolved: resolvedPath, extension: ext },
    );
  }
  return { ok: true, fileType };
}

// ---------------------------------------------------------------------------
// Rule 5: FILE_TOO_LARGE
// > 1 MB is almost certainly a bundled vendor blob with a misleading
// extension. Refuse → agent-driven fallback.
// ---------------------------------------------------------------------------

function checkFileSize(
  resolvedPath: string,
): { ok: true } | { ok: false; error: SafetyError } {
  let size: number;
  try {
    size = statSync(resolvedPath).size;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return { ok: true };
    // Other stat errors: don't claim too-large; downstream open() reports.
    return { ok: true };
  }
  if (size > MAX_SOURCE_FILE_BYTES) {
    return makeError(
      "FILE_TOO_LARGE",
      `file size ${size} exceeds limit of ${MAX_SOURCE_FILE_BYTES} bytes`,
      "agent-driven",
      { resolved: resolvedPath, size, limit: MAX_SOURCE_FILE_BYTES },
    );
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Rules 6 + 7 helper: read the head once (≤ 512 bytes). Avoids two
// open/read/close cycles per safetyCheck.
// ---------------------------------------------------------------------------

interface HeadChunk {
  bytes: Buffer;
  fileExists: boolean;
}

function readHead(resolvedPath: string): HeadChunk {
  let fd: number;
  try {
    fd = openSync(resolvedPath, "r");
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") {
      return { bytes: Buffer.alloc(0), fileExists: false };
    }
    return { bytes: Buffer.alloc(0), fileExists: false };
  }
  const buf = Buffer.alloc(512);
  let bytesRead = 0;
  try {
    bytesRead = readSync(fd, buf, 0, 512, 0);
  } catch {
    bytesRead = 0;
  } finally {
    try {
      closeSync(fd);
    } catch {
      // ignore
    }
  }
  return { bytes: buf.subarray(0, bytesRead), fileExists: true };
}

// ---------------------------------------------------------------------------
// Rule 6: BINARY_FILE
// NULL byte in first 512 bytes ⇒ binary (UTF-8 text never contains 0x00).
// Attack vector: PNG renamed to `.tsx`.
// ---------------------------------------------------------------------------

function checkBinary(head: Buffer): { ok: true } | { ok: false; error: SafetyError } {
  for (let i = 0; i < head.length; i++) {
    if (head[i] === 0x00) {
      return makeError(
        "BINARY_FILE",
        "NULL byte detected in first 512 bytes — file appears binary",
        "skip",
        { nullByteOffset: i },
      );
    }
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Rule 7: GENERATED_MAGIC_COMMENT
// `@generated` in first 200 bytes (case-insensitive). Used by Meta codegen,
// graphql-codegen, proto generators, prettier-as-formatter. Suggest "manual"
// so the user sees a notice — silent retry via LLM would just get wiped on
// the next codegen run.
// ---------------------------------------------------------------------------

function checkGenerated(head: Buffer): { ok: true } | { ok: false; error: SafetyError } {
  if (head.length === 0) return { ok: true };
  const slice = head.subarray(0, Math.min(head.length, 200));
  const text = slice.toString("utf8");
  if (GENERATED_MAGIC_COMMENT_REGEX.test(text)) {
    return makeError(
      "GENERATED_MAGIC_COMMENT",
      "`@generated` magic comment in first 200 bytes",
      "manual",
      { firstBytes: text },
    );
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Rule 8: READ_ONLY_FILE
// `fs.accessSync(_, W_OK)` is the cheapest "can I write?" check. Windows
// ACLs make access-checks noisy — treat ANY non-ENOENT failure as read-only
// so the user gets a clear refusal instead of a half-written file.
// ---------------------------------------------------------------------------

function checkWritable(
  resolvedPath: string,
): { ok: true } | { ok: false; error: SafetyError } {
  try {
    accessSync(resolvedPath, fsConstants.W_OK);
    return { ok: true };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return { ok: true };
    return makeError("READ_ONLY_FILE", "file is not writable", "manual", {
      resolved: resolvedPath,
      errno: code ?? "UNKNOWN",
    });
  }
}

// ---------------------------------------------------------------------------
// safetyCheck — orchestrate the 8 rules in fixed order. First failure wins.
// On success: resolved path, file type, dominant EOL convention.
// ---------------------------------------------------------------------------

export async function safetyCheck(
  filePath: string,
  projectRoot: string,
): Promise<SafetyResult> {
  const pathCheck = checkPathInsideRoot(filePath, projectRoot);
  if (!pathCheck.ok) return pathCheck;

  const symlinkCheck = checkSymlinkEscape(pathCheck.resolved, pathCheck.absRoot);
  if (!symlinkCheck.ok) return symlinkCheck;

  const refuseCheck = checkRefuseList(pathCheck.resolved);
  if (!refuseCheck.ok) return refuseCheck;

  const extCheck = checkSupportedExtension(pathCheck.resolved);
  if (!extCheck.ok) return extCheck;

  const sizeCheck = checkFileSize(pathCheck.resolved);
  if (!sizeCheck.ok) return sizeCheck;

  // Rules 6 + 7 share a single head-read.
  const head = readHead(pathCheck.resolved);

  const binaryCheck = checkBinary(head.bytes);
  if (!binaryCheck.ok) return binaryCheck;

  const generatedCheck = checkGenerated(head.bytes);
  if (!generatedCheck.ok) return generatedCheck;

  const writableCheck = checkWritable(pathCheck.resolved);
  if (!writableCheck.ok) return writableCheck;

  // EOL detection from the head we already read — first newline run wins;
  // the head is 512 bytes which is plenty for any sane source file. Empty
  // or non-existent files default to "\n".
  const eolConvention: EolConvention =
    head.bytes.length > 0 ? detectEol(head.bytes.toString("utf8")) : "\n";

  return {
    ok: true,
    filePath: pathCheck.resolved,
    fileType: extCheck.fileType,
    eolConvention,
  };
}

// ---------------------------------------------------------------------------
// SafetyModule export for ergonomic single-import wiring into the
// inject/wrap/accept/discard pipeline (which all call safetyCheck first).
// ---------------------------------------------------------------------------

export const safetyModule: SafetyModule = { safetyCheck };
