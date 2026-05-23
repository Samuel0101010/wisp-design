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
var TAB_ORDER_BUDGET_MS = 300;

// src/verify/tab-order.ts
async function loadJsdom() {
  try {
    return await import("jsdom");
  } catch {
    return null;
  }
}
var INTERACTIVE_SELECTORS = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]",
  '[contenteditable="true"]'
];
function detectNonzeroTabindex(doc) {
  const out = [];
  const elements = doc.querySelectorAll("[tabindex]");
  elements.forEach((el) => {
    const raw = el.getAttribute("tabindex");
    if (raw === null) return;
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) return;
    out.push({
      kind: "nonzero-tabindex",
      selector: cssPathFor(el),
      detail: `tabindex=${raw} on <${el.tagName.toLowerCase()}>`
    });
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
    out.push({
      kind: "missing-focus-ring",
      selector: cssPathFor(el),
      detail: "no :focus or :focus-visible rule found in the page stylesheets"
    });
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
      out.push({
        kind: "focus-trap-leak",
        selector: cssPathFor(dialog),
        detail: `${leaks.length} focusable element${leaks.length > 1 ? "s" : ""} reachable outside the open modal`
      });
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
  const jsdomMod = await loadJsdom();
  if (jsdomMod === null) {
    return {
      name: "tab-order",
      severity: "pass",
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
    const hasTrapLeak = violations.some((v) => v.kind === "focus-trap-leak");
    const severity = hasTrapLeak ? "fail" : violations.length > 0 ? "warn" : "pass";
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
      severity: "pass",
      durationMs: Date.now() - startedAt,
      skipped: {
        reason: "error",
        detail: err.message
      }
    };
  }
}
export {
  runTabOrder
};
//# sourceMappingURL=tab-order.js.map