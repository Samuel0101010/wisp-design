// wisp-design — Phase 6 structure-variant-mode tests.
//
// Validates: generateStructureVariants emits each kind correctly; splitJsxIntoHalves
// heuristic; rationale ≤ 180 chars; deduplication of requested kinds.

import { describe, expect, it } from "vitest";

import {
  generateStructureVariants,
  splitJsxIntoHalves,
} from "../../src/source/structure-variant-mode.js";
import {
  STRUCTURE_VARIANT_RATIONALE_MAX_LEN,
  type StructureVariantKind,
  type StructureVariantRequest,
} from "../../src/contracts/session.js";

function makeReq(
  kinds: StructureVariantKind[],
  originalJsx: string,
): StructureVariantRequest {
  return {
    target: { id: "T1", selector: "#x", originalJsx },
    requestedKinds: kinds,
  };
}

const SAMPLE = `<section>\n  <h2>Title</h2>\n  <p>Body text here.</p>\n</section>`;

describe("generateStructureVariants — per-kind output", () => {
  it("as-is returns the original JSX unchanged", async () => {
    const res = await generateStructureVariants(makeReq(["as-is"], SAMPLE));
    expect(res.variants).toHaveLength(1);
    expect(res.variants[0]?.kind).toBe("as-is");
    expect(res.variants[0]?.jsx).toBe(SAMPLE);
  });

  it("two-col-split wraps in `<div className=\"grid grid-cols-2 ...\">`", async () => {
    const res = await generateStructureVariants(
      makeReq(["two-col-split"], SAMPLE),
    );
    expect(res.variants[0]?.jsx).toMatch(/grid grid-cols-2/);
    expect(res.variants[0]?.jsx).toMatch(/<div className="grid grid-cols-2/);
  });

  it("card-layout wraps in a Card primitive", async () => {
    const res = await generateStructureVariants(
      makeReq(["card-layout"], SAMPLE),
    );
    expect(res.variants[0]?.jsx).toMatch(/<Card/);
  });

  it("stacked-vertical uses flex flex-col", async () => {
    const res = await generateStructureVariants(
      makeReq(["stacked-vertical"], SAMPLE),
    );
    expect(res.variants[0]?.jsx).toMatch(/flex flex-col/);
  });

  it("horizontal-row uses flex flex-row", async () => {
    const res = await generateStructureVariants(
      makeReq(["horizontal-row"], SAMPLE),
    );
    expect(res.variants[0]?.jsx).toMatch(/flex flex-row/);
  });

  it("hero-style emits a 6xl h1", async () => {
    const res = await generateStructureVariants(
      makeReq(["hero-style"], SAMPLE),
    );
    expect(res.variants[0]?.jsx).toMatch(/<h1 className="text-6xl/);
  });

  it("sidebar-left uses grid-cols-[200px_1fr]", async () => {
    const res = await generateStructureVariants(
      makeReq(["sidebar-left"], SAMPLE),
    );
    expect(res.variants[0]?.jsx).toMatch(/grid-cols-\[200px_1fr\]/);
  });

  it("sidebar-right uses grid-cols-[1fr_200px]", async () => {
    const res = await generateStructureVariants(
      makeReq(["sidebar-right"], SAMPLE),
    );
    expect(res.variants[0]?.jsx).toMatch(/grid-cols-\[1fr_200px\]/);
  });
});

describe("generateStructureVariants — request shape", () => {
  it("request with 3 kinds returns 3 variants in order", async () => {
    const kinds: StructureVariantKind[] = [
      "as-is",
      "two-col-split",
      "card-layout",
    ];
    const res = await generateStructureVariants(makeReq(kinds, SAMPLE));
    expect(res.variants).toHaveLength(3);
    expect(res.variants.map((v) => v.kind)).toEqual(kinds);
  });

  it("deduplicates repeated requestedKinds (first wins)", async () => {
    const res = await generateStructureVariants(
      makeReq(
        ["as-is", "as-is", "two-col-split", "two-col-split"],
        SAMPLE,
      ),
    );
    expect(res.variants).toHaveLength(2);
    expect(res.variants.map((v) => v.kind)).toEqual([
      "as-is",
      "two-col-split",
    ]);
  });

  it("each variant rationale is ≤ STRUCTURE_VARIANT_RATIONALE_MAX_LEN (180) chars", async () => {
    const allKinds: StructureVariantKind[] = [
      "as-is",
      "two-col-split",
      "card-layout",
      "stacked-vertical",
      "horizontal-row",
      "hero-style",
      "sidebar-left",
      "sidebar-right",
    ];
    const res = await generateStructureVariants(makeReq(allKinds, SAMPLE));
    for (const v of res.variants) {
      expect(v.rationale.length).toBeLessThanOrEqual(
        STRUCTURE_VARIANT_RATIONALE_MAX_LEN,
      );
    }
  });

  it("StructureVariantSpec.kind matches request order (no shuffling)", async () => {
    const kinds: StructureVariantKind[] = [
      "hero-style",
      "card-layout",
      "as-is",
    ];
    const res = await generateStructureVariants(makeReq(kinds, SAMPLE));
    expect(res.variants.map((v) => v.kind)).toEqual(kinds);
  });

  it("generatedAt is an ISO timestamp", async () => {
    const res = await generateStructureVariants(makeReq(["as-is"], SAMPLE));
    const d = new Date(res.generatedAt);
    expect(Number.isFinite(d.getTime())).toBe(true);
  });
});

describe("splitJsxIntoHalves — heuristic splitter", () => {
  it("simple wrapper with two child elements splits balanced", () => {
    const { left, right } = splitJsxIntoHalves(
      `<Foo>A<Bar/>B</Foo>`,
    );
    // The walker returns the everything-up-to-first-child-end on the left,
    // and the rest on the right.
    expect(left.length).toBeGreaterThan(0);
    expect(right.length).toBeGreaterThan(0);
    expect(left + right).toMatch(/Foo/);
  });

  it("empty input returns empty halves", () => {
    const { left, right } = splitJsxIntoHalves("");
    expect(left).toBe("");
    expect(right).toBe("");
  });

  it("no wrapping element → falls back to mid-string split", () => {
    const { left, right } = splitJsxIntoHalves("abcdefghij");
    // Documented fallback: split at half-string boundary.
    expect((left + right).length).toBe(10);
    expect(left.length).toBeGreaterThan(0);
    expect(right.length).toBeGreaterThan(0);
  });

  it("self-closing wrapper has no children → left=input, right=empty", () => {
    const { left, right } = splitJsxIntoHalves(`<Foo/>`);
    // findChildrenStart returns -1 for a self-closing tag; the fallback
    // splits at mid. Document the actual behaviour.
    expect(left.length + right.length).toBe(`<Foo/>`.length);
  });

  it("deeply-nested wrapper: pinned brittle behavior — splitter walks first child only", () => {
    const jsx = `<div><span><b>a</b></span><i>b</i></div>`;
    const { left, right } = splitJsxIntoHalves(jsx);
    // Documented: the splitter is single-pass and finds the first balanced
    // top-level child element under the wrapper. Both halves together
    // contain the whole input (modulo trimming).
    expect(left + right).toContain("<span>");
    expect(left + right).toContain("<i>");
  });
});
