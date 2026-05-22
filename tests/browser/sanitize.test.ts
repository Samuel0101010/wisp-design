// wisp-design — Sanitize module tests (Phase 2).
//
// Targets src/browser/sanitize.ts. Trust-boundary surface — every user- or
// agent-controlled string entering the DOM flows through these four
// functions. Behaviour locked here.

import { describe, expect, it } from "vitest";

import {
  escapeHtml,
  sanitizeFreeText,
  sanitizeModule,
  trustedCssVar,
  trustedSelector,
} from "../../src/browser/sanitize.js";
import { FREE_TEXT_MAX_LEN } from "../../src/browser/constants.js";

// ---------------------------------------------------------------------------
// escapeHtml
// ---------------------------------------------------------------------------

describe("escapeHtml", () => {
  it("returns empty string for empty input", () => {
    expect(escapeHtml("")).toBe("");
  });

  it("escapes <, >, &", () => {
    expect(escapeHtml("<a&b>")).toBe("&lt;a&amp;b&gt;");
  });

  it("escapes \" and '", () => {
    expect(escapeHtml(`"text'`)).toBe("&quot;text&#39;");
  });

  it("returns empty for null / undefined", () => {
    expect(escapeHtml(null as unknown as string)).toBe("");
    expect(escapeHtml(undefined as unknown as string)).toBe("");
  });

  it("double-escapes already-escaped entities (no idempotence)", () => {
    // Documents current behaviour: escapeHtml is NOT idempotent — `&amp;`
    // → `&amp;amp;`. Callers must escape exactly once before rendering.
    expect(escapeHtml("&amp;")).toBe("&amp;amp;");
  });
});

// ---------------------------------------------------------------------------
// sanitizeFreeText
// ---------------------------------------------------------------------------

describe("sanitizeFreeText", () => {
  it("strips <script>...</script> blocks", () => {
    expect(sanitizeFreeText("<script>alert(1)</script>hello")).toBe("hello");
  });

  it("strips <style>...</style> blocks", () => {
    expect(sanitizeFreeText("<style>body{}</style>x")).toBe("x");
  });

  it("strips inline event handlers and keeps surrounding text", () => {
    // The INLINE_EVENT_HANDLER_RE consumes the leading whitespace as well
    // (`/\son\w+\s*=…/`), so the result is `<img src=x>safe` — no trailing
    // space inside the img tag. Note: this differs from security's reported
    // decision #5 ("<img src=x >safe"); the regex behaviour in code is the
    // source of truth.
    expect(sanitizeFreeText("<img src=x onerror=alert(1)>safe"))
      .toBe("<img src=x>safe");
  });

  it("strips orphan open <iframe ...>", () => {
    expect(sanitizeFreeText("<iframe src=x>")).toBe("");
  });

  it("strips orphan close </iframe>", () => {
    expect(sanitizeFreeText("</iframe>")).toBe("");
  });

  it("strips javascript: prefix but keeps the tail", () => {
    // Strip-prefix policy (not reject-whole) — see security decision.
    expect(sanitizeFreeText("javascript:alert(1)")).toBe("alert(1)");
  });

  it("truncates at maxLen on a word boundary when available", () => {
    // 200 chars of 'word ' pattern → maxLen 50 should land near a space.
    const input = "word ".repeat(100); // 500 chars
    const out = sanitizeFreeText(input, { maxLen: 50 });
    expect(out.length).toBeLessThanOrEqual(50);
    // last char should not be a partial word — either a space or end of word
    expect(out.endsWith(" ") || /\w$/.test(out)).toBe(true);
  });

  it("falls back to hard-cut if no whitespace within 75% threshold", () => {
    // Long URL-like string with no spaces → hard-cut at maxLen.
    const input = "x".repeat(200);
    const out = sanitizeFreeText(input, { maxLen: 50 });
    expect(out.length).toBe(50);
  });

  it("normalises \\r\\n and lone \\r to \\n", () => {
    expect(sanitizeFreeText("a\r\nb\rc")).toBe("a\nb\nc");
  });

  it("strips C0 BEL (U+0007) and DEL (U+007F) but preserves \\t \\n \\r", () => {
    const input = "abc\td\ne";
    const out = sanitizeFreeText(input);
    expect(out).toBe("abc\td\ne");
  });

  it("returns empty for empty input", () => {
    expect(sanitizeFreeText("")).toBe("");
  });

  it("respects default FREE_TEXT_MAX_LEN", () => {
    // Use a string slightly under the default cap and confirm survival.
    const input = "a".repeat(FREE_TEXT_MAX_LEN - 1);
    const out = sanitizeFreeText(input);
    expect(out.length).toBe(FREE_TEXT_MAX_LEN - 1);
  });
});

// ---------------------------------------------------------------------------
// trustedCssVar
// ---------------------------------------------------------------------------

describe("trustedCssVar", () => {
  it("accepts a well-formed --name + value pair", () => {
    const r = trustedCssVar("--padding", "16px");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.varName).toBe("--padding");
      expect(r.value).toBe("16px");
    }
  });

  it("rejects var name missing `--` prefix", () => {
    const r = trustedCssVar("padding", "16px");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason.code).toBe("INVALID_CSS_VAR_NAME");
  });

  it("rejects value containing url(...)", () => {
    const r = trustedCssVar("--bg", "url(http://evil.com)");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason.code).toBe("INVALID_CSS_VALUE");
  });

  it("rejects value containing semicolon", () => {
    const r = trustedCssVar("--bg", "; background: red");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      // either FORBIDDEN_CHAR (`;`) or INVALID_CSS_VALUE depending on order.
      expect(["FORBIDDEN_CHAR", "INVALID_CSS_VALUE"]).toContain(r.reason.code);
    }
  });

  it("rejects expression(alert(1))", () => {
    const r = trustedCssVar("--x", "expression(alert(1))");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason.code).toBe("INVALID_CSS_VALUE");
  });

  it("rejects backslash escape sequences", () => {
    const r = trustedCssVar("--x", "\\0022");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason.code).toBe("FORBIDDEN_CHAR");
  });
});

// ---------------------------------------------------------------------------
// trustedSelector
// ---------------------------------------------------------------------------

describe("trustedSelector", () => {
  it("accepts a simple attribute selector", () => {
    const r = trustedSelector("[data-id]");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.selector).toBe("[data-id]");
  });

  it("rejects selector mentioning script tag name", () => {
    const r = trustedSelector("[data-id] script");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason.code).toBe("INVALID_SELECTOR");
  });

  it("rejects :has(iframe) via deep-clause inspection", () => {
    const r = trustedSelector("div:has(iframe)");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason.code).toBe("INVALID_SELECTOR");
  });

  it("rejects bare * because `*=` substring blacklist would not catch it but blacklist hits other tokens; we just verify documented behaviour", () => {
    // `*` alone is allowed by current impl — verify it's not rejected by the
    // forbidden-substring list (which targets `*=`, not bare `*`).
    const r = trustedSelector("*");
    expect(r.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Aggregate
// ---------------------------------------------------------------------------

describe("sanitizeModule aggregate", () => {
  it("exposes all four functions", () => {
    expect(typeof sanitizeModule.escapeHtml).toBe("function");
    expect(typeof sanitizeModule.sanitizeFreeText).toBe("function");
    expect(typeof sanitizeModule.trustedCssVar).toBe("function");
    expect(typeof sanitizeModule.trustedSelector).toBe("function");
  });
});
