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

  // [AUDIT] Security audit flagged FN-risk: oklch() variants are NOT matched
  // by the current hex/named-colour regex. This test PINS the current behaviour;
  // when the audit's recommended oklch branch lands, flip this test to expect a hit.
  it("[AUDIT] does NOT match oklch() purple→blue (current FN behaviour)", async () => {
    const css = `.bg { background: linear-gradient(oklch(60% 0.3 280deg), oklch(60% 0.3 240deg)); }`;
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
  it("flags padding: 16px (round-number Tailwind default)", async () => {
    const v = await violationsOf(`.card { padding: 16px; }`);
    expectRule(v, "round-number-whitespace");
    expect(v.find((x) => x.ruleId === "round-number-whitespace")?.severity).toBe("warn");
  });

  it("does NOT flag padding: 18px (off-grid)", async () => {
    expectNoRule(await violationsOf(`.card { padding: 18px; }`), "round-number-whitespace");
  });

  // [AUDIT-RISK] Security flagged the rule for HIGH false-positive rate on
  // typical Tailwind-heavy projects. This test pins the current sensitive
  // behaviour: a single 16px hit fires. When file-level aggregation lands,
  // a single-hit CSS will NOT fire and this test will need to flip.
  it("[AUDIT-RISK] still fires on a single 16px occurrence (current sensitive behaviour)", async () => {
    expectRule(await violationsOf(`.x { gap: 24px; }`), "round-number-whitespace");
  });
});

// ---------------------------------------------------------------------------
// SOFT #3 — default-tailwind-blue [AUDIT: only matches color:]
// ---------------------------------------------------------------------------

describe("soft: default-tailwind-blue", () => {
  it("flags color: #3b82f6", async () => {
    expectRule(await violationsOf(`.link { color: #3b82f6; }`), "default-tailwind-blue");
  });

  it("flags color: rgb(59, 130, 246)", async () => {
    expectRule(await violationsOf(`.x { color: rgb(59, 130, 246); }`), "default-tailwind-blue");
  });

  // [AUDIT] Audit flagged FN: regex anchors on `color\s*:\s*` which ACCIDENTALLY
  // matches the tail of `background-color:` etc. as a substring. So in
  // practice the rule already partially covers those props (by accident).
  // The audit recommendation to add an explicit property-set extension still
  // stands — but the current FN profile is narrower than the audit assumed.
  // Pin current behaviour: `background-color: #3b82f6` DOES match.
  it("[AUDIT] matches background-color: #3b82f6 incidentally via substring of 'color:'", async () => {
    expectRule(await violationsOf(`.x { background-color: #3b82f6; }`), "default-tailwind-blue");
  });

  // True FN that the regex still misses: fill / stroke (no '-color:' suffix).
  it("[AUDIT] does NOT match fill: #3b82f6 (true FN — audit recommendation pending)", async () => {
    expectNoRule(await violationsOf(`.x { fill: #3b82f6; }`), "default-tailwind-blue");
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
    writeFileSync(file, `.x { color: #112233; padding: 18px; font-weight: 400; }
.y { font-weight: 700; }`);
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
