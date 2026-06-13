// @vitest-environment jsdom
//
// wisp-design — code-snippet popup (Phase 7.17).
//
// The configure mode gains a "</> Code snippet" button below the prompt
// textarea. It opens a popup with a large monospace textarea whose content
// rides on the `generating` bridge event as `codeSnippet`. Pinned here:
//
//   1. Button present in configuring mode; popup opens and Apply stages.
//   2. Snippet-only generate submits (freeText may be empty).
//   3. Text+snippet generate carries both.
//   4. Fully empty generate still no-ops.
//   5. ESC with the popup open closes ONLY the popup (flow survives).
//   6. configure-submit threads codeSnippet into the generating state.
//   7. Bridge schema accepts codeSnippet + empty freeText.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { init } from "../../src/browser/index.js";
import { createStateMachine } from "../../src/browser/state-machine.js";
import {
  GeneratingEventSchema,
  type BridgeEvent,
} from "../../src/contracts/bridge.js";

interface FakeES {
  url: string;
  onmessage: ((m: MessageEvent) => void) | null;
  close: () => void;
}

let lastES: FakeES | null = null;
const origFetch = globalThis.fetch;
const origEventSource = (globalThis as { EventSource?: unknown }).EventSource;

function waitFade(): Promise<void> {
  return new Promise((r) => setTimeout(r, 90));
}

let fetchMock: ReturnType<typeof vi.fn>;

function postedEvents(): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  for (const call of fetchMock.mock.calls) {
    const init = call[1] as RequestInit | undefined;
    if (init?.method === "POST" && typeof init.body === "string") {
      try {
        out.push(JSON.parse(init.body) as Record<string, unknown>);
      } catch {
        /* ignore */
      }
    }
  }
  return out;
}

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

function makeTarget(): HTMLElement {
  const node = document.createElement("div");
  node.id = "hero";
  node.textContent = "Hero";
  document.body.appendChild(node);
  node.getBoundingClientRect = () =>
    ({ x: 10, y: 10, width: 200, height: 80, top: 10, left: 10, right: 210, bottom: 90, toJSON: () => ({}) } as DOMRect);
  document.elementFromPoint = () => node;
  return node;
}

/** pick → configuring; returns nothing (bar DOM is queried directly). */
async function driveToConfiguring(
  handle: Awaited<ReturnType<typeof init>>,
  node: HTMLElement,
): Promise<void> {
  handle.pick();
  await waitFade();
  node.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  expect(handle.state().kind).toBe("configuring");
  await waitFade();
}

function findButton(label: string): HTMLButtonElement | undefined {
  return Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
    (b) => b.textContent?.trim() === label,
  );
}

const SNIPPET = "const Button = styled.button`color: red;`;";

function applySnippet(code: string): void {
  findButton("</> Code snippet")!.click();
  const area = document.querySelector<HTMLTextAreaElement>(
    '[data-wisp-ui="snippet-popup"] textarea',
  );
  expect(area, "snippet popup textarea").toBeTruthy();
  area!.value = code;
  area!.dispatchEvent(new Event("input", { bubbles: true }));
  findButton("Apply")!.click();
}

describe("code-snippet popup (Phase 7.17)", () => {
  it("configuring shows the snippet button; Apply stages and shows a badge", async () => {
    const handle = await init({ bridgeUrl: "http://127.0.0.1:8400", token: "t" });
    const node = makeTarget();
    await driveToConfiguring(handle, node);

    expect(findButton("</> Code snippet"), "snippet button").toBeTruthy();
    applySnippet(SNIPPET);

    // Popup gone, badge visible with a size hint.
    expect(document.querySelector('[data-wisp-ui="snippet-popup-backdrop"]')).toBeNull();
    const badge = document.querySelector<HTMLElement>('[data-wisp-ui="snippet-badge"]');
    expect(badge?.textContent).toContain("chars");

    handle.teardown();
  });

  it("snippet-only generate submits — generating event carries codeSnippet, empty freeText", async () => {
    const handle = await init({ bridgeUrl: "http://127.0.0.1:8400", token: "t" });
    const node = makeTarget();
    await driveToConfiguring(handle, node);

    applySnippet(SNIPPET);
    findButton("Generate")!.click();

    expect(handle.state().kind).toBe("generating");
    const gen = postedEvents().find((e) => e.kind === "generating");
    expect(gen, "generating event POSTed").toBeTruthy();
    expect(gen!.codeSnippet).toBe(SNIPPET);
    expect(gen!.freeText).toBe("");

    handle.teardown();
  });

  it("text + snippet generate carries both", async () => {
    const handle = await init({ bridgeUrl: "http://127.0.0.1:8400", token: "t" });
    const node = makeTarget();
    await driveToConfiguring(handle, node);

    const textarea = document.querySelector<HTMLTextAreaElement>("textarea")!;
    textarea.value = "make it look like this";
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    applySnippet(SNIPPET);
    findButton("Generate")!.click();

    const gen = postedEvents().find((e) => e.kind === "generating");
    expect(gen!.freeText).toBe("make it look like this");
    expect(gen!.codeSnippet).toBe(SNIPPET);

    handle.teardown();
  });

  it("fully empty generate still no-ops", async () => {
    const handle = await init({ bridgeUrl: "http://127.0.0.1:8400", token: "t" });
    const node = makeTarget();
    await driveToConfiguring(handle, node);

    findButton("Generate")!.click();
    expect(handle.state().kind).toBe("configuring");

    handle.teardown();
  });

  it("ESC closes only the popup — configure flow survives", async () => {
    const handle = await init({ bridgeUrl: "http://127.0.0.1:8400", token: "t" });
    const node = makeTarget();
    await driveToConfiguring(handle, node);

    findButton("</> Code snippet")!.click();
    expect(document.querySelector('[data-wisp-ui="snippet-popup-backdrop"]')).toBeTruthy();

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(document.querySelector('[data-wisp-ui="snippet-popup-backdrop"]')).toBeNull();
    expect(handle.state().kind).toBe("configuring");

    handle.teardown();
  });
});

describe("state machine — configure-submit threads codeSnippet", () => {
  it("generating state carries codeSnippet; empty/missing stays absent", () => {
    const m = createStateMachine({
      kind: "configuring",
      targets: [
        {
          id: "x",
          selector: "#x",
          tag: "div",
          rect: { x: 0, y: 0, w: 10, h: 10 },
          attributes: {},
          textPreview: "",
        } as never,
      ],
      freeText: "",
    });
    m.send("configure-submit", { requestedVariantCount: 3, codeSnippet: SNIPPET });
    const st = m.current().state;
    expect(st.kind).toBe("generating");
    expect((st as { codeSnippet?: string }).codeSnippet).toBe(SNIPPET);

    const m2 = createStateMachine({
      kind: "configuring",
      targets: [],
      freeText: "hi",
    });
    m2.send("configure-submit", { requestedVariantCount: 3, codeSnippet: "" });
    expect(
      (m2.current().state as { codeSnippet?: string }).codeSnippet,
    ).toBeUndefined();
  });
});

describe("bridge schema — generating event with codeSnippet", () => {
  const base = {
    kind: "generating" as const,
    target: { selector: "#x", rect: { x: 0, y: 0, w: 10, h: 10 }, tag: "DIV" },
    variantCount: 3,
    sessionId: "s",
  };

  it("accepts snippet-only (empty freeText)", () => {
    const r = GeneratingEventSchema.safeParse({
      ...base,
      freeText: "",
      codeSnippet: SNIPPET,
    } satisfies BridgeEvent & Record<string, unknown>);
    expect(r.success).toBe(true);
  });

  it("accepts text-only without codeSnippet (back-compat)", () => {
    const r = GeneratingEventSchema.safeParse({ ...base, freeText: "bolder" });
    expect(r.success).toBe(true);
  });

  it("rejects an oversized snippet (> 20000 chars)", () => {
    const r = GeneratingEventSchema.safeParse({
      ...base,
      freeText: "",
      codeSnippet: "x".repeat(20001),
    });
    expect(r.success).toBe(false);
  });
});
