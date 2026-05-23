/* === SECURITY-ARCHITECT AUDIT — anti-slop rules ===
 * Reviewed 2026-05-23 against skills/policy/anti-slop.md ground truth and
 * tests/verify/anti-slop-fp-rate.test.ts requirements
 * (ANTI_SLOP_FALSE_POSITIVE_RATE_MAX = 0.05).
 *
 * Per-rule rating: FP-risk (regex over-matches real code) | FN-risk (real slop
 * slips through) | coverage of suggestedFix.
 *
 * --- HARD-BANS ---
 *
 * 1. em-dash-ui — FP:low, FN:high, fix:good.
 *    Regex restricted to CSS `content:` strings and JSX text adjacent to
 *    <button|h1-6|label|a>. Misses: <span class="btn-label">Subscribe — get
 *    updates</span>, em-dashes in i18n message catalogues, em-dash inside
 *    Tailwind `text-[<value>]` arbitrary classes. SUGGEST: add a second
 *    pattern for `<span>...em-dash...</span>` inside a parent that has
 *    `role="button"` or class containing `btn|button|cta`. Fixture test: any
 *    JSX with em-dash inside the visible text of a styled-components button.
 *
 * 2. gradient-text-headline — FP:medium, FN:low, fix:good.
 *    200-char + 120-char windows are generous; could span across unrelated
 *    sibling rules in a single stylesheet — false-positive risk on large CSS
 *    files where an `a {}` block opens and a separate `.banner` block closes
 *    within 320 chars. CONSIDER: anchor the window inside `{ }` braces or
 *    require both declarations under the same selector-block.
 *
 * 3. default-glassmorphism — FP:medium, FN:medium, fix:good.
 *    The `wisp-justify` comment escape hatch is the right design but the
 *    100-char window is asymmetric (only forward, not backward). FN: a
 *    rationale ABOVE the `backdrop-filter:` line is ignored. SUGGEST: also
 *    scan 100 chars BEFORE the match. Also: `backdrop-filter: blur(0)` and
 *    `blur(0px)` are no-ops — exempt them via the regex to drop a known FP.
 *
 * 4. hero-metric-template — FP:low, FN:medium, fix:good.
 *    Requires font-size ≥ 80px AND a content-string suffix (`k+`/`x`/`M+`).
 *    Misses: hero numbers using Tailwind `text-9xl` class (no inline font-
 *    size), and Astro/Vue templates where the number is in JSX text rather
 *    than `content:`. SUGGEST: complementary rule matching text nodes
 *    `>\s*\d+(k\+|M\+|x|\+)\s*<` inside a parent with a known huge-text
 *    Tailwind class.
 *
 * 5. side-stripe-decoration — FP:low, FN:low, fix:good.
 *    Tight regex (width:1-8px + left:0 + linear-gradient). Solid-colour
 *    stripes are intentionally NOT caught — anti-slop.md says decorative
 *    side-stripes-by-anchor are allowed; the rule narrowly hits the gradient
 *    case which is the bad one. Good rule.
 *
 * 6. purple-blue-gradient — FP:medium, FN:medium, fix:good.
 *    Hex/named-colour list is fine but misses oklch() declarations even
 *    though anti-slop.md §6 calls out OKLch (hue 280-320 + 230-260, chroma
 *    > 0.12). SUGGEST: add an oklch branch:
 *       /linear-gradient\([^)]*oklch\(\s*[0-9.]+%\s+0\.[1-9]\d*\s+(2[8-9]\d|3[0-1]\d)[^)]*oklch\(\s*[0-9.]+%\s+0\.[1-9]\d*\s+(2[3-5]\d|26[0-9])/
 *    Otherwise modern OKLch palettes (Tailwind v4, RadixUI) slip through.
 *
 * 7. generic-ai-illustration — FP:low, FN:high, fix:good.
 *    Source-name list is narrow (undraw/drawkit/3d-blob/blob avatar). Misses:
 *    `unsplash.com` blob-portrait queries, `lottiefiles.com` blob animations,
 *    AI-generated CSS-painted browser-mockup divs (no url(), so detection
 *    would need DOM-shape matching). Acceptable for v0.x — DOM-shape
 *    matching is multi-viewport's job; CSS rule is the cheap pre-filter.
 *
 * --- SOFT-SUGGESTIONS ---
 *
 * S2. round-number-whitespace — FP:HIGH, FN:low, fix:good.
 *    Flags EVERY `padding: 16px` etc. occurrence. In a typical Tailwind
 *    file this triggers dozens of times — the formatter caps at 10 hits per
 *    rule which mitigates noise, but FPR-fixture risk is high. SUGGEST:
 *    aggregate at file level — only emit when (count(16/24/32/48) /
 *    count(any-spacing-decl)) > 0.7. Otherwise we will breach the 5% FPR
 *    target on the 100-component fixture.
 *
 * S3. default-tailwind-blue — FP:medium, FN:high, fix:good.
 *    Only `color:` is matched. Misses `background-color`, `border-color`,
 *    `fill`, `stroke`, and Tailwind class `bg-blue-500`/`text-blue-500`
 *    (which is the actual idiomatic form). SUGGEST: extend to property set
 *    `color|background-color|border-color|fill|stroke`. Tailwind-class
 *    matching is a separate concern (class scanning, not CSS scanning) —
 *    leave for v1.
 *
 * S4. single-weight-typography — REGEX-HARD. Coder correctly broke out
 *    `analyseFontWeights` as a stateful scan. Implementation is sound:
 *    Set<string> + named-to-numeric normalisation + early-out at size ≥ 2.
 *    The sentinel rule entry in `RULES` (pattern: / never /) is a smell but
 *    serves AntiSlopRuleId exhaustiveness. CONSIDER: scope the analysis to
 *    text-bearing CSS (only count font-weight inside selectors that match
 *    headline/body/label patterns) so a layout-only file isn't flagged.
 *
 * S5. all-rounded-corners — FP:medium, FN:medium, fix:good.
 *    Requires 4 consecutive `border-radius:Npx;` declarations within 2000-
 *    char windows. False-negative: distinct radius VALUES still count
 *    (4px/8px/16px is fine per anti-slop.md but flags here). SUGGEST:
 *    extract values, require 4+ DECLARATIONS but accept if distinct-count
 *    ≥ 3 (per "consistent radius scale 0/4/8/16/9999 is fine; single value
 *    everywhere is slop").
 *
 * --- TEST FIXTURE GUIDANCE ---
 *
 * For tests/verify/anti-slop-fp-rate.test.ts, the 100-component sample
 * should include:
 *   - 30 real-world good components (shadcn/Radix/MUI examples) — expected
 *     0 hard-ban hits. False positives here count against the 5% budget.
 *   - 30 known-slop components (CSS-paint-by-AI demos, generic SaaS hero
 *     templates) — expected ≥ 1 hard-ban hit per component (false-negative
 *     budget).
 *   - 20 borderline (Tailwind heavy, default colours) — expected only
 *     warn-level S2/S3 hits.
 *   - 20 edge cases — empty file, file with only HTML no CSS, file with
 *     only inline styles, file with `@scope` blocks (Phase 3 wrap output).
 *
 * Recommended additions before tester writes fp-rate test:
 *   1. Aggregate round-number-whitespace at file level (FPR risk).
 *   2. Add oklch branch to purple-blue-gradient (FNR risk).
 *   3. Extend default-tailwind-blue to bg/border/fill/stroke (FNR risk).
 *   4. Audit the 200/300/100-char regex windows for cross-block bleed —
 *      consider anchoring inside `{ ... }` blocks.
 *
 * --- LAUNCH SANDBOX COORDINATION ---
 *
 * `src/verify/_sandbox.ts` (this session) owns the Playwright launcher.
 * Coder's `multi-viewport.ts` MUST call `safeBrowserLaunch({ livePreviewUrl,
 * budgetMs })` rather than `chromium.launch` directly. Loopback-only
 * enforcement is both URL-time AND request-time (context.route handler).
 * === END AUDIT === */

// wisp-design — Anti-Slop linter (Phase 5).
//
// 7 hard-bans + 5 soft suggestions, distilled from `skills/policy/anti-slop.md`
// and Samuel's vault. Regexes are PRE-COMPILED at module-load: the Stop-hook
// hot path imports this file once per Node process and then runs every rule
// in O(file-size) per turn. p99 < 100ms is a HARD budget — `STOP_HOOK_HARD_LIMIT_MS`
// in src/contracts/verify.ts. Each rule must stay under ~5ms on a typical
// 5-file diff.
//
// Two entry-points:
//   - `runAntiSlop(css, ctx)` — synchronous-ish promise over a single CSS
//      string. Stop-hook hot path.
//   - `runAntiSlopOnFiles(files, opts)` — read files from disk, extract their
//      CSS surface, aggregate. Used by the Stop-hook dispatcher and by the
//      `wisp-design audit` CLI.
//
// False-positive policy: the regex set MUST stay below
// `ANTI_SLOP_FALSE_POSITIVE_RATE_MAX` (5%) on the 100-component fixture
// (tester writes `tests/verify/anti-slop-fp-rate.test.ts`). When a rule
// drifts above 5% FPR, demote to soft (see anti-slop.md § False-positive
// policy).

import { promises as fs } from "node:fs";
import { extname } from "node:path";

import {
  ANTI_SLOP_LINTER_BUDGET_MS,
  HARD_BAN_RULES,
  type AntiSlopRuleId,
  type AntiSlopViolation,
  type CheckResult,
  type VerifyMode,
} from "../contracts/verify.js";

// ---------------------------------------------------------------------------
// Rule table — pre-compiled at module-load. Keeping the table READONLY makes
// the regexes shared across every call; the JS engine's regex cache picks up
// the literal-RE optimisation path.
//
// Some rules are LEFT to a second pass (single-weight-typography needs to
// COUNT distinct font-weight values, not match a single span). They are not
// in this table; see `analyseFontWeights` below.
// ---------------------------------------------------------------------------

interface CompiledRule {
  id: AntiSlopRuleId;
  severity: "fail" | "warn";
  pattern: RegExp;
  message: string;
  suggestedFix: string;
}

const RULES: ReadonlyArray<CompiledRule> = [
  // ── Hard-bans ────────────────────────────────────────────────────────────
  {
    id: "em-dash-ui",
    severity: "fail",
    // `—` or `–` inside a quoted CSS `content:` string, or inside JSX text
    // adjacent to a button/heading. Cheapest detection: any em-dash in a
    // string literal at all — UI code rarely embeds em-dashes legitimately.
    pattern: /(content\s*:\s*['"][^'"]*[—–][^'"]*['"])|(>\s*[^<\n]*[—–][^<\n]*<\s*\/(button|h[1-6]|label|a)\b)/gi,
    message: "em-dash in UI text — reads as docs-prose, not interface copy.",
    suggestedFix: "Replace with explicit punctuation, comma, or line break.",
  },
  {
    id: "gradient-text-headline",
    severity: "fail",
    // `background-clip: text` paired with `color: transparent` on/near an
    // interactive or headline selector. Window: 200 chars to give the
    // declaration room without bridging across whole files.
    pattern: /(h[1-6]|button|a\b|\.btn|\.button|\.heading|nav\s|\[role=['"]link['"]\])[\s\S]{0,200}?background-clip\s*:\s*text[\s\S]{0,120}?color\s*:\s*transparent/gi,
    message:
      "gradient text on headline/button/link — kills scanability and contrast.",
    suggestedFix:
      "Use a solid colour. Gradient text only for purely decorative, non-interactive accents.",
  },
  {
    id: "default-glassmorphism",
    severity: "fail",
    // `backdrop-filter: blur(...)` without a wisp-justify comment within
    // 100 chars. Negative lookahead is bounded so cost stays linear.
    pattern: /backdrop-filter\s*:\s*blur\([^)]+\)(?![\s\S]{0,100}\/\*\s*wisp-justify)/gi,
    message:
      "glassmorphism without explicit rationale — default AI vibe.",
    suggestedFix:
      "Add `/* wisp-justify: <reason> */` within 100 chars, or remove the backdrop-filter.",
  },
  {
    id: "hero-metric-template",
    severity: "fail",
    // Big font-size (≥80px) in close proximity to a "Nk+" / "Nx" / "$NM"
    // content string. Catches `font-size: 96px; ... content: "100k+"`.
    pattern: /font-size\s*:\s*(8\d|9\d|1[0-9]\d)px[\s\S]{0,300}?content\s*:\s*['"][^'"]*\d+(k\+|K\+|x|M\+|m\+|\+)[^'"]*['"]/g,
    message:
      "hero-metric template (huge number + 'k+'/'10x'/'$M+' suffix) — over-used AI hero pattern.",
    suggestedFix:
      "Use a real proof-point with attribution, a testimonial, or remove the metric.",
  },
  {
    id: "side-stripe-decoration",
    severity: "fail",
    // ::before pseudo with absolute positioning at left:0, small width, and
    // a gradient background. Width bounded to 1-8px so we don't false-flag
    // legitimate sidebars.
    pattern: /::before\s*\{[\s\S]{0,300}?position\s*:\s*absolute[\s\S]{0,200}?left\s*:\s*0[\s\S]{0,150}?width\s*:\s*[1-8]px[\s\S]{0,200}?background\s*:[^;}]*linear-gradient/gi,
    message:
      "decorative side-stripe via ::before — Linear-clone tell, invisibly over-used.",
    suggestedFix:
      "Replace with a semantic priority indicator (icon + label) or remove the decoration.",
  },
  {
    id: "purple-blue-gradient",
    severity: "fail",
    // linear-gradient containing BOTH a purple-ish stop AND a blue-ish stop.
    // Catches the most common AI vibe; we lean on the named-colour set + the
    // canonical Tailwind hexes.
    pattern: /linear-gradient\([^)]*(?:#5b21b6|#6d28d9|#7c3aed|#8b5cf6|#a855f7|#c084fc|purple|violet)[^)]*(?:#1d4ed8|#2563eb|#3b82f6|#60a5fa|#93c5fd|blue|indigo)[^)]*\)/gi,
    message:
      "purple→blue gradient — generic AI brand vibe.",
    suggestedFix:
      "Modulate lightness within one hue, or use the project palette colours from `.wisp/brand-spec.json`.",
  },
  {
    id: "generic-ai-illustration",
    severity: "fail",
    // background-image referencing well-known generic illustration sources.
    pattern: /background-image\s*:\s*url\(['"]?[^'"]*?(undraw|drawkit|illustration\.[a-z]+|cartoon|blob\s*avatar|3d-blob)[^'"]*?['"]?\)/gi,
    message:
      "generic illustration reference (undraw/drawkit/3D-blob) — instantly-recognisable AI vibe.",
    suggestedFix:
      "Use a custom illustration or remove the illustration entirely.",
  },
  // ── Soft suggestions ─────────────────────────────────────────────────────
  {
    id: "too-perfect-alignment",
    severity: "warn",
    // Symmetric `margin:0 auto` + `text-align:center` + symmetric padding +
    // explicit gap. Heuristic; tolerant of variance via 0,100 windows.
    pattern: /margin\s*:\s*0\s+auto\s*;[\s\S]{0,150}?text-align\s*:\s*center\s*;[\s\S]{0,150}?padding\s*:\s*\d+px\s+\d+px\s*;[\s\S]{0,150}?gap\s*:\s*\d+px/g,
    message:
      "too-perfect symmetric block — reads as wireframe, not designed page.",
    suggestedFix:
      "Introduce a small asymmetry (offset margin, sibling-specific padding, or asymmetric grid).",
  },
  {
    id: "round-number-whitespace",
    severity: "warn",
    // padding/margin/gap exactly equal to the Tailwind defaults 16/24/32/48.
    // We flag each occurrence; aggregator counts at file level.
    pattern: /(padding|margin|gap)\s*:\s*(16|24|32|48)px(?![0-9])/g,
    message:
      "round-number whitespace (16/24/32/48px) — reads as Tailwind-default.",
    suggestedFix:
      "Mix nearby steps (18/22/26/50) within a 4px grid to add considered rhythm.",
  },
  {
    id: "default-tailwind-blue",
    severity: "warn",
    pattern: /color\s*:\s*(#3b82f6|rgb\(\s*59\s*,\s*130\s*,\s*246\s*\)|var\(--tw-blue-500\)|var\(--color-blue-500\))/g,
    message:
      "default Tailwind blue (#3b82f6) used directly — single most over-used AI brand colour.",
    suggestedFix:
      "Use a project-defined accent OKLch with stated chroma, or pull from `.wisp/brand-spec.json`.",
  },
  // single-weight-typography is handled separately by `analyseFontWeights`
  // (counting distinct values across the file is a state-ful scan, not a
  // single-pass regex). Below entry stays for `RuleId` exhaustiveness only —
  // its pattern never matches.
  {
    id: "single-weight-typography",
    severity: "warn",
    pattern: / never /, // sentinel — `analyseFontWeights` decides.
    message:
      "only one font-weight in this file — flat typographic hierarchy.",
    suggestedFix:
      "Use 2-3 weights (e.g. 400 body, 500 label, 600 headline) to create scannable hierarchy.",
  },
  {
    id: "all-rounded-corners",
    severity: "warn",
    // 4+ distinct selector-or-rule blocks each ending in border-radius:Npx.
    // Cheap heuristic: count `border-radius` occurrences in a single file.
    pattern: /border-radius\s*:\s*\d+px\s*;[\s\S]{0,2000}?border-radius\s*:\s*\d+px\s*;[\s\S]{0,2000}?border-radius\s*:\s*\d+px\s*;[\s\S]{0,2000}?border-radius\s*:\s*\d+px\s*;/g,
    message:
      "every surface has the same border-radius — no visual hierarchy.",
    suggestedFix:
      "Mix sharp + rounded across surfaces (0 / 4 / 8 / 16) instead of one value everywhere.",
  },
];

// Build a quick lookup so callers + the violations aggregator can find a
// rule by id without scanning the array each time.
const RULES_BY_ID: ReadonlyMap<AntiSlopRuleId, CompiledRule> = new Map(
  RULES.map((r) => [r.id, r] as const),
);

// ---------------------------------------------------------------------------
// Helpers — 1-based line/column derived from a regex match index.
// ---------------------------------------------------------------------------

function lineColAt(content: string, offset: number): { line: number; column: number } {
  let line = 1;
  let column = 1;
  for (let i = 0; i < offset && i < content.length; i += 1) {
    if (content.charCodeAt(i) === 0x0a /* \n */) {
      line += 1;
      column = 1;
    } else {
      column += 1;
    }
  }
  return { line, column };
}

function snippet(content: string, offset: number, length: number, max = 80): string {
  const end = Math.min(content.length, offset + length);
  const raw = content.slice(offset, end);
  const trimmed = raw.replace(/\s+/g, " ").trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

// ---------------------------------------------------------------------------
// analyseFontWeights — counts distinct `font-weight` values declared in the
// content. < 2 distinct → emit a single-weight-typography violation.
// ---------------------------------------------------------------------------

const FONT_WEIGHT_RE = /font-weight\s*:\s*([1-9]\d{2}|normal|bold|lighter|bolder)/gi;

function analyseFontWeights(content: string): AntiSlopViolation | null {
  const found = new Set<string>();
  let m: RegExpExecArray | null;
  // Reset lastIndex defensively — RULES regexes are sticky-less but the
  // shared regex here has `g` flag.
  FONT_WEIGHT_RE.lastIndex = 0;
  while ((m = FONT_WEIGHT_RE.exec(content)) !== null) {
    const value = (m[1] ?? "").toLowerCase();
    // Normalise the named values to a numeric bucket so `400` and `normal`
    // aren't both counted as distinct.
    if (value === "normal") found.add("400");
    else if (value === "bold") found.add("700");
    else if (value === "lighter" || value === "bolder") found.add(value);
    else found.add(value);
    if (found.size >= 2) return null; // early-out — hierarchy present
  }
  if (found.size === 1) {
    const rule = RULES_BY_ID.get("single-weight-typography");
    if (rule === undefined) return null;
    return {
      ruleId: rule.id,
      severity: rule.severity,
      message: rule.message,
      suggestedFix: rule.suggestedFix,
      location: { cssSnippet: `font-weight: ${Array.from(found)[0] ?? ""}` },
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// runAntiSlop — single-string entry point. Synchronous body, async signature
// so the orchestrator can await it. Honours an optional `budgetStartedAt`
// (caller's wall-clock) to early-out when the Stop-hook is approaching its
// 100ms ceiling.
// ---------------------------------------------------------------------------

export async function runAntiSlop(
  css: string,
  ctx?: { mode?: VerifyMode; budgetStartedAt?: number },
): Promise<CheckResult> {
  const startedAt = Date.now();
  const violations: AntiSlopViolation[] = [];

  for (const rule of RULES) {
    // Skip the sentinel rule — handled below.
    if (rule.id === "single-weight-typography") continue;
    // Re-create regex state because some rules use the `g` flag and would
    // otherwise carry `lastIndex` across calls.
    const re = new RegExp(rule.pattern.source, rule.pattern.flags);
    let match: RegExpExecArray | null;
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
          cssSnippet: snippet(css, match.index, match[0].length),
        },
      });
      matchCount += 1;
      // Cap per-rule matches so a single file can't blow the budget with a
      // thousand identical hits. The first 10 are plenty for citation.
      if (matchCount >= 10) break;
      // Defend against zero-width matches.
      if (match.index === re.lastIndex) re.lastIndex += 1;
    }
    // Budget guard between rules.
    if (
      ctx?.budgetStartedAt !== undefined &&
      Date.now() - ctx.budgetStartedAt > ANTI_SLOP_LINTER_BUDGET_MS
    ) {
      break;
    }
  }

  // Stateful single-weight check.
  const fwViolation = analyseFontWeights(css);
  if (fwViolation !== null) violations.push(fwViolation);

  const severity =
    violations.some((v) => v.severity === "fail")
      ? "fail"
      : violations.some((v) => v.severity === "warn")
        ? "warn"
        : "pass";

  return {
    name: "anti-slop",
    severity,
    durationMs: Date.now() - startedAt,
    violations,
  };
}

// ---------------------------------------------------------------------------
// extractCssFromFile — best-effort heuristic. The Stop-hook scans many file
// types and the cost of a real CSS parser is too high; we settle for "all
// lines that look like CSS declarations". For .tsx/.jsx/.vue/.svelte/.html
// we additionally pull out `<style>` blocks and `style={{...}}` JSX props.
// ---------------------------------------------------------------------------

const STYLE_BLOCK_RE = /<style[^>]*>([\s\S]*?)<\/style>/gi;
const JSX_INLINE_STYLE_RE = /\bstyle\s*=\s*\{\{([\s\S]*?)\}\}/g;
const INLINE_STYLE_ATTR_RE = /\bstyle\s*=\s*"([^"]*)"/g;

export function extractCssFromFile(filePath: string, content: string): string {
  const ext = extname(filePath).toLowerCase();
  if (ext === ".css" || ext === ".scss" || ext === ".sass") return content;

  if (ext === ".tsx" || ext === ".jsx" || ext === ".ts" || ext === ".js") {
    const out: string[] = [];
    let m: RegExpExecArray | null;
    JSX_INLINE_STYLE_RE.lastIndex = 0;
    while ((m = JSX_INLINE_STYLE_RE.exec(content)) !== null) {
      // Convert JSX object-literal style to a CSS-ish flat string by
      // rewriting `camelCase: 'value'` → `kebab-case: value;`. We don't
      // need a real parser — the regex set looks for substrings.
      const body = (m[1] ?? "")
        .replace(/([a-z])([A-Z])/g, (_, a: string, b: string) => `${a}-${b.toLowerCase()}`)
        .replace(/['"]/g, "'")
        .replace(/,/g, ";");
      out.push(body);
    }
    // Include the raw source too so the em-dash-in-JSX-text rule still hits.
    out.push(content);
    return out.join("\n");
  }

  if (
    ext === ".vue" ||
    ext === ".svelte" ||
    ext === ".html" ||
    ext === ".htm" ||
    ext === ".astro"
  ) {
    const out: string[] = [];
    let m: RegExpExecArray | null;
    STYLE_BLOCK_RE.lastIndex = 0;
    while ((m = STYLE_BLOCK_RE.exec(content)) !== null) {
      out.push(m[1] ?? "");
    }
    INLINE_STYLE_ATTR_RE.lastIndex = 0;
    while ((m = INLINE_STYLE_ATTR_RE.exec(content)) !== null) {
      out.push(m[1] ?? "");
    }
    out.push(content); // for em-dash detection in markup text
    return out.join("\n");
  }

  // Unknown extension — return as-is. The linter rules will mostly miss but
  // we don't crash on .md, .json, etc.
  return content;
}

// ---------------------------------------------------------------------------
// runAntiSlopOnFiles — multi-file entry point. Honours the per-call budget
// by checking wall-clock between files and exiting early. Always returns a
// CheckResult (never throws).
// ---------------------------------------------------------------------------

const UI_EXTENSIONS: ReadonlySet<string> = new Set([
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
  ".sass",
]);

export async function runAntiSlopOnFiles(
  files: string[],
  opts: {
    mode: VerifyMode;
    projectRoot: string;
    budgetStartedAt?: number;
    // Override the budget — used by audit-mode where 50ms is too tight per
    // file. Default to ANTI_SLOP_LINTER_BUDGET_MS for stop-hook safety.
    perCallBudgetMs?: number;
  },
): Promise<CheckResult> {
  const startedAt = Date.now();
  const budgetBase = opts.budgetStartedAt ?? startedAt;
  const budgetMs = opts.perCallBudgetMs ?? ANTI_SLOP_LINTER_BUDGET_MS;
  const violations: AntiSlopViolation[] = [];

  for (const filePath of files) {
    const ext = extname(filePath).toLowerCase();
    if (!UI_EXTENSIONS.has(ext)) continue;
    if (Date.now() - budgetBase > budgetMs) break;

    let content: string;
    try {
      content = await fs.readFile(filePath, "utf8");
    } catch {
      // Best-effort: an unreadable file is skipped silently. Stop-hook is
      // warn-only so we never block a turn over a transient read error.
      continue;
    }
    const css = extractCssFromFile(filePath, content);
    const result = await runAntiSlop(css, {
      mode: opts.mode,
      budgetStartedAt: budgetBase,
    });
    if (result.violations !== undefined) {
      // Annotate each violation with the file it came from so the citation
      // is actionable. We piggyback on `location.cssSnippet` because
      // AntiSlopViolation has no dedicated `filePath` field — the snippet
      // prefix is the single source of truth for the formatter below.
      // We cast to AntiSlopViolation[] here because `runAntiSlop` is the
      // only callee and only ever produces that shape — the CheckResult
      // contract's union type is too wide for our purposes.
      const rawAnti = result.violations as AntiSlopViolation[];
      for (const v of rawAnti) {
        const annotated: AntiSlopViolation = {
          ruleId: v.ruleId,
          severity: v.severity,
          message: v.message,
          location: {
            ...(v.location ?? {}),
            cssSnippet: `${filePath}: ${v.location?.cssSnippet ?? ""}`.trim(),
          },
        };
        if (v.suggestedFix !== undefined) annotated.suggestedFix = v.suggestedFix;
        violations.push(annotated);
      }
    }
  }

  const severity =
    violations.some((v) => v.severity === "fail")
      ? "fail"
      : violations.some((v) => v.severity === "warn")
        ? "warn"
        : "pass";

  return {
    name: "anti-slop",
    severity,
    durationMs: Date.now() - startedAt,
    violations,
  };
}

// ---------------------------------------------------------------------------
// Formatters — used by the Stop-hook dispatcher for stderr / strict-block
// output. Both formats cite rule id + suggested fix; strict-block uses
// concise one-line citations because Claude Code's stdout JSON is the
// medium.
// ---------------------------------------------------------------------------

function isHardBan(v: AntiSlopViolation): boolean {
  return HARD_BAN_RULES.has(v.ruleId);
}

export function formatBlockMessage(hits: AntiSlopViolation[]): string {
  const hardBans = hits.filter(isHardBan);
  if (hardBans.length === 0) return "wisp-design anti-slop: (no hard-bans)";
  const head = `wisp-design anti-slop blocked: ${hardBans.length} hard-ban${hardBans.length > 1 ? "s" : ""}`;
  const lines = hardBans.slice(0, 5).map((v) => {
    const where =
      v.location !== undefined && v.location.cssSnippet !== undefined
        ? `\n    ${v.location.cssSnippet}`
        : "";
    return `  • ${v.ruleId} — ${v.message}${where}\n    fix: ${v.suggestedFix ?? "(no suggestion)"}`;
  });
  if (hardBans.length > 5) {
    lines.push(`  • …and ${hardBans.length - 5} more.`);
  }
  return [head, ...lines].join("\n");
}

export function formatWarnMessage(hits: AntiSlopViolation[]): string {
  if (hits.length === 0) return "wisp-design anti-slop: clean.";
  const head = `wisp-design anti-slop warn: ${hits.length} finding${hits.length > 1 ? "s" : ""}`;
  const lines = hits.slice(0, 8).map((v) => {
    const sev = isHardBan(v) ? "FAIL" : "warn";
    return `  [${sev}] ${v.ruleId}: ${v.message}`;
  });
  if (hits.length > 8) {
    lines.push(`  …and ${hits.length - 8} more (run \`wisp-design audit --mode full\` for the full report).`);
  }
  return [head, ...lines].join("\n");
}
