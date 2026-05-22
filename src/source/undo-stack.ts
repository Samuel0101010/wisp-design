// wisp-design — Per-session undo log (Phase 3).
//
// JSONL append-only at `<projectRoot>/.wisp/sessions/<sessionId>.jsonl`.
// One entry per source-edit operation; `safety-refused` entries record that
// nothing landed. Phase 6 session-replay reads this file back; Phase 5
// verification-gate uses it to scrub state at arbitrary points.
//
// Three invariants:
//   1. Append-only WITHIN a session — never rewrite a closed entry.
//   2. Each line is one JSON object that round-trips through `UndoEntrySchema`.
//   3. Rotation renames `<sessionId>.jsonl` → `<sessionId>.jsonl.<ts>.rotated`
//      and opens a fresh file. The active file always has the bare name.

import { promises as fs } from "node:fs";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";

import {
  type UndoEntry,
  UndoEntrySchema,
  MAX_UNDO_LOG_BYTES,
} from "../contracts/source.js";

// ---------------------------------------------------------------------------
// Configuration — caller supplies the project root once per process; we resolve
// the session-log path from it. We accept an explicit override per call too,
// since tests want isolated temp dirs.
// ---------------------------------------------------------------------------

let DEFAULT_PROJECT_ROOT: string = process.cwd();

export function setProjectRoot(root: string): void {
  if (!isAbsolute(root)) {
    throw new Error(`undo-stack: projectRoot must be absolute, got "${root}"`);
  }
  DEFAULT_PROJECT_ROOT = resolve(root);
}

export function getProjectRoot(): string {
  return DEFAULT_PROJECT_ROOT;
}

// ---------------------------------------------------------------------------
// Path resolution
// ---------------------------------------------------------------------------

function sessionLogPath(sessionId: string, projectRoot?: string): string {
  // Defensive: sessionId must not contain path separators or `..`. A bad
  // sessionId here corrupts a sibling project's logs; refuse it.
  if (sessionId.length === 0) {
    throw new Error("undo-stack: sessionId must not be empty");
  }
  if (
    sessionId.includes("/") ||
    sessionId.includes("\\") ||
    sessionId === "." ||
    sessionId === ".."
  ) {
    throw new Error(
      `undo-stack: sessionId must not contain path separators, got "${sessionId}"`,
    );
  }
  const root = resolve(projectRoot ?? DEFAULT_PROJECT_ROOT);
  return join(root, ".wisp", "sessions", `${sessionId}.jsonl`);
}

async function ensureDir(filePath: string): Promise<void> {
  await fs.mkdir(dirname(filePath), { recursive: true });
}

// ---------------------------------------------------------------------------
// append — validate-and-append-one-line. Each operation is one write so partial
// crashes never corrupt earlier entries (POSIX + NTFS atomically append small
// records under O_APPEND; we rely on Node's fs.appendFile which uses that).
// ---------------------------------------------------------------------------

export interface AppendOptions {
  projectRoot?: string;
  maxBytes?: number;
}

export async function append(
  entry: UndoEntry,
  opts: AppendOptions = {},
): Promise<void> {
  const parsed = UndoEntrySchema.parse(entry);
  const path = sessionLogPath(parsed.sessionId, opts.projectRoot);
  const maxBytes = opts.maxBytes ?? MAX_UNDO_LOG_BYTES;

  await ensureDir(path);
  await rotateIfTooLarge(parsed.sessionId, maxBytes, {
    projectRoot: opts.projectRoot,
  });

  const line = JSON.stringify(parsed) + "\n";
  await fs.appendFile(path, line, { encoding: "utf8" });
}

// ---------------------------------------------------------------------------
// read — full session log. Bad lines warned + skipped (partial corruption
// shouldn't break replay).
// ---------------------------------------------------------------------------

export interface ReadOptions {
  projectRoot?: string;
}

export async function read(
  sessionId: string,
  opts: ReadOptions = {},
): Promise<UndoEntry[]> {
  const path = sessionLogPath(sessionId, opts.projectRoot);

  let raw: string;
  try {
    raw = await fs.readFile(path, { encoding: "utf8" });
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return [];
    throw err;
  }

  const out: UndoEntry[] = [];
  const lines = raw.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line === undefined || line === "") continue;
    let obj: unknown;
    try {
      obj = JSON.parse(line);
    } catch {
      process.stderr.write(
        `[wisp-design] undo-stack: skipping malformed JSON on line ${i + 1} of ${path}\n`,
      );
      continue;
    }
    const parsed = UndoEntrySchema.safeParse(obj);
    if (!parsed.success) {
      process.stderr.write(
        `[wisp-design] undo-stack: skipping schema-invalid entry on line ${i + 1} of ${path}\n`,
      );
      continue;
    }
    out.push(parsed.data);
  }
  return out;
}

// ---------------------------------------------------------------------------
// rotateIfTooLarge — rename + start a new file if size >= maxBytes.
// ---------------------------------------------------------------------------

export interface RotateOptions {
  projectRoot?: string;
}

export async function rotateIfTooLarge(
  sessionId: string,
  maxBytes: number,
  opts: RotateOptions = {},
): Promise<void> {
  const path = sessionLogPath(sessionId, opts.projectRoot);
  let size = 0;
  try {
    const st = await fs.stat(path);
    size = st.size;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return;
    throw err;
  }
  if (size < maxBytes) return;

  // Use compact ISO with `:` / `.` replaced — Windows filenames refuse `:`.
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const rotated = `${path}.${stamp}.rotated`;
  await fs.rename(path, rotated);
  // New file is created lazily by the next append; nothing more to do here.
}

// ---------------------------------------------------------------------------
// Module export — matches `UndoStackModule` in the contract.
// ---------------------------------------------------------------------------

export const undoStackModule = {
  append,
  read,
  rotateIfTooLarge: (sessionId: string, maxBytes: number) =>
    rotateIfTooLarge(sessionId, maxBytes),
};

// Internal export used by callers (inject/wrap/accept) that already know the
// project root — saves a round trip through `setProjectRoot`.
export function sessionLogPathForTest(
  sessionId: string,
  projectRoot?: string,
): string {
  return sessionLogPath(sessionId, projectRoot);
}

// Unused-import suppression (sep is reserved for future cross-platform tests).
void sep;
