// wisp-design — Agent-layer shared helpers (Phase 4).
//
// Tiny utilities reused across poll-loop.ts, skills-index.ts, and sync.ts:
//
//   • readPortLock(projectRoot)  → resolves `.wisp/live/port.lock` + verifies
//                                  the recorded PID is still alive.
//   • parseFlags(args)            → minimal `--key value | --flag` parser.
//                                  No external dep — yargs would be overkill
//                                  for the half-dozen flags Phase 4 uses.
//   • writeJsonResult(obj)        → canonical "machine output" channel: the
//                                  skill prompt parses stdout via JSON.parse.
//   • writeError(code,msg,detail) → structured error envelope to stderr.
//
// Exit-code conventions (mirrored across runPollOnce/runPostEvent/
// runSkills/runSync — see CLAUDE.md > Phase 4 > CLI dispatcher):
//   0  success
//   1  IO error (bridge not running, file not found, permission denied)
//   2  argparse / schema error (bad --flag, missing required, zod refusal)
//   3  upstream HTTP error (bridge returned non-2xx; agent loop should retry)

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { PortLockSchema, type PortLock } from "../contracts/bridge.js";

// ---------------------------------------------------------------------------
// Port-lock — `.wisp/live/port.lock`. Written by `wisp-design live` (Phase 1
// bridge boot). Consumed here so the agent CLI primitives can locate the
// bridge without the user passing `--bridge-url` every invocation.
// ---------------------------------------------------------------------------

export interface ResolvedBridge {
  port: number;
  token: string;
  bridgeUrl: string;
  pid: number;
}

export class PortLockMissingError extends Error {
  public override readonly name = "PortLockMissingError";
  constructor(public readonly lockPath: string) {
    super(
      `bridge not running: no port-lock at ${lockPath}. ` +
        `Start the bridge with \`wisp-design live\`.`,
    );
  }
}

export class PortLockStaleError extends Error {
  public override readonly name = "PortLockStaleError";
  constructor(
    public readonly lockPath: string,
    public readonly pid: number,
  ) {
    super(
      `bridge not running: port-lock at ${lockPath} references stale PID ` +
        `${pid}. Remove the lock and restart the bridge.`,
    );
  }
}

function isPidAlive(pid: number): boolean {
  try {
    // `kill(pid, 0)` is the POSIX liveness probe; Node implements it on
    // Windows by calling OpenProcess. EPERM means "process exists but you
    // can't signal it" — also a positive liveness signal.
    process.kill(pid, 0);
    return true;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "EPERM") return true;
    return false;
  }
}

export async function readPortLock(
  projectRoot: string,
): Promise<ResolvedBridge> {
  const lockPath = resolve(projectRoot, ".wisp/live/port.lock");
  let raw: string;
  try {
    raw = await readFile(lockPath, "utf8");
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") {
      throw new PortLockMissingError(lockPath);
    }
    throw err;
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `port-lock at ${lockPath} is not valid JSON: ${(err as Error).message}`,
    );
  }
  const parsed = PortLockSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error(
      `port-lock at ${lockPath} failed schema validation: ` +
        parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
    );
  }
  const lock: PortLock = parsed.data;
  if (!isPidAlive(lock.pid)) {
    throw new PortLockStaleError(lockPath, lock.pid);
  }
  return {
    port: lock.port,
    token: lock.token,
    pid: lock.pid,
    bridgeUrl: `http://127.0.0.1:${lock.port}`,
  };
}

// ---------------------------------------------------------------------------
// Flag parser — supports `--key value`, `--flag` (boolean true),
// `--no-flag` (boolean false), and positional args before/after.
// Returns `{ flags: { ... }, positional: [...] }`.
// ---------------------------------------------------------------------------

export interface ParsedFlags {
  flags: Record<string, string | boolean>;
  positional: string[];
}

export function parseFlags(args: string[]): ParsedFlags {
  const flags: Record<string, string | boolean> = {};
  const positional: string[] = [];
  for (let i = 0; i < args.length; i += 1) {
    const token = args[i] as string;
    if (!token.startsWith("--")) {
      positional.push(token);
      continue;
    }
    const key = token.slice(2);
    if (key.startsWith("no-")) {
      flags[key.slice(3)] = false;
      continue;
    }
    const next = args[i + 1];
    if (next === undefined || next.startsWith("--")) {
      flags[key] = true;
      continue;
    }
    flags[key] = next;
    i += 1;
  }
  return { flags, positional };
}

export function flagAsString(
  parsed: ParsedFlags,
  key: string,
): string | undefined {
  const v = parsed.flags[key];
  if (typeof v === "string") return v;
  return undefined;
}

export function flagAsNumber(
  parsed: ParsedFlags,
  key: string,
): number | undefined {
  const v = parsed.flags[key];
  if (typeof v !== "string") return undefined;
  const n = Number(v);
  if (!Number.isFinite(n)) return undefined;
  return n;
}

export function flagAsBoolean(
  parsed: ParsedFlags,
  key: string,
  defaultValue: boolean,
): boolean {
  const v = parsed.flags[key];
  if (typeof v === "boolean") return v;
  return defaultValue;
}

// ---------------------------------------------------------------------------
// Result writers
// ---------------------------------------------------------------------------

export function writeJsonResult(obj: unknown): void {
  process.stdout.write(`${JSON.stringify(obj, null, 2)}\n`);
}

export interface StructuredError {
  code: string;
  message: string;
  detail?: unknown;
}

export function writeError(err: StructuredError): void {
  // Stderr carries machine-readable JSON too — the skill prompt may need to
  // distinguish "bridge sliced" from "argparse barfed".
  process.stderr.write(`${JSON.stringify({ error: err })}\n`);
}

// ---------------------------------------------------------------------------
// Exit-code constants — kept here so all three runners stay aligned.
// ---------------------------------------------------------------------------

export const EXIT_OK = 0;
export const EXIT_IO = 1;
export const EXIT_ARG = 2;
export const EXIT_HTTP = 3;
