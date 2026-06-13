#!/usr/bin/env node
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/contracts/verify.ts
import { z } from "zod";
function worstSeverity(results) {
  let worst = "pass";
  for (const r of results) {
    if (r.severity === "fail") return "fail";
    if (r.severity === "warn") worst = "warn";
  }
  return worst;
}
function aggregateCounts(checks) {
  let hardBanCount = 0;
  let a11yFailCount = 0;
  let warningCount = 0;
  for (const c of checks) {
    if (c.severity === "warn") warningCount += 1;
    if (c.violations === void 0) continue;
    if (c.name === "anti-slop") {
      for (const v of c.violations) {
        const av = v;
        if (av.ruleId !== void 0 && HARD_BAN_RULES.has(av.ruleId)) {
          hardBanCount += 1;
        }
      }
    }
    if (c.name === "a11y-axe") {
      for (const v of c.violations) {
        if (v.severity === "fail") a11yFailCount += 1;
      }
    }
  }
  return { hardBanCount, a11yFailCount, warningCount };
}
var VerifyModeSchema, SeveritySchema, CheckNameSchema, MODE_CHECK_SETS, MODE_BLOCKS_ON_FAIL, MODE_TIMING_BUDGET_MS, AntiSlopRuleIdSchema, HARD_BAN_RULES, AuditOptionsSchema, ANTI_SLOP_LINTER_BUDGET_MS, A11Y_AXE_BUDGET_MS, CONSOLE_SCAN_BUDGET_MS, TAB_ORDER_BUDGET_MS, REDUCED_MOTION_BUDGET_MS, MULTI_VIEWPORT_BUDGET_MS, CHECK_BUDGET_MS, DEFAULT_VIEWPORTS, DEFAULT_COLOR_SCHEMES;
var init_verify = __esm({
  "src/contracts/verify.ts"() {
    "use strict";
    VerifyModeSchema = z.enum([
      "stop-hook",
      "live-accept",
      "live-with-screenshot",
      "audit",
      "audit-strict"
    ]);
    SeveritySchema = z.enum(["pass", "warn", "fail"]);
    CheckNameSchema = z.enum([
      "anti-slop",
      "a11y-axe",
      "console-scan",
      "tab-order",
      "reduced-motion",
      "multi-viewport"
    ]);
    MODE_CHECK_SETS = {
      "stop-hook": ["anti-slop"],
      "live-accept": [
        "anti-slop",
        "a11y-axe",
        "console-scan",
        "tab-order",
        "reduced-motion"
      ],
      "live-with-screenshot": [
        "anti-slop",
        "a11y-axe",
        "console-scan",
        "tab-order",
        "reduced-motion",
        "multi-viewport"
      ],
      audit: [
        "anti-slop",
        "a11y-axe",
        "console-scan",
        "tab-order",
        "reduced-motion",
        "multi-viewport"
      ],
      "audit-strict": [
        "anti-slop",
        "a11y-axe",
        "console-scan",
        "tab-order",
        "reduced-motion",
        "multi-viewport"
      ]
    };
    MODE_BLOCKS_ON_FAIL = {
      "stop-hook": false,
      "live-accept": false,
      "live-with-screenshot": false,
      audit: false,
      "audit-strict": true
    };
    MODE_TIMING_BUDGET_MS = {
      "stop-hook": 100,
      // p99 hard limit — hot path on every Claude turn
      "live-accept": 3e3,
      // p95 hot-path budget per synthesis.md
      "live-with-screenshot": 6e3,
      // + Playwright launch + 4 viewports × 2 modes
      audit: 3e4,
      // best-effort, single-shot CLI
      "audit-strict": 3e4
      // same; blocking decision after results assembled
    };
    AntiSlopRuleIdSchema = z.enum([
      // Hard-bans (severity: fail in all modes; blocks accept only when mode
      // blocks on fail).
      "em-dash-ui",
      "gradient-text-headline",
      "default-glassmorphism",
      "hero-metric-template",
      "side-stripe-decoration",
      "purple-blue-gradient",
      "generic-ai-illustration",
      // Soft suggestions (severity: warn even in strict modes).
      "too-perfect-alignment",
      "round-number-whitespace",
      "default-tailwind-blue",
      "single-weight-typography",
      "all-rounded-corners"
    ]);
    HARD_BAN_RULES = /* @__PURE__ */ new Set([
      "em-dash-ui",
      "gradient-text-headline",
      "default-glassmorphism",
      "hero-metric-template",
      "side-stripe-decoration",
      "purple-blue-gradient",
      "generic-ai-illustration"
    ]);
    AuditOptionsSchema = z.object({
      // User-facing names (`fast`/`full`/`strict`) are friendlier than the
      // internal VerifyMode enum. Mapping handled by the audit runner:
      //   fast   → "stop-hook"
      //   full   → "audit"   (+ "live-with-screenshot" if --screenshot)
      //   strict → "audit-strict"
      mode: z.enum(["fast", "full", "strict"]).default("fast"),
      // File globs to audit. Empty array = audit `git diff HEAD --name-only`.
      paths: z.array(z.string()).default([]),
      outputFormat: z.enum(["text", "json", "markdown"]).default("text"),
      // CI knob: treat warn-level findings as exit-1. Default false (warn-only
      // is informational for v0.x).
      failOnWarn: z.boolean().default(false),
      // Force multi-viewport screenshot (requires playwright optionalDep).
      screenshotEnabled: z.boolean().default(false)
    });
    ANTI_SLOP_LINTER_BUDGET_MS = 50;
    A11Y_AXE_BUDGET_MS = 1500;
    CONSOLE_SCAN_BUDGET_MS = 2e3;
    TAB_ORDER_BUDGET_MS = 300;
    REDUCED_MOTION_BUDGET_MS = 600;
    MULTI_VIEWPORT_BUDGET_MS = 3500;
    CHECK_BUDGET_MS = {
      "anti-slop": ANTI_SLOP_LINTER_BUDGET_MS,
      "a11y-axe": A11Y_AXE_BUDGET_MS,
      "console-scan": CONSOLE_SCAN_BUDGET_MS,
      "tab-order": TAB_ORDER_BUDGET_MS,
      "reduced-motion": REDUCED_MOTION_BUDGET_MS,
      "multi-viewport": MULTI_VIEWPORT_BUDGET_MS
    };
    DEFAULT_VIEWPORTS = [
      { w: 375, h: 812, label: "mobile-375" },
      { w: 768, h: 1024, label: "tablet-768" },
      { w: 1280, h: 800, label: "desktop-1280" },
      { w: 1920, h: 1080, label: "wide-1920" }
    ];
    DEFAULT_COLOR_SCHEMES = [
      "light",
      "dark"
    ];
  }
});

// src/verify/anti-slop-linter.ts
var anti_slop_linter_exports = {};
__export(anti_slop_linter_exports, {
  extractCssFromFile: () => extractCssFromFile,
  formatBlockMessage: () => formatBlockMessage,
  formatWarnMessage: () => formatWarnMessage,
  loadBrandColors: () => loadBrandColors,
  runAntiSlop: () => runAntiSlop,
  runAntiSlopOnFiles: () => runAntiSlopOnFiles
});
import { promises as fs } from "fs";
import { extname, join } from "path";
function extractClassNameValues(content) {
  const results = [];
  CLASS_ATTR_RE.lastIndex = 0;
  let m;
  while ((m = CLASS_ATTR_RE.exec(content)) !== null) {
    const fullMatch = m[0] ?? "";
    const value = m[1] ?? "";
    const valueOffset = m.index + fullMatch.length - value.length - 1;
    results.push({ value, offset: valueOffset });
  }
  return results;
}
function matchGradientTextClassName(value, offset, content) {
  if (/bg-gradient-to-\w+/.test(value) && /bg-clip-text/.test(value) && /text-transparent/.test(value)) {
    const { line, column } = lineColAt(content, offset);
    return {
      ruleId: "gradient-text-headline",
      severity: "fail",
      message: "gradient text via Tailwind classes (bg-clip-text text-transparent) \u2014 kills scanability.",
      suggestedFix: "Use a solid colour. Gradient text only for purely decorative, non-interactive accents.",
      location: { line, column, cssSnippet: snippet(value, 0, value.length) }
    };
  }
  return null;
}
function matchHeroMetricClassName(value, offset, content) {
  const hasBigText = /text-[789]xl\b/.test(value) || /text-\[(\d+)px\]/.test(value);
  const hasBorderlineHeavy = /text-[456]xl\b/.test(value) && /font-(black|extrabold)\b/.test(value);
  if (!hasBigText && !hasBorderlineHeavy) return null;
  const arbitraryMatch = /text-\[(\d+)px\]/.exec(value);
  if (arbitraryMatch !== null && !hasBorderlineHeavy) {
    const px = parseInt(arbitraryMatch[1] ?? "0", 10);
    if (px < 80) return null;
  }
  const window = content.slice(offset, offset + 400);
  if (!/>\s*[^<]*\d+(%|x|K\+?|M\+?|\+|\/\d+)[^<]*</.test(window)) return null;
  const { line, column } = lineColAt(content, offset);
  return {
    ruleId: "hero-metric-template",
    severity: "fail",
    message: "hero-metric template via Tailwind huge/bold text with metric suffix \u2014 over-used AI hero pattern.",
    suggestedFix: "Use a real proof-point with attribution, a testimonial, or remove the metric.",
    location: { line, column, cssSnippet: snippet(value, 0, value.length) }
  };
}
function matchGlassmorphismClassName(value, offset, content) {
  if (/backdrop-blur(-\w+)?/.test(value) && /bg-(white|black)\/\d+/.test(value)) {
    const before = content.slice(Math.max(0, offset - 100), offset);
    const after = content.slice(offset, Math.min(content.length, offset + 100));
    if (/wisp-justify/.test(before) || /wisp-justify/.test(after)) return null;
    const { line, column } = lineColAt(content, offset);
    return {
      ruleId: "default-glassmorphism",
      severity: "fail",
      message: "glassmorphism via Tailwind classes (backdrop-blur + bg-white/black opacity) \u2014 default AI vibe.",
      suggestedFix: "Add `/* wisp-justify: <reason> */` within 100 chars, or remove the backdrop-filter.",
      location: { line, column, cssSnippet: snippet(value, 0, value.length) }
    };
  }
  return null;
}
function matchPurpleBlueGradientClassName(value, offset, content) {
  if (/(from|via|to)-purple-\d+/.test(value) && /(from|via|to)-blue-\d+/.test(value)) {
    const { line, column } = lineColAt(content, offset);
    return {
      ruleId: "purple-blue-gradient",
      severity: "fail",
      message: "purple\u2192blue gradient via Tailwind classes \u2014 generic AI brand vibe.",
      suggestedFix: "Modulate lightness within one hue, or use the project palette colours from `.wisp/brand-spec.json`.",
      location: { line, column, cssSnippet: snippet(value, 0, value.length) }
    };
  }
  return null;
}
function matchDefaultBlueClassName(value, offset, content, ctx) {
  const m = DEFAULT_BLUE_TW_CLASS_RE.exec(value);
  if (m === null) return null;
  const token = `${m[1]}-blue-${m[2]}`;
  if (ctx.brandColors.has(token) || ctx.brandColors.has("#3b82f6")) {
    return null;
  }
  const { line, column } = lineColAt(content, offset);
  return {
    ruleId: "default-tailwind-blue",
    severity: "warn",
    message: `default Tailwind blue utility (${token}) \u2014 single most over-used AI brand colour.`,
    suggestedFix: "Use a project-defined accent OKLch with stated chroma, or pull from `.wisp/brand-spec.json`.",
    location: { line, column, cssSnippet: snippet(value, 0, value.length) }
  };
}
function runTailwindClassMatchers(content, ctx) {
  const matches = extractClassNameValues(content);
  const violations = [];
  const defaultBlueClassHits = [];
  const seen = /* @__PURE__ */ new Set();
  const seenBlue = /* @__PURE__ */ new Set();
  for (const { value, offset } of matches) {
    const candidates = [
      matchGradientTextClassName(value, offset, content),
      matchHeroMetricClassName(value, offset, content),
      matchGlassmorphismClassName(value, offset, content),
      matchPurpleBlueGradientClassName(value, offset, content)
    ];
    for (const v of candidates) {
      if (v === null) continue;
      const key = `${v.ruleId}:${v.location?.line ?? 0}`;
      if (seen.has(key)) continue;
      seen.add(key);
      violations.push(v);
    }
    const blue = matchDefaultBlueClassName(value, offset, content, ctx);
    if (blue !== null) {
      const key = `${blue.ruleId}:${blue.location?.line ?? 0}:${blue.location?.column ?? 0}`;
      if (!seenBlue.has(key)) {
        seenBlue.add(key);
        defaultBlueClassHits.push(blue);
      }
    }
  }
  return { violations, defaultBlueClassHits };
}
function runJsxInlineStyleMatchers(content) {
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  function push(v) {
    const key = `${v.ruleId}:${v.location?.line ?? 0}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(v);
  }
  JSX_BACKDROP_FILTER_RE.lastIndex = 0;
  let m;
  while ((m = JSX_BACKDROP_FILTER_RE.exec(content)) !== null) {
    const before = content.slice(Math.max(0, m.index - 100), m.index);
    const after = content.slice(m.index, Math.min(content.length, m.index + 100));
    if (/wisp-justify/.test(before) || /wisp-justify/.test(after)) continue;
    const { line, column } = lineColAt(content, m.index);
    push({
      ruleId: "default-glassmorphism",
      severity: "fail",
      message: "glassmorphism via JSX inline style (backdropFilter: blur) \u2014 default AI vibe.",
      suggestedFix: "Add `/* wisp-justify: <reason> */` within 100 chars, or remove the backdropFilter.",
      location: { line, column, cssSnippet: snippet(content, m.index, m[0].length) }
    });
    if (m.index === JSX_BACKDROP_FILTER_RE.lastIndex) JSX_BACKDROP_FILTER_RE.lastIndex += 1;
  }
  JSX_BACKGROUND_CLIP_TEXT_RE.lastIndex = 0;
  while ((m = JSX_BACKGROUND_CLIP_TEXT_RE.exec(content)) !== null) {
    const start = Math.max(0, m.index - 200);
    const end = Math.min(content.length, m.index + m[0].length + 200);
    const window = content.slice(start, end);
    if (JSX_COLOR_TRANSPARENT_RE.test(window)) {
      const { line, column } = lineColAt(content, m.index);
      push({
        ruleId: "gradient-text-headline",
        severity: "fail",
        message: "gradient text via JSX inline style (backgroundClip: 'text' + color: 'transparent') \u2014 kills scanability.",
        suggestedFix: "Use a solid colour. Gradient text only for purely decorative, non-interactive accents.",
        location: { line, column, cssSnippet: snippet(content, m.index, m[0].length) }
      });
    }
    if (m.index === JSX_BACKGROUND_CLIP_TEXT_RE.lastIndex) JSX_BACKGROUND_CLIP_TEXT_RE.lastIndex += 1;
  }
  return out;
}
function aggregateRoundNumberWhitespace(content, _ctx) {
  let totalCount = 0;
  let roundCount = 0;
  let firstRoundOffset = -1;
  let firstRoundLen = 0;
  ANY_SPACING_DECL_RE.lastIndex = 0;
  let m;
  while ((m = ANY_SPACING_DECL_RE.exec(content)) !== null) {
    totalCount += 1;
    const value = m[2] ?? "";
    if (ROUND_NUMBER_VALUES.has(value)) {
      roundCount += 1;
      if (firstRoundOffset === -1) {
        firstRoundOffset = m.index;
        firstRoundLen = m[0].length;
      }
    }
  }
  if (totalCount < ROUND_NUMBER_WHITESPACE_MIN_TOTAL) return [];
  const ratio = roundCount / totalCount;
  if (ratio <= ROUND_NUMBER_WHITESPACE_RATIO_THRESHOLD) return [];
  const rule = RULES_BY_ID.get("round-number-whitespace");
  if (rule === void 0) return [];
  const location = {};
  if (firstRoundOffset !== -1) {
    const { line, column } = lineColAt(content, firstRoundOffset);
    location.line = line;
    location.column = column;
    location.cssSnippet = snippet(content, firstRoundOffset, firstRoundLen);
  }
  return [
    {
      ruleId: rule.id,
      severity: rule.severity,
      message: `${rule.message} (${roundCount}/${totalCount} declarations on the 16/24/32/48px grid)`,
      suggestedFix: rule.suggestedFix,
      location
    }
  ];
}
function normalizeBlueValue(value) {
  const v = value.toLowerCase().trim();
  if (v === "#3b82f6") return "#3b82f6";
  if (/^rgb\(\s*59\s*,\s*130\s*,\s*246\s*\)$/.test(v)) return "#3b82f6";
  if (v === "var(--tw-blue-500)" || v === "var(--color-blue-500)") return v;
  return v;
}
function aggregateDefaultTailwindBlue(content, ctx, additionalClassHits = []) {
  const cssHits = [];
  DEFAULT_BLUE_CSS_RE.lastIndex = 0;
  let m;
  const seenLocations = /* @__PURE__ */ new Set();
  const rule = RULES_BY_ID.get("default-tailwind-blue");
  if (rule === void 0) return [];
  while ((m = DEFAULT_BLUE_CSS_RE.exec(content)) !== null) {
    const value = m[2] ?? "";
    const normalized = normalizeBlueValue(value);
    if (ctx.brandColors.has(normalized)) continue;
    const { line, column } = lineColAt(content, m.index);
    const locKey = `${line}:${column}`;
    if (seenLocations.has(locKey)) continue;
    seenLocations.add(locKey);
    cssHits.push({
      ruleId: rule.id,
      severity: rule.severity,
      message: rule.message,
      suggestedFix: rule.suggestedFix,
      location: {
        line,
        column,
        cssSnippet: snippet(content, m.index, m[0].length)
      }
    });
    if (cssHits.length >= 10) break;
  }
  const totalOccurrences = cssHits.length + additionalClassHits.length;
  if (totalOccurrences < DEFAULT_BLUE_MIN_OCCURRENCES) return [];
  return [...cssHits, ...additionalClassHits].slice(0, 10);
}
function lineColAt(content, offset) {
  let line = 1;
  let column = 1;
  for (let i = 0; i < offset && i < content.length; i += 1) {
    if (content.charCodeAt(i) === 10) {
      line += 1;
      column = 1;
    } else {
      column += 1;
    }
  }
  return { line, column };
}
function snippet(content, offset, length, max = 80) {
  const end = Math.min(content.length, offset + length);
  const raw = content.slice(offset, end);
  const trimmed = raw.replace(/\s+/g, " ").trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}\u2026`;
}
function forEachRuleBlock(content) {
  const blocks = [];
  let i = 0;
  let blockStart = 0;
  while (i < content.length) {
    const ch = content.charCodeAt(i);
    if (ch === 123) {
      const selector = content.slice(blockStart, i).trim();
      const bodyStart = i + 1;
      let depth = 1;
      let j = bodyStart;
      while (j < content.length && depth > 0) {
        const c = content.charCodeAt(j);
        if (c === 123) depth += 1;
        else if (c === 125) depth -= 1;
        if (depth === 0) break;
        j += 1;
      }
      const body = content.slice(bodyStart, j);
      blocks.push({ selector, body, offset: i });
      i = j + 1;
      blockStart = i;
      continue;
    }
    i += 1;
  }
  return blocks;
}
function blockIsTextBearing(block) {
  if (TEXT_DECL_RE.test(block.body)) return true;
  if (TEXT_TAG_RE.test(block.selector) && !ICON_HINT_RE.test(block.selector)) return true;
  return false;
}
function analyseFontWeights(content) {
  const distinctValues = /* @__PURE__ */ new Set();
  let occurrenceCount = 0;
  const blocks = forEachRuleBlock(content);
  const scanBodies = blocks.length === 0 ? [content] : blocks.filter(blockIsTextBearing).map((b) => b.body);
  for (const body of scanBodies) {
    FONT_WEIGHT_RE.lastIndex = 0;
    let m;
    while ((m = FONT_WEIGHT_RE.exec(body)) !== null) {
      const value = (m[1] ?? "").toLowerCase();
      let canonical;
      if (value === "normal") canonical = "400";
      else if (value === "bold") canonical = "700";
      else canonical = value;
      distinctValues.add(canonical);
      occurrenceCount += 1;
      if (distinctValues.size >= 2) return null;
    }
  }
  if (distinctValues.size === 1 && occurrenceCount >= MIN_SINGLE_WEIGHT_OCCURRENCES) {
    const rule = RULES_BY_ID.get("single-weight-typography");
    if (rule === void 0) return null;
    return {
      ruleId: rule.id,
      severity: rule.severity,
      message: rule.message,
      suggestedFix: rule.suggestedFix,
      location: { cssSnippet: `font-weight: ${Array.from(distinctValues)[0] ?? ""}` }
    };
  }
  return null;
}
async function runAntiSlop(css, ctx) {
  const startedAt = Date.now();
  const budgetMs = ctx?.budgetMs ?? ANTI_SLOP_LINTER_BUDGET_MS;
  const violations = [];
  const aggCtx = {
    brandColors: ctx?.brandColors ?? /* @__PURE__ */ new Set()
  };
  let parkedDefaultBlueClassHits = [];
  const tailwindBudgetOkUp = ctx?.budgetStartedAt === void 0 || Date.now() - ctx.budgetStartedAt <= budgetMs;
  if (tailwindBudgetOkUp) {
    const sourceForClassScan = ctx?.rawSource ?? css;
    const tw = runTailwindClassMatchers(sourceForClassScan, aggCtx);
    for (const v of tw.violations) violations.push(v);
    parkedDefaultBlueClassHits = tw.defaultBlueClassHits;
    for (const v of runJsxInlineStyleMatchers(sourceForClassScan)) violations.push(v);
  }
  for (const rule of RULES) {
    if (rule.id === "single-weight-typography") continue;
    if (rule.aggregator !== void 0) {
      const aggregated = rule.id === "default-tailwind-blue" ? aggregateDefaultTailwindBlue(css, aggCtx, parkedDefaultBlueClassHits) : rule.aggregator(css, aggCtx);
      for (const v of aggregated) violations.push(v);
      if (ctx?.budgetStartedAt !== void 0 && Date.now() - ctx.budgetStartedAt > budgetMs) {
        break;
      }
      continue;
    }
    const re = new RegExp(rule.pattern.source, rule.pattern.flags);
    let match;
    let matchCount = 0;
    while ((match = re.exec(css)) !== null) {
      const { line, column } = lineColAt(css, match.index);
      violations.push({
        ruleId: rule.id,
        severity: rule.severity,
        message: rule.message,
        suggestedFix: rule.suggestedFix,
        location: {
          line,
          column,
          cssSnippet: snippet(css, match.index, match[0].length)
        }
      });
      matchCount += 1;
      if (matchCount >= 10) break;
      if (match.index === re.lastIndex) re.lastIndex += 1;
    }
    if (ctx?.budgetStartedAt !== void 0 && Date.now() - ctx.budgetStartedAt > budgetMs) {
      break;
    }
  }
  const fwViolation = analyseFontWeights(css);
  if (fwViolation !== null) violations.push(fwViolation);
  const severity = violations.some((v) => v.severity === "fail") ? "fail" : violations.some((v) => v.severity === "warn") ? "warn" : "pass";
  return {
    name: "anti-slop",
    severity,
    durationMs: Date.now() - startedAt,
    violations
  };
}
function extractCssFromFile(filePath, content) {
  const ext = extname(filePath).toLowerCase();
  if (ext === ".css" || ext === ".scss" || ext === ".sass") return content;
  if (ext === ".tsx" || ext === ".jsx" || ext === ".ts" || ext === ".js") {
    const out = [];
    let m;
    JSX_INLINE_STYLE_RE.lastIndex = 0;
    while ((m = JSX_INLINE_STYLE_RE.exec(content)) !== null) {
      const body = (m[1] ?? "").replace(/([a-z])([A-Z])/g, (_, a, b) => `${a}-${b.toLowerCase()}`).replace(/['"]/g, "'").replace(/,/g, ";");
      out.push(body);
    }
    out.push(content);
    return out.join("\n");
  }
  if (ext === ".vue" || ext === ".svelte" || ext === ".html" || ext === ".htm" || ext === ".astro") {
    const out = [];
    let m;
    STYLE_BLOCK_RE.lastIndex = 0;
    while ((m = STYLE_BLOCK_RE.exec(content)) !== null) {
      out.push(m[1] ?? "");
    }
    INLINE_STYLE_ATTR_RE.lastIndex = 0;
    while ((m = INLINE_STYLE_ATTR_RE.exec(content)) !== null) {
      out.push(m[1] ?? "");
    }
    out.push(content);
    return out.join("\n");
  }
  return content;
}
async function loadBrandColors(projectRoot) {
  const out = /* @__PURE__ */ new Set();
  try {
    const path = join(projectRoot, ".wisp", "brand-spec.json");
    const raw = await fs.readFile(path, "utf8");
    const json = JSON.parse(raw);
    let arr = void 0;
    let primary = void 0;
    let accent = void 0;
    if (json !== null && typeof json === "object") {
      const j = json;
      const brand = j["brand"];
      if (brand !== void 0 && typeof brand === "object" && brand !== null) {
        const b = brand;
        arr = b["colors"];
        primary = b["primary"];
        accent = b["accent"];
      }
      if (arr === void 0) arr = j["colors"];
    }
    if (Array.isArray(arr)) {
      for (const v of arr) {
        if (typeof v === "string") out.add(v.toLowerCase().trim());
      }
    }
    if (typeof primary === "string") out.add(primary.toLowerCase().trim());
    if (typeof accent === "string") out.add(accent.toLowerCase().trim());
  } catch {
  }
  return out;
}
async function runAntiSlopOnFiles(files, opts) {
  const startedAt = Date.now();
  const budgetBase = opts.budgetStartedAt ?? startedAt;
  const budgetMs = opts.perCallBudgetMs ?? ANTI_SLOP_LINTER_BUDGET_MS;
  const violations = [];
  const brandColors = opts.brandColors ?? await loadBrandColors(opts.projectRoot);
  for (const filePath of files) {
    const ext = extname(filePath).toLowerCase();
    if (!UI_EXTENSIONS.has(ext)) continue;
    if (Date.now() - budgetBase > budgetMs) break;
    let content;
    try {
      content = await fs.readFile(filePath, "utf8");
    } catch {
      continue;
    }
    const css = extractCssFromFile(filePath, content);
    const result = await runAntiSlop(css, {
      mode: opts.mode,
      budgetStartedAt: budgetBase,
      rawSource: content,
      brandColors,
      // Phase-7.12 — propagate the per-call budget so inner rule-loop and
      // tailwind-scanner don't truncate against the 50ms stop-hook ceiling
      // when called from audit modes.
      budgetMs
    });
    if (result.violations !== void 0) {
      const rawAnti = result.violations;
      for (const v of rawAnti) {
        const annotated = {
          ruleId: v.ruleId,
          severity: v.severity,
          message: v.message,
          location: {
            ...v.location ?? {},
            cssSnippet: `${filePath}: ${v.location?.cssSnippet ?? ""}`.trim()
          }
        };
        if (v.suggestedFix !== void 0) annotated.suggestedFix = v.suggestedFix;
        violations.push(annotated);
      }
    }
  }
  const severity = violations.some((v) => v.severity === "fail") ? "fail" : violations.some((v) => v.severity === "warn") ? "warn" : "pass";
  return {
    name: "anti-slop",
    severity,
    durationMs: Date.now() - startedAt,
    violations
  };
}
function isHardBan(v) {
  return HARD_BAN_RULES.has(v.ruleId);
}
function formatBlockMessage(hits) {
  const hardBans = hits.filter(isHardBan);
  if (hardBans.length === 0) return "wisp-design anti-slop: (no hard-bans)";
  const head = `wisp-design anti-slop blocked: ${hardBans.length} hard-ban${hardBans.length > 1 ? "s" : ""}`;
  const lines = hardBans.slice(0, 5).map((v) => {
    const where = v.location !== void 0 && v.location.cssSnippet !== void 0 ? `
    ${v.location.cssSnippet}` : "";
    return `  \u2022 ${v.ruleId} \u2014 ${v.message}${where}
    fix: ${v.suggestedFix ?? "(no suggestion)"}`;
  });
  if (hardBans.length > 5) {
    lines.push(`  \u2022 \u2026and ${hardBans.length - 5} more.`);
  }
  return [head, ...lines].join("\n");
}
function formatWarnMessage(hits) {
  if (hits.length === 0) return "wisp-design anti-slop: clean.";
  const head = `wisp-design anti-slop warn: ${hits.length} finding${hits.length > 1 ? "s" : ""}`;
  const lines = hits.slice(0, 8).map((v) => {
    const sev = isHardBan(v) ? "FAIL" : "warn";
    return `  [${sev}] ${v.ruleId}: ${v.message}`;
  });
  if (hits.length > 8) {
    lines.push(`  \u2026and ${hits.length - 8} more (run \`wisp-design audit --mode full\` for the full report).`);
  }
  return [head, ...lines].join("\n");
}
var CLASS_ATTR_RE, JSX_BACKDROP_FILTER_RE, JSX_BACKGROUND_CLIP_TEXT_RE, JSX_COLOR_TRANSPARENT_RE, ROUND_NUMBER_WHITESPACE_MIN_TOTAL, ROUND_NUMBER_WHITESPACE_RATIO_THRESHOLD, ROUND_NUMBER_VALUES, ANY_SPACING_DECL_RE, DEFAULT_BLUE_CSS_RE, DEFAULT_BLUE_TW_CLASS_RE, DEFAULT_BLUE_MIN_OCCURRENCES, RULES, RULES_BY_ID, TEXT_TAG_RE, TEXT_DECL_RE, ICON_HINT_RE, FONT_WEIGHT_RE, MIN_SINGLE_WEIGHT_OCCURRENCES, STYLE_BLOCK_RE, JSX_INLINE_STYLE_RE, INLINE_STYLE_ATTR_RE, UI_EXTENSIONS;
var init_anti_slop_linter = __esm({
  "src/verify/anti-slop-linter.ts"() {
    "use strict";
    init_verify();
    CLASS_ATTR_RE = /\b(?:className|class)\s*=\s*"([^"]*)"/g;
    JSX_BACKDROP_FILTER_RE = /\bbackdropFilter\s*:\s*['"][^'"]*\bblur\(\s*(?!0(?:px)?\s*\))[^)]+\)/g;
    JSX_BACKGROUND_CLIP_TEXT_RE = /\b(?:backgroundClip|WebkitBackgroundClip)\s*:\s*['"]\s*text\s*['"]/g;
    JSX_COLOR_TRANSPARENT_RE = /\bcolor\s*:\s*['"]\s*transparent\s*['"]/;
    ROUND_NUMBER_WHITESPACE_MIN_TOTAL = 4;
    ROUND_NUMBER_WHITESPACE_RATIO_THRESHOLD = 0.7;
    ROUND_NUMBER_VALUES = /* @__PURE__ */ new Set(["16", "24", "32", "48"]);
    ANY_SPACING_DECL_RE = /(padding|margin|gap)\s*:\s*(\d+)px(?![0-9])/g;
    DEFAULT_BLUE_CSS_RE = /(color|background-color|border-color|fill|stroke)\s*:\s*(#3b82f6|rgb\(\s*59\s*,\s*130\s*,\s*246\s*\)|var\(--tw-blue-500\)|var\(--color-blue-500\))/gi;
    DEFAULT_BLUE_TW_CLASS_RE = /\b(bg|text|border)-blue-(500|600|700)\b/;
    DEFAULT_BLUE_MIN_OCCURRENCES = 2;
    RULES = [
      // ── Hard-bans ────────────────────────────────────────────────────────────
      {
        id: "em-dash-ui",
        severity: "fail",
        // T1 (2026-05-24): broadened element scope to button|h1-6|label|a|p|span
        // (UI copy lives in p/span too) and allowed multi-line text content via
        // `[^<]*?` (was `[^<\n]*` which excluded newlines — caused the canonical
        // sample/index.html line 129 FN where `<h3 class="...">\n  10x...velocity—instantly\n</h3>`
        // spans multiple lines). `[^<]` still blocks bridging across tag boundaries.
        // Em-dash can appear anywhere mid-text now, not only at start/end.
        pattern: /(content\s*:\s*['"][^'"]*[—–][^'"]*['"])|(>[^<]*?[—–][^<]*?<\s*\/(button|h[1-6]|label|a|p|span)\b)/gi,
        message: "em-dash in UI text \u2014 reads as docs-prose, not interface copy.",
        suggestedFix: "Replace with explicit punctuation, comma, or line break."
      },
      {
        id: "gradient-text-headline",
        severity: "fail",
        // `background-clip: text` paired with `color: transparent` on/near an
        // interactive or headline selector. Window: 200 chars to give the
        // declaration room without bridging across whole files.
        pattern: /(h[1-6]|button|a\b|\.btn|\.button|\.heading|nav\s|\[role=['"]link['"]\])[\s\S]{0,200}?background-clip\s*:\s*text[\s\S]{0,120}?color\s*:\s*transparent/gi,
        message: "gradient text on headline/button/link \u2014 kills scanability and contrast.",
        suggestedFix: "Use a solid colour. Gradient text only for purely decorative, non-interactive accents."
      },
      {
        id: "default-glassmorphism",
        severity: "fail",
        // `backdrop-filter: blur(...)` without a wisp-justify comment within
        // 100 chars. Negative lookahead is bounded so cost stays linear.
        pattern: /backdrop-filter\s*:\s*blur\([^)]+\)(?![\s\S]{0,100}\/\*\s*wisp-justify)/gi,
        message: "glassmorphism without explicit rationale \u2014 default AI vibe.",
        suggestedFix: "Add `/* wisp-justify: <reason> */` within 100 chars, or remove the backdrop-filter."
      },
      {
        id: "hero-metric-template",
        severity: "fail",
        // Big font-size (≥80px) in close proximity to a "Nk+" / "Nx" / "$NM"
        // content string. Catches `font-size: 96px; ... content: "100k+"`.
        pattern: /font-size\s*:\s*(8\d|9\d|1[0-9]\d)px[\s\S]{0,300}?content\s*:\s*['"][^'"]*\d+(k\+|K\+|x|M\+|m\+|\+)[^'"]*['"]/g,
        message: "hero-metric template (huge number + 'k+'/'10x'/'$M+' suffix) \u2014 over-used AI hero pattern.",
        suggestedFix: "Use a real proof-point with attribution, a testimonial, or remove the metric."
      },
      {
        id: "side-stripe-decoration",
        severity: "fail",
        // ::before pseudo with absolute positioning at left:0, small width, and
        // a gradient background. Width bounded to 1-8px so we don't false-flag
        // legitimate sidebars.
        pattern: /::before\s*\{[\s\S]{0,300}?position\s*:\s*absolute[\s\S]{0,200}?left\s*:\s*0[\s\S]{0,150}?width\s*:\s*[1-8]px[\s\S]{0,200}?background\s*:[^;}]*linear-gradient/gi,
        message: "decorative side-stripe via ::before \u2014 Linear-clone tell, invisibly over-used.",
        suggestedFix: "Replace with a semantic priority indicator (icon + label) or remove the decoration."
      },
      {
        id: "purple-blue-gradient",
        severity: "fail",
        // linear-gradient containing BOTH a purple-ish stop AND a blue-ish stop.
        // Two alternations:
        //   (a) Hex/named-colour list — Tailwind v3 + CSS named colours.
        //   (b) [T3, 2026-05-24] OKLch colour-space with hue in 270-300deg (purple)
        //       co-occurring with hue in 240-265deg (blue). Tailwind v4 / Radix
        //       palettes emit oklch() so the hex-only path would miss them.
        //       Pattern is intentionally permissive: any `linear-gradient(...)`
        //       containing one purple-hue oklch and one blue-hue oklch, in either
        //       order. `(?:2[7-9]\d|300)` covers 270-300; `(?:24\d|25\d|26[0-5])`
        //       covers 240-265.
        pattern: /linear-gradient\([^)]*(?:(?:#5b21b6|#6d28d9|#7c3aed|#8b5cf6|#a855f7|#c084fc|purple|violet)[^)]*(?:#1d4ed8|#2563eb|#3b82f6|#60a5fa|#93c5fd|blue|indigo)|(?:#1d4ed8|#2563eb|#3b82f6|#60a5fa|#93c5fd|blue|indigo)[^)]*(?:#5b21b6|#6d28d9|#7c3aed|#8b5cf6|#a855f7|#c084fc|purple|violet)|oklch\([^)]*?(?:2[7-9]\d|300)(?:\.\d+)?(?:deg)?[^)]*?\)[^)]*?oklch\([^)]*?(?:24\d|25\d|26[0-5])(?:\.\d+)?(?:deg)?[^)]*?\)|oklch\([^)]*?(?:24\d|25\d|26[0-5])(?:\.\d+)?(?:deg)?[^)]*?\)[^)]*?oklch\([^)]*?(?:2[7-9]\d|300)(?:\.\d+)?(?:deg)?[^)]*?\))[^)]*\)/gi,
        message: "purple\u2192blue gradient \u2014 generic AI brand vibe.",
        suggestedFix: "Modulate lightness within one hue, or use the project palette colours from `.wisp/brand-spec.json`."
      },
      {
        id: "generic-ai-illustration",
        severity: "fail",
        // background-image referencing well-known generic illustration sources.
        pattern: /background-image\s*:\s*url\(['"]?[^'"]*?(undraw|drawkit|illustration\.[a-z]+|cartoon|blob\s*avatar|3d-blob)[^'"]*?['"]?\)/gi,
        message: "generic illustration reference (undraw/drawkit/3D-blob) \u2014 instantly-recognisable AI vibe.",
        suggestedFix: "Use a custom illustration or remove the illustration entirely."
      },
      // ── Soft suggestions ─────────────────────────────────────────────────────
      {
        id: "too-perfect-alignment",
        severity: "warn",
        // Symmetric `margin:0 auto` + `text-align:center` + symmetric padding +
        // explicit gap. Heuristic; tolerant of variance via 0,100 windows.
        pattern: /margin\s*:\s*0\s+auto\s*;[\s\S]{0,150}?text-align\s*:\s*center\s*;[\s\S]{0,150}?padding\s*:\s*\d+px\s+\d+px\s*;[\s\S]{0,150}?gap\s*:\s*\d+px/g,
        message: "too-perfect symmetric block \u2014 reads as wireframe, not designed page.",
        suggestedFix: "Introduce a small asymmetry (offset margin, sibling-specific padding, or asymmetric grid)."
      },
      {
        id: "round-number-whitespace",
        severity: "warn",
        // padding/margin/gap exactly equal to the Tailwind defaults 16/24/32/48.
        // The `pattern` field stays exported for tests that introspect it; the
        // RUNNER actually invokes `aggregator` below, which makes a single file-
        // level decision based on the round/total ratio.
        pattern: /(padding|margin|gap)\s*:\s*(16|24|32|48)px(?![0-9])/g,
        message: "round-number whitespace (16/24/32/48px) \u2014 reads as Tailwind-default.",
        suggestedFix: "Mix nearby steps (18/22/26/50) within a 4px grid to add considered rhythm.",
        aggregator: aggregateRoundNumberWhitespace
      },
      {
        id: "default-tailwind-blue",
        severity: "warn",
        // T5 (2026-05-24): extended scope.
        //   (a) property set: color | background-color | border-color | fill | stroke
        //       (was: color only; `background-color` was matched incidentally via
        //       substring of `color:` — explicit list is clearer and adds the
        //       fill/stroke FN).
        //   (b) brand-color whitelist: when `.wisp/brand-spec.json` is present
        //       and the offending colour matches any entry in `brand.colors`,
        //       the rule is skipped. Implemented via `aggregator` so the runner
        //       can pass the pre-loaded brand-color set in via closure.
        //   (c) Tailwind utility classes `(bg|text|border)-blue-{500..700}` —
        //       scanned in the className matcher pass, not here.
        // The exported `pattern` stays for tests that introspect it; the
        // RUNNER invokes `aggregator` which does the brand-whitelist filtering.
        pattern: /(color|background-color|border-color|fill|stroke)\s*:\s*(#3b82f6|rgb\(\s*59\s*,\s*130\s*,\s*246\s*\)|var\(--tw-blue-500\)|var\(--color-blue-500\))/gi,
        message: "default Tailwind blue (#3b82f6) used directly \u2014 single most over-used AI brand colour.",
        suggestedFix: "Use a project-defined accent OKLch with stated chroma, or pull from `.wisp/brand-spec.json`.",
        aggregator: aggregateDefaultTailwindBlue
      },
      // single-weight-typography is handled separately by `analyseFontWeights`
      // (counting distinct values across the file is a state-ful scan, not a
      // single-pass regex). Below entry stays for `RuleId` exhaustiveness only —
      // its pattern never matches.
      {
        id: "single-weight-typography",
        severity: "warn",
        pattern: / never /,
        // sentinel — `analyseFontWeights` decides.
        message: "only one font-weight in this file \u2014 flat typographic hierarchy.",
        suggestedFix: "Use 2-3 weights (e.g. 400 body, 500 label, 600 headline) to create scannable hierarchy."
      },
      {
        id: "all-rounded-corners",
        severity: "warn",
        // 4+ distinct selector-or-rule blocks each ending in border-radius:Npx.
        // Cheap heuristic: count `border-radius` occurrences in a single file.
        pattern: /border-radius\s*:\s*\d+px\s*;[\s\S]{0,2000}?border-radius\s*:\s*\d+px\s*;[\s\S]{0,2000}?border-radius\s*:\s*\d+px\s*;[\s\S]{0,2000}?border-radius\s*:\s*\d+px\s*;/g,
        message: "every surface has the same border-radius \u2014 no visual hierarchy.",
        suggestedFix: "Mix sharp + rounded across surfaces (0 / 4 / 8 / 16) instead of one value everywhere."
      }
    ];
    RULES_BY_ID = new Map(
      RULES.map((r) => [r.id, r])
    );
    TEXT_TAG_RE = /(^|[\s,>+~])(h[1-6]|p|span|a|button|label|li|blockquote|code|td|th|strong|em|small|figcaption|caption)\b/;
    TEXT_DECL_RE = /(?:^|[\s;{])(font-family|font-size|line-height|letter-spacing|color|text-[a-z-]+)\s*:/i;
    ICON_HINT_RE = /\.(icon|sr-only|visually-hidden|svg|chev|caret|spinner)\b|\[aria-hidden\b/;
    FONT_WEIGHT_RE = /font-weight\s*:\s*([1-9]\d{2}|normal|bold|lighter|bolder)/gi;
    MIN_SINGLE_WEIGHT_OCCURRENCES = 2;
    STYLE_BLOCK_RE = /<style[^>]*>([\s\S]*?)<\/style>/gi;
    JSX_INLINE_STYLE_RE = /\bstyle\s*=\s*\{\{([\s\S]*?)\}\}/g;
    INLINE_STYLE_ATTR_RE = /\bstyle\s*=\s*"([^"]*)"/g;
    UI_EXTENSIONS = /* @__PURE__ */ new Set([
      ".tsx",
      ".jsx",
      ".ts",
      ".js",
      ".vue",
      ".svelte",
      ".astro",
      ".html",
      ".htm",
      ".css",
      ".scss",
      ".sass"
    ]);
  }
});

// src/verify/_sandbox.ts
var sandbox_exports = {};
__export(sandbox_exports, {
  SandboxError: () => SandboxError,
  isLoopbackUrl: () => isLoopbackUrl,
  safeBrowserLaunch: () => safeBrowserLaunch
});
function isLoopbackUrl(u) {
  let parsed;
  try {
    parsed = new URL(u);
  } catch {
    return false;
  }
  const host = parsed.hostname.toLowerCase();
  return host === "127.0.0.1" || host === "localhost" || host === "[::1]";
}
function validateLivePreviewUrl(raw) {
  if (typeof raw !== "string" || raw === "") {
    throw new SandboxError("livePreviewUrl must be a non-empty string", "INVALID_URL", { raw });
  }
  let url;
  try {
    url = new URL(raw);
  } catch (err) {
    throw new SandboxError("livePreviewUrl is not a valid URL", "INVALID_URL", {
      raw,
      cause: err.message
    });
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new SandboxError(
      `livePreviewUrl protocol must be http or https, got "${url.protocol}"`,
      "INVALID_PROTOCOL",
      { raw, protocol: url.protocol }
    );
  }
  if (url.username !== "" || url.password !== "") {
    throw new SandboxError(
      "livePreviewUrl must not contain user:password credentials",
      "USERINFO_FORBIDDEN",
      { raw }
    );
  }
  if (!isLoopbackUrl(raw)) {
    throw new SandboxError(
      `livePreviewUrl host "${url.hostname}" is not loopback (only 127.0.0.1, localhost, [::1] allowed)`,
      "NON_LOOPBACK_URL",
      { raw, hostname: url.hostname }
    );
  }
  const portStr = url.port;
  if (portStr === "") {
    throw new SandboxError("livePreviewUrl must specify an explicit port", "INVALID_PORT", { raw });
  }
  const port = Number.parseInt(portStr, 10);
  if (!Number.isFinite(port) || port <= 1024 || port >= 65536) {
    throw new SandboxError(
      `livePreviewUrl port ${portStr} is out of allowed range (1025-65535)`,
      "INVALID_PORT",
      { raw, port: portStr }
    );
  }
  return { url, hostname: url.hostname.toLowerCase(), port };
}
function isLoopbackHostname(hostname) {
  const h = hostname.toLowerCase();
  return h === "127.0.0.1" || h === "localhost" || h === "::1" || h === "[::1]";
}
async function importChromium() {
  let mod;
  try {
    mod = await import("playwright");
  } catch (err) {
    const e = err;
    const isMissing = e.code === "ERR_MODULE_NOT_FOUND" || e.code === "MODULE_NOT_FOUND" || /Cannot find module 'playwright'/.test(e.message ?? "");
    if (isMissing) {
      throw new SandboxError(
        "playwright is not installed (optional dependency). Install with `npm i playwright` and then `npx playwright install chromium`.",
        "PLAYWRIGHT_MISSING"
      );
    }
    throw new SandboxError(
      `failed to load playwright: ${e.message ?? String(err)}`,
      "PLAYWRIGHT_MISSING",
      { cause: e }
    );
  }
  if (typeof mod.chromium?.launch !== "function") {
    throw new SandboxError("playwright loaded but `chromium.launch` is not a function", "PLAYWRIGHT_MISSING");
  }
  return mod.chromium;
}
async function safeBrowserLaunch(opts) {
  validateLivePreviewUrl(opts.livePreviewUrl);
  const budgetMs = opts.budgetMs ?? 5e3;
  const consoleBufferSize = opts.consoleBufferSize ?? 200;
  const chromium = await importChromium();
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: [
        "--disable-extensions",
        "--no-default-browser-check",
        "--no-first-run",
        "--disable-component-extensions-with-background-pages",
        "--disable-background-networking",
        "--disable-sync",
        "--disable-translate",
        "--metrics-recording-only",
        "--mute-audio",
        "--no-pings"
      ],
      timeout: budgetMs
    });
  } catch (err) {
    const msg = err.message ?? String(err);
    if (/Executable doesn't exist|browserType\.launch/i.test(msg)) {
      throw new SandboxError(
        "chromium binary missing. Run `npx playwright install chromium` once.",
        "CHROMIUM_MISSING",
        { cause: msg }
      );
    }
    throw new SandboxError(`chromium.launch failed: ${msg}`, "LAUNCH_FAILED", {
      cause: msg
    });
  }
  const context = await browser.newContext({
    acceptDownloads: false,
    permissions: []
  });
  let blockedRequestCount = 0;
  await context.route("**/*", (route, request) => {
    let reqHost;
    try {
      reqHost = new URL(request.url()).hostname;
    } catch {
      blockedRequestCount += 1;
      void route.abort("blockedbyclient");
      return;
    }
    if (!isLoopbackHostname(reqHost)) {
      blockedRequestCount += 1;
      void route.abort("blockedbyclient");
      return;
    }
    void route.continue();
  });
  const messages = [];
  const errors = [];
  let closed = false;
  function pushRing(buf, item) {
    if (buf.length >= consoleBufferSize) {
      buf.shift();
    }
    buf.push(item);
  }
  async function newPage() {
    const page = await context.newPage();
    page.setDefaultTimeout(budgetMs);
    page.on("dialog", (dialog) => {
      void dialog.dismiss().catch(() => void 0);
    });
    page.on("download", (download) => {
      void download.cancel().catch(() => void 0);
    });
    page.on("console", (msg) => {
      pushRing(messages, {
        type: msg.type(),
        text: msg.text(),
        capturedAt: (/* @__PURE__ */ new Date()).toISOString()
      });
    });
    page.on("pageerror", (err) => {
      pushRing(errors, {
        message: err.message,
        stack: err.stack,
        capturedAt: (/* @__PURE__ */ new Date()).toISOString()
      });
    });
    return page;
  }
  async function close() {
    if (closed) return;
    closed = true;
    try {
      await context.close();
    } catch {
    }
    try {
      await browser.close();
    } catch {
    }
  }
  function drainConsole() {
    const out = { messages: messages.slice(), errors: errors.slice() };
    messages.length = 0;
    errors.length = 0;
    return out;
  }
  const handle = {
    newPage,
    close,
    get blockedRequestCount() {
      return blockedRequestCount;
    },
    drainConsole
  };
  return handle;
}
var SandboxError;
var init_sandbox = __esm({
  "src/verify/_sandbox.ts"() {
    "use strict";
    SandboxError = class extends Error {
      constructor(message, code, detail) {
        super(message);
        this.code = code;
        this.detail = detail;
        this.name = "SandboxError";
      }
      code;
      detail;
    };
  }
});

// src/verify/a11y-axe.ts
var a11y_axe_exports = {};
__export(a11y_axe_exports, {
  runA11yAxe: () => runA11yAxe
});
async function loadAxe() {
  try {
    const mod = await import("axe-core");
    if (mod.default !== void 0 && typeof mod.default.run === "function") {
      return mod.default;
    }
    return mod;
  } catch {
    return null;
  }
}
async function loadJsdom() {
  try {
    return await import("jsdom");
  } catch {
    return null;
  }
}
async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch {
    return null;
  }
}
function levelFromTags(tags) {
  let highest = "A";
  for (const t of tags) {
    if (/^wcag\d{1,2}aaa$/i.test(t)) return "AAA";
    if (/^wcag\d{1,2}aa$/i.test(t)) highest = highest === "AAA" ? "AAA" : "AA";
  }
  return highest;
}
function severityFor(level, impact) {
  if (level === "AAA") return "warn";
  if (level === "AA" && (impact === "serious" || impact === "critical")) {
    return "fail";
  }
  return "warn";
}
function mapAxeViolation(v) {
  const impact = v.impact ?? "moderate";
  const level = levelFromTags(v.tags);
  const severity = severityFor(level, impact);
  const nodes = v.nodes.map((n) => {
    const selector = n.target.length === 0 ? "" : Array.isArray(n.target[0]) ? n.target[0].join(" >>> ") : n.target[0];
    return n.html !== void 0 ? { selector, html: n.html } : { selector };
  });
  const vUnknown = v;
  const baseHelp = typeof vUnknown.help === "string" ? vUnknown.help : v.id;
  const firstSelector = nodes.length > 0 ? nodes[0]?.selector ?? "" : "";
  const message = firstSelector !== "" ? `${baseHelp} (${firstSelector}${nodes.length > 1 ? ` +${nodes.length - 1} more` : ""})` : baseHelp;
  const out = {
    ruleId: v.id,
    impact,
    level,
    severity,
    nodes,
    message
  };
  if (v.helpUrl !== void 0) out.helpUrl = v.helpUrl;
  return out;
}
async function loadSandbox() {
  try {
    return await Promise.resolve().then(() => (init_sandbox(), sandbox_exports));
  } catch {
    return null;
  }
}
async function runViaPlaywright(livePreviewUrl, axe) {
  const sandbox = await loadSandbox();
  if (sandbox === null) {
    throw new Error("sandbox not available");
  }
  const handle = await sandbox.safeBrowserLaunch({
    livePreviewUrl,
    budgetMs: A11Y_AXE_BUDGET_MS
  });
  try {
    const page = await handle.newPage();
    try {
      await page.goto(livePreviewUrl, {
        timeout: A11Y_AXE_BUDGET_MS,
        waitUntil: "domcontentloaded"
      });
      await page.addScriptTag({
        content: axe.source
      });
      const results = await page.evaluate(async () => {
        const a = globalThis.axe;
        return a.run(document, {
          runOnly: {
            type: "tag",
            values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]
          },
          // Exclude wisp's own floating-bar UI from the audit.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          exclude: [["[data-wisp-ui]"]]
        });
      });
      return results.violations.map(mapAxeViolation);
    } finally {
      try {
        await page.close();
      } catch {
      }
    }
  } finally {
    try {
      await handle.close();
    } catch {
    }
  }
}
async function runViaJsdom(html, axe) {
  const jsdomMod = await loadJsdom();
  if (jsdomMod === null) {
    throw new Error("jsdom not available \u2014 install jsdom for non-live a11y-axe");
  }
  const dom = new jsdomMod.JSDOM(html, {
    // Don't run scripts — axe is injected manually and we don't want
    // arbitrary author JS to execute.
    runScripts: "outside-only",
    pretendToBeVisual: true,
    // Suppress jsdom console noise (resource-load warnings etc.) so they
    // don't leak into the wisp-design audit output.
    virtualConsole: new jsdomMod.VirtualConsole()
    // Default `resources` (undefined) means jsdom does NOT fetch external
    // resources — <link href="cdn.tailwind..."> is silently ignored. This is
    // what we want: no network I/O, no timeout hanging on CDN fetches.
  });
  const win = dom.window;
  const spliceGlobal = (key, value) => {
    const desc = Object.getOwnPropertyDescriptor(globalThis, key);
    const prev = desc !== void 0 && "value" in desc ? desc.value : globalThis[key];
    Object.defineProperty(globalThis, key, {
      value,
      configurable: true,
      writable: true,
      enumerable: true
    });
    return prev;
  };
  const restoreGlobal = (key, value) => {
    Object.defineProperty(globalThis, key, {
      value,
      configurable: true,
      writable: true,
      enumerable: true
    });
  };
  const savedWindow = spliceGlobal("window", win);
  const savedDocument = spliceGlobal("document", win.document);
  const savedNavigator = spliceGlobal("navigator", win.navigator);
  try {
    const results = await axe.run(win.document.documentElement, {
      runOnly: {
        type: "tag",
        values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]
      }
    });
    return results.violations.map(mapAxeViolation);
  } finally {
    restoreGlobal("window", savedWindow);
    restoreGlobal("document", savedDocument);
    restoreGlobal("navigator", savedNavigator);
    try {
      dom.window.close();
    } catch {
    }
  }
}
async function runA11yAxe(opts) {
  const startedAt = Date.now();
  const axe = await loadAxe();
  if (axe === null) {
    return {
      name: "a11y-axe",
      severity: "warn",
      durationMs: Date.now() - startedAt,
      skipped: { reason: "error", detail: "axe-core import failed" }
    };
  }
  try {
    let violations;
    if (opts.livePreviewUrl !== void 0) {
      const pw = await loadPlaywright();
      if (pw !== null) {
        violations = await runViaPlaywright(opts.livePreviewUrl, axe);
      } else if (opts.html !== void 0) {
        violations = await runViaJsdom(opts.html, axe);
      } else {
        return {
          name: "a11y-axe",
          severity: "pass",
          durationMs: Date.now() - startedAt,
          skipped: {
            reason: "optional-dep-missing",
            detail: "playwright missing and no html fallback supplied"
          }
        };
      }
    } else if (opts.html !== void 0) {
      violations = await runViaJsdom(opts.html, axe);
    } else {
      return {
        name: "a11y-axe",
        severity: "warn",
        durationMs: Date.now() - startedAt,
        skipped: { reason: "error", detail: "neither html nor livePreviewUrl supplied" }
      };
    }
    const durationMs = Date.now() - startedAt;
    const severity = violations.some((v) => v.severity === "fail") ? "fail" : violations.some((v) => v.severity === "warn") ? "warn" : "pass";
    return {
      name: "a11y-axe",
      severity,
      durationMs,
      violations
    };
  } catch (err) {
    return {
      name: "a11y-axe",
      severity: "warn",
      durationMs: Date.now() - startedAt,
      skipped: {
        reason: "error",
        detail: err.message
      }
    };
  }
}
var init_a11y_axe = __esm({
  "src/verify/a11y-axe.ts"() {
    "use strict";
    init_verify();
  }
});

// src/verify/console-scan.ts
var console_scan_exports = {};
__export(console_scan_exports, {
  runConsoleScan: () => runConsoleScan
});
import { promises as fs2 } from "fs";
function scanText(text, source, cap = 50, startedIso = (/* @__PURE__ */ new Date()).toISOString()) {
  if (text === "") return [];
  const out = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    if (line === "") continue;
    if (PATTERN_RE.test(line)) {
      const trimmed = line.length > 240 ? `${line.slice(0, 239)}\u2026` : line;
      out.push({
        message: `[${source}] ${trimmed}`,
        pattern: PATTERN_SRC,
        firstSeenAt: startedIso
      });
      if (out.length >= cap) break;
    }
  }
  return out;
}
async function scanSessionLog(sessionLogPath) {
  let raw;
  try {
    raw = await fs2.readFile(sessionLogPath, "utf8");
  } catch (err) {
    const code = err.code;
    if (code === "ENOENT" || code === "ENOTDIR") return [];
    throw err;
  }
  const out = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === "") continue;
    if (PATTERN_RE.test(trimmed)) {
      let parsedTs;
      try {
        const obj = JSON.parse(trimmed);
        if (typeof obj.at === "string") parsedTs = obj.at;
      } catch {
      }
      const truncated = trimmed.length > 240 ? `${trimmed.slice(0, 239)}\u2026` : trimmed;
      out.push({
        message: `[session-log] ${truncated}`,
        pattern: PATTERN_SRC,
        firstSeenAt: parsedTs ?? (/* @__PURE__ */ new Date()).toISOString()
      });
      if (out.length >= 50) break;
    }
  }
  return out;
}
async function scanBridgePoll(bridgeUrl, token, timeoutMs) {
  const url = `${bridgeUrl.replace(/\/$/, "")}/poll?token=${encodeURIComponent(
    token
  )}&timeout=${Math.max(1e3, Math.min(timeoutMs, 1500))}&leaseMs=0`;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ac.signal });
    if (!res.ok) return [];
    const body = await res.json();
    const out = [];
    for (const ev of body.events ?? []) {
      if (ev.kind === "error") {
        out.push({
          message: `[bridge] ${ev.message ?? "(no message)"}`,
          pattern: PATTERN_SRC,
          firstSeenAt: (/* @__PURE__ */ new Date()).toISOString()
        });
      }
    }
    return out;
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}
async function runConsoleScan(opts) {
  const startedAt = Date.now();
  const budgetBase = opts.budgetStartedAt ?? startedAt;
  const aggregate = [];
  try {
    if (opts.sessionLogPath !== void 0) {
      const items = await scanSessionLog(opts.sessionLogPath);
      aggregate.push(...items);
    }
    if (opts.bridgeUrl !== void 0 && opts.token !== void 0 && Date.now() - budgetBase < CONSOLE_SCAN_BUDGET_MS - 300) {
      const items = await scanBridgePoll(
        opts.bridgeUrl,
        opts.token,
        // Reserve 300ms for the final assembly tail.
        CONSOLE_SCAN_BUDGET_MS - (Date.now() - budgetBase) - 300
      );
      aggregate.push(...items);
    }
    if (opts.cssOrHtml !== void 0) {
      const scripts = [];
      const blockRe = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
      let m;
      while ((m = blockRe.exec(opts.cssOrHtml)) !== null) {
        scripts.push(m[1] ?? "");
      }
      const text = scripts.join("\n");
      if (text !== "") {
        aggregate.push(...scanText(text, "static-script"));
      }
    }
    const noInputs = opts.sessionLogPath === void 0 && opts.bridgeUrl === void 0 && (opts.cssOrHtml === void 0 || !/<script\b/i.test(opts.cssOrHtml));
    if (noInputs && aggregate.length === 0) {
      return {
        name: "console-scan",
        severity: "pass",
        durationMs: Date.now() - startedAt,
        skipped: {
          reason: "error",
          detail: "no session log, bridge, or <script> content to scan"
        }
      };
    }
    const severity = aggregate.some((c) => SEVERE_RE.test(c.message)) ? "fail" : aggregate.length > 0 ? "warn" : "pass";
    return {
      name: "console-scan",
      severity,
      durationMs: Date.now() - startedAt,
      violations: aggregate
    };
  } catch (err) {
    return {
      name: "console-scan",
      severity: "pass",
      durationMs: Date.now() - startedAt,
      skipped: {
        reason: "error",
        detail: err.message
      }
    };
  }
}
var PATTERN_SRC, PATTERN_RE, SEVERE_RE;
var init_console_scan = __esm({
  "src/verify/console-scan.ts"() {
    "use strict";
    init_verify();
    PATTERN_SRC = "error|warn|fail|exception|uncaught|cannot read";
    PATTERN_RE = new RegExp(`(?:${PATTERN_SRC})`, "i");
    SEVERE_RE = /\b(error|exception|uncaught|cannot read)\b/i;
  }
});

// src/verify/tab-order.ts
var tab_order_exports = {};
__export(tab_order_exports, {
  runTabOrder: () => runTabOrder
});
async function loadJsdom2() {
  try {
    return await import("jsdom");
  } catch {
    return null;
  }
}
function mkTabViolation(kind, selector, message) {
  return { kind, selector, detail: message, message };
}
function detectNonzeroTabindex(doc) {
  const out = [];
  const elements = doc.querySelectorAll("[tabindex]");
  elements.forEach((el) => {
    const raw = el.getAttribute("tabindex");
    if (raw === null) return;
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) return;
    const sel = cssPathFor(el);
    out.push(
      mkTabViolation(
        "nonzero-tabindex",
        sel,
        `${sel} has tabindex=${raw} (positive) \u2014 disrupts natural tab order; use tabindex="0" or remove`
      )
    );
  });
  return out;
}
function detectMissingFocusRing(doc) {
  const css = [];
  const styles = doc.querySelectorAll("style");
  styles.forEach((s) => {
    css.push(s.textContent ?? "");
  });
  const inline = css.join("\n");
  const hasFocusVisibleRule = /:focus(-visible)?\b/.test(inline);
  const out = [];
  const elements = doc.querySelectorAll(INTERACTIVE_SELECTORS.join(","));
  elements.forEach((el) => {
    if (hasFocusVisibleRule) return;
    const sel = cssPathFor(el);
    out.push(
      mkTabViolation(
        "missing-focus-ring",
        sel,
        `${sel} has no :focus or :focus-visible rule \u2014 keyboard users will see no focus indicator`
      )
    );
  });
  return out.slice(0, 10);
}
function detectFocusTrapLeak(doc) {
  const dialogs = [];
  doc.querySelectorAll('[role="dialog"],[role="alertdialog"],dialog').forEach((d) => {
    const aria = d.getAttribute("aria-modal");
    if (d.tagName.toLowerCase() === "dialog" || aria === "true") {
      dialogs.push(d);
    }
  });
  if (dialogs.length === 0) return [];
  const out = [];
  for (const dialog of dialogs) {
    const all = doc.querySelectorAll(INTERACTIVE_SELECTORS.join(","));
    const leaks = [];
    all.forEach((el) => {
      if (dialog.contains(el)) return;
      let p = el;
      let hidden = false;
      while (p !== null) {
        if (p.getAttribute("aria-hidden") === "true" || p.hasAttribute("inert")) {
          hidden = true;
          break;
        }
        p = p.parentElement;
      }
      if (!hidden) leaks.push(el);
    });
    if (leaks.length > 0) {
      const sel = cssPathFor(dialog);
      const n = leaks.length;
      out.push(
        mkTabViolation(
          "focus-trap-leak",
          sel,
          `${sel} is an open modal but ${n} focusable element${n > 1 ? "s are" : " is"} reachable outside \u2014 tab focus escapes the trap`
        )
      );
    }
  }
  return out;
}
function cssPathFor(el) {
  if (el.id !== "") return `#${el.id}`;
  const tag = el.tagName.toLowerCase();
  const cls = el.getAttribute("class");
  if (cls !== null && cls.trim() !== "") {
    const first = cls.trim().split(/\s+/)[0];
    return `${tag}.${first}`;
  }
  return tag;
}
async function runTabOrder(opts) {
  const startedAt = Date.now();
  const jsdomMod = await loadJsdom2();
  if (jsdomMod === null) {
    return {
      name: "tab-order",
      severity: "warn",
      durationMs: Date.now() - startedAt,
      skipped: {
        reason: "error",
        detail: "jsdom not available"
      }
    };
  }
  try {
    const dom = new jsdomMod.JSDOM(opts.html);
    const doc = dom.window.document;
    const violations = [
      ...detectFocusTrapLeak(doc),
      ...detectMissingFocusRing(doc),
      ...detectNonzeroTabindex(doc)
    ];
    try {
      dom.window.close();
    } catch {
    }
    const severity = violations.length > 0 ? "warn" : "pass";
    const durationMs = Date.now() - startedAt;
    if (durationMs > TAB_ORDER_BUDGET_MS) {
    }
    return {
      name: "tab-order",
      severity,
      durationMs,
      violations
    };
  } catch (err) {
    return {
      name: "tab-order",
      severity: "warn",
      durationMs: Date.now() - startedAt,
      skipped: {
        reason: "error",
        detail: err.message
      }
    };
  }
}
var INTERACTIVE_SELECTORS;
var init_tab_order = __esm({
  "src/verify/tab-order.ts"() {
    "use strict";
    init_verify();
    INTERACTIVE_SELECTORS = [
      "a[href]",
      "button:not([disabled])",
      "input:not([disabled])",
      "select:not([disabled])",
      "textarea:not([disabled])",
      "[tabindex]",
      '[contenteditable="true"]'
    ];
  }
});

// src/verify/reduced-motion.ts
var reduced_motion_exports = {};
__export(reduced_motion_exports, {
  runReducedMotion: () => runReducedMotion
});
async function runReducedMotion(opts) {
  const startedAt = Date.now();
  const css = opts.css ?? "";
  let combined = css;
  if (opts.html !== void 0) {
    const blocks = [];
    const blockRe = /<style[^>]*>([\s\S]*?)<\/style>/gi;
    let m;
    while ((m = blockRe.exec(opts.html)) !== null) {
      blocks.push(m[1] ?? "");
    }
    if (blocks.length > 0) {
      combined = `${combined}
${blocks.join("\n")}`;
    }
  }
  if (combined === "") {
    return {
      name: "reduced-motion",
      severity: "pass",
      durationMs: Date.now() - startedAt,
      violations: []
    };
  }
  if (Date.now() - (opts.budgetStartedAt ?? startedAt) > REDUCED_MOTION_BUDGET_MS) {
    return {
      name: "reduced-motion",
      severity: "pass",
      durationMs: Date.now() - startedAt,
      skipped: { reason: "timeout" }
    };
  }
  const hasMotion = MOTION_RE.test(combined);
  const hasGuard = PREFERS_REDUCED_RE.test(combined);
  const violations = [];
  if (hasMotion && !hasGuard) {
    violations.push({
      selector: "@stylesheet",
      diffArea: 0,
      threshold: 0
    });
  }
  if (!hasGuard) {
    LONG_DURATION_RE.lastIndex = 0;
    let m;
    let hits = 0;
    while ((m = LONG_DURATION_RE.exec(combined)) !== null) {
      violations.push({
        selector: `@long-motion[${m[2] ?? "?"}s]`,
        diffArea: 1e3,
        // synthetic — represents "would-diff-a-lot"
        threshold: 50
      });
      hits += 1;
      if (hits >= 5) break;
      if (m.index === LONG_DURATION_RE.lastIndex) {
        LONG_DURATION_RE.lastIndex += 1;
      }
    }
  }
  const severity = violations.length > 0 ? "warn" : "pass";
  return {
    name: "reduced-motion",
    severity,
    durationMs: Date.now() - startedAt,
    violations
  };
}
var MOTION_RE, PREFERS_REDUCED_RE, LONG_DURATION_RE;
var init_reduced_motion = __esm({
  "src/verify/reduced-motion.ts"() {
    "use strict";
    init_verify();
    MOTION_RE = /\b(transition|animation|transform)\s*:/i;
    PREFERS_REDUCED_RE = /@media\s*\([^)]*prefers-reduced-motion\s*:\s*reduce/i;
    LONG_DURATION_RE = /\b(animation|transition)\b[^{};]*?(\b[5-9]s|\b[1-9]\d+s)\b/gi;
  }
});

// src/verify/multi-viewport.ts
var multi_viewport_exports = {};
__export(multi_viewport_exports, {
  runMultiViewport: () => runMultiViewport
});
import { promises as fs3 } from "fs";
import { dirname, join as join2, resolve as resolve2 } from "path";
async function loadPlaywright2() {
  try {
    const m = await import("playwright");
    return m;
  } catch {
    return null;
  }
}
async function chromiumInstalled(pw) {
  try {
    if (typeof pw.chromium.executablePath !== "function") return true;
    const p = pw.chromium.executablePath();
    if (p === "") return false;
    await fs3.stat(p);
    return true;
  } catch {
    return false;
  }
}
async function loadSandbox2() {
  try {
    return await Promise.resolve().then(() => (init_sandbox(), sandbox_exports));
  } catch {
    return null;
  }
}
async function inlineLaunch(pw, url) {
  const u = new URL(url);
  if (u.hostname !== "localhost" && u.hostname !== "127.0.0.1") {
    throw new Error(`multi-viewport refuses non-localhost URL: ${url}`);
  }
  const browser = await pw.chromium.launch({
    headless: true,
    args: [
      "--disable-extensions",
      "--no-default-browser-check",
      "--no-first-run"
    ]
  });
  const context = await browser.newContext();
  return {
    newPage: () => context.newPage(),
    async close() {
      try {
        await context.close();
      } catch {
      }
      try {
        await browser.close();
      } catch {
      }
    }
  };
}
async function runMultiViewport(opts) {
  const startedAt = Date.now();
  const budgetBase = opts.budgetStartedAt ?? startedAt;
  const pw = await loadPlaywright2();
  if (pw === null) {
    return {
      name: "multi-viewport",
      severity: "pass",
      durationMs: Date.now() - startedAt,
      skipped: {
        reason: "optional-dep-missing",
        detail: "playwright not installed (optional dependency)"
      }
    };
  }
  if (!await chromiumInstalled(pw)) {
    return {
      name: "multi-viewport",
      severity: "pass",
      durationMs: Date.now() - startedAt,
      skipped: {
        reason: "optional-dep-missing",
        detail: "chromium binary not found \u2014 run `npx playwright install chromium`"
      }
    };
  }
  const dest = resolve2(
    opts.projectRoot,
    ".wisp/sessions",
    opts.sessionId,
    "screenshots",
    opts.variantId
  );
  try {
    await fs3.mkdir(dest, { recursive: true });
  } catch (err) {
    return {
      name: "multi-viewport",
      severity: "warn",
      durationMs: Date.now() - startedAt,
      skipped: {
        reason: "error",
        detail: `mkdir failed: ${err.message}`
      }
    };
  }
  const sandbox = await loadSandbox2();
  let handle = null;
  try {
    handle = sandbox !== null ? await sandbox.safeBrowserLaunch({
      livePreviewUrl: opts.livePreviewUrl,
      budgetMs: MULTI_VIEWPORT_BUDGET_MS - 500
    }) : await inlineLaunch(pw, opts.livePreviewUrl);
    const screenshots = [];
    for (const vp of DEFAULT_VIEWPORTS) {
      if (Date.now() - budgetBase > MULTI_VIEWPORT_BUDGET_MS - 400) break;
      const page = await handle.newPage();
      try {
        await page.setViewportSize({ width: vp.w, height: vp.h });
        await page.goto(opts.livePreviewUrl, {
          timeout: 4e3,
          waitUntil: "domcontentloaded"
        });
        for (const scheme of DEFAULT_COLOR_SCHEMES) {
          if (Date.now() - budgetBase > MULTI_VIEWPORT_BUDGET_MS - 400) break;
          await page.emulateMedia({ colorScheme: scheme });
          const outPath = join2(dest, `${vp.label}.${scheme}.png`);
          await fs3.mkdir(dirname(outPath), { recursive: true });
          await page.screenshot({ path: outPath, fullPage: false });
          screenshots.push({
            viewport: { w: vp.w, h: vp.h, label: vp.label },
            mode: scheme,
            path: outPath
          });
        }
      } finally {
        try {
          await page.close();
        } catch {
        }
      }
    }
    return {
      name: "multi-viewport",
      // Phase 5: no automatic regression detection. We capture; Phase 6
      // compares against baselines for an actual fail/warn signal.
      severity: "pass",
      durationMs: Date.now() - startedAt,
      screenshots,
      violations: []
    };
  } catch (err) {
    return {
      name: "multi-viewport",
      severity: "warn",
      durationMs: Date.now() - startedAt,
      skipped: {
        reason: "error",
        detail: err.message
      }
    };
  } finally {
    if (handle !== null) {
      try {
        await handle.close();
      } catch {
      }
    }
  }
}
var init_multi_viewport = __esm({
  "src/verify/multi-viewport.ts"() {
    "use strict";
    init_verify();
  }
});

// src/verify/gate.ts
var gate_exports = {};
__export(gate_exports, {
  gate: () => gate,
  run: () => run,
  runAntiSlop: () => runAntiSlopDirect
});
function budgetForCheck(name, mode) {
  return CHECK_BUDGET_MS[name] * MODE_CHECK_BUDGET_MULTIPLIER[mode];
}
function runWithTimeout(name, work, budgetMs) {
  return new Promise((resolveOuter) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolveOuter({
        name,
        severity: "warn",
        durationMs: budgetMs,
        skipped: { reason: "timeout", detail: `> ${budgetMs}ms` }
      });
    }, budgetMs);
    work.then(
      (v) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolveOuter(v);
      },
      (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolveOuter({
          name,
          severity: "warn",
          durationMs: 0,
          skipped: {
            reason: "error",
            detail: err instanceof Error ? err.message : String(err)
          }
        });
      }
    );
  });
}
async function dispatchCheck(name, ctx) {
  const budgetStartedAt = Date.now();
  switch (name) {
    case "anti-slop": {
      const { runAntiSlop: runAntiSlop2, runAntiSlopOnFiles: runAntiSlopOnFiles2 } = await Promise.resolve().then(() => (init_anti_slop_linter(), anti_slop_linter_exports));
      const cssSource = ctx.cssToCheck ?? ctx.afterContent ?? ctx.beforeContent ?? "";
      if (ctx.diffSummary !== void 0 && ctx.diffSummary.files.length > 0) {
        return runAntiSlopOnFiles2(ctx.diffSummary.files, {
          mode: ctx.mode,
          projectRoot: ctx.projectRoot,
          budgetStartedAt,
          // Inner per-call budget MUST match the outer runWithTimeout budget
          // (set in run() via budgetForCheck). Both scale by mode multiplier.
          perCallBudgetMs: budgetForCheck("anti-slop", ctx.mode)
        });
      }
      return runAntiSlop2(cssSource, { mode: ctx.mode, budgetStartedAt });
    }
    case "a11y-axe": {
      const { runA11yAxe: runA11yAxe2 } = await Promise.resolve().then(() => (init_a11y_axe(), a11y_axe_exports));
      const args = { budgetStartedAt };
      if (ctx.afterContent !== void 0) args.html = ctx.afterContent;
      if (ctx.livePreviewUrl !== void 0) args.livePreviewUrl = ctx.livePreviewUrl;
      return runA11yAxe2(args);
    }
    case "console-scan": {
      const { runConsoleScan: runConsoleScan2 } = await Promise.resolve().then(() => (init_console_scan(), console_scan_exports));
      const args = { budgetStartedAt };
      if (ctx.sessionId !== void 0) {
        args.sessionLogPath = `${ctx.projectRoot}/.wisp/sessions/${ctx.sessionId}.jsonl`;
      }
      if (ctx.bridgeUrl !== void 0) args.bridgeUrl = ctx.bridgeUrl;
      if (ctx.token !== void 0) args.token = ctx.token;
      if (ctx.afterContent !== void 0) args.cssOrHtml = ctx.afterContent;
      return runConsoleScan2(args);
    }
    case "tab-order": {
      const { runTabOrder: runTabOrder2 } = await Promise.resolve().then(() => (init_tab_order(), tab_order_exports));
      const html = ctx.afterContent ?? "";
      return runTabOrder2({ html, budgetStartedAt });
    }
    case "reduced-motion": {
      const { runReducedMotion: runReducedMotion2 } = await Promise.resolve().then(() => (init_reduced_motion(), reduced_motion_exports));
      const args = {
        css: ctx.cssToCheck ?? ctx.afterContent ?? "",
        budgetStartedAt
      };
      if (ctx.afterContent !== void 0) args.html = ctx.afterContent;
      return runReducedMotion2(args);
    }
    case "multi-viewport": {
      const { runMultiViewport: runMultiViewport2 } = await Promise.resolve().then(() => (init_multi_viewport(), multi_viewport_exports));
      if (ctx.livePreviewUrl === void 0 || ctx.sessionId === void 0 || ctx.variantId === void 0) {
        return {
          name: "multi-viewport",
          severity: "warn",
          durationMs: Date.now() - budgetStartedAt,
          skipped: {
            reason: "error",
            detail: "missing livePreviewUrl / sessionId / variantId \u2014 multi-viewport requires all three"
          }
        };
      }
      return runMultiViewport2({
        livePreviewUrl: ctx.livePreviewUrl,
        sessionId: ctx.sessionId,
        variantId: ctx.variantId,
        projectRoot: ctx.projectRoot,
        budgetStartedAt
      });
    }
    default: {
      const _exhaustive = name;
      return {
        name: _exhaustive,
        severity: "pass",
        durationMs: 0,
        skipped: { reason: "error", detail: "unknown check name" }
      };
    }
  }
}
async function run(ctx) {
  const startedAt = Date.now();
  const mode = ctx.mode;
  const checks = MODE_CHECK_SETS[mode];
  const budgetMs = MODE_TIMING_BUDGET_MS[mode];
  const promises = checks.map(
    (name) => runWithTimeout(
      name,
      dispatchCheck(name, ctx),
      Math.min(budgetForCheck(name, mode), budgetMs)
    )
  );
  const settled = await Promise.allSettled(promises);
  const resolved = settled.map((s, i) => {
    if (s.status === "fulfilled") return s.value;
    return {
      name: checks[i] ?? "anti-slop",
      severity: "warn",
      durationMs: 0,
      skipped: {
        reason: "error",
        detail: s.reason instanceof Error ? s.reason.message : String(s.reason)
      }
    };
  });
  const totalMs = Date.now() - startedAt;
  const verdict = worstSeverity(resolved);
  const counts = aggregateCounts(resolved);
  const blocked = verdict === "fail" && MODE_BLOCKS_ON_FAIL[mode];
  return {
    verdict,
    mode,
    checks: resolved,
    timing: {
      totalMs,
      budgetMs,
      budgetExceeded: totalMs > budgetMs
    },
    ...counts,
    blocked
  };
}
async function runAntiSlopDirect(css, ctx) {
  const { runAntiSlop: runAntiSlop2 } = await Promise.resolve().then(() => (init_anti_slop_linter(), anti_slop_linter_exports));
  const args = {};
  if (ctx.mode !== void 0) args.mode = ctx.mode;
  return runAntiSlop2(css, args);
}
var MODE_CHECK_BUDGET_MULTIPLIER, gate;
var init_gate = __esm({
  "src/verify/gate.ts"() {
    "use strict";
    init_verify();
    MODE_CHECK_BUDGET_MULTIPLIER = {
      "stop-hook": 1,
      "live-accept": 3,
      "live-with-screenshot": 3,
      audit: 100,
      "audit-strict": 100
    };
    gate = {
      run,
      runAntiSlop: runAntiSlopDirect
    };
  }
});

// src/agent/audit.ts
init_verify();
import { execFileSync } from "child_process";
import { promises as fs4 } from "fs";
import { extname as extname2, resolve as resolve3 } from "path";

// src/agent/_helpers.ts
import { readFile } from "fs/promises";
import { resolve } from "path";

// src/contracts/bridge.ts
import { z as z2 } from "zod";
var PortLockSchema = z2.object({
  port: z2.number().int().min(31337).max(31400),
  token: z2.string().uuid(),
  pid: z2.number().int().positive(),
  startedAt: z2.string().datetime(),
  projectRoot: z2.string().min(1)
});
var ElementRectSchema = z2.object({
  x: z2.number(),
  y: z2.number(),
  w: z2.number().nonnegative(),
  h: z2.number().nonnegative()
});
var ElementTargetSchema = z2.object({
  selector: z2.string().min(1),
  rect: ElementRectSchema,
  tag: z2.string().min(1)
});
var sessionId = z2.string().min(1);
var AnnotationKindSchema = z2.enum([
  "padding",
  "color",
  "size",
  "content",
  "other"
]);
var StructuredAnnotationSchema = z2.object({
  kind: AnnotationKindSchema,
  note: z2.string().min(1).max(2e3)
});
var VariantSchema = z2.object({
  id: z2.string().min(1),
  css: z2.string(),
  rationale: z2.string().min(1).max(280),
  // Phase 7.18 — optional replacement markup for 1:1 reference fidelity.
  // Rendered (sanitised) INSTEAD of the cloned target inside the variant
  // host; `css` still applies via @scope. Pure-CSS variants omit it.
  html: z2.string().min(1).max(3e4).optional()
});
var PickEventSchema = z2.object({
  kind: z2.literal("pick"),
  target: ElementTargetSchema,
  sessionId
});
var ConfigureEventSchema = z2.object({
  kind: z2.literal("configure"),
  target: ElementTargetSchema,
  freeText: z2.string().min(1).max(4e3),
  sessionId
});
var GeneratingEventSchema = z2.object({
  kind: z2.literal("generating"),
  target: ElementTargetSchema,
  // Phase 7.17 — may be empty when `codeSnippet` carries the whole intent
  // (snippet-only generate). The UI enforces text-or-snippet; a zod .refine
  // is not possible here (discriminatedUnion requires plain ZodObject).
  freeText: z2.string().max(4e3),
  // Phase 7.17 — pasted design-reference code from the snippet popup. The
  // agent ports it to the project's stack; it never reaches the DOM raw.
  codeSnippet: z2.string().min(1).max(2e4).optional(),
  variantCount: z2.number().int().min(1).max(8),
  // Phase 7.15 — deviation tells the agent how far variants should drift
  // from the original design. 1 = subtle (typography weight, light spacing
  // tweaks), 3 = balanced (mix of axes, the previous default behavior),
  // 5 = radical (reimagined layout/structure/color, may break conventions).
  // Optional so older clients / scripted POSTs keep working at the default.
  deviation: z2.number().int().min(1).max(5).optional(),
  sessionId
});
var CyclingEventSchema = z2.object({
  kind: z2.literal("cycling"),
  target: ElementTargetSchema,
  variants: z2.array(VariantSchema).min(1).max(8),
  activeIndex: z2.number().int().nonnegative(),
  sessionId
});
var ParameterChangeEventSchema = z2.object({
  kind: z2.literal("parameter-change"),
  target: ElementTargetSchema,
  varName: z2.string().min(1),
  value: z2.string(),
  sessionId
});
var AcceptEventSchema = z2.object({
  kind: z2.literal("accept"),
  target: ElementTargetSchema,
  variantId: z2.string().min(1),
  sessionId,
  // Phase 7.8 — Browser includes the accepted variant's CSS so the in-process
  // accept handler can splice it into source without regenerating from a stub.
  // Optional for back-compat: older browsers / tests omit this and the handler
  // falls back to stub regeneration.
  variantCss: z2.string().optional(),
  rationale: z2.string().optional(),
  // Phase 7.18 — replacement markup of an accepted html variant.
  variantHtml: z2.string().optional()
});
var DiscardEventSchema = z2.object({
  kind: z2.literal("discard"),
  target: ElementTargetSchema,
  sessionId
});
var AnnotationEventSchema = z2.object({
  kind: z2.literal("annotation"),
  target: ElementTargetSchema,
  annotation: StructuredAnnotationSchema,
  sessionId
});
var ErrorEventSchema = z2.object({
  kind: z2.literal("error"),
  message: z2.string().min(1),
  code: z2.string().optional(),
  sessionId: sessionId.optional()
});
var HeartbeatEventSchema = z2.object({
  kind: z2.literal("heartbeat"),
  at: z2.string().datetime()
});
var BridgeEventSchema = z2.discriminatedUnion("kind", [
  PickEventSchema,
  ConfigureEventSchema,
  GeneratingEventSchema,
  CyclingEventSchema,
  ParameterChangeEventSchema,
  AcceptEventSchema,
  DiscardEventSchema,
  AnnotationEventSchema,
  ErrorEventSchema,
  HeartbeatEventSchema
]);
var LONG_POLL_CAP_MS = 27e4;
var LONG_POLL_MIN_TIMEOUT_MS = 1e3;
var LongPollRequestSchema = z2.object({
  token: z2.string().uuid(),
  timeout: z2.number().int().min(LONG_POLL_MIN_TIMEOUT_MS).optional(),
  leaseMs: z2.number().int().min(1e3).optional(),
  cursor: z2.string().optional()
}).refine(
  (v) => v.timeout === void 0 || v.timeout <= LONG_POLL_CAP_MS,
  {
    message: `timeout must be <= ${LONG_POLL_CAP_MS}ms (Node fetch header cap is 300_000ms)`,
    path: ["timeout"]
  }
);
var LongPollResponseSchema = z2.object({
  events: z2.array(BridgeEventSchema),
  cursor: z2.string(),
  // Server-wall-clock at which it sliced the response. Lets the agent measure
  // drift against its own local clock when budgeting the next slice.
  slicedAt: z2.number().int().nonnegative()
});
var BridgeHttpErrorSchema = z2.object({
  error: z2.object({
    code: z2.string().min(1),
    message: z2.string().min(1),
    detail: z2.unknown().optional()
  })
});
var BridgeStatusSchema = z2.object({
  port: z2.number().int().positive(),
  startedAt: z2.string().datetime(),
  uptimeMs: z2.number().int().nonnegative(),
  sessionId: z2.string().min(1),
  pendingEvents: z2.number().int().nonnegative(),
  connectedSseClients: z2.number().int().nonnegative(),
  projectRoot: z2.string().min(1)
});
var BridgeHealthSchema = z2.object({
  ok: z2.literal(true),
  version: z2.string().min(1)
});

// src/agent/_helpers.ts
function parseFlags(args) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < args.length; i += 1) {
    const token = args[i];
    if (!token.startsWith("--")) {
      positional.push(token);
      continue;
    }
    const key = token.slice(2);
    if (key.startsWith("no-")) {
      flags[key.slice(3)] = false;
      continue;
    }
    const next = args[i + 1];
    if (next === void 0 || next.startsWith("--")) {
      flags[key] = true;
      continue;
    }
    flags[key] = next;
    i += 1;
  }
  return { flags, positional };
}
function flagAsString(parsed, key) {
  const v = parsed.flags[key];
  if (typeof v === "string") return v;
  return void 0;
}
function flagAsBoolean(parsed, key, defaultValue) {
  const v = parsed.flags[key];
  if (typeof v === "boolean") return v;
  return defaultValue;
}
function writeError(err) {
  process.stderr.write(`${JSON.stringify({ error: err })}
`);
}
var EXIT_OK = 0;
var EXIT_IO = 1;
var EXIT_ARG = 2;

// src/agent/audit.ts
var EXIT_GATE = 3;
var UI_EXTENSIONS2 = /* @__PURE__ */ new Set([
  ".tsx",
  ".jsx",
  ".ts",
  ".js",
  ".vue",
  ".svelte",
  ".astro",
  ".html",
  ".htm",
  ".css",
  ".scss",
  ".sass"
]);
function modeFor(opts) {
  if (opts.mode === "strict") return "audit-strict";
  if (opts.mode === "full") {
    return opts.screenshotEnabled ? "live-with-screenshot" : "audit";
  }
  return "stop-hook";
}
function gitChangedFiles(cwd, cap = 50) {
  const run2 = (args) => {
    try {
      const raw = execFileSync("git", args, {
        cwd,
        encoding: "utf8",
        timeout: 3e3
      });
      return raw.split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== "");
    } catch {
      return [];
    }
  };
  const tracked = run2(["diff", "HEAD", "--name-only"]);
  const untracked = run2(["ls-files", "--others", "--exclude-standard"]);
  return [.../* @__PURE__ */ new Set([...tracked, ...untracked])].slice(0, cap);
}
function filterUiFiles(files) {
  return files.filter((f) => UI_EXTENSIONS2.has(extname2(f).toLowerCase()));
}
function renderText(reports) {
  if (reports.length === 0) return "wisp-design audit: nothing to check.\n";
  const lines = [];
  for (const r of reports) {
    lines.push(`mode=${r.mode}  verdict=${r.verdict}  blocked=${r.blocked}`);
    lines.push(
      `  checks: ${r.checks.length}   hard-bans: ${r.hardBanCount}   a11y-fails: ${r.a11yFailCount}   warns: ${r.warningCount}`
    );
    lines.push(
      `  timing: ${r.timing.totalMs}ms / ${r.timing.budgetMs}ms${r.timing.budgetExceeded ? "  (over-budget)" : ""}`
    );
    for (const c of r.checks) {
      const skip = c.skipped !== void 0 ? `  [skipped: ${c.skipped.reason}]` : "";
      const violations = c.violations?.length ?? 0;
      lines.push(`    \u2022 ${c.name}: ${c.severity}   ${c.durationMs}ms${skip}   violations=${violations}`);
      if (c.violations !== void 0) {
        for (const v of c.violations.slice(0, 3)) {
          const messageField = "message" in v && typeof v.message === "string" ? v.message : "";
          const ruleField = "ruleId" in v && typeof v.ruleId === "string" ? v.ruleId : c.name;
          lines.push(`        - ${ruleField}: ${messageField}`);
        }
        if (c.violations.length > 3) {
          lines.push(`        - \u2026and ${c.violations.length - 3} more.`);
        }
      }
    }
    lines.push("");
  }
  return `${lines.join("\n")}
`;
}
function renderMarkdown(reports) {
  if (reports.length === 0) return "_wisp-design audit: nothing to check._\n";
  const lines = [
    "## wisp-design audit",
    "",
    "| mode | verdict | blocked | hard-bans | a11y-fails | warns | timing |",
    "|---|---|---|---|---|---|---|"
  ];
  for (const r of reports) {
    lines.push(
      `| ${r.mode} | ${r.verdict} | ${r.blocked} | ${r.hardBanCount} | ${r.a11yFailCount} | ${r.warningCount} | ${r.timing.totalMs}ms / ${r.timing.budgetMs}ms |`
    );
  }
  lines.push("");
  for (const r of reports) {
    lines.push(`### ${r.mode}`);
    for (const c of r.checks) {
      const skip = c.skipped !== void 0 ? ` *(skipped: ${c.skipped.reason})*` : "";
      lines.push(`- **${c.name}** \u2014 ${c.severity}, ${c.durationMs}ms${skip}`);
      if (c.violations !== void 0 && c.violations.length > 0) {
        for (const v of c.violations.slice(0, 5)) {
          const messageField = "message" in v && typeof v.message === "string" ? v.message : "";
          lines.push(`  - ${messageField}`);
        }
      }
    }
    lines.push("");
  }
  return `${lines.join("\n")}
`;
}
function renderJson(reports) {
  return `${JSON.stringify(reports, null, 2)}
`;
}
async function runAudit(args) {
  const parsed = parseFlags(args);
  const rawMode = flagAsString(parsed, "mode") ?? "fast";
  const rawFormat = flagAsString(parsed, "format") ?? "text";
  const screenshotEnabled = flagAsBoolean(parsed, "screenshot", false);
  const failOnWarn = flagAsBoolean(parsed, "fail-on-warn", false);
  const parseResult = AuditOptionsSchema.safeParse({
    mode: rawMode,
    outputFormat: rawFormat,
    screenshotEnabled,
    failOnWarn,
    paths: parsed.positional
  });
  if (!parseResult.success) {
    writeError({
      code: "BAD_FLAG",
      message: `audit: ${parseResult.error.issues.map((i) => `${i.path.join(".") || "<root>"}: ${i.message}`).join("; ")}`
    });
    return EXIT_ARG;
  }
  const opts = parseResult.data;
  const projectRoot = process.cwd();
  let files;
  if (opts.paths.length > 0) {
    files = opts.paths.map((p) => resolve3(projectRoot, p));
  } else {
    files = filterUiFiles(gitChangedFiles(projectRoot)).map(
      (p) => resolve3(projectRoot, p)
    );
  }
  if (files.length === 0) {
    const out = opts.outputFormat === "json" ? renderJson([]) : opts.outputFormat === "markdown" ? renderMarkdown([]) : renderText([]);
    process.stdout.write(out);
    return EXIT_OK;
  }
  const mode = modeFor({
    mode: opts.mode,
    screenshotEnabled: opts.screenshotEnabled
  });
  let gate2;
  try {
    gate2 = await Promise.resolve().then(() => (init_gate(), gate_exports));
  } catch (err) {
    writeError({
      code: "GATE_LOAD_FAILED",
      message: `audit: failed to load verify-gate module: ${err.message}`
    });
    return EXIT_GATE;
  }
  const reports = [];
  let hadHardReadError = false;
  for (const filePath of files) {
    let content = "";
    try {
      content = await fs4.readFile(filePath, "utf8");
    } catch (err) {
      const code = err.code;
      if (code === "EISDIR") {
        hadHardReadError = true;
        writeError({
          code: "EISDIR",
          message: `audit: '${filePath}' is a directory \u2014 audit takes file paths only. Pass explicit files (e.g. 'audit src/*.tsx') or run without args to fall back to changed-files mode.`
        });
      } else if (code !== "ENOENT" && code !== "ENOTDIR") {
        hadHardReadError = true;
        writeError({
          code: "READ_FAILED",
          message: `audit: failed to read ${filePath}: ${err.message}`
        });
      }
      continue;
    }
    const ctx = {
      mode,
      filePath,
      projectRoot,
      afterContent: content,
      cssToCheck: content,
      diffSummary: { added: 0, removed: 0, files: [filePath] }
    };
    try {
      const report = await gate2.run(ctx);
      reports.push(report);
    } catch (err) {
      writeError({
        code: "GATE_THREW",
        message: `audit: gate.run threw on ${filePath}: ${err.message}`
      });
      return EXIT_GATE;
    }
  }
  const rendered = opts.outputFormat === "json" ? renderJson(reports) : opts.outputFormat === "markdown" ? renderMarkdown(reports) : renderText(reports);
  process.stdout.write(rendered);
  const anyBlocked = reports.some((r) => r.blocked);
  if (anyBlocked) return 1;
  if (opts.failOnWarn) {
    const anyWarn = reports.some((r) => r.verdict === "warn" || r.verdict === "fail");
    if (anyWarn) return 1;
  }
  if (hadHardReadError) return EXIT_IO;
  return EXIT_OK;
}
export {
  runAudit
};
//# sourceMappingURL=audit.js.map