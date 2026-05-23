#!/usr/bin/env node

// src/verify/anti-slop-linter.ts
import { promises as fs } from "fs";
import { extname } from "path";

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
var ROUND_NUMBER_WHITESPACE_MIN_TOTAL = 4;
var ROUND_NUMBER_WHITESPACE_RATIO_THRESHOLD = 0.7;
var ROUND_NUMBER_VALUES = /* @__PURE__ */ new Set(["16", "24", "32", "48"]);
var ANY_SPACING_DECL_RE = /(padding|margin|gap)\s*:\s*(\d+)px(?![0-9])/g;
function aggregateRoundNumberWhitespace(content) {
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
var RULES = [
  // ── Hard-bans ────────────────────────────────────────────────────────────
  {
    id: "em-dash-ui",
    severity: "fail",
    // `—` or `–` inside a quoted CSS `content:` string, or inside JSX text
    // adjacent to a button/heading. Cheapest detection: any em-dash in a
    // string literal at all — UI code rarely embeds em-dashes legitimately.
    pattern: /(content\s*:\s*['"][^'"]*[—–][^'"]*['"])|(>\s*[^<\n]*[—–][^<\n]*<\s*\/(button|h[1-6]|label|a)\b)/gi,
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
    // Catches the most common AI vibe; we lean on the named-colour set + the
    // canonical Tailwind hexes.
    pattern: /linear-gradient\([^)]*(?:#5b21b6|#6d28d9|#7c3aed|#8b5cf6|#a855f7|#c084fc|purple|violet)[^)]*(?:#1d4ed8|#2563eb|#3b82f6|#60a5fa|#93c5fd|blue|indigo)[^)]*\)/gi,
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
    pattern: /color\s*:\s*(#3b82f6|rgb\(\s*59\s*,\s*130\s*,\s*246\s*\)|var\(--tw-blue-500\)|var\(--color-blue-500\))/g,
    message: "default Tailwind blue (#3b82f6) used directly \u2014 single most over-used AI brand colour.",
    suggestedFix: "Use a project-defined accent OKLch with stated chroma, or pull from `.wisp/brand-spec.json`."
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
var FONT_WEIGHT_RE = /font-weight\s*:\s*([1-9]\d{2}|normal|bold|lighter|bolder)/gi;
function analyseFontWeights(content) {
  const found = /* @__PURE__ */ new Set();
  let m;
  FONT_WEIGHT_RE.lastIndex = 0;
  while ((m = FONT_WEIGHT_RE.exec(content)) !== null) {
    const value = (m[1] ?? "").toLowerCase();
    if (value === "normal") found.add("400");
    else if (value === "bold") found.add("700");
    else if (value === "lighter" || value === "bolder") found.add(value);
    else found.add(value);
    if (found.size >= 2) return null;
  }
  if (found.size === 1) {
    const rule = RULES_BY_ID.get("single-weight-typography");
    if (rule === void 0) return null;
    return {
      ruleId: rule.id,
      severity: rule.severity,
      message: rule.message,
      suggestedFix: rule.suggestedFix,
      location: { cssSnippet: `font-weight: ${Array.from(found)[0] ?? ""}` }
    };
  }
  return null;
}
async function runAntiSlop(css, ctx) {
  const startedAt = Date.now();
  const violations = [];
  for (const rule of RULES) {
    if (rule.id === "single-weight-typography") continue;
    if (rule.aggregator !== void 0) {
      const aggregated = rule.aggregator(css);
      for (const v of aggregated) violations.push(v);
      if (ctx?.budgetStartedAt !== void 0 && Date.now() - ctx.budgetStartedAt > ANTI_SLOP_LINTER_BUDGET_MS) {
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
    if (ctx?.budgetStartedAt !== void 0 && Date.now() - ctx.budgetStartedAt > ANTI_SLOP_LINTER_BUDGET_MS) {
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
async function runAntiSlopOnFiles(files, opts) {
  const startedAt = Date.now();
  const budgetBase = opts.budgetStartedAt ?? startedAt;
  const budgetMs = opts.perCallBudgetMs ?? ANTI_SLOP_LINTER_BUDGET_MS;
  const violations = [];
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
      budgetStartedAt: budgetBase
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
  runAntiSlop,
  runAntiSlopOnFiles
};
//# sourceMappingURL=anti-slop-linter.js.map