// wisp-design — Phase 1 bridge HTTP smoke tests.
//
// Boots a real bridge server, exercises every endpoint via native fetch.
// Auth, path-traversal, body validation, SSE plumbing, body-size cap.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

import { startBridgeServer } from "../../src/bridge/server.js";
import { BridgeStatusSchema, type BridgeEvent, type BridgeServerHandle } from "../../src/contracts/bridge.js";

let handle: BridgeServerHandle;
let projectRoot: string;
const baseUrl = (): string => `http://127.0.0.1:${handle.port}`;

const samplePick = (): BridgeEvent => ({
  kind: "pick",
  sessionId: "smoke-session",
  target: {
    selector: "div.foo",
    tag: "div",
    rect: { x: 0, y: 0, w: 10, h: 10 },
  },
});

const sampleAnnotation = (): BridgeEvent => ({
  kind: "annotation",
  sessionId: "smoke-session",
  target: {
    selector: "div.foo",
    tag: "div",
    rect: { x: 0, y: 0, w: 10, h: 10 },
  },
  annotation: { kind: "color", note: "make this red" },
});

beforeAll(async () => {
  projectRoot = mkdtempSync(join(tmpdir(), "wisp-smoke-"));
  // Plant a source fixture file.
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  writeFileSync(join(projectRoot, "src", "index.ts"), "export const x = 1;\n");
  // Plant a .env so the hard-deny check has something real to refuse.
  writeFileSync(join(projectRoot, ".env"), "SECRET=hunter2\n");
  handle = await startBridgeServer({ projectRoot, preferredPort: 31390 });
});

afterAll(async () => {
  await handle?.stop(50);
  if (projectRoot !== undefined) rmSync(projectRoot, { recursive: true, force: true });
});

describe("bridge server — auth gating", () => {
  it("GET /health requires no auth → 200", async () => {
    const res = await fetch(`${baseUrl()}/health`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; version: string };
    expect(body.ok).toBe(true);
    expect(typeof body.version).toBe("string");
  });

  it("GET /status without token → 401 UNAUTHORIZED", async () => {
    const res = await fetch(`${baseUrl()}/status`);
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("GET /status with malformed token → 401 MALFORMED_TOKEN", async () => {
    const res = await fetch(`${baseUrl()}/status?token=not-a-uuid`);
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("MALFORMED_TOKEN");
  });

  it("GET /status with wrong UUID → 401 UNAUTHORIZED", async () => {
    const wrong = randomUUID();
    const res = await fetch(`${baseUrl()}/status?token=${wrong}`);
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("GET /status with correct token → 200 + valid BridgeStatus", async () => {
    const res = await fetch(`${baseUrl()}/status?token=${handle.token}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    const parsed = BridgeStatusSchema.safeParse(body);
    expect(parsed.success, JSON.stringify(parsed)).toBe(true);
    if (parsed.success) {
      expect(parsed.data.port).toBe(handle.port);
      expect(parsed.data.sessionId).toBe(handle.sessionId);
    }
  });
});

describe("bridge server — static endpoints", () => {
  it("GET /live.js → 200 with JS content-type", async () => {
    const res = await fetch(`${baseUrl()}/live.js`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type") ?? "").toMatch(/javascript/);
    const text = await res.text();
    expect(text.length).toBeGreaterThan(0);
    expect(text).toMatch(/Phase 1 stub|wisp-design/);
  });

  it("GET /design-system.json without file → 404 TOKENS_MISSING", async () => {
    const res = await fetch(
      `${baseUrl()}/design-system.json?token=${handle.token}`,
    );
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("TOKENS_MISSING");
  });

  it("GET /design-system.json with file present → 200 + JSON body", async () => {
    const wispDir = join(projectRoot, ".wisp");
    mkdirSync(wispDir, { recursive: true });
    const tokens = { primary: "#000", spacing: [4, 8, 12] };
    writeFileSync(
      join(wispDir, "design-tokens.json"),
      JSON.stringify(tokens),
    );
    const res = await fetch(
      `${baseUrl()}/design-system.json?token=${handle.token}`,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as typeof tokens;
    expect(body.primary).toBe("#000");
  });
});

describe("bridge server — /source", () => {
  it("GET /source for existing file → 200 + body", async () => {
    const res = await fetch(
      `${baseUrl()}/source?token=${handle.token}&path=src/index.ts`,
    );
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("export const x = 1;");
  });

  it("GET /source with .. → 403 PATH_TRAVERSAL", async () => {
    const res = await fetch(
      `${baseUrl()}/source?token=${handle.token}&path=${encodeURIComponent("../escape")}`,
    );
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("PATH_TRAVERSAL");
  });

  it("GET /source for .env → 403 FORBIDDEN", async () => {
    const res = await fetch(
      `${baseUrl()}/source?token=${handle.token}&path=.env`,
    );
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("FORBIDDEN");
  });

  it("GET /source without path query → 400 BAD_PATH", async () => {
    const res = await fetch(`${baseUrl()}/source?token=${handle.token}`);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("BAD_PATH");
  });

  it("GET /source for missing file → 404 NOT_FOUND", async () => {
    const res = await fetch(
      `${baseUrl()}/source?token=${handle.token}&path=src/does-not-exist.ts`,
    );
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("NOT_FOUND");
  });
});

describe("bridge server — POST /events + /annotation", () => {
  it("POST /events with valid body → 200 + cursor", async () => {
    const res = await fetch(`${baseUrl()}/events?token=${handle.token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(samplePick()),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { accepted: true; cursor: string };
    expect(body.accepted).toBe(true);
    expect(body.cursor).toMatch(/^seq-\d+-/);
  });

  it("POST /events with missing kind → 400 BAD_BODY", async () => {
    const res = await fetch(`${baseUrl()}/events?token=${handle.token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: "x" }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("BAD_BODY");
  });

  it("POST /events with invalid JSON → 400 BAD_BODY", async () => {
    const res = await fetch(`${baseUrl()}/events?token=${handle.token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not json",
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("BAD_BODY");
  });

  it(
    "POST /events with body > 256KB is rejected (413 or socket-close)",
    { timeout: 10_000 },
    async () => {
      // Server uses `req.destroy()` after the 256KB threshold trips. Depending
      // on chunk timing the client either receives the 413 envelope or a
      // socket-close before the response flushes. Both are acceptable —
      // the contract is "doesn't accept oversized bodies". Verify either path.
      const big = "x".repeat(300 * 1024);
      const body = JSON.stringify({ kind: "pick", junk: big });
      try {
        const res = await fetch(`${baseUrl()}/events?token=${handle.token}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
        });
        // If we got a response, it must be 413.
        expect(res.status).toBe(413);
        const parsed = (await res.json()) as { error: { code: string } };
        expect(parsed.error.code).toBe("BODY_TOO_LARGE");
      } catch (err) {
        // Network-level rejection (server destroyed the socket) — also OK.
        const e = err as Error;
        expect(/fetch failed|socket|aborted/i.test(e.message)).toBe(true);
      }
    },
  );

  it("POST /annotation with kind != 'annotation' → 400", async () => {
    const res = await fetch(`${baseUrl()}/annotation?token=${handle.token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(samplePick()),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("BAD_BODY");
  });

  it("POST /annotation with valid annotation → 200", async () => {
    const res = await fetch(`${baseUrl()}/annotation?token=${handle.token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sampleAnnotation()),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { accepted: true; cursor: string };
    expect(body.accepted).toBe(true);
  });
});

describe("bridge server — SSE", () => {
  it(
    "GET /events SSE → 200 + text/event-stream + initial line",
    { timeout: 5000 },
    async () => {
      const ac = new AbortController();
      const res = await fetch(`${baseUrl()}/events?token=${handle.token}`, {
        signal: ac.signal,
      });
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type") ?? "").toMatch(/text\/event-stream/);

      // Read first chunk and verify SSE framing.
      const reader = res.body?.getReader();
      expect(reader).toBeDefined();
      if (reader === undefined) return;
      const { value } = await reader.read();
      const text = new TextDecoder().decode(value);
      // First push is ": connected\n\n" comment or a data: frame if events pending.
      expect(text).toMatch(/^(:\s|data:)/);
      ac.abort();
      try {
        await reader.cancel();
      } catch {
        // ignore — already aborted
      }
    },
  );
});

describe("bridge server — /stop (last)", () => {
  // This test runs in its own describe to make ordering explicit. We don't
  // actually call /stop here because afterAll() already calls handle.stop().
  // Instead verify the /stop endpoint shape on a separate short-lived server.
  it("GET /stop returns {stopping:true, graceMs}", async () => {
    const projRoot = mkdtempSync(join(tmpdir(), "wisp-stop-"));
    const h = await startBridgeServer({ projectRoot: projRoot });
    try {
      const res = await fetch(`http://127.0.0.1:${h.port}/stop?token=${h.token}`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { stopping: boolean; graceMs: number };
      expect(body.stopping).toBe(true);
      expect(typeof body.graceMs).toBe("number");
    } finally {
      await h.stop(50).catch(() => undefined);
      rmSync(projRoot, { recursive: true, force: true });
    }
  });
});
