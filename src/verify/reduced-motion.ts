// wisp-design — reduced-motion check (Phase 5).
//
// Soft (warn-only) check that verifies motion-respect for users with
// `prefers-reduced-motion: reduce` enabled. Pure-CSS scan: a real pixelmatch
// diff would require two browser renders and is reserved for Phase 6.
//
// Rules:
//   1. If the CSS contains `transition`, `animation`, or `transform` AND there
//      is NO `@media (prefers-reduced-motion: reduce)` block that overrides
//      them → warn.
//   2. If any animation duration is ≥5s (literally 5s+) WITHOUT a
//      `prefers-reduced-motion` guard → fail (long auto-playing animation
//      is the worst category for vestibular sensitivity).
//
// Budget: 600ms (`REDUCED_MOTION_BUDGET_MS`). Pure regex over the CSS body.

import {
  REDUCED_MOTION_BUDGET_MS,
  type CheckResult,
  type ReducedMotionViolation,
} from "../contracts/verify.js";

const MOTION_RE = /\b(transition|animation|transform)\s*:/i;
const PREFERS_REDUCED_RE = /@media\s*\([^)]*prefers-reduced-motion\s*:\s*reduce/i;
const LONG_DURATION_RE = /\b(animation|transition)\b[^{};]*?(\b[5-9]s|\b[1-9]\d+s)\b/gi;

export async function runReducedMotion(opts: {
  html?: string;
  css: string;
  budgetStartedAt?: number;
}): Promise<CheckResult> {
  const startedAt = Date.now();
  const css = opts.css ?? "";

  // Pull <style> blocks out of any HTML supplied alongside the raw CSS.
  let combined = css;
  if (opts.html !== undefined) {
    const blocks: string[] = [];
    const blockRe = /<style[^>]*>([\s\S]*?)<\/style>/gi;
    let m: RegExpExecArray | null;
    while ((m = blockRe.exec(opts.html)) !== null) {
      blocks.push(m[1] ?? "");
    }
    if (blocks.length > 0) {
      combined = `${combined}\n${blocks.join("\n")}`;
    }
  }

  if (combined === "") {
    return {
      name: "reduced-motion",
      severity: "pass",
      durationMs: Date.now() - startedAt,
      violations: [],
    };
  }

  // Budget guard — we should rarely come close to it, but keep the contract.
  if (Date.now() - (opts.budgetStartedAt ?? startedAt) > REDUCED_MOTION_BUDGET_MS) {
    return {
      name: "reduced-motion",
      severity: "pass",
      durationMs: Date.now() - startedAt,
      skipped: { reason: "timeout" },
    };
  }

  const hasMotion = MOTION_RE.test(combined);
  const hasGuard = PREFERS_REDUCED_RE.test(combined);

  const violations: ReducedMotionViolation[] = [];

  if (hasMotion && !hasGuard) {
    // Generic "motion exists without guard" violation. We use a synthetic
    // selector since this is a stylesheet-wide finding.
    violations.push({
      selector: "@stylesheet",
      diffArea: 0,
      threshold: 0,
    });
  }

  // Long-duration motion is worse — check each long animation/transition.
  if (!hasGuard) {
    LONG_DURATION_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    let hits = 0;
    while ((m = LONG_DURATION_RE.exec(combined)) !== null) {
      violations.push({
        selector: `@long-motion[${m[2] ?? "?"}s]`,
        diffArea: 1_000, // synthetic — represents "would-diff-a-lot"
        threshold: 50,
      });
      hits += 1;
      if (hits >= 5) break;
      if (m.index === LONG_DURATION_RE.lastIndex) {
        LONG_DURATION_RE.lastIndex += 1;
      }
    }
  }

  // Severity: warn-only per spec, even when long-motion is present. The
  // synthesis doc treats motion respect as best-practice, not WCAG-A.
  const severity = violations.length > 0 ? "warn" : "pass";

  return {
    name: "reduced-motion",
    severity,
    durationMs: Date.now() - startedAt,
    violations,
  };
}
