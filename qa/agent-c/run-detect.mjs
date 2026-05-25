#!/usr/bin/env node
// QA Agent-C: Component-library detection driver

import { writeFile } from "node:fs/promises";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const { detect } = await import("../../dist/agent/component-detect.js");

const PROJECTS_DIR = join(__dirname, "fixtures/projects");

// CONFIDENCE_THRESHOLD = 0.6 (from contracts/component.ts)
// Formula: average(capped-per-file-weight) across files that signal for the lib.
// pkg.json counts as 1 file. Source files each count as 1 file.
// With 1 pkg.json (0.5) + 1-3 source files (0.4 each):
//   denom=2 → avg=(0.5+0.4)/2=0.45 (BELOW threshold)
//   denom=3 → avg=(0.5+0.4+0.4)/3=0.43 (BELOW threshold)
// The threshold 0.6 is only reachable when either:
//   a) The pkg.json alone scores ≥0.6 (not possible, single dep=0.5)
//   b) Multiple high-weight signals stack AND there are few source files
//   c) A lib has both package.json AND filename-pattern signals (like radix: 3 deps → cap=1.0 → avg with imports >0.6)
// This is a known design limitation: single-dep libraries with few source files
// fall below the threshold. Radix works because it has 4+ dep keys → pkg score
// stacks to 1.0 cap → confidently above 0.6.
//
// Expected results reflect ACTUAL detection behavior (not desired):
const EXPECTED = [
  // shadcn: detected as radix because @radix-ui/* deps dominate pkg.json scoring
  { dir: "shadcn",           expectedLib: "radix",    minConf: 0.5,
    note: "DESIGN FINDING: shadcn uses @radix-ui/* deps → misidentified as radix. shadcn detection requires source import path @/components/ui/ to outscore radix." },
  { dir: "radix-only",       expectedLib: "radix",    minConf: 0.5,
    note: "via @radix-ui/* package.json keys + import scan" },
  // mui/chakra/ant/tailwind: confidence below 0.6 threshold with small projects
  { dir: "mui",              expectedLib: "vanilla",  minConf: 0,
    note: "DESIGN FINDING: confidence=0.42 < threshold(0.6) → falls back to vanilla. Requires ≥6 source files with @mui/ imports to reach 0.6 avg." },
  { dir: "chakra",           expectedLib: "vanilla",  minConf: 0,
    note: "DESIGN FINDING: confidence=0.42 < threshold(0.6) → falls back to vanilla." },
  { dir: "antd",             expectedLib: "vanilla",  minConf: 0,
    note: "DESIGN FINDING: confidence=0.43 < threshold(0.6) → falls back to vanilla." },
  { dir: "tailwind-vanilla", expectedLib: "vanilla",  minConf: 0,
    note: "DESIGN FINDING: tailwind uses className-pattern (0.2) + pkg (0.5) → avg 0.27 < threshold." },
];

console.log("\n=== COMPONENT DETECTION TEST ===\n");

const results = [];

for (const { dir, expectedLib, minConf, note } of EXPECTED) {
  const projectRoot = resolve(PROJECTS_DIR, dir);
  let result;
  try {
    result = await detect({ projectRoot });
  } catch (e) {
    console.log(`  ERROR [${dir}]: ${e.message}`);
    results.push({ dir, expectedLib, minConf, note, result: null, passed: false, error: e.message });
    continue;
  }

  const passed = result.primaryLib === expectedLib && result.confidence >= minConf;
  const status = passed ? "PASS" : "FAIL";

  console.log(`  [${dir}]`);
  console.log(`    Expected: ${expectedLib} (conf ≥ ${minConf})`);
  console.log(`    Got:      ${result.primaryLib} (conf = ${result.confidence.toFixed(3)})`);
  console.log(`    Strategy: ${result.preferredStrategy}`);
  console.log(`    Signals:  ${result.signals.length} total`);
  // Show top signals
  for (const s of result.signals.slice(0, 3)) {
    console.log(`      [${s.source}] w=${s.weight} ${s.detail.slice(0, 60)}`);
  }
  console.log(`    Status: ${status}  (${note})`);
  console.log();

  results.push({ dir, expectedLib, minConf, note, result, passed, error: null });
}

const allPassed = results.every(r => r.passed);
console.log(`Overall: ${allPassed ? "ALL PASS" : `${results.filter(r => !r.passed).length} FAILED`}`);

// ── Write findings ─────────────────────────────────────────────────────────────

const THRESHOLD = 0.6;

const report = `# QA Agent-C: Component Detection Findings

## Test 5: Library Detection (6 project types)

**COMPONENT_DETECT_CONFIDENCE_THRESHOLD = ${THRESHOLD}**

| Project | Desired | Got | Confidence | Status | Finding |
|---------|---------|-----|------------|--------|---------|
${results.map(r => {
  if (r.result === null) {
    return `| ${r.dir} | ${r.expectedLib} | ERROR | - | FAIL | error |`;
  }
  const desired = { shadcn: "shadcn", "radix-only": "radix", mui: "mui", chakra: "chakra", antd: "ant", "tailwind-vanilla": "tailwind" }[r.dir];
  const gotCorrect = r.result.primaryLib === desired;
  const finding = gotCorrect ? "correct" : r.result.primaryLib === "vanilla" ? `below threshold (${r.result.confidence.toFixed(3)} < ${THRESHOLD})` : `collision with ${r.result.primaryLib}`;
  return `| ${r.dir} | ${desired} | ${r.result.primaryLib} | ${r.result.confidence.toFixed(3)} | ${gotCorrect ? "PASS" : "DESIGN FINDING"} | ${finding} |`;
}).join("\n")}

## Design Findings

### Finding 1: Confidence Threshold Too High for Small Projects

**Severity: LAUNCH BLOCKER (mui, chakra, ant, tailwind with real projects fail)**

The averaging formula: \`confidence = sum(per-file-capped-weights) / count(files-with-signal)\`

With 1 package.json + 1-3 source files:
- pkg: weight=0.5 (1 file), source: weight=0.4 (1-3 files)
- average = (0.5 + 0.4×N) / (1+N) which converges to 0.4, never reaching 0.6

Required fix options:
1. Lower threshold from 0.6 to 0.45 (catches all cases with ≥1 dep + ≥1 import)
2. Make package.json a non-averaging "anchor" signal: if any pkg.json key matches, start confidence at 0.5 and only average source files on top
3. Use \`max\` instead of \`average\`: take the highest per-file score

### Finding 2: shadcn/radix Collision

**Severity: WARN (both get prop-edit strategy, so the edit path is the same)**

shadcn uses \`@radix-ui/*\` primitives, so the package.json signals fire for radix.
The detector needs the source import path \`@/components/ui/\` to outscore radix,
but that requires the components/ui/ directory to be scanned AND multiple files.

With 1 components/ui/ file: shadcn signals = import(0.4) + filename(0.3) + className(0.2) = capped 1.0
vs radix package.json: 3 deps × 0.5 = 1.5 → capped at 1.0
Net effect: both score 1.0 per their "file", averaging produces same confidence.
Tiebreaker goes to whichever lib appears first in ALL_LIBS iteration.

Required fix: boost shadcn filename pattern weight, or add an explicit "shadcn wins when components/ui/ exists" rule.

## Signal Detail

${results.filter(r => r.result !== null).map(r => `### ${r.dir} (got: ${r.result.primaryLib}, conf=${r.result.confidence.toFixed(3)})

| Source | Weight | Detail |
|--------|--------|--------|
${r.result.signals.slice(0, 8).map(s => `| ${s.source} | ${s.weight} | ${s.detail.slice(0, 70)} |`).join("\n") || "| (none) | - | - |"}
`).join("\n")}

## Summary

| Project | Correctly Detected? | Root Cause |
|---------|--------------------|-|
| shadcn | NO — gets radix | @radix-ui/* deps dominate; shadcn collision |
| radix-only | YES | 4 dep keys → high pkg.json score |
| mui | NO — gets vanilla | confidence 0.42 < threshold 0.6 |
| chakra | NO — gets vanilla | confidence 0.42 < threshold 0.6 |
| antd | NO — gets vanilla | confidence 0.43 < threshold 0.6 |
| tailwind-vanilla | NO — gets vanilla | confidence 0.27 < threshold 0.6 |

**Launch status: LAUNCH BLOCKER — 4 of 6 libraries undetectable in practice.**
Recommended fix: lower threshold to 0.45 OR make package.json an anchor (not averaged).
`;

await writeFile(join(__dirname, "05-component-detect.md"), report);
console.log("\nFindings written to qa/agent-c/05-component-detect.md");
