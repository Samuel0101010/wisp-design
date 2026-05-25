// wisp-design — Tailwind className anti-slop tests (Phase 6.5).
//
// Verifies that all four className-aware hard-ban rules detect slop patterns
// that live in className="..." attributes rather than in CSS property declarations.
// Loads AiHero.tsx (deliberate slop) and PricingCard.tsx (clean baseline).

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  runAntiSlop,
  runAntiSlopOnFiles,
} from "../../src/verify/anti-slop-linter.js";
import type { AntiSlopViolation } from "../../src/contracts/verify.js";

const FIXTURES_DIR = resolve("sample/components");

function loadFixture(name: string): string {
  return readFileSync(join(FIXTURES_DIR, name), "utf8");
}

async function violationsOf(
  rawSource: string,
): Promise<AntiSlopViolation[]> {
  const res = await runAntiSlop(rawSource, { rawSource });
  return (res.violations ?? []) as AntiSlopViolation[];
}

function hasRule(
  violations: AntiSlopViolation[],
  ruleId: string,
): boolean {
  return violations.some((v) => v.ruleId === ruleId);
}

// ---------------------------------------------------------------------------
// AiHero.tsx — deliberate slop: must fire 4 hard-ban rules
// ---------------------------------------------------------------------------

describe("AiHero.tsx Tailwind hard-bans", () => {
  let violations: AntiSlopViolation[];

  it("loads AiHero.tsx successfully", async () => {
    const src = loadFixture("AiHero.tsx");
    expect(src.length).toBeGreaterThan(0);
    violations = await violationsOf(src);
  });

  it("fires gradient-text-headline (bg-clip-text text-transparent in className)", async () => {
    const src = loadFixture("AiHero.tsx");
    const v = await violationsOf(src);
    expect(
      hasRule(v, "gradient-text-headline"),
      `expected gradient-text-headline hit; got rules: ${v.map((x) => x.ruleId).join(", ")}`,
    ).toBe(true);
  });

  it("fires hero-metric-template (text-7xl with '10x' metric text)", async () => {
    const src = loadFixture("AiHero.tsx");
    const v = await violationsOf(src);
    expect(
      hasRule(v, "hero-metric-template"),
      `expected hero-metric-template hit; got rules: ${v.map((x) => x.ruleId).join(", ")}`,
    ).toBe(true);
  });

  it("fires default-glassmorphism (backdrop-blur-md + bg-white/30 in className)", async () => {
    const src = loadFixture("AiHero.tsx");
    const v = await violationsOf(src);
    expect(
      hasRule(v, "default-glassmorphism"),
      `expected default-glassmorphism hit; got rules: ${v.map((x) => x.ruleId).join(", ")}`,
    ).toBe(true);
  });

  it("fires purple-blue-gradient (from-purple-500 + to-blue-500 co-occurring in className)", async () => {
    const src = loadFixture("AiHero.tsx");
    const v = await violationsOf(src);
    expect(
      hasRule(v, "purple-blue-gradient"),
      `expected purple-blue-gradient hit; got rules: ${v.map((x) => x.ruleId).join(", ")}`,
    ).toBe(true);
  });

  it("all four Tailwind hard-ban rules fire (≥4 distinct rule IDs from the target set)", async () => {
    const src = loadFixture("AiHero.tsx");
    const v = await violationsOf(src);
    const targetRules = [
      "gradient-text-headline",
      "hero-metric-template",
      "default-glassmorphism",
      "purple-blue-gradient",
    ];
    const hitRules = targetRules.filter((r) => hasRule(v, r));
    expect(
      hitRules.length,
      `expected all 4 Tailwind hard-bans; got only: ${hitRules.join(", ")}`,
    ).toBe(4);
  });

  it("all hits have severity=fail", async () => {
    const src = loadFixture("AiHero.tsx");
    const v = await violationsOf(src);
    const tailwindHits = v.filter((x) =>
      [
        "gradient-text-headline",
        "hero-metric-template",
        "default-glassmorphism",
        "purple-blue-gradient",
      ].includes(x.ruleId),
    );
    for (const hit of tailwindHits) {
      expect(hit.severity).toBe("fail");
    }
  });

  it("all hits include suggestedFix", async () => {
    const src = loadFixture("AiHero.tsx");
    const v = await violationsOf(src);
    const tailwindHits = v.filter((x) =>
      [
        "gradient-text-headline",
        "hero-metric-template",
        "default-glassmorphism",
        "purple-blue-gradient",
      ].includes(x.ruleId),
    );
    expect(tailwindHits.length).toBeGreaterThan(0);
    for (const hit of tailwindHits) {
      expect(hit.suggestedFix).toBeTruthy();
    }
  });
});

// ---------------------------------------------------------------------------
// runAntiSlopOnFiles path — ensures file-level entry point also detects Tailwind
// ---------------------------------------------------------------------------

describe("runAntiSlopOnFiles picks up Tailwind hard-bans", () => {
  it("AiHero.tsx via runAntiSlopOnFiles → severity=fail", async () => {
    const filePath = join(FIXTURES_DIR, "AiHero.tsx");
    const result = await runAntiSlopOnFiles([filePath], {
      mode: "audit",
      projectRoot: resolve("."),
      perCallBudgetMs: 10_000,
    });
    expect(result.severity).toBe("fail");
    const v = (result.violations ?? []) as AntiSlopViolation[];
    const targetRules = [
      "gradient-text-headline",
      "hero-metric-template",
      "default-glassmorphism",
      "purple-blue-gradient",
    ];
    const hitRules = targetRules.filter((r) => hasRule(v, r));
    expect(hitRules.length).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// PricingCard.tsx — clean baseline: ZERO Tailwind hard-ban hits
// ---------------------------------------------------------------------------

describe("PricingCard.tsx — no Tailwind hard-ban regression", () => {
  it("fires ZERO Tailwind className hard-bans", async () => {
    const src = loadFixture("PricingCard.tsx");
    const v = await violationsOf(src);
    const tailwindHardBanHits = v.filter(
      (x) =>
        x.severity === "fail" &&
        [
          "gradient-text-headline",
          "hero-metric-template",
          "default-glassmorphism",
          "purple-blue-gradient",
        ].includes(x.ruleId),
    );
    expect(
      tailwindHardBanHits.length,
      `expected 0 Tailwind hard-ban hits on PricingCard.tsx; got: ${tailwindHardBanHits.map((x) => x.ruleId).join(", ")}`,
    ).toBe(0);
  });

  it("overall verdict is pass or warn (no fail)", async () => {
    const filePath = join(FIXTURES_DIR, "PricingCard.tsx");
    const result = await runAntiSlopOnFiles([filePath], {
      mode: "audit",
      projectRoot: resolve("."),
      perCallBudgetMs: 10_000,
    });
    expect(result.severity).not.toBe("fail");
  });
});

// ---------------------------------------------------------------------------
// Inline fixture tests — targeted class-name strings
// ---------------------------------------------------------------------------

describe("inline className fixture — gradient-text-headline", () => {
  it("detects co-occurrence in same className", async () => {
    const jsx = `<h2 className="text-4xl bg-gradient-to-r from-red-500 to-blue-500 bg-clip-text text-transparent">Hello</h2>`;
    const v = await violationsOf(jsx);
    expect(hasRule(v, "gradient-text-headline")).toBe(true);
  });

  it("does NOT flag bg-clip-text without text-transparent", async () => {
    const jsx = `<h2 className="bg-clip-text text-blue-500">Hello</h2>`;
    const v = await violationsOf(jsx);
    expect(hasRule(v, "gradient-text-headline")).toBe(false);
  });

  it("does NOT flag gradient + text-transparent without bg-clip-text", async () => {
    const jsx = `<h2 className="bg-gradient-to-r from-red-500 to-blue-500 text-transparent">Hello</h2>`;
    const v = await violationsOf(jsx);
    expect(hasRule(v, "gradient-text-headline")).toBe(false);
  });
});

describe("inline className fixture — hero-metric-template", () => {
  it("detects text-7xl with percent metric", async () => {
    const jsx = `<p className="text-7xl font-black">98%</p>`;
    const v = await violationsOf(jsx);
    expect(hasRule(v, "hero-metric-template")).toBe(true);
  });

  it("detects text-9xl with x suffix", async () => {
    const jsx = `<p className="text-9xl font-bold">10x</p>`;
    const v = await violationsOf(jsx);
    expect(hasRule(v, "hero-metric-template")).toBe(true);
  });

  it("detects text-8xl with K+ suffix", async () => {
    const jsx = `<p className="text-8xl">200K+</p>`;
    const v = await violationsOf(jsx);
    expect(hasRule(v, "hero-metric-template")).toBe(true);
  });

  it("does NOT flag text-7xl without metric text content", async () => {
    const jsx = `<p className="text-7xl font-black">Welcome back</p>`;
    const v = await violationsOf(jsx);
    expect(hasRule(v, "hero-metric-template")).toBe(false);
  });

  it("does NOT flag small text with metric suffix", async () => {
    const jsx = `<p className="text-sm">Growth: 10x</p>`;
    const v = await violationsOf(jsx);
    expect(hasRule(v, "hero-metric-template")).toBe(false);
  });
});

describe("inline className fixture — default-glassmorphism", () => {
  it("detects backdrop-blur + bg-white/N in same className", async () => {
    const jsx = `<div className="backdrop-blur-md bg-white/30 rounded-xl">...</div>`;
    const v = await violationsOf(jsx);
    expect(hasRule(v, "default-glassmorphism")).toBe(true);
  });

  it("detects backdrop-blur + bg-black/N in same className", async () => {
    const jsx = `<div className="backdrop-blur-sm bg-black/50">...</div>`;
    const v = await violationsOf(jsx);
    expect(hasRule(v, "default-glassmorphism")).toBe(true);
  });

  it("does NOT flag backdrop-blur without bg opacity", async () => {
    const jsx = `<div className="backdrop-blur-md bg-white rounded-xl">...</div>`;
    const v = await violationsOf(jsx);
    expect(hasRule(v, "default-glassmorphism")).toBe(false);
  });

  it("does NOT flag bg-white/30 without backdrop-blur", async () => {
    const jsx = `<div className="bg-white/30 rounded-xl">...</div>`;
    const v = await violationsOf(jsx);
    expect(hasRule(v, "default-glassmorphism")).toBe(false);
  });

  it("does NOT flag when wisp-justify comment is present nearby", async () => {
    const jsx = `{/* wisp-justify: intentional frosted glass for modal overlay */}<div className="backdrop-blur-md bg-white/30">...</div>`;
    const v = await violationsOf(jsx);
    expect(hasRule(v, "default-glassmorphism")).toBe(false);
  });
});

describe("inline className fixture — purple-blue-gradient", () => {
  it("detects from-purple-N + to-blue-N in same className", async () => {
    const jsx = `<div className="bg-gradient-to-r from-purple-600 to-blue-500">...</div>`;
    const v = await violationsOf(jsx);
    expect(hasRule(v, "purple-blue-gradient")).toBe(true);
  });

  it("detects via-purple-N + from-blue-N", async () => {
    const jsx = `<div className="from-blue-400 via-purple-500 to-indigo-600">...</div>`;
    const v = await violationsOf(jsx);
    expect(hasRule(v, "purple-blue-gradient")).toBe(true);
  });

  it("does NOT flag purple-only gradient", async () => {
    const jsx = `<div className="from-purple-400 to-purple-700">...</div>`;
    const v = await violationsOf(jsx);
    expect(hasRule(v, "purple-blue-gradient")).toBe(false);
  });

  it("does NOT flag blue-only gradient", async () => {
    const jsx = `<div className="from-blue-300 to-blue-700">...</div>`;
    const v = await violationsOf(jsx);
    expect(hasRule(v, "purple-blue-gradient")).toBe(false);
  });
});
