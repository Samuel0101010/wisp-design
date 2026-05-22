// wisp-design — Agent ↔ Bridge primitives (Phase 4).
//
// Implements PollLoopModule from src/contracts/agent.ts. Two one-shot library
// functions (`pollOnce`, `postEvent`) wrap the bridge's HTTP endpoints, plus
// a synchronous `routeEvent` classifier. The CLI runners (`runPollOnce`,
// `runPostEvent`) parse argv, resolve the bridge via `.wisp/live/port.lock`,
// invoke the library function, and emit JSON to stdout for the skill prompt
// to consume.
//
// The loop itself lives in `skills/wisp-design/SKILL.md` — Claude Code's
// reasoning IS the loop. See docs/agent-loop.md §1.

import {
  POLL_LOOP_DEFAULT_LEASE_MS,
  POLL_LOOP_DEFAULT_TIMEOUT_MS,
  POLL_LOOP_MIN_TIMEOUT_MS,
  PollOnceOptionsSchema,
  type AgentActionKind,
  type PollOnceOptions,
  type PollOnceResult,
  type PostEventOptions,
  type PostEventResult,
} from "../contracts/agent.js";
import {
  BridgeEventSchema,
  type BridgeEvent,
  type LongPollResponse,
} from "../contracts/bridge.js";
import {
  EXIT_ARG,
  EXIT_HTTP,
  EXIT_IO,
  EXIT_OK,
  PortLockMissingError,
  PortLockStaleError,
  flagAsNumber,
  flagAsString,
  parseFlags,
  readPortLock,
  writeError,
  writeJsonResult,
} from "./_helpers.js";

// Extra headroom over the server's slicing cap. The bridge slices at
// LONG_POLL_CAP_MS = 270_000ms; if the network is healthy the response
// arrives within a few ms of that. We give the AbortController 5s slack
// before unilaterally aborting — beyond that the connection is wedged and
// the agent loop is better off restarting the slice.
const ABORT_HEADROOM_MS = 5_000;

// ---------------------------------------------------------------------------
// pollOnce — one-shot GET /poll. Returns the events that arrived since the
// supplied cursor (or since session-start when cursor is omitted), along with
// the bridge-side wall-clock and a `shouldRetry` flag.
//
// `shouldRetry` semantics:
//   • true  → the bridge sliced its 270s cap before any new events arrived,
//             or before the caller's `timeoutMs` elapsed (e.g. 30s lease).
//             The skill should immediately re-invoke with the returned
//             `cursor`. At-least-once delivery applies.
//   • false → events were delivered and the caller can process them before
//             the next poll. (Or the wall-clock landed well inside the
//             requested timeout, meaning the bridge had a buffered event.)
// ---------------------------------------------------------------------------

export async function pollOnce(opts: PollOnceOptions): Promise<PollOnceResult> {
  const parsed = PollOnceOptionsSchema.parse(opts);

  if (parsed.transport === "sse") {
    // SSE is a browser-only transport — `EventSource` doesn't exist in
    // Node, and the agent loop deliberately uses long-poll so each step is
    // a discrete, restartable Bash invocation.
    throw new Error(
      "pollOnce: transport=sse is browser-only; the agent loop uses long-poll",
    );
  }

  const url = buildPollUrl(parsed);
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    parsed.timeoutMs + ABORT_HEADROOM_MS,
  );

  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      throw new BridgeRequestError(
        "TIMEOUT",
        `pollOnce aborted after ${parsed.timeoutMs + ABORT_HEADROOM_MS}ms`,
      );
    }
    throw new BridgeRequestError(
      "FETCH_FAILED",
      `pollOnce fetch failed: ${(err as Error).message}`,
    );
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const body = await safeReadBody(res);
    throw new BridgeRequestError(
      `HTTP_${res.status}`,
      `pollOnce: bridge returned ${res.status}`,
      body,
    );
  }

  const json = (await res.json()) as unknown;
  const parsedBody = parseLongPollResponse(json);

  // shouldRetry = bridge sliced before any new events. Heuristic: zero
  // events AND the slice happened within the cap window. The bridge's
  // slicedAt is its wall-clock at the time of response; we don't have a
  // pre-call timestamp here (we'd race the network), so we use a robust
  // proxy: any empty response is "retry immediately". The skill is
  // idempotent under spurious retries (cursor advances monotonically).
  const shouldRetry =
    parsedBody.events.length === 0 ||
    // Belt-and-suspenders: even if events were delivered, if the wall-clock
    // is within 1s of the caller's deadline we likely sliced.
    Date.now() - parsedBody.slicedAt < 1_000 &&
      parsed.timeoutMs >= POLL_LOOP_DEFAULT_TIMEOUT_MS;

  return {
    events: parsedBody.events,
    cursor: parsedBody.cursor,
    slicedAt: parsedBody.slicedAt,
    shouldRetry,
  };
}

function buildPollUrl(opts: PollOnceOptions): string {
  const u = new URL(`${opts.bridgeUrl.replace(/\/+$/, "")}/poll`);
  u.searchParams.set("token", opts.token);
  u.searchParams.set("timeout", String(opts.timeoutMs));
  u.searchParams.set("leaseMs", String(opts.leaseMs));
  if (opts.cursor !== undefined && opts.cursor.length > 0) {
    u.searchParams.set("cursor", opts.cursor);
  }
  return u.toString();
}

function parseLongPollResponse(raw: unknown): LongPollResponse {
  if (typeof raw !== "object" || raw === null) {
    throw new BridgeRequestError(
      "BAD_RESPONSE",
      "pollOnce: bridge response was not an object",
    );
  }
  const obj = raw as Record<string, unknown>;
  const events = obj["events"];
  const cursor = obj["cursor"];
  const slicedAt = obj["slicedAt"];
  if (!Array.isArray(events) || typeof cursor !== "string" || typeof slicedAt !== "number") {
    throw new BridgeRequestError(
      "BAD_RESPONSE",
      "pollOnce: bridge response missing events/cursor/slicedAt",
    );
  }
  const validated: BridgeEvent[] = [];
  for (const ev of events) {
    const v = BridgeEventSchema.safeParse(ev);
    if (!v.success) {
      throw new BridgeRequestError(
        "BAD_RESPONSE",
        `pollOnce: event failed schema: ${v.error.issues.map((i) => i.message).join("; ")}`,
      );
    }
    validated.push(v.data);
  }
  return { events: validated, cursor, slicedAt };
}

// ---------------------------------------------------------------------------
// postEvent — one-shot POST /events. Used by the agent to push cycling /
// generating / error events back to the browser after reasoning about a
// `configure` event.
// ---------------------------------------------------------------------------

export async function postEvent(
  opts: PostEventOptions,
): Promise<PostEventResult> {
  if (opts.bridgeUrl === "" || opts.token === "") {
    throw new BridgeRequestError(
      "BAD_REQUEST",
      "postEvent: bridgeUrl and token are required",
    );
  }
  const eventCheck = BridgeEventSchema.safeParse(opts.event);
  if (!eventCheck.success) {
    throw new BridgeRequestError(
      "BAD_REQUEST",
      "postEvent: event failed schema validation",
      eventCheck.error.issues,
    );
  }

  const url = new URL(`${opts.bridgeUrl.replace(/\/+$/, "")}/events`);
  url.searchParams.set("token", opts.token);

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(opts.event),
    });
  } catch (err) {
    throw new BridgeRequestError(
      "FETCH_FAILED",
      `postEvent fetch failed: ${(err as Error).message}`,
    );
  }

  if (!res.ok) {
    const body = await safeReadBody(res);
    throw new BridgeRequestError(
      `HTTP_${res.status}`,
      `postEvent: bridge returned ${res.status}`,
      body,
    );
  }

  const json = (await res.json()) as unknown;
  const cursor = parsePostEventResponse(json);
  return { ok: true, cursor };
}

function parsePostEventResponse(raw: unknown): string {
  if (typeof raw !== "object" || raw === null) {
    throw new BridgeRequestError(
      "BAD_RESPONSE",
      "postEvent: bridge response was not an object",
    );
  }
  const obj = raw as Record<string, unknown>;
  if (typeof obj["cursor"] !== "string") {
    throw new BridgeRequestError(
      "BAD_RESPONSE",
      "postEvent: bridge response missing cursor",
    );
  }
  return obj["cursor"];
}

async function safeReadBody(res: Response): Promise<unknown> {
  try {
    return (await res.json()) as unknown;
  } catch {
    try {
      return await res.text();
    } catch {
      return undefined;
    }
  }
}

// ---------------------------------------------------------------------------
// routeEvent — synchronous classifier. The skill prompt uses this to decide
// which next-step Bash to run for each event in PollOnceResult.events.
// ---------------------------------------------------------------------------

export function routeEvent(evt: BridgeEvent): {
  action: AgentActionKind;
  source: BridgeEvent;
} {
  let action: AgentActionKind;
  switch (evt.kind) {
    case "configure":
      action = "generate-variants";
      break;
    case "accept":
      action = "write-accept";
      break;
    case "discard":
      action = "clean-discard";
      break;
    case "annotation":
      action = "log-annotation";
      break;
    case "pick":
    case "cycling":
    case "parameter-change":
    case "generating":
    case "heartbeat":
    case "error":
      action = "ignore";
      break;
    default: {
      // Exhaustiveness check: if a new BridgeEvent kind lands and we forgot
      // to handle it, TypeScript will error here at compile time.
      const _exhaustive: never = evt;
      void _exhaustive;
      action = "ignore";
    }
  }
  return { action, source: evt };
}

// ---------------------------------------------------------------------------
// BridgeRequestError — uniform error type for both pollOnce and postEvent.
// CLI runners catch this and map to exit code 3 (upstream HTTP error).
// ---------------------------------------------------------------------------

export class BridgeRequestError extends Error {
  public override readonly name = "BridgeRequestError";
  constructor(
    public readonly code: string,
    message: string,
    public readonly detail?: unknown,
  ) {
    super(message);
  }
}

// ---------------------------------------------------------------------------
// CLI runners — invoked by src/index.ts via the lazy-load mechanism. Each
// runner returns its own exit code; the dispatcher in src/index.ts calls
// `process.exit(code)`.
// ---------------------------------------------------------------------------

export async function runPollOnce(args: string[]): Promise<number> {
  const parsed = parseFlags(args);

  const timeoutMs = flagAsNumber(parsed, "timeout") ?? POLL_LOOP_DEFAULT_TIMEOUT_MS;
  const leaseMs = flagAsNumber(parsed, "lease") ?? POLL_LOOP_DEFAULT_LEASE_MS;
  const cursor = flagAsString(parsed, "cursor");
  const transportRaw = flagAsString(parsed, "transport") ?? "long-poll";

  if (transportRaw !== "long-poll" && transportRaw !== "sse") {
    writeError({
      code: "BAD_FLAG",
      message: `--transport must be "long-poll" or "sse"; got "${transportRaw}"`,
    });
    return EXIT_ARG;
  }
  if (timeoutMs < POLL_LOOP_MIN_TIMEOUT_MS) {
    writeError({
      code: "BAD_FLAG",
      message: `--timeout must be >= ${POLL_LOOP_MIN_TIMEOUT_MS}ms; got ${timeoutMs}`,
    });
    return EXIT_ARG;
  }

  let bridge;
  try {
    bridge = await readPortLock(process.cwd());
  } catch (err) {
    if (err instanceof PortLockMissingError || err instanceof PortLockStaleError) {
      writeError({ code: "BRIDGE_NOT_RUNNING", message: err.message });
      return EXIT_IO;
    }
    writeError({
      code: "PORT_LOCK_READ_FAILED",
      message: (err as Error).message,
    });
    return EXIT_IO;
  }

  const options: PollOnceOptions = {
    bridgeUrl: bridge.bridgeUrl,
    token: bridge.token,
    timeoutMs,
    leaseMs,
    cursor: cursor ?? undefined,
    transport: transportRaw,
  };

  try {
    const result = await pollOnce(options);
    writeJsonResult(result);
    return EXIT_OK;
  } catch (err) {
    if (err instanceof BridgeRequestError) {
      writeError({ code: err.code, message: err.message, detail: err.detail });
      return EXIT_HTTP;
    }
    writeError({
      code: "POLL_ONCE_FAILED",
      message: (err as Error).message,
    });
    return EXIT_HTTP;
  }
}

export async function runPostEvent(args: string[]): Promise<number> {
  const parsed = parseFlags(args);

  const eventJson = flagAsString(parsed, "event");
  const kind = flagAsString(parsed, "kind");
  const payloadJson = flagAsString(parsed, "payload");

  let candidate: unknown;
  if (eventJson !== undefined) {
    try {
      candidate = JSON.parse(eventJson);
    } catch (err) {
      writeError({
        code: "BAD_FLAG",
        message: `--event must be valid JSON: ${(err as Error).message}`,
      });
      return EXIT_ARG;
    }
  } else if (kind !== undefined && payloadJson !== undefined) {
    let payload: unknown;
    try {
      payload = JSON.parse(payloadJson);
    } catch (err) {
      writeError({
        code: "BAD_FLAG",
        message: `--payload must be valid JSON: ${(err as Error).message}`,
      });
      return EXIT_ARG;
    }
    if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
      writeError({
        code: "BAD_FLAG",
        message: "--payload must be a JSON object",
      });
      return EXIT_ARG;
    }
    candidate = { kind, ...(payload as Record<string, unknown>) };
  } else {
    writeError({
      code: "BAD_FLAG",
      message: "post-event requires --event <json> OR (--kind K --payload <json>)",
    });
    return EXIT_ARG;
  }

  const validated = BridgeEventSchema.safeParse(candidate);
  if (!validated.success) {
    writeError({
      code: "BAD_EVENT",
      message: "event failed schema validation",
      detail: validated.error.issues,
    });
    return EXIT_ARG;
  }

  let bridge;
  try {
    bridge = await readPortLock(process.cwd());
  } catch (err) {
    if (err instanceof PortLockMissingError || err instanceof PortLockStaleError) {
      writeError({ code: "BRIDGE_NOT_RUNNING", message: err.message });
      return EXIT_IO;
    }
    writeError({
      code: "PORT_LOCK_READ_FAILED",
      message: (err as Error).message,
    });
    return EXIT_IO;
  }

  try {
    const result = await postEvent({
      bridgeUrl: bridge.bridgeUrl,
      token: bridge.token,
      event: validated.data,
    });
    writeJsonResult(result);
    return EXIT_OK;
  } catch (err) {
    if (err instanceof BridgeRequestError) {
      writeError({ code: err.code, message: err.message, detail: err.detail });
      return EXIT_HTTP;
    }
    writeError({
      code: "POST_EVENT_FAILED",
      message: (err as Error).message,
    });
    return EXIT_HTTP;
  }
}
