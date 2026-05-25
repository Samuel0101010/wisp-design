// wisp-design — floating-bar keyboard tests (Phase 7).
//
// Verifies that `attachKeyboard` emits the correct KeyboardAction for each
// key, and that events are NOT fired when focus is inside a textarea/input.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createFloatingBar } from "../../src/browser/floating-bar.js";
import type { KeyboardAction, FloatingBarOptions } from "../../src/browser/floating-bar.js";
import type { BrowserState, SanitizeModule } from "../../src/contracts/browser.js";
import { WISP_UI_DATA_ATTRIBUTE } from "../../src/browser/constants.js";

// ---------------------------------------------------------------------------
// stub
// ---------------------------------------------------------------------------

const sanitize: SanitizeModule = {
  escapeHtml: (s) => s,
  sanitizeFreeText: (s, opts) => s.slice(0, opts?.maxLen ?? 4000),
  trustedCssVar: (v, val) => ({ ok: true as const, varName: v, value: val }),
  trustedSelector: (s) => ({ ok: true as const, selector: s }),
};

function makeOpts(overrides?: Partial<FloatingBarOptions>): FloatingBarOptions {
  return {
    sanitize,
    onFreeTextChange: vi.fn(),
    onFreeTextSubmit: vi.fn(),
    onConfigureCancel: vi.fn(),
    onGenerateCancel: vi.fn(),
    onCycleNext: vi.fn(),
    onCyclePrev: vi.fn(),
    onCycleSetActive: vi.fn(),
    onParamChange: vi.fn(),
    onAccept: vi.fn(),
    onDiscard: vi.fn(),
    onAnnotationAdd: vi.fn(),
    onPickStart: vi.fn(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function fireKey(key: string, opts: { target?: EventTarget; metaKey?: boolean } = {}): void {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    metaKey: opts.metaKey ?? false,
  });
  const dispatched = opts.target ?? window;
  (dispatched as Window | HTMLElement).dispatchEvent(event);
}

function cyclingState(activeIndex = 0): BrowserState {
  return {
    kind: "cycling",
    targets: [],
    variants: [
      { id: "v0", css: "", cssVars: {}, rationale: "a" },
      { id: "v1", css: "", cssVars: {}, rationale: "b" },
    ],
    activeIndex,
    paramOverrides: {},
  };
}

function configuringState(): BrowserState {
  return { kind: "configuring", targets: [], freeText: "" };
}

function idleState(): BrowserState {
  return { kind: "idle" };
}

describe("attachKeyboard", () => {
  let bar: ReturnType<typeof createFloatingBar>;
  let actions: KeyboardAction[];
  let detach: () => void;

  beforeEach(() => {
    bar = createFloatingBar(makeOpts());
    actions = [];
  });

  afterEach(() => {
    detach?.();
    bar.teardown();
    document
      .querySelectorAll(`style[${WISP_UI_DATA_ATTRIBUTE}="bar-styles"]`)
      .forEach((s) => s.remove());
  });

  // ----- Escape -----

  it("Escape in idle → cancel", () => {
    let s: BrowserState = idleState();
    detach = bar.attachKeyboard({ state: () => s, onAction: (a) => actions.push(a) });
    fireKey("Escape");
    expect(actions).toContain("cancel");
  });

  it("Escape in cycling → cancel", () => {
    let s: BrowserState = cyclingState();
    detach = bar.attachKeyboard({ state: () => s, onAction: (a) => actions.push(a) });
    fireKey("Escape");
    expect(actions).toContain("cancel");
  });

  // ----- Enter -----

  it("Enter in configuring → submit", () => {
    let s: BrowserState = configuringState();
    detach = bar.attachKeyboard({ state: () => s, onAction: (a) => actions.push(a) });
    fireKey("Enter");
    expect(actions).toContain("submit");
  });

  it("Enter in cycling → accept", () => {
    let s: BrowserState = cyclingState();
    detach = bar.attachKeyboard({ state: () => s, onAction: (a) => actions.push(a) });
    fireKey("Enter");
    expect(actions).toContain("accept");
  });

  it("Enter in idle → no action", () => {
    let s: BrowserState = idleState();
    detach = bar.attachKeyboard({ state: () => s, onAction: (a) => actions.push(a) });
    fireKey("Enter");
    expect(actions).toHaveLength(0);
  });

  // ----- Arrow keys -----

  it("ArrowLeft in cycling → cycle-prev", () => {
    let s: BrowserState = cyclingState();
    detach = bar.attachKeyboard({ state: () => s, onAction: (a) => actions.push(a) });
    fireKey("ArrowLeft");
    expect(actions).toContain("cycle-prev");
  });

  it("ArrowRight in cycling → cycle-next", () => {
    let s: BrowserState = cyclingState();
    detach = bar.attachKeyboard({ state: () => s, onAction: (a) => actions.push(a) });
    fireKey("ArrowRight");
    expect(actions).toContain("cycle-next");
  });

  it("ArrowLeft in configuring → no action", () => {
    let s: BrowserState = configuringState();
    detach = bar.attachKeyboard({ state: () => s, onAction: (a) => actions.push(a) });
    fireKey("ArrowLeft");
    expect(actions).toHaveLength(0);
  });

  // ----- Delete / Backspace -----

  it("Delete in cycling → discard", () => {
    let s: BrowserState = cyclingState();
    detach = bar.attachKeyboard({ state: () => s, onAction: (a) => actions.push(a) });
    fireKey("Delete");
    expect(actions).toContain("discard");
  });

  it("Backspace in cycling → discard", () => {
    let s: BrowserState = cyclingState();
    detach = bar.attachKeyboard({ state: () => s, onAction: (a) => actions.push(a) });
    fireKey("Backspace");
    expect(actions).toContain("discard");
  });

  // ----- Digit keys 1–8 -----

  it.each([
    ["1", "select-variant-0"],
    ["2", "select-variant-1"],
    ["3", "select-variant-2"],
    ["4", "select-variant-3"],
    ["5", "select-variant-4"],
    ["6", "select-variant-5"],
    ["7", "select-variant-6"],
    ["8", "select-variant-7"],
  ] as const)('"%s" in cycling → %s', (key, expected) => {
    let s: BrowserState = cyclingState();
    detach = bar.attachKeyboard({ state: () => s, onAction: (a) => actions.push(a) });
    fireKey(key);
    expect(actions).toContain(expected);
  });

  it("digit key in configuring → no action", () => {
    let s: BrowserState = configuringState();
    detach = bar.attachKeyboard({ state: () => s, onAction: (a) => actions.push(a) });
    fireKey("1");
    expect(actions).toHaveLength(0);
  });

  // ----- textarea focus guard -----

  it("does NOT fire when target is a textarea", () => {
    let s: BrowserState = cyclingState();
    detach = bar.attachKeyboard({ state: () => s, onAction: (a) => actions.push(a) });

    const textarea = document.createElement("textarea");
    document.body.appendChild(textarea);
    textarea.focus();

    fireKey("ArrowLeft", { target: textarea });
    fireKey("Delete", { target: textarea });
    fireKey("Enter", { target: textarea });
    // Only Escape is allowed through even in textarea (standard UX)

    expect(actions.filter((a) => a !== "cancel")).toHaveLength(0);

    textarea.remove();
  });

  it("does NOT fire when target is an <input>", () => {
    let s: BrowserState = cyclingState();
    detach = bar.attachKeyboard({ state: () => s, onAction: (a) => actions.push(a) });

    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();

    fireKey("1", { target: input });
    fireKey("ArrowRight", { target: input });

    expect(actions).toHaveLength(0);

    input.remove();
  });

  // ----- detach -----

  it("detach removes the listener — no more actions", () => {
    let s: BrowserState = cyclingState();
    detach = bar.attachKeyboard({ state: () => s, onAction: (a) => actions.push(a) });
    detach();
    fireKey("ArrowLeft");
    expect(actions).toHaveLength(0);
  });
});
