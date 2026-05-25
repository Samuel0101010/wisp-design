// wisp-design — floating-bar visual / CSS sanity tests (Phase 7).
//
// Verifies that the injected BAR_STYLES string:
//   - contains the correct neutral color tokens
//   - does NOT contain slop tokens (purple, blue, gradient, backdrop-filter)
//   - renders the correct DOM structure in each mode

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createFloatingBar } from "../../src/browser/floating-bar.js";
import type { FloatingBarOptions } from "../../src/browser/floating-bar.js";
import type { SanitizeModule } from "../../src/contracts/browser.js";
import { WISP_UI_DATA_ATTRIBUTE } from "../../src/browser/constants.js";

// ---------------------------------------------------------------------------
// minimal SanitizeModule stub
// ---------------------------------------------------------------------------

const sanitize: SanitizeModule = {
  escapeHtml: (s) => s,
  sanitizeFreeText: (s, opts) => s.slice(0, opts?.maxLen ?? 4000),
  trustedCssVar: (varName, value) => ({ ok: true as const, varName, value }),
  trustedSelector: (sel) => ({ ok: true as const, selector: sel }),
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

describe("floating-bar visual — CSS tokens", () => {
  let bar: ReturnType<typeof createFloatingBar>;

  beforeEach(() => {
    bar = createFloatingBar(makeOpts());
  });

  afterEach(() => {
    bar.teardown();
    // Clean up any leftover style tags
    document
      .querySelectorAll(`style[${WISP_UI_DATA_ATTRIBUTE}="bar-styles"]`)
      .forEach((s) => s.remove());
  });

  it("injects a <style> tag with bar-styles attribute", () => {
    const style = document.querySelector(`style[${WISP_UI_DATA_ATTRIBUTE}="bar-styles"]`);
    expect(style).not.toBeNull();
  });

  it("contains neutral-900 color token (rgb(23 23 23))", () => {
    const style = document.querySelector(`style[${WISP_UI_DATA_ATTRIBUTE}="bar-styles"]`);
    expect(style?.textContent).toContain("rgb(23 23 23)");
  });

  it("contains white background token (#fafafa)", () => {
    const style = document.querySelector(`style[${WISP_UI_DATA_ATTRIBUTE}="bar-styles"]`);
    expect(style?.textContent).toContain("#fafafa");
  });

  it("contains the layered shadow definition", () => {
    const style = document.querySelector(`style[${WISP_UI_DATA_ATTRIBUTE}="bar-styles"]`);
    expect(style?.textContent).toContain("0 8px 24px");
  });

  it("does NOT contain purple", () => {
    const style = document.querySelector(`style[${WISP_UI_DATA_ATTRIBUTE}="bar-styles"]`);
    expect(style?.textContent?.toLowerCase()).not.toContain("purple");
  });

  it("does NOT contain a blue hex or keyword (6366f1, #3b82f6, blue)", () => {
    const css = style()?.textContent?.toLowerCase() ?? "";
    expect(css).not.toContain("6366f1");
    expect(css).not.toContain("#3b82f6");
    expect(css).not.toContain("indigo");
    // "blue" as a standalone keyword — allow 'rgb(x x x)' notation
    expect(css).not.toMatch(/(?<![a-z])blue(?![a-z])/);
  });

  it("does NOT contain gradient", () => {
    const style = document.querySelector(`style[${WISP_UI_DATA_ATTRIBUTE}="bar-styles"]`);
    expect(style?.textContent?.toLowerCase()).not.toContain("gradient");
  });

  it("does NOT contain backdrop-filter", () => {
    const style = document.querySelector(`style[${WISP_UI_DATA_ATTRIBUTE}="bar-styles"]`);
    expect(style?.textContent?.toLowerCase()).not.toContain("backdrop-filter");
  });

  it("does NOT contain glassmorphism blur", () => {
    // blur( is used in backdrop filters for glassmorphism
    const style = document.querySelector(`style[${WISP_UI_DATA_ATTRIBUTE}="bar-styles"]`);
    expect(style?.textContent).not.toContain("blur(");
  });

  it("contains a slide + opacity transition for bar entry", () => {
    const style = document.querySelector(`style[${WISP_UI_DATA_ATTRIBUTE}="bar-styles"]`);
    expect(style?.textContent).toContain("cubic-bezier");
    expect(style?.textContent).toContain("250ms");
  });

  function style() {
    return document.querySelector(`style[${WISP_UI_DATA_ATTRIBUTE}="bar-styles"]`);
  }
});

describe("floating-bar visual — DOM structure", () => {
  let bar: ReturnType<typeof createFloatingBar>;

  beforeEach(() => {
    vi.useFakeTimers();
    bar = createFloatingBar(makeOpts());
  });

  afterEach(() => {
    vi.useRealTimers();
    bar.teardown();
    document
      .querySelectorAll(`style[${WISP_UI_DATA_ATTRIBUTE}="bar-styles"]`)
      .forEach((s) => s.remove());
  });

  // Helper: set mode and flush the 60ms fade timer.
  // We advance by 200ms (not runAllTimers) to avoid infinite loops from the
  // generating-mode setInterval that ticks every 100ms.
  function setMode(mode: Parameters<typeof bar.setMode>[0], ctx?: Parameters<typeof bar.setMode>[1]): void {
    bar.setMode(mode, ctx);
    vi.advanceTimersByTime(200);
  }

  it("renders an <aside> with aria-label", () => {
    expect(bar.el.tagName).toBe("ASIDE");
    expect(bar.el.getAttribute("aria-label")).toBe("wisp-design control panel");
  });

  it("idle mode: shows brand label and + Pick button", () => {
    setMode("idle");
    const brand = bar.el.querySelector(`[${WISP_UI_DATA_ATTRIBUTE}="brand"]`);
    expect(brand?.textContent).toBe("wisp-design");
    const buttons = bar.el.querySelectorAll("button");
    const labels = Array.from(buttons).map((b) => b.textContent);
    expect(labels).toContain("+ Pick");
  });

  it("picking mode: shows instruction and ESC hint", () => {
    setMode("picking");
    const instruction = bar.el.querySelector(`[${WISP_UI_DATA_ATTRIBUTE}="instruction"]`);
    expect(instruction?.textContent).toContain("Click an element");
    const hint = bar.el.querySelector(`[${WISP_UI_DATA_ATTRIBUTE}="hint"]`);
    expect(hint?.textContent).toContain("ESC");
  });

  it("configuring mode: shows textarea, Generate (primary) and Cancel (secondary)", () => {
    setMode("configuring", { targets: [], freeText: "", requestedVariantCount: 3 });
    const textarea = bar.el.querySelector("textarea");
    expect(textarea).not.toBeNull();
    const primaryBtns = bar.el.querySelectorAll(`button[data-wisp-btn="primary"]`);
    const secondaryBtns = bar.el.querySelectorAll(`button[data-wisp-btn="secondary"]`);
    const primaryTexts = Array.from(primaryBtns).map((b) => b.textContent);
    const secondaryTexts = Array.from(secondaryBtns).map((b) => b.textContent);
    expect(primaryTexts).toContain("Generate");
    expect(secondaryTexts.some((t) => t?.includes("Cancel"))).toBe(true);
  });

  it("generating mode: shows spinner and Cancel", () => {
    setMode("generating", { startedAt: 0, requestedVariantCount: 3 });
    const spinner = bar.el.querySelector(`[${WISP_UI_DATA_ATTRIBUTE}="spinner"]`);
    expect(spinner).not.toBeNull();
    const buttons = bar.el.querySelectorAll("button");
    const texts = Array.from(buttons).map((b) => b.textContent);
    expect(texts.some((t) => t?.includes("Cancel"))).toBe(true);
  });

  it("cycling mode: shows Accept (primary), Discard (secondary), and keyboard hint", () => {
    setMode("cycling", {
      variants: [
        { id: "v0", css: "", cssVars: {}, rationale: "Clean and minimal" },
        { id: "v1", css: "", cssVars: {}, rationale: "Bold and structured" },
        { id: "v2", css: "", cssVars: {}, rationale: "Compact and dense" },
      ],
      activeIndex: 0,
      bindings: [],
    });
    const primaryBtns = bar.el.querySelectorAll(`button[data-wisp-btn="primary"]`);
    const secondaryBtns = bar.el.querySelectorAll(`button[data-wisp-btn="secondary"]`);
    expect(Array.from(primaryBtns).map((b) => b.textContent)).toContain("Accept");
    expect(Array.from(secondaryBtns).map((b) => b.textContent)).toContain("Discard");
    const hint = bar.el.querySelector(`[${WISP_UI_DATA_ATTRIBUTE}="hint"]`);
    expect(hint?.textContent).toContain("←");
  });
});
