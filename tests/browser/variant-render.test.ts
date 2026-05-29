// wisp-design — Variant-render tests (Phase 2).
//
// Targets src/browser/variant-render.ts. jsdom env (default).
//
// NOTE: jsdom does NOT implement CSS `@scope` cascade semantics. We verify
// the *structural* contract (wrapper, sibling tree, style block textContent,
// active toggling, teardown reversal) — NOT actual cascade application.

import { afterEach, describe, expect, it } from "vitest";

import { renderVariants } from "../../src/browser/variant-render.js";
import { sanitizeModule } from "../../src/browser/sanitize.js";
import {
  WISP_CSS_DATA_ATTRIBUTE,
  WISP_VARIANT_DATA_ATTRIBUTE,
} from "../../src/browser/constants.js";
import type { PickResult, Variant } from "../../src/contracts/browser.js";

const sessionId = "sess-1";

function setupTarget(): { target: PickResult; node: HTMLElement; parent: HTMLElement } {
  const parent = document.createElement("section");
  parent.id = "parent";
  const node = document.createElement("div");
  node.id = "live";
  node.textContent = "hello";
  parent.appendChild(node);
  document.body.appendChild(parent);

  const target: PickResult = {
    id: "tgt-1",
    selector: "#live",
    tag: "div",
    rect: { x: 0, y: 0, w: 100, h: 50 },
    attributes: { id: "live" },
    textPreview: "hello",
  };

  return { target, node, parent };
}

function variantSet(n: number): Variant[] {
  const out: Variant[] = [];
  for (let i = 0; i < n; i += 1) {
    out.push({
      id: `v${i}`,
      css: `:scope { color: rgb(${i},0,0); }`,
      cssVars: {},
      rationale: `r${i}`,
    });
  }
  return out;
}

afterEach(() => {
  document.body.innerHTML = "";
  document.head.querySelectorAll(`style[${WISP_CSS_DATA_ATTRIBUTE}]`).forEach((s) =>
    s.remove(),
  );
});

describe("renderVariants — structure", () => {
  it("injects a wrapper with data-wisp-variants-host=<targetId>", () => {
    const { target } = setupTarget();
    renderVariants({ target, variants: variantSet(3), sessionId, sanitize: sanitizeModule });

    const host = document.querySelector(
      `[data-wisp-variants-host="${target.id}"]`,
    );
    expect(host).not.toBeNull();
  });

  it("creates 3 siblings with data-wisp-variant=0|1|2", () => {
    const { target } = setupTarget();
    renderVariants({ target, variants: variantSet(3), sessionId, sanitize: sanitizeModule });
    const host = document.querySelector(`[data-wisp-variants-host="${target.id}"]`)!;
    const sibs = host.querySelectorAll(`[${WISP_VARIANT_DATA_ATTRIBUTE}]`);
    expect(sibs).toHaveLength(3);
    const values = Array.from(sibs).map((s) => s.getAttribute(WISP_VARIANT_DATA_ATTRIBUTE));
    expect(values).toEqual(["0", "1", "2"]);
  });

  it("variant 0 contains the live original node (same identity)", () => {
    const { target, node } = setupTarget();
    renderVariants({ target, variants: variantSet(2), sessionId, sanitize: sanitizeModule });
    const sib0 = document.querySelector(`[${WISP_VARIANT_DATA_ATTRIBUTE}="0"]`);
    expect(sib0?.firstElementChild).toBe(node);
  });

  it("variants 1+ are clones (different node identity)", () => {
    const { target, node } = setupTarget();
    renderVariants({ target, variants: variantSet(3), sessionId, sanitize: sanitizeModule });
    const sib1 = document.querySelector(`[${WISP_VARIANT_DATA_ATTRIBUTE}="1"]`);
    const sib2 = document.querySelector(`[${WISP_VARIANT_DATA_ATTRIBUTE}="2"]`);
    expect(sib1?.firstElementChild).not.toBe(node);
    expect(sib2?.firstElementChild).not.toBe(node);
    // …but the clones are still <div>s with the original text.
    expect(sib1?.firstElementChild?.textContent).toBe("hello");
  });

  it("injects <style data-wisp-css=sessionId> with one @scope rule per variant", () => {
    const { target } = setupTarget();
    renderVariants({ target, variants: variantSet(3), sessionId, sanitize: sanitizeModule });
    const style = document.head.querySelector<HTMLStyleElement>(
      `style[${WISP_CSS_DATA_ATTRIBUTE}="${sessionId}"]`,
    );
    expect(style).not.toBeNull();
    const css = style!.textContent ?? "";
    // 3 @scope rules expected
    expect(css.match(/@scope/g)?.length).toBe(3);
    expect(css).toContain(`[${WISP_VARIANT_DATA_ATTRIBUTE}="0"]`);
    expect(css).toContain(`[${WISP_VARIANT_DATA_ATTRIBUTE}="1"]`);
    expect(css).toContain(`[${WISP_VARIANT_DATA_ATTRIBUTE}="2"]`);
  });
});

describe("renderVariants — visibility & overrides", () => {
  it("setActive(1) shows variant 1 and hides 0/2", () => {
    const { target } = setupTarget();
    const handle = renderVariants({
      target,
      variants: variantSet(3),
      sessionId,
      sanitize: sanitizeModule,
    });
    handle.setActive(1);
    const sib0 = document.querySelector<HTMLElement>(`[${WISP_VARIANT_DATA_ATTRIBUTE}="0"]`)!;
    const sib1 = document.querySelector<HTMLElement>(`[${WISP_VARIANT_DATA_ATTRIBUTE}="1"]`)!;
    const sib2 = document.querySelector<HTMLElement>(`[${WISP_VARIANT_DATA_ATTRIBUTE}="2"]`)!;
    expect(sib1.hasAttribute("hidden")).toBe(false);
    expect(sib0.hasAttribute("hidden")).toBe(true);
    expect(sib2.hasAttribute("hidden")).toBe(true);
    expect(sib0.style.display).toBe("none");
    expect(sib1.style.display).not.toBe("none");
  });

  it("setParamOverride writes a CSS var on the active scope root", () => {
    const { target } = setupTarget();
    const handle = renderVariants({
      target,
      variants: variantSet(2),
      sessionId,
      sanitize: sanitizeModule,
    });
    handle.setActive(1);
    handle.setParamOverride("--pad", "8px");
    const sib1 = document.querySelector<HTMLElement>(`[${WISP_VARIANT_DATA_ATTRIBUTE}="1"]`)!;
    expect(sib1.style.getPropertyValue("--pad")).toBe("8px");
  });

  it("setParamOverride with malformed var silently drops", () => {
    const { target } = setupTarget();
    const handle = renderVariants({
      target,
      variants: variantSet(2),
      sessionId,
      sanitize: sanitizeModule,
    });
    handle.setActive(0);
    expect(() => handle.setParamOverride("badname", "x")).not.toThrow();
    const sib0 = document.querySelector<HTMLElement>(`[${WISP_VARIANT_DATA_ATTRIBUTE}="0"]`)!;
    expect(sib0.style.getPropertyValue("badname")).toBe("");
  });
});

describe("renderVariants — CSS isolation / breakout (finding #1, #5)", () => {
  // jsdom does NOT run @scope cascade, so we assert the *assembled style text*
  // cannot close its @scope rule early. A stray `}` in agent-supplied CSS must
  // not produce a top-level rule that escapes variant isolation.
  it("does not let an unbalanced `}` inject a global rule", () => {
    const { target } = setupTarget();
    const hostile: Variant[] = [
      {
        id: "v0",
        css: 'color:red } body { display:none !important } [x] {',
        cssVars: {},
        rationale: "hostile",
      },
    ];
    renderVariants({ target, variants: hostile, sessionId, sanitize: sanitizeModule });
    const style = document.head.querySelector<HTMLStyleElement>(
      `style[${WISP_CSS_DATA_ATTRIBUTE}="${sessionId}"]`,
    );
    const css = style?.textContent ?? "";
    // The hostile body breakout must not survive as a literal rule head.
    expect(css).not.toMatch(/}\s*body\s*\{/);
  });

  it("strips FORBIDDEN substrings (</style, <script, @import, expression()", () => {
    const { target } = setupTarget();
    const hostile: Variant[] = [
      {
        id: "v0",
        css: ':scope { color:red; } </style><script>x()</script> @import url(evil); expression(alert(1))',
        cssVars: {},
        rationale: "hostile",
      },
    ];
    renderVariants({ target, variants: hostile, sessionId, sanitize: sanitizeModule });
    const css =
      document.head.querySelector<HTMLStyleElement>(
        `style[${WISP_CSS_DATA_ATTRIBUTE}="${sessionId}"]`,
      )?.textContent ?? "";
    expect(css).not.toContain("</style");
    expect(css).not.toContain("<script");
    expect(css).not.toContain("@import");
    expect(css).not.toContain("expression(");
  });
});

describe("renderVariants — teardown", () => {
  it("restores the original node to its parent and removes wrapper + style", () => {
    const { target, node, parent } = setupTarget();
    const beforeParent = node.parentNode;
    expect(beforeParent).toBe(parent);

    const handle = renderVariants({
      target,
      variants: variantSet(3),
      sessionId,
      sanitize: sanitizeModule,
    });
    expect(node.parentNode).not.toBe(parent);

    handle.teardown();

    expect(node.parentNode).toBe(parent);
    expect(document.querySelector(`[data-wisp-variants-host="${target.id}"]`)).toBeNull();
    expect(
      document.head.querySelector(`style[${WISP_CSS_DATA_ATTRIBUTE}="${sessionId}"]`),
    ).toBeNull();
  });
});
