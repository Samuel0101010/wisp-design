// wisp-design — Multi-select tests (Phase 2).
//
// Targets src/browser/multi-select.ts. jsdom env (default).

import { afterEach, describe, expect, it, vi } from "vitest";

import { attachMultiSelect } from "../../src/browser/multi-select.js";
import type { PickResult } from "../../src/contracts/browser.js";

function fakePickResult(el: HTMLElement, id: string): PickResult {
  return {
    id,
    selector: `#${el.id || el.tagName.toLowerCase()}`,
    tag: el.tagName.toLowerCase(),
    rect: { x: 0, y: 0, w: 100, h: 50 },
    attributes: {},
    textPreview: "",
  };
}

function dispatchClick(target: HTMLElement, meta = false): void {
  const evt = new MouseEvent("click", {
    bubbles: true,
    cancelable: true,
    metaKey: meta,
  });
  target.dispatchEvent(evt);
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("attachMultiSelect", () => {
  it("invokes onAdd when ⌘-click on an element", () => {
    const onAdd = vi.fn();
    const onRemove = vi.fn();
    const onClear = vi.fn();
    let counter = 0;

    const detach = attachMultiSelect({
      isModifierPressed: () => true,
      onAdd,
      onRemove,
      onClear,
      buildPickResult: (el) => fakePickResult(el, `id-${++counter}`),
    });

    const d = document.createElement("div");
    d.id = "x";
    document.body.appendChild(d);

    dispatchClick(d, true);

    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onRemove).not.toHaveBeenCalled();

    detach();
  });

  it("invokes onRemove on second ⌘-click on the same element (toggle)", () => {
    const onAdd = vi.fn();
    const onRemove = vi.fn();
    const onClear = vi.fn();
    let counter = 0;

    const detach = attachMultiSelect({
      isModifierPressed: () => true,
      onAdd,
      onRemove,
      onClear,
      buildPickResult: (el) => fakePickResult(el, `id-${++counter}`),
    });

    const d = document.createElement("div");
    document.body.appendChild(d);

    dispatchClick(d, true);
    dispatchClick(d, true);

    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onRemove).toHaveBeenCalledTimes(1);

    detach();
  });

  it("ignores click without modifier", () => {
    const onAdd = vi.fn();
    const detach = attachMultiSelect({
      isModifierPressed: () => false,
      onAdd,
      onRemove: vi.fn(),
      onClear: vi.fn(),
      buildPickResult: (el) => fakePickResult(el, "x"),
    });

    const d = document.createElement("div");
    document.body.appendChild(d);
    dispatchClick(d, false);

    expect(onAdd).not.toHaveBeenCalled();
    detach();
  });

  it("ignores ⌘-click on [data-wisp-ui] descendants", () => {
    const onAdd = vi.fn();
    const detach = attachMultiSelect({
      isModifierPressed: () => true,
      onAdd,
      onRemove: vi.fn(),
      onClear: vi.fn(),
      buildPickResult: (el) => fakePickResult(el, "x"),
    });

    const ui = document.createElement("div");
    ui.setAttribute("data-wisp-ui", "bar");
    const inner = document.createElement("button");
    ui.appendChild(inner);
    document.body.appendChild(ui);

    dispatchClick(inner, true);

    expect(onAdd).not.toHaveBeenCalled();
    detach();
  });

  it("detach removes listeners but keeps decorations (Phase 7.4 — badges persist into configuring)", () => {
    const onAdd = vi.fn();
    let counter = 0;
    const detach = attachMultiSelect({
      isModifierPressed: () => true,
      onAdd,
      onRemove: vi.fn(),
      onClear: vi.fn(),
      buildPickResult: (el) => fakePickResult(el, `id-${++counter}`),
    });

    const d = document.createElement("div");
    document.body.appendChild(d);
    dispatchClick(d, true);
    expect(d.hasAttribute("data-wisp-selected")).toBe(true);

    detach();

    // Decoration STAYS so the user can see selected elements while
    // configuring. `multi.clear()` is the explicit wipe signal — not detach.
    expect(d.hasAttribute("data-wisp-selected")).toBe(true);

    // Further clicks after detach are ignored.
    dispatchClick(d, true);
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it("ESC + modifier clears all decorations and calls onClear", () => {
    const onClear = vi.fn();
    let counter = 0;
    const detach = attachMultiSelect({
      isModifierPressed: () => true,
      onAdd: vi.fn(),
      onRemove: vi.fn(),
      onClear,
      buildPickResult: (el) => fakePickResult(el, `id-${++counter}`),
    });

    const d = document.createElement("div");
    document.body.appendChild(d);
    dispatchClick(d, true);
    expect(d.hasAttribute("data-wisp-selected")).toBe(true);

    const evt = new KeyboardEvent("keydown", {
      key: "Escape",
      metaKey: true,
      bubbles: true,
    });
    document.dispatchEvent(evt);

    expect(onClear).toHaveBeenCalledTimes(1);
    expect(d.hasAttribute("data-wisp-selected")).toBe(false);

    detach();
  });
});
