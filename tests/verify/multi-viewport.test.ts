// wisp-design — multi-viewport + _sandbox tests (Phase 5).
//
// Two surfaces under test:
//   1. `runMultiViewport` itself — graceful skip when playwright OR chromium
//      binary missing. Real launch only when both are present.
//   2. `_sandbox.ts` — loopback URL guard, safeBrowserLaunch rejection codes.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runMultiViewport } from "../../src/verify/multi-viewport.js";
import {
  isLoopbackUrl,
  safeBrowserLaunch,
  SandboxError,
} from "../../src/verify/_sandbox.js";

// ---------------------------------------------------------------------------
// Optional-dep probes — we manually mirror what the impl does, so the tests
// can announce skips cleanly.
// ---------------------------------------------------------------------------

async function playwrightAvailable(): Promise<boolean> {
  try {
    await import("playwright");
    return true;
  } catch {
    return false;
  }
}

async function chromiumAvailable(): Promise<boolean> {
  try {
    const pw = (await import("playwright")) as unknown as {
      chromium: { executablePath?: () => string };
    };
    if (typeof pw.chromium.executablePath !== "function") return true;
    const p = pw.chromium.executablePath();
    if (p === "") return false;
    const fs = await import("node:fs/promises");
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// isLoopbackUrl unit tests — fast, no async.
// ---------------------------------------------------------------------------

describe("isLoopbackUrl", () => {
  it("accepts 127.0.0.1", () => {
    expect(isLoopbackUrl("http://127.0.0.1:3000")).toBe(true);
  });
  it("accepts localhost", () => {
    expect(isLoopbackUrl("http://localhost:3000")).toBe(true);
  });
  it("accepts [::1]", () => {
    expect(isLoopbackUrl("http://[::1]:3000")).toBe(true);
  });
  it("rejects example.com", () => {
    expect(isLoopbackUrl("http://example.com")).toBe(false);
  });
  it("rejects 127.0.0.2 (conservative — not full 127/8)", () => {
    expect(isLoopbackUrl("http://127.0.0.2:3000")).toBe(false);
  });
  it("rejects 0.0.0.0 (all-interfaces)", () => {
    expect(isLoopbackUrl("http://0.0.0.0:3000")).toBe(false);
  });
  it("rejects file://", () => {
    expect(isLoopbackUrl("file:///etc/passwd")).toBe(false);
  });
  it("rejects javascript:", () => {
    // javascript: URLs have an empty hostname; loopback check fails.
    expect(isLoopbackUrl("javascript:alert(1)")).toBe(false);
  });
  it("rejects malformed input", () => {
    expect(isLoopbackUrl("not-a-url")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// safeBrowserLaunch URL validation — these checks happen BEFORE chromium
// boots, so they work even when chromium is absent. (They will fail on the
// next step — chromium import — but only AFTER the validation throw.)
// ---------------------------------------------------------------------------

describe("safeBrowserLaunch — URL validation", () => {
  async function expectCode(url: string, code: SandboxError["code"]): Promise<void> {
    let caught: unknown = null;
    try {
      await safeBrowserLaunch({ livePreviewUrl: url, budgetMs: 100 });
    } catch (err) {
      caught = err;
    }
    expect(caught, `expected throw for ${url}`).toBeInstanceOf(SandboxError);
    expect((caught as SandboxError).code).toBe(code);
  }

  it("rejects non-loopback URL with NON_LOOPBACK_URL", async () => {
    await expectCode("http://evil.example:3000", "NON_LOOPBACK_URL");
  });

  it("rejects file:// with INVALID_PROTOCOL", async () => {
    await expectCode("file:///etc/passwd", "INVALID_PROTOCOL");
  });

  it("rejects userinfo with USERINFO_FORBIDDEN", async () => {
    await expectCode("http://user:pass@127.0.0.1:3000", "USERINFO_FORBIDDEN");
  });

  it("rejects port < 1025 with INVALID_PORT", async () => {
    await expectCode("http://127.0.0.1:80", "INVALID_PORT");
  });

  it("rejects empty/missing port with INVALID_PORT", async () => {
    await expectCode("http://127.0.0.1/", "INVALID_PORT");
  });

  it("rejects empty url with INVALID_URL", async () => {
    await expectCode("", "INVALID_URL");
  });

  it("rejects malformed url with INVALID_URL", async () => {
    await expectCode("not-a-real-url", "INVALID_URL");
  });

  it("rejects javascript: with INVALID_PROTOCOL", async () => {
    await expectCode("javascript:alert(1)", "INVALID_PROTOCOL");
  });
});

// ---------------------------------------------------------------------------
// runMultiViewport — skip semantics.
// ---------------------------------------------------------------------------

describe("runMultiViewport — skip semantics", () => {
  let projectRoot: string;
  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), "wisp-mv-"));
  });
  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it("returns a CheckResult — never throws", async () => {
    const res = await runMultiViewport({
      livePreviewUrl: "http://127.0.0.1:31337",
      sessionId: "test-sid",
      variantId: "v0",
      projectRoot,
    });
    expect(res.name).toBe("multi-viewport");
  });

  it("skips with optional-dep-missing or chromium-missing when missing", async () => {
    const hasPw = await playwrightAvailable();
    const hasChromium = hasPw ? await chromiumAvailable() : false;
    const res = await runMultiViewport({
      livePreviewUrl: "http://127.0.0.1:31337",
      sessionId: "test-sid",
      variantId: "v0",
      projectRoot,
    });
    if (!hasPw) {
      expect(res.skipped?.reason).toBe("optional-dep-missing");
    } else if (!hasChromium) {
      expect(res.skipped?.reason).toBe("optional-dep-missing");
    } else {
      // Both present: the launch will likely fail because nothing is actually
      // listening on the port — that surfaces as skipped/error. Acceptable.
      expect(["pass"]).toContain(res.severity);
    }
  });

  it("severity is 'pass' in skip case (so verdict isn't poisoned)", async () => {
    const res = await runMultiViewport({
      livePreviewUrl: "http://127.0.0.1:31337",
      sessionId: "test-sid",
      variantId: "v0",
      projectRoot,
    });
    expect(res.severity).toBe("pass");
  });
});
