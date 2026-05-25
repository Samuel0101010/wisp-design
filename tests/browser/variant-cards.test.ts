// wisp-design — variant card UI tests (Phase 7).
//
// Verifies that cycling mode renders variant CARDS (not the old tab buttons),
// and that clicking card i calls onCycleSetActive(i).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createFloatingBar } from "../../src/browser/floating-bar.js";
import type { FloatingBarOptions } from "../../src/browser/floating-bar.js";
import type { SanitizeModule, Variant } from "../../src/contracts/browser.js";
import { WISP_UI_DATA_ATTRIBUTE } from "../../src/browser/constants.js";

// ---------------------------------------------------------------------------
// stubs
// ---------------------------------------------------------------------------

const sanitize: SanitizeModule = {
  escapeHtml: (s) => s,
  sanitizeFreeText: (s, opts) => s.slice(0, opts?.maxLen ?? 4000),
  trustedCssVar: (v, val) => ({ ok: true as const, varName: v, value: val }),
  trustedSelector: (s) => ({ ok: true as const, selector: s }),
};

function threeVariants(): Variant[] {
  return [
    { id: "v0", css: "", cssVars: {}, rationale: "Clean minimal layout" },
    { id: "v1", css: "", cssVars: {}, rationale: "Bold typographic hierarchy" },
    { id: "v2", css: "", cssVars: {}, rationale: "Compact dense grid" },
  ];
}

describe("variant cards in cycling mode", () => {
  let bar: ReturnType<typeof createFloatingBar>;
  let onCycleSetActive: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    onCycleSetActive = vi.fn();
    bar = createFloatingBar({
      sanitize,
      onFreeTextChange: vi.fn(),
      onFreeTextSubmit: vi.fn(),
      onConfigureCancel: vi.fn(),
      onGenerateCancel: vi.fn(),
      onCycleNext: vi.fn(),
      onCyclePrev: vi.fn(),
      onCycleSetActive,
      onParamChange: vi.fn(),
      onAccept: vi.fn(),
      onDiscard: vi.fn(),
      onAnnotationAdd: vi.fn(),
      onPickStart: vi.fn(),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    bar.teardown();
    document
      .querySelectorAll(`style[${WISP_UI_DATA_ATTRIBUTE}="bar-styles"]`)
      .forEach((s) => s.remove());
  });

  // Helper: set cycling mode and flush the 60ms fade timer.
  // advance 200ms — enough to flush the setTimeout without infinite loops.
  function setCycling(ctx: { variants: Variant[]; activeIndex: number; bindings: [] }): void {
    bar.setMode("cycling", ctx);
    vi.advanceTimersByTime(200);
  }

  it("renders one card per variant with data-wisp-variant-card attribute", () => {
    setCycling({ variants: threeVariants(), activeIndex: 0, bindings: [] });
    const cards = bar.el.querySelectorAll("[data-wisp-variant-card]");
    expect(cards).toHaveLength(3);
  });

  it("each card shows tabular variant number (01, 02, 03)", () => {
    setCycling({ variants: threeVariants(), activeIndex: 0, bindings: [] });
    const nums = bar.el.querySelectorAll(`[${WISP_UI_DATA_ATTRIBUTE}="card-num"]`);
    expect(Array.from(nums).map((n) => n.textContent)).toEqual(["01", "02", "03"]);
  });

  it("each card shows the rationale text", () => {
    setCycling({ variants: threeVariants(), activeIndex: 1, bindings: [] });
    const rationales = bar.el.querySelectorAll(`[${WISP_UI_DATA_ATTRIBUTE}="card-rationale"]`);
    expect(rationales[0]?.textContent).toBe("Clean minimal layout");
    expect(rationales[1]?.textContent).toBe("Bold typographic hierarchy");
    expect(rationales[2]?.textContent).toBe("Compact dense grid");
  });

  it("active card has aria-pressed=true; others have aria-pressed=false", () => {
    setCycling({ variants: threeVariants(), activeIndex: 1, bindings: [] });
    const cards = bar.el.querySelectorAll("[data-wisp-variant-card]");
    expect(cards[0]?.getAttribute("aria-pressed")).toBe("false");
    expect(cards[1]?.getAttribute("aria-pressed")).toBe("true");
    expect(cards[2]?.getAttribute("aria-pressed")).toBe("false");
  });

  it("active card shows an 'active' badge", () => {
    setCycling({ variants: threeVariants(), activeIndex: 0, bindings: [] });
    const badges = bar.el.querySelectorAll(`[${WISP_UI_DATA_ATTRIBUTE}="card-badge"]`);
    expect(badges).toHaveLength(1);
    expect(badges[0]?.textContent).toBe("active");
  });

  it("clicking card at index 1 calls onCycleSetActive(1)", () => {
    setCycling({ variants: threeVariants(), activeIndex: 0, bindings: [] });
    const card1 = bar.el.querySelector<HTMLElement>('[data-wisp-variant-card="1"]');
    expect(card1).not.toBeNull();
    card1!.click();
    expect(onCycleSetActive).toHaveBeenCalledWith(1);
  });

  it("clicking card at index 2 calls onCycleSetActive(2)", () => {
    setCycling({ variants: threeVariants(), activeIndex: 0, bindings: [] });
    const card2 = bar.el.querySelector<HTMLElement>('[data-wisp-variant-card="2"]');
    card2!.click();
    expect(onCycleSetActive).toHaveBeenCalledWith(2);
  });

  it("clicking card at index 0 calls onCycleSetActive(0)", () => {
    setCycling({ variants: threeVariants(), activeIndex: 2, bindings: [] });
    const card0 = bar.el.querySelector<HTMLElement>('[data-wisp-variant-card="0"]');
    card0!.click();
    expect(onCycleSetActive).toHaveBeenCalledWith(0);
  });

  it("all cards are <button> elements (keyboard accessible)", () => {
    setCycling({ variants: threeVariants(), activeIndex: 0, bindings: [] });
    const cards = bar.el.querySelectorAll("[data-wisp-variant-card]");
    for (const card of Array.from(cards)) {
      expect(card.tagName).toBe("BUTTON");
    }
  });

  it("does NOT render old Variant N tab buttons", () => {
    setCycling({ variants: threeVariants(), activeIndex: 0, bindings: [] });
    const buttons = bar.el.querySelectorAll("button");
    const tabTexts = Array.from(buttons).map((b) => b.textContent ?? "");
    expect(tabTexts).not.toContain("Variant 1");
    expect(tabTexts).not.toContain("Variant 2");
    expect(tabTexts).not.toContain("Variant 3");
  });

  it("re-render with new activeIndex updates aria-pressed correctly", () => {
    setCycling({ variants: threeVariants(), activeIndex: 0, bindings: [] });
    setCycling({ variants: threeVariants(), activeIndex: 2, bindings: [] });
    const cards = bar.el.querySelectorAll("[data-wisp-variant-card]");
    expect(cards[0]?.getAttribute("aria-pressed")).toBe("false");
    expect(cards[1]?.getAttribute("aria-pressed")).toBe("false");
    expect(cards[2]?.getAttribute("aria-pressed")).toBe("true");
  });

  it("single-variant cycling renders one card", () => {
    const single: Variant[] = [{ id: "v0", css: "", cssVars: {}, rationale: "Only option" }];
    setCycling({ variants: single, activeIndex: 0, bindings: [] });
    const cards = bar.el.querySelectorAll("[data-wisp-variant-card]");
    expect(cards).toHaveLength(1);
    expect(cards[0]?.getAttribute("aria-pressed")).toBe("true");
  });
});
