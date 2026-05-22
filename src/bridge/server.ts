// wisp-design — Bridge HTTP+SSE server (Phase 1).
// Plain Node http. SSE pushes browser←bridge; long-poll pulls agent←bridge.
// Long-poll timeout silently capped at LONG_POLL_CAP_MS (270s) — Node fetch
// caps headers timeout at 300s. Auth + path-traversal live in ./auth.ts.

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
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
  type Query,
} from "./http-helpers.js";

const LIVE_JS_STUB =
  "// wisp-design live.js — Phase 1 stub. Phase 2 wires the IIFE.\n";
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

  const longPoll = (
    sinceSeq: number,
    timeoutMs: number,
  ): Promise<LongPollResponse> => {
    const cap = Math.min(Math.max(timeoutMs, 0), LONG_POLL_CAP_MS);
    // Fast-path: events already pending → return immediately.
    const ready = eventsSince(sinceSeq);
    if (ready.length > 0) {
      const last = ready[ready.length - 1];
      return Promise.resolve({
        events: ready.map((q) => q.event),
        cursor: last !== undefined ? last.cursor : `seq-${seqCounter}-${sessionId}`,
        slicedAt: 0,
      });
    }
    return new Promise<LongPollResponse>((res) => {
      const waiter: PollWaiter = {
        resolve: res,
        sinceSeq,
        startedAt: Date.now(),
        timer: setTimeout(() => deliverWaiter(waiter), cap),
      };
      pollWaiters.add(waiter);
    });
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

  const handleLiveJs = (res: ServerResponse): void => {
    res.writeHead(200, {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
    });
    res.end(LIVE_JS_STUB);
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
    const timeout = q.timeout ?? LONG_POLL_DEFAULT_LEASE_MS;
    const sinceSeq = parseCursor(q.cursor);
    const aborted = { v: false };
    req.on("close", () => {
      aborted.v = true;
    });
    const response = await longPoll(sinceSeq, timeout);
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
    // Ensure a token is present for schema (auth was already validated upstream).
    const withToken = { token, ...valueObj };
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
    req.on("close", () => {
      aborted.v = true;
    });
    const response = await longPoll(sinceSeq, timeoutMs);
    if (aborted.v) return;
    sendJson(res, 200, response);
  };

  const stopServer = async (graceMs = 500): Promise<void> => {
    if (stopping) return;
    stopping = true;
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

  // ---- Router ----

  const router = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const method = req.method ?? "GET";
    const path = urlPath(req);
    const q = parseQuery(req);

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
  return handle;
}
