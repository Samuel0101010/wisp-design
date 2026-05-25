// Phase 7.16 — a11y-radar scoring tests.

import { describe, it, expect } from "vitest";
import {
  scoreVariant,
  contrastRatio,
} from "../../src/browser/a11y-radar.js";

describe("a11y-radar / scoreVariant", () => {
  it("clean variant scores 100", () => {
    const css = "h3 { font-size: 18px; font-weight: 500; }";
    const r = scoreVariant(css);
    expect(r.score).toBe(100);
    expect(r.severity).toBe("good");
    expect(r.topFinding).toBeNull();
  });

  it("font-size 10px triggers font-size-too-small penalty (−12)", () => {
    const r = scoreVariant("p { font-size: 10px; }");
    expect(r.score).toBe(88);
    expect(r.severity).toBe("good");
    expect(r.findings[0]?.rule).toBe("font-size-too-small");
  });

  it("contrast 1:1 (white on white) triggers contrast-AA fail (−30)", () => {
    const css = "p { color: #ffffff; background-color: #ffffff; }";
    const r = scoreVariant(css);
    expect(r.score).toBe(70);
    expect(r.severity).toBe("warn");
    expect(r.findings[0]?.rule).toBe("contrast-AA");
  });

  it("contrast 1:1 + tiny font + gradient text drops to fail bucket", () => {
    const css =
      ".x { color: #fff; background-color: #fff; font-size: 9px;" +
      " background-image: linear-gradient(45deg, #f0f, #0ff); background-clip: text; }";
    const r = scoreVariant(css);
    // 100 - 30 (contrast) - 12 (font-size) - 20 (gradient-text) = 38
    expect(r.score).toBe(38);
    expect(r.severity).toBe("fail");
    expect(r.findings.some((f) => f.rule === "gradient-text")).toBe(true);
  });

  it("AAA threshold (between 4.5 and 7) is a warn, not a fail", () => {
    // #595959 on white = 7.00:1 → just AAA. Use #707070 on white ≈ 4.86:1 → AA but not AAA.
    const css = "p { color: #707070; background-color: #ffffff; }";
    const r = scoreVariant(css);
    expect(r.findings.some((f) => f.rule === "contrast-AAA")).toBe(true);
    expect(r.findings.some((f) => f.rule === "contrast-AA")).toBe(false);
  });

  it("font-weight 100 triggers light-weight penalty", () => {
    const r = scoreVariant("p { font-weight: 100; }");
    expect(r.score).toBe(94);
    expect(r.findings[0]?.rule).toBe("font-weight-too-light");
  });

  it("transition without reduced-motion guard triggers penalty", () => {
    const r = scoreVariant("p { transition: opacity 200ms ease; }");
    expect(r.score).toBe(90);
    expect(r.findings[0]?.rule).toBe("no-reduced-motion-guard");
  });

  it("transition WITH @media reduced-motion does NOT penalize", () => {
    const css = `p { transition: opacity 200ms ease; }
                 @media (prefers-reduced-motion: reduce) { p { transition: none; } }`;
    const r = scoreVariant(css);
    expect(r.findings.some((f) => f.rule === "no-reduced-motion-guard")).toBe(false);
  });

  it("glassmorphism (backdrop-filter blur) triggers penalty", () => {
    const r = scoreVariant(".card { backdrop-filter: blur(8px); }");
    expect(r.score).toBe(88);
    expect(r.findings[0]?.rule).toBe("glassmorphism");
  });

  it("severity buckets: good ≥80, warn 50..79, fail <50", () => {
    expect(scoreVariant("p { color: #fff; background-color: #fff; }").severity).toBe("warn");
    expect(
      scoreVariant(
        "p { color: #fff; background-color: #fff; font-size: 8px; " +
          "font-weight: 100; backdrop-filter: blur(8px); transition: all 1s; }",
      ).severity,
    ).toBe("fail");
  });

  it("empty CSS scores 100 (no signals = no penalties)", () => {
    expect(scoreVariant("").score).toBe(100);
    expect(scoreVariant("/* baseline */").score).toBe(100);
  });

  it("topFinding is the largest-penalty entry", () => {
    const css =
      "p { color: #fff; background-color: #fff; font-size: 9px; transition: all 1s; }";
    const r = scoreVariant(css);
    // contrast-AA -30 > no-reduced-motion -10 > font-size -12 (sorted by penalty desc)
    expect(r.topFinding?.rule).toBe("contrast-AA");
  });

  it("CSS variables and currentColor are gracefully ignored (no false-fail)", () => {
    const r = scoreVariant(
      "p { color: var(--text); background-color: currentColor; font-size: 14px; }",
    );
    // Neither color parses → no contrast finding; score stays 100.
    expect(r.score).toBe(100);
  });

  it("contrastBg option allows scoring fg-only CSS", () => {
    const r = scoreVariant("p { color: #ccc; }", { contrastBg: "#ffffff" });
    // #ccc on #fff ≈ 1.61:1 → fails AA
    expect(r.findings.some((f) => f.rule === "contrast-AA")).toBe(true);
  });
});

describe("a11y-radar / contrastRatio", () => {
  it("black on white = 21:1", () => {
    const ratio = contrastRatio(
      { r: 0, g: 0, b: 0, a: 1 },
      { r: 255, g: 255, b: 255, a: 1 },
    );
    expect(ratio).toBeCloseTo(21, 1);
  });

  it("white on white = 1:1", () => {
    const ratio = contrastRatio(
      { r: 255, g: 255, b: 255, a: 1 },
      { r: 255, g: 255, b: 255, a: 1 },
    );
    expect(ratio).toBeCloseTo(1, 5);
  });

  it("is symmetric (fg/bg swap yields same ratio)", () => {
    const a = { r: 50, g: 50, b: 50, a: 1 };
    const b = { r: 200, g: 200, b: 200, a: 1 };
    expect(contrastRatio(a, b)).toBeCloseTo(contrastRatio(b, a), 6);
  });
});
