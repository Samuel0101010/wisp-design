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
