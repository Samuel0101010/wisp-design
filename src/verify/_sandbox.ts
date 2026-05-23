// wisp-design — Playwright sandbox wrappers (Phase 5).
//
// Every Playwright launch in the verify layer flows through `safeBrowserLaunch`.
// `multi-viewport.ts` (and any other check that needs a real browser) MUST NOT
// call `chromium.launch` directly.
//
// Defense in depth: (1) loopback http(s) URL allow-list refuses BEFORE chromium
// boots — catches a bridge-tamper that could otherwise point chromium at an
// attacker host. (2) Restricted launch args (sandbox ON, extensions OFF,
// background networking OFF). (3) Per-context route handler aborts any request
// to a non-loopback host — belt-and-suspenders against redirects /
// meta-refresh / window.location at runtime.
//
// `safeBrowserLaunch` dynamic-imports `playwright`. Optional-dep model — when
// absent, throws SandboxError; caller emits `{ skipped: "optional-dep-missing" }`.

import type { Browser, BrowserContext, ConsoleMessage, Page } from "playwright";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface SafeBrowserLaunchOptions {
  // Validated here BEFORE chromium boots — refusing early avoids the
  // ~1.5s launch cost on a hostile URL.
  livePreviewUrl: string;
  // Hard ceiling for launch + per-page timeouts. Default 5000ms — fits
  // MULTI_VIEWPORT_BUDGET_MS minus screenshot capture overhead.
  budgetMs?: number;
  // Ring-buffer size for collected console + pageerror events.
  consoleBufferSize?: number;
}

export interface CapturedConsoleMessage {
  type: ConsoleMessage["type"] extends () => infer R ? R : string;
  text: string;
  // ISO timestamp of capture.
  capturedAt: string;
}

export interface CapturedPageError {
  message: string;
  stack?: string;
  capturedAt: string;
}

export interface SafeBrowserHandle {
  // Wrapped page: dialog/download auto-dismiss + console/pageerror capture.
  newPage(): Promise<Page>;
  close(): Promise<void>;
  // Incremented every time the route handler aborts a non-loopback request.
  readonly blockedRequestCount: number;
  // Drain + clear collected console + pageerror events.
  drainConsole(): { messages: CapturedConsoleMessage[]; errors: CapturedPageError[] };
}

export class SandboxError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "INVALID_URL"
      | "NON_LOOPBACK_URL"
      | "INVALID_PROTOCOL"
      | "INVALID_PORT"
      | "USERINFO_FORBIDDEN"
      | "PLAYWRIGHT_MISSING"
      | "CHROMIUM_MISSING"
      | "LAUNCH_FAILED",
    public readonly detail?: unknown,
  ) {
    super(message);
    this.name = "SandboxError";
  }
}

// ---------------------------------------------------------------------------
// Loopback URL guard — exported for tests.
// Conservative policy: accepts only "127.0.0.1", "localhost", "[::1]" (case-
// insensitive). Rejects "0.0.0.0" (all-interfaces bind exposes dev to LAN)
// and the broader 127.0.0.2..255 range (RFC1122 calls all 127/8 loopback but
// rejecting forces explicit override). Rejects IPv6 link-local / unique-local.
// ---------------------------------------------------------------------------

export function isLoopbackUrl(u: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(u);
  } catch {
    return false;
  }
  const host = parsed.hostname.toLowerCase();
  return host === "127.0.0.1" || host === "localhost" || host === "[::1]";
}

// ---------------------------------------------------------------------------
// validateLivePreviewUrl — defence-in-depth URL guard. Pure-function;
// throws SandboxError on any violation. Each rule has a `// WHY` rationale.
// ---------------------------------------------------------------------------

interface ValidatedUrl {
  url: URL;
  hostname: string;
  port: number;
}

function validateLivePreviewUrl(raw: string): ValidatedUrl {
  // 1) Type guard — defensive against bridge events with non-string fields.
  if (typeof raw !== "string" || raw === "") {
    throw new SandboxError("livePreviewUrl must be a non-empty string", "INVALID_URL", { raw });
  }

  // 2) Parse via WHATWG URL — string-regex validation is brittle (port edge
  // cases, IPv6 brackets, percent-encoding); URL ctor is the canonical parser.
  let url: URL;
  try {
    url = new URL(raw);
  } catch (err) {
    throw new SandboxError("livePreviewUrl is not a valid URL", "INVALID_URL", {
      raw,
      cause: (err as Error).message,
    });
  }

  // 3) Protocol allow-list — `file:` lets chromium read the local fs;
  // `javascript:` runs script with no origin; `data:` carries attacker HTML;
  // `ftp:` is historically exploitable. Only http(s) is meaningful here.
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new SandboxError(
      `livePreviewUrl protocol must be http or https, got "${url.protocol}"`,
      "INVALID_PROTOCOL",
      { raw, protocol: url.protocol },
    );
  }

  // 4) Userinfo forbidden — `http://user:pass@127.0.0.1/` would force chromium
  // to send attacker-controlled HTTP basic-auth. No legitimate Live-Mode flow
  // sets credentials on the preview URL.
  if (url.username !== "" || url.password !== "") {
    throw new SandboxError(
      "livePreviewUrl must not contain user:password credentials",
      "USERINFO_FORBIDDEN",
      { raw },
    );
  }

  // 5) Loopback-only — the core safety property. A bridge tamper that swaps
  // the URL for `http://evil.example/` would otherwise expose headless
  // chromium (and any cached state) to an attacker.
  if (!isLoopbackUrl(raw)) {
    throw new SandboxError(
      `livePreviewUrl host "${url.hostname}" is not loopback (only 127.0.0.1, localhost, [::1] allowed)`,
      "NON_LOOPBACK_URL",
      { raw, hostname: url.hostname },
    );
  }

  // 6) Port range — privileged ports (≤1024) need root and aren't used by
  // dev servers; empty port (default 80/443) signals the URL wasn't
  // sanitised; > 65535 is impossible per spec but rechecked.
  const portStr = url.port;
  if (portStr === "") {
    throw new SandboxError("livePreviewUrl must specify an explicit port", "INVALID_PORT", { raw });
  }
  const port = Number.parseInt(portStr, 10);
  if (!Number.isFinite(port) || port <= 1024 || port >= 65536) {
    throw new SandboxError(
      `livePreviewUrl port ${portStr} is out of allowed range (1025-65535)`,
      "INVALID_PORT",
      { raw, port: portStr },
    );
  }

  return { url, hostname: url.hostname.toLowerCase(), port };
}

// ---------------------------------------------------------------------------
// Internal: per-request route guard. Belt-and-suspenders against subsequent
// navigations / sub-resources / XHRs that the page itself might issue.
// ---------------------------------------------------------------------------

function isLoopbackHostname(hostname: string): boolean {
  const h = hostname.toLowerCase();
  // For Playwright requests, IPv6 hostnames appear without brackets.
  return h === "127.0.0.1" || h === "localhost" || h === "::1" || h === "[::1]";
}

// ---------------------------------------------------------------------------
// Dynamic chromium import — throws SandboxError when package or binary missing.
// Caller should pre-probe via doctor's OptionalDepProbe; this is a safety net.
// ---------------------------------------------------------------------------

interface PlaywrightChromium {
  launch(opts: {
    headless?: boolean;
    args?: string[];
    timeout?: number;
  }): Promise<Browser>;
}

async function importChromium(): Promise<PlaywrightChromium> {
  let mod: { chromium: PlaywrightChromium };
  try {
    mod = (await import("playwright")) as unknown as { chromium: PlaywrightChromium };
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    const isMissing =
      e.code === "ERR_MODULE_NOT_FOUND" ||
      e.code === "MODULE_NOT_FOUND" ||
      /Cannot find module 'playwright'/.test(e.message ?? "");
    if (isMissing) {
      throw new SandboxError(
        "playwright is not installed (optional dependency). Install with `npm i playwright` and then `npx playwright install chromium`.",
        "PLAYWRIGHT_MISSING",
      );
    }
    throw new SandboxError(
      `failed to load playwright: ${e.message ?? String(err)}`,
      "PLAYWRIGHT_MISSING",
      { cause: e },
    );
  }
  if (typeof mod.chromium?.launch !== "function") {
    throw new SandboxError("playwright loaded but `chromium.launch` is not a function", "PLAYWRIGHT_MISSING");
  }
  return mod.chromium;
}

// ---------------------------------------------------------------------------
// safeBrowserLaunch — the public entry point.
// ---------------------------------------------------------------------------

export async function safeBrowserLaunch(
  opts: SafeBrowserLaunchOptions,
): Promise<SafeBrowserHandle> {
  // Validate URL FIRST — refuse before chromium boots.
  validateLivePreviewUrl(opts.livePreviewUrl);

  const budgetMs = opts.budgetMs ?? 5000;
  const consoleBufferSize = opts.consoleBufferSize ?? 200;

  const chromium = await importChromium();

  // Launch flags suppress: extensions/profile churn, background networking
  // (auto-update, safebrowsing), sync, translate-probe, telemetry, audio
  // probe, <a ping> exfil. Sandbox stays ON — we never pass --no-sandbox.
  let browser: Browser;
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
        "--no-pings",
      ],
      timeout: budgetMs,
    });
  } catch (err) {
    const msg = (err as Error).message ?? String(err);
    // Missing chromium binary → recognisable phrase from Playwright.
    if (/Executable doesn't exist|browserType\.launch/i.test(msg)) {
      throw new SandboxError(
        "chromium binary missing. Run `npx playwright install chromium` once.",
        "CHROMIUM_MISSING",
        { cause: msg },
      );
    }
    throw new SandboxError(`chromium.launch failed: ${msg}`, "LAUNCH_FAILED", {
      cause: msg,
    });
  }

  // Create a restricted context. No downloads, no credentials, no permissions.
  const context: BrowserContext = await browser.newContext({
    acceptDownloads: false,
    permissions: [],
  });

  // Route-level loopback enforcement. Counter is closed-over by the route
  // handler so the SafeBrowserHandle can expose it for diagnostics.
  let blockedRequestCount = 0;
  await context.route("**/*", (route, request) => {
    let reqHost: string;
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

  const messages: CapturedConsoleMessage[] = [];
  const errors: CapturedPageError[] = [];
  let closed = false;

  function pushRing<T>(buf: T[], item: T): void {
    if (buf.length >= consoleBufferSize) {
      buf.shift();
    }
    buf.push(item);
  }

  async function newPage(): Promise<Page> {
    const page = await context.newPage();
    page.setDefaultTimeout(budgetMs);

    // Auto-dismiss dialogs — untrusted page content could fire alert/confirm/
    // prompt and hang headless chromium until the budget expires.
    page.on("dialog", (dialog) => {
      void dialog.dismiss().catch(() => undefined);
    });
    // Belt-and-suspenders — acceptDownloads:false already blocks them.
    page.on("download", (download) => {
      void download.cancel().catch(() => undefined);
    });

    page.on("console", (msg) => {
      pushRing(messages, {
        type: msg.type() as CapturedConsoleMessage["type"],
        text: msg.text(),
        capturedAt: new Date().toISOString(),
      });
    });

    page.on("pageerror", (err) => {
      pushRing(errors, {
        message: err.message,
        stack: err.stack,
        capturedAt: new Date().toISOString(),
      });
    });

    return page;
  }

  async function close(): Promise<void> {
    if (closed) return;
    closed = true;
    try {
      await context.close();
    } catch {
      // ignore — best-effort cleanup
    }
    try {
      await browser.close();
    } catch {
      // ignore
    }
  }

  function drainConsole(): {
    messages: CapturedConsoleMessage[];
    errors: CapturedPageError[];
  } {
    const out = { messages: messages.slice(), errors: errors.slice() };
    messages.length = 0;
    errors.length = 0;
    return out;
  }

  // `blockedRequestCount` reads through a getter so callers see live counts.
  const handle: SafeBrowserHandle = {
    newPage,
    close,
    get blockedRequestCount(): number {
      return blockedRequestCount;
    },
    drainConsole,
  };
  return handle;
}
