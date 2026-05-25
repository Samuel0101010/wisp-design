// wisp-design — Bug #22 regression test.
//
// Confirms that dispatchEvent handles the "generating" event kind (not the
// old "configure" typo) and that ev.variantCount is respected, capped by
// flags.maxVariants.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import type { BridgeEvent } from "../../src/contracts/bridge.js";
import type { LiveCliFlags, LiveSessionState } from "../../src/contracts/live.js";

// ---------------------------------------------------------------------------
// Minimal fakes for sessionLogger and postEvent
// ---------------------------------------------------------------------------

// We mock the dynamic imports used inside dispatchEvent via vi.mock at the
// module level. vitest hoists these before the first import.

vi.mock("../../src/session/logger.js", () => ({
  sessionLogger: {
    logConfigure: vi.fn().mockResolvedValue(undefined),
    logVariantsEmitted: vi.fn().mockResolvedValue(undefined),
    logAccept: vi.fn().mockResolvedValue(undefined),
    logVerifyReport: vi.fn().mockResolvedValue(undefined),
    log: vi.fn().mockResolvedValue(undefined),
    start: vi.fn().mockResolvedValue(undefined),
    end: vi.fn().mockResolvedValue(undefined),
  },
}));

const postEventMock = vi.fn().mockResolvedValue({ ok: true, cursor: "c1" });

vi.mock("../../src/agent/poll-loop.js", () => ({
  postEvent: postEventMock,
  pollOnce: vi.fn(),
  routeEvent: vi.fn(),
}));

// Also mock verify/gate so "accept" path doesn't try to boot Playwright.
vi.mock("../../src/verify/gate.js", () => ({
  run: vi.fn().mockResolvedValue({
    verdict: "pass",
    mode: "live-accept",
    checks: [],
    timing: { totalMs: 1, budgetMs: 3000, budgetExceeded: false },
    hardBanCount: 0,
    a11yFailCount: 0,
    warningCount: 0,
    blocked: false,
  }),
}));

// ---------------------------------------------------------------------------
// Import the unit under test AFTER mocks are established.
// ---------------------------------------------------------------------------

import { dispatchEvent, generateVariantsStub } from "../../src/agent/live.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const sampleTarget = {
  selector: "test-selector",
  tag: "div",
  rect: { x: 0, y: 0, w: 100, h: 50 },
} as const;

function makeState(override: Partial<LiveSessionState> = {}): LiveSessionState {
  return {
    sessionId: "bug22-session",
    bridge: { port: 9999, token: "test-token" },
    injectedFiles: [],
    started: new Date().toISOString(),
    ...override,
  };
}

function makeFlags(override: Partial<LiveCliFlags> = {}): LiveCliFlags {
  return {
    quiet: false,
    strict: false,
    verifyMode: "live-accept",
    maxVariants: 5,
    ...override,
  } as LiveCliFlags;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Bug #22 — dispatchEvent responds to 'generating' event kind", () => {
  beforeEach(() => {
    postEventMock.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("does NOT ignore a 'generating' event (falls into correct case branch)", async () => {
    const ev: BridgeEvent = {
      kind: "generating",
      sessionId: "bug22-session",
      target: sampleTarget,
      freeText: "make it bolder",
      variantCount: 3,
    };

    await dispatchEvent(ev, makeState(), makeFlags(), "/tmp/project");

    // postEvent must have been called (the old "configure" bug caused it to
    // fall through to `default` and never call postEvent).
    expect(postEventMock).toHaveBeenCalledTimes(1);
  });

  it("posts a 'cycling' event back to the bridge", async () => {
    const ev: BridgeEvent = {
      kind: "generating",
      sessionId: "bug22-session",
      target: sampleTarget,
      freeText: "more air",
      variantCount: 3,
    };

    await dispatchEvent(ev, makeState(), makeFlags(), "/tmp/project");

    const call = postEventMock.mock.calls[0]?.[0] as {
      event: { kind: string; variants: unknown[] };
    };
    expect(call.event.kind).toBe("cycling");
  });

  it("cycling event carries exactly 3 variants matching generateVariantsStub", async () => {
    const ev: BridgeEvent = {
      kind: "generating",
      sessionId: "bug22-session",
      target: sampleTarget,
      freeText: "compact",
      variantCount: 3,
    };

    await dispatchEvent(ev, makeState(), makeFlags({ maxVariants: 5 }), "/tmp/project");

    const call = postEventMock.mock.calls[0]?.[0] as {
      event: { kind: string; variants: Array<{ id: string; css: string; rationale: string }> };
    };
    const postedVariants = call.event.variants;

    // Should match the deterministic stub output for 3 variants.
    const expected = generateVariantsStub("test-selector", 3);
    expect(postedVariants.length).toBe(3);
    expect(postedVariants.map((v) => v.id)).toEqual(expected.map((v) => v.id));
  });

  it("respects ev.variantCount — generates 2 variants when requested, not flags.maxVariants", async () => {
    const ev: BridgeEvent = {
      kind: "generating",
      sessionId: "bug22-session",
      target: sampleTarget,
      freeText: "just two",
      variantCount: 2,
    };

    // flags.maxVariants is 8 — ev.variantCount=2 must win (it's the lower value).
    await dispatchEvent(ev, makeState(), makeFlags({ maxVariants: 8 }), "/tmp/project");

    const call = postEventMock.mock.calls[0]?.[0] as {
      event: { variants: unknown[] };
    };
    expect(call.event.variants.length).toBe(2);
  });

  it("caps at flags.maxVariants when ev.variantCount exceeds it", async () => {
    const ev: BridgeEvent = {
      kind: "generating",
      sessionId: "bug22-session",
      target: sampleTarget,
      freeText: "all of them",
      variantCount: 8, // requests max schema allows
    };

    // flags.maxVariants = 3 — the ceiling must apply.
    await dispatchEvent(ev, makeState(), makeFlags({ maxVariants: 3 }), "/tmp/project");

    const call = postEventMock.mock.calls[0]?.[0] as {
      event: { variants: unknown[] };
    };
    expect(call.event.variants.length).toBe(3);
  });
});
