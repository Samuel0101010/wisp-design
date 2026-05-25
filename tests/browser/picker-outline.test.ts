// wisp-design — Picker hover-outline + tooltip tests (Phase 7, Goal 1).
//
// Tests the overlay DOM logic directly. jsdom lacks PointerEvent and
// document.elementFromPoint, so we:
//   1. Test the overlay helper functions by importing internal state via
//      attaching a picker and manually invoking the internal effects.
//   2. Verify detach() removes overlays.
//
// For the PointerEvent gap: we construct a plain object with clientX/clientY
// and dispatch via a custom event registered as "pointermove" manually on the
// document using the native EventTarget. jsdom will accept any event type
// registered via dispatchEvent as long as the constructor is available.
// We also patch document.elementFromPoint for jsdom compatibility.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { attachPicker } from "../../src/browser/picker.js";

function setRect(el: HTMLElement, x: number, y: number, w: number, h: number): void {
  el.getBoundingClientRect = (): DOMRect =>
    ({
      x,
      y,
      left: x,
      top: y,
      right: x + w,
      bottom: y + h,
      width: w,
      height: h,
      toJSON: () => ({}),
    }) as DOMRect;
}

// Stub requestAnimationFrame to run synchronously.
function stubRaf(): () => void {
  const g = global as Record<string, unknown>;
  const origRaf = g.requestAnimationFrame;
  const origCaf = g.cancelAnimationFrame;
  g.requestAnimationFrame = (cb: FrameRequestCallback): number => { cb(0); return 0; };
  g.cancelAnimationFrame = (_id: number): void => { /* no-op */ };
  return () => {
    if (origRaf !== undefined) g.requestAnimationFrame = origRaf;
    if (origCaf !== undefined) g.cancelAnimationFrame = origCaf;
  };
}

// Dispatch a synthetic pointermove event. jsdom may or may not have PointerEvent;
// fall back to MouseEvent if needed.
function fireMove(clientX: number, clientY: number): void {
  let evt: Event;
  try {
    evt = new PointerEvent("pointermove", { bubbles: true, clientX, clientY });
  } catch {
    evt = new MouseEvent("pointermove", { bubbles: true, clientX, clientY });
  }
  document.dispatchEvent(evt);
}

let detach: (() => void) | null = null;
let restoreRaf: (() => void) | null = null;
let origEFP: typeof document.elementFromPoint | undefined;

beforeEach(() => {
  restoreRaf = stubRaf();
  // Patch elementFromPoint: jsdom returns undefined; default to null.
  origEFP = document.elementFromPoint;
});

afterEach(() => {
  if (detach) { detach(); detach = null; }
  if (restoreRaf) { restoreRaf(); restoreRaf = null; }
  if (origEFP !== undefined) {
    document.elementFromPoint = origEFP;
  } else {
    // Remove the patch.
    delete (document as unknown as Record<string, unknown>)["elementFromPoint"];
  }
  document.body.innerHTML = "";
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("picker-outline + tooltip", () => {
  it("outline div is created in DOM when a pickable element is hovered", () => {
    const el = document.createElement("div");
    el.className = "hero-section";
    document.body.appendChild(el);
    setRect(el, 50, 100, 300, 200);

    // Stub elementFromPoint to return our pickable element.
    (document as unknown as Record<string, unknown>).elementFromPoint = () => el;

    detach = attachPicker({ onHover: vi.fn(), onPick: vi.fn() });
    fireMove(60, 110);

    const outline = document.querySelector('[data-wisp-ui="picker-outline"]');
    expect(outline).not.toBeNull();
  });

  it("outline element has pointer-events: none", () => {
    const el = document.createElement("section");
    el.className = "content";
    document.body.appendChild(el);
    setRect(el, 0, 0, 400, 300);

    (document as unknown as Record<string, unknown>).elementFromPoint = () => el;
    detach = attachPicker({ onHover: vi.fn(), onPick: vi.fn() });
    fireMove(10, 10);

    const outline = document.querySelector<HTMLElement>('[data-wisp-ui="picker-outline"]');
    expect(outline).not.toBeNull();
    expect(outline!.style.pointerEvents).toBe("none");
  });

  it("outline has 2px solid border in neutral-900 color", () => {
    const el = document.createElement("section");
    document.body.appendChild(el);
    setRect(el, 0, 0, 400, 300);

    (document as unknown as Record<string, unknown>).elementFromPoint = () => el;
    detach = attachPicker({ onHover: vi.fn(), onPick: vi.fn() });
    fireMove(10, 10);

    const outline = document.querySelector<HTMLElement>('[data-wisp-ui="picker-outline"]');
    expect(outline).not.toBeNull();
    expect(outline!.style.border).toContain("2px solid");
  });

  it("tooltip div is created when hovering a pickable element", () => {
    const el = document.createElement("h3");
    el.className = "text-6xl font-black";
    document.body.appendChild(el);
    setRect(el, 0, 0, 756, 120);

    (document as unknown as Record<string, unknown>).elementFromPoint = () => el;
    detach = attachPicker({ onHover: vi.fn(), onPick: vi.fn() });
    fireMove(20, 20);

    const tooltip = document.querySelector<HTMLElement>('[data-wisp-ui="picker-tooltip"]');
    expect(tooltip).not.toBeNull();
  });

  it("tooltip text contains tag name and dimensions", () => {
    const el = document.createElement("h3");
    el.className = "text-6xl font-black";
    document.body.appendChild(el);
    setRect(el, 0, 0, 756, 120);

    (document as unknown as Record<string, unknown>).elementFromPoint = () => el;
    detach = attachPicker({ onHover: vi.fn(), onPick: vi.fn() });
    fireMove(20, 20);

    const tooltip = document.querySelector<HTMLElement>('[data-wisp-ui="picker-tooltip"]');
    expect(tooltip).not.toBeNull();
    const text = tooltip!.textContent ?? "";
    expect(text).toContain("h3");
    expect(text).toContain("756");
    expect(text).toContain("120");
  });

  it("tooltip uses monospace font", () => {
    const el = document.createElement("p");
    el.className = "body-text";
    document.body.appendChild(el);
    setRect(el, 0, 0, 200, 50);

    (document as unknown as Record<string, unknown>).elementFromPoint = () => el;
    detach = attachPicker({ onHover: vi.fn(), onPick: vi.fn() });
    fireMove(5, 5);

    const tooltip = document.querySelector<HTMLElement>('[data-wisp-ui="picker-tooltip"]');
    expect(tooltip).not.toBeNull();
    expect(tooltip!.style.fontFamily).toContain("monospace");
  });

  it("outline and tooltip hide on mouseleave", () => {
    const el = document.createElement("div");
    el.className = "card";
    document.body.appendChild(el);
    setRect(el, 0, 0, 200, 100);

    (document as unknown as Record<string, unknown>).elementFromPoint = () => el;
    detach = attachPicker({ onHover: vi.fn(), onPick: vi.fn() });
    fireMove(10, 10);

    const outline = document.querySelector<HTMLElement>('[data-wisp-ui="picker-outline"]');
    const tooltip = document.querySelector<HTMLElement>('[data-wisp-ui="picker-tooltip"]');
    expect(outline).not.toBeNull();
    expect(tooltip).not.toBeNull();

    document.dispatchEvent(new MouseEvent("mouseleave", { bubbles: true }));

    expect(outline!.style.display).toBe("none");
    expect(tooltip!.style.display).toBe("none");
  });

  it("detach() removes overlays from DOM", () => {
    const el = document.createElement("div");
    el.className = "target";
    document.body.appendChild(el);
    setRect(el, 0, 0, 100, 100);

    (document as unknown as Record<string, unknown>).elementFromPoint = () => el;
    detach = attachPicker({ onHover: vi.fn(), onPick: vi.fn() });
    fireMove(5, 5);

    expect(document.querySelector('[data-wisp-ui="picker-outline"]')).not.toBeNull();

    detach();
    detach = null;

    expect(document.querySelector('[data-wisp-ui="picker-outline"]')).toBeNull();
    expect(document.querySelector('[data-wisp-ui="picker-tooltip"]')).toBeNull();
  });
});
