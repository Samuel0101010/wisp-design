#!/usr/bin/env node
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/verify/_sandbox.ts
var sandbox_exports = {};
__export(sandbox_exports, {
  SandboxError: () => SandboxError,
  isLoopbackUrl: () => isLoopbackUrl,
  safeBrowserLaunch: () => safeBrowserLaunch
});
function isLoopbackUrl(u) {
  let parsed;
  try {
    parsed = new URL(u);
  } catch {
    return false;
  }
  const host = parsed.hostname.toLowerCase();
  return host === "127.0.0.1" || host === "localhost" || host === "[::1]";
}
function validateLivePreviewUrl(raw) {
  if (typeof raw !== "string" || raw === "") {
    throw new SandboxError("livePreviewUrl must be a non-empty string", "INVALID_URL", { raw });
  }
  let url;
  try {
    url = new URL(raw);
  } catch (err) {
    throw new SandboxError("livePreviewUrl is not a valid URL", "INVALID_URL", {
      raw,
      cause: err.message
    });
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new SandboxError(
      `livePreviewUrl protocol must be http or https, got "${url.protocol}"`,
      "INVALID_PROTOCOL",
      { raw, protocol: url.protocol }
    );
  }
  if (url.username !== "" || url.password !== "") {
    throw new SandboxError(
      "livePreviewUrl must not contain user:password credentials",
      "USERINFO_FORBIDDEN",
      { raw }
    );
  }
  if (!isLoopbackUrl(raw)) {
    throw new SandboxError(
      `livePreviewUrl host "${url.hostname}" is not loopback (only 127.0.0.1, localhost, [::1] allowed)`,
      "NON_LOOPBACK_URL",
      { raw, hostname: url.hostname }
    );
  }
  const portStr = url.port;
  if (portStr === "") {
    throw new SandboxError("livePreviewUrl must specify an explicit port", "INVALID_PORT", { raw });
  }
  const port = Number.parseInt(portStr, 10);
  if (!Number.isFinite(port) || port <= 1024 || port >= 65536) {
    throw new SandboxError(
      `livePreviewUrl port ${portStr} is out of allowed range (1025-65535)`,
      "INVALID_PORT",
      { raw, port: portStr }
    );
  }
  return { url, hostname: url.hostname.toLowerCase(), port };
}
function isLoopbackHostname(hostname) {
  const h = hostname.toLowerCase();
  return h === "127.0.0.1" || h === "localhost" || h === "::1" || h === "[::1]";
}
async function importChromium() {
  let mod;
  try {
    mod = await import("playwright");
  } catch (err) {
    const e = err;
    const isMissing = e.code === "ERR_MODULE_NOT_FOUND" || e.code === "MODULE_NOT_FOUND" || /Cannot find module 'playwright'/.test(e.message ?? "");
    if (isMissing) {
      throw new SandboxError(
        "playwright is not installed (optional dependency). Install with `npm i playwright` and then `npx playwright install chromium`.",
        "PLAYWRIGHT_MISSING"
      );
    }
    throw new SandboxError(
      `failed to load playwright: ${e.message ?? String(err)}`,
      "PLAYWRIGHT_MISSING",
      { cause: e }
    );
  }
  if (typeof mod.chromium?.launch !== "function") {
    throw new SandboxError("playwright loaded but `chromium.launch` is not a function", "PLAYWRIGHT_MISSING");
  }
  return mod.chromium;
}
async function safeBrowserLaunch(opts) {
  validateLivePreviewUrl(opts.livePreviewUrl);
  const budgetMs = opts.budgetMs ?? 5e3;
  const consoleBufferSize = opts.consoleBufferSize ?? 200;
  const chromium = await importChromium();
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: [
        "--disable-extensions",
        "--no-default-browser-check",
        "--no-first-run",
        "--disable-component-extensions-with-background-pages",
        "--disable-background-networking",
        "--disable-sync",
        "--disable-translate",
        "--metrics-recording-only",
        "--mute-audio",
        "--no-pings"
      ],
      timeout: budgetMs
    });
  } catch (err) {
    const msg = err.message ?? String(err);
    if (/Executable doesn't exist|browserType\.launch/i.test(msg)) {
      throw new SandboxError(
        "chromium binary missing. Run `npx playwright install chromium` once.",
        "CHROMIUM_MISSING",
        { cause: msg }
      );
    }
    throw new SandboxError(`chromium.launch failed: ${msg}`, "LAUNCH_FAILED", {
      cause: msg
    });
  }
  const context = await browser.newContext({
    acceptDownloads: false,
    permissions: []
  });
  let blockedRequestCount = 0;
  await context.route("**/*", (route, request) => {
    let reqHost;
    try {
      reqHost = new URL(request.url()).hostname;
    } catch {
      blockedRequestCount += 1;
      void route.abort("blockedbyclient");
      return;
    }
    if (!isLoopbackHostname(reqHost)) {
      blockedRequestCount += 1;
      void route.abort("blockedbyclient");
      return;
    }
    void route.continue();
  });
  const messages = [];
  const errors = [];
  let closed = false;
  function pushRing(buf, item) {
    if (buf.length >= consoleBufferSize) {
      buf.shift();
    }
    buf.push(item);
  }
  async function newPage() {
    const page = await context.newPage();
    page.setDefaultTimeout(budgetMs);
    page.on("dialog", (dialog) => {
      void dialog.dismiss().catch(() => void 0);
    });
    page.on("download", (download) => {
      void download.cancel().catch(() => void 0);
    });
    page.on("console", (msg) => {
      pushRing(messages, {
        type: msg.type(),
        text: msg.text(),
        capturedAt: (/* @__PURE__ */ new Date()).toISOString()
      });
    });
    page.on("pageerror", (err) => {
      pushRing(errors, {
        message: err.message,
        stack: err.stack,
        capturedAt: (/* @__PURE__ */ new Date()).toISOString()
      });
    });
    return page;
  }
  async function close() {
    if (closed) return;
    closed = true;
    try {
      await context.close();
    } catch {
    }
    try {
      await browser.close();
    } catch {
    }
  }
  function drainConsole() {
    const out = { messages: messages.slice(), errors: errors.slice() };
    messages.length = 0;
    errors.length = 0;
    return out;
  }
  const handle = {
    newPage,
    close,
    get blockedRequestCount() {
      return blockedRequestCount;
    },
    drainConsole
  };
  return handle;
}
var SandboxError;
var init_sandbox = __esm({
  "src/verify/_sandbox.ts"() {
    "use strict";
    SandboxError = class extends Error {
      constructor(message, code, detail) {
        super(message);
        this.code = code;
        this.detail = detail;
        this.name = "SandboxError";
      }
      code;
      detail;
    };
  }
});

// src/verify/multi-viewport.ts
import { promises as fs } from "fs";
import { dirname, join, resolve } from "path";

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
var MULTI_VIEWPORT_BUDGET_MS = 3500;
var DEFAULT_VIEWPORTS = [
  { w: 375, h: 812, label: "mobile-375" },
  { w: 768, h: 1024, label: "tablet-768" },
  { w: 1280, h: 800, label: "desktop-1280" },
  { w: 1920, h: 1080, label: "wide-1920" }
];
var DEFAULT_COLOR_SCHEMES = [
  "light",
  "dark"
];

// src/verify/multi-viewport.ts
async function loadPlaywright() {
  try {
    const m = await import("playwright");
    return m;
  } catch {
    return null;
  }
}
async function chromiumInstalled(pw) {
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
async function loadSandbox() {
  try {
    return await Promise.resolve().then(() => (init_sandbox(), sandbox_exports));
  } catch {
    return null;
  }
}
async function inlineLaunch(pw, url) {
  const u = new URL(url);
  if (u.hostname !== "localhost" && u.hostname !== "127.0.0.1") {
    throw new Error(`multi-viewport refuses non-localhost URL: ${url}`);
  }
  const browser = await pw.chromium.launch({
    headless: true,
    args: [
      "--disable-extensions",
      "--no-default-browser-check",
      "--no-first-run"
    ]
  });
  const context = await browser.newContext();
  return {
    newPage: () => context.newPage(),
    async close() {
      try {
        await context.close();
      } catch {
      }
      try {
        await browser.close();
      } catch {
      }
    }
  };
}
async function runMultiViewport(opts) {
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
        detail: "playwright not installed (optional dependency)"
      }
    };
  }
  if (!await chromiumInstalled(pw)) {
    return {
      name: "multi-viewport",
      severity: "pass",
      durationMs: Date.now() - startedAt,
      skipped: {
        reason: "optional-dep-missing",
        detail: "chromium binary not found \u2014 run `npx playwright install chromium`"
      }
    };
  }
  const dest = resolve(
    opts.projectRoot,
    ".wisp/sessions",
    opts.sessionId,
    "screenshots",
    opts.variantId
  );
  try {
    await fs.mkdir(dest, { recursive: true });
  } catch (err) {
    return {
      name: "multi-viewport",
      severity: "warn",
      durationMs: Date.now() - startedAt,
      skipped: {
        reason: "error",
        detail: `mkdir failed: ${err.message}`
      }
    };
  }
  const sandbox = await loadSandbox();
  let handle = null;
  try {
    handle = sandbox !== null ? await sandbox.safeBrowserLaunch({
      livePreviewUrl: opts.livePreviewUrl,
      budgetMs: MULTI_VIEWPORT_BUDGET_MS - 500
    }) : await inlineLaunch(pw, opts.livePreviewUrl);
    const screenshots = [];
    for (const vp of DEFAULT_VIEWPORTS) {
      if (Date.now() - budgetBase > MULTI_VIEWPORT_BUDGET_MS - 400) break;
      const page = await handle.newPage();
      try {
        await page.setViewportSize({ width: vp.w, height: vp.h });
        await page.goto(opts.livePreviewUrl, {
          timeout: 4e3,
          waitUntil: "domcontentloaded"
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
            path: outPath
          });
        }
      } finally {
        try {
          await page.close();
        } catch {
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
      violations: []
    };
  } catch (err) {
    return {
      name: "multi-viewport",
      severity: "warn",
      durationMs: Date.now() - startedAt,
      skipped: {
        reason: "error",
        detail: err.message
      }
    };
  } finally {
    if (handle !== null) {
      try {
        await handle.close();
      } catch {
      }
    }
  }
}
export {
  runMultiViewport
};
//# sourceMappingURL=multi-viewport.js.map