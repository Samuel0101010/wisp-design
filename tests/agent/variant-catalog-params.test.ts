// wisp-design — regression test for dormant @param sliders + morph in the
// deterministic (no-LLM) variant-catalog path.
//
// Bug (Fix-Spec ADDITIONAL): the default catalog variants carried ZERO
// `/* @param … */ --var: value;` annotations, so in the cycling UI:
//   • no parameter sliders mounted (extractParameterBindings → []), and
//   • the morph slider showed "no shared parameters between variants"
//     (buildSource found no shared interpolatable --var).
// Two documented USPs (zero-roundtrip Parameter-Slider + morph-mode #3) were
// therefore inert unless an LLM happened to emit @param.
//
// The browser-side parser (src/browser/parameter-sliders.ts
// extractParameterBindings) and the agent-side morph engine
// (src/agent/morph.ts buildSource) already work — only the catalog lacked the
// annotated --vars. These tests pin that the relevant catalog families now
// emit well-formed @param directives AND that two same-intent variants share
// at least one interpolatable --var.

import { describe, expect, it } from "vitest";

import {
  generateVariantsFromIntent,
  type Variant,
} from "../../src/agent/variant-catalog.js";
import { extractParameterBindings } from "../../src/browser/parameter-sliders.js";
import { buildSource } from "../../src/agent/morph.js";

// Derive a cssVars Record from a variant's `@param` declarations the same way
// a correct browser-side cycling render does: read each `--var: value;` that
// carries a @param annotation. This is what morph's buildSource consumes.
function cssVarsFromParams(css: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /\/\*\s*@param:[^*]*\*\/\s*(--[A-Za-z][\w-]*)\s*:\s*([^;]+);/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css)) !== null) {
    if (m[1] && m[2]) out[m[1]] = m[2].trim();
  }
  return out;
}

function nonBaselineVariants(variants: Variant[]): Variant[] {
  // The first catalog entry is always the identity baseline (no @param).
  return variants.filter((v) => !v.css.includes("identity — baseline"));
}

// Families the spec calls out: padding/spacing, line-height, weight.
const PARAM_FAMILIES: ReadonlyArray<{ freeText: string; targetTag: string }> = [
  { freeText: "spacious", targetTag: "div" }, // container padding/gap
  { freeText: "compact", targetTag: "div" }, // container padding/gap
  { freeText: "bolder", targetTag: "h2" }, // text font-weight
  { freeText: "spacious", targetTag: "p" }, // text line-height
];

describe("variant-catalog — @param sliders activate in the default path", () => {
  for (const { freeText, targetTag } of PARAM_FAMILIES) {
    it(`"${freeText}" on <${targetTag}> emits at least one well-formed @param binding`, () => {
      const variants = generateVariantsFromIntent({
        freeText,
        targetTag,
        maxVariants: 3,
      });
      const tunable = nonBaselineVariants(variants);
      expect(tunable.length).toBeGreaterThan(0);
      // At least one non-baseline variant must produce a parseable binding via
      // the SAME parser the browser uses to mount sliders.
      const anyBinding = tunable.some(
        (v) => extractParameterBindings(v.css).length > 0,
      );
      expect(
        anyBinding,
        `expected >=1 @param binding among:\n${tunable.map((v) => v.css).join("\n")}`,
      ).toBe(true);
    });
  }
});

describe("variant-catalog — morph has a shared interpolatable --var", () => {
  for (const { freeText, targetTag } of PARAM_FAMILIES) {
    it(`"${freeText}" on <${targetTag}>: two same-intent variants share an interpolatable --var`, () => {
      const variants = generateVariantsFromIntent({
        freeText,
        targetTag,
        maxVariants: 3,
      });
      const tunable = nonBaselineVariants(variants);
      // Need at least two non-baseline variants to morph between.
      expect(tunable.length).toBeGreaterThanOrEqual(2);

      const a = tunable[0]!;
      const b = tunable[1]!;
      const source = buildSource(
        { id: "a", cssVars: cssVarsFromParams(a.css) },
        { id: "b", cssVars: cssVarsFromParams(b.css) },
      );
      const interpolatable = source.variableDiff.filter((d) => d.interpolatable);
      expect(
        interpolatable.length,
        `expected >=1 shared interpolatable --var; diff was ${JSON.stringify(
          source.variableDiff,
        )}`,
      ).toBeGreaterThan(0);
    });
  }
});
