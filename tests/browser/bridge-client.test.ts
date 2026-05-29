// @vitest-environment jsdom
//
// wisp-design — bridge-client tests (Phase 7 fix-pass).
//
// Covers the long-poll fallback URL assembly (finding #4 — the EventSource-
// undefined branch built a malformed `/poll&timeout=...?token=` path that
// 404s), the SSE onmessage JSON.parse path, postEvent error handling, and
// close()/unsubscribe teardown. Previously this module had zero coverage.

import { afterEach, describe, expect, it, vi } from "vitest";

import { createBridgeClient } from "../../src/browser/bridge-client.js";
import type { BridgeEvent } from "../../src/contracts/bridge.js";

const OPTS = {
  bridgeUrl: "http://127.0.0.1:8400",
  token: "tok-abc",
  sessionId: "sess-1",
};

const origFetch = globalThis.fetch;
const origEventSource = (globalThis as { EventSource?: unknown }).EventSource;

afterEach(() => {
  globalThis.fetch = origFetch;
  (globalThis as { EventSource?: unknown }).EventSource = origEventSource;
  vi.restoreAllMocks();
});

describe("bridge-client — long-poll fallback URL (no EventSource)", () => {
  it("polls a well-formed /poll URL with numeric timeout + token", async () => {
    // Force the fallback branch.
    (globalThis as { EventSource?: unknown }).EventSource = undefined;

    const seen: string[] = [];
    let stop = (): void => undefined;
    // Capture the first URL, then immediately cancel so the long-poll loop
    // exits on its next `while (!cancelled)` check (no busy-spin / OOM).
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      seen.push(String(input));
      stop();
      return new Response(JSON.stringify({ events: [] }), { status: 200 });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const client = createBridgeClient(OPTS);
    stop = client.subscribe(() => undefined);
    // Let the async loop fire at least once.
    await new Promise((r) => setTimeout(r, 10));
    stop();
    client.close();

    expect(seen.length).toBeGreaterThan(0);
    const u = new URL(seen[0]!);
    expect(u.pathname).toBe("/poll");
    expect(u.searchParams.get("timeout")).toBe("30000");
    expect(u.searchParams.get("token")).toBe("tok-abc");
  });
});

describe("bridge-client — SSE subscribe (EventSource present)", () => {
  it("parses valid JSON frames and ignores malformed ones", () => {
    let captured: { onmessage?: (m: MessageEvent) => void; close: () => void } | null =
      null;
    class FakeEventSource {
      onmessage: ((m: MessageEvent) => void) | null = null;
      constructor(public url: string) {
        captured = this as unknown as {
          onmessage?: (m: MessageEvent) => void;
          close: () => void;
        };
      }
      close = vi.fn();
    }
    (globalThis as { EventSource?: unknown }).EventSource =
      FakeEventSource as unknown as typeof EventSource;

    const client = createBridgeClient(OPTS);
    const received: BridgeEvent[] = [];
    const stop = client.subscribe((ev) => received.push(ev));

    expect(captured).not.toBeNull();
    // Valid frame.
    captured!.onmessage?.({ data: JSON.stringify({ kind: "error" }) } as MessageEvent);
    // Malformed frame — must not throw and must not deliver.
    expect(() =>
      captured!.onmessage?.({ data: "not json {" } as MessageEvent),
    ).not.toThrow();

    expect(received).toHaveLength(1);
    expect(received[0]).toEqual({ kind: "error" });

    stop();
    expect((captured as unknown as { close: () => void }).close).toHaveBeenCalled();
  });
});

describe("bridge-client — postEvent", () => {
  it("returns the cursor on ok responses", async () => {
    globalThis.fetch = vi.fn(
      async () => new Response(JSON.stringify({ cursor: "c-9" }), { status: 200 }),
    ) as unknown as typeof fetch;
    const client = createBridgeClient(OPTS);
    const res = await client.postEvent({ kind: "error" } as BridgeEvent);
    expect(res.cursor).toBe("c-9");
  });

  it("throws postEvent failed: <status> on non-ok responses", async () => {
    globalThis.fetch = vi.fn(
      async () => new Response("nope", { status: 401 }),
    ) as unknown as typeof fetch;
    const client = createBridgeClient(OPTS);
    await expect(client.postEvent({ kind: "error" } as BridgeEvent)).rejects.toThrow(
      "postEvent failed: 401",
    );
  });
});
