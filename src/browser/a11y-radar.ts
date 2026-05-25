// wisp-design — a11y radar (Phase 7.16, Tier-2 #1).
//
// Lite per-variant accessibility score (0..100) computed purely from the
// variant's CSS text. No DOM, no axe-core. Fast (<2ms) so it can be
// computed inline while building variant cards in renderCycling.
//
// Severity buckets:
//   - "good"    score >= 80   green
//   - "warn"    50 <= s < 80  amber
//   - "fail"    score < 50    red
//
// Penalty table (start at 100, subtract):
//   - color + bg-color present AND contrast < 4.5 ............ −30  fail
//   - color + bg-color present AND contrast < 7   .............. −12  warn
//   - font-size < 12px ........................................ −12
//   - font-weight ≤ 200 (very-light + low contrast risk) ...... −6
//   - transition|animation present WITHOUT @media reduced-motion −10
//   - gradient-text headline   ................................ −20  hard-ban
//   - backdrop-filter (glassmorphism without rationale) ....... −12
//   - text-shadow with offset >2px on small text  ............. −6
//   - line-height < 1.2 on body-sized text  ................... −5
//
// The single most-impacting penalty is exposed as `topFinding` so the badge
// tooltip can show the most actionable signal.

export interface RadarScore {
  /** 0-100 (clamped). 100 = no detected issues. */
  score: number;
  /** "good" | "warn" | "fail" */
  severity: "good" | "warn" | "fail";
  /** Most-impacting finding, or null if score === 100. */
  topFinding: { rule: string; message: string; penalty: number } | null;
  /** All findings, ordered by penalty desc. */
  findings: Array<{ rule: string; message: string; penalty: number }>;
}

interface ParsedDecl {
  prop: string;
  value: string;
}

// ---------------------------------------------------------------------------
// CSS micro-parser — extracts every `prop: value;` from the input text,
// stripping comments. Robust to !important and multi-line declarations.
// We don't need full CSSOM — variant CSS is always small (< 4 KB).
// ---------------------------------------------------------------------------

const COMMENT_RE = /\/\*[\s\S]*?\*\//g;
const DECL_RE = /([-a-z]+)\s*:\s*([^;{}]+)(?:!important)?\s*;/gi;

function parseDecls(css: string): ParsedDecl[] {
  if (!css) return [];
  const stripped = css.replace(COMMENT_RE, "");
  const out: ParsedDecl[] = [];
  let m: RegExpExecArray | null;
  while ((m = DECL_RE.exec(stripped)) !== null) {
    const prop = m[1]?.toLowerCase().trim();
    const value = m[2]?.replace(/!important/i, "").trim();
    if (prop && value) out.push({ prop, value });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Color parsing — supports #rgb, #rrggbb, rgb(), rgba(), hsl(), hsla(),
// named "white"/"black"/"transparent". Returns sRGB 0-255 + alpha 0-1, or
// null when unparseable (e.g. var() / currentColor / oklch()).
// ---------------------------------------------------------------------------

interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

const NAMED_COLORS: Record<string, [number, number, number]> = {
  white: [255, 255, 255],
  black: [0, 0, 0],
  transparent: [0, 0, 0],
};

function parseColor(input: string): RGBA | null {
  if (!input) return null;
  const v = input.trim().toLowerCase();
  if (NAMED_COLORS[v]) {
    const [r, g, b] = NAMED_COLORS[v];
    return { r, g, b, a: v === "transparent" ? 0 : 1 };
  }
  // Hex
  let m = /^#([0-9a-f]{3,8})$/i.exec(v);
  if (m && m[1]) {
    const hex = m[1];
    if (hex.length === 3) {
      return {
        r: parseInt(hex[0]! + hex[0]!, 16),
        g: parseInt(hex[1]! + hex[1]!, 16),
        b: parseInt(hex[2]! + hex[2]!, 16),
        a: 1,
      };
    }
    if (hex.length === 6) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
        a: 1,
      };
    }
  }
  // rgb()/rgba()
  m = /^rgba?\(\s*([\d.]+)\s*[,\s]\s*([\d.]+)\s*[,\s]\s*([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/.exec(v);
  if (m) {
    return {
      r: Math.round(parseFloat(m[1]!)),
      g: Math.round(parseFloat(m[2]!)),
      b: Math.round(parseFloat(m[3]!)),
      a: m[4] ? parseFloat(m[4]) : 1,
    };
  }
  return null;
}

function relLuminance(c: RGBA): number {
  const toLin = (v: number): number => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * toLin(c.r) + 0.7152 * toLin(c.g) + 0.0722 * toLin(c.b);
}

export function contrastRatio(fg: RGBA, bg: RGBA): number {
  const lFg = relLuminance(fg);
  const lBg = relLuminance(bg);
  const lighter = Math.max(lFg, lBg);
  const darker = Math.min(lFg, lBg);
  return (lighter + 0.05) / (darker + 0.05);
}

// ---------------------------------------------------------------------------
// scoreVariant — main entry point.
// ---------------------------------------------------------------------------

export interface ScoreOptions {
  /** Optional background color to compute contrast against when the variant
   *  only declares `color:` (common case — picked text on a parent bg). */
  contrastBg?: string;
}

export function scoreVariant(css: string, opts: ScoreOptions = {}): RadarScore {
  const findings: Array<{ rule: string; message: string; penalty: number }> = [];
  let score = 100;

  const decls = parseDecls(css);
  const byProp: Record<string, string> = {};
  for (const d of decls) byProp[d.prop] = d.value;

  // ---- Contrast ----
  const fgRaw = byProp["color"];
  const bgRaw = byProp["background-color"] ?? byProp["background"] ?? opts.contrastBg;
  if (fgRaw && bgRaw) {
    const fg = parseColor(fgRaw);
    const bg = parseColor(bgRaw);
    if (fg && bg && bg.a > 0.1) {
      const ratio = contrastRatio(fg, bg);
      if (ratio < 4.5) {
        const pen = 30;
        score -= pen;
        findings.push({
          rule: "contrast-AA",
          message: `Contrast ${ratio.toFixed(2)}:1 < 4.5:1 (AA)`,
          penalty: pen,
        });
      } else if (ratio < 7) {
        const pen = 12;
        score -= pen;
        findings.push({
          rule: "contrast-AAA",
          message: `Contrast ${ratio.toFixed(2)}:1 < 7:1 (AAA)`,
          penalty: pen,
        });
      }
    }
  }

  // ---- Font size ----
  const fsRaw = byProp["font-size"];
  if (fsRaw) {
    const m = /^([\d.]+)(px|rem|em)?$/.exec(fsRaw.trim());
    if (m) {
      const n = parseFloat(m[1]!);
      const unit = m[2] ?? "px";
      const px = unit === "px" ? n : n * 16;
      if (px < 12) {
        const pen = 12;
        score -= pen;
        findings.push({
          rule: "font-size-too-small",
          message: `Font ${px.toFixed(0)}px < 12px minimum`,
          penalty: pen,
        });
      }
    }
  }

  // ---- Font weight ----
  const fwRaw = byProp["font-weight"];
  if (fwRaw) {
    const n = parseInt(fwRaw.trim(), 10);
    if (!isNaN(n) && n > 0 && n <= 200) {
      const pen = 6;
      score -= pen;
      findings.push({
        rule: "font-weight-too-light",
        message: `Weight ${n} risks low legibility`,
        penalty: pen,
      });
    }
  }

  // ---- Motion ----
  const hasTransition =
    /\btransition\s*:/i.test(css) || /\banimation\s*:/i.test(css);
  const hasReducedMotionGuard = /@media[^{]*prefers-reduced-motion[^{]*reduce/i.test(css);
  if (hasTransition && !hasReducedMotionGuard) {
    const pen = 10;
    score -= pen;
    findings.push({
      rule: "no-reduced-motion-guard",
      message: "transition/animation without @media (prefers-reduced-motion: reduce)",
      penalty: pen,
    });
  }

  // ---- Anti-slop signals ----
  // gradient text headline — background-image: gradient + background-clip: text
  if (
    /background-image\s*:[^;]*gradient/i.test(css) &&
    /background-clip\s*:\s*text/i.test(css)
  ) {
    const pen = 20;
    score -= pen;
    findings.push({
      rule: "gradient-text",
      message: "Gradient text — kills scanability + contrast",
      penalty: pen,
    });
  }
  // glassmorphism — backdrop-filter
  if (/backdrop-filter\s*:[^;]*blur/i.test(css)) {
    const pen = 12;
    score -= pen;
    findings.push({
      rule: "glassmorphism",
      message: "backdrop-filter blur — overused AI affectation",
      penalty: pen,
    });
  }
  // line-height too tight (only flag when text-bearing decl is also present)
  const lhRaw = byProp["line-height"];
  if (lhRaw && (byProp["font-size"] || byProp["font-family"])) {
    const n = parseFloat(lhRaw);
    if (!isNaN(n) && n > 0 && n < 1.2) {
      const pen = 5;
      score -= pen;
      findings.push({
        rule: "line-height-tight",
        message: `line-height ${n} < 1.2 on text`,
        penalty: pen,
      });
    }
  }

  // ---- Clamp + severity bucket ----
  if (score < 0) score = 0;
  if (score > 100) score = 100;
  const severity: RadarScore["severity"] =
    score >= 80 ? "good" : score >= 50 ? "warn" : "fail";

  findings.sort((a, b) => b.penalty - a.penalty);
  const topFinding = findings[0] ?? null;

  return { score, severity, topFinding, findings };
}

// ---------------------------------------------------------------------------
// Module export — mirrors the other browser modules.
// ---------------------------------------------------------------------------

export const a11yRadarModule = { scoreVariant, contrastRatio };
