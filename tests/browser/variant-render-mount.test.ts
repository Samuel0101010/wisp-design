// wisp-design — Bug #21 regression test (Phase 6.6).
//
// Verifies that renderVariantsMany correctly mounts host/sibling/style
// nodes for a target found via a child-combinator (`>`) selector — the
// real QA failure where trustedSelector blocked `>` in picker-built
// selectors, causing every renderVariants call to throw silently.
//
// jsdom env (default vitest browser: jsdom).

import { afterEach, describe, expect, it } from "vitest";

import {
  renderVariantsMany,
} from "../../src/browser/variant-render.js";
import { sanitizeModule } from "../../src/browser/sanitize.js";
import {
  WISP_CSS_DATA_ATTRIBUTE,
  WISP_VARIANT_DATA_ATTRIBUTE,
} from "../../src/browser/constants.js";
import type { PickResult, Variant } from "../../src/contracts/browser.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SESSION = "sess-bug21";

/** Build the minimal DOM that mirrors the QA target:
 *   <main><section><div><h3>Test</h3></div></section></main>
 * Returns the h3 element and its selector (with child combinator `>`).
 */
function setupNestedTarget(): { h3: HTMLElement; target: PickResult } {
  const main = document.createElement("main");
  const section = document.createElement("section");
  const div = document.createElement("div");
  const h3 = document.createElement("h3");
  h3.textContent = "Test heading";
  div.appendChild(h3);
  section.appendChild(div);
  main.appendChild(section);
  document.body.appendChild(main);

  // Selector with child combinator — exactly the shape picker.buildSelector
  // produces for deeply nested elements without an id.
  const selector =
    "main:nth-of-type(1) > section:nth-of-type(1) > div:nth-of-type(1) > h3:nth-of-type(1)";

  const target: PickResult = {
    id: "tgt-bug21",
    selector,
    tag: "h3",
    rect: { x: 0, y: 0, w: 200, h: 40 },
    attributes: {},
    textPreview: "Test heading",
  };

  return { h3, target };
}

function makeVariants(n: number): Variant[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `v${i}`,
    css: `:scope { color: rgb(${i * 80}, 0, 0); }`,
    cssVars: {},
    rationale: `Variant ${i}`,
  }));
}

afterEach(() => {
  document.body.innerHTML = "";
  document.head
    .querySelectorAll(`style[${WISP_CSS_DATA_ATTRIBUTE}]`)
    .forEach((s) => s.remove());
});

// ---------------------------------------------------------------------------
// Core mount assertions (the Bug #21 regression)
// ---------------------------------------------------------------------------

describe("renderVariantsMany — child-combinator selector mount (Bug #21)", () => {
  it("mounts [data-wisp-variants-host] wrapper into the DOM", () => {
    const { target } = setupNestedTarget();

    renderVariantsMany({
      targets: [target],
      variants: makeVariants(3),
      sessionId: SESSION,
      sanitize: sanitizeModule,
    });

    const host = document.querySelector("[data-wisp-variants-host]");
    expect(host).not.toBeNull();
    expect(host!.getAttribute("data-wisp-variants-host")).toBe(target.id);
  });

  it("creates exactly 3 [data-wisp-variant] siblings inside the host", () => {
    const { target } = setupNestedTarget();

    renderVariantsMany({
      targets: [target],
      variants: makeVariants(3),
      sessionId: SESSION,
      sanitize: sanitizeModule,
    });

    const host = document.querySelector("[data-wisp-variants-host]")!;
    const sibs = host.querySelectorAll(`[${WISP_VARIANT_DATA_ATTRIBUTE}]`);
    expect(sibs).toHaveLength(3);
    const indices = Array.from(sibs).map((s) =>
      s.getAttribute(WISP_VARIANT_DATA_ATTRIBUTE),
    );
    expect(indices).toEqual(["0", "1", "2"]);
  });

  it("injects <style data-wisp-css=sessionId> with @scope blocks", () => {
    const { target } = setupNestedTarget();

    renderVariantsMany({
      targets: [target],
      variants: makeVariants(3),
      sessionId: SESSION,
      sanitize: sanitizeModule,
    });

    const style = document.head.querySelector<HTMLStyleElement>(
      `style[${WISP_CSS_DATA_ATTRIBUTE}="${SESSION}"]`,
    );
    expect(style).not.toBeNull();
    const css = style!.textContent ?? "";
    expect(css).toContain("@scope");
    expect((css.match(/@scope/g) ?? []).length).toBe(3);
  });

  it("the picked h3 lives INSIDE the host wrapper after mount", () => {
    const { h3, target } = setupNestedTarget();

    renderVariantsMany({
      targets: [target],
      variants: makeVariants(3),
      sessionId: SESSION,
      sanitize: sanitizeModule,
    });

    const host = document.querySelector("[data-wisp-variants-host]")!;
    // h3 should be a descendant of the host (moved into variant-0 sibling).
    expect(host.contains(h3)).toBe(true);
  });

  it("setActive(1) shows variant 1 and hides 0 and 2", () => {
    const { target } = setupNestedTarget();

    const handle = renderVariantsMany({
      targets: [target],
      variants: makeVariants(3),
      sessionId: SESSION,
      sanitize: sanitizeModule,
    });
    handle.setActive(1);

    const sib0 = document.querySelector<HTMLElement>(
      `[${WISP_VARIANT_DATA_ATTRIBUTE}="0"]`,
    )!;
    const sib1 = document.querySelector<HTMLElement>(
      `[${WISP_VARIANT_DATA_ATTRIBUTE}="1"]`,
    )!;
    const sib2 = document.querySelector<HTMLElement>(
      `[${WISP_VARIANT_DATA_ATTRIBUTE}="2"]`,
    )!;

    expect(sib1.hasAttribute("hidden")).toBe(false);
    expect(sib0.hasAttribute("hidden")).toBe(true);
    expect(sib2.hasAttribute("hidden")).toBe(true);
  });

  it("teardown removes host and style block", () => {
    const { target } = setupNestedTarget();

    const handle = renderVariantsMany({
      targets: [target],
      variants: makeVariants(3),
      sessionId: SESSION,
      sanitize: sanitizeModule,
    });
    handle.teardown();

    expect(document.querySelector("[data-wisp-variants-host]")).toBeNull();
    expect(
      document.head.querySelector(`style[${WISP_CSS_DATA_ATTRIBUTE}="${SESSION}"]`),
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Verify the selector itself is what was broken
// ---------------------------------------------------------------------------

describe("querySelector with child-combinator selector", () => {
  it("finds h3 via selector containing > combinators", () => {
    setupNestedTarget(); // populates the DOM

    const sel =
      "main:nth-of-type(1) > section:nth-of-type(1) > div:nth-of-type(1) > h3:nth-of-type(1)";
    const el = document.querySelector(sel);
    expect(el).not.toBeNull();
    expect(el!.tagName.toLowerCase()).toBe("h3");
  });
});
