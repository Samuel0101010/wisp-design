// wisp-design — auto-init bootstrap (Phase 7, Task #20).
//
// Verifies tryAutoInit() reads script-tag query params and calls
// WispDesign.init with the extracted bridgeUrl + token.
//
// Strategy: import the module once, then spy on WispDesign.default.init and
// call tryAutoInit() directly. This avoids timing issues with module-level
// side-effects, which fire before any spy can be attached in ESM.

// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import WispDesign, { tryAutoInit } from "../../src/browser/index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function injectScriptTag(src: string, id = "wisp-design-live"): HTMLScriptElement {
  const el = document.createElement("script");
  el.id = id;
  el.src = src;
  document.head.appendChild(el);
  return el;
}

function removeAllScriptTags(): void {
  for (const el of Array.from(document.querySelectorAll("script[id]"))) {
    el.parentNode?.removeChild(el);
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("tryAutoInit — auto-bootstrap from script-tag query params", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let initSpy: any;

  beforeEach(() => {
    removeAllScriptTags();
    initSpy = vi.spyOn(WispDesign, "init").mockResolvedValue({
      state: () => ({ kind: "idle" } as never),
      pick: () => undefined,
      cancel: () => undefined,
      teardown: () => undefined,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    removeAllScriptTags();
  });

  it("calls WispDesign.init with bridgeUrl + token from the script src", async () => {
    injectScriptTag("http://127.0.0.1:31338/live.js?token=ABC");
    tryAutoInit();
    // tryAutoInit defers via queueMicrotask — drain the microtask queue.
    await new Promise<void>((resolve) => queueMicrotask(resolve));

    expect(initSpy).toHaveBeenCalledOnce();
    expect(initSpy).toHaveBeenCalledWith({
      bridgeUrl: "http://127.0.0.1:31338",
      token: "ABC",
    });
  });

  it("does NOT call init when the script tag is absent", async () => {
    // No script tag set up.
    tryAutoInit();
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    expect(initSpy).not.toHaveBeenCalled();
  });

  it("does NOT call init when token query param is missing", async () => {
    injectScriptTag("http://127.0.0.1:31338/live.js");
    tryAutoInit();
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    expect(initSpy).not.toHaveBeenCalled();
  });

  it("does NOT call init when token query param is empty string", async () => {
    injectScriptTag("http://127.0.0.1:31338/live.js?token=");
    tryAutoInit();
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    expect(initSpy).not.toHaveBeenCalled();
  });

  it("does NOT call init when id is wrong (not wisp-design-live)", async () => {
    injectScriptTag("http://127.0.0.1:31338/live.js?token=ABC", "other-script");
    tryAutoInit();
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    expect(initSpy).not.toHaveBeenCalled();
  });

  it("derives bridgeUrl from script origin (not including path or query)", async () => {
    injectScriptTag("http://127.0.0.1:31338/live.js?token=XYZ");
    tryAutoInit();
    await new Promise<void>((resolve) => queueMicrotask(resolve));

    expect(initSpy).toHaveBeenCalledWith(
      expect.objectContaining({ bridgeUrl: "http://127.0.0.1:31338" }),
    );
    const call = initSpy.mock.calls[0]?.[0] as { bridgeUrl?: string } | undefined;
    expect(call?.bridgeUrl).not.toContain("live.js");
    expect(call?.bridgeUrl).not.toContain("token");
  });
});
