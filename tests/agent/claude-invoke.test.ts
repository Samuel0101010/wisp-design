// Phase 7.9 — Tests for the headless claude CLI wrapper. We don't invoke a
// real claude binary in tests; instead we point claudeBin at a tiny shim
// script that emits a canned JSON envelope to stdout. This validates parsing,
// extraction, error mapping, and the prompt shape.

import { describe, it, expect } from "vitest";

import {
  buildVariantPrompt,
  detectClaudeBin,
  extractJsonObject,
  invokeClaudeForVariants,
  parseClaudeEnvelope,
} from "../../src/agent/claude-invoke.js";

// ---------------------------------------------------------------------------
// extractJsonObject
// ---------------------------------------------------------------------------

describe("extractJsonObject", () => {
  it("returns trimmed JSON when input is already a clean object", () => {
    const inp = `  {"variants":[{"css":"x","rationale":"y"}]}  `;
    const out = extractJsonObject(inp);
    expect(out).toBe(`{"variants":[{"css":"x","rationale":"y"}]}`);
  });

  it("strips ```json fence wrappers", () => {
    const inp =
      "```json\n" + `{"variants":[{"css":"x","rationale":"y"}]}` + "\n```";
    const out = extractJsonObject(inp);
    expect(out).toBe(`{"variants":[{"css":"x","rationale":"y"}]}`);
  });

  it("strips bare ``` fence wrappers", () => {
    const inp = "```\n" + `{"variants":[]}` + "\n```";
    const out = extractJsonObject(inp);
    expect(out).toBe(`{"variants":[]}`);
  });

  it("extracts JSON from text-surrounded response", () => {
    const inp = `Here are the variants you asked for:\n{"variants":[{"css":"a","rationale":"b"}]}\n— let me know if these work.`;
    const out = extractJsonObject(inp);
    expect(out).toContain(`"variants"`);
    expect(out!.startsWith("{")).toBe(true);
    expect(out!.endsWith("}")).toBe(true);
  });

  it("returns null when no JSON object is present", () => {
    expect(extractJsonObject("just plain text")).toBeNull();
    expect(extractJsonObject("")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// buildVariantPrompt
// ---------------------------------------------------------------------------

describe("buildVariantPrompt", () => {
  it("includes the picked selector, tag, wish, and count", () => {
    const prompt = buildVariantPrompt({
      target: { selector: "article.foo", tag: "ARTICLE" },
      freeText: "make it warmer",
      variantCount: 3,
    });
    expect(prompt).toContain("article.foo");
    expect(prompt).toContain("ARTICLE");
    expect(prompt).toContain("make it warmer");
    expect(prompt).toContain("Variants requested: 3");
  });

  it("emits a tag-specific axis hint for ARTICLE", () => {
    const p = buildVariantPrompt({
      target: { selector: "x", tag: "ARTICLE" },
      freeText: "y",
      variantCount: 3,
    });
    expect(p.toLowerCase()).toContain("density");
  });

  it("emits a tag-specific axis hint for BUTTON", () => {
    const p = buildVariantPrompt({
      target: { selector: "x", tag: "BUTTON" },
      freeText: "y",
      variantCount: 3,
    });
    expect(p.toLowerCase()).toContain("padding");
    expect(p.toLowerCase()).toContain("border-radius");
  });

  it("falls back gracefully on unknown tags", () => {
    const p = buildVariantPrompt({
      target: { selector: "x", tag: "ASIDE" },
      freeText: "y",
      variantCount: 3,
    });
    expect(p).toContain("any primary axis");
  });

  it("clamps variantCount to [1, 8]", () => {
    const lo = buildVariantPrompt({
      target: { selector: "x", tag: "DIV" },
      freeText: "y",
      variantCount: 0,
    });
    expect(lo).toContain("Variants requested: 1");
    const hi = buildVariantPrompt({
      target: { selector: "x", tag: "DIV" },
      freeText: "y",
      variantCount: 99,
    });
    expect(hi).toContain("Variants requested: 8");
  });

  it("escapes embedded double quotes in freeText", () => {
    const p = buildVariantPrompt({
      target: { selector: "x", tag: "DIV" },
      freeText: 'a "quoted" wish',
      variantCount: 3,
    });
    expect(p).toContain('\\"quoted\\"');
  });

  it("enumerates anti-slop bans", () => {
    const p = buildVariantPrompt({
      target: { selector: "x", tag: "DIV" },
      freeText: "y",
      variantCount: 3,
    });
    expect(p.toLowerCase()).toContain("anti-slop");
    expect(p.toLowerCase()).toContain("purple-blue");
    expect(p.toLowerCase()).toContain("glassmorphism");
    expect(p.toLowerCase()).toContain("hero-metric");
  });
});

// ---------------------------------------------------------------------------
// detectClaudeBin — handles missing-binary case without throwing
// ---------------------------------------------------------------------------

describe("detectClaudeBin", () => {
  it("returns ok:false for a non-existent binary", async () => {
    const r = await detectClaudeBin("definitely-not-a-real-binary-name-xyz");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("not-in-PATH");
  });
});

// ---------------------------------------------------------------------------
// parseClaudeEnvelope — pure parsing tests (no subprocess). Covers every
// branch of the claude → variants pipeline without depending on a real
// claude binary or a cross-OS shim.
// ---------------------------------------------------------------------------

describe("parseClaudeEnvelope", () => {
  it("parses a well-formed envelope and returns variants", () => {
    const envelope = {
      type: "result",
      subtype: "success",
      is_error: false,
      duration_ms: 4321,
      total_cost_usd: 0.0123,
      result: JSON.stringify({
        variants: [
          { css: "/* baseline */", rationale: "Baseline — original." },
          {
            css: ":scope > article { padding: 2em !important; }",
            rationale: "Generous density.",
          },
          {
            css: ":scope > article > h3 { font-weight: 700 !important; }",
            rationale: "Heavier hierarchy.",
          },
        ],
      }),
    };
    const r = parseClaudeEnvelope(JSON.stringify(envelope), "haiku");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.variants).toHaveLength(3);
      expect(r.variants[0]!.id).toBe("v0");
      expect(r.variants[1]!.css).toContain("padding");
      expect(r.costUsd).toBeCloseTo(0.0123, 4);
      expect(r.durationMs).toBe(4321);
      expect(r.model).toBe("haiku");
    }
  });

  it("strips markdown fences from .result before parsing", () => {
    const inner = JSON.stringify({
      variants: [
        { css: "/* baseline */", rationale: "Baseline — original." },
        { css: ":scope { padding: 2em !important; }", rationale: "Roomier." },
      ],
    });
    const fenced = "```json\n" + inner + "\n```";
    const envelope = { result: fenced, total_cost_usd: 0, duration_ms: 100 };
    const r = parseClaudeEnvelope(JSON.stringify(envelope), "haiku");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.variants).toHaveLength(2);
  });

  it("returns envelope-parse-failed when stdout is not JSON", () => {
    const r = parseClaudeEnvelope("not json at all", "haiku");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("envelope-parse-failed");
  });

  it("returns no-json-in-result when .result has no JSON object", () => {
    const envelope = { result: "Sorry, I cannot do that.", duration_ms: 100 };
    const r = parseClaudeEnvelope(JSON.stringify(envelope), "haiku");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("no-json-in-result");
  });

  it("returns no-variants when result has wrong shape", () => {
    const envelope = { result: JSON.stringify({ something: "else" }) };
    const r = parseClaudeEnvelope(JSON.stringify(envelope), "haiku");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("no-variants");
  });

  it("surfaces is_error envelope as claude-error", () => {
    const envelope = {
      is_error: true,
      subtype: "api_error",
      result: "rate_limit_exceeded",
    };
    const r = parseClaudeEnvelope(JSON.stringify(envelope), "haiku");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("claude-error");
  });

  it("coerces non-string css/rationale to safe defaults", () => {
    const envelope = {
      result: JSON.stringify({
        variants: [
          { css: 123, rationale: null },
          { css: ":scope {}", rationale: "ok" },
        ],
      }),
    };
    const r = parseClaudeEnvelope(JSON.stringify(envelope), "haiku");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.variants[0]!.css).toBe("");
      expect(r.variants[0]!.rationale).toContain("Variant");
      expect(r.variants[1]!.css).toContain("scope");
    }
  });
});

describe("invokeClaudeForVariants (live process)", () => {
  it("returns claude-not-found when bin is missing", async () => {
    const r = await invokeClaudeForVariants(
      { target: { selector: "x", tag: "DIV" }, freeText: "y", variantCount: 3 },
      { claudeBin: "definitely-not-a-real-binary-xyz-12345" },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("claude-not-found");
  });
});
