// wisp-design — Phase 1 long-poll behavior.
//
// Boots a real bridge server, talks to it via native fetch. Validates:
//   - timeout silent-clamp at LONG_POLL_CAP_MS
//   - fast-path delivery when an event posts mid-poll
//   - empty-poll behavior with cursor advancement
//   - client disconnect mid-poll (the race coder flagged) → no crash

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

import { startBridgeServer } from "../../src/bridge/server.js";
import type {
  BridgeEvent,
  BridgeServerHandle,
  LongPollResponse,
} from "../../src/contracts/bridge.js";

// Test-only handle augmentation: server.ts attaches a non-enumerable
// `pendingWaiters()` accessor so disconnect-cleanup tests can assert the
// parked-waiter set drains. Not part of the BridgeServerHandle contract.
type HandleWithWaiters = BridgeServerHandle & { pendingWaiters(): number };

let handle: BridgeServerHandle;
let projectRoot: string;
const baseUrl = (): string => `http://127.0.0.1:${handle.port}`;
const sampleSessionId = "test-session";

const samplePickEvent = (): BridgeEvent => ({
  kind: "pick",
  sessionId: sampleSessionId,
  target: {
    selector: "div.foo",
    tag: "div",
    rect: { x: 0, y: 0, w: 10, h: 10 },
  },
});

// Drain the queue and return the head cursor, so a follow-up poll using this
// cursor genuinely PARKS (no pending events to fast-path on). The fixtures in
// this file accumulate events across tests, so polling with cursor=0 would
// otherwise fast-path on the backlog.
async function drainCursor(): Promise<string> {
  const res = await fetch(`${baseUrl()}/poll?token=${handle.token}&timeout=50`);
  const body = (await res.json()) as LongPollResponse;
  return body.cursor;
}

async function postEvent(event: BridgeEvent): Promise<string> {
  const res = await fetch(`${baseUrl()}/events?token=${handle.token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(event),
  });
  expect(res.status).toBe(200);
  const body = (await res.json()) as { accepted: true; cursor: string };
  return body.cursor;
}

beforeAll(async () => {
  projectRoot = mkdtempSync(join(tmpdir(), "wisp-poll-"));
  // Use a dedicated port-range slot so we don't race the parallel
  // server-smoke worker. `startBridgeServer` will throw if it's occupied,
  // which is a clear signal something else is on it — fine for CI.
  handle = await startBridgeServer({ projectRoot, preferredPort: 31380 });
});

afterAll(async () => {
  await handle?.stop(50);
  if (projectRoot !== undefined) rmSync(projectRoot, { recursive: true, force: true });
});

describe("long-poll", () => {
  it("returns events posted before the poll lands (fast-path)", async () => {
    const cursor = await postEvent(samplePickEvent());
    expect(cursor).toMatch(/^seq-\d+-/);
    const res = await fetch(
      `${baseUrl()}/poll?token=${handle.token}&timeout=2000`,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as LongPollResponse;
    expect(body.events.length).toBeGreaterThanOrEqual(1);
    expect(body.events[0]?.kind).toBe("pick");
  });

  it("returns events posted DURING an open poll (wake-up path)", async () => {
    // Pull current cursor first so we only see new events.
    const seedRes = await fetch(
      `${baseUrl()}/poll?token=${handle.token}&timeout=100`,
    );
    const seed = (await seedRes.json()) as LongPollResponse;
    const sinceCursor = seed.cursor;

    const pollPromise = fetch(
      `${baseUrl()}/poll?token=${handle.token}&timeout=5000&cursor=${encodeURIComponent(sinceCursor)}`,
    );
    // Give the server a moment to register the waiter.
    await new Promise((res) => setTimeout(res, 100));
    await postEvent(samplePickEvent());

    const res = await pollPromise;
    expect(res.status).toBe(200);
    const body = (await res.json()) as LongPollResponse;
    expect(body.events.length).toBeGreaterThanOrEqual(1);
    expect(body.slicedAt).toBeLessThan(5000);
  });

  it("returns empty events list when no events within timeout", async () => {
    // Drain first.
    const drainRes = await fetch(
      `${baseUrl()}/poll?token=${handle.token}&timeout=50`,
    );
    const drain = (await drainRes.json()) as LongPollResponse;

    const res = await fetch(
      `${baseUrl()}/poll?token=${handle.token}&timeout=300&cursor=${encodeURIComponent(drain.cursor)}`,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as LongPollResponse;
    expect(body.events).toEqual([]);
    expect(body.slicedAt).toBeGreaterThanOrEqual(250);
    expect(body.slicedAt).toBeLessThan(1500);
  });

  it("cursor advances monotonically across polls", async () => {
    // Drain.
    const drainRes = await fetch(
      `${baseUrl()}/poll?token=${handle.token}&timeout=50`,
    );
    const drain = (await drainRes.json()) as LongPollResponse;
    let cursor = drain.cursor;

    await postEvent(samplePickEvent());
    const r1 = await fetch(
      `${baseUrl()}/poll?token=${handle.token}&timeout=1000&cursor=${encodeURIComponent(cursor)}`,
    );
    const b1 = (await r1.json()) as LongPollResponse;
    expect(b1.events.length).toBe(1);
    expect(b1.cursor).not.toBe(cursor);
    cursor = b1.cursor;

    await postEvent(samplePickEvent());
    const r2 = await fetch(
      `${baseUrl()}/poll?token=${handle.token}&timeout=1000&cursor=${encodeURIComponent(cursor)}`,
    );
    const b2 = (await r2.json()) as LongPollResponse;
    expect(b2.events.length).toBe(1);
    expect(b2.cursor).not.toBe(cursor);

    // Extract numeric seq from cursors and verify monotonic.
    const seqOf = (c: string): number => {
      const m = /^seq-(\d+)-/.exec(c);
      return m === null || m[1] === undefined ? 0 : Number.parseInt(m[1], 10);
    };
    expect(seqOf(b2.cursor)).toBeGreaterThan(seqOf(b1.cursor));
  });

  it(
    "client disconnect mid-poll → server stays healthy",
    { timeout: 8000 },
    async () => {
      // Drain.
      await fetch(`${baseUrl()}/poll?token=${handle.token}&timeout=50`);

      const ac = new AbortController();
      const aborted = fetch(
        `${baseUrl()}/poll?token=${handle.token}&timeout=10000`,
        { signal: ac.signal },
      ).catch((err: unknown) => {
        // Native fetch + AbortController: AbortError is expected.
        const e = err as Error;
        expect(e.name === "AbortError" || /aborted/i.test(e.message)).toBe(true);
        return undefined;
      });

      // Wait a bit, abort, then verify the server can still handle another
      // request without crashing.
      await new Promise((res) => setTimeout(res, 100));
      ac.abort();
      await aborted;

      // Subsequent poll must still work.
      const res = await fetch(
        `${baseUrl()}/poll?token=${handle.token}&timeout=200`,
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as LongPollResponse;
      expect(Array.isArray(body.events)).toBe(true);
    },
  );

  it(
    "GET /poll with non-numeric timeout waits (NaN does not short-circuit)",
    { timeout: 8000 },
    async () => {
      const h = handle as HandleWithWaiters;
      // Drain so the poll parks instead of fast-pathing on the backlog.
      const cursor = await drainCursor();

      // ?timeout=abc → parseInt → NaN. Before the fix this flowed straight into
      // longPoll (`??` does NOT substitute NaN), `setTimeout(fn, NaN)` coerced
      // to 0, and the poll returned immediately — degrading to a busy-loop.
      const ac = new AbortController();
      const pending = fetch(
        `${baseUrl()}/poll?token=${handle.token}&timeout=abc&cursor=${encodeURIComponent(cursor)}`,
        { signal: ac.signal },
      ).catch(() => undefined);

      // Wait past any immediate-return window, then assert the waiter is parked
      // (proving NaN was coerced to the default lease, not 0).
      for (let tries = 0; tries < 20 && h.pendingWaiters() < 1; tries += 1) {
        // eslint-disable-next-line no-await-in-loop -- bounded retry
        await new Promise((res) => setTimeout(res, 50));
      }
      expect(h.pendingWaiters()).toBe(1);

      ac.abort();
      await pending;
    },
  );

  it(
    "GET /poll with empty timeout query waits (empty string → NaN guard)",
    { timeout: 8000 },
    async () => {
      const h = handle as HandleWithWaiters;
      const cursor = await drainCursor();
      const ac = new AbortController();
      const pending = fetch(
        `${baseUrl()}/poll?token=${handle.token}&timeout=&cursor=${encodeURIComponent(cursor)}`,
        { signal: ac.signal },
      ).catch(() => undefined);
      for (let tries = 0; tries < 20 && h.pendingWaiters() < 1; tries += 1) {
        // eslint-disable-next-line no-await-in-loop -- bounded retry
        await new Promise((res) => setTimeout(res, 50));
      }
      expect(h.pendingWaiters()).toBe(1);
      ac.abort();
      await pending;
    },
  );

  it(
    "aborted polls release their parked waiters (no waiter/timer leak)",
    { timeout: 8000 },
    async () => {
      const h = handle as HandleWithWaiters;
      // Drain any pending events so the polls below park instead of fast-pathing.
      const cursor = await drainCursor();

      // Open N long polls (10s timeout) so each parks a waiter, then abort all.
      const N = 8;
      const controllers: AbortController[] = [];
      const inflight: Array<Promise<unknown>> = [];
      for (let i = 0; i < N; i += 1) {
        const ac = new AbortController();
        controllers.push(ac);
        inflight.push(
          fetch(`${baseUrl()}/poll?token=${handle.token}&timeout=10000&cursor=${encodeURIComponent(cursor)}`, {
            signal: ac.signal,
          }).catch(() => undefined),
        );
      }
      // Let the server register the waiters. Native fetch (undici) pools
      // connections per origin, so the polls may park gradually rather than
      // all at once — wait until every one has parked (bounded retry).
      for (let tries = 0; tries < 40 && h.pendingWaiters() < N; tries += 1) {
        // eslint-disable-next-line no-await-in-loop -- bounded retry
        await new Promise((res) => setTimeout(res, 50));
      }
      expect(h.pendingWaiters()).toBe(N);

      for (const ac of controllers) ac.abort();
      await Promise.all(inflight);

      // Close handler runs async on the server side; poll the count down.
      for (let tries = 0; tries < 40 && h.pendingWaiters() > 0; tries += 1) {
        // eslint-disable-next-line no-await-in-loop -- bounded retry
        await new Promise((res) => setTimeout(res, 50));
      }
      expect(h.pendingWaiters()).toBe(0);
    },
  );

  it("timeout >> LONG_POLL_CAP_MS is silently clamped (not 400)", async () => {
    // We pass timeout=500_000 (well over the 270s cap). We won't wait 270s —
    // we just post an event mid-poll to short-circuit. The contract is: no
    // 400 BAD_TIMEOUT response, despite the schema's refine().
    const pollPromise = fetch(
      `${baseUrl()}/poll?token=${handle.token}&timeout=500000`,
    );
    await new Promise((res) => setTimeout(res, 100));
    await postEvent(samplePickEvent());
    const res = await pollPromise;
    expect(res.status).toBe(200);
    const body = (await res.json()) as LongPollResponse;
    expect(body.events.length).toBeGreaterThanOrEqual(1);
  });
});
