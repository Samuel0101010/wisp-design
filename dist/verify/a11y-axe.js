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
var A11Y_AXE_BUDGET_MS = 800;

// src/verify/a11y-axe.ts
async function loadAxe() {
  try {
    return await import("axe-core");
  } catch {
    return null;
  }
}
async function loadJsdom() {
  try {
    return await import("jsdom");
  } catch {
    return null;
  }
}
async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch {
    return null;
  }
}
function levelFromTags(tags) {
  let highest = "A";
  for (const t of tags) {
    if (/^wcag\d{1,2}aaa$/i.test(t)) return "AAA";
    if (/^wcag\d{1,2}aa$/i.test(t)) highest = highest === "AAA" ? "AAA" : "AA";
  }
  return highest;
}
function severityFor(level, impact) {
  if (level === "AAA") return "warn";
  if (level === "AA" && (impact === "serious" || impact === "critical")) {
    return "fail";
  }
  return "warn";
}
function mapAxeViolation(v) {
  const impact = v.impact ?? "moderate";
  const level = levelFromTags(v.tags);
  const severity = severityFor(level, impact);
  const nodes = v.nodes.map((n) => {
    const selector = n.target.length === 0 ? "" : Array.isArray(n.target[0]) ? n.target[0].join(" >>> ") : n.target[0];
    return n.html !== void 0 ? { selector, html: n.html } : { selector };
  });
  const out = {
    ruleId: v.id,
    impact,
    level,
    severity,
    nodes
  };
  if (v.helpUrl !== void 0) out.helpUrl = v.helpUrl;
  return out;
}
async function tryLoadSandbox() {
  try {
    return await Promise.resolve().then(() => (init_sandbox(), sandbox_exports));
  } catch {
    return null;
  }
}
async function runViaPlaywright(livePreviewUrl, axe) {
  const pw = await loadPlaywright();
  if (pw === null) {
    throw new Error("playwright not available");
  }
  const u = new URL(livePreviewUrl);
  if (u.hostname !== "localhost" && u.hostname !== "127.0.0.1") {
    throw new Error(`a11y-axe refuses non-localhost URL: ${livePreviewUrl}`);
  }
  const sandbox = await tryLoadSandbox();
  if (sandbox !== null) {
    const { browser: browser2, page } = await sandbox.safeBrowserLaunch(livePreviewUrl);
    try {
      const p = page;
      await p.addScriptTag({ content: axe.source });
      const results = await p.evaluate(async () => {
        const a = globalThis.axe;
        return a.run(document, {
          runOnly: {
            type: "tag",
            values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]
          },
          // Exclude wisp's own floating-bar UI from the audit.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          exclude: [["[data-wisp-ui]"]]
        });
      });
      return results.violations.map(mapAxeViolation);
    } finally {
      try {
        await browser2.close();
      } catch {
      }
    }
  }
  const browser = await pw.chromium.launch({
    headless: true,
    args: ["--disable-extensions", "--no-default-browser-check", "--no-first-run"]
  });
  try {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(livePreviewUrl, { timeout: 5e3, waitUntil: "networkidle" });
    await page.addScriptTag({
      content: axe.source
    });
    const results = await page.evaluate(async () => {
      const a = globalThis.axe;
      return a.run(document, {
        runOnly: {
          type: "tag",
          values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]
        }
      });
    });
    return results.violations.map(mapAxeViolation);
  } finally {
    try {
      await browser.close();
    } catch {
    }
  }
}
async function runViaJsdom(html, axe) {
  const jsdomMod = await loadJsdom();
  if (jsdomMod === null) {
    throw new Error("jsdom not available \u2014 install jsdom for non-live a11y-axe");
  }
  const dom = new jsdomMod.JSDOM(html, {
    // Don't run scripts — axe is injected manually and we don't want
    // arbitrary author JS to execute.
    runScripts: "outside-only",
    pretendToBeVisual: true
  });
  const win = dom.window;
  const savedWindow = globalThis.window;
  const savedDocument = globalThis.document;
  const savedNavigator = globalThis.navigator;
  globalThis.window = win;
  globalThis.document = win.document;
  globalThis.navigator = win.navigator;
  try {
    const results = await axe.run(win.document, {
      runOnly: {
        type: "tag",
        values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]
      }
    });
    return results.violations.map(mapAxeViolation);
  } finally {
    globalThis.window = savedWindow;
    globalThis.document = savedDocument;
    globalThis.navigator = savedNavigator;
    try {
      dom.window.close();
    } catch {
    }
  }
}
async function runA11yAxe(opts) {
  const startedAt = Date.now();
  const axe = await loadAxe();
  if (axe === null) {
    return {
      name: "a11y-axe",
      severity: "pass",
      durationMs: Date.now() - startedAt,
      skipped: { reason: "error", detail: "axe-core import failed" }
    };
  }
  try {
    let violations;
    if (opts.livePreviewUrl !== void 0) {
      const pw = await loadPlaywright();
      if (pw !== null) {
        violations = await runViaPlaywright(opts.livePreviewUrl, axe);
      } else if (opts.html !== void 0) {
        violations = await runViaJsdom(opts.html, axe);
      } else {
        return {
          name: "a11y-axe",
          severity: "pass",
          durationMs: Date.now() - startedAt,
          skipped: {
            reason: "optional-dep-missing",
            detail: "playwright missing and no html fallback supplied"
          }
        };
      }
    } else if (opts.html !== void 0) {
      violations = await runViaJsdom(opts.html, axe);
    } else {
      return {
        name: "a11y-axe",
        severity: "pass",
        durationMs: Date.now() - startedAt,
        skipped: { reason: "error", detail: "neither html nor livePreviewUrl supplied" }
      };
    }
    const durationMs = Date.now() - startedAt;
    if (durationMs > A11Y_AXE_BUDGET_MS) {
    }
    const severity = violations.some((v) => v.severity === "fail") ? "fail" : violations.some((v) => v.severity === "warn") ? "warn" : "pass";
    return {
      name: "a11y-axe",
      severity,
      durationMs,
      violations
    };
  } catch (err) {
    return {
      name: "a11y-axe",
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
  runA11yAxe
};
//# sourceMappingURL=a11y-axe.js.map