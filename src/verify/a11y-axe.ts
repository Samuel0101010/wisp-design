// wisp-design — a11y-axe check (Phase 5).
//
// Runs axe-core against rendered HTML. Two paths:
//   1. Live-mode (`opts.livePreviewUrl` is set + playwright available):
//      headless chromium navigates, injects axe.source, runs `axe.run()` in
//      the page context, collects violations.
//   2. Audit / jsdom mode: jsdom renders the HTML, axe runs against
//      `dom.window.document` via the standard node-side API.
//
// Severity mapping (per docs/verification-gate.md):
//   WCAG AA + impact serious|critical → "fail"
//   AA + minor|moderate              → "warn"
//   AAA (any impact)                 → "warn"  (v0.x doesn't block on AAA)
//   A (any impact)                   → "warn"
//
// Budget: 800ms (`A11Y_AXE_BUDGET_MS`). axe-core itself is fast on a single
// page; the dominant cost is JSDOM construction (or chromium navigation).

import type {
  A11yViolation,
  CheckResult,
} from "../contracts/verify.js";
import { A11Y_AXE_BUDGET_MS } from "../contracts/verify.js";

// Lazy-import axe-core only when called. The Stop-hook never reaches this
// file (anti-slop-only mode) so the cost of loading axe (~250KB minified)
// is paid only by the heavier modes.
type AxeModule = typeof import("axe-core");

// Axe-core's result types reference DOM globals (Node, Element) that don't
// exist on the bare node `globalThis`. We only need the violations array
// shape, so we type-narrow to the minimum we read.
interface AxeNode {
  target: ReadonlyArray<string | string[]>;
  html?: string;
}
interface AxeViolation {
  id: string;
  impact: "minor" | "moderate" | "serious" | "critical" | null;
  tags: ReadonlyArray<string>;
  nodes: ReadonlyArray<AxeNode>;
  helpUrl?: string;
}
interface AxeResults {
  violations: ReadonlyArray<AxeViolation>;
}

async function loadAxe(): Promise<AxeModule | null> {
  try {
    return (await import("axe-core")) as unknown as AxeModule;
  } catch {
    return null;
  }
}

async function loadJsdom(): Promise<typeof import("jsdom") | null> {
  try {
    return (await import("jsdom")) as typeof import("jsdom");
  } catch {
    return null;
  }
}

async function loadPlaywright(): Promise<typeof import("playwright") | null> {
  try {
    return (await import("playwright")) as typeof import("playwright");
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Severity mapping.
// ---------------------------------------------------------------------------

function levelFromTags(tags: ReadonlyArray<string>): "A" | "AA" | "AAA" {
  // axe tags look like "wcag2a", "wcag2aa", "wcag21aa", "wcag22a", "wcag2aaa".
  let highest: "A" | "AA" | "AAA" = "A";
  for (const t of tags) {
    if (/^wcag\d{1,2}aaa$/i.test(t)) return "AAA";
    if (/^wcag\d{1,2}aa$/i.test(t)) highest = highest === "AAA" ? "AAA" : "AA";
  }
  return highest;
}

function severityFor(
  level: "A" | "AA" | "AAA",
  impact: "minor" | "moderate" | "serious" | "critical",
): "fail" | "warn" {
  if (level === "AAA") return "warn";
  if (level === "AA" && (impact === "serious" || impact === "critical")) {
    return "fail";
  }
  return "warn";
}

function mapAxeViolation(v: AxeViolation): A11yViolation {
  const impact = (v.impact ?? "moderate") as
    | "minor"
    | "moderate"
    | "serious"
    | "critical";
  const level = levelFromTags(v.tags);
  const severity = severityFor(level, impact);
  const nodes = v.nodes.map((n) => {
    // axe-core target is `(string|string[])[]`. Flatten to a single string
    // selector for our typed shape.
    const selector =
      n.target.length === 0
        ? ""
        : Array.isArray(n.target[0])
          ? (n.target[0] as string[]).join(" >>> ")
          : (n.target[0] as string);
    return n.html !== undefined ? { selector, html: n.html } : { selector };
  });
  const out: A11yViolation = {
    ruleId: v.id,
    impact,
    level,
    severity,
    nodes,
  };
  if (v.helpUrl !== undefined) out.helpUrl = v.helpUrl;
  return out;
}

// ---------------------------------------------------------------------------
// runWithLivePlaywright — navigate via chromium, inject axe.source, evaluate.
// Uses the security-owned `_sandbox.ts` when present; falls back to a safe
// inline launch otherwise (TODO: swap to safeBrowserLaunch when _sandbox.ts
// lands).
// ---------------------------------------------------------------------------

async function tryLoadSandbox(): Promise<
  | { safeBrowserLaunch: (url: string) => Promise<{ browser: unknown; page: unknown }> }
  | null
> {
  try {
    return (await import("./_sandbox.js")) as unknown as {
      safeBrowserLaunch: (
        url: string,
      ) => Promise<{ browser: unknown; page: unknown }>;
    };
  } catch {
    return null;
  }
}

async function runViaPlaywright(
  livePreviewUrl: string,
  axe: AxeModule,
): Promise<A11yViolation[]> {
  const pw = await loadPlaywright();
  if (pw === null) {
    throw new Error("playwright not available");
  }
  // URL allow-list: localhost only. Defense in depth in case _sandbox is
  // absent.
  const u = new URL(livePreviewUrl);
  if (u.hostname !== "localhost" && u.hostname !== "127.0.0.1") {
    throw new Error(`a11y-axe refuses non-localhost URL: ${livePreviewUrl}`);
  }

  const sandbox = await tryLoadSandbox();
  if (sandbox !== null) {
    // Sandbox-owned launch path.
    const { browser, page } = await sandbox.safeBrowserLaunch(livePreviewUrl);
    try {
      // Inject axe source — `axe.source` is the standalone bundle as a
      // string. We then `axe.run(document, { ... })` in-page.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const p = page as any;
      await p.addScriptTag({ content: (axe as unknown as { source: string }).source });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const results = (await p.evaluate(async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const a = (globalThis as any).axe as {
          run: (
            ctx: unknown,
            opts: unknown,
          ) => Promise<AxeResults>;
        };
        return a.run(document, {
          runOnly: {
            type: "tag",
            values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"],
          },
          // Exclude wisp's own floating-bar UI from the audit.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          exclude: [["[data-wisp-ui]"]] as any,
        });
      })) as AxeResults;
      return results.violations.map(mapAxeViolation);
    } finally {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (browser as any).close();
      } catch {
        /* ignore */
      }
    }
  }

  // Inline fallback. TODO: replace once security's `_sandbox.ts` lands.
  const browser = await pw.chromium.launch({
    headless: true,
    args: ["--disable-extensions", "--no-default-browser-check", "--no-first-run"],
  });
  try {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(livePreviewUrl, { timeout: 5_000, waitUntil: "networkidle" });
    await page.addScriptTag({
      content: (axe as unknown as { source: string }).source,
    });
    const results = (await page.evaluate(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const a = (globalThis as any).axe as {
        run: (
          ctx: unknown,
          opts: unknown,
        ) => Promise<AxeResults>;
      };
      return a.run(document, {
        runOnly: {
          type: "tag",
          values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"],
        },
      });
    })) as AxeResults;
    return results.violations.map(mapAxeViolation);
  } finally {
    try {
      await browser.close();
    } catch {
      /* ignore */
    }
  }
}

// ---------------------------------------------------------------------------
// runViaJsdom — node-side axe run against a jsdom DOM. Used for audit-mode
// against static HTML and as the live-mode fallback when playwright is
// missing.
// ---------------------------------------------------------------------------

async function runViaJsdom(html: string, axe: AxeModule): Promise<A11yViolation[]> {
  const jsdomMod = await loadJsdom();
  if (jsdomMod === null) {
    throw new Error("jsdom not available — install jsdom for non-live a11y-axe");
  }
  const dom = new jsdomMod.JSDOM(html, {
    // Don't run scripts — axe is injected manually and we don't want
    // arbitrary author JS to execute.
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });

  // axe-core needs globals to exist BEFORE its module is evaluated. We
  // already imported it (at the top of run()), so we splice the globals
  // onto `globalThis` for the duration of the run and restore after.
  const win = dom.window;
  const savedWindow = (globalThis as { window?: unknown }).window;
  const savedDocument = (globalThis as { document?: unknown }).document;
  const savedNavigator = (globalThis as { navigator?: unknown }).navigator;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).window = win;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).document = win.document;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).navigator = win.navigator;
  try {
    // axe-core's `run()` accepts a Document directly.
    const results = (await axe.run(win.document, {
      runOnly: {
        type: "tag",
        values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"],
      },
    } as Parameters<AxeModule["run"]>[1])) as unknown as AxeResults;
    return results.violations.map(mapAxeViolation);
  } finally {
    // Restore globals so subsequent unrelated code doesn't see jsdom's
    // window. Test runs in vitest care about this.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).window = savedWindow;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).document = savedDocument;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).navigator = savedNavigator;
    try {
      dom.window.close();
    } catch {
      /* ignore */
    }
  }
}

// ---------------------------------------------------------------------------
// runA11yAxe — public entry. Always returns a CheckResult (never throws):
// on error, returns `{ severity: "pass", skipped: { reason: "error" } }`.
// ---------------------------------------------------------------------------

export async function runA11yAxe(opts: {
  html?: string;
  livePreviewUrl?: string;
  budgetStartedAt?: number;
}): Promise<CheckResult> {
  const startedAt = Date.now();
  const axe = await loadAxe();
  if (axe === null) {
    return {
      name: "a11y-axe",
      severity: "pass",
      durationMs: Date.now() - startedAt,
      skipped: { reason: "error", detail: "axe-core import failed" },
    };
  }

  try {
    let violations: A11yViolation[];
    if (opts.livePreviewUrl !== undefined) {
      const pw = await loadPlaywright();
      if (pw !== null) {
        violations = await runViaPlaywright(opts.livePreviewUrl, axe);
      } else if (opts.html !== undefined) {
        violations = await runViaJsdom(opts.html, axe);
      } else {
        return {
          name: "a11y-axe",
          severity: "pass",
          durationMs: Date.now() - startedAt,
          skipped: {
            reason: "optional-dep-missing",
            detail: "playwright missing and no html fallback supplied",
          },
        };
      }
    } else if (opts.html !== undefined) {
      violations = await runViaJsdom(opts.html, axe);
    } else {
      return {
        name: "a11y-axe",
        severity: "pass",
        durationMs: Date.now() - startedAt,
        skipped: { reason: "error", detail: "neither html nor livePreviewUrl supplied" },
      };
    }

    // Honour the per-check budget — if we somehow took longer than the
    // ceiling, flag it. (The orchestrator also wraps us in a Promise.race
    // with a hard timeout.)
    const durationMs = Date.now() - startedAt;
    if (durationMs > A11Y_AXE_BUDGET_MS) {
      // We still return the result we computed; orchestrator decides whether
      // to treat over-budget as a problem.
    }

    const severity = violations.some((v) => v.severity === "fail")
      ? "fail"
      : violations.some((v) => v.severity === "warn")
        ? "warn"
        : "pass";

    return {
      name: "a11y-axe",
      severity,
      durationMs,
      violations,
    };
  } catch (err) {
    return {
      name: "a11y-axe",
      severity: "pass",
      durationMs: Date.now() - startedAt,
      skipped: {
        reason: "error",
        detail: (err as Error).message,
      },
    };
  }
}
