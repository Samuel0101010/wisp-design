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
import { extname, join } from "node:path";

import {
  ANTI_SLOP_LINTER_BUDGET_MS,
  HARD_BAN_RULES,
  type AntiSlopRuleId,
  type AntiSlopViolation,
  type CheckResult,
  type VerifyMode,
} from "../contracts/verify.js";

// ---------------------------------------------------------------------------
// Tailwind className scanner — runs AFTER the CSS-property regex pass.
//
// Extracts every className="..." and class="..." attribute value from the
// raw source (JSX + HTML/Vue/Svelte). For each class-name string, four
// rule-specific matchers look for co-occurrence patterns that CSS-property
// regexes cannot reach (e.g. `bg-clip-text text-transparent` lives in
// className, not in a style block).
//
// Helper returns array of {value, offset} — offset is the byte position of
// the opening quote so we can compute line numbers cheaply.
// ---------------------------------------------------------------------------

interface ClassNameMatch {
  value: string;
  offset: number; // offset of the first char of the class-name value (after the quote)
}

const CLASS_ATTR_RE = /\b(?:className|class)\s*=\s*"([^"]*)"/g;

function extractClassNameValues(content: string): ClassNameMatch[] {
  const results: ClassNameMatch[] = [];
  CLASS_ATTR_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = CLASS_ATTR_RE.exec(content)) !== null) {
    // m[1] is the class-name string; m.index points at `className` keyword.
    // The value starts at m.index + (full match length - value length - 1 quote).
    const fullMatch = m[0] ?? "";
    const value = m[1] ?? "";
    const valueOffset = m.index + fullMatch.length - value.length - 1;
    results.push({ value, offset: valueOffset });
  }
  return results;
}

// Rule-specific class matchers. Each returns an AntiSlopViolation or null.
// They receive the raw class-name string + its byte offset for line-number
// computation.

function matchGradientTextClassName(
  value: string,
  offset: number,
  content: string,
): AntiSlopViolation | null {
  // Requires bg-gradient-to-* AND bg-clip-text AND text-transparent in same className.
  if (
    /bg-gradient-to-\w+/.test(value) &&
    /bg-clip-text/.test(value) &&
    /text-transparent/.test(value)
  ) {
    const { line, column } = lineColAt(content, offset);
    return {
      ruleId: "gradient-text-headline",
      severity: "fail",
      message: "gradient text via Tailwind classes (bg-clip-text text-transparent) — kills scanability.",
      suggestedFix: "Use a solid colour. Gradient text only for purely decorative, non-interactive accents.",
      location: { line, column, cssSnippet: snippet(value, 0, value.length) },
    };
  }
  return null;
}

function matchHeroMetricClassName(
  value: string,
  offset: number,
  content: string,
): AntiSlopViolation | null {
  // T2 (2026-05-24): two paths into this rule:
  //   (a) `text-{7,8,9}xl` OR `text-[Npx]` with N>=80 — Big-Text on its own
  //       is enough signal when paired with a metric suffix.
  //   (b) `text-{4,5,6}xl` + `font-black|font-extrabold` co-occurrence —
  //       the visual treatment (huge-bold metric) is slop even when the
  //       absolute size is borderline (text-4xl = 2.25rem ≈ 36px). Canonical
  //       case: sample/index.html `<p class="text-4xl font-black">98%</p>`.
  //       The font-black gate keeps real body copy from firing.
  const hasBigText =
    /text-[789]xl\b/.test(value) || /text-\[(\d+)px\]/.test(value);
  const hasBorderlineHeavy =
    /text-[456]xl\b/.test(value) && /font-(black|extrabold)\b/.test(value);
  if (!hasBigText && !hasBorderlineHeavy) return null;
  // Check arbitrary pixel value is >=80px.
  const arbitraryMatch = /text-\[(\d+)px\]/.exec(value);
  if (arbitraryMatch !== null && !hasBorderlineHeavy) {
    const px = parseInt(arbitraryMatch[1] ?? "0", 10);
    if (px < 80) return null;
  }
  // Look for metric text content in the element: digits followed by %, x, K+, M+,
  // or a ratio/time like `24/7`. Search 400 chars forward from the class
  // attribute offset for a text node.
  const window = content.slice(offset, offset + 400);
  if (!/>\s*[^<]*\d+(%|x|K\+?|M\+?|\+|\/\d+)[^<]*</.test(window)) return null;
  const { line, column } = lineColAt(content, offset);
  return {
    ruleId: "hero-metric-template",
    severity: "fail",
    message: "hero-metric template via Tailwind huge/bold text with metric suffix — over-used AI hero pattern.",
    suggestedFix: "Use a real proof-point with attribution, a testimonial, or remove the metric.",
    location: { line, column, cssSnippet: snippet(value, 0, value.length) },
  };
}

function matchGlassmorphismClassName(
  value: string,
  offset: number,
  content: string,
): AntiSlopViolation | null {
  // Requires backdrop-blur(-\w+)? AND bg-(white|black)/N in same className,
  // without a wisp-justify comment within 100 chars.
  if (
    /backdrop-blur(-\w+)?/.test(value) &&
    /bg-(white|black)\/\d+/.test(value)
  ) {
    // Check for wisp-justify escape in nearby source (100 chars around match).
    const before = content.slice(Math.max(0, offset - 100), offset);
    const after = content.slice(offset, Math.min(content.length, offset + 100));
    if (/wisp-justify/.test(before) || /wisp-justify/.test(after)) return null;
    const { line, column } = lineColAt(content, offset);
    return {
      ruleId: "default-glassmorphism",
      severity: "fail",
      message: "glassmorphism via Tailwind classes (backdrop-blur + bg-white/black opacity) — default AI vibe.",
      suggestedFix: "Add `/* wisp-justify: <reason> */` within 100 chars, or remove the backdrop-filter.",
      location: { line, column, cssSnippet: snippet(value, 0, value.length) },
    };
  }
  return null;
}

function matchPurpleBlueGradientClassName(
  value: string,
  offset: number,
  content: string,
): AntiSlopViolation | null {
  // Requires any (from|via|to)-purple-N AND (from|via|to)-blue-N in same className.
  if (
    /(from|via|to)-purple-\d+/.test(value) &&
    /(from|via|to)-blue-\d+/.test(value)
  ) {
    const { line, column } = lineColAt(content, offset);
    return {
      ruleId: "purple-blue-gradient",
      severity: "fail",
      message: "purple→blue gradient via Tailwind classes — generic AI brand vibe.",
      suggestedFix: "Modulate lightness within one hue, or use the project palette colours from `.wisp/brand-spec.json`.",
      location: { line, column, cssSnippet: snippet(value, 0, value.length) },
    };
  }
  return null;
}

// T5: Tailwind `(bg|text|border)-blue-{500..700}` utility class detection.
// Respects the project brand whitelist via the shared AggregatorContext.
function matchDefaultBlueClassName(
  value: string,
  offset: number,
  content: string,
  ctx: AggregatorContext,
): AntiSlopViolation | null {
  const m = DEFAULT_BLUE_TW_CLASS_RE.exec(value);
  if (m === null) return null;
  // Whitelist token form: store both the literal class (`bg-blue-500`) and
  // canonical hex form. If either is whitelisted, skip.
  const token = `${m[1]}-blue-${m[2]}`;
  if (ctx.brandColors.has(token) || ctx.brandColors.has("#3b82f6")) {
    // Note: when brand colors contain #3b82f6 the *intent* is "this blue is
    // ours" — skip Tailwind-class match too. Coarse but pragmatic.
    return null;
  }
  const { line, column } = lineColAt(content, offset);
  return {
    ruleId: "default-tailwind-blue",
    severity: "warn",
    message: `default Tailwind blue utility (${token}) — single most over-used AI brand colour.`,
    suggestedFix: "Use a project-defined accent OKLch with stated chroma, or pull from `.wisp/brand-spec.json`.",
    location: { line, column, cssSnippet: snippet(value, 0, value.length) },
  };
}

// Run all five Tailwind class matchers against every className value extracted
// from `content`. Deduplicates by (ruleId, line) so a file with many
// glassmorphism cards only emits one hit per rule.
//
// G2 (2026-05-24): the `default-tailwind-blue` matches collected here are
// returned alongside the count, so the file-level aggregator can require
// ≥2 occurrences (CSS + className combined) before emitting. A single
// isolated `text-blue-600` is treated as an intentional accent.
interface TailwindMatcherResult {
  // All non-default-blue violations, ready to emit as-is.
  violations: AntiSlopViolation[];
  // default-blue class-matcher hits, parked for the aggregator pass.
  defaultBlueClassHits: AntiSlopViolation[];
}

function runTailwindClassMatchers(content: string, ctx: AggregatorContext): TailwindMatcherResult {
  const matches = extractClassNameValues(content);
  const violations: AntiSlopViolation[] = [];
  const defaultBlueClassHits: AntiSlopViolation[] = [];
  const seen = new Set<string>(); // key = ruleId:line
  const seenBlue = new Set<string>(); // separate de-dup for parked hits

  for (const { value, offset } of matches) {
    // Non-default-blue rules emit directly.
    const candidates: Array<AntiSlopViolation | null> = [
      matchGradientTextClassName(value, offset, content),
      matchHeroMetricClassName(value, offset, content),
      matchGlassmorphismClassName(value, offset, content),
      matchPurpleBlueGradientClassName(value, offset, content),
    ];
    for (const v of candidates) {
      if (v === null) continue;
      const key = `${v.ruleId}:${v.location?.line ?? 0}`;
      if (seen.has(key)) continue;
      seen.add(key);
      violations.push(v);
    }
    // default-blue class-matcher: park for the aggregator pass.
    // Dedup by (line, column) so two className utilities on the same line
    // each count as a separate occurrence for the G2 min-occurrence gate.
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

// ---------------------------------------------------------------------------
// Rule table — pre-compiled at module-load. Keeping the table READONLY makes
// the regexes shared across every call; the JS engine's regex cache picks up
// the literal-RE optimisation path.
//
// Some rules are LEFT to a second pass (single-weight-typography needs to
// COUNT distinct font-weight values, not match a single span). They are not
// in this table; see `analyseFontWeights` below.
// ---------------------------------------------------------------------------

interface AggregatorContext {
  // Brand-defined colours loaded from `.wisp/brand-spec.json` if present.
  // Lowercased hex (e.g. "#3b82f6") OR raw token strings. Empty set when no
  // brand-spec exists; rules treat that as "no whitelist, scan normally".
  brandColors: ReadonlySet<string>;
}

interface CompiledRule {
  id: AntiSlopRuleId;
  severity: "fail" | "warn";
  pattern: RegExp;
  message: string;
  suggestedFix: string;
  // Optional file-level aggregator. When present, the runner uses this instead
  // of `pattern.exec`-based occurrence scanning. Lets a rule decide based on
  // distribution rather than per-occurrence — needed for soft suggestions that
  // are too noisy when emitted per-hit (round-number-whitespace fires on every
  // Tailwind-default spacing decl). T5 extended the signature with
  // AggregatorContext so the default-tailwind-blue rule can honour the
  // project brand whitelist.
  aggregator?: (content: string, ctx: AggregatorContext) => AntiSlopViolation[];
}

// ---------------------------------------------------------------------------
// File-level aggregator for round-number-whitespace.
//
// Mechanism: count ALL `padding|margin|gap: <N>px` declarations and the subset
// that use the "round" 16/24/32/48px values. Emit ONE violation per file only
// when:
//   - totalCount >= MIN_TOTAL (4)             — enough signal to call it a pattern
//   - roundCount / totalCount > RATIO (0.7)   — dominant Tailwind-default rhythm
//
// Returns [] otherwise. This brings the soft-warn FPR down from ~45% (one hit
// per round-spacing-decl) to ~0% on the test corpus where each fixture has
// only one such decl (totalCount < 4).
// ---------------------------------------------------------------------------

const ROUND_NUMBER_WHITESPACE_MIN_TOTAL = 4;
const ROUND_NUMBER_WHITESPACE_RATIO_THRESHOLD = 0.7;
const ROUND_NUMBER_VALUES: ReadonlySet<string> = new Set(["16", "24", "32", "48"]);
const ANY_SPACING_DECL_RE = /(padding|margin|gap)\s*:\s*(\d+)px(?![0-9])/g;

function aggregateRoundNumberWhitespace(content: string, _ctx: AggregatorContext): AntiSlopViolation[] {
  let totalCount = 0;
  let roundCount = 0;
  // Track FIRST round-number location to cite in the violation.
  let firstRoundOffset = -1;
  let firstRoundLen = 0;
  ANY_SPACING_DECL_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
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
  if (rule === undefined) return [];
  const location: AntiSlopViolation["location"] = {};
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
      location,
    },
  ];
}

// ---------------------------------------------------------------------------
// T5 (2026-05-24) — Default-Tailwind-blue aggregator with brand whitelist.
//
// Extends the legacy `color: #3b82f6` regex with the broader property set
// (color | background-color | border-color | fill | stroke) AND a Tailwind
// utility-class branch (`(bg|text|border)-blue-{500..700}`). Skips the
// violation entirely when the matched colour value is on the project
// brand-color whitelist (loaded from `.wisp/brand-spec.json`).
// ---------------------------------------------------------------------------

const DEFAULT_BLUE_CSS_RE = /(color|background-color|border-color|fill|stroke)\s*:\s*(#3b82f6|rgb\(\s*59\s*,\s*130\s*,\s*246\s*\)|var\(--tw-blue-500\)|var\(--color-blue-500\))/gi;

// Tailwind utility class match: `(bg|text|border)-blue-{500..700}` as a
// whole token. Used by runTailwindClassMatchers below — kept here so the
// regex sits next to its CSS counterpart.
const DEFAULT_BLUE_TW_CLASS_RE = /\b(bg|text|border)-blue-(500|600|700)\b/;

function normalizeBlueValue(value: string): string {
  const v = value.toLowerCase().trim();
  // Canonical form: lowercase hex. `rgb(59,130,246)` → `#3b82f6` so the
  // whitelist comparison is one-shot.
  if (v === "#3b82f6") return "#3b82f6";
  if (/^rgb\(\s*59\s*,\s*130\s*,\s*246\s*\)$/.test(v)) return "#3b82f6";
  if (v === "var(--tw-blue-500)" || v === "var(--color-blue-500)") return v;
  return v;
}

// G2 (2026-05-24) — minimum-occurrence gate.
//
// FPR analysis on the 100-component fixture showed every borderline snippet
// (`.border-N { color: #3b82f6 }`) triggered this rule with a SINGLE
// occurrence, contributing 20/70 = 28.6% to soft-warn FPR. A single use of
// `#3b82f6` in a file is almost always an intentional accent or scaffold
// leftover; the over-use pattern that anti-slop targets is the file/codebase
// that uses default-blue 2+ times as a brand colour.
//
// New gate: only emit when the total occurrence count across CSS props +
// className utilities (already-aggregated by runTailwindClassMatchers) is
// ≥ DEFAULT_BLUE_MIN_OCCURRENCES (2). Brand-whitelisted values still skip.
//
// Note: `additionalClassHits` is wired from the orchestrator (runAntiSlop),
// which has already run the className matcher pass; it represents the
// class-side count contributing to "use of default-blue in this file". The
// aggregator combines both, decides whether to emit, and returns the merged
// violation set.
const DEFAULT_BLUE_MIN_OCCURRENCES = 2;

function aggregateDefaultTailwindBlue(
  content: string,
  ctx: AggregatorContext,
  additionalClassHits: AntiSlopViolation[] = [],
): AntiSlopViolation[] {
  const cssHits: AntiSlopViolation[] = [];
  DEFAULT_BLUE_CSS_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  // G2: dedup by (line, column) instead of line alone — two declarations on
  // the same line (e.g. `.a { color:#3b82f6 } .b { color:#3b82f6 }`) are
  // SEPARATE occurrences for the min-occurrence gate.
  const seenLocations = new Set<string>();
  const rule = RULES_BY_ID.get("default-tailwind-blue");
  if (rule === undefined) return [];
  while ((m = DEFAULT_BLUE_CSS_RE.exec(content)) !== null) {
    const value = m[2] ?? "";
    const normalized = normalizeBlueValue(value);
    if (ctx.brandColors.has(normalized)) continue; // brand-whitelisted
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
        cssSnippet: snippet(content, m.index, m[0].length),
      },
    });
    if (cssHits.length >= 10) break;
  }
  const totalOccurrences = cssHits.length + additionalClassHits.length;
  if (totalOccurrences < DEFAULT_BLUE_MIN_OCCURRENCES) return [];
  // Merge + cap at 10 for citation budget.
  return [...cssHits, ...additionalClassHits].slice(0, 10);
}

const RULES: ReadonlyArray<CompiledRule> = [
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
    // The `pattern` field stays exported for tests that introspect it; the
    // RUNNER actually invokes `aggregator` below, which makes a single file-
    // level decision based on the round/total ratio.
    pattern: /(padding|margin|gap)\s*:\s*(16|24|32|48)px(?![0-9])/g,
    message:
      "round-number whitespace (16/24/32/48px) — reads as Tailwind-default.",
    suggestedFix:
      "Mix nearby steps (18/22/26/50) within a 4px grid to add considered rhythm.",
    aggregator: aggregateRoundNumberWhitespace,
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
    message:
      "default Tailwind blue (#3b82f6) used directly — single most over-used AI brand colour.",
    suggestedFix:
      "Use a project-defined accent OKLch with stated chroma, or pull from `.wisp/brand-spec.json`.",
    aggregator: aggregateDefaultTailwindBlue,
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
// T4 (2026-05-24) — Brace-anchored block iteration.
//
// Many rules look at "windows" of N chars around a property. Without brace
// anchoring, a 200-char forward window can cross a `}` into the next rule
// and accidentally match (selector from rule A + property from rule B).
// `forEachRuleBlock` walks the content one `{...}` at a time and yields the
// raw block-text + its selector-prefix + its offset. Used by:
//   - analyseFontWeights (T6) — scopes scan to text-bearing selectors.
//
// Implementation: a simple linear scan tracking `{` / `}` depth. Strings and
// comments are NOT escaped because anti-slop runs on declaration-shaped
// content that the extractor already pre-cleaned; the worst-case mis-match
// is a slightly-truncated block which only affects the soft-warn rule's
// recall, not the hot-path hard-ban set.
// ---------------------------------------------------------------------------

interface RuleBlock {
  selector: string; // text between the last `}` (or start of file) and the `{`
  body: string; // text between `{` and matching `}`
  offset: number; // offset of the opening `{` in the original content
}

function forEachRuleBlock(content: string): RuleBlock[] {
  const blocks: RuleBlock[] = [];
  let i = 0;
  let blockStart = 0; // start of the selector for the next block
  while (i < content.length) {
    const ch = content.charCodeAt(i);
    if (ch === 0x7b /* { */) {
      const selector = content.slice(blockStart, i).trim();
      const bodyStart = i + 1;
      // Find matching `}` honouring depth so nested `@media { .x { … } }`
      // doesn't slice mid-body.
      let depth = 1;
      let j = bodyStart;
      while (j < content.length && depth > 0) {
        const c = content.charCodeAt(j);
        if (c === 0x7b) depth += 1;
        else if (c === 0x7d /* } */) depth -= 1;
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

// Text-bearing-selector predicate (T6). A block "looks like text" iff:
//   (a) Body contains a text-shaping declaration
//       (font-family|font-size|line-height|letter-spacing|color|text-*), OR
//   (b) Selector is a typographic tag (h1-h6/p/span/a/button/label/li/...)
//       AND the selector has no obvious icon/utility modifier (.icon,
//       .sr-only, .visually-hidden, [aria-hidden]).
// The icon-exclusion stops `button.icon { font-weight:400 }` from being
// scanned even though `button` is a text tag.
const TEXT_TAG_RE = /(^|[\s,>+~])(h[1-6]|p|span|a|button|label|li|blockquote|code|td|th|strong|em|small|figcaption|caption)\b/;
const TEXT_DECL_RE = /(?:^|[\s;{])(font-family|font-size|line-height|letter-spacing|color|text-[a-z-]+)\s*:/i;
const ICON_HINT_RE = /\.(icon|sr-only|visually-hidden|svg|chev|caret|spinner)\b|\[aria-hidden\b/;

function blockIsTextBearing(block: RuleBlock): boolean {
  if (TEXT_DECL_RE.test(block.body)) return true;
  if (TEXT_TAG_RE.test(block.selector) && !ICON_HINT_RE.test(block.selector)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// analyseFontWeights — counts distinct `font-weight` values declared in the
// content. < 2 distinct → emit a single-weight-typography violation.
//
// T6 (2026-05-24): scope the scan to TEXT-BEARING blocks only. A layout
// utility class like `.icon-button { font-weight: 400; }` (no text-shaping
// decls, non-text selector) is no longer counted. This stops the rule from
// firing on icon-only / layout-only stylesheets that happen to set a single
// font-weight as a Tailwind default.
// ---------------------------------------------------------------------------

const FONT_WEIGHT_RE = /font-weight\s*:\s*([1-9]\d{2}|normal|bold|lighter|bolder)/gi;

// G1 (2026-05-24) — minimum-occurrence gate for single-weight-typography.
//
// Pre-G1 behaviour: 1 distinct weight value across the file → fire. This
// over-fired on real-world components that legitimately declare a single
// weight on one label or button class (MUI input pattern: 10/30 realGood
// fixtures fired). The over-use pattern this rule targets is the FILE that
// styles many text elements with the same single weight — not the file with
// one styled label.
//
// New gate: require ≥ MIN_SINGLE_WEIGHT_OCCURRENCES (2) font-weight
// declarations across the file, all collapsing to the same canonical value.
// One declaration alone is treated as an intentional single-element style.
const MIN_SINGLE_WEIGHT_OCCURRENCES = 2;

function analyseFontWeights(content: string): AntiSlopViolation | null {
  const distinctValues = new Set<string>();
  let occurrenceCount = 0;
  const blocks = forEachRuleBlock(content);
  // When the content has no brace blocks (single inline-style string, or a
  // flat `font-weight: 400` from a JSX extract) fall back to the old global
  // scan. This preserves the existing JSX/inline-style behaviour.
  const scanBodies = blocks.length === 0
    ? [content]
    : blocks.filter(blockIsTextBearing).map((b) => b.body);
  for (const body of scanBodies) {
    FONT_WEIGHT_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = FONT_WEIGHT_RE.exec(body)) !== null) {
      const value = (m[1] ?? "").toLowerCase();
      let canonical: string;
      if (value === "normal") canonical = "400";
      else if (value === "bold") canonical = "700";
      else canonical = value; // 100..900 or lighter/bolder
      distinctValues.add(canonical);
      occurrenceCount += 1;
      // Early-out: as soon as ≥2 distinct values are seen, the file has
      // hierarchy and the rule cannot fire.
      if (distinctValues.size >= 2) return null;
    }
  }
  if (distinctValues.size === 1 && occurrenceCount >= MIN_SINGLE_WEIGHT_OCCURRENCES) {
    const rule = RULES_BY_ID.get("single-weight-typography");
    if (rule === undefined) return null;
    return {
      ruleId: rule.id,
      severity: rule.severity,
      message: rule.message,
      suggestedFix: rule.suggestedFix,
      location: { cssSnippet: `font-weight: ${Array.from(distinctValues)[0] ?? ""}` },
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
  ctx?: {
    mode?: VerifyMode;
    budgetStartedAt?: number;
    rawSource?: string;
    // T5: project brand colours loaded from `.wisp/brand-spec.json`. When
    // present, the default-tailwind-blue rule skips matches whose colour
    // value is on the whitelist. Empty/missing → scan normally.
    brandColors?: ReadonlySet<string>;
    // Phase-7.12 — override the per-call budget for non-stop-hook modes.
    // Default keeps the 50ms stop-hook ceiling; audit modes pass higher.
    budgetMs?: number;
  },
): Promise<CheckResult> {
  const startedAt = Date.now();
  const budgetMs = ctx?.budgetMs ?? ANTI_SLOP_LINTER_BUDGET_MS;
  const violations: AntiSlopViolation[] = [];
  const aggCtx: AggregatorContext = {
    brandColors: ctx?.brandColors ?? new Set<string>(),
  };

  // G2 (2026-05-24): run the className-pass FIRST so default-blue class
  // hits are available when the default-tailwind-blue aggregator runs.
  // The non-default-blue tailwind violations are emitted unchanged.
  let parkedDefaultBlueClassHits: AntiSlopViolation[] = [];
  const tailwindBudgetOkUp =
    ctx?.budgetStartedAt === undefined ||
    Date.now() - ctx.budgetStartedAt <= budgetMs;
  if (tailwindBudgetOkUp) {
    const sourceForClassScan = ctx?.rawSource ?? css;
    const tw = runTailwindClassMatchers(sourceForClassScan, aggCtx);
    for (const v of tw.violations) violations.push(v);
    parkedDefaultBlueClassHits = tw.defaultBlueClassHits;
  }

  for (const rule of RULES) {
    // Skip the sentinel rule — handled below.
    if (rule.id === "single-weight-typography") continue;
    // File-level aggregator (e.g. round-number-whitespace) decides on its own
    // — runner does NOT fall through to per-occurrence regex scanning.
    if (rule.aggregator !== undefined) {
      // G2: default-tailwind-blue aggregator additionally receives the
      // parked className hits so the min-occurrence gate can sum CSS + class
      // counts before deciding whether to emit.
      const aggregated =
        rule.id === "default-tailwind-blue"
          ? aggregateDefaultTailwindBlue(css, aggCtx, parkedDefaultBlueClassHits)
          : rule.aggregator(css, aggCtx);
      for (const v of aggregated) violations.push(v);
      if (
        ctx?.budgetStartedAt !== undefined &&
        Date.now() - ctx.budgetStartedAt > budgetMs
      ) {
        break;
      }
      continue;
    }
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
      Date.now() - ctx.budgetStartedAt > budgetMs
    ) {
      break;
    }
  }

  // (Tailwind className scanner is now run UPFRONT before the rule loop so
  // the default-tailwind-blue aggregator can see both the CSS hits and the
  // class hits together — see G2 in this file.)

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

// T5: brand-spec loader. Reads `.wisp/brand-spec.json` if present and returns
// a lower-cased Set of brand-color tokens (hex + Tailwind class names). The
// loader is best-effort: malformed JSON / missing file / unexpected shape
// all yield an empty set so the rule degrades to its no-whitelist path.
export async function loadBrandColors(projectRoot: string): Promise<Set<string>> {
  const out = new Set<string>();
  try {
    const path = join(projectRoot, ".wisp", "brand-spec.json");
    const raw = await fs.readFile(path, "utf8");
    const json: unknown = JSON.parse(raw);
    // Accept several shapes for ergonomics:
    //   - `brand.colors: string[]`     (legacy, preferred)
    //   - `brand.primary: string`      (G2: single primary token)
    //   - `brand.accent: string`       (G2: single accent token)
    //   - top-level `colors: string[]` (legacy alias)
    let arr: unknown = undefined;
    let primary: unknown = undefined;
    let accent: unknown = undefined;
    if (json !== null && typeof json === "object") {
      const j = json as Record<string, unknown>;
      const brand = j["brand"];
      if (brand !== undefined && typeof brand === "object" && brand !== null) {
        const b = brand as Record<string, unknown>;
        arr = b["colors"];
        primary = b["primary"];
        accent = b["accent"];
      }
      if (arr === undefined) arr = j["colors"];
    }
    if (Array.isArray(arr)) {
      for (const v of arr) {
        if (typeof v === "string") out.add(v.toLowerCase().trim());
      }
    }
    if (typeof primary === "string") out.add(primary.toLowerCase().trim());
    if (typeof accent === "string") out.add(accent.toLowerCase().trim());
  } catch {
    // missing file / parse error / no permission — silently no-whitelist
  }
  return out;
}

export async function runAntiSlopOnFiles(
  files: string[],
  opts: {
    mode: VerifyMode;
    projectRoot: string;
    budgetStartedAt?: number;
    // Override the budget — used by audit-mode where 50ms is too tight per
    // file. Default to ANTI_SLOP_LINTER_BUDGET_MS for stop-hook safety.
    perCallBudgetMs?: number;
    // T5: optional pre-loaded brand colours. When omitted, loaded from
    // `<projectRoot>/.wisp/brand-spec.json`.
    brandColors?: ReadonlySet<string>;
  },
): Promise<CheckResult> {
  const startedAt = Date.now();
  const budgetBase = opts.budgetStartedAt ?? startedAt;
  const budgetMs = opts.perCallBudgetMs ?? ANTI_SLOP_LINTER_BUDGET_MS;
  const violations: AntiSlopViolation[] = [];
  const brandColors = opts.brandColors ?? (await loadBrandColors(opts.projectRoot));

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
      rawSource: content,
      brandColors,
      // Phase-7.12 — propagate the per-call budget so inner rule-loop and
      // tailwind-scanner don't truncate against the 50ms stop-hook ceiling
      // when called from audit modes.
      budgetMs,
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
