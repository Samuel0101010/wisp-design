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
    const mod = (await import("axe-core")) as unknown as { default?: AxeModule } & AxeModule;
    // axe-core ships CJS. On Node 22's ESM bridge, a CJS module exposes its
    // exports as the `default` property of the imported namespace. Older
    // versions / different loaders return the same object as the top-level
    // namespace. Pick whichever side carries `.run`.
    if (mod.default !== undefined && typeof (mod.default as { run?: unknown }).run === "function") {
      return mod.default;
    }
    return mod as AxeModule;
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
  // Concrete message for the formatter (audit.ts expects `.message` per
  // violation). axe's `help` is the human-readable title (e.g. "Buttons
  // must have discernible text"); fall back to ruleId if missing.
  const vUnknown = v as unknown as { help?: unknown };
  const baseHelp = typeof vUnknown.help === "string" ? vUnknown.help : v.id;
  const firstSelector = nodes.length > 0 ? nodes[0]?.selector ?? "" : "";
  const message =
    firstSelector !== ""
      ? `${baseHelp} (${firstSelector}${nodes.length > 1 ? ` +${nodes.length - 1} more` : ""})`
      : baseHelp;
  const out: A11yViolation = {
    ruleId: v.id,
    impact,
    level,
    severity,
    nodes,
    message,
  };
  if (v.helpUrl !== undefined) out.helpUrl = v.helpUrl;
  return out;
}

// ---------------------------------------------------------------------------
// runViaPlaywright — navigate via chromium through the hardened
// `_sandbox.ts > safeBrowserLaunch` wrapper, inject `axe.source`, evaluate
// `axe.run(document, …)` in-page. The live browser computes real rendered
// styles — this is what makes color-contrast on inline styles (e.g.
// `<p style="color:#b8b8b8;background:#ffffff">`) actually fire, where jsdom
// silently misses it.
//
// All hardening (URL guards, chromium flags, restricted context, route-block
// of non-loopback hosts) lives in `_sandbox.ts`. We never call
// `chromium.launch` directly.
// ---------------------------------------------------------------------------

// Shape we read from `./_sandbox.js`. Kept narrow so a future sandbox API
// change is loud-fail rather than silent-skip.
interface SafeBrowserHandleLike {
  newPage(): Promise<{
    goto: (url: string, opts?: unknown) => Promise<unknown>;
    addScriptTag: (opts: { content: string }) => Promise<unknown>;
    evaluate: (fn: () => Promise<AxeResults>) => Promise<AxeResults>;
    close: () => Promise<void>;
  }>;
  close: () => Promise<void>;
}

interface SandboxModule {
  safeBrowserLaunch: (opts: {
    livePreviewUrl: string;
    budgetMs?: number;
  }) => Promise<SafeBrowserHandleLike>;
}

async function loadSandbox(): Promise<SandboxModule | null> {
  try {
    return (await import("./_sandbox.js")) as unknown as SandboxModule;
  } catch {
    return null;
  }
}

async function runViaPlaywright(
  livePreviewUrl: string,
  axe: AxeModule,
): Promise<A11yViolation[]> {
  const sandbox = await loadSandbox();
  if (sandbox === null) {
    throw new Error("sandbox not available");
  }

  // safeBrowserLaunch validates the URL (loopback-only, http(s), explicit
  // non-privileged port, no userinfo) and throws SandboxError on violation.
  // We rethrow as-is so runA11yAxe's catch surfaces it as a warn skip.
  const handle = await sandbox.safeBrowserLaunch({
    livePreviewUrl,
    budgetMs: A11Y_AXE_BUDGET_MS,
  });

  try {
    const page = await handle.newPage();
    try {
      await page.goto(livePreviewUrl, {
        timeout: A11Y_AXE_BUDGET_MS,
        waitUntil: "domcontentloaded",
      });
      // `axe.source` is the standalone bundle as a string — inject it into
      // the page so `window.axe` exists for the evaluate() call below.
      await page.addScriptTag({
        content: (axe as unknown as { source: string }).source,
      });
      const results = await page.evaluate(async (): Promise<AxeResults> => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const a = (globalThis as any).axe as {
          run: (ctx: unknown, opts: unknown) => Promise<AxeResults>;
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
      });
      return results.violations.map(mapAxeViolation);
    } finally {
      try {
        await page.close();
      } catch {
        /* ignore */
      }
    }
  } finally {
    try {
      await handle.close();
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
    // Suppress jsdom console noise (resource-load warnings etc.) so they
    // don't leak into the wisp-design audit output.
    virtualConsole: new jsdomMod.VirtualConsole(),
    // Default `resources` (undefined) means jsdom does NOT fetch external
    // resources — <link href="cdn.tailwind..."> is silently ignored. This is
    // what we want: no network I/O, no timeout hanging on CDN fetches.
  });

  // axe-core needs globals to exist BEFORE its module is evaluated. We
  // already imported it (at the top of run()), so we splice the globals
  // onto `globalThis` for the duration of the run and restore after.
  //
  // Node 21+ made `navigator` a read-only Web-API getter on `globalThis`, so
  // plain assignment (`globalThis.navigator = win.navigator`) throws
  // `Cannot set property navigator of #<Object> which has only a getter`. We
  // use `Object.defineProperty` with `configurable: true` so both the
  // splice and the restore work on Node 22 LTS (and older).
  const win = dom.window;
  const spliceGlobal = (key: "window" | "document" | "navigator", value: unknown): unknown => {
    const desc = Object.getOwnPropertyDescriptor(globalThis, key);
    const prev = desc !== undefined && "value" in desc ? desc.value : (globalThis as Record<string, unknown>)[key];
    Object.defineProperty(globalThis, key, {
      value,
      configurable: true,
      writable: true,
      enumerable: true,
    });
    return prev;
  };
  const restoreGlobal = (key: "window" | "document" | "navigator", value: unknown): void => {
    Object.defineProperty(globalThis, key, {
      value,
      configurable: true,
      writable: true,
      enumerable: true,
    });
  };
  const savedWindow = spliceGlobal("window", win);
  const savedDocument = spliceGlobal("document", win.document);
  const savedNavigator = spliceGlobal("navigator", win.navigator);
  try {
    // axe-core's `run()` accepts a Document, Element, NodeList, or selector.
    // jsdom's Document does not pass axe-core's `instanceof Document` check
    // because axe-core captured `Document` from the host realm at import
    // time, before we spliced jsdom's globals. Passing `documentElement`
    // (a clearly-typed Element) bypasses the Document-check and lets axe
    // use jsdom's tree as the root.
    const results = (await axe.run(win.document.documentElement, {
      runOnly: {
        type: "tag",
        values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"],
      },
    } as Parameters<AxeModule["run"]>[1])) as unknown as AxeResults;
    return results.violations.map(mapAxeViolation);
  } finally {
    restoreGlobal("window", savedWindow);
    restoreGlobal("document", savedDocument);
    restoreGlobal("navigator", savedNavigator);
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
    // axe-core is a regular dependency (not optional); failure to import is a
    // genuine runtime error, not a graceful skip.
    return {
      name: "a11y-axe",
      severity: "warn",
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
        // Playwright absent but html fallback is available — use jsdom path.
        violations = await runViaJsdom(opts.html, axe);
      } else {
        // Playwright is an optional dep; missing it without html fallback is a
        // genuine optional-dep skip — not an error. Severity stays "pass" so
        // the verdict isn't poisoned when the user hasn't installed playwright.
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
      // Neither html nor livePreviewUrl — caller error; surface as warn.
      return {
        name: "a11y-axe",
        severity: "warn",
        durationMs: Date.now() - startedAt,
        skipped: { reason: "error", detail: "neither html nor livePreviewUrl supplied" },
      };
    }

    const durationMs = Date.now() - startedAt;
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
    // Runtime error (jsdom parse failure, axe threw, chromium binary missing
    // after playwright loaded, etc.) → warn. The user should know the check
    // didn't run, but a runtime error shouldn't hard-block the accept.
    return {
      name: "a11y-axe",
      severity: "warn",
      durationMs: Date.now() - startedAt,
      skipped: {
        reason: "error",
        detail: (err as Error).message,
      },
    };
  }
}
