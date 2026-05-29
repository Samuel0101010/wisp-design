// wisp-design — Bridge HTTP+SSE server (Phase 1).
// Plain Node http. SSE pushes browser←bridge; long-poll pulls agent←bridge.
// Long-poll timeout silently capped at LONG_POLL_CAP_MS (270s) — Node fetch
// caps headers timeout at 300s. Auth + path-traversal live in ./auth.ts.

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BridgeEventSchema,
  LONG_POLL_CAP_MS,
  LONG_POLL_DEFAULT_LEASE_MS,
  LongPollRequestSchema,
  type BridgeEvent,
  type BridgeServerHandle,
  type BridgeServerOptions,
  type BridgeStatus,
  type LongPollResponse,
} from "../contracts/bridge.js";
import { guardPath, validateToken } from "./auth.js";
import { findFreePort } from "./port-discovery.js";
import {
  parseCursor,
  parseQuery,
  readBody,
  safeJson,
  sendAuthError,
  sendError,
  sendJson,
  urlPath,
  withAuthoritativeToken,
  type Query,
} from "./http-helpers.js";

const LIVE_JS_FALLBACK_STUB =
  "// wisp-design live.js — bundle not found at dist/live.js. " +
  "Did you run `npm run build`?\n";

// Resolve `dist/live.js` relative to the bridge module (`dist/bridge/server.js`
// once built, `src/bridge/server.ts` under vitest). `new URL("../live.js",
// import.meta.url)` works for the built layout (dist/bridge → dist). For the
// source layout (src/bridge → src) the file doesn't exist; we fall back to
// `<cwd>/dist/live.js` which IS the right path when running from the repo.
const LIVE_JS_BUNDLE_PATH = (() => {
  try {
    const fromModule = fileURLToPath(new URL("../live.js", import.meta.url));
    return fromModule;
  } catch {
    return resolve(process.cwd(), "dist/live.js");
  }
})();
const SSE_HEARTBEAT_INTERVAL_MS = 15_000;
const EVENT_QUEUE_MAX = 1024;
const VERSION = "0.1.0-prerelease";

interface QueuedEvent {
  cursor: string;
  event: BridgeEvent;
  seq: number;
}
interface SseSubscriber {
  res: ServerResponse;
  heartbeat: NodeJS.Timeout;
}
interface PollWaiter {
  resolve: (response: LongPollResponse) => void;
  sinceSeq: number;
  startedAt: number;
  timer: NodeJS.Timeout;
}

export async function startBridgeServer(
  opts: BridgeServerOptions,
): Promise<BridgeServerHandle> {
  const token = opts.token ?? randomUUID();
  const sessionId = randomUUID();
  const projectRoot = resolve(opts.projectRoot);
  const startedAt = new Date();
  const startedAtMs = startedAt.getTime();
  const port =
    opts.preferredPort !== undefined ? opts.preferredPort : await findFreePort();

  // ---- State (closure-scoped) ----
  let seqCounter = 0;
  const queue: QueuedEvent[] = [];
  const sseSubs = new Map<string, SseSubscriber>();
  const pollWaiters = new Set<PollWaiter>();
  let stopping = false;

  const allocateCursor = (): { cursor: string; seq: number } => {
    seqCounter += 1;
    return { cursor: `seq-${seqCounter}-${sessionId}`, seq: seqCounter };
  };

  const enqueue = (event: BridgeEvent): { cursor: string; seq: number } => {
    const c = allocateCursor();
    queue.push({ cursor: c.cursor, event, seq: c.seq });
    if (queue.length > EVENT_QUEUE_MAX) queue.shift();
    queueMicrotask(() => fanout(event, c.seq));
    return c;
  };

  const fanout = (event: BridgeEvent, seq: number): void => {
    // SSE push
    const line = `data: ${JSON.stringify(event)}\n\n`;
    for (const sub of sseSubs.values()) {
      try {
        sub.res.write(line);
      } catch {
        // Drop on next disconnect tick.
      }
    }
    // Wake long-poll waiters whose cursor is older.
    for (const w of pollWaiters) {
      if (w.sinceSeq < seq) {
        deliverWaiter(w);
      }
    }
  };

  const eventsSince = (sinceSeq: number): QueuedEvent[] => {
    if (sinceSeq <= 0) return queue.slice();
    return queue.filter((q) => q.seq > sinceSeq);
  };

  const deliverWaiter = (w: PollWaiter): void => {
    if (!pollWaiters.has(w)) return;
    pollWaiters.delete(w);
    clearTimeout(w.timer);
    const events = eventsSince(w.sinceSeq);
    const last = events.length === 0 ? undefined : events[events.length - 1];
    const cursor = last !== undefined ? last.cursor : `seq-${seqCounter}-${sessionId}`;
    w.resolve({
      events: events.map((q) => q.event),
      cursor,
      slicedAt: Date.now() - w.startedAt,
    });
  };

  const releaseWaiter = (w: PollWaiter): void => {
    if (!pollWaiters.has(w)) return;
    pollWaiters.delete(w);
    clearTimeout(w.timer);
  };

  // Returns the response promise plus a `cancel` handle. The poll handlers call
  // `cancel()` from their `req.on("close")` listener so a premature client
  // disconnect releases the parked waiter and clears its timer immediately,
  // instead of leaking both until the (up to 270s) timer fires. `cancel` and
  // `deliverWaiter` both guard on `pollWaiters.has(w)`, so they are mutually
  // idempotent — no double-resolve, no double-clear.
  const longPoll = (
    sinceSeq: number,
    timeoutMs: number,
  ): { promise: Promise<LongPollResponse>; cancel: () => void } => {
    const cap = Math.min(Math.max(timeoutMs, 0), LONG_POLL_CAP_MS);
    // Fast-path: events already pending → return immediately.
    const ready = eventsSince(sinceSeq);
    if (ready.length > 0) {
      const last = ready[ready.length - 1];
      return {
        promise: Promise.resolve({
          events: ready.map((q) => q.event),
          cursor: last !== undefined ? last.cursor : `seq-${seqCounter}-${sessionId}`,
          slicedAt: 0,
        }),
        cancel: () => {},
      };
    }
    let waiter!: PollWaiter;
    const promise = new Promise<LongPollResponse>((res) => {
      waiter = {
        resolve: res,
        sinceSeq,
        startedAt: Date.now(),
        // .unref() so a stray waiter timer never keeps the process alive past
        // shutdown if a poll outlives stopServer's drain.
        timer: setTimeout(() => deliverWaiter(waiter), cap).unref(),
      };
      pollWaiters.add(waiter);
    });
    return { promise, cancel: () => releaseWaiter(waiter) };
  };

  // ---- Endpoint handlers ----

  const handleHealth = (res: ServerResponse): void => {
    sendJson(res, 200, {
      ok: true,
      version: VERSION,
      uptimeMs: Date.now() - startedAtMs,
      pid: process.pid,
    });
  };

  const handleStatus = (res: ServerResponse): void => {
    const status: BridgeStatus = {
      port: port,
      startedAt: startedAt.toISOString(),
      uptimeMs: Date.now() - startedAtMs,
      sessionId,
      pendingEvents: queue.length,
      connectedSseClients: sseSubs.size,
      projectRoot,
    };
    sendJson(res, 200, status);
  };

  const handleLiveJs = async (res: ServerResponse): Promise<void> => {
    // Read the built IIFE bundle. If it's missing (uninstalled package, dev
    // run without build), fall back to the stub so the browser still gets
    // valid JS and the console message hints at the cause.
    let body: string;
    let bodyFromBundle = false;
    try {
      body = await readFile(LIVE_JS_BUNDLE_PATH, "utf8");
      bodyFromBundle = true;
    } catch {
      body = LIVE_JS_FALLBACK_STUB;
    }
    res.writeHead(200, {
      "Content-Type": "application/javascript; charset=utf-8",
      // The IIFE bundle is small and content-addressed by token. Allow short
      // browser caching when serving the real bundle so multi-tab demos
      // don't refetch it on every reload.
      "Cache-Control": bodyFromBundle ? "public, max-age=60" : "no-store",
      "Access-Control-Allow-Origin": "*",
    });
    res.end(body);
  };

  const handleDesignSystem = async (res: ServerResponse): Promise<void> => {
    const path = resolve(projectRoot, ".wisp/design-tokens.json");
    try {
      const body = await readFile(path, "utf8");
      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      });
      res.end(body);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        sendError(res, 404, "TOKENS_MISSING", ".wisp/design-tokens.json not found");
        return;
      }
      sendError(res, 500, "READ_FAILED", (err as Error).message);
    }
  };

  // ---------------------------------------------------------------------
  // /sessions — read recent accept-variant entries from session log files.
  // Used by the browser's "Recent" tool panel to surface design history
  // without going through the agent. Returns the most-recent 20 entries
  // across all session files, newest first.
  // ---------------------------------------------------------------------
  const handleSessions = async (res: ServerResponse): Promise<void> => {
    const sessionsDir = resolve(projectRoot, ".wisp/sessions");
    interface Entry {
      ts: string;
      sessionId: string;
      targetId: string;
      variantId: string;
      filePath: string;
      byteSize: number;
    }
    const entries: Entry[] = [];
    let dir: string[];
    try {
      const { readdir } = await import("node:fs/promises");
      dir = await readdir(sessionsDir);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        res.writeHead(200, {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
        });
        res.end(JSON.stringify({ entries: [] }));
        return;
      }
      sendError(res, 500, "READ_FAILED", (err as Error).message);
      return;
    }
    // Read each .jsonl, scan for accept-variant entries — file IO is bounded
    // by the cap on session files and we only keep the latest 20.
    const files = dir.filter((f) => f.endsWith(".jsonl")).slice(0, 50);
    for (const fname of files) {
      let text: string;
      try {
        text = await readFile(resolve(sessionsDir, fname), "utf8");
      } catch {
        continue;
      }
      for (const line of text.split("\n")) {
        if (line.length === 0) continue;
        let parsed: unknown;
        try {
          parsed = JSON.parse(line);
        } catch {
          continue;
        }
        if (typeof parsed !== "object" || parsed === null) continue;
        const obj = parsed as Record<string, unknown>;
        if (obj.kind !== "accept-variant") continue;
        const detail = obj.detail as Record<string, unknown> | undefined;
        // Only the first accept-variant entry per accept has a targetId;
        // the second (one-arg form) does not. We only want the full record.
        if (!detail || typeof detail.targetId !== "string") continue;
        entries.push({
          ts: typeof obj.ts === "string" ? obj.ts : "",
          sessionId: typeof obj.sessionId === "string" ? obj.sessionId : "",
          targetId: detail.targetId,
          variantId:
            typeof detail.variantId === "string" ? detail.variantId : "",
          filePath:
            typeof obj.filePath === "string" ? obj.filePath : "",
          byteSize:
            typeof detail.byteSize === "number" ? detail.byteSize : 0,
        });
      }
    }
    // Newest first; truncate to 20.
    entries.sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0));
    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    });
    res.end(JSON.stringify({ entries: entries.slice(0, 20) }));
  };

  const handleSource = async (
    res: ServerResponse,
    requestedPath: string | undefined,
  ): Promise<void> => {
    if (requestedPath === undefined || requestedPath.length === 0) {
      sendError(res, 400, "BAD_PATH", "path query parameter required");
      return;
    }
    const guard = guardPath(requestedPath, projectRoot);
    if (!guard.ok) {
      sendAuthError(res, guard.error);
      return;
    }
    try {
      const st = await stat(guard.resolved);
      if (!st.isFile()) {
        sendError(res, 404, "NOT_A_FILE", `not a regular file: ${requestedPath}`);
        return;
      }
      const body = await readFile(guard.resolved, "utf8");
      res.writeHead(200, {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      });
      res.end(body);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        sendError(res, 404, "NOT_FOUND", `file not found: ${requestedPath}`);
        return;
      }
      sendError(res, 500, "READ_FAILED", (err as Error).message);
    }
  };

  const handlePostEvent = async (
    req: IncomingMessage,
    res: ServerResponse,
    requireKind?: BridgeEvent["kind"],
  ): Promise<void> => {
    let raw: string;
    try {
      raw = await readBody(req);
    } catch (err) {
      sendError(res, 413, "BODY_TOO_LARGE", (err as Error).message);
      return;
    }
    const parsedJson = safeJson(raw);
    if (!parsedJson.ok) {
      sendError(res, 400, "BAD_BODY", `invalid JSON: ${parsedJson.error}`);
      return;
    }
    const parsed = BridgeEventSchema.safeParse(parsedJson.value);
    if (!parsed.success) {
      sendError(res, 400, "BAD_BODY", "event failed schema validation", parsed.error.issues);
      return;
    }
    if (requireKind !== undefined && parsed.data.kind !== requireKind) {
      sendError(
        res,
        400,
        "BAD_BODY",
        `expected kind=${requireKind}, got kind=${parsed.data.kind}`,
      );
      return;
    }
    const { cursor } = enqueue(parsed.data);
    sendJson(res, 200, { accepted: true, cursor });
  };

  const handleGetEventsSse = (req: IncomingMessage, res: ServerResponse): void => {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      "Access-Control-Allow-Origin": "*",
    });
    res.write(": connected\n\n");
    const subId = randomUUID();
    const heartbeat = setInterval(() => {
      try {
        res.write(": keepalive\n\n");
      } catch {
        // Will be cleaned up on `close`.
      }
    }, SSE_HEARTBEAT_INTERVAL_MS);
    const sub: SseSubscriber = { res, heartbeat };
    sseSubs.set(subId, sub);
    const cleanup = (): void => {
      clearInterval(heartbeat);
      sseSubs.delete(subId);
      try {
        res.end();
      } catch {
        // ignore
      }
    };
    req.on("close", cleanup);
    req.on("error", cleanup);
  };

  const handleGetPoll = async (req: IncomingMessage, res: ServerResponse, q: Query): Promise<void> => {
    const timeout = Number.isFinite(q.timeout)
      ? (q.timeout as number)
      : LONG_POLL_DEFAULT_LEASE_MS;
    const sinceSeq = parseCursor(q.cursor);
    const aborted = { v: false };
    const { promise, cancel } = longPoll(sinceSeq, timeout);
    req.on("close", () => {
      aborted.v = true;
      cancel();
    });
    const response = await promise;
    if (aborted.v) return;
    sendJson(res, 200, response);
  };

  const handlePostPoll = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    let raw: string;
    try {
      raw = await readBody(req);
    } catch (err) {
      sendError(res, 413, "BODY_TOO_LARGE", (err as Error).message);
      return;
    }
    const parsedJson = safeJson(raw.length === 0 ? "{}" : raw);
    if (!parsedJson.ok) {
      sendError(res, 400, "BAD_BODY", `invalid JSON: ${parsedJson.error}`);
      return;
    }
    const valueObj =
      typeof parsedJson.value === "object" && parsedJson.value !== null
        ? (parsedJson.value as Record<string, unknown>)
        : {};
    // Ensure a token is present for schema (auth was already validated
    // upstream). Server token is authoritative — a body-supplied `token`
    // cannot override it (see withAuthoritativeToken).
    const withToken = withAuthoritativeToken(valueObj, token);
    const parsed = LongPollRequestSchema.safeParse(withToken);
    let timeoutMs: number;
    let sinceSeq: number;
    if (!parsed.success) {
      // The contract refines `timeout <= LONG_POLL_CAP_MS` — silently clamp
      // instead of 400'ing, per docs/bridge-api.md POST /poll.
      const fallbackTimeout =
        typeof valueObj["timeout"] === "number"
          ? Math.min(valueObj["timeout"] as number, LONG_POLL_CAP_MS)
          : LONG_POLL_DEFAULT_LEASE_MS;
      timeoutMs = fallbackTimeout;
      sinceSeq = parseCursor(typeof valueObj["cursor"] === "string" ? (valueObj["cursor"] as string) : undefined);
    } else {
      timeoutMs = parsed.data.timeout ?? LONG_POLL_DEFAULT_LEASE_MS;
      sinceSeq = parseCursor(parsed.data.cursor);
    }
    const aborted = { v: false };
    const { promise, cancel } = longPoll(sinceSeq, timeoutMs);
    req.on("close", () => {
      aborted.v = true;
      cancel();
    });
    const response = await promise;
    if (aborted.v) return;
    sendJson(res, 200, response);
  };

  const stopServer = async (graceMs = 500): Promise<void> => {
    if (stopping) return;
    stopping = true;
    // Caller-owned teardown — port.lock release in the live runner, custom
    // teardown in tests. Errors are swallowed so HTTP stop and signal-driven
    // stop behave identically.
    if (opts.onBeforeStop !== undefined) {
      try {
        await opts.onBeforeStop();
      } catch {
        // ignore — best-effort
      }
    }
    // Drain pending waiters with empty responses.
    for (const w of [...pollWaiters]) deliverWaiter(w);
    // Close SSE subscribers.
    for (const sub of sseSubs.values()) {
      clearInterval(sub.heartbeat);
      try {
        sub.res.end();
      } catch {
        // ignore
      }
    }
    sseSubs.clear();
    await new Promise<void>((res) => {
      server.close(() => res());
      // Belt-and-suspenders: force-close after grace.
      setTimeout(() => res(), Math.max(graceMs, 0)).unref();
    });
  };

  const handleStop = (res: ServerResponse): void => {
    sendJson(res, 200, { stopping: true, graceMs: 500 });
    setTimeout(() => {
      void stopServer(500);
    }, 50).unref();
  };

  // ---- CORS — browser served at dev-server origin (e.g. 127.0.0.1:5173) must
  //          POST/GET to the bridge origin (e.g. 127.0.0.1:31338). Without
  //          `Access-Control-Allow-Origin` + a working OPTIONS preflight,
  //          Chrome silently blocks every browser→bridge fetch. The token
  //          guards the actual data — `*` is safe here because credentials
  //          (cookies) aren't used; the token rides in the URL query string.
  const setCorsHeaders = (res: ServerResponse): void => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept, Cache-Control");
    res.setHeader("Access-Control-Max-Age", "600");
  };

  // ---- Router ----

  const router = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const method = req.method ?? "GET";
    const path = urlPath(req);
    const q = parseQuery(req);

    // CORS headers on every response. Preflight short-circuits before auth so
    // the browser can negotiate without a token.
    setCorsHeaders(res);
    if (method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    // /health and /live.js are unauthenticated.
    if (method === "GET" && path === "/health") {
      handleHealth(res);
      return;
    }
    if (method === "GET" && path === "/live.js") {
      handleLiveJs(res);
      return;
    }

    // Every other route requires auth.
    const auth = validateToken(q.token, token);
    if (!auth.ok) {
      sendAuthError(res, auth.error);
      return;
    }

    if (method === "GET" && path === "/status") {
      handleStatus(res);
      return;
    }
    if (method === "GET" && path === "/design-system.json") {
      await handleDesignSystem(res);
      return;
    }
    if (method === "GET" && path === "/sessions") {
      await handleSessions(res);
      return;
    }
    if (method === "GET" && path === "/source") {
      await handleSource(res, q.path);
      return;
    }
    if (method === "GET" && path === "/events") {
      handleGetEventsSse(req, res);
      return;
    }
    if (method === "POST" && path === "/events") {
      await handlePostEvent(req, res);
      return;
    }
    if (method === "POST" && path === "/annotation") {
      await handlePostEvent(req, res, "annotation");
      return;
    }
    if (method === "GET" && path === "/poll") {
      await handleGetPoll(req, res, q);
      return;
    }
    if (method === "POST" && path === "/poll") {
      await handlePostPoll(req, res);
      return;
    }
    if (method === "GET" && path === "/stop") {
      handleStop(res);
      return;
    }

    sendError(res, 404, "NOT_FOUND", `${method} ${path} has no handler`);
  };

  const server: Server = createServer((req, res) => {
    router(req, res).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      try {
        sendError(res, 500, "INTERNAL", msg);
      } catch {
        // Response may already be partially flushed (SSE) — drop.
      }
    });
  });

  await new Promise<void>((res, rej) => {
    server.once("error", rej);
    server.listen({ port: port, host: "127.0.0.1" }, () => res());
  });

  const handle: BridgeServerHandle = {
    port: port,
    token,
    sessionId,
    status: async () => ({
      port: port,
      startedAt: startedAt.toISOString(),
      uptimeMs: Date.now() - startedAtMs,
      sessionId,
      pendingEvents: queue.length,
      connectedSseClients: sseSubs.size,
      projectRoot,
    }),
    stop: (graceMs?: number) => stopServer(graceMs),
  };
  // Test-only observability: number of parked long-poll waiters. Not part of
  // the BridgeServerHandle contract — exposed so disconnect-cleanup tests can
  // assert the waiter set drains rather than only that the server stays up.
  Object.defineProperty(handle, "pendingWaiters", {
    value: () => pollWaiters.size,
    enumerable: false,
  });
  return handle;
}
