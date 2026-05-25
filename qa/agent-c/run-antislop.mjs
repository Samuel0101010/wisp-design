#!/usr/bin/env node
// QA Agent-C: Anti-slop hard-ban detection driver
// Tests all 14 slop fixtures (2 per rule) + 20 clean fixtures for FPR

import { readdir, readFile } from "node:fs/promises";
import { join, resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");

// Import the built module
const { runAntiSlopOnFiles, runAntiSlop, extractCssFromFile } = await import(
  "../../dist/verify/anti-slop-linter.js"
);

const SLOP_DIR = join(__dirname, "fixtures/slop");
const CLEAN_DIR = join(__dirname, "fixtures/clean");

// ── Helper ───────────────────────────────────────────────────────────────────

async function runOnDir(dir) {
  const entries = await readdir(dir);
  const files = entries
    .filter(f => /\.(tsx|css|html)$/.test(f))
    .map(f => join(dir, f))
    .sort();

  const results = await Promise.all(
    files.map(async (fp) => {
      const content = await readFile(fp, "utf8");
      const css = extractCssFromFile(fp, content);
      const result = await runAntiSlop(css, { mode: "audit" });
      return { file: basename(fp), result };
    })
  );
  return results;
}

// ── Slop fixtures — expect at least one "fail" per file ───────────────────────

console.log("\n=== SLOP FIXTURE SCAN (expect all 14 to FAIL) ===\n");

const slopResults = await runOnDir(SLOP_DIR);

// Map fixture number to expected rule
const FIXTURE_TO_RULE = {
  "01-em-dash-ui.tsx":                 "em-dash-ui",
  "02-em-dash-ui-2.html":              "em-dash-ui",
  "03-gradient-text.tsx":              "gradient-text-headline",
  "04-gradient-text-css.css":          "gradient-text-headline",
  "05-glassmorphism-default.tsx":      "default-glassmorphism",
  "06-glassmorphism-css.css":          "default-glassmorphism",
  "07-hero-metric.tsx":                "hero-metric-template",
  "08-hero-metric-2.html":             "hero-metric-template",
  "09-side-stripe.css":                "side-stripe-decoration",
  "10-side-stripe-2.tsx":              "side-stripe-decoration",
  "11-purple-blue-gradient.css":       "purple-blue-gradient",
  "12-purple-blue-gradient-2.tsx":     "purple-blue-gradient",
  "13-generic-ai-illustration.tsx":    "generic-ai-illustration",
  "14-generic-ai-illustration-2.html": "generic-ai-illustration",
};

const ruleStats = {};
let fnCount = 0;

for (const { file, result } of slopResults) {
  // `file` is the basename only (relative to the dir, stripped in runOnDir)
  const expectedRule = FIXTURE_TO_RULE[file];
  const hardBanViolations = (result.violations ?? []).filter(v => v.severity === "fail");
  const caught = hardBanViolations.length > 0;
  const rulesFired = [...new Set(hardBanViolations.map(v => v.ruleId))];

  if (!ruleStats[expectedRule]) {
    ruleStats[expectedRule] = { total: 0, caught: 0, missed: [] };
  }
  ruleStats[expectedRule].total += 1;

  if (caught) {
    ruleStats[expectedRule].caught += 1;
    console.log(`  CATCH [${file}]: rules fired = ${rulesFired.join(", ")}`);
  } else {
    ruleStats[expectedRule].missed.push(file);
    fnCount += 1;
    console.log(`  MISS  [${file}]: expected rule "${expectedRule}" — no hard-ban violations found`);
    // Show all violations (might be warn-only)
    const warnViolations = (result.violations ?? []).filter(v => v.severity === "warn");
    if (warnViolations.length > 0) {
      console.log(`         (warn-only hits: ${warnViolations.map(v => v.ruleId).join(", ")})`);
    }
  }
}

console.log("\n=== CATCH RATE PER RULE ===\n");
const RULE_ORDER = [
  "em-dash-ui",
  "gradient-text-headline",
  "default-glassmorphism",
  "hero-metric-template",
  "side-stripe-decoration",
  "purple-blue-gradient",
  "generic-ai-illustration",
];

for (const rule of RULE_ORDER) {
  const s = ruleStats[rule] ?? { total: 0, caught: 0, missed: [] };
  const rate = s.total === 0 ? "N/A" : `${s.caught}/${s.total} (${Math.round(s.caught/s.total*100)}%)`;
  const status = s.caught === s.total ? "PASS" : "FAIL";
  console.log(`  ${status.padEnd(4)} ${rule.padEnd(30)} ${rate}`);
  if (s.missed.length > 0) {
    console.log(`       missed: ${s.missed.join(", ")}`);
  }
}

const totalSlop = slopResults.length;
const fnRate = fnCount / totalSlop;
console.log(`\nOverall FN rate: ${fnCount}/${totalSlop} = ${(fnRate * 100).toFixed(1)}%`);
console.log(`Target: 0%. Status: ${fnRate === 0 ? "PASS" : "FAIL"}`);

// ── Clean fixtures — expect 0 hard-ban violations ─────────────────────────────

console.log("\n=== CLEAN FIXTURE SCAN (expect 0 hard-ban violations) ===\n");

const cleanResults = await runOnDir(CLEAN_DIR);
let fpCount = 0;
let softWarnCount = 0;
const ruleOverfireCount = {};

for (const { file, result } of cleanResults) {
  const hardBanHits = (result.violations ?? []).filter(v => v.severity === "fail");
  const softWarnHits = (result.violations ?? []).filter(v => v.severity === "warn");

  if (hardBanHits.length > 0) {
    fpCount += 1;
    console.log(`  FP    [${file}]: hard-ban rules fired = ${hardBanHits.map(v => v.ruleId).join(", ")}`);
  }
  if (softWarnHits.length > 0) {
    softWarnCount += 1;
    for (const v of softWarnHits) {
      ruleOverfireCount[v.ruleId] = (ruleOverfireCount[v.ruleId] ?? 0) + 1;
    }
    // Don't spam — just log which rules fire
    process.stdout.write(`  WARN  [${file}]: ${softWarnHits.map(v => v.ruleId).join(", ")}\n`);
  }
}

const totalClean = cleanResults.length;
const fprHardBan = fpCount / totalClean;
const softWarnFPR = softWarnCount / totalClean;

console.log(`\n=== FPR SUMMARY ===`);
console.log(`Hard-ban FPR: ${fpCount}/${totalClean} = ${(fprHardBan * 100).toFixed(1)}%  (target ≤5%): ${fprHardBan <= 0.05 ? "PASS" : "FAIL"}`);
console.log(`Soft-warn FPR: ${softWarnCount}/${totalClean} = ${(softWarnFPR * 100).toFixed(1)}%  (Phase-7 target <20%, Phase-6 known ~42%)`);
console.log(`\nSoft-warn over-firing rules:`);
for (const [rule, count] of Object.entries(ruleOverfireCount).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${rule.padEnd(30)} ${count}/${totalClean} files (${Math.round(count/totalClean*100)}%)`);
}

// ── Write findings ─────────────────────────────────────────────────────────────

import { writeFile, mkdir } from "node:fs/promises";

const report = `# QA Agent-C: Anti-Slop Findings

## Test 1: Hard-Ban Detection (FN Rate)

14 slop fixtures, 2 per rule.

| Rule | Caught | Total | Rate | Status |
|------|--------|-------|------|--------|
${RULE_ORDER.map(rule => {
  const s = ruleStats[rule] ?? { total: 0, caught: 0, missed: [] };
  const rate = `${s.caught}/${s.total} (${s.total === 0 ? "N/A" : Math.round(s.caught/s.total*100)}%)`;
  const status = s.caught === s.total ? "PASS" : "FAIL (FN)";
  return `| ${rule} | ${s.caught} | ${s.total} | ${rate} | ${status} |`;
}).join("\n")}

**Overall FN rate:** ${fnCount}/${totalSlop} = ${(fnRate * 100).toFixed(1)}%
**Target:** 0%
**Status:** ${fnRate === 0 ? "PASS" : "FAIL — LAUNCH BLOCKER"}

${fnCount > 0 ? `### False-Negative Detail\n\n${RULE_ORDER.filter(r => ruleStats[r]?.missed?.length > 0).map(r => `- **${r}**: missed ${ruleStats[r].missed.join(", ")}`).join("\n")}` : "All 14 slop fixtures caught."}

## Test 2: FPR on 20 Clean Tailwind Fixtures

| Metric | Count | Rate | Target | Status |
|--------|-------|------|--------|--------|
| Hard-ban FPR | ${fpCount}/${totalClean} | ${(fprHardBan * 100).toFixed(1)}% | ≤5% | ${fprHardBan <= 0.05 ? "PASS" : "FAIL"} |
| Soft-warn FPR | ${softWarnCount}/${totalClean} | ${(softWarnFPR * 100).toFixed(1)}% | <20% (Phase-7) | ${softWarnFPR < 0.20 ? "PASS" : "WARN (known Phase-6 gap)"} |

### Soft-Warn Over-Firing Detail

| Rule | Files Flagged | Rate |
|------|--------------|------|
${Object.entries(ruleOverfireCount).sort((a, b) => b[1] - a[1]).map(([rule, count]) => `| ${rule} | ${count}/${totalClean} | ${Math.round(count/totalClean*100)}% |`).join("\n") || "| (none) | 0 | 0% |"}

### Notes
- \`single-weight-typography\` fires on TSX/CSS files that only declare one font-weight (expected on single-component fixtures)
- \`round-number-whitespace\` aggregator threshold (≥4 decls, ratio>0.7) suppresses most clean-file FPs
`;

await writeFile(join(__dirname, "01-antislop-fn.md"), report);
console.log("\nFindings written to qa/agent-c/01-antislop-fn.md");
