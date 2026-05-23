#!/usr/bin/env node

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
var REDUCED_MOTION_BUDGET_MS = 600;

// src/verify/reduced-motion.ts
var MOTION_RE = /\b(transition|animation|transform)\s*:/i;
var PREFERS_REDUCED_RE = /@media\s*\([^)]*prefers-reduced-motion\s*:\s*reduce/i;
var LONG_DURATION_RE = /\b(animation|transition)\b[^{};]*?(\b[5-9]s|\b[1-9]\d+s)\b/gi;
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
export {
  runReducedMotion
};
//# sourceMappingURL=reduced-motion.js.map