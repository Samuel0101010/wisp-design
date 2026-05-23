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
var VerifyModeSchema, SeveritySchema, CheckNameSchema, AntiSlopRuleIdSchema, HARD_BAN_RULES, AuditOptionsSchema, ANTI_SLOP_LINTER_BUDGET_MS, STOP_HOOK_HARD_LIMIT_MS;
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
    STOP_HOOK_HARD_LIMIT_MS = 100;
  }
});

// src/verify/anti-slop-linter.ts
var anti_slop_linter_exports = {};
__export(anti_slop_linter_exports, {
  extractCssFromFile: () => extractCssFromFile,
  formatBlockMessage: () => formatBlockMessage,
  formatWarnMessage: () => formatWarnMessage,
  runAntiSlop: () => runAntiSlop,
  runAntiSlopOnFiles: () => runAntiSlopOnFiles
});
import { promises as fs } from "fs";
import { extname } from "path";
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
var RULES, RULES_BY_ID, FONT_WEIGHT_RE, STYLE_BLOCK_RE, JSX_INLINE_STYLE_RE, INLINE_STYLE_ATTR_RE, UI_EXTENSIONS;
var init_anti_slop_linter = __esm({
  "src/verify/anti-slop-linter.ts"() {
    "use strict";
    init_verify();
    RULES = [
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
        // We flag each occurrence; aggregator counts at file level.
        pattern: /(padding|margin|gap)\s*:\s*(16|24|32|48)px(?![0-9])/g,
        message: "round-number whitespace (16/24/32/48px) \u2014 reads as Tailwind-default.",
        suggestedFix: "Mix nearby steps (18/22/26/50) within a 4px grid to add considered rhythm."
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
    RULES_BY_ID = new Map(
      RULES.map((r) => [r.id, r])
    );
    FONT_WEIGHT_RE = /font-weight\s*:\s*([1-9]\d{2}|normal|bold|lighter|bolder)/gi;
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

// src/index.ts
import { readFileSync as readFileSync2 } from "fs";

// src/cli/doctor.ts
import { existsSync, readFileSync, statSync } from "fs";
import { resolve } from "path";
function ok(label, detail) {
  return detail !== void 0 ? { label, status: "ok", detail } : { label, status: "ok" };
}
function warn(label, detail) {
  return { label, status: "warn", detail };
}
function fail(label, detail) {
  return { label, status: "fail", detail };
}
function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}
function isPlainObject(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function checkPluginJson(cwd) {
  const path = resolve(cwd, ".claude-plugin/plugin.json");
  if (!existsSync(path)) return fail(".claude-plugin/plugin.json", "missing");
  try {
    const data = readJson(path);
    if (!isPlainObject(data)) return fail(".claude-plugin/plugin.json", "not a JSON object");
    if (typeof data.name !== "string") return fail(".claude-plugin/plugin.json", "name missing");
    if (typeof data.version !== "string") return fail(".claude-plugin/plugin.json", "version missing");
    if (data.repository !== void 0 && typeof data.repository !== "string") {
      return fail(
        ".claude-plugin/plugin.json",
        "repository must be a STRING (npm-style { type, url } breaks /plugin install)"
      );
    }
    return ok(".claude-plugin/plugin.json", `${data.name} v${data.version}`);
  } catch (err) {
    return fail(".claude-plugin/plugin.json", `parse error \u2014 ${err.message}`);
  }
}
function checkMarketplaceJson(cwd) {
  const path = resolve(cwd, ".claude-plugin/marketplace.json");
  if (!existsSync(path)) return fail(".claude-plugin/marketplace.json", "missing");
  try {
    const data = readJson(path);
    if (!isPlainObject(data)) return fail(".claude-plugin/marketplace.json", "not a JSON object");
    const plugins = data.plugins;
    if (!Array.isArray(plugins) || plugins.length === 0) {
      return fail(".claude-plugin/marketplace.json", "plugins[] missing or empty");
    }
    const first = plugins[0];
    if (!isPlainObject(first)) return fail(".claude-plugin/marketplace.json", "plugins[0] not object");
    const source = first.source;
    if (!isPlainObject(source)) {
      return fail(
        ".claude-plugin/marketplace.json",
        "plugins[0].source must be an OBJECT { source: 'github', repo: '\u2026' }, not a string"
      );
    }
    return ok(".claude-plugin/marketplace.json", `${plugins.length} plugin(s)`);
  } catch (err) {
    return fail(".claude-plugin/marketplace.json", `parse error \u2014 ${err.message}`);
  }
}
function checkHooksJson(cwd) {
  const path = resolve(cwd, "hooks/hooks.json");
  if (!existsSync(path)) return fail("hooks/hooks.json", "missing");
  try {
    const data = readJson(path);
    if (!isPlainObject(data)) return fail("hooks/hooks.json", "not a JSON object");
    const hooks = data.hooks;
    if (!isPlainObject(hooks)) {
      return fail("hooks/hooks.json", "top-level `hooks` key missing (Layer 1)");
    }
    const events = Object.keys(hooks);
    if (events.length === 0) return fail("hooks/hooks.json", "no hook events defined");
    for (const event of events) {
      const arr = hooks[event];
      if (!Array.isArray(arr)) {
        return fail(
          "hooks/hooks.json",
          `hooks.${event} must be an ARRAY of matcher envelopes (Layer 2)`
        );
      }
      for (const envelope of arr) {
        if (!isPlainObject(envelope) || !Array.isArray(envelope.hooks)) {
          return fail(
            "hooks/hooks.json",
            `hooks.${event}[].hooks must be an array of { type, command } (Layer 3)`
          );
        }
      }
    }
    return ok("hooks/hooks.json", `${events.length} event(s): ${events.join(", ")}`);
  } catch (err) {
    return fail("hooks/hooks.json", `parse error \u2014 ${err.message}`);
  }
}
function checkCommand(cwd) {
  const path = resolve(cwd, "commands/wisp-design.md");
  if (!existsSync(path)) return fail("commands/wisp-design.md", "missing");
  const content = readFileSync(path, "utf8");
  if (!content.startsWith("---")) {
    return warn("commands/wisp-design.md", "no frontmatter \u2014 Claude Code may treat as plain MD");
  }
  return ok("commands/wisp-design.md");
}
function checkLicense(cwd) {
  const path = resolve(cwd, "LICENSE");
  if (!existsSync(path)) return fail("LICENSE", "missing");
  const content = readFileSync(path, "utf8");
  if (!/MIT License/i.test(content)) {
    return warn("LICENSE", "not MIT \u2014 wisp-design ships MIT (Stagewise's AGPL is the anti-pattern)");
  }
  return ok("LICENSE", "MIT");
}
function checkDist(cwd) {
  const path = resolve(cwd, "dist/index.js");
  if (!existsSync(path)) {
    return fail("dist/index.js", "missing \u2014 run `npm run build` and commit dist/ (plugin clones have no build step)");
  }
  const size = statSync(path).size;
  return ok("dist/index.js", `${(size / 1024).toFixed(1)} kB`);
}
function checkSkillsLayout(cwd) {
  const root = resolve(cwd, "skills");
  if (!existsSync(root)) {
    return warn("skills/", "missing \u2014 Phase 4 corpus not yet committed");
  }
  const expectedDirs = [
    "wisp-design",
    "reference",
    "policy",
    "methodology",
    "data"
  ];
  const missing = [];
  for (const d of expectedDirs) {
    if (!existsSync(resolve(root, d))) missing.push(d);
  }
  if (missing.length > 0) {
    return warn("skills/", `missing sub-dirs: ${missing.join(", ")}`);
  }
  return ok("skills/", `${expectedDirs.length} sub-dirs present`);
}
function checkSkillManifest(cwd) {
  const path = resolve(cwd, "skills/wisp-design/SKILL.md");
  if (!existsSync(path)) {
    return warn(
      "skills/wisp-design/SKILL.md",
      "missing \u2014 Phase 4 auto-trigger skill not yet committed"
    );
  }
  return ok("skills/wisp-design/SKILL.md");
}
function checkNodeVersion() {
  const major = Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10);
  if (Number.isNaN(major) || major < 20) {
    return fail("node version", `>=20 required, found ${process.versions.node}`);
  }
  return ok("node version", `v${process.versions.node}`);
}
function checkVerifyDep(cwd, pkg, optional) {
  const path = resolve(cwd, "node_modules", pkg, "package.json");
  if (existsSync(path)) {
    try {
      const meta = readJson(path);
      const v = isPlainObject(meta) && typeof meta.version === "string" ? meta.version : "?";
      return ok(`node_modules/${pkg}`, `v${v}`);
    } catch {
      return ok(`node_modules/${pkg}`, "installed");
    }
  }
  if (optional) {
    const label = pkg === "playwright" ? "multi-viewport screenshots disabled" : "reduced-motion pixel-diff disabled";
    return warn(`node_modules/${pkg}`, `optional dep missing \u2014 ${label}`);
  }
  return fail(`node_modules/${pkg}`, "missing (required for Phase 5 a11y-axe check)");
}
async function runDoctor(opts) {
  void opts.fix;
  const checks = [
    checkNodeVersion(),
    checkPluginJson(opts.cwd),
    checkMarketplaceJson(opts.cwd),
    checkHooksJson(opts.cwd),
    checkCommand(opts.cwd),
    checkLicense(opts.cwd),
    checkDist(opts.cwd),
    checkSkillsLayout(opts.cwd),
    checkSkillManifest(opts.cwd),
    // Phase 5 verify-gate deps.
    checkVerifyDep(opts.cwd, "axe-core", false),
    checkVerifyDep(opts.cwd, "playwright", true),
    checkVerifyDep(opts.cwd, "pixelmatch", true)
  ];
  const hasFail = checks.some((c) => c.status === "fail");
  return { checks, exitCode: hasFail ? 1 : 0 };
}

// src/hooks/dispatcher.ts
init_verify();
import { execFileSync } from "child_process";
import { extname as extname2 } from "path";
var STOP_HOOK_UI_EXTENSIONS = /* @__PURE__ */ new Set([
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
function stopHookGitChangedFiles() {
  try {
    const raw = execFileSync("git", ["diff", "HEAD", "--name-only"], {
      cwd: process.cwd(),
      encoding: "utf8",
      // STOP_HOOK_HARD_LIMIT_MS is 100ms; we give git a quarter of the
      // budget. On a healthy repo this returns in 1-2ms.
      timeout: Math.max(20, Math.floor(STOP_HOOK_HARD_LIMIT_MS / 4))
    });
    return raw.split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== "").filter((p) => STOP_HOOK_UI_EXTENSIONS.has(extname2(p).toLowerCase())).slice(0, 50);
  } catch {
    return [];
  }
}
var STOP_HOOK_TAIL_RESERVE_MS = 15;
async function drainStdin() {
  if (process.stdin.isTTY) return "";
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}
function budgetExceeded(startedAt) {
  return Date.now() - startedAt > STOP_HOOK_HARD_LIMIT_MS - STOP_HOOK_TAIL_RESERVE_MS;
}
async function runStopHook() {
  const started = Date.now();
  try {
    await drainStdin().catch(() => "");
    if (budgetExceeded(started)) return 0;
    const changedFiles = stopHookGitChangedFiles();
    if (changedFiles.length === 0) return 0;
    if (budgetExceeded(started)) return 0;
    const { runAntiSlopOnFiles: runAntiSlopOnFiles2, formatBlockMessage: formatBlockMessage2, formatWarnMessage: formatWarnMessage2 } = await Promise.resolve().then(() => (init_anti_slop_linter(), anti_slop_linter_exports));
    const result = await runAntiSlopOnFiles2(changedFiles, {
      mode: "stop-hook",
      projectRoot: process.cwd(),
      budgetStartedAt: started
    });
    const hardBanHits = result.violations === void 0 ? [] : result.violations.filter(
      (v) => v.severity === "fail"
    );
    if (hardBanHits.length === 0) return 0;
    if (process.env.WISP_DESIGN_STRICT === "1") {
      const payload = JSON.stringify({
        permissionDecision: "block",
        message: formatBlockMessage2(hardBanHits)
      });
      process.stdout.write(`${payload}
`);
      return 0;
    }
    process.stderr.write(`${formatWarnMessage2(hardBanHits)}
`);
    return 0;
  } catch {
    return 0;
  }
}
async function runHook(name) {
  switch (name) {
    case "stop":
      return runStopHook();
    case "user-prompt-submit":
    case "post-tool-use":
    case "session-end":
      await drainStdin().catch(() => "");
      return 0;
    default:
      await drainStdin().catch(() => "");
      return 0;
  }
}

// src/index.ts
var argv = process.argv.slice(2);
var [cmd, ...rest] = argv;
function version() {
  try {
    const pkg = JSON.parse(readFileSync2(new URL("../package.json", import.meta.url), "utf8"));
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}
function printHelp() {
  process.stdout.write(
    [
      `wisp-design v${version()}`,
      "",
      "Live-Frontend-Design f\xFCr Claude Code. Click element \u2192 3 distincte Varianten",
      "in echtem HMR \u2192 a11y-gated Accept \u2192 fs.writeFileSync. Verification-Gate vor",
      "jedem Accept.",
      "",
      "Usage:",
      "  wisp-design doctor [--fix]                Verify manifest, hooks, build (Phase 0 gate)",
      "  wisp-design live [--port N]               Boot bridge + inject script. (Phase 1+, stub)",
      "  wisp-design init                          Project setup wizard. (Phase 4, stub)",
      "  wisp-design poll-once [--timeout N]       Fetch one batch of bridge events. (Phase 4)",
      "  wisp-design post-event --kind K --payload <json>  Push event to bridge. (Phase 4)",
      "  wisp-design skills <index|search> [args]  Index/query skills corpus. (Phase 4)",
      "  wisp-design sync --from <vault-path>      Sync vault pattern-docs into skills/. (Phase 4)",
      "  wisp-design audit [paths...] [--mode fast|full|strict] [--screenshot] [--format text|json|markdown] [--fail-on-warn]",
      "                                            Verification-Gate (anti-slop + a11y-axe + console + tab-order + reduced-motion [+ multi-viewport]). (Phase 5)",
      "  wisp-design history [--task ID]           Replay a session log. (Phase 6, stub)",
      "  wisp-design tokens extract                Sample computed styles \u2192 design-tokens.json. (Phase 4, stub)",
      "  wisp-design verify-spec <spec>            Test a verify-spec against the workspace. (Phase 5, stub)",
      "  wisp-design hook <name>                   Internal hook entry (called by hooks/hooks.json)",
      "  wisp-design --version                     Print version",
      "  wisp-design --help                        Print this help",
      "",
      "Hook subcommands (internal):",
      "  user-prompt-submit  Inject 4 Narrative Questions on UI-page intent (Phase 4)",
      "  post-tool-use       Trigger HMR-wait + console-scan after UI source edit (Phase 5)",
      "  stop                Verification-Gate (a11y + screenshot + anti-slop)   (Phase 5)",
      "  session-end         Flush session-log + render replay summary           (Phase 6)",
      ""
    ].join("\n")
  );
}
function notImplemented(name, phase) {
  process.stderr.write(
    `wisp-design ${name}: not yet implemented (planned for Phase ${phase}). See CLAUDE.md > Build-Roadmap > Phase ${phase}.
`
  );
  return 2;
}
async function main() {
  if (cmd === "--version" || cmd === "-v") {
    process.stdout.write(`${version()}
`);
    return 0;
  }
  if (cmd === void 0 || cmd === "--help" || cmd === "-h" || cmd === "help") {
    printHelp();
    return 0;
  }
  if (cmd === "doctor") {
    const fix = rest.includes("--fix");
    const out = await runDoctor({ cwd: process.cwd(), fix });
    for (const c of out.checks) {
      const mark = c.status === "ok" ? "\u2713" : c.status === "warn" ? "!" : "\u2717";
      process.stdout.write(
        `  ${mark} ${c.label}${c.detail !== void 0 ? ` \u2014 ${c.detail}` : ""}
`
      );
    }
    process.stdout.write(
      `
${out.exitCode === 0 ? "wisp-design doctor: OK" : "wisp-design doctor: FAIL"}
`
    );
    return out.exitCode;
  }
  if (cmd === "hook") {
    return runHook(rest[0]);
  }
  if (cmd === "live") return notImplemented("live", "1-4");
  if (cmd === "init") return notImplemented("init", "4");
  if (cmd === "history") return notImplemented("history", "6");
  if (cmd === "tokens") return notImplemented("tokens", "4");
  if (cmd === "verify-spec") return notImplemented("verify-spec", "5");
  const lazyLoad = async (rel) => {
    const spec = rel;
    try {
      return await import(spec);
    } catch {
      return null;
    }
  };
  const callRunner = async (mod, fn, args, phaseName) => {
    if (mod === null) return notImplemented(phaseName, "4");
    const runner = mod[fn];
    if (typeof runner !== "function") return notImplemented(phaseName, "4");
    return runner(args);
  };
  if (cmd === "poll-once") {
    const mod = await lazyLoad("./agent/poll-loop.js");
    return callRunner(mod, "runPollOnce", rest, "poll-once");
  }
  if (cmd === "post-event") {
    const mod = await lazyLoad("./agent/poll-loop.js");
    return callRunner(mod, "runPostEvent", rest, "post-event");
  }
  if (cmd === "skills") {
    const mod = await lazyLoad("./agent/skills-index.js");
    return callRunner(mod, "runSkills", rest, "skills");
  }
  if (cmd === "sync") {
    const mod = await lazyLoad("./agent/sync.js");
    return callRunner(mod, "runSync", rest, "sync");
  }
  if (cmd === "audit") {
    const mod = await lazyLoad("./agent/audit.js");
    if (mod === null) return notImplemented("audit", "5");
    const runner = mod["runAudit"];
    if (typeof runner !== "function") return notImplemented("audit", "5");
    return runner(rest);
  }
  process.stderr.write(`wisp-design: unknown command "${cmd}". Try --help.
`);
  return 1;
}
main().then((code) => process.exit(code)).catch((err) => {
  process.stderr.write(`wisp-design: fatal \u2014 ${err instanceof Error ? err.message : String(err)}
`);
  process.exit(1);
});
//# sourceMappingURL=index.js.map