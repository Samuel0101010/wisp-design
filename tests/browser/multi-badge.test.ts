// wisp-design — Multi-select badge tests (Phase 7, Goal 3).
//
// Verifies that createMultiSelect():
//   - Renders numbered badges over each picked element's top-right corner
//   - Badge shows 1-based index
//   - Indices refresh correctly after a removal
//   - clear() removes all badges
//   - Badges use correct style properties (18×18, neutral-900, white text)

import { afterEach, describe, expect, it } from "vitest";
import { createMultiSelect } from "../../src/browser/multi-select.js";
import type { PickResult } from "../../src/contracts/browser.js";

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
      toJSON() {
        return {};
      },
    }) as DOMRect;
}

/** Make a minimal PickResult pointing at `el`. */
function makeResult(el: HTMLElement, id: string): PickResult {
  const selector = `[data-testid="${id}"]`;
  el.setAttribute("data-testid", id);
  return {
    id,
    selector,
    tag: el.tagName.toLowerCase(),
    rect: { x: 0, y: 0, w: 100, h: 50 },
    attributes: {},
    textPreview: "",
  };
}

afterEach(() => {
  document.body.innerHTML = "";
  // Clean any leftover badge/selected attrs.
  document.querySelectorAll("[data-wisp-badge-for]").forEach((b) => b.remove());
  document.querySelectorAll("[data-wisp-selected]").forEach((el) =>
    el.removeAttribute("data-wisp-selected"),
  );
});

describe("multi-select badges", () => {
  it("renders a badge for each picked target", () => {
    const a = document.createElement("div");
    const b = document.createElement("div");
    setRect(a, 0, 0, 200, 100);
    setRect(b, 300, 0, 200, 100);
    document.body.appendChild(a);
    document.body.appendChild(b);

    const multi = createMultiSelect();
    multi.add(makeResult(a, "target-a"));
    multi.add(makeResult(b, "target-b"));

    const badges = document.querySelectorAll('[data-wisp-ui="multi-badge"]');
    expect(badges.length).toBe(2);
  });

  it("badge labels are 1-based consecutive integers", () => {
    const a = document.createElement("div");
    const b = document.createElement("div");
    const c = document.createElement("div");
    setRect(a, 0, 0, 100, 50);
    setRect(b, 0, 100, 100, 50);
    setRect(c, 0, 200, 100, 50);
    document.body.appendChild(a);
    document.body.appendChild(b);
    document.body.appendChild(c);

    const multi = createMultiSelect();
    multi.add(makeResult(a, "t1"));
    multi.add(makeResult(b, "t2"));
    multi.add(makeResult(c, "t3"));

    const badges = Array.from(
      document.querySelectorAll('[data-wisp-ui="multi-badge"]'),
    );
    const labels = badges.map((b) => b.textContent?.trim());
    expect(labels).toContain("1");
    expect(labels).toContain("2");
    expect(labels).toContain("3");
  });

  it("removing a target removes its badge and re-indexes survivors", () => {
    const a = document.createElement("div");
    const b = document.createElement("div");
    setRect(a, 0, 0, 100, 50);
    setRect(b, 0, 100, 100, 50);
    document.body.appendChild(a);
    document.body.appendChild(b);

    const multi = createMultiSelect();
    const ra = makeResult(a, "ra");
    const rb = makeResult(b, "rb");
    multi.add(ra);
    multi.add(rb);

    // Remove first target.
    multi.remove(ra.id);

    const badges = document.querySelectorAll('[data-wisp-ui="multi-badge"]');
    expect(badges.length).toBe(1);
    // Remaining badge should be "1" (re-indexed).
    expect(badges[0]?.textContent?.trim()).toBe("1");
  });

  it("clear() removes all badges", () => {
    const a = document.createElement("div");
    const b = document.createElement("div");
    setRect(a, 0, 0, 100, 50);
    setRect(b, 0, 100, 100, 50);
    document.body.appendChild(a);
    document.body.appendChild(b);

    const multi = createMultiSelect();
    multi.add(makeResult(a, "ca"));
    multi.add(makeResult(b, "cb"));

    multi.clear();

    const badges = document.querySelectorAll('[data-wisp-ui="multi-badge"]');
    expect(badges.length).toBe(0);
  });

  it("badge has correct style properties", () => {
    const el = document.createElement("div");
    setRect(el, 100, 100, 200, 100);
    document.body.appendChild(el);

    const multi = createMultiSelect();
    multi.add(makeResult(el, "styled-target"));

    const badge = document.querySelector<HTMLElement>('[data-wisp-ui="multi-badge"]');
    expect(badge).not.toBeNull();
    expect(badge!.style.width).toBe("18px");
    expect(badge!.style.height).toBe("18px");
    expect(badge!.style.borderRadius).toBe("50%");
    // jsdom normalizes #fff → rgb(255, 255, 255); accept either form.
    expect(["#fff", "rgb(255, 255, 255)", "white"]).toContain(badge!.style.color);
    expect(badge!.style.fontWeight).toBe("bold");
    expect(badge!.style.fontSize).toBe("11px");
    expect(badge!.style.pointerEvents).toBe("none");
  });

  it("badge is positioned near target's top-right corner", () => {
    const el = document.createElement("div");
    // right=200, top=50 → badge at left=200-9=191, top=50-9=41
    setRect(el, 0, 50, 200, 100);
    document.body.appendChild(el);

    const multi = createMultiSelect();
    multi.add(makeResult(el, "pos-target"));

    const badge = document.querySelector<HTMLElement>('[data-wisp-ui="multi-badge"]');
    expect(badge).not.toBeNull();
    // Position: right edge minus half-badge (9px), top minus half-badge (9px).
    expect(badge!.style.left).toBe("191px");
    expect(badge!.style.top).toBe("41px");
  });

  it("list() returns added targets in insertion order", () => {
    const a = document.createElement("div");
    const b = document.createElement("div");
    setRect(a, 0, 0, 100, 50);
    setRect(b, 0, 100, 100, 50);
    document.body.appendChild(a);
    document.body.appendChild(b);

    const multi = createMultiSelect();
    const ra = makeResult(a, "list-a");
    const rb = makeResult(b, "list-b");
    multi.add(ra);
    multi.add(rb);

    const listed = multi.list();
    expect(listed[0]?.id).toBe(ra.id);
    expect(listed[1]?.id).toBe(rb.id);
  });
});
