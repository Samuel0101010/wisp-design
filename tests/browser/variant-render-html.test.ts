// @vitest-environment jsdom
//
// wisp-design — html variants (Phase 7.18).
//
// Variants may carry replacement markup (`html`) for 1:1 reference fidelity.
// Pinned here:
//   1. An html variant renders the agent markup INSTEAD of the target clone;
//      inline <svg> survives (the reason sanitizeFreeText was NOT reused).
//   2. Active-content vectors are stripped: <script>, on*-handlers,
//      javascript: URLs, global <style>.
//   3. Variants without html keep the clone path byte-compatible.
//   4. Baseline (index 0) stays the live original even when html is set.

import { afterEach, describe, expect, it } from "vitest";

import { renderVariants } from "../../src/browser/variant-render.js";
import { sanitizeModule } from "../../src/browser/sanitize.js";
import { WISP_CSS_DATA_ATTRIBUTE } from "../../src/browser/constants.js";
import type { PickResult, Variant } from "../../src/contracts/browser.js";

const SESSION = "sess-html-variants";

function setupTarget(): PickResult {
  const button = document.createElement("button");
  button.id = "theme-toggle";
  button.textContent = "Toggle";
  document.body.appendChild(button);
  return {
    id: "tgt-html",
    selector: "#theme-toggle",
    tag: "button",
    rect: { x: 0, y: 0, w: 52, h: 28 },
    attributes: {},
    textPreview: "Toggle",
  };
}

function variant(id: string, extra?: Partial<Variant>): Variant {
  return {
    id,
    css: "/* baseline */",
    cssVars: {},
    rationale: `Variant ${id}`,
    ...extra,
  };
}

afterEach(() => {
  document.body.innerHTML = "";
  document.head
    .querySelectorAll(`style[${WISP_CSS_DATA_ATTRIBUTE}]`)
    .forEach((s) => s.remove());
});

describe("html variants — replacement markup (Phase 7.18)", () => {
  it("renders agent markup instead of the clone; inline svg survives", () => {
    const target = setupTarget();
    const handle = renderVariants({
      target,
      sessionId: SESSION,
      sanitize: sanitizeModule,
      variants: [
        variant("v0"),
        variant("v1", {
          html: '<label class="switch"><input type="checkbox"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="50"/></svg></label>',
        }),
      ],
    });

    const sib1 = document.querySelector('[data-wisp-variant="1"]')!;
    expect(sib1.getAttribute("data-wisp-html-variant")).toBe("1");
    expect(sib1.querySelector("label.switch")).not.toBeNull();
    expect(sib1.querySelector("svg circle")).not.toBeNull();
    // No clone of the original button inside the html variant.
    expect(sib1.querySelector("#theme-toggle")).toBeNull();

    handle.teardown();
  });

  it("strips script / on*-handlers / javascript: URLs / global style", () => {
    const target = setupTarget();
    const handle = renderVariants({
      target,
      sessionId: SESSION,
      sanitize: sanitizeModule,
      variants: [
        variant("v0"),
        variant("v1", {
          html:
            '<div onclick="alert(1)"><script>alert(2)</script>' +
            '<style>body{background:red}</style>' +
            '<a href="javascript:alert(3)">x</a><span>keep</span></div>',
        }),
      ],
    });

    const sib1 = document.querySelector('[data-wisp-variant="1"]')!;
    expect(sib1.querySelector("script")).toBeNull();
    expect(sib1.querySelector("style")).toBeNull();
    expect(sib1.querySelector("div")!.getAttribute("onclick")).toBeNull();
    expect(sib1.querySelector("a")!.getAttribute("href")).toBeNull();
    expect(sib1.querySelector("span")!.textContent).toBe("keep");

    handle.teardown();
  });

  it("variants without html keep the clone; baseline ignores html", () => {
    const target = setupTarget();
    const handle = renderVariants({
      target,
      sessionId: SESSION,
      sanitize: sanitizeModule,
      variants: [
        // html on baseline is ignored — index 0 is the moved live original.
        variant("v0", { html: "<div>must not render</div>" }),
        variant("v1", { css: ":scope > button { color: red; }" }),
      ],
    });

    const sib0 = document.querySelector('[data-wisp-variant="0"]')!;
    const sib1 = document.querySelector('[data-wisp-variant="1"]')!;
    expect(sib0.querySelector("#theme-toggle")).not.toBeNull();
    expect(sib0.textContent).not.toContain("must not render");
    // Clone path: the sibling holds a copy of the original button.
    expect(sib1.querySelector("button")).not.toBeNull();
    expect(sib1.getAttribute("data-wisp-html-variant")).toBeNull();

    handle.teardown();
  });
});
