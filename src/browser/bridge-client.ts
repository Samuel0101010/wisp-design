// wisp-design — Browser bridge client (Phase 2).
//
// Wraps fetch(POST /events) + EventSource(GET /events) with a long-poll
// fallback for environments without EventSource (e.g. CSP that excluded
// event-stream from connect-src). bridge/csp.ts ships an opt-in dev-mode CSP
// patch helper but is not auto-wired, so we keep the fallback for safety.
// The state machine never sees fetch
// directly — `BridgeClient` is the only surface.

import type {
  BridgeClient,
  BridgeClientOptions,
} from "../contracts/browser.js";
import type { BridgeEvent } from "../contracts/bridge.js";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => window.setTimeout(r, ms));
}

export function createBridgeClient(opts: BridgeClientOptions): BridgeClient {
  const base = opts.bridgeUrl.replace(/\/$/, "");
  let es: EventSource | null = null;
  let closed = false;

  const url = (path: string): string =>
    `${base}${path}${path.includes("?") ? "&" : "?"}token=${encodeURIComponent(opts.token)}`;

  return {
    async postEvent(evt: BridgeEvent): Promise<{ cursor: string }> {
      const res = await fetch(url("/events"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(evt),
      });
      if (!res.ok) throw new Error(`postEvent failed: ${res.status}`);
      const body = (await res.json().catch(() => ({}))) as { cursor?: string };
      return { cursor: body.cursor ?? "" };
    },
    subscribe(handler: (evt: BridgeEvent) => void): () => void {
      if (typeof EventSource === "undefined") {
        let cancelled = false;
        const loop = async (): Promise<void> => {
          while (!cancelled && !closed) {
            try {
              const res = await fetch(url("/poll?timeout=30000"));
              if (!res.ok) {
                await sleep(1000);
                continue;
              }
              const body = (await res.json().catch(() => ({}))) as {
                events?: BridgeEvent[];
              };
              if (Array.isArray(body.events)) {
                for (const ev of body.events) handler(ev);
              }
            } catch {
              await sleep(1000);
            }
          }
        };
        void loop();
        return (): void => {
          cancelled = true;
        };
      }
      es = new EventSource(url("/events"));
      es.onmessage = (m: MessageEvent): void => {
        try {
          const parsed = JSON.parse(m.data) as BridgeEvent;
          handler(parsed);
        } catch {
          /* ignore malformed frame */
        }
      };
      return (): void => {
        if (es) {
          es.close();
          es = null;
        }
      };
    },
    async ready(): Promise<void> {
      const res = await fetch(`${base}/health`);
      if (!res.ok) throw new Error(`bridge not ready: ${res.status}`);
    },
    close(): void {
      closed = true;
      if (es) {
        es.close();
        es = null;
      }
    },
  };
}
