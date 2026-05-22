// wisp-design — Port discovery + lockfile management.
//
// Owns `.wisp/live/port.lock`. The bridge writes it on boot, live.js + the
// agent + `wisp-design status` read it. Stale-lock detection uses `kill(pid, 0)`
// so a crashed bridge doesn't permanently squat a port.

import { createServer } from "node:net";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { PortLockSchema, type PortLock } from "../contracts/bridge.js";

export const DEFAULT_PORT_RANGE = { min: 31337, max: 31400 } as const;
export const DEFAULT_LOCK_PATH = ".wisp/live/port.lock";

export interface PortRange {
  min: number;
  max: number;
}

function tryBind(port: number): Promise<boolean> {
  return new Promise((resolveBind) => {
    const server = createServer();
    let settled = false;
    const finish = (free: boolean): void => {
      if (settled) return;
      settled = true;
      try {
        server.close(() => resolveBind(free));
      } catch {
        resolveBind(free);
      }
    };
    server.once("error", () => finish(false));
    server.once("listening", () => finish(true));
    try {
      // Bind to loopback only — the bridge is local-dev-only.
      server.listen({ port, host: "127.0.0.1", exclusive: true });
    } catch {
      finish(false);
    }
  });
}

export async function findFreePort(
  range: PortRange = DEFAULT_PORT_RANGE,
): Promise<number> {
  if (range.min > range.max) {
    throw new Error(
      `findFreePort: invalid range ${range.min}..${range.max}`,
    );
  }
  for (let port = range.min; port <= range.max; port += 1) {
    // eslint-disable-next-line no-await-in-loop -- sequential by design
    const free = await tryBind(port);
    if (free) return port;
  }
  throw new Error(
    `findFreePort: no free port in ${range.min}..${range.max}`,
  );
}

async function ensureDir(filePath: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
}

export async function writeLockfile(
  lockPath: string,
  lock: PortLock,
): Promise<void> {
  // Validate before write — refusing to persist a malformed lockfile is cheaper
  // than debugging a stale-poison entry later.
  const parsed = PortLockSchema.parse(lock);
  const abs = resolve(lockPath);
  await ensureDir(abs);
  const tmp = `${abs}.tmp`;
  const body = `${JSON.stringify(parsed, null, 2)}\n`;
  await writeFile(tmp, body, { encoding: "utf8", mode: 0o600 });
  await rename(tmp, abs);
}

function isAlive(pid: number): boolean {
  try {
    // Signal 0 = liveness probe; throws ESRCH if process is gone.
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function readLockfile(
  lockPath: string = DEFAULT_LOCK_PATH,
): Promise<PortLock | null> {
  const abs = resolve(lockPath);
  let raw: string;
  try {
    raw = await readFile(abs, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
  let parsed: PortLock;
  try {
    parsed = PortLockSchema.parse(JSON.parse(raw));
  } catch {
    // Malformed lockfile is treated as stale — let caller overwrite.
    return null;
  }
  if (!isAlive(parsed.pid)) return null;
  return parsed;
}

export async function releaseLockfile(
  lockPath: string = DEFAULT_LOCK_PATH,
): Promise<void> {
  const abs = resolve(lockPath);
  try {
    await unlink(abs);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
    throw err;
  }
}
