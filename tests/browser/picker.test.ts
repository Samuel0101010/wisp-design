// wisp-design — Picker module tests (Phase 2).
//
// Targets src/browser/picker.ts. jsdom env (default for tests/browser/**).

import { afterEach, describe, expect, it } from "vitest";

import {
  buildSelector,
  extractPickResult,
  pickable,
} from "../../src/browser/picker.js";

// jsdom's getBoundingClientRect returns zeroes for unstyled nodes — patch it
// per test to drive the size-based predicate. We restore via afterEach.
function setRect(el: HTMLElement, w: number, h: number): void {
  el.getBoundingClientRect = (): DOMRect =>
    ({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: w,
      bottom: h,
      width: w,
      height: h,
      toJSON() {
        return {};
      },
    }) as DOMRect;
}

afterEach(() => {
  document.body.innerHTML = "";
  document.head.querySelectorAll("style[data-test]").forEach((s) => s.remove());
});

// ---------------------------------------------------------------------------
// pickable
// ---------------------------------------------------------------------------

describe("pickable", () => {
  it("returns true for a 100×100 div", () => {
    const d = document.createElement("div");
    document.body.appendChild(d);
    setRect(d, 100, 100);
    expect(pickable(d)).toBe(true);
  });

  it("returns false for a 10×10 div (below MIN_PICKABLE_PX)", () => {
    const d = document.createElement("div");
    document.body.appendChild(d);
    setRect(d, 10, 10);
    expect(pickable(d)).toBe(false);
  });

  it("returns false for <html>", () => {
    expect(pickable(document.documentElement)).toBe(false);
  });

  it("returns false for <body>", () => {
    expect(pickable(document.body)).toBe(false);
  });

  it("returns false for <script>", () => {
    const s = document.createElement("script");
    document.body.appendChild(s);
    setRect(s, 100, 100);
    expect(pickable(s)).toBe(false);
  });

  it("returns false for descendants of [data-wisp-ui]", () => {
    const host = document.createElement("div");
    host.setAttribute("data-wisp-ui", "bar");
    const inner = document.createElement("div");
    host.appendChild(inner);
    document.body.appendChild(host);
    setRect(inner, 100, 100);
    expect(pickable(inner)).toBe(false);
  });

  it("returns false when visibility: hidden", () => {
    const d = document.createElement("div");
    d.style.visibility = "hidden";
    document.body.appendChild(d);
    setRect(d, 100, 100);
    expect(pickable(d)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// buildSelector
// ---------------------------------------------------------------------------

describe("buildSelector", () => {
  it("returns #id for an element with a simple id", () => {
    const d = document.createElement("div");
    d.id = "foo";
    document.body.appendChild(d);
    expect(buildSelector(d)).toBe("#foo");
  });

  it("builds a tag:nth-of-type chain when no id is present", () => {
    document.body.innerHTML = "<div><span></span></div>";
    const span = document.body.querySelector("span") as HTMLElement;
    const sel = buildSelector(span);
    // either `div:nth-of-type(1) > span:nth-of-type(1)` shape
    expect(sel).toMatch(/div:nth-of-type\(\d+\) > span:nth-of-type\(\d+\)/);
  });

  it("builds a deep chain for nested elements", () => {
    document.body.innerHTML =
      "<section><article><p><em></em></p></article></section>";
    const em = document.body.querySelector("em") as HTMLElement;
    const sel = buildSelector(em);
    expect(sel.split(" > ").length).toBeGreaterThanOrEqual(3);
    expect(sel).toContain("em:nth-of-type(1)");
  });

  it("anchors on an ancestor's id when one is found", () => {
    document.body.innerHTML = '<div id="anchor"><span></span></div>';
    const span = document.body.querySelector("span") as HTMLElement;
    const sel = buildSelector(span);
    expect(sel.startsWith("#anchor")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// extractPickResult
// ---------------------------------------------------------------------------

describe("extractPickResult", () => {
  it("returns a PickResult with id, selector, tag, rect, attributes, textPreview", () => {
    const d = document.createElement("div");
    d.id = "foo";
    d.setAttribute("role", "button");
    d.setAttribute("data-x", "1");
    d.textContent = "hello";
    document.body.appendChild(d);
    setRect(d, 120, 40);

    const r = extractPickResult(d);
    expect(typeof r.id).toBe("string");
    expect(r.id.length).toBeGreaterThan(0);
    expect(r.selector).toBe("#foo");
    expect(r.tag).toBe("div");
    expect(r.rect).toEqual({ x: 0, y: 0, w: 120, h: 40 });
    expect(r.attributes.id).toBe("foo");
    expect(r.attributes.role).toBe("button");
    expect(r.attributes["data-x"]).toBe("1");
    expect(r.textPreview).toBe("hello");
  });

  it("strips non-relevant attributes and excludes data-wisp-ui", () => {
    const d = document.createElement("div");
    d.setAttribute("aria-hidden", "true");
    d.setAttribute("data-wisp-ui", "internal");
    d.setAttribute("data-keep", "yes");
    document.body.appendChild(d);
    const r = extractPickResult(d);
    expect(r.attributes["aria-hidden"]).toBeUndefined();
    expect(r.attributes["data-wisp-ui"]).toBeUndefined();
    expect(r.attributes["data-keep"]).toBe("yes");
  });

  it("truncates textPreview at 80 chars with ellipsis", () => {
    const d = document.createElement("div");
    d.textContent = "x".repeat(200);
    document.body.appendChild(d);
    const r = extractPickResult(d);
    // 80 chars + ellipsis
    expect(r.textPreview.length).toBe(81);
    expect(r.textPreview.endsWith("…")).toBe(true);
  });

  it("collapses internal whitespace in textPreview", () => {
    const d = document.createElement("div");
    d.textContent = "  a    b\n\nc  ";
    document.body.appendChild(d);
    const r = extractPickResult(d);
    expect(r.textPreview).toBe("a b c");
  });
});
