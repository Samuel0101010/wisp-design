// wisp-design — Picker selector format tests (Phase 7, Goal 2).
//
// Verifies the class-aware buildSelector:
//   - Class segments when classes exist (up to 3, sorted, filtered)
//   - nth-of-type fallback when no classes and multiple same-tag siblings
//   - Stops at id anchor when present on ancestor
//   - Result is a valid CSS selector that querySelectorAll resolves uniquely
//   - Backwards-compat: selector still works with document.querySelector

import { afterEach, describe, expect, it } from "vitest";
import { buildSelector } from "../../src/browser/picker.js";

afterEach(() => {
  document.body.innerHTML = "";
});

// ---------------------------------------------------------------------------
// Class-aware segments
// ---------------------------------------------------------------------------

describe("buildSelector — class-aware chain", () => {
  it("emits tag.cls1.cls2.cls3 (alpha-sorted, up to 3) for classed element", () => {
    document.body.innerHTML =
      '<h3 class="font-black mt-2 text-6xl leading-tight tracking-tight">Heading</h3>';
    const h3 = document.body.querySelector("h3") as HTMLElement;
    const sel = buildSelector(h3);
    // Sorted alpha: font-black < leading-tight < mt-2 < text-6xl < tracking-tight
    // Up to 3: font-black, leading-tight, mt-2
    expect(sel).toContain("h3");
    expect(sel).toContain("font-black");
    expect(sel).toContain("mt-2");
    // Result is valid CSS selector
    expect(() => document.querySelectorAll(sel)).not.toThrow();
  });

  it("emits ancestor chain when leaf alone is not unique", () => {
    document.body.innerHTML = `
      <section class="hero"><div class="content"><h3 class="title">A</h3></div></section>
      <section class="pricing"><div class="content"><h3 class="title">B</h3></div></section>
    `;
    const h3s = document.body.querySelectorAll("h3");
    const first = h3s[0] as HTMLElement;
    const second = h3s[1] as HTMLElement;
    const sel1 = buildSelector(first);
    const sel2 = buildSelector(second);
    // Each must resolve to exactly 1 element.
    expect(document.querySelectorAll(sel1).length).toBe(1);
    expect(document.querySelectorAll(sel2).length).toBe(1);
    expect(document.querySelectorAll(sel1)[0]).toBe(first);
    expect(document.querySelectorAll(sel2)[0]).toBe(second);
  });

  it("excludes wisp-* classes from segments", () => {
    document.body.innerHTML =
      '<div class="wisp-active mt-4 text-lg">Content</div>';
    const el = document.body.querySelector("div") as HTMLElement;
    const sel = buildSelector(el);
    expect(sel).not.toContain("wisp-active");
    expect(sel).toContain("mt-4");
  });

  it("excludes Tailwind state-prefixed classes", () => {
    document.body.innerHTML =
      '<button class="bg-blue-500 hover:bg-blue-700 sm:text-sm dark:bg-gray-800 focus:outline-none">Go</button>';
    const btn = document.body.querySelector("button") as HTMLElement;
    const sel = buildSelector(btn);
    expect(sel).not.toContain("hover:");
    expect(sel).not.toContain("sm:");
    expect(sel).not.toContain("dark:");
    expect(sel).not.toContain("focus:");
    expect(sel).toContain("bg-blue-500");
  });

  it("limits to 3 classes per segment (alpha-first-3)", () => {
    document.body.innerHTML =
      '<p class="a-class b-class c-class d-class e-class">Text</p>';
    const p = document.body.querySelector("p") as HTMLElement;
    const sel = buildSelector(p);
    // Only 3 classes in the segment (a-class, b-class, c-class alpha-sorted).
    const classParts = sel.split(".").slice(1); // skip tag part
    expect(classParts.length).toBeLessThanOrEqual(3);
    // Must be alpha-first-3: a-class, b-class, c-class
    expect(sel).toContain("a-class");
    expect(sel).toContain("b-class");
    expect(sel).toContain("c-class");
    expect(sel).not.toContain("d-class");
  });
});

// ---------------------------------------------------------------------------
// nth-of-type fallback
// ---------------------------------------------------------------------------

describe("buildSelector — nth-of-type fallback", () => {
  it("uses nth-of-type when multiple siblings share tag and no classes", () => {
    document.body.innerHTML =
      "<ul><li></li><li></li><li></li></ul>";
    const lis = document.body.querySelectorAll("li");
    for (let i = 0; i < lis.length; i++) {
      const sel = buildSelector(lis[i] as HTMLElement);
      expect(sel).toContain(`li:nth-of-type(${i + 1})`);
    }
  });

  it("does NOT use nth-of-type when element is the only same-tag child", () => {
    document.body.innerHTML = "<nav><ul></ul></nav>";
    const ul = document.body.querySelector("ul") as HTMLElement;
    const sel = buildSelector(ul);
    expect(sel).not.toContain("nth-of-type");
  });
});

// ---------------------------------------------------------------------------
// id anchor
// ---------------------------------------------------------------------------

describe("buildSelector — id anchor", () => {
  it("returns #id immediately when element has a valid id", () => {
    document.body.innerHTML = '<div id="hero">Content</div>';
    const el = document.body.querySelector("#hero") as HTMLElement;
    expect(buildSelector(el)).toBe("#hero");
  });

  it("stops walk at ancestor id and emits #id > leaf chain", () => {
    document.body.innerHTML = '<section id="pricing"><div class="card"><p>Text</p></div></section>';
    const p = document.body.querySelector("p") as HTMLElement;
    const sel = buildSelector(p);
    expect(sel).toContain("#pricing");
    // Must resolve uniquely.
    expect(document.querySelectorAll(sel).length).toBe(1);
  });

  it("ignores ids that start with numbers (invalid CSS id)", () => {
    document.body.innerHTML = '<div id="123abc"><span class="label">X</span></div>';
    const span = document.body.querySelector("span") as HTMLElement;
    const sel = buildSelector(span);
    // Should not use the numeric id.
    expect(sel).not.toContain("#123abc");
    // Should still be a valid selector.
    expect(() => document.querySelectorAll(sel)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// selectorToAnchor compatibility — the generated selector must produce a
// useful anchor when the first character is inspected by wrap.ts.
// Specifically: starts with tag-char (letter) → `<tag` anchor, or
// starts with `#` → `id="..."` anchor. Both are handled by locateTargetSpan.
// ---------------------------------------------------------------------------

describe("buildSelector — selectorToAnchor compatibility", () => {
  it("selector starts with tag name (not a dot, bracket, or number)", () => {
    document.body.innerHTML =
      '<article class="post-card"><h2 class="title">Post</h2></article>';
    const h2 = document.body.querySelector("h2") as HTMLElement;
    const sel = buildSelector(h2);
    // Must start with a letter (tag char) or '#' — not '.' or '['.
    expect(sel[0]).toMatch(/[a-zA-Z#]/);
  });

  it("full chain selector can be uniquely re-found via querySelector", () => {
    document.body.innerHTML = `
      <main>
        <section class="hero space-y-4">
          <div class="relative">
            <h3 class="mt-2 text-6xl font-black leading-tight">Hero heading</h3>
          </div>
        </section>
      </main>
    `;
    const h3 = document.body.querySelector("h3") as HTMLElement;
    const sel = buildSelector(h3);
    const found = document.querySelector(sel);
    expect(found).toBe(h3);
  });
});
