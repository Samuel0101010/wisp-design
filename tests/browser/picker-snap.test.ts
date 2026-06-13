// @vitest-environment jsdom
//
// wisp-design — opacity:0 snap (Phase 7.19).
//
// User-reported: picking a theme switch hit its invisible checkbox-hack
// <input style="opacity:0"> — the variant host captured ONLY the input, so
// the styled sibling (.slider) kept rendering underneath the variant
// ("the original is still visible on top"). Pinned here:
//
//   1. pickable() rejects fully transparent elements.
//   2. snapToVisible() climbs from the invisible input to the <label>.
//   3. A click through attachPicker picks the LABEL, not the input.

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  attachPicker,
  pickable,
  snapToVisible,
} from "../../src/browser/picker.js";
import type { PickResult } from "../../src/contracts/browser.js";

/** The exact switch anatomy from the report: invisible input over a slider. */
function setupSwitch(): { label: HTMLElement; input: HTMLElement } {
  const label = document.createElement("label");
  label.className = "theme-switch";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.className = "theme-switch__input";
  input.style.opacity = "0";
  const slider = document.createElement("span");
  slider.className = "theme-switch__slider";
  label.appendChild(input);
  label.appendChild(slider);
  document.body.appendChild(label);

  // jsdom rects are 0×0 — give both elements a pickable box.
  const rect = { x: 10, y: 10, width: 52, height: 28, top: 10, left: 10, right: 62, bottom: 38, toJSON: () => ({}) } as DOMRect;
  label.getBoundingClientRect = () => rect;
  input.getBoundingClientRect = () => rect;
  return { label, input };
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("opacity:0 snap (Phase 7.19)", () => {
  it("pickable() rejects a fully transparent element", () => {
    const { label, input } = setupSwitch();
    expect(pickable(input)).toBe(false);
    expect(pickable(label)).toBe(true);
  });

  it("snapToVisible() climbs from the invisible input to the label", () => {
    const { label, input } = setupSwitch();
    expect(snapToVisible(input)).toBe(label);
    expect(snapToVisible(label)).toBe(label);
  });

  it("a click on the invisible input picks the LABEL", () => {
    const { label, input } = setupSwitch();
    const onPick = vi.fn<(r: PickResult, m: boolean) => void>();
    const detach = attachPicker({
      onHover: () => undefined,
      onPick,
    });

    input.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

    expect(onPick).toHaveBeenCalledTimes(1);
    const result = onPick.mock.calls[0]![0];
    expect(result.tag.toLowerCase()).toBe("label");
    expect(result.selector).toContain("theme-switch");

    detach();
  });
});
