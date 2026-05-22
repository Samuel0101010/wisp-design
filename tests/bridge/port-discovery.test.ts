// wisp-design — Phase 1 port-discovery + lockfile tests.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer, type Server } from "node:net";
import { randomUUID } from "node:crypto";

import {
  DEFAULT_PORT_RANGE,
  findFreePort,
  readLockfile,
  releaseLockfile,
  writeLockfile,
} from "../../src/bridge/port-discovery.js";
import type { PortLock } from "../../src/contracts/bridge.js";

const tmpRoot = mkdtempSync(join(tmpdir(), "wisp-port-"));
afterAll(() => rmSync(tmpRoot, { recursive: true, force: true }));

const sampleLock = (overrides: Partial<PortLock> = {}): PortLock => ({
  port: 31337,
  token: randomUUID(),
  pid: process.pid,
  startedAt: new Date().toISOString(),
  projectRoot: tmpRoot,
  ...overrides,
});

function bindBlocking(port: number): Promise<Server> {
  return new Promise((res, rej) => {
    const s = createServer();
    s.once("error", rej);
    s.once("listening", () => res(s));
    s.listen({ port, host: "127.0.0.1", exclusive: true });
  });
}

describe("findFreePort", () => {
  it("returns a number in the default range", async () => {
    const port = await findFreePort();
    expect(port).toBeGreaterThanOrEqual(DEFAULT_PORT_RANGE.min);
    expect(port).toBeLessThanOrEqual(DEFAULT_PORT_RANGE.max);
  });

  it(
    "throws when entire range is bound",
    { timeout: 30_000 },
    async () => {
      // Use a small sub-range to keep this test fast.
      const range = { min: 41337, max: 41339 } as const;
      const servers: Server[] = [];
      try {
        for (let p = range.min; p <= range.max; p += 1) {
          // eslint-disable-next-line no-await-in-loop
          servers.push(await bindBlocking(p));
        }
        await expect(findFreePort(range)).rejects.toThrow(/no free port/);
      } finally {
        await Promise.all(
          servers.map(
            (s) =>
              new Promise<void>((res) => {
                s.close(() => res());
              }),
          ),
        );
      }
    },
  );

  it("throws on invalid range (min > max)", async () => {
    await expect(findFreePort({ min: 50000, max: 49000 })).rejects.toThrow(
      /invalid range/,
    );
  });
});

describe("lockfile read/write/release", () => {
  it("writeLockfile + readLockfile roundtrip", async () => {
    const path = join(tmpRoot, `lock-${randomUUID()}.json`);
    const lock = sampleLock();
    await writeLockfile(path, lock);
    const read = await readLockfile(path);
    expect(read).not.toBeNull();
    expect(read?.port).toBe(lock.port);
    expect(read?.token).toBe(lock.token);
    expect(read?.pid).toBe(lock.pid);
  });

  it("readLockfile returns null when file is absent", async () => {
    const path = join(tmpRoot, `missing-${randomUUID()}.json`);
    expect(await readLockfile(path)).toBeNull();
  });

  it("readLockfile returns null when pid is dead", async () => {
    const path = join(tmpRoot, `dead-${randomUUID()}.json`);
    await writeLockfile(path, sampleLock({ pid: 999_999_999 }));
    expect(await readLockfile(path)).toBeNull();
  });

  it("readLockfile returns the lock when pid is alive", async () => {
    const path = join(tmpRoot, `alive-${randomUUID()}.json`);
    await writeLockfile(path, sampleLock({ pid: process.pid }));
    const read = await readLockfile(path);
    expect(read).not.toBeNull();
    expect(read?.pid).toBe(process.pid);
  });

  it("releaseLockfile removes the file", async () => {
    const path = join(tmpRoot, `release-${randomUUID()}.json`);
    await writeLockfile(path, sampleLock());
    expect(existsSync(path)).toBe(true);
    await releaseLockfile(path);
    expect(existsSync(path)).toBe(false);
  });

  it("releaseLockfile ignores ENOENT (idempotent)", async () => {
    const path = join(tmpRoot, `nope-${randomUUID()}.json`);
    await expect(releaseLockfile(path)).resolves.toBeUndefined();
    await expect(releaseLockfile(path)).resolves.toBeUndefined();
  });

  it("writeLockfile validates schema (refuses malformed)", async () => {
    const path = join(tmpRoot, `bad-${randomUUID()}.json`);
    // port out of range — should reject at PortLockSchema.parse
    await expect(
      writeLockfile(path, sampleLock({ port: 99999 })),
    ).rejects.toThrow();
  });

  it("sequential writes overwrite cleanly (last-write-wins)", async () => {
    // The bridge only ever has one writer (the bridge process itself), so
    // we don't claim atomic concurrent writes — just verify last-write-wins
    // for sequential overwrites.
    const path = join(tmpRoot, `sequential-${randomUUID()}.json`);
    await writeLockfile(path, sampleLock({ port: 31337 }));
    await writeLockfile(path, sampleLock({ port: 31338 }));
    await writeLockfile(path, sampleLock({ port: 31339 }));
    const final = await readLockfile(path);
    expect(final).not.toBeNull();
    expect(final?.port).toBe(31339);
  });
});
