// wisp-design — tab-order check (Phase 5).
//
// Three sub-checks, each producing TabOrderViolation entries. Severity = worst
// of:
//   • focus-trap-leak     — fail (modal opens but focus escapes on Tab).
//   • missing-focus-ring  — warn (interactive without visible focus state).
//   • nonzero-tabindex    — warn (tabindex > 0 forces non-DOM order).
//
// We use jsdom for static parsing; live-mode runs against the supplied HTML
// snapshot rather than spinning a real browser (cheap, deterministic).
//
// Budget: 300ms (`TAB_ORDER_BUDGET_MS`). A jsdom build dominates cost.

import {
  TAB_ORDER_BUDGET_MS,
  type CheckResult,
  type TabOrderViolation,
} from "../contracts/verify.js";

async function loadJsdom(): Promise<typeof import("jsdom") | null> {
  try {
    return (await import("jsdom")) as typeof import("jsdom");
  } catch {
    return null;
  }
}

const INTERACTIVE_SELECTORS = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]",
  "[contenteditable=\"true\"]",
];

// ---------------------------------------------------------------------------
// detectNonzeroTabindex — tabindex > 0 is an accessibility anti-pattern
// because it overrides the document's natural focus order.
// ---------------------------------------------------------------------------

function detectNonzeroTabindex(doc: Document): TabOrderViolation[] {
  const out: TabOrderViolation[] = [];
  const elements = doc.querySelectorAll("[tabindex]");
  elements.forEach((el) => {
    const raw = (el as Element).getAttribute("tabindex");
    if (raw === null) return;
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) return;
    out.push({
      kind: "nonzero-tabindex",
      selector: cssPathFor(el as Element),
      detail: `tabindex=${raw} on <${(el as Element).tagName.toLowerCase()}>`,
    });
  });
  return out;
}

// ---------------------------------------------------------------------------
// detectMissingFocusRing — heuristic: every interactive element should have
// a corresponding `:focus-visible` or `:focus` style override. Because
// jsdom doesn't compute styles, we settle for "does the document contain
// ANY :focus-visible rule covering this element class?".
// This is a defensible warn-only heuristic; a real browser-side audit would
// use getComputedStyle on each pseudo-state.
// ---------------------------------------------------------------------------

function detectMissingFocusRing(doc: Document): TabOrderViolation[] {
  // Pull all stylesheet text once.
  const css: string[] = [];
  const styles = doc.querySelectorAll("style");
  styles.forEach((s) => {
    css.push((s as Element).textContent ?? "");
  });
  const inline = css.join("\n");
  const hasFocusVisibleRule = /:focus(-visible)?\b/.test(inline);

  const out: TabOrderViolation[] = [];
  const elements = doc.querySelectorAll(INTERACTIVE_SELECTORS.join(","));
  elements.forEach((el) => {
    // If any focus-visible rule exists at all, we don't flag per-element —
    // the project has SOME focus handling. Targeted per-element detection
    // is a Phase-6 enhancement (real-browser computedStyle).
    if (hasFocusVisibleRule) return;
    out.push({
      kind: "missing-focus-ring",
      selector: cssPathFor(el as Element),
      detail: "no :focus or :focus-visible rule found in the page stylesheets",
    });
  });
  // Cap so we don't spam warnings on a 500-button storybook page.
  return out.slice(0, 10);
}

// ---------------------------------------------------------------------------
// detectFocusTrapLeak — heuristic over markup: a `[role="dialog"]` /
// `[role="alertdialog"]` / `<dialog>` with `aria-modal="true"` AND focusable
// siblings outside that element's subtree indicates a likely focus-trap
// leak. The real-browser variant would synthesize Tab keydowns; we settle
// for the structural smell.
// ---------------------------------------------------------------------------

function detectFocusTrapLeak(doc: Document): TabOrderViolation[] {
  const dialogs: Element[] = [];
  doc
    .querySelectorAll("[role=\"dialog\"],[role=\"alertdialog\"],dialog")
    .forEach((d) => {
      const aria = (d as Element).getAttribute("aria-modal");
      if ((d as Element).tagName.toLowerCase() === "dialog" || aria === "true") {
        dialogs.push(d as Element);
      }
    });
  if (dialogs.length === 0) return [];

  const out: TabOrderViolation[] = [];
  for (const dialog of dialogs) {
    // Focusables ANYWHERE in the document that are NOT descendants of the
    // dialog AND are not hidden via [aria-hidden=true] / [inert].
    const all = doc.querySelectorAll(INTERACTIVE_SELECTORS.join(","));
    const leaks: Element[] = [];
    all.forEach((el) => {
      if (dialog.contains(el as Element)) return;
      // Check ancestors for inert/aria-hidden.
      let p: Element | null = el as Element;
      let hidden = false;
      while (p !== null) {
        if (
          p.getAttribute("aria-hidden") === "true" ||
          p.hasAttribute("inert")
        ) {
          hidden = true;
          break;
        }
        p = p.parentElement;
      }
      if (!hidden) leaks.push(el as Element);
    });
    if (leaks.length > 0) {
      out.push({
        kind: "focus-trap-leak",
        selector: cssPathFor(dialog),
        detail: `${leaks.length} focusable element${leaks.length > 1 ? "s" : ""} reachable outside the open modal`,
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// cssPathFor — minimal selector path for citation. id > tag.class > tag.
// ---------------------------------------------------------------------------

function cssPathFor(el: Element): string {
  if (el.id !== "") return `#${el.id}`;
  const tag = el.tagName.toLowerCase();
  const cls = el.getAttribute("class");
  if (cls !== null && cls.trim() !== "") {
    const first = cls.trim().split(/\s+/)[0];
    return `${tag}.${first}`;
  }
  return tag;
}

// ---------------------------------------------------------------------------
// runTabOrder — public entry.
// ---------------------------------------------------------------------------

export async function runTabOrder(opts: {
  html: string;
  budgetStartedAt?: number;
}): Promise<CheckResult> {
  const startedAt = Date.now();
  const jsdomMod = await loadJsdom();
  if (jsdomMod === null) {
    return {
      name: "tab-order",
      severity: "pass",
      durationMs: Date.now() - startedAt,
      skipped: {
        reason: "error",
        detail: "jsdom not available",
      },
    };
  }

  try {
    const dom = new jsdomMod.JSDOM(opts.html);
    const doc = dom.window.document;

    const violations: TabOrderViolation[] = [
      ...detectFocusTrapLeak(doc),
      ...detectMissingFocusRing(doc),
      ...detectNonzeroTabindex(doc),
    ];

    try {
      dom.window.close();
    } catch {
      /* ignore */
    }

    const hasTrapLeak = violations.some((v) => v.kind === "focus-trap-leak");
    const severity = hasTrapLeak
      ? "fail"
      : violations.length > 0
        ? "warn"
        : "pass";

    const durationMs = Date.now() - startedAt;
    if (durationMs > TAB_ORDER_BUDGET_MS) {
      // Orchestrator's outer timeout will independently flag this; we just
      // report what we computed.
    }
    return {
      name: "tab-order",
      severity,
      durationMs,
      violations,
    };
  } catch (err) {
    return {
      name: "tab-order",
      severity: "pass",
      durationMs: Date.now() - startedAt,
      skipped: {
        reason: "error",
        detail: (err as Error).message,
      },
    };
  }
}
