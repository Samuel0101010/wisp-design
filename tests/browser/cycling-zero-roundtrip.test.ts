// @vitest-environment jsdom
//
// wisp-design — cycling zero-roundtrip integration tests (findings #2 + #3).
//
// Drives the real `init()` wiring through pick → configure → generate →
// cycling (variants delivered over the mocked SSE bridge), then asserts:
//
//   #2  Re-entering cycling for an in-place change (cycle-set-active, param
//       change) does NOT tear down + rebuild the variant host, and does NOT
//       re-POST a `cycling` bridge event on every tick (broke zero-roundtrip).
//   #3  The morph/param path actually reaches the live @scope root (the slider
//       output previously dead-ended in state and never updated the preview).
//
// jsdom can't run @scope cascade or layout, so we stub getBoundingClientRect /
// elementFromPoint so the picker accepts a click, and assert on DOM structure
// + setProperty side-effects rather than computed styles. The slider-snap-back
// visual is flagged for lead E2E re-verification.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { init } from "../../src/browser/index.js";
import type { BridgeEvent } from "../../src/contracts/bridge.js";

interface FakeES {
  url: string;
  onmessage: ((m: MessageEvent) => void) | null;
  close: () => void;
}

let lastES: FakeES | null = null;
const origFetch = globalThis.fetch;
const origEventSource = (globalThis as { EventSource?: unknown }).EventSource;

function pushSse(ev: BridgeEvent): void {
  lastES?.onmessage?.({ data: JSON.stringify(ev) } as MessageEvent);
}

/** The floating bar defers cross-mode renders via a 60ms fade. */
function waitFade(): Promise<void> {
  return new Promise((r) => setTimeout(r, 90));
}

function postedKinds(fetchMock: ReturnType<typeof vi.fn>): string[] {
  const kinds: string[] = [];
  for (const call of fetchMock.mock.calls) {
    const init = call[1] as RequestInit | undefined;
    if (init?.method === "POST" && typeof init.body === "string") {
      try {
        kinds.push((JSON.parse(init.body) as { kind?: string }).kind ?? "?");
      } catch {
        /* ignore */
      }
    }
  }
  return kinds;
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  document.body.innerHTML = "";
  document.head.querySelectorAll("style").forEach((s) => s.remove());
  lastES = null;

  fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
    return new Response(JSON.stringify({ cursor: "c" }), { status: 200 });
  });
  globalThis.fetch = fetchMock as unknown as typeof fetch;

  class FakeEventSource implements FakeES {
    onmessage: ((m: MessageEvent) => void) | null = null;
    close = vi.fn();
    constructor(public url: string) {
      lastES = this;
    }
  }
  (globalThis as { EventSource?: unknown }).EventSource =
    FakeEventSource as unknown as typeof EventSource;
});

afterEach(() => {
  globalThis.fetch = origFetch;
  (globalThis as { EventSource?: unknown }).EventSource = origEventSource;
  vi.restoreAllMocks();
});

/** Build a pickable target: jsdom rects are 0×0, so stub a real-looking box. */
function makeTarget(): HTMLElement {
  const node = document.createElement("div");
  node.id = "hero";
  node.textContent = "Hero";
  document.body.appendChild(node);
  node.getBoundingClientRect = () =>
    ({ x: 10, y: 10, width: 200, height: 80, top: 10, left: 10, right: 210, bottom: 90, toJSON: () => ({}) } as DOMRect);
  // elementFromPoint drives picker hover/click acceptance.
  document.elementFromPoint = () => node;
  return node;
}

/** Drive pick → configure → generate, then deliver `variants` over SSE. */
async function driveToCycling(
  handle: Awaited<ReturnType<typeof init>>,
  node: HTMLElement,
  variants: Array<{ id: string; css: string; rationale: string }>,
): Promise<void> {
  handle.pick();
  await waitFade(); // picking render
  // Click the target — picker's capture-phase click listener fires pick-confirm.
  node.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  expect(handle.state().kind).toBe("configuring");
  await waitFade(); // configuring render (textarea + Generate)

  // Type a prompt — the Generate button no-ops on empty text.
  const textarea = document.querySelector<HTMLTextAreaElement>("textarea");
  expect(textarea, "prompt textarea present in configuring mode").toBeTruthy();
  textarea!.value = "make it bolder";
  textarea!.dispatchEvent(new Event("input", { bubbles: true }));

  // Find + click the Generate button in the floating bar.
  const generate = Array.from(
    document.querySelectorAll<HTMLButtonElement>("button"),
  ).find((b) => b.textContent?.trim() === "Generate");
  expect(generate, "Generate button present in configuring mode").toBeTruthy();
  generate!.click();
  expect(handle.state().kind).toBe("generating");
  await waitFade(); // generating render

  pushSse({ kind: "cycling", variants, activeIndex: 0 } as unknown as BridgeEvent);
  expect(handle.state().kind).toBe("cycling");
  await waitFade(); // cycling render (cards + param slider + morph)
}

describe("cycling — zero-roundtrip (finding #2)", () => {
  it("cycle-set-active does NOT tear down/rebuild the variant host", async () => {
    const handle = await init({ bridgeUrl: "http://127.0.0.1:8400", token: "t" });
    const node = makeTarget();
    await driveToCycling(handle, node, [
      { id: "a", css: ":scope { color: red; }", rationale: "ra" },
      { id: "b", css: ":scope { color: blue; }", rationale: "rb" },
    ]);

    const host1 = document.querySelector("[data-wisp-variants-host]");
    expect(host1).not.toBeNull();

    // Click variant card 1 (cycle-set-active) — must update in place.
    const card1 = document.querySelector<HTMLElement>('[data-wisp-variant-card="1"]');
    expect(card1).not.toBeNull();
    card1!.click();
    expect(handle.state().kind).toBe("cycling");

    // Exactly ONE host, same identity (no teardown+rebuild).
    const hosts = document.querySelectorAll("[data-wisp-variants-host]");
    expect(hosts).toHaveLength(1);
    expect(hosts[0]).toBe(host1);

    handle.teardown();
  });

  it("does NOT re-POST a cycling bridge event on every active-index tick", async () => {
    const handle = await init({ bridgeUrl: "http://127.0.0.1:8400", token: "t" });
    const node = makeTarget();
    await driveToCycling(handle, node, [
      { id: "a", css: ":scope { color: red; }", rationale: "ra" },
      { id: "b", css: ":scope { color: blue; }", rationale: "rb" },
    ]);

    const before = postedKinds(fetchMock).filter((k) => k === "cycling").length;
    // Drive several in-place active-index changes.
    document.querySelector<HTMLElement>('[data-wisp-variant-card="1"]')!.click();
    document.querySelector<HTMLElement>('[data-wisp-variant-card="0"]')!.click();
    document.querySelector<HTMLElement>('[data-wisp-variant-card="1"]')!.click();
    const after = postedKinds(fetchMock).filter((k) => k === "cycling").length;

    // At most one cycling POST per active change is acceptable, but a full
    // re-POST storm (one per tick from a teardown/rebuild) is the regression.
    // The fix posts cycling only on variant-set arrival, so the delta is 0.
    expect(after - before).toBe(0);

    handle.teardown();
  });
});

describe("offline-fallback rationale (finding #7)", () => {
  it("states the real placeholder timeout (5 min), not a stale 30s", async () => {
    vi.useFakeTimers();
    try {
      const handle = await init({ bridgeUrl: "http://127.0.0.1:8400", token: "t" });
      const node = makeTarget();

      handle.pick();
      vi.advanceTimersByTime(90); // picking render
      node.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      vi.advanceTimersByTime(90); // configuring render
      const textarea = document.querySelector<HTMLTextAreaElement>("textarea")!;
      textarea.value = "make it bolder";
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
      const generate = Array.from(
        document.querySelectorAll<HTMLButtonElement>("button"),
      ).find((b) => b.textContent?.trim() === "Generate")!;
      generate.click();
      expect(handle.state().kind).toBe("generating");

      // Fire the placeholder timeout (300_000 ms) — no SSE variants arrived.
      vi.advanceTimersByTime(300_000);
      const st = handle.state();
      expect(st.kind).toBe("cycling");
      const first = (st as { variants: Array<{ rationale: string }> }).variants[0];
      expect(first?.rationale).toContain("5 min");
      expect(first?.rationale).not.toContain("30s");

      handle.teardown();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("morph / param-change reaches the live preview (finding #3)", () => {
  it("a param change writes the CSS var onto the active @scope root", async () => {
    const handle = await init({ bridgeUrl: "http://127.0.0.1:8400", token: "t" });
    const node = makeTarget();
    await driveToCycling(handle, node, [
      {
        id: "a",
        css: ':scope { /* @param: kind=range min=0 max=24 step=2 label="pad" */ --wisp-pad: 8px; }',
        rationale: "ra",
      },
      {
        id: "b",
        css: ':scope { /* @param: kind=range min=0 max=24 step=2 label="pad" */ --wisp-pad: 16px; }',
        rationale: "rb",
      },
    ]);

    // Drive the parameter slider that index.ts mounted for the active variant.
    const slider = Array.from(
      document.querySelectorAll<HTMLInputElement>('input[type="range"]'),
    ).find((i) => i.getAttribute("data-wisp-ui") === "param");
    expect(slider, "parameter slider mounted for active variant").toBeTruthy();
    slider!.value = "20";
    slider!.dispatchEvent(new Event("input"));

    // The active @scope root (variant 0 host) must carry the new value.
    const sib0 = document.querySelector<HTMLElement>(
      '[data-wisp-variant="0"]',
    );
    expect(sib0).not.toBeNull();
    expect(sib0!.style.getPropertyValue("--wisp-pad")).toBe("20px");

    handle.teardown();
  });
});
