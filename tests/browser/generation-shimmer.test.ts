// wisp-design — Phase 7.14 generation-shimmer tests.
//
// Mount/unmount semantics and basic positioning. We don't assert exact
// pixel values because jsdom's getBoundingClientRect returns zeros for
// nodes that aren't laid out, so we test what's observable: that the
// overlay exists, has the right data-attributes, gets removed cleanly,
// and the stylesheet is injected exactly once across multiple mounts.

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { mountShimmer } from "../../src/browser/generation-shimmer.js";
import { WISP_UI_DATA_ATTRIBUTE as W } from "../../src/browser/constants.js";

function mkArticle(id: string): HTMLElement {
  const el = document.createElement("article");
  el.id = id;
  el.style.width = "200px";
  el.style.height = "100px";
  document.body.appendChild(el);
  return el;
}

beforeEach(() => {
  document.body.innerHTML = "";
  document.head.innerHTML = "";
});

afterEach(() => {
  document.body.innerHTML = "";
  document.head.innerHTML = "";
});

describe("mountShimmer — basic lifecycle", () => {
  it("creates an overlay with data-wisp-ui='shimmer-overlay'", () => {
    mkArticle("t1");
    const h = mountShimmer({
      targets: [{ selector: "#t1", rect: { x: 10, y: 20, w: 200, h: 100 } }],
    });
    const overlays = document.querySelectorAll(`[${W}="shimmer-overlay"]`);
    expect(overlays.length).toBe(1);
    h.unmount();
  });

  it("injects the shimmer stylesheet once across multiple mounts", () => {
    mkArticle("t1");
    mkArticle("t2");
    const h1 = mountShimmer({
      targets: [{ selector: "#t1", rect: { x: 0, y: 0, w: 100, h: 50 } }],
    });
    const h2 = mountShimmer({
      targets: [{ selector: "#t2", rect: { x: 0, y: 0, w: 100, h: 50 } }],
    });
    const styles = document.querySelectorAll(`style[${W}="shimmer-styles"]`);
    expect(styles.length).toBe(1);
    h1.unmount();
    h2.unmount();
  });

  it("creates one overlay per target (multi-select case)", () => {
    mkArticle("t1");
    mkArticle("t2");
    mkArticle("t3");
    const h = mountShimmer({
      targets: [
        { selector: "#t1", rect: { x: 0, y: 0, w: 100, h: 50 } },
        { selector: "#t2", rect: { x: 100, y: 0, w: 100, h: 50 } },
        { selector: "#t3", rect: { x: 200, y: 0, w: 100, h: 50 } },
      ],
    });
    expect(document.querySelectorAll(`[${W}="shimmer-overlay"]`).length).toBe(3);
    h.unmount();
  });

  it("each overlay carries a 'Designing variants…' label by default", () => {
    mkArticle("t1");
    const h = mountShimmer({
      targets: [{ selector: "#t1", rect: { x: 0, y: 0, w: 200, h: 100 } }],
    });
    const label = document.querySelector(`[${W}="shimmer-label"]`);
    expect(label).not.toBeNull();
    expect(label?.textContent).toBe("Designing variants…");
    h.unmount();
  });

  it("accepts a custom label", () => {
    mkArticle("t1");
    const h = mountShimmer({
      targets: [{ selector: "#t1", rect: { x: 0, y: 0, w: 200, h: 100 } }],
      label: "Thinking…",
    });
    const label = document.querySelector(`[${W}="shimmer-label"]`);
    expect(label?.textContent).toBe("Thinking…");
    h.unmount();
  });
});

describe("mountShimmer — unmount cleanup", () => {
  it("removes the overlay from the DOM on unmount", () => {
    mkArticle("t1");
    const h = mountShimmer({
      targets: [{ selector: "#t1", rect: { x: 0, y: 0, w: 200, h: 100 } }],
    });
    expect(document.querySelectorAll(`[${W}="shimmer-overlay"]`).length).toBe(1);
    h.unmount();
    expect(document.querySelectorAll(`[${W}="shimmer-overlay"]`).length).toBe(0);
  });

  it("removes ALL overlays in multi-target case", () => {
    mkArticle("t1");
    mkArticle("t2");
    const h = mountShimmer({
      targets: [
        { selector: "#t1", rect: { x: 0, y: 0, w: 100, h: 50 } },
        { selector: "#t2", rect: { x: 0, y: 0, w: 100, h: 50 } },
      ],
    });
    expect(document.querySelectorAll(`[${W}="shimmer-overlay"]`).length).toBe(2);
    h.unmount();
    expect(document.querySelectorAll(`[${W}="shimmer-overlay"]`).length).toBe(0);
  });

  it("is safe to call unmount twice", () => {
    mkArticle("t1");
    const h = mountShimmer({
      targets: [{ selector: "#t1", rect: { x: 0, y: 0, w: 200, h: 100 } }],
    });
    h.unmount();
    expect(() => h.unmount()).not.toThrow();
  });

  it("leaves the stylesheet behind on unmount (cheap to re-use)", () => {
    mkArticle("t1");
    const h = mountShimmer({
      targets: [{ selector: "#t1", rect: { x: 0, y: 0, w: 200, h: 100 } }],
    });
    h.unmount();
    const styles = document.querySelectorAll(`style[${W}="shimmer-styles"]`);
    expect(styles.length).toBe(1);
  });
});

describe("mountShimmer — positioning", () => {
  it("overlay carries the shimmer-overlay marker attribute", () => {
    mkArticle("t1");
    const h = mountShimmer({
      targets: [{ selector: "#t1", rect: { x: 42, y: 84, w: 256, h: 128 } }],
    });
    const overlay = document.querySelector(`[${W}="shimmer-overlay"]`) as HTMLElement;
    // jsdom's getBoundingClientRect returns zeros for non-laid-out nodes, so
    // we can't assert the final inline left/top precisely. We assert the
    // structural marker plus the fact that inline left/top/width/height
    // were set (any value, including 0px). `position:absolute` is in the
    // injected stylesheet — not inline — so we don't read it from `.style`.
    expect(overlay.getAttribute(W)).toBe("shimmer-overlay");
    expect(overlay.style.left).not.toBe("");
    expect(overlay.style.top).not.toBe("");
    expect(overlay.style.width).not.toBe("");
    expect(overlay.style.height).not.toBe("");
    h.unmount();
  });

  it("non-existent selector still mounts (best-effort, no throw)", () => {
    const h = mountShimmer({
      targets: [{ selector: "#does-not-exist", rect: { x: 0, y: 0, w: 100, h: 50 } }],
    });
    // Overlay is created from the rect even if the element isn't found.
    expect(document.querySelectorAll(`[${W}="shimmer-overlay"]`).length).toBe(1);
    h.unmount();
  });

  it("invalid selector does not throw", () => {
    expect(() =>
      mountShimmer({
        targets: [{ selector: "###bad###", rect: { x: 0, y: 0, w: 100, h: 50 } }],
      }),
    ).not.toThrow();
  });
});

describe("mountShimmer — reposition handle", () => {
  it("exposes a reposition() method that is callable", () => {
    mkArticle("t1");
    const h = mountShimmer({
      targets: [{ selector: "#t1", rect: { x: 0, y: 0, w: 200, h: 100 } }],
    });
    expect(typeof h.reposition).toBe("function");
    expect(() => h.reposition()).not.toThrow();
    h.unmount();
  });
});

describe("mountShimmer — accessibility", () => {
  it("overlay has aria-hidden='true' (decorative)", () => {
    mkArticle("t1");
    const h = mountShimmer({
      targets: [{ selector: "#t1", rect: { x: 0, y: 0, w: 200, h: 100 } }],
    });
    const overlay = document.querySelector(`[${W}="shimmer-overlay"]`);
    expect(overlay?.getAttribute("aria-hidden")).toBe("true");
    h.unmount();
  });

  it("stylesheet includes prefers-reduced-motion media query", () => {
    mkArticle("t1");
    const h = mountShimmer({
      targets: [{ selector: "#t1", rect: { x: 0, y: 0, w: 200, h: 100 } }],
    });
    const style = document.querySelector(`style[${W}="shimmer-styles"]`);
    expect(style?.textContent).toContain("prefers-reduced-motion");
    expect(style?.textContent).toContain("animation: none");
    h.unmount();
  });
});
