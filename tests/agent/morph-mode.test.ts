// wisp-design — Phase 6 morph-mode tests.
//
// Validates: buildSource diff extraction (sorted, deterministic),
// interpolate (linear for matching units, snap-at-0.5 otherwise),
// parseCssValue, t-clamping.

import { describe, expect, it } from "vitest";

import {
  buildSource,
  interpolate,
  parseCssValue,
} from "../../src/agent/morph.js";

const A = (vars: Record<string, string>) => ({ id: "vA", cssVars: vars });
const B = (vars: Record<string, string>) => ({ id: "vB", cssVars: vars });

describe("buildSource", () => {
  it("empty cssVars on both sides → empty variableDiff", () => {
    const src = buildSource(A({}), B({}));
    expect(src.variableDiff).toEqual([]);
    expect(src.variantIdA).toBe("vA");
    expect(src.variantIdB).toBe("vB");
  });

  it("both sides have `--padding` with different px values → 1 interpolatable diff", () => {
    const src = buildSource(
      A({ "--padding": "16px" }),
      B({ "--padding": "24px" }),
    );
    expect(src.variableDiff).toHaveLength(1);
    const diff = src.variableDiff[0]!;
    expect(diff.name).toBe("--padding");
    expect(diff.valueA).toBe("16px");
    expect(diff.valueB).toBe("24px");
    expect(diff.interpolatable).toBe(true);
    expect(diff.unit).toBe("px");
  });

  it("only A has a var → diff carries valueB = valueA (no-op)", () => {
    const src = buildSource(A({ "--gap": "8px" }), B({}));
    expect(src.variableDiff).toHaveLength(1);
    expect(src.variableDiff[0]?.valueA).toBe("8px");
    expect(src.variableDiff[0]?.valueB).toBe("8px");
  });

  it("only B has a var → diff carries valueA = valueB (no-op)", () => {
    const src = buildSource(A({}), B({ "--gap": "8px" }));
    expect(src.variableDiff).toHaveLength(1);
    expect(src.variableDiff[0]?.valueA).toBe("8px");
    expect(src.variableDiff[0]?.valueB).toBe("8px");
  });

  it("different units (`16px` vs `1rem`) → NOT interpolatable", () => {
    const src = buildSource(
      A({ "--space": "16px" }),
      B({ "--space": "1rem" }),
    );
    expect(src.variableDiff[0]?.interpolatable).toBe(false);
  });

  it("color values (`#fff` vs `#000`) → NOT interpolatable", () => {
    const src = buildSource(
      A({ "--color": "#fff" }),
      B({ "--color": "#000" }),
    );
    expect(src.variableDiff[0]?.interpolatable).toBe(false);
  });

  it("var names are sorted (determinism guarantee)", () => {
    const src = buildSource(
      A({ "--z": "1px", "--a": "2px", "--m": "3px" }),
      B({ "--z": "5px", "--a": "6px", "--m": "7px" }),
    );
    const names = src.variableDiff.map((d) => d.name);
    expect(names).toEqual(["--a", "--m", "--z"]);
  });

  it("same inputs → byte-equivalent output (determinism)", () => {
    const s1 = buildSource(
      A({ "--p": "16px", "--g": "8px" }),
      B({ "--p": "32px", "--g": "16px" }),
    );
    const s2 = buildSource(
      A({ "--g": "8px", "--p": "16px" }),
      B({ "--g": "16px", "--p": "32px" }),
    );
    // Order-insensitive input, deterministic output.
    expect(JSON.stringify(s1.variableDiff)).toBe(
      JSON.stringify(s2.variableDiff),
    );
  });
});

describe("interpolate — t bounds + linear", () => {
  const src = () =>
    buildSource(
      A({ "--padding": "16px" }),
      B({ "--padding": "24px" }),
    );

  it("t=0 → all values = valueA", () => {
    const cfg = interpolate(src(), 0);
    expect(cfg.t).toBe(0);
    expect(cfg.interpolatedCss).toContain("16px");
  });

  it("t=1 → all values = valueB", () => {
    const cfg = interpolate(src(), 1);
    expect(cfg.t).toBe(1);
    expect(cfg.interpolatedCss).toContain("24px");
  });

  it("t=0.5 (interpolatable) → midpoint (20px)", () => {
    const cfg = interpolate(src(), 0.5);
    // 16 + (24-16)*0.5 = 20
    expect(cfg.interpolatedCss).toMatch(/--padding:\s*20px/);
  });

  it("t clamps to [0,1] — t=-1 → t=0, t=2 → t=1", () => {
    const lo = interpolate(src(), -1);
    expect(lo.t).toBe(0);
    expect(lo.interpolatedCss).toContain("16px");

    const hi = interpolate(src(), 2);
    expect(hi.t).toBe(1);
    expect(hi.interpolatedCss).toContain("24px");
  });
});

describe("interpolate — snap behavior for non-interpolatable", () => {
  const colorSrc = () =>
    buildSource(A({ "--c": "#fff" }), B({ "--c": "#000" }));

  it("t < 0.5 (non-interpolatable) → snaps to valueA", () => {
    const cfg = interpolate(colorSrc(), 0.3);
    expect(cfg.interpolatedCss).toMatch(/--c:\s*#fff/);
  });

  it("t >= 0.5 (non-interpolatable) → snaps to valueB", () => {
    const cfg = interpolate(colorSrc(), 0.5);
    expect(cfg.interpolatedCss).toMatch(/--c:\s*#000/);
  });
});

describe("parseCssValue", () => {
  it("16px → numeric 16, unit px", () => {
    expect(parseCssValue("16px")).toEqual({ numeric: 16, unit: "px" });
  });

  it("1.5rem → numeric 1.5, unit rem", () => {
    expect(parseCssValue("1.5rem")).toEqual({ numeric: 1.5, unit: "rem" });
  });

  it("bare number `42` → numeric 42, unit empty string", () => {
    expect(parseCssValue("42")).toEqual({ numeric: 42, unit: "" });
  });

  it("`foo` (non-numeric) → null", () => {
    expect(parseCssValue("foo")).toBeNull();
  });

  it("`#fff` (hex color) → null", () => {
    expect(parseCssValue("#fff")).toBeNull();
  });

  it("empty string → null", () => {
    expect(parseCssValue("")).toBeNull();
  });
});

describe("interpolate — determinism", () => {
  it("same input → same output (sorted vars, stable formatting)", () => {
    const src1 = buildSource(
      A({ "--p": "16px", "--g": "8px" }),
      B({ "--p": "32px", "--g": "16px" }),
    );
    const cfg1 = interpolate(src1, 0.25);
    const cfg2 = interpolate(src1, 0.25);
    expect(cfg1.interpolatedCss).toBe(cfg2.interpolatedCss);
  });
});
