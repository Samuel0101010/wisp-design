#!/usr/bin/env node

// src/verify/anti-slop-linter.ts
import { promises as fs } from "fs";
import { extname, join } from "path";

// src/contracts/verify.ts
import { z } from "zod";
var VerifyModeSchema = z.enum([
  "stop-hook",
  "live-accept",
  "live-with-screenshot",
  "audit",
  "audit-strict"
]);
var SeveritySchema = z.enum(["pass", "warn", "fail"]);
var CheckNameSchema = z.enum([
  "anti-slop",
  "a11y-axe",
  "console-scan",
  "tab-order",
  "reduced-motion",
  "multi-viewport"
]);
var AntiSlopRuleIdSchema = z.enum([
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
var HARD_BAN_RULES = /* @__PURE__ */ new Set([
  "em-dash-ui",
  "gradient-text-headline",
  "default-glassmorphism",
  "hero-metric-template",
  "side-stripe-decoration",
  "purple-blue-gradient",
  "generic-ai-illustration"
]);
var AuditOptionsSchema = z.object({
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
var ANTI_SLOP_LINTER_BUDGET_MS = 50;

// src/verify/anti-slop-linter.ts
var CLASS_ATTR_RE = /\b(?:className|class)\s*=\s*"([^"]*)"/g;
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
var ROUND_NUMBER_WHITESPACE_MIN_TOTAL = 4;
var ROUND_NUMBER_WHITESPACE_RATIO_THRESHOLD = 0.7;
var ROUND_NUMBER_VALUES = /* @__PURE__ */ new Set(["16", "24", "32", "48"]);
var ANY_SPACING_DECL_RE = /(padding|margin|gap)\s*:\s*(\d+)px(?![0-9])/g;
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
var DEFAULT_BLUE_CSS_RE = /(color|background-color|border-color|fill|stroke)\s*:\s*(#3b82f6|rgb\(\s*59\s*,\s*130\s*,\s*246\s*\)|var\(--tw-blue-500\)|var\(--color-blue-500\))/gi;
var DEFAULT_BLUE_TW_CLASS_RE = /\b(bg|text|border)-blue-(500|600|700)\b/;
function normalizeBlueValue(value) {
  const v = value.toLowerCase().trim();
  if (v === "#3b82f6") return "#3b82f6";
  if (/^rgb\(\s*59\s*,\s*130\s*,\s*246\s*\)$/.test(v)) return "#3b82f6";
  if (v === "var(--tw-blue-500)" || v === "var(--color-blue-500)") return v;
  return v;
}
var DEFAULT_BLUE_MIN_OCCURRENCES = 2;
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
var RULES = [
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
var RULES_BY_ID = new Map(
  RULES.map((r) => [r.id, r])
);
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
var TEXT_TAG_RE = /(^|[\s,>+~])(h[1-6]|p|span|a|button|label|li|blockquote|code|td|th|strong|em|small|figcaption|caption)\b/;
var TEXT_DECL_RE = /(?:^|[\s;{])(font-family|font-size|line-height|letter-spacing|color|text-[a-z-]+)\s*:/i;
var ICON_HINT_RE = /\.(icon|sr-only|visually-hidden|svg|chev|caret|spinner)\b|\[aria-hidden\b/;
function blockIsTextBearing(block) {
  if (TEXT_DECL_RE.test(block.body)) return true;
  if (TEXT_TAG_RE.test(block.selector) && !ICON_HINT_RE.test(block.selector)) return true;
  return false;
}
var FONT_WEIGHT_RE = /font-weight\s*:\s*([1-9]\d{2}|normal|bold|lighter|bolder)/gi;
var MIN_SINGLE_WEIGHT_OCCURRENCES = 2;
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
var STYLE_BLOCK_RE = /<style[^>]*>([\s\S]*?)<\/style>/gi;
var JSX_INLINE_STYLE_RE = /\bstyle\s*=\s*\{\{([\s\S]*?)\}\}/g;
var INLINE_STYLE_ATTR_RE = /\bstyle\s*=\s*"([^"]*)"/g;
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
var UI_EXTENSIONS = /* @__PURE__ */ new Set([
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
export {
  extractCssFromFile,
  formatBlockMessage,
  formatWarnMessage,
  loadBrandColors,
  runAntiSlop,
  runAntiSlopOnFiles
};
//# sourceMappingURL=anti-slop-linter.js.map