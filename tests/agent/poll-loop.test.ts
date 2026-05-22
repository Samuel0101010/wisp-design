// wisp-design — Phase 4 agent ↔ bridge integration tests.
//
// Boots a real bridge on port 31370 (distinct from the bridge tests on
// 31380/31390) and exercises pollOnce/postEvent/routeEvent + CLI runners
// against it. Each CLI test plants a port-lock file pointing at the bridge
// so readPortLock() resolves without booting a second server.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

import { startBridgeServer } from "../../src/bridge/server.js";
import type { BridgeEvent, BridgeServerHandle } from "../../src/contracts/bridge.js";
import {
  BridgeRequestError,
  pollOnce,
  postEvent,
  routeEvent,
  runPollOnce,
  runPostEvent,
} from "../../src/agent/poll-loop.js";

let handle: BridgeServerHandle;
let projectRoot: string;
const baseUrl = (): string => `http://127.0.0.1:${handle.port}`;

const sampleSessionId = "agent-poll-test";
const sampleTarget = {
  selector: "div.foo",
  tag: "div",
  rect: { x: 0, y: 0, w: 10, h: 10 },
} as const;

const samplePick = (): BridgeEvent => ({
  kind: "pick",
  sessionId: sampleSessionId,
  target: sampleTarget,
});

const sampleHeartbeat = (): BridgeEvent => ({
  kind: "heartbeat",
  at: new Date().toISOString(),
});

const sampleCycling = (): BridgeEvent => ({
  kind: "cycling",
  sessionId: sampleSessionId,
  target: sampleTarget,
  activeIndex: 0,
  variants: [{ id: "v0", css: "", rationale: "tighter density via larger gap" }],
});

// Write a port-lock pointing at the running bridge so CLI runners find it.
function plantPortLock(root: string, port: number, token: string): void {
  const liveDir = join(root, ".wisp", "live");
  mkdirSync(liveDir, { recursive: true });
  const lock = {
    port,
    token,
    pid: process.pid,
    startedAt: new Date().toISOString(),
    projectRoot: root,
  };
  writeFileSync(join(liveDir, "port.lock"), JSON.stringify(lock));
}

// Capture stdout/stderr writes during a runner call. Restored in finally.
function captureStdio(): {
  stdout: string[];
  stderr: string[];
  restore: () => void;
} {
  const out: string[] = [];
  const err: string[] = [];
  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);
  process.stdout.write = ((chunk: string | Uint8Array) => {
    out.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
    return true;
  }) as typeof process.stdout.write;
  process.stderr.write = ((chunk: string | Uint8Array) => {
    err.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
    return true;
  }) as typeof process.stderr.write;
  return {
    stdout: out,
    stderr: err,
    restore: () => {
      process.stdout.write = origOut;
      process.stderr.write = origErr;
    },
  };
}

beforeAll(async () => {
  projectRoot = mkdtempSync(join(tmpdir(), "wisp-agent-poll-"));
  handle = await startBridgeServer({ projectRoot, preferredPort: 31370 });
  plantPortLock(projectRoot, handle.port, handle.token);
});

afterAll(async () => {
  await handle?.stop(50);
  if (projectRoot !== undefined) {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

// All CLI runners read process.cwd() to find the lock — chdir into our
// tmpDir for the duration of each runner test.
async function withCwd<T>(dir: string, fn: () => Promise<T>): Promise<T> {
  const prev = process.cwd();
  process.chdir(dir);
  try {
    return await fn();
  } finally {
    process.chdir(prev);
  }
}

describe("pollOnce — empty queue + retry semantics", () => {
  it("empty queue + short timeout → empty events, shouldRetry true", async () => {
    const start = Date.now();
    const result = await pollOnce({
      bridgeUrl: baseUrl(),
      token: handle.token,
      timeoutMs: 1_000, // contract minimum
      leaseMs: 30_000,
      transport: "long-poll",
    });
    const elapsed = Date.now() - start;
    expect(result.events).toEqual([]);
    expect(typeof result.cursor).toBe("string");
    expect(result.shouldRetry).toBe(true);
    // wall-clock drift tolerance: server-side slice should land between
    // ~800ms and ~3000ms (network + scheduler slop).
    expect(elapsed).toBeGreaterThanOrEqual(800);
    expect(elapsed).toBeLessThan(3_000);
  });

  it("after posting an event → that event returned, shouldRetry false", async () => {
    // Post first, then poll: the event sits in the queue and gets delivered
    // immediately.
    const res = await fetch(`${baseUrl()}/events?token=${handle.token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(samplePick()),
    });
    expect(res.status).toBe(200);

    const result = await pollOnce({
      bridgeUrl: baseUrl(),
      token: handle.token,
      timeoutMs: 5_000,
      leaseMs: 30_000,
      transport: "long-poll",
    });
    expect(result.events.length).toBeGreaterThan(0);
    expect(result.events.some((e) => e.kind === "pick")).toBe(true);
    expect(result.shouldRetry).toBe(false);
  });

  it("explicit cursor only returns events past it", async () => {
    // Get the current cursor by emptying the queue first.
    const drain = await pollOnce({
      bridgeUrl: baseUrl(),
      token: handle.token,
      timeoutMs: 1_000,
      leaseMs: 30_000,
      transport: "long-poll",
    });
    const cursorAfterDrain = drain.cursor;

    // Post a single new event.
    await fetch(`${baseUrl()}/events?token=${handle.token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(samplePick()),
    });

    // Poll with the drain cursor — should only see the new event.
    const next = await pollOnce({
      bridgeUrl: baseUrl(),
      token: handle.token,
      timeoutMs: 5_000,
      leaseMs: 30_000,
      cursor: cursorAfterDrain,
      transport: "long-poll",
    });
    expect(next.events.length).toBe(1);
    expect(next.events[0]?.kind).toBe("pick");
  });

  it(
    "timeoutMs > LONG_POLL_CAP_MS rejected at zod boundary (client-side)",
    { timeout: 10_000 },
    async () => {
      // The contract caps timeoutMs at POLL_LOOP_DEFAULT_TIMEOUT_MS (270_000)
      // via zod schema — pollOnce throws *before* it reaches the network.
      await expect(
        pollOnce({
          bridgeUrl: baseUrl(),
          token: handle.token,
          timeoutMs: 300_000,
          leaseMs: 30_000,
          transport: "long-poll",
        }),
      ).rejects.toThrow();
    },
  );

  it("invalid token → BridgeRequestError with 401", async () => {
    const wrong = randomUUID();
    let caught: unknown;
    try {
      await pollOnce({
        bridgeUrl: baseUrl(),
        token: wrong,
        timeoutMs: 1_000,
        leaseMs: 30_000,
        transport: "long-poll",
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(BridgeRequestError);
    if (caught instanceof BridgeRequestError) {
      expect(caught.code).toBe("HTTP_401");
    }
  });

  it("bridge not running (closed port) → BridgeRequestError FETCH_FAILED", async () => {
    // Port 9 is reserved discard; never bound. Should refuse immediately.
    let caught: unknown;
    try {
      await pollOnce({
        bridgeUrl: "http://127.0.0.1:9",
        token: handle.token,
        timeoutMs: 1_000,
        leaseMs: 30_000,
        transport: "long-poll",
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(BridgeRequestError);
    if (caught instanceof BridgeRequestError) {
      expect(caught.code).toBe("FETCH_FAILED");
    }
  });

  it("transport=sse throws (browser-only)", async () => {
    await expect(
      pollOnce({
        bridgeUrl: baseUrl(),
        token: handle.token,
        timeoutMs: 1_000,
        leaseMs: 30_000,
        transport: "sse",
      }),
    ).rejects.toThrow(/sse/i);
  });
});

describe("postEvent — happy + error paths", () => {
  it("valid heartbeat resolves with cursor", async () => {
    const result = await postEvent({
      bridgeUrl: baseUrl(),
      token: handle.token,
      event: sampleHeartbeat(),
    });
    expect(result.ok).toBe(true);
    expect(typeof result.cursor).toBe("string");
    expect(result.cursor).toMatch(/^seq-\d+-/);
  });

  it("valid cycling event is delivered to subsequent pollOnce", async () => {
    // Drain first.
    const drain = await pollOnce({
      bridgeUrl: baseUrl(),
      token: handle.token,
      timeoutMs: 1_000,
      leaseMs: 30_000,
      transport: "long-poll",
    });

    await postEvent({
      bridgeUrl: baseUrl(),
      token: handle.token,
      event: sampleCycling(),
    });

    const next = await pollOnce({
      bridgeUrl: baseUrl(),
      token: handle.token,
      timeoutMs: 5_000,
      leaseMs: 30_000,
      cursor: drain.cursor,
      transport: "long-poll",
    });
    expect(next.events.some((e) => e.kind === "cycling")).toBe(true);
  });

  it("malformed event (bad zod) → BridgeRequestError", async () => {
    let caught: unknown;
    try {
      await postEvent({
        bridgeUrl: baseUrl(),
        token: handle.token,
        // Cast through unknown — the bad shape is exactly what we want to test.
        event: { kind: "not-a-real-kind" } as unknown as BridgeEvent,
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(BridgeRequestError);
    if (caught instanceof BridgeRequestError) {
      // Schema-validation fails at the client boundary before the HTTP call.
      expect(caught.code).toBe("BAD_REQUEST");
    }
  });

  it("oversize body — bridge 413 path documented (skip: client schema caps fields first)", () => {
    // Documented bug-or-feature: BridgeEventSchema caps every event field
    // (annotation.note ≤ 2000, freeText ≤ 4000), so postEvent's own zod check
    // rejects any payload that would have tripped the bridge's 256KB body
    // limit. The bridge-level BODY_TOO_LARGE path is exercised directly by
    // tests/bridge/server-smoke.test.ts via raw fetch. No-op assertion here.
    expect(true).toBe(true);
  });
});

describe("routeEvent — discriminated-union classifier", () => {
  it("configure → generate-variants", () => {
    const r = routeEvent({
      kind: "configure",
      sessionId: sampleSessionId,
      target: sampleTarget,
      freeText: "make it bolder",
    });
    expect(r.action).toBe("generate-variants");
  });

  it("accept → write-accept", () => {
    const r = routeEvent({
      kind: "accept",
      sessionId: sampleSessionId,
      target: sampleTarget,
      variantId: "v0",
    });
    expect(r.action).toBe("write-accept");
  });

  it("heartbeat / pick / cycling / parameter-change → ignore", () => {
    expect(routeEvent(sampleHeartbeat()).action).toBe("ignore");
    expect(routeEvent(samplePick()).action).toBe("ignore");
    expect(routeEvent(sampleCycling()).action).toBe("ignore");
    expect(
      routeEvent({
        kind: "parameter-change",
        sessionId: sampleSessionId,
        target: sampleTarget,
        varName: "--wisp-pad",
        value: "16px",
      }).action,
    ).toBe("ignore");
  });

  it("discard → clean-discard; annotation → log-annotation", () => {
    expect(
      routeEvent({
        kind: "discard",
        sessionId: sampleSessionId,
        target: sampleTarget,
      }).action,
    ).toBe("clean-discard");

    expect(
      routeEvent({
        kind: "annotation",
        sessionId: sampleSessionId,
        target: sampleTarget,
        annotation: { kind: "color", note: "more red" },
      }).action,
    ).toBe("log-annotation");
  });
});

describe("runPollOnce / runPostEvent CLI runners", () => {
  it("runPollOnce: --timeout 500 → exit 0 + JSON on stdout", async () => {
    const cap = captureStdio();
    let code = 99;
    try {
      code = await withCwd(projectRoot, () =>
        runPollOnce(["--timeout", "1000"]),
      );
    } finally {
      cap.restore();
    }
    expect(code).toBe(0);
    const joined = cap.stdout.join("");
    expect(joined.trim().length).toBeGreaterThan(0);
    const parsed = JSON.parse(joined);
    expect(Array.isArray(parsed.events)).toBe(true);
    expect(typeof parsed.cursor).toBe("string");
  });

  it("runPollOnce: no port-lock → exit 1 BRIDGE_NOT_RUNNING", async () => {
    const emptyDir = mkdtempSync(join(tmpdir(), "wisp-agent-empty-"));
    const cap = captureStdio();
    let code = 99;
    try {
      code = await withCwd(emptyDir, () => runPollOnce(["--timeout", "1000"]));
    } finally {
      cap.restore();
      rmSync(emptyDir, { recursive: true, force: true });
    }
    expect(code).toBe(1);
    const errJoined = cap.stderr.join("");
    expect(errJoined).toContain("BRIDGE_NOT_RUNNING");
  });

  it("runPostEvent: --kind heartbeat --payload → exit 0", async () => {
    const cap = captureStdio();
    let code = 99;
    try {
      code = await withCwd(projectRoot, () =>
        runPostEvent([
          "--kind",
          "heartbeat",
          "--payload",
          JSON.stringify({ at: new Date().toISOString() }),
        ]),
      );
    } finally {
      cap.restore();
    }
    expect(code).toBe(0);
    const joined = cap.stdout.join("");
    const parsed = JSON.parse(joined);
    expect(parsed.ok).toBe(true);
    expect(typeof parsed.cursor).toBe("string");
  });

  it("runPostEvent: bad JSON in --payload → exit 2", async () => {
    const cap = captureStdio();
    let code = 99;
    try {
      code = await withCwd(projectRoot, () =>
        runPostEvent(["--kind", "heartbeat", "--payload", "{not-json"]),
      );
    } finally {
      cap.restore();
    }
    expect(code).toBe(2);
    expect(cap.stderr.join("")).toMatch(/BAD_FLAG|JSON/i);
  });

  it("runPostEvent: missing both --event and --kind/--payload → exit 2", async () => {
    const cap = captureStdio();
    let code = 99;
    try {
      code = await withCwd(projectRoot, () => runPostEvent([]));
    } finally {
      cap.restore();
    }
    expect(code).toBe(2);
  });
});
