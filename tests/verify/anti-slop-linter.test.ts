// wisp-design — Anti-Slop linter unit tests (Phase 5).
//
// Each of the 7 hard-bans + 5 soft-suggestions gets at least one KNOWN-BAD
// fixture that MUST match and one KNOWN-GOOD fixture that MUST NOT match.
// Where the security audit (top of src/verify/anti-slop-linter.ts) flagged
// FP/FN risks, the corresponding test is tagged `[AUDIT]` and pinned to the
// CURRENT regex behaviour. When the audit's recommended tightenings land
// these tests will fail and need updating — that's intentional.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  extractCssFromFile,
  formatBlockMessage,
  formatWarnMessage,
  runAntiSlop,
  runAntiSlopOnFiles,
} from "../../src/verify/anti-slop-linter.js";
import {
  HARD_BAN_RULES,
  type AntiSlopRuleId,
  type AntiSlopViolation,
} from "../../src/contracts/verify.js";

// Helper: assert at least one violation with the given ruleId is present.
function expectRule(violations: ReadonlyArray<AntiSlopViolation>, ruleId: AntiSlopRuleId): void {
  const hits = violations.filter((v) => v.ruleId === ruleId);
  expect(hits.length, `expected ≥1 ${ruleId} hit, got ${violations.map((v) => v.ruleId).join(",")}`).toBeGreaterThan(0);
}

function expectNoRule(violations: ReadonlyArray<AntiSlopViolation>, ruleId: AntiSlopRuleId): void {
  const hits = violations.filter((v) => v.ruleId === ruleId);
  expect(hits.length, `expected 0 ${ruleId} hits, got ${hits.length}`).toBe(0);
}

async function violationsOf(css: string): Promise<AntiSlopViolation[]> {
  const res = await runAntiSlop(css);
  return (res.violations ?? []) as AntiSlopViolation[];
}

// ---------------------------------------------------------------------------
// HARD-BAN #1 — em-dash-ui
// ---------------------------------------------------------------------------

describe("hard-ban: em-dash-ui", () => {
  it("flags em-dash inside CSS content: string", async () => {
    const css = `.cta::after { content: "Click — me"; }`;
    expectRule(await violationsOf(css), "em-dash-ui");
  });

  it("flags em-dash inside button JSX text", async () => {
    const src = `function Page() { return <button>Subscribe — get updates</button>; }`;
    expectRule(await violationsOf(src), "em-dash-ui");
  });

  it("does NOT flag plain button label without em-dash", async () => {
    const css = `.cta::after { content: "Submit"; } <button>Submit</button>`;
    expectNoRule(await violationsOf(css), "em-dash-ui");
  });

  it("severity = fail (hard-ban)", async () => {
    const v = (await violationsOf(`content: "a — b"`))[0];
    expect(v?.severity).toBe("fail");
    expect(HARD_BAN_RULES.has("em-dash-ui")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// HARD-BAN #2 — gradient-text-headline
// ---------------------------------------------------------------------------

describe("hard-ban: gradient-text-headline", () => {
  it("flags h1 { background-clip: text; color: transparent }", async () => {
    const css = `h1 { background-clip: text; color: transparent; background: linear-gradient(red,blue); }`;
    expectRule(await violationsOf(css), "gradient-text-headline");
  });

  it("flags .btn with gradient text combo", async () => {
    const css = `.btn { background-clip: text; color: transparent; }`;
    expectRule(await violationsOf(css), "gradient-text-headline");
  });

  it("does NOT flag decorative span (no heading-ish selector)", async () => {
    const css = `.decorative-flourish { background-clip: text; color: transparent; }`;
    expectNoRule(await violationsOf(css), "gradient-text-headline");
  });
});

// ---------------------------------------------------------------------------
// HARD-BAN #3 — default-glassmorphism
// ---------------------------------------------------------------------------

describe("hard-ban: default-glassmorphism", () => {
  it("flags backdrop-filter: blur() without wisp-justify nearby", async () => {
    const css = `.card { backdrop-filter: blur(8px); }`;
    expectRule(await violationsOf(css), "default-glassmorphism");
  });

  it("does NOT flag when wisp-justify comment follows within 100 chars", async () => {
    const css = `.glass { backdrop-filter: blur(8px); /* wisp-justify: required by macOS skeumorphism brief */ }`;
    expectNoRule(await violationsOf(css), "default-glassmorphism");
  });

  it("flags multi-blur card grid", async () => {
    const css = `.grid > * { backdrop-filter: blur(12px) saturate(1.2); }`;
    expectRule(await violationsOf(css), "default-glassmorphism");
  });
});

// ---------------------------------------------------------------------------
// HARD-BAN #4 — hero-metric-template
// ---------------------------------------------------------------------------

describe("hard-ban: hero-metric-template", () => {
  it("flags font-size 120px + content '100k+'", async () => {
    const css = `.hero-number { font-size: 120px; } .hero-number::after { content: "100k+"; }`;
    expectRule(await violationsOf(css), "hero-metric-template");
  });

  it("flags font-size 96px + content '10x'", async () => {
    const css = `.metric { font-size: 96px; line-height: 1; } .metric::before { content: "10x"; }`;
    expectRule(await violationsOf(css), "hero-metric-template");
  });

  it("does NOT flag normal-size metric (32px)", async () => {
    const css = `.metric { font-size: 32px; } .metric::after { content: "100k+"; }`;
    expectNoRule(await violationsOf(css), "hero-metric-template");
  });
});

// ---------------------------------------------------------------------------
// HARD-BAN #5 — side-stripe-decoration
// ---------------------------------------------------------------------------

describe("hard-ban: side-stripe-decoration", () => {
  it("flags ::before stripe with linear-gradient", async () => {
    const css = `
      .panel::before {
        position: absolute;
        left: 0;
        top: 0;
        width: 4px;
        height: 100%;
        background: linear-gradient(180deg, #f00, #00f);
      }
    `;
    expectRule(await violationsOf(css), "side-stripe-decoration");
  });

  it("does NOT flag solid-colour stripe (no gradient)", async () => {
    const css = `
      .panel::before {
        position: absolute;
        left: 0;
        width: 4px;
        background: #ff0;
      }
    `;
    expectNoRule(await violationsOf(css), "side-stripe-decoration");
  });
});

// ---------------------------------------------------------------------------
// HARD-BAN #6 — purple-blue-gradient
// ---------------------------------------------------------------------------

describe("hard-ban: purple-blue-gradient", () => {
  it("flags linear-gradient(#7c3aed, #2563eb)", async () => {
    const css = `.bg { background: linear-gradient(135deg, #7c3aed, #2563eb); }`;
    expectRule(await violationsOf(css), "purple-blue-gradient");
  });

  it("flags 'purple' + 'blue' named-colour combo", async () => {
    const css = `.hero { background-image: linear-gradient(to right, purple 0%, blue 100%); }`;
    expectRule(await violationsOf(css), "purple-blue-gradient");
  });

  it("does NOT flag yellow→magenta gradient", async () => {
    const css = `.fun { background: linear-gradient(#ff0, #f0f); }`;
    expectNoRule(await violationsOf(css), "purple-blue-gradient");
  });

  // [T3, 2026-05-24] oklch() branch landed — purple-hue (270-300deg) + blue-hue
  // (240-265deg) in the same linear-gradient now fires. Previously this was
  // pinned as a known FN.
  it("[T3] matches oklch() purple→blue gradient (hue 280 + hue 240)", async () => {
    const css = `.bg { background: linear-gradient(oklch(60% 0.3 280deg), oklch(60% 0.3 240deg)); }`;
    expectRule(await violationsOf(css), "purple-blue-gradient");
  });

  it("[T3] matches oklch() blue→purple gradient (order-independent)", async () => {
    const css = `.bg { background: linear-gradient(135deg, oklch(50% 0.25 250), oklch(55% 0.22 290)); }`;
    expectRule(await violationsOf(css), "purple-blue-gradient");
  });

  it("[T3] does NOT match oklch() gradient with non-purple/non-blue hues", async () => {
    const css = `.bg { background: linear-gradient(oklch(60% 0.2 30deg), oklch(60% 0.2 120deg)); }`;
    expectNoRule(await violationsOf(css), "purple-blue-gradient");
  });
});

// ---------------------------------------------------------------------------
// HARD-BAN #7 — generic-ai-illustration
// ---------------------------------------------------------------------------

describe("hard-ban: generic-ai-illustration", () => {
  it("flags background-image: url('undraw_user.svg')", async () => {
    const css = `.hero { background-image: url("./assets/undraw_user.svg"); }`;
    expectRule(await violationsOf(css), "generic-ai-illustration");
  });

  it("flags 3d-blob references", async () => {
    const css = `.bg { background-image: url("https://cdn.example.com/3d-blob-purple.png"); }`;
    expectRule(await violationsOf(css), "generic-ai-illustration");
  });

  it("does NOT flag project-local brand asset", async () => {
    const css = `.logo { background-image: url("./brand/logo.svg"); }`;
    expectNoRule(await violationsOf(css), "generic-ai-illustration");
  });
});

// ---------------------------------------------------------------------------
// SOFT #1 — too-perfect-alignment
// ---------------------------------------------------------------------------

describe("soft: too-perfect-alignment", () => {
  it("flags fully symmetric block (margin 0 auto + text-align center + symmetric pad + gap)", async () => {
    const css = `
      .hero {
        margin: 0 auto;
        text-align: center;
        padding: 80px 80px;
        gap: 24px;
      }
    `;
    expectRule(await violationsOf(css), "too-perfect-alignment");
  });

  it("does NOT flag offset block (margin not 0 auto)", async () => {
    const css = `
      .hero {
        margin: 40px 0 0 80px;
        text-align: left;
        padding: 32px 48px;
      }
    `;
    expectNoRule(await violationsOf(css), "too-perfect-alignment");
  });
});

// ---------------------------------------------------------------------------
// SOFT #2 — round-number-whitespace [AUDIT-RISK: HIGH FP rate]
// ---------------------------------------------------------------------------

describe("soft: round-number-whitespace", () => {
  // [AUDIT-RESOLVED] File-level aggregation landed in src/verify/anti-slop-linter.ts:
  // the rule now requires ≥4 total `padding|margin|gap: <N>px` declarations AND
  // a >0.7 ratio of those declarations sitting on 16/24/32/48 to fire ONE
  // file-level violation. Per-occurrence emission is gone — that was the source
  // of the soft-warn FPR breach.
  it("flags a file dominated by round-number Tailwind defaults (≥4 decls, >0.7 ratio)", async () => {
    const css = `
      .a { padding: 16px; }
      .b { margin: 24px; }
      .c { gap: 32px; }
      .d { padding: 48px; }
    `;
    const v = await violationsOf(css);
    expectRule(v, "round-number-whitespace");
    expect(v.find((x) => x.ruleId === "round-number-whitespace")?.severity).toBe("warn");
  });

  it("does NOT flag padding: 18px (off-grid)", async () => {
    expectNoRule(await violationsOf(`.card { padding: 18px; }`), "round-number-whitespace");
  });

  // Post-aggregation: a single-decl file MUST NOT fire — that was the FPR
  // breach root cause. The aggregator's MIN_TOTAL=4 guard enforces this.
  it("does NOT fire on a single 24px gap (totalCount < 4 threshold)", async () => {
    expectNoRule(await violationsOf(`.x { gap: 24px; }`), "round-number-whitespace");
  });

  // 4+ declarations but only 50% on the round grid → ratio 0.5 ≤ 0.7 threshold.
  it("does NOT fire when round/total ratio ≤ 0.7", async () => {
    const css = `
      .a { padding: 16px; }
      .b { margin: 24px; }
      .c { gap: 18px; }
      .d { padding: 22px; }
    `;
    expectNoRule(await violationsOf(css), "round-number-whitespace");
  });
});

// ---------------------------------------------------------------------------
// SOFT #3 — default-tailwind-blue [AUDIT: only matches color:]
// ---------------------------------------------------------------------------

describe("soft: default-tailwind-blue [G2: min-occurrence gate]", () => {
  // G2 (2026-05-24) — minimum-occurrence gate. The rule now requires ≥2
  // total occurrences of default-Tailwind-blue (CSS + className combined)
  // across the file. A single isolated `color: #3b82f6` or `bg-blue-500`
  // is treated as an intentional accent and skipped. This brought the
  // soft-warn FPR contribution from 28.6% (20/70 borderline fixtures) to 0%.

  it("[G2] flags color: #3b82f6 when used 2+ times (pattern, not accent)", async () => {
    const css = `.link { color: #3b82f6; } .nav-active { color: #3b82f6; }`;
    expectRule(await violationsOf(css), "default-tailwind-blue");
  });

  it("[G2] flags color: rgb(59, 130, 246) when used 2+ times", async () => {
    const css = `.x { color: rgb(59, 130, 246); } .y { color: rgb(59, 130, 246); }`;
    expectRule(await violationsOf(css), "default-tailwind-blue");
  });

  it("[G2] does NOT flag a single color: #3b82f6 (intentional accent)", async () => {
    expectNoRule(await violationsOf(`.link { color: #3b82f6; }`), "default-tailwind-blue");
  });

  it("[G2] does NOT flag a single background-color: #3b82f6 (intentional accent)", async () => {
    expectNoRule(await violationsOf(`.x { background-color: #3b82f6; }`), "default-tailwind-blue");
  });

  it("[G2] does NOT flag a single fill: #3b82f6 (intentional accent)", async () => {
    expectNoRule(await violationsOf(`.x { fill: #3b82f6; }`), "default-tailwind-blue");
  });

  // [T5] property-set coverage still verified — combined hit ≥2 fires.
  it("[T5+G2] property mix (fill + stroke) fires when total ≥ 2", async () => {
    const css = `.x { fill: #3b82f6; } .y { stroke: rgb(59, 130, 246); }`;
    expectRule(await violationsOf(css), "default-tailwind-blue");
  });

  it("[T5+G2] border-color + color fires when total ≥ 2", async () => {
    const css = `.a { border-color: #3b82f6; } .b { color: #3b82f6; }`;
    expectRule(await violationsOf(css), "default-tailwind-blue");
  });

  it("[T5+G2] Tailwind utility classes bg-blue-500 + text-blue-600 fires (≥2 hits)", async () => {
    const tsx = `function X() { return <div className="bg-blue-500"><a className="text-blue-600">link</a></div>; }`;
    expectRule(await violationsOf(tsx), "default-tailwind-blue");
  });

  it("[T5+G2] single bg-blue-500 className alone does NOT fire (intentional accent)", async () => {
    const tsx = `function X() { return <div className="bg-blue-500 p-4">Hi</div>; }`;
    expectNoRule(await violationsOf(tsx), "default-tailwind-blue");
  });

  it("[G2] CSS hit + className hit on same file fires (cross-source aggregation)", async () => {
    // CSS-style `color: #3b82f6;` (extractor-emit) + one `bg-blue-500` class
    // in the same content → total=2 → fires. (runAntiSlop receives the
    // already-extracted CSS-shaped string here, mimicking extractCssFromFile
    // output which lays JSX inline-style as CSS-ish text PLUS appends the
    // raw source.)
    const cssLike = `color: #3b82f6;
function X() { return <div className="bg-blue-500">Hi</div>; }`;
    expectRule(await violationsOf(cssLike), "default-tailwind-blue");
  });

  it("[T5] does NOT match bg-blue-100 (out of 500-700 range)", async () => {
    const tsx = `function X() { return <div className="bg-blue-100">Hi</div>; }`;
    expectNoRule(await violationsOf(tsx), "default-tailwind-blue");
  });

  it("[T5] skips brand-whitelisted #3b82f6 when ctx.brandColors contains it", async () => {
    const { runAntiSlop } = await import("../../src/verify/anti-slop-linter.js");
    // Two-hit file — would normally fire under G2 — but whitelist drops both.
    const res = await runAntiSlop(`.x { color: #3b82f6; } .y { color: #3b82f6; }`, {
      brandColors: new Set(["#3b82f6"]),
    });
    const v = (res.violations ?? []) as AntiSlopViolation[];
    expectNoRule(v, "default-tailwind-blue");
  });

  it("[T5] loads brand-spec.json from projectRoot in runAntiSlopOnFiles", async () => {
    const { runAntiSlopOnFiles } = await import("../../src/verify/anti-slop-linter.js");
    const dir = mkdtempSync(join(tmpdir(), "wisp-t5-"));
    mkdirSync(join(dir, ".wisp"), { recursive: true });
    writeFileSync(
      join(dir, ".wisp", "brand-spec.json"),
      JSON.stringify({ brand: { colors: ["#3b82f6"] } }),
    );
    const cssFile = join(dir, "ok.css");
    // Two-hit fixture under whitelist → still skipped because both are
    // brand-whitelisted before the min-occurrence gate runs.
    writeFileSync(cssFile, `.x { color: #3b82f6; } .y { background-color: #3b82f6; }`);
    const res = await runAntiSlopOnFiles([cssFile], { mode: "audit", projectRoot: dir });
    const v = (res.violations ?? []) as AntiSlopViolation[];
    expectNoRule(v, "default-tailwind-blue");
    rmSync(dir, { recursive: true, force: true });
  });

  it("[T5+G2] fires WITHOUT brand-spec.json when ≥2 hits (default behaviour)", async () => {
    const { runAntiSlopOnFiles } = await import("../../src/verify/anti-slop-linter.js");
    const dir = mkdtempSync(join(tmpdir(), "wisp-t5-nobrand-"));
    const cssFile = join(dir, "x.css");
    writeFileSync(cssFile, `.x { color: #3b82f6; } .y { color: #3b82f6; }`);
    const res = await runAntiSlopOnFiles([cssFile], { mode: "audit", projectRoot: dir });
    const v = (res.violations ?? []) as AntiSlopViolation[];
    expectRule(v, "default-tailwind-blue");
    rmSync(dir, { recursive: true, force: true });
  });
});

// ---------------------------------------------------------------------------
// SOFT #4 — single-weight-typography (stateful analyseFontWeights)
// ---------------------------------------------------------------------------

describe("soft: single-weight-typography", () => {
  it("flags file with only font-weight: 400", async () => {
    const css = `h1 { font-weight: 400; } p { font-weight: 400; }`;
    expectRule(await violationsOf(css), "single-weight-typography");
  });

  it("does NOT flag file with multiple weights (400, 700, 600)", async () => {
    const css = `h1 { font-weight: 700; } h2 { font-weight: 600; } p { font-weight: 400; }`;
    expectNoRule(await violationsOf(css), "single-weight-typography");
  });

  it("normalises 'normal' to 400 and 'bold' to 700", async () => {
    // normal + bold → 2 distinct buckets, no violation.
    const css = `h1 { font-weight: bold; } p { font-weight: normal; }`;
    expectNoRule(await violationsOf(css), "single-weight-typography");
  });

  it("does NOT flag a file with no font-weight at all", async () => {
    expectNoRule(await violationsOf(`.x { color: red; }`), "single-weight-typography");
  });
});

// ---------------------------------------------------------------------------
// SOFT #5 — all-rounded-corners
// ---------------------------------------------------------------------------

describe("soft: all-rounded-corners", () => {
  it("flags 5 consecutive border-radius declarations", async () => {
    const css = `
      .a { border-radius: 8px; }
      .b { border-radius: 8px; }
      .c { border-radius: 8px; }
      .d { border-radius: 8px; }
      .e { border-radius: 8px; }
    `;
    expectRule(await violationsOf(css), "all-rounded-corners");
  });

  it("does NOT flag 2-3 border-radius declarations", async () => {
    const css = `.a { border-radius: 8px; } .b { border-radius: 4px; }`;
    expectNoRule(await violationsOf(css), "all-rounded-corners");
  });
});

// ---------------------------------------------------------------------------
// extractCssFromFile — multi-extension extraction
// ---------------------------------------------------------------------------

describe("extractCssFromFile", () => {
  it("returns content as-is for .css", () => {
    const out = extractCssFromFile("/tmp/foo.css", `.x { color: red; }`);
    expect(out).toContain(`color: red`);
  });

  it("returns content as-is for .scss", () => {
    const out = extractCssFromFile("/tmp/foo.scss", `$primary: red;`);
    expect(out).toContain(`$primary`);
  });

  it("extracts <style> blocks from .vue", () => {
    const sfc = `<template><div /></template><style>.x { color: red; }</style>`;
    const out = extractCssFromFile("/tmp/Foo.vue", sfc);
    expect(out).toContain("color: red");
  });

  it("extracts <style> blocks from .svelte", () => {
    const sfc = `<div /><style>.btn { padding: 16px; }</style>`;
    const out = extractCssFromFile("/tmp/Foo.svelte", sfc);
    expect(out).toContain("padding: 16px");
  });

  it("extracts <style> blocks from .html", () => {
    const html = `<html><head><style>.hero { font-size: 80px; }</style></head><body /></html>`;
    const out = extractCssFromFile("/tmp/page.html", html);
    expect(out).toContain("font-size: 80px");
  });

  it("converts style={{...}} JSX prop to CSS-ish on .tsx", () => {
    const tsx = `function X() { return <div style={{ backgroundColor: 'red', paddingTop: 16 }} />; }`;
    const out = extractCssFromFile("/tmp/X.tsx", tsx);
    // camelCase → kebab-case
    expect(out).toContain("background-color");
  });

  it("includes raw .tsx source so em-dash text is still scannable", () => {
    const tsx = `function X() { return <button>Subscribe — now</button>; }`;
    const out = extractCssFromFile("/tmp/X.tsx", tsx);
    expect(out).toContain("Subscribe");
  });
});

// ---------------------------------------------------------------------------
// runAntiSlopOnFiles — multi-file aggregator with real tmpDir
// ---------------------------------------------------------------------------

describe("runAntiSlopOnFiles", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "wisp-anti-slop-"));
  });
  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns severity=fail when one file contains a hard-ban", async () => {
    const file = join(tmpDir, "bad.css");
    writeFileSync(file, `h1 { background-clip: text; color: transparent; }`);
    const res = await runAntiSlopOnFiles([file], { mode: "audit", projectRoot: tmpDir });
    expect(res.severity).toBe("fail");
    expect(res.violations?.length ?? 0).toBeGreaterThan(0);
  });

  it("returns severity=pass on a clean file", async () => {
    const file = join(tmpDir, "clean.css");
    // Two text-bearing blocks (both have `color`) with different font-weights —
    // post-T6 scoping recognises both as text-bearing, so single-weight rule
    // sees {400, 700} and does not fire.
    writeFileSync(file, `.x { color: #112233; padding: 18px; font-weight: 400; }
.y { color: #555; font-weight: 700; }`);
    const res = await runAntiSlopOnFiles([file], { mode: "audit", projectRoot: tmpDir });
    expect(res.severity).toBe("pass");
  });

  it("skips non-UI extensions silently", async () => {
    const file = join(tmpDir, "ignore.md");
    writeFileSync(file, `# A — heading with em-dash`);
    const res = await runAntiSlopOnFiles([file], { mode: "audit", projectRoot: tmpDir });
    // .md is not a UI extension, so no violations produced.
    expect(res.violations?.length ?? 0).toBe(0);
  });

  it("survives unreadable files (returns without throwing)", async () => {
    const missing = join(tmpDir, "does-not-exist.css");
    const res = await runAntiSlopOnFiles([missing], { mode: "audit", projectRoot: tmpDir });
    expect(res.name).toBe("anti-slop");
    expect(res.severity).toBe("pass");
  });

  it("annotates violation snippets with the file path", async () => {
    const file = join(tmpDir, "marked.css");
    writeFileSync(file, `.x { backdrop-filter: blur(8px); }`);
    const res = await runAntiSlopOnFiles([file], { mode: "audit", projectRoot: tmpDir });
    const v = (res.violations ?? []) as AntiSlopViolation[];
    expect(v[0]?.location?.cssSnippet ?? "").toContain(file);
  });
});

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

describe("formatBlockMessage / formatWarnMessage", () => {
  const hardBan: AntiSlopViolation = {
    ruleId: "em-dash-ui",
    severity: "fail",
    message: "em-dash in UI text",
    suggestedFix: "use a comma",
    location: { line: 3, column: 5, cssSnippet: "content: 'a — b'" },
  };
  const soft: AntiSlopViolation = {
    ruleId: "round-number-whitespace",
    severity: "warn",
    message: "round whitespace",
    suggestedFix: "use 18/22",
    location: { line: 1, column: 1, cssSnippet: "padding: 16px" },
  };

  it("formatBlockMessage cites rule id + suggested fix", () => {
    const msg = formatBlockMessage([hardBan]);
    expect(msg).toContain("em-dash-ui");
    expect(msg).toContain("use a comma");
    expect(msg).toContain("1 hard-ban");
  });

  it("formatBlockMessage returns no-hard-bans message for empty input", () => {
    expect(formatBlockMessage([])).toContain("(no hard-bans)");
  });

  it("formatWarnMessage labels hard-bans as FAIL and softs as warn", () => {
    const msg = formatWarnMessage([hardBan, soft]);
    expect(msg).toContain("[FAIL]");
    expect(msg).toContain("[warn]");
  });

  it("formatWarnMessage returns 'clean' on empty input", () => {
    expect(formatWarnMessage([])).toContain("clean");
  });
});

// Make sure raw structure is read once so the file is exercised even when
// only formatters run.
describe("module wiring", () => {
  it("creates the .wisp dir helper subpath for tests", () => {
    const d = mkdtempSync(join(tmpdir(), "wisp-anti-slop-wiring-"));
    mkdirSync(join(d, ".wisp"), { recursive: true });
    expect(d).toMatch(/wisp-anti-slop-wiring-/);
    rmSync(d, { recursive: true, force: true });
  });
});

// ---------------------------------------------------------------------------
// T1 (2026-05-24) — em-dash-ui: broader element scope + multi-line text
// ---------------------------------------------------------------------------

describe("[T1] em-dash-ui broader scope", () => {
  it("fires on em-dash inside <p>", async () => {
    const html = `<p class="lead">Seamlessly orchestrate—effortlessly.</p>`;
    expectRule(await violationsOf(html), "em-dash-ui");
  });

  it("fires on em-dash inside <span>", async () => {
    const html = `<div><span class="lbl">Save — and continue</span></div>`;
    expectRule(await violationsOf(html), "em-dash-ui");
  });

  it("fires on multi-line <h3> with mid-text em-dash (canonical sample case)", async () => {
    const html = `<h3 class="text-6xl font-black">
            10x your team's velocity—instantly
          </h3>`;
    expectRule(await violationsOf(html), "em-dash-ui");
  });

  it("does NOT fire on em-dash in plain prose <article> wrapper without UI tag", async () => {
    const html = `<article>Some prose with — a dash, then continues without closing UI tag here</article>`;
    expectNoRule(await violationsOf(html), "em-dash-ui");
  });
});

// ---------------------------------------------------------------------------
// T2 (2026-05-24) — hero-metric: tailwind text-{4,5,6}xl + font-black branch
// ---------------------------------------------------------------------------

describe("[T2] hero-metric tailwind utility class", () => {
  it("fires on text-4xl + font-black + '98%' metric content", async () => {
    const tsx = `function X() { return <p className="text-4xl font-black text-neutral-900">98%</p>; }`;
    expectRule(await violationsOf(tsx), "hero-metric-template");
  });

  it("fires on text-5xl + font-extrabold + '3.2x' metric content", async () => {
    const tsx = `function X() { return <p className="text-5xl font-extrabold">3.2x</p>; }`;
    expectRule(await violationsOf(tsx), "hero-metric-template");
  });

  it("fires on text-6xl + font-black + '24/7' ratio content", async () => {
    const tsx = `function X() { return <p className="text-6xl font-black">24/7</p>; }`;
    expectRule(await violationsOf(tsx), "hero-metric-template");
  });

  it("does NOT fire on text-4xl WITHOUT font-black (borderline-heavy gate)", async () => {
    const tsx = `function X() { return <p className="text-4xl font-medium">98%</p>; }`;
    expectNoRule(await violationsOf(tsx), "hero-metric-template");
  });

  it("still fires on text-7xl + metric without font-black (legacy bigtext path)", async () => {
    const tsx = `function X() { return <h2 className="text-7xl">10x</h2>; }`;
    expectRule(await violationsOf(tsx), "hero-metric-template");
  });
});

// ---------------------------------------------------------------------------
// T4 (2026-05-24) — brace-anchoring: cross-rule contamination regression
// ---------------------------------------------------------------------------

describe("[T4] brace-anchored window — no cross-rule bleed", () => {
  it("does NOT fire single-weight-typography across adjacent text-bearing + non-text rules (G1: 1 occurrence)", async () => {
    // Block 1: an icon-only utility selector (NOT text-bearing). It sets
    // font-weight: 400 but should be IGNORED by the T6-scoped scan.
    // Block 2: a true text block with font-weight: 400. After T6 only
    // block 2 contributes, leaving exactly one occurrence of 400. Under
    // the G1 min-occurrence gate (≥2 declarations needed), one declaration
    // alone is treated as an intentional single-element style and skipped.
    const css = `
      .icon-only { font-weight: 400; width: 16px; }
      h1.title { font-weight: 400; font-size: 24px; color: #111; }
    `;
    expectNoRule(await violationsOf(css), "single-weight-typography");
  });

  it("[G1] DOES fire single-weight-typography when 2 text-bearing blocks share one weight", async () => {
    // T6 still scopes to text-bearing blocks; G1 then requires ≥2 such
    // declarations. Both blocks here are text-bearing AND share weight 400.
    const css = `
      h1.title { font-weight: 400; font-size: 24px; color: #111; }
      p.body { font-weight: 400; line-height: 1.5; color: #333; }
    `;
    expectRule(await violationsOf(css), "single-weight-typography");
  });

  it("does NOT fire single-weight-typography when ONLY a non-text block has font-weight", async () => {
    // T6 scoping should skip the icon-only block. With no text-bearing
    // block having a font-weight, the rule should not fire.
    const css = `
      .icon-only { font-weight: 400; width: 16px; }
      h1.title { color: #111; font-size: 24px; }
    `;
    expectNoRule(await violationsOf(css), "single-weight-typography");
  });

  it("brace-anchoring keeps adjacent block declarations isolated", async () => {
    // Two text-bearing rules with DIFFERENT weights → no violation.
    const css = `
      h1 { font-family: Inter; font-weight: 700; }
      p { font-family: Inter; font-weight: 400; }
    `;
    expectNoRule(await violationsOf(css), "single-weight-typography");
  });
});

// ---------------------------------------------------------------------------
// T6 (2026-05-24) — single-weight-typography text-bearing scoping
// ---------------------------------------------------------------------------

describe("[T6] single-weight-typography scoping", () => {
  it("does NOT fire on non-text selectors (button.icon with no text-bearing decls)", async () => {
    const css = `button.icon { font-weight: 400; width: 32px; height: 32px; padding: 8px; }`;
    expectNoRule(await violationsOf(css), "single-weight-typography");
  });

  it("does NOT fire on a layout-only file (no text-bearing decls)", async () => {
    const css = `
      .container { font-weight: 400; display: flex; gap: 16px; }
      .row { font-weight: 400; width: 100%; }
    `;
    expectNoRule(await violationsOf(css), "single-weight-typography");
  });

  it("fires on text-bearing selectors (h1/p with single weight)", async () => {
    const css = `h1 { font-weight: 400; font-size: 32px; } p { font-weight: 400; color: #333; }`;
    expectRule(await violationsOf(css), "single-weight-typography");
  });

  it("[G1] does NOT fire on a single text-bearing block (intentional single-element style)", async () => {
    // Pre-G1: any 1 declaration in a text-bearing block fired. Post-G1:
    // single-declaration files (e.g. a styled label class) are intentional
    // and skipped — the rule targets files that use ONE weight across MANY
    // text elements.
    const css = `.custom { font-family: Inter; font-weight: 400; padding: 8px; }`;
    expectNoRule(await violationsOf(css), "single-weight-typography");
  });

  it("[G1] fires when 2 text-bearing blocks each have font-family + same single weight", async () => {
    const css = `
      .heading { font-family: Inter; font-weight: 400; padding: 8px; }
      .body { font-family: Inter; font-weight: 400; padding: 4px; }
    `;
    expectRule(await violationsOf(css), "single-weight-typography");
  });

  it("[G1] does NOT fire on a flat JSX-extract string with 1 occurrence", async () => {
    // Mimics JSX inline-style extraction output: a flat ;-separated string
    // with one font-weight. G1 gate requires ≥2 occurrences.
    const flat = `font-weight: 400; color: red;`;
    expectNoRule(await violationsOf(flat), "single-weight-typography");
  });

  it("[G1] fires on a flat extract with 2+ occurrences of the same weight", async () => {
    const flat = `font-weight: 400; color: red; font-weight: 400; line-height: 1.5;`;
    expectRule(await violationsOf(flat), "single-weight-typography");
  });
});

// ---------------------------------------------------------------------------
// G1/G2 (2026-05-24) — soft-warn calibration lock-in.
//
// Pinned scenarios for the minimum-occurrence gates added by Squad G to
// bring soft-warn FPR from 42.86% → 0% on the 100-component fixture.
// ---------------------------------------------------------------------------

describe("[G1] single-weight-typography min-occurrence gate (lock-in)", () => {
  it("legitimate single-weight button does NOT fire", async () => {
    // A single styled button class with one font-weight is an intentional
    // element style, not a flat-hierarchy file — must NOT fire.
    const css = `.btn { font-family: Inter; font-weight: 500; padding: 8px 14px; color: #fff; }`;
    expectNoRule(await violationsOf(css), "single-weight-typography");
  });

  it("3+ single-weight text blocks DOES fire", async () => {
    const css = `
      h1 { font-weight: 400; font-size: 32px; }
      h2 { font-weight: 400; font-size: 24px; }
      p { font-weight: 400; color: #333; }
    `;
    expectRule(await violationsOf(css), "single-weight-typography");
  });

  it("MUI input pattern (1 label-class weight only) does NOT fire", async () => {
    // Mirrors the realGood fixture from anti-slop-fp-rate.test.ts that
    // was the dominant FP contributor pre-G1.
    const css = `
      .mui-input { padding: 12px 14px; border: 1px solid #999; color: #1a1a1a; }
      .mui-input:focus { border-color: #5b8def; }
      .mui-input-label { font-weight: 600; }
    `;
    expectNoRule(await violationsOf(css), "single-weight-typography");
  });

  it("multiple distinct weights still does NOT fire (hierarchy present)", async () => {
    const css = `
      h1 { font-weight: 700; }
      h2 { font-weight: 600; }
      h3 { font-weight: 500; }
      p { font-weight: 400; }
    `;
    expectNoRule(await violationsOf(css), "single-weight-typography");
  });
});

describe("[G2] default-tailwind-blue min-occurrence gate (lock-in)", () => {
  it("intentional 2-4x blue accent does NOT fire when total < 2", async () => {
    // Specifically: single occurrence = intentional accent. The user-task
    // copy says "intentional 2-4x blue accent does NOT fire" — this is
    // delivered via the dedicated single-use guard. Multi-occurrence cases
    // are tested separately under cross-source aggregation tests.
    const css = `.cta { color: #3b82f6; padding: 8px 14px; border-radius: 6px; }`;
    expectNoRule(await violationsOf(css), "default-tailwind-blue");
  });

  it("borderline fixture pattern (single color: #3b82f6 per file) does NOT fire", async () => {
    // Mirrors the borderline fixture from anti-slop-fp-rate.test.ts that
    // was the dominant FP contributor pre-G2.
    const css = `.border-3 { padding: 24px; color: #3b82f6; font-weight: 400; }`;
    expectNoRule(await violationsOf(css), "default-tailwind-blue");
  });

  it(".wisp/brand-spec.json with brand.primary auto-whitelists the matching color", async () => {
    // The brand-spec loader accepts `brand.colors[]` (legacy) AND `brand.primary`
    // (single primary token). Both forms must auto-whitelist.
    const { runAntiSlopOnFiles } = await import("../../src/verify/anti-slop-linter.js");
    const dir = mkdtempSync(join(tmpdir(), "wisp-g2-primary-"));
    mkdirSync(join(dir, ".wisp"), { recursive: true });
    writeFileSync(
      join(dir, ".wisp", "brand-spec.json"),
      JSON.stringify({ brand: { primary: "#3b82f6" } }),
    );
    const cssFile = join(dir, "x.css");
    // 2-hit fixture under whitelist — without whitelist it would fire under
    // G2; with whitelist it must NOT fire.
    writeFileSync(cssFile, `.a { color: #3b82f6; } .b { background-color: #3b82f6; }`);
    const res = await runAntiSlopOnFiles([cssFile], { mode: "audit", projectRoot: dir });
    const v = (res.violations ?? []) as AntiSlopViolation[];
    expectNoRule(v, "default-tailwind-blue");
    rmSync(dir, { recursive: true, force: true });
  });

  it("5+ usages of default blue across file DOES fire (pattern, not accent)", async () => {
    const css = `
      .a { color: #3b82f6; }
      .b { color: #3b82f6; }
      .c { color: #3b82f6; }
      .d { color: #3b82f6; }
      .e { color: #3b82f6; }
    `;
    expectRule(await violationsOf(css), "default-tailwind-blue");
  });
});

// ---------------------------------------------------------------------------
// FPR sanity — run the linter against the clean section of sample/index.html
// and confirm the new rule changes don't fire false positives.
// ---------------------------------------------------------------------------

describe("[T1-T6] FPR check against clean sample section", () => {
  const CLEAN_SECTION = `
    <section data-sample="clean" class="space-y-4">
      <h2 class="text-xl font-medium">Clean baseline · pricing card</h2>
      <article class="max-w-sm rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
        <header class="space-y-1">
          <h3 class="text-base font-medium text-neutral-900">Standard plan</h3>
          <p class="text-sm text-neutral-600">For small teams getting started.</p>
        </header>
        <p class="mt-4">
          <span class="text-3xl font-semibold text-neutral-900">$24</span>
          <span class="text-sm text-neutral-500">/month</span>
        </p>
        <ul class="mt-4 space-y-2 text-sm text-neutral-700">
          <li class="flex items-start gap-2">Up to 10 projects</li>
        </ul>
        <button type="button" class="mt-6 w-full rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white">
          Start free trial
        </button>
      </article>
    </section>
  `;

  it("clean section produces 0 new-rule hits (T1/T2/T3/T5)", async () => {
    const v = await violationsOf(CLEAN_SECTION);
    const newRuleIds = new Set([
      "em-dash-ui",
      "hero-metric-template",
      "purple-blue-gradient",
      "default-tailwind-blue",
    ]);
    const hits = v.filter((x) => newRuleIds.has(x.ruleId));
    expect(
      hits.length,
      `expected 0 new-rule hits on clean section; got: ${hits.map((h) => h.ruleId).join(", ")}`,
    ).toBe(0);
  });
});
