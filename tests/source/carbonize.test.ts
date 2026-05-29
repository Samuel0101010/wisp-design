// wisp-design — Phase 3 carbonize CSS-in/CSS-out transform tests.
//
// Pure-function tests. No fs. Pins the documented worked example, edge cases,
// and throw-on-malformed contract.

import { describe, expect, it } from "vitest";

import { carbonize } from "../../src/source/carbonize.js";

const SCOPE = '[data-wisp-target="t1"]';

function noOverrides(): Record<string, string> {
  return {};
}

describe("carbonize — worked example", () => {
  it("baseline: @scope with :scope vars and child rule, override --pad", () => {
    const input =
      '@scope ([data-wisp-variant="1"]) {\n' +
      "  :scope { --pad: 16px; }\n" +
      "  .child { padding: var(--pad); }\n" +
      "}";
    const out = carbonize(input, {
      paramOverrides: { "--pad": "20px" },
      scopeSelector: SCOPE,
    });
    // The :scope block is consumed (its declarations seed the var map).
    // `.child` is rewritten with the scope prefix, and `var(--pad)` is baked.
    expect(out).toContain(`${SCOPE} .child`);
    expect(out).toContain("padding: 20px");
    expect(out).not.toContain(":scope {");
    expect(out).not.toContain("var(--pad)");
  });

  it("uses :scope-declared default when no override given", () => {
    const input =
      '@scope ([data-wisp-variant="0"]) {\n' +
      "  :scope { --pad: 8px; }\n" +
      "  .child { padding: var(--pad); }\n" +
      "}";
    const out = carbonize(input, {
      paramOverrides: noOverrides(),
      scopeSelector: SCOPE,
    });
    expect(out).toContain("padding: 8px");
  });
});

describe("carbonize — selector rewriting", () => {
  it("multi-selector rule rewritten per group", () => {
    const input =
      '@scope ([data-wisp-variant="0"]) {\n' +
      "  .a, .b { color: red; }\n" +
      "}";
    const out = carbonize(input, {
      paramOverrides: noOverrides(),
      scopeSelector: SCOPE,
    });
    expect(out).toContain(`${SCOPE} .a`);
    expect(out).toContain(`${SCOPE} .b`);
  });

  it(":scope selector rewritten to scopeSelector exactly", () => {
    const input =
      '@scope ([data-wisp-variant="0"]) {\n' +
      "  :scope.alt { color: red; }\n" +
      "}";
    const out = carbonize(input, {
      paramOverrides: noOverrides(),
      scopeSelector: SCOPE,
    });
    // `:scope.alt` should glue without a leading space.
    expect(out).toContain(`${SCOPE}.alt`);
  });

  it("bare child selector gets scopeSelector prefix", () => {
    const input =
      '@scope ([data-wisp-variant="0"]) {\n' +
      "  h1 { font-weight: 700; }\n" +
      "}";
    const out = carbonize(input, {
      paramOverrides: noOverrides(),
      scopeSelector: SCOPE,
    });
    expect(out).toContain(`${SCOPE} h1`);
  });
});

describe("carbonize — var() handling", () => {
  it("var(--x, fallback) resolves to value when known", () => {
    const input =
      '@scope ([data-wisp-variant="0"]) {\n' +
      "  :scope { --c: blue; }\n" +
      "  .x { color: var(--c, red); }\n" +
      "}";
    const out = carbonize(input, {
      paramOverrides: noOverrides(),
      scopeSelector: SCOPE,
    });
    expect(out).toContain("color: blue");
    expect(out).not.toContain("red");
  });

  it("var(--unknown, fallback) → fallback", () => {
    const input =
      '@scope ([data-wisp-variant="0"]) {\n' +
      "  .x { color: var(--unknown, red); }\n" +
      "}";
    const out = carbonize(input, {
      paramOverrides: noOverrides(),
      scopeSelector: SCOPE,
    });
    expect(out).toContain("color: red");
  });

  it("var(--unknown) with no fallback → keep var() literal", () => {
    const input =
      '@scope ([data-wisp-variant="0"]) {\n' +
      "  .x { color: var(--unknown); }\n" +
      "}";
    const out = carbonize(input, {
      paramOverrides: noOverrides(),
      scopeSelector: SCOPE,
    });
    expect(out).toContain("var(--unknown)");
  });

  it("paramOverride on a var not declared in :scope still applies", () => {
    const input =
      '@scope ([data-wisp-variant="0"]) {\n' +
      "  .x { color: var(--c); }\n" +
      "}";
    const out = carbonize(input, {
      paramOverrides: { "--c": "green" },
      scopeSelector: SCOPE,
    });
    expect(out).toContain("color: green");
  });

  it("dead :scope vars (declared but unused) are not emitted as standalone rules", () => {
    const input =
      '@scope ([data-wisp-variant="0"]) {\n' +
      "  :scope { --dead: 9px; --used: red; }\n" +
      "  .x { color: var(--used); }\n" +
      "}";
    const out = carbonize(input, {
      paramOverrides: noOverrides(),
      scopeSelector: SCOPE,
    });
    // No standalone :scope-style rule.
    expect(out).not.toContain("--dead");
    expect(out).toContain("color: red");
  });

  // REGRESSION — self-referential CSS var. bakeVars recursed without a
  // visited-set, so `--x: var(--x)` overflowed the stack (RangeError) and
  // crashed the whole accept path. CSS is LLM-generated, so adversarial/buggy
  // cyclic vars must degrade gracefully, not throw.
  it("self-referential var (--x: var(--x)) does not overflow the stack", () => {
    const input =
      '@scope ([data-wisp-variant="1"]) {\n' +
      "  :scope { --x: var(--x); }\n" +
      "  .a { color: var(--x); }\n" +
      "}";
    let out = "";
    expect(() => {
      out = carbonize(input, {
        paramOverrides: noOverrides(),
        scopeSelector: SCOPE,
      });
    }).not.toThrow();
    // Cycle resolves to the literal `var(--x)` rather than overflowing.
    expect(out).toContain(`${SCOPE} .a`);
    expect(out).toContain("var(--x)");
  });

  // REGRESSION — mutually-referential cycle (--a → --b → --a).
  it("mutually-referential vars (--a/--b cycle) do not overflow the stack", () => {
    const input =
      '@scope ([data-wisp-variant="1"]) {\n' +
      "  :scope { --a: var(--b); --b: var(--a); }\n" +
      "  .a { color: var(--a); }\n" +
      "}";
    let out = "";
    expect(() => {
      out = carbonize(input, {
        paramOverrides: noOverrides(),
        scopeSelector: SCOPE,
      });
    }).not.toThrow();
    expect(out).toContain(`${SCOPE} .a`);
  });
});

describe("carbonize — at-rules preserved", () => {
  it("@media preserved verbatim, inner rules scope-prefixed", () => {
    const input =
      '@scope ([data-wisp-variant="0"]) {\n' +
      "  @media (min-width: 768px) {\n" +
      "    .x { display: flex; }\n" +
      "  }\n" +
      "}";
    const out = carbonize(input, {
      paramOverrides: noOverrides(),
      scopeSelector: SCOPE,
    });
    expect(out).toContain("@media (min-width: 768px)");
    expect(out).toContain(`${SCOPE} .x`);
    expect(out).toContain("display: flex");
  });

  it("@supports preserved verbatim", () => {
    const input =
      '@scope ([data-wisp-variant="0"]) {\n' +
      "  @supports (display: grid) {\n" +
      "    .x { display: grid; }\n" +
      "  }\n" +
      "}";
    const out = carbonize(input, {
      paramOverrides: noOverrides(),
      scopeSelector: SCOPE,
    });
    expect(out).toContain("@supports (display: grid)");
    expect(out).toContain(`${SCOPE} .x`);
  });
});

describe("carbonize — empty + comments + degenerate", () => {
  it("empty input → empty output, no throw", () => {
    expect(carbonize("", { paramOverrides: noOverrides(), scopeSelector: SCOPE })).toBe(
      "",
    );
  });

  it("comments stripped", () => {
    const input =
      '@scope ([data-wisp-variant="0"]) {\n' +
      "  /* comment */ .x { color: red; }\n" +
      "}";
    const out = carbonize(input, {
      paramOverrides: noOverrides(),
      scopeSelector: SCOPE,
    });
    expect(out).not.toContain("comment");
    expect(out).toContain("color: red");
  });

  it("string containing `}` literal does not break brace balance", () => {
    const input =
      '@scope ([data-wisp-variant="0"]) {\n' +
      "  .x { content: \"}\"; color: red; }\n" +
      "}";
    const out = carbonize(input, {
      paramOverrides: noOverrides(),
      scopeSelector: SCOPE,
    });
    expect(out).toContain("color: red");
  });
});

describe("carbonize — throws on malformed", () => {
  it("unterminated outer brace → throws", () => {
    const input = '@scope ([data-wisp-variant="0"]) { .x { color: red; }';
    expect(() =>
      carbonize(input, {
        paramOverrides: noOverrides(),
        scopeSelector: SCOPE,
      }),
    ).toThrow();
  });

  it("non-@scope outer rule → throws", () => {
    const input = ".x { color: red; }";
    expect(() =>
      carbonize(input, {
        paramOverrides: noOverrides(),
        scopeSelector: SCOPE,
      }),
    ).toThrow(/@scope/);
  });

  it("selector with no body (no `{`) → throws", () => {
    // Trailing-rule with no body should be flagged.
    const input = "@scope ([data-wisp-variant=\"0\"])";
    expect(() =>
      carbonize(input, {
        paramOverrides: noOverrides(),
        scopeSelector: SCOPE,
      }),
    ).toThrow();
  });
});

describe("carbonize — redundant picked-tag strip (Phase 7.11)", () => {
  // Variants are authored against the live preview where the picked element
  // sits inside a `[data-wisp-variant="N"]` wrapper, so :scope = wrapper and
  // `:scope > <picked-tag>` = the picked element. After carbonize the wrapper
  // is gone and :scope IS the picked-element selector; without this fix
  // `:scope > article` would emit `article.x > article` (a non-existent
  // nested article) and the variant would have no visible effect.
  const ARTICLE_SCOPE = "article.bg-white.border.border-neutral-200";

  it("strips redundant picked-tag for `:scope > <pickedTag>`", () => {
    const input =
      '@scope ([data-wisp-variant="1"]) {\n' +
      "  :scope > article { transition: transform 0.3s; }\n" +
      "}";
    const out = carbonize(input, {
      paramOverrides: noOverrides(),
      scopeSelector: ARTICLE_SCOPE,
    });
    expect(out).toContain(`${ARTICLE_SCOPE} {`);
    expect(out).not.toContain(`${ARTICLE_SCOPE} > article`);
    expect(out).toContain("transition: transform 0.3s");
  });

  it("strips redundant picked-tag for `:scope > <pickedTag>:hover`", () => {
    const input =
      '@scope ([data-wisp-variant="1"]) {\n' +
      "  :scope > article:hover { transform: translateY(-6px); }\n" +
      "}";
    const out = carbonize(input, {
      paramOverrides: noOverrides(),
      scopeSelector: ARTICLE_SCOPE,
    });
    expect(out).toContain(`${ARTICLE_SCOPE}:hover`);
    expect(out).not.toContain("> article:hover");
  });

  it("strips redundant picked-tag in deeper chains", () => {
    const input =
      '@scope ([data-wisp-variant="1"]) {\n' +
      "  :scope > article > ul > li:nth-child(1) { transform: translateX(4px); }\n" +
      "}";
    const out = carbonize(input, {
      paramOverrides: noOverrides(),
      scopeSelector: ARTICLE_SCOPE,
    });
    expect(out).toContain(`${ARTICLE_SCOPE} > ul > li:nth-child(1)`);
    expect(out).not.toContain("> article >");
  });

  it("preserves non-matching child tag", () => {
    const input =
      '@scope ([data-wisp-variant="1"]) {\n' +
      "  :scope > section > p { color: red; }\n" +
      "}";
    const out = carbonize(input, {
      paramOverrides: noOverrides(),
      scopeSelector: ARTICLE_SCOPE,
    });
    expect(out).toContain(`${ARTICLE_SCOPE} > section > p`);
  });

  it("longer-tag false-match is rejected (article vs articles)", () => {
    const input =
      '@scope ([data-wisp-variant="1"]) {\n' +
      "  :scope > articles { color: red; }\n" +
      "}";
    const out = carbonize(input, {
      paramOverrides: noOverrides(),
      scopeSelector: ARTICLE_SCOPE,
    });
    // `articles` is not `article` — must NOT collapse.
    expect(out).toContain(`${ARTICLE_SCOPE} > articles`);
  });

  it("attribute-only scopeSelector skips the strip path (no tag)", () => {
    const input =
      '@scope ([data-wisp-variant="1"]) {\n' +
      "  :scope > article { color: red; }\n" +
      "}";
    const out = carbonize(input, {
      paramOverrides: noOverrides(),
      scopeSelector: '[data-wisp-target="t1"]',
    });
    // Falls through to default rewrite: `> article` stays attached.
    expect(out).toContain('[data-wisp-target="t1"] > article');
  });
});

describe("carbonize — bare-picked-tag strip (Phase 7.14)", () => {
  // Variants authored against the live preview can write `article > header`
  // (instead of `:scope > article > header`) when the author thinks of the
  // picked article as the conceptual root. The descendant @scope still
  // matches in preview because the variant-wrapper's direct child IS the
  // article. After carbonize, the prepend-with-space rule would emit
  // `article.x article > header` — a non-existent nested article — so this
  // strip detects the leading picked-tag + combinator shape and collapses
  // it into the scope selector directly.
  const ARTICLE_SCOPE = "article.bg-white.border.border-neutral-200";

  it("strips bare picked-tag prefix with `>` combinator", () => {
    const input =
      '@scope ([data-wisp-variant="1"]) {\n' +
      "  article > header > h3 { font-weight: 700; }\n" +
      "}";
    const out = carbonize(input, {
      paramOverrides: noOverrides(),
      scopeSelector: ARTICLE_SCOPE,
    });
    expect(out).toContain(`${ARTICLE_SCOPE} > header > h3`);
    expect(out).not.toContain(`${ARTICLE_SCOPE} article`);
  });

  it("strips bare picked-tag prefix with descendant combinator", () => {
    const input =
      '@scope ([data-wisp-variant="1"]) {\n' +
      "  article header { color: red; }\n" +
      "}";
    const out = carbonize(input, {
      paramOverrides: noOverrides(),
      scopeSelector: ARTICLE_SCOPE,
    });
    expect(out).toContain(`${ARTICLE_SCOPE} header`);
    expect(out).not.toContain(`${ARTICLE_SCOPE} article`);
  });

  it("collapses lone bare picked-tag to the scope itself", () => {
    const input =
      '@scope ([data-wisp-variant="1"]) {\n' +
      "  article { padding: 2rem; }\n" +
      "}";
    const out = carbonize(input, {
      paramOverrides: noOverrides(),
      scopeSelector: ARTICLE_SCOPE,
    });
    expect(out).toContain(`${ARTICLE_SCOPE} {`);
    expect(out).toContain("padding: 2rem");
    // Must NOT produce a doubled article (nested descendant).
    expect(out).not.toContain(`${ARTICLE_SCOPE} article`);
  });

  it("does NOT strip compound `article.foo` (treats as descendant filter)", () => {
    const input =
      '@scope ([data-wisp-variant="1"]) {\n' +
      "  article.foo { color: red; }\n" +
      "}";
    const out = carbonize(input, {
      paramOverrides: noOverrides(),
      scopeSelector: ARTICLE_SCOPE,
    });
    // Compound is not the picked-element shorthand — author wrote a stricter
    // descendant filter, keep as-is. Result: `<scope> article.foo` (matches
    // a nested article with class .foo, which doesn't exist in this DOM but
    // is the author's literal intent).
    expect(out).toContain(`${ARTICLE_SCOPE} article.foo`);
  });

  it("strips bare picked-tag with `+` sibling combinator", () => {
    const input =
      '@scope ([data-wisp-variant="1"]) {\n' +
      "  article + section { color: blue; }\n" +
      "}";
    const out = carbonize(input, {
      paramOverrides: noOverrides(),
      scopeSelector: ARTICLE_SCOPE,
    });
    expect(out).toContain(`${ARTICLE_SCOPE} + section`);
  });

  it("longer-tag false-match is rejected (article vs articles) in bare path", () => {
    const input =
      '@scope ([data-wisp-variant="1"]) {\n' +
      "  articles > p { color: red; }\n" +
      "}";
    const out = carbonize(input, {
      paramOverrides: noOverrides(),
      scopeSelector: ARTICLE_SCOPE,
    });
    // `articles` is a different tag — fall through to safe descendant prepend.
    expect(out).toContain(`${ARTICLE_SCOPE} articles > p`);
  });

  it("comma-separated groups each treated independently", () => {
    const input =
      '@scope ([data-wisp-variant="1"]) {\n' +
      "  article > h3, article > p { font-weight: 600; }\n" +
      "}";
    const out = carbonize(input, {
      paramOverrides: noOverrides(),
      scopeSelector: ARTICLE_SCOPE,
    });
    expect(out).toContain(`${ARTICLE_SCOPE} > h3`);
    expect(out).toContain(`${ARTICLE_SCOPE} > p`);
    expect(out).not.toContain(`${ARTICLE_SCOPE} article`);
  });

  it("attribute-only scopeSelector falls through (no tag to strip)", () => {
    const input =
      '@scope ([data-wisp-variant="1"]) {\n' +
      "  article > h3 { color: red; }\n" +
      "}";
    const out = carbonize(input, {
      paramOverrides: noOverrides(),
      scopeSelector: '[data-wisp-target="t1"]',
    });
    // No picked-tag → safe descendant prepend.
    expect(out).toContain('[data-wisp-target="t1"] article > h3');
  });

  // Phase 7.15b — pseudo-class / pseudo-element support.
  // Without these, `h3:hover { ... }` would carbonize to
  // `h3.foo h3:hover` (descendant prepend), which means "find a nested h3
  // inside the picked h3 that's being hovered" — never matches.

  it("strips bare picked-tag before single-colon pseudo-class `:hover`", () => {
    const input =
      '@scope ([data-wisp-variant="1"]) {\n' +
      "  article:hover { transform: translateY(-2px); }\n" +
      "}";
    const out = carbonize(input, {
      paramOverrides: noOverrides(),
      scopeSelector: ARTICLE_SCOPE,
    });
    expect(out).toContain(`${ARTICLE_SCOPE}:hover`);
    expect(out).not.toContain(`${ARTICLE_SCOPE} article`);
  });

  it("strips bare picked-tag before double-colon pseudo-element `::first-letter`", () => {
    const input =
      '@scope ([data-wisp-variant="1"]) {\n' +
      "  h3::first-letter { font-size: 2.5rem; }\n" +
      "}";
    const out = carbonize(input, {
      paramOverrides: noOverrides(),
      scopeSelector: "h3.font-medium.text-base.text-neutral-900",
    });
    expect(out).toContain("h3.font-medium.text-base.text-neutral-900::first-letter");
    expect(out).not.toContain(".text-neutral-900 h3");
  });

  it("strips picked-tag before functional pseudo `:nth-of-type(2)`", () => {
    const input =
      '@scope ([data-wisp-variant="1"]) {\n' +
      "  article:nth-of-type(2) > p { color: red; }\n" +
      "}";
    const out = carbonize(input, {
      paramOverrides: noOverrides(),
      scopeSelector: ARTICLE_SCOPE,
    });
    expect(out).toContain(`${ARTICLE_SCOPE}:nth-of-type(2) > p`);
    expect(out).not.toContain(`${ARTICLE_SCOPE} article`);
  });

  it("strips picked-tag before chained pseudo `:hover::before`", () => {
    const input =
      '@scope ([data-wisp-variant="1"]) {\n' +
      "  article:hover::before { content: ''; }\n" +
      "}";
    const out = carbonize(input, {
      paramOverrides: noOverrides(),
      scopeSelector: ARTICLE_SCOPE,
    });
    expect(out).toContain(`${ARTICLE_SCOPE}:hover::before`);
    expect(out).not.toContain(`${ARTICLE_SCOPE} article`);
  });

  it("does NOT strip when followed by class (compound) — `article.foo` stays descendant", () => {
    // Sanity guard: the new `:` in the lookahead set MUST NOT break the
    // existing compound-selector exception (`article.foo` is a stricter
    // descendant filter, not the picked-element shorthand).
    const input =
      '@scope ([data-wisp-variant="1"]) {\n' +
      "  article.featured { background: yellow; }\n" +
      "}";
    const out = carbonize(input, {
      paramOverrides: noOverrides(),
      scopeSelector: ARTICLE_SCOPE,
    });
    expect(out).toContain(`${ARTICLE_SCOPE} article.featured`);
  });
});

describe("carbonize — phase-7.11 production fixture lock", () => {
  // Locked from sample/index.html lines 29-90 — the v2 hover-physics variant
  // that proved Phase-7.11 redundant-tag stripping works in production. The
  // picked element is `<article class="bg-white border border-neutral-200">`,
  // so :scope after carbonize IS that article. Without the strip,
  // `:scope > article` would emit `article.x > article` (nested article that
  // doesn't exist) and the variant would have no visible effect.
  const ARTICLE_SCOPE = "article.bg-white.border.border-neutral-200";

  it("carbonizes the v2 hover-physics fixture exactly as ships in sample/index.html", () => {
    const input =
      '@scope ([data-wisp-variant="2"]) {\n' +
      "  :scope > article {\n" +
      "    transition: transform 0.35s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.35s ease, border-color 0.35s ease;\n" +
      "    will-change: transform;\n" +
      "  }\n" +
      "  :scope > article:hover {\n" +
      "    transform: translateY(-6px);\n" +
      "    box-shadow: 0 16px 36px -8px rgba(0, 0, 0, 0.10), 0 4px 10px -4px rgba(0, 0, 0, 0.04);\n" +
      "    border-color: rgb(23, 23, 23);\n" +
      "  }\n" +
      "  :scope > article > ul > li {\n" +
      "    transition: transform 0.3s cubic-bezier(0.22, 1, 0.36, 1);\n" +
      "  }\n" +
      "  :scope > article:hover > ul > li:nth-child(1) {\n" +
      "    transform: translateX(4px);\n" +
      "    transition-delay: 0.04s;\n" +
      "  }\n" +
      "}";
    const out = carbonize(input, {
      paramOverrides: noOverrides(),
      scopeSelector: ARTICLE_SCOPE,
    });
    // Picked-tag prefix collapses into scopeSelector itself.
    expect(out).toContain(`${ARTICLE_SCOPE} {`);
    // Hover state on the picked element (no nested article).
    expect(out).toContain(`${ARTICLE_SCOPE}:hover {`);
    // Deeper chain keeps its descendant tail but strips the redundant article.
    expect(out).toContain(`${ARTICLE_SCOPE} > ul > li`);
    // The bug we're locking against: must NOT contain `article.x > article`.
    expect(out).not.toContain(`${ARTICLE_SCOPE} > article`);
  });
});

describe("carbonize — multiple @scope blocks (pin actual behavior)", () => {
  it("documented behavior: parses outer rule first, second @scope is consumed inside body or throws", () => {
    // FINDING: With two @scope blocks at the top level the parser sees the
    // first one as the root rule. The second @scope is read but its body is
    // outside the first rule's closing brace — that means the parser will
    // either:
    //   (a) error on the dangling tokens, OR
    //   (b) silently ignore them since parseRule only handles the first rule.
    // We pin behavior empirically: expect it to NOT throw and to process only
    // the first block. If this assertion ever flips, that's a regression to
    // document, not silently swallow.
    const input =
      '@scope ([data-wisp-variant="0"]) { .a { color: red; } }\n' +
      '@scope ([data-wisp-variant="1"]) { .b { color: blue; } }';
    const out = carbonize(input, {
      paramOverrides: noOverrides(),
      scopeSelector: SCOPE,
    });
    // First block processed; .a present, .b NOT present.
    expect(out).toContain(`${SCOPE} .a`);
    expect(out).not.toContain(`${SCOPE} .b`);
  });
});
