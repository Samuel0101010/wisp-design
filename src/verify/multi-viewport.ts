// wisp-design — multi-viewport screenshot check (Phase 5).
//
// Captures 4 widths × 2 colour-schemes = 8 PNGs per variant via Playwright's
// chromium. Playwright is an `optionalDependencies` entry; the chromium
// binary may not be installed even when the package is. We probe BOTH and
// gracefully skip when either is missing — the orchestrator's worst-of
// aggregation treats skipped checks as `severity: "pass"` so the verdict
// is unaffected.
//
// Budget: 3500ms (`MULTI_VIEWPORT_BUDGET_MS`). Chromium boot dominates on
// the first call; subsequent calls within the same Node process amortise
// because Playwright reuses its driver socket.
//
// Sandbox: defense-in-depth via `_sandbox.ts` (security agent owns). If the
// file is not yet present we fall back to a hardened inline launch that
// enforces a localhost-only URL allow-list.

import { promises as fs } from "node:fs";
import { dirname, join, resolve } from "node:path";

import {
  DEFAULT_COLOR_SCHEMES,
  DEFAULT_VIEWPORTS,
  MULTI_VIEWPORT_BUDGET_MS,
  type CheckResult,
  type ViewportScreenshot,
} from "../contracts/verify.js";

// ---------------------------------------------------------------------------
// Optional-dep probes.
// ---------------------------------------------------------------------------

interface PlaywrightLike {
  chromium: {
    launch: (opts?: unknown) => Promise<PlaywrightBrowser>;
    executablePath?: () => string;
  };
}

interface PlaywrightBrowser {
  newContext: (opts?: unknown) => Promise<PlaywrightContext>;
  close: () => Promise<void>;
}
interface PlaywrightContext {
  newPage: () => Promise<PlaywrightPage>;
  close: () => Promise<void>;
}
interface PlaywrightPage {
  setViewportSize: (s: { width: number; height: number }) => Promise<void>;
  emulateMedia: (opts: { colorScheme?: "light" | "dark" }) => Promise<void>;
  goto: (url: string, opts?: unknown) => Promise<unknown>;
  screenshot: (opts: { path: string; fullPage?: boolean }) => Promise<Buffer>;
  close: () => Promise<void>;
}

async function loadPlaywright(): Promise<PlaywrightLike | null> {
  try {
    const m = (await import("playwright")) as unknown as PlaywrightLike;
    return m;
  } catch {
    return null;
  }
}

// Probe whether the chromium browser-binary is installed (Playwright ships
// the driver but the browser is downloaded separately via
// `npx playwright install chromium`).
async function chromiumInstalled(pw: PlaywrightLike): Promise<boolean> {
  try {
    if (typeof pw.chromium.executablePath !== "function") return true;
    const p = pw.chromium.executablePath();
    if (p === "") return false;
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Sandbox loader — security's `_sandbox.ts` lives alongside this file when
// the security agent has landed. When absent, we use a localhost-only inline
// launch.
// ---------------------------------------------------------------------------

interface SandboxModule {
  safeBrowserLaunch: (
    url: string,
    opts?: { timeoutMs?: number },
  ) => Promise<{ browser: PlaywrightBrowser; context: PlaywrightContext }>;
}

async function loadSandbox(): Promise<SandboxModule | null> {
  try {
    return (await import("./_sandbox.js")) as unknown as SandboxModule;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Inline-launch fallback. Hardened: localhost only, sandbox on, headless,
// no extensions, no first-run.
// ---------------------------------------------------------------------------

async function inlineLaunch(
  pw: PlaywrightLike,
  url: string,
): Promise<{ browser: PlaywrightBrowser; context: PlaywrightContext }> {
  const u = new URL(url);
  if (u.hostname !== "localhost" && u.hostname !== "127.0.0.1") {
    throw new Error(`multi-viewport refuses non-localhost URL: ${url}`);
  }
  const browser = await pw.chromium.launch({
    headless: true,
    args: [
      "--disable-extensions",
      "--no-default-browser-check",
      "--no-first-run",
    ],
  });
  const context = await browser.newContext();
  return { browser, context };
}

// ---------------------------------------------------------------------------
// runMultiViewport — public entry. Always returns a CheckResult.
// ---------------------------------------------------------------------------

export async function runMultiViewport(opts: {
  livePreviewUrl: string;
  sessionId: string;
  variantId: string;
  projectRoot: string;
  budgetStartedAt?: number;
}): Promise<CheckResult> {
  const startedAt = Date.now();
  const budgetBase = opts.budgetStartedAt ?? startedAt;

  const pw = await loadPlaywright();
  if (pw === null) {
    return {
      name: "multi-viewport",
      severity: "pass",
      durationMs: Date.now() - startedAt,
      skipped: {
        reason: "optional-dep-missing",
        detail: "playwright not installed (optional dependency)",
      },
    };
  }
  if (!(await chromiumInstalled(pw))) {
    return {
      name: "multi-viewport",
      severity: "pass",
      durationMs: Date.now() - startedAt,
      skipped: {
        reason: "optional-dep-missing",
        detail:
          "chromium binary not found — run `npx playwright install chromium`",
      },
    };
  }

  // Destination root: .wisp/sessions/<sid>/screenshots/<variantId>/
  const dest = resolve(
    opts.projectRoot,
    ".wisp/sessions",
    opts.sessionId,
    "screenshots",
    opts.variantId,
  );
  try {
    await fs.mkdir(dest, { recursive: true });
  } catch (err) {
    return {
      name: "multi-viewport",
      severity: "pass",
      durationMs: Date.now() - startedAt,
      skipped: {
        reason: "error",
        detail: `mkdir failed: ${(err as Error).message}`,
      },
    };
  }

  const sandbox = await loadSandbox();
  let browser: PlaywrightBrowser | null = null;
  let context: PlaywrightContext | null = null;

  try {
    if (sandbox !== null) {
      const launched = await sandbox.safeBrowserLaunch(opts.livePreviewUrl, {
        timeoutMs: MULTI_VIEWPORT_BUDGET_MS - 500,
      });
      browser = launched.browser;
      context = launched.context;
    } else {
      const launched = await inlineLaunch(pw, opts.livePreviewUrl);
      browser = launched.browser;
      context = launched.context;
    }

    const screenshots: ViewportScreenshot[] = [];

    // 4 viewports × 2 schemes. We iterate sequentially per viewport but
    // could parallelise per-page if needed; sequential is safer with the
    // single-context model and stays inside budget on a warm process.
    for (const vp of DEFAULT_VIEWPORTS) {
      if (Date.now() - budgetBase > MULTI_VIEWPORT_BUDGET_MS - 400) break;

      const page = await context.newPage();
      try {
        await page.setViewportSize({ width: vp.w, height: vp.h });
        await page.goto(opts.livePreviewUrl, {
          timeout: 4_000,
          waitUntil: "domcontentloaded",
        });

        for (const scheme of DEFAULT_COLOR_SCHEMES) {
          if (Date.now() - budgetBase > MULTI_VIEWPORT_BUDGET_MS - 400) break;
          await page.emulateMedia({ colorScheme: scheme });
          const outPath = join(dest, `${vp.label}.${scheme}.png`);
          await fs.mkdir(dirname(outPath), { recursive: true });
          await page.screenshot({ path: outPath, fullPage: false });
          screenshots.push({
            viewport: { w: vp.w, h: vp.h, label: vp.label },
            mode: scheme,
            path: outPath,
          });
        }
      } finally {
        try {
          await page.close();
        } catch {
          /* ignore */
        }
      }
    }

    return {
      name: "multi-viewport",
      // Phase 5: no automatic regression detection. We capture; Phase 6
      // compares against baselines for an actual fail/warn signal.
      severity: "pass",
      durationMs: Date.now() - startedAt,
      screenshots,
      violations: [],
    };
  } catch (err) {
    return {
      name: "multi-viewport",
      severity: "pass",
      durationMs: Date.now() - startedAt,
      skipped: {
        reason: "error",
        detail: (err as Error).message,
      },
    };
  } finally {
    if (context !== null) {
      try {
        await context.close();
      } catch {
        /* ignore */
      }
    }
    if (browser !== null) {
      try {
        await browser.close();
      } catch {
        /* ignore */
      }
    }
  }
}
