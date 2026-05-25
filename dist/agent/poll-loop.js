#!/usr/bin/env node

// src/contracts/agent.ts
import { z } from "zod";
var POLL_LOOP_DEFAULT_TIMEOUT_MS = 27e4;
var POLL_LOOP_DEFAULT_LEASE_MS = 3e4;
var POLL_LOOP_MIN_TIMEOUT_MS = 1e3;
var DEFAULT_SKILLS_NAMESPACE = "wisp-design";
var VARIANT_AXES = [
  "hierarchy",
  // size/weight relationships, primary action prominence
  "layout",
  // arrangement, density grid, spacing, alignment
  "typography",
  // family pairing, scale, leading
  "color",
  // accent role, semantic colour, surface treatment
  "density"
  // padding/margin scale, breathing room, information density
];
var VariantAxisSchema = z.enum(VARIANT_AXES);
var PollTransportSchema = z.enum(["sse", "long-poll"]);
var PollOnceOptionsSchema = z.object({
  bridgeUrl: z.string().url(),
  token: z.string().uuid(),
  timeoutMs: z.number().int().min(POLL_LOOP_MIN_TIMEOUT_MS).max(POLL_LOOP_DEFAULT_TIMEOUT_MS).default(POLL_LOOP_DEFAULT_TIMEOUT_MS),
  leaseMs: z.number().int().min(1e3).default(POLL_LOOP_DEFAULT_LEASE_MS),
  cursor: z.string().optional(),
  transport: PollTransportSchema.default("long-poll")
});
var VoiceDistanceSchema = z.enum([
  "intimate",
  "conversational",
  "formal"
]);
var VoiceTemperatureSchema = z.enum(["warm", "cool", "neutral"]);
var VisualDirectionSchema = z.enum([
  "editorial",
  "modern-minimal",
  "tech-utility",
  "brutalist",
  "soft-warm"
]);
var ALLOWED_VARIANT_ANCHORS = [
  "linear",
  "stripe",
  "anthropic",
  "aceternity",
  "apple",
  "vercel",
  "raycast",
  "notion",
  "github",
  "tailwind-ui",
  "shadcn-default",
  "shadcn-soft",
  "shadcn-bold"
];
var VariantAnchorSchema = z.enum(ALLOWED_VARIANT_ANCHORS);
var PaletteModeSchema = z.enum(["oklch", "hsl", "hex"]);
var BrandSpecSchema = z.object({
  name: z.string().min(1),
  oneLiner: z.string().min(1).max(280),
  audience: z.array(z.string().min(1)).default([]),
  voice: z.object({
    tone: z.string().min(1),
    distance: VoiceDistanceSchema,
    temperature: VoiceTemperatureSchema
  }).optional(),
  visualDirection: VisualDirectionSchema.optional(),
  variantAnchor: VariantAnchorSchema.optional(),
  palette: z.object({
    mode: PaletteModeSchema,
    // Keys are role tokens (`bg`, `fg`, `accent`, `muted`, …); values are
    // literal strings in the declared `mode`. The variant prompt prefers
    // these over sampled colors when both are present.
    values: z.record(z.string().min(1), z.string().min(1))
  }).optional(),
  typeScale: z.object({
    baseSize: z.number().positive(),
    step: z.number().positive().default(1.333)
  }).optional(),
  motion: z.object({
    // Common keys: `--ease-smooth`, `--ease-sharp`, `--ease-spring`, `--ease-power`.
    // Free-form so brand-asset-extract can store proprietary easings.
    tokens: z.record(z.string().min(1), z.string().min(1))
  }).optional(),
  brandAssets: z.object({
    logo: z.string().min(1).optional(),
    wordmark: z.string().min(1).optional()
  }).optional()
});
var DesignTokensSchema = z.object({
  extractedAt: z.string(),
  spacing: z.array(z.number().nonnegative()).default([]),
  radii: z.array(z.number().nonnegative()).default([]),
  fontSizes: z.array(z.number().positive()).default([]),
  fontWeights: z.array(z.number().int().positive()).default([]),
  colors: z.array(z.string().min(1)).default([]),
  fontFamilies: z.array(z.string().min(1)).default([]),
  zIndex: z.array(z.number().int()).default([])
});
var ComponentLibSchema = z.enum([
  "shadcn",
  "radix",
  "mui",
  "tailwind",
  "vanilla"
]);
var SkillsIndexOptionsSchema = z.object({
  skillsRoot: z.string().min(1),
  namespace: z.string().min(1).default(DEFAULT_SKILLS_NAMESPACE)
});
var SkillsIndexResultSchema = z.object({
  indexedFiles: z.number().int().nonnegative(),
  // Counts per sub-namespace (`anchors`, `directions`, `corpus`, `patterns`,
  // `policy`, `methodology`, `reference`). Lets `doctor` warn when a slice
  // is missing.
  byNamespace: z.record(z.string(), z.number().int().nonnegative()),
  durationMs: z.number().nonnegative(),
  // The AgentDB controller key the corpus was indexed under. Searches MUST
  // pass the same key to retrieve consistent results.
  agentDbController: z.string().min(1)
});
var SkillsSearchOptionsSchema = z.object({
  topK: z.number().int().min(1).max(50).default(8),
  namespace: z.string().min(1).default(DEFAULT_SKILLS_NAMESPACE)
});
var SkillsSearchResultSchema = z.object({
  filePath: z.string().min(1),
  score: z.number(),
  snippet: z.string(),
  namespace: z.string().min(1)
});
var SyncSourceSchema = z.object({
  fromPath: z.string().min(1),
  patterns: z.array(z.string().min(1)).default(["**/*.md"]),
  // Destination is fixed; the schema literal lets the doctor check that
  // `wisp-design sync` is correctly wired without re-reading config.
  destination: z.literal("skills/data/patterns/"),
  attribution: z.object({
    owner: z.string().min(1),
    license: z.string().min(1)
  }).optional()
});

// src/contracts/bridge.ts
import { z as z2 } from "zod";
var PortLockSchema = z2.object({
  port: z2.number().int().min(31337).max(31400),
  token: z2.string().uuid(),
  pid: z2.number().int().positive(),
  startedAt: z2.string().datetime(),
  projectRoot: z2.string().min(1)
});
var ElementRectSchema = z2.object({
  x: z2.number(),
  y: z2.number(),
  w: z2.number().nonnegative(),
  h: z2.number().nonnegative()
});
var ElementTargetSchema = z2.object({
  selector: z2.string().min(1),
  rect: ElementRectSchema,
  tag: z2.string().min(1)
});
var sessionId = z2.string().min(1);
var AnnotationKindSchema = z2.enum([
  "padding",
  "color",
  "size",
  "content",
  "other"
]);
var StructuredAnnotationSchema = z2.object({
  kind: AnnotationKindSchema,
  note: z2.string().min(1).max(2e3)
});
var VariantSchema = z2.object({
  id: z2.string().min(1),
  css: z2.string(),
  rationale: z2.string().min(1).max(280)
});
var PickEventSchema = z2.object({
  kind: z2.literal("pick"),
  target: ElementTargetSchema,
  sessionId
});
var ConfigureEventSchema = z2.object({
  kind: z2.literal("configure"),
  target: ElementTargetSchema,
  freeText: z2.string().min(1).max(4e3),
  sessionId
});
var GeneratingEventSchema = z2.object({
  kind: z2.literal("generating"),
  target: ElementTargetSchema,
  freeText: z2.string().min(1).max(4e3),
  variantCount: z2.number().int().min(1).max(8),
  sessionId
});
var CyclingEventSchema = z2.object({
  kind: z2.literal("cycling"),
  target: ElementTargetSchema,
  variants: z2.array(VariantSchema).min(1).max(8),
  activeIndex: z2.number().int().nonnegative(),
  sessionId
});
var ParameterChangeEventSchema = z2.object({
  kind: z2.literal("parameter-change"),
  target: ElementTargetSchema,
  varName: z2.string().min(1),
  value: z2.string(),
  sessionId
});
var AcceptEventSchema = z2.object({
  kind: z2.literal("accept"),
  target: ElementTargetSchema,
  variantId: z2.string().min(1),
  sessionId,
  // Phase 7.8 — Browser includes the accepted variant's CSS so the in-process
  // accept handler can splice it into source without regenerating from a stub.
  // Optional for back-compat: older browsers / tests omit this and the handler
  // falls back to stub regeneration.
  variantCss: z2.string().optional(),
  rationale: z2.string().optional()
});
var DiscardEventSchema = z2.object({
  kind: z2.literal("discard"),
  target: ElementTargetSchema,
  sessionId
});
var AnnotationEventSchema = z2.object({
  kind: z2.literal("annotation"),
  target: ElementTargetSchema,
  annotation: StructuredAnnotationSchema,
  sessionId
});
var ErrorEventSchema = z2.object({
  kind: z2.literal("error"),
  message: z2.string().min(1),
  code: z2.string().optional(),
  sessionId: sessionId.optional()
});
var HeartbeatEventSchema = z2.object({
  kind: z2.literal("heartbeat"),
  at: z2.string().datetime()
});
var BridgeEventSchema = z2.discriminatedUnion("kind", [
  PickEventSchema,
  ConfigureEventSchema,
  GeneratingEventSchema,
  CyclingEventSchema,
  ParameterChangeEventSchema,
  AcceptEventSchema,
  DiscardEventSchema,
  AnnotationEventSchema,
  ErrorEventSchema,
  HeartbeatEventSchema
]);
var LONG_POLL_CAP_MS = 27e4;
var LONG_POLL_MIN_TIMEOUT_MS = 1e3;
var LongPollRequestSchema = z2.object({
  token: z2.string().uuid(),
  timeout: z2.number().int().min(LONG_POLL_MIN_TIMEOUT_MS).optional(),
  leaseMs: z2.number().int().min(1e3).optional(),
  cursor: z2.string().optional()
}).refine(
  (v) => v.timeout === void 0 || v.timeout <= LONG_POLL_CAP_MS,
  {
    message: `timeout must be <= ${LONG_POLL_CAP_MS}ms (Node fetch header cap is 300_000ms)`,
    path: ["timeout"]
  }
);
var LongPollResponseSchema = z2.object({
  events: z2.array(BridgeEventSchema),
  cursor: z2.string(),
  // Server-wall-clock at which it sliced the response. Lets the agent measure
  // drift against its own local clock when budgeting the next slice.
  slicedAt: z2.number().int().nonnegative()
});
var BridgeHttpErrorSchema = z2.object({
  error: z2.object({
    code: z2.string().min(1),
    message: z2.string().min(1),
    detail: z2.unknown().optional()
  })
});
var BridgeStatusSchema = z2.object({
  port: z2.number().int().positive(),
  startedAt: z2.string().datetime(),
  uptimeMs: z2.number().int().nonnegative(),
  sessionId: z2.string().min(1),
  pendingEvents: z2.number().int().nonnegative(),
  connectedSseClients: z2.number().int().nonnegative(),
  projectRoot: z2.string().min(1)
});
var BridgeHealthSchema = z2.object({
  ok: z2.literal(true),
  version: z2.string().min(1)
});

// src/agent/_helpers.ts
import { readFile } from "fs/promises";
import { resolve } from "path";
var PortLockMissingError = class extends Error {
  constructor(lockPath) {
    super(
      `bridge not running: no port-lock at ${lockPath}. Start the bridge with \`wisp-design live\`.`
    );
    this.lockPath = lockPath;
  }
  lockPath;
  name = "PortLockMissingError";
};
var PortLockStaleError = class extends Error {
  constructor(lockPath, pid) {
    super(
      `bridge not running: port-lock at ${lockPath} references stale PID ${pid}. Remove the lock and restart the bridge.`
    );
    this.lockPath = lockPath;
    this.pid = pid;
  }
  lockPath;
  pid;
  name = "PortLockStaleError";
};
function isPidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    const code = err.code;
    if (code === "EPERM") return true;
    return false;
  }
}
async function readPortLock(projectRoot) {
  const lockPath = resolve(projectRoot, ".wisp/live/port.lock");
  let raw;
  try {
    raw = await readFile(lockPath, "utf8");
  } catch (err) {
    const code = err.code;
    if (code === "ENOENT" || code === "ENOTDIR") {
      throw new PortLockMissingError(lockPath);
    }
    throw err;
  }
  let json;
  try {
    json = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `port-lock at ${lockPath} is not valid JSON: ${err.message}`
    );
  }
  const parsed = PortLockSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error(
      `port-lock at ${lockPath} failed schema validation: ` + parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")
    );
  }
  const lock = parsed.data;
  if (!isPidAlive(lock.pid)) {
    throw new PortLockStaleError(lockPath, lock.pid);
  }
  return {
    port: lock.port,
    token: lock.token,
    pid: lock.pid,
    bridgeUrl: `http://127.0.0.1:${lock.port}`
  };
}
function parseFlags(args) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < args.length; i += 1) {
    const token = args[i];
    if (!token.startsWith("--")) {
      positional.push(token);
      continue;
    }
    const key = token.slice(2);
    if (key.startsWith("no-")) {
      flags[key.slice(3)] = false;
      continue;
    }
    const next = args[i + 1];
    if (next === void 0 || next.startsWith("--")) {
      flags[key] = true;
      continue;
    }
    flags[key] = next;
    i += 1;
  }
  return { flags, positional };
}
function flagAsString(parsed, key) {
  const v = parsed.flags[key];
  if (typeof v === "string") return v;
  return void 0;
}
function flagAsNumber(parsed, key) {
  const v = parsed.flags[key];
  if (typeof v !== "string") return void 0;
  const n = Number(v);
  if (!Number.isFinite(n)) return void 0;
  return n;
}
function writeJsonResult(obj) {
  process.stdout.write(`${JSON.stringify(obj, null, 2)}
`);
}
function writeError(err) {
  process.stderr.write(`${JSON.stringify({ error: err })}
`);
}
var EXIT_OK = 0;
var EXIT_IO = 1;
var EXIT_ARG = 2;
var EXIT_HTTP = 3;

// src/agent/poll-loop.ts
var ABORT_HEADROOM_MS = 5e3;
async function pollOnce(opts) {
  const parsed = PollOnceOptionsSchema.parse(opts);
  if (parsed.transport === "sse") {
    throw new Error(
      "pollOnce: transport=sse is browser-only; the agent loop uses long-poll"
    );
  }
  const url = buildPollUrl(parsed);
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    parsed.timeoutMs + ABORT_HEADROOM_MS
  );
  let res;
  try {
    res = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: { Accept: "application/json" }
    });
  } catch (err) {
    if (err.name === "AbortError") {
      throw new BridgeRequestError(
        "TIMEOUT",
        `pollOnce aborted after ${parsed.timeoutMs + ABORT_HEADROOM_MS}ms`
      );
    }
    throw new BridgeRequestError(
      "FETCH_FAILED",
      `pollOnce fetch failed: ${err.message}`
    );
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    const body = await safeReadBody(res);
    throw new BridgeRequestError(
      `HTTP_${res.status}`,
      `pollOnce: bridge returned ${res.status}`,
      body
    );
  }
  const json = await res.json();
  const parsedBody = parseLongPollResponse(json);
  const shouldRetry = parsedBody.events.length === 0 || // Belt-and-suspenders: even if events were delivered, if the wall-clock
  // is within 1s of the caller's deadline we likely sliced.
  Date.now() - parsedBody.slicedAt < 1e3 && parsed.timeoutMs >= POLL_LOOP_DEFAULT_TIMEOUT_MS;
  return {
    events: parsedBody.events,
    cursor: parsedBody.cursor,
    slicedAt: parsedBody.slicedAt,
    shouldRetry
  };
}
function buildPollUrl(opts) {
  const u = new URL(`${opts.bridgeUrl.replace(/\/+$/, "")}/poll`);
  u.searchParams.set("token", opts.token);
  u.searchParams.set("timeout", String(opts.timeoutMs));
  u.searchParams.set("leaseMs", String(opts.leaseMs));
  if (opts.cursor !== void 0 && opts.cursor.length > 0) {
    u.searchParams.set("cursor", opts.cursor);
  }
  return u.toString();
}
function parseLongPollResponse(raw) {
  if (typeof raw !== "object" || raw === null) {
    throw new BridgeRequestError(
      "BAD_RESPONSE",
      "pollOnce: bridge response was not an object"
    );
  }
  const obj = raw;
  const events = obj["events"];
  const cursor = obj["cursor"];
  const slicedAt = obj["slicedAt"];
  if (!Array.isArray(events) || typeof cursor !== "string" || typeof slicedAt !== "number") {
    throw new BridgeRequestError(
      "BAD_RESPONSE",
      "pollOnce: bridge response missing events/cursor/slicedAt"
    );
  }
  const validated = [];
  for (const ev of events) {
    const v = BridgeEventSchema.safeParse(ev);
    if (!v.success) {
      throw new BridgeRequestError(
        "BAD_RESPONSE",
        `pollOnce: event failed schema: ${v.error.issues.map((i) => i.message).join("; ")}`
      );
    }
    validated.push(v.data);
  }
  return { events: validated, cursor, slicedAt };
}
async function postEvent(opts) {
  if (opts.bridgeUrl === "" || opts.token === "") {
    throw new BridgeRequestError(
      "BAD_REQUEST",
      "postEvent: bridgeUrl and token are required"
    );
  }
  const eventCheck = BridgeEventSchema.safeParse(opts.event);
  if (!eventCheck.success) {
    throw new BridgeRequestError(
      "BAD_REQUEST",
      "postEvent: event failed schema validation",
      eventCheck.error.issues
    );
  }
  const url = new URL(`${opts.bridgeUrl.replace(/\/+$/, "")}/events`);
  url.searchParams.set("token", opts.token);
  let res;
  try {
    res = await fetch(url.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify(opts.event)
    });
  } catch (err) {
    throw new BridgeRequestError(
      "FETCH_FAILED",
      `postEvent fetch failed: ${err.message}`
    );
  }
  if (!res.ok) {
    const body = await safeReadBody(res);
    throw new BridgeRequestError(
      `HTTP_${res.status}`,
      `postEvent: bridge returned ${res.status}`,
      body
    );
  }
  const json = await res.json();
  const cursor = parsePostEventResponse(json);
  return { ok: true, cursor };
}
function parsePostEventResponse(raw) {
  if (typeof raw !== "object" || raw === null) {
    throw new BridgeRequestError(
      "BAD_RESPONSE",
      "postEvent: bridge response was not an object"
    );
  }
  const obj = raw;
  if (typeof obj["cursor"] !== "string") {
    throw new BridgeRequestError(
      "BAD_RESPONSE",
      "postEvent: bridge response missing cursor"
    );
  }
  return obj["cursor"];
}
async function safeReadBody(res) {
  try {
    return await res.json();
  } catch {
    try {
      return await res.text();
    } catch {
      return void 0;
    }
  }
}
function routeEvent(evt) {
  let action;
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
      const _exhaustive = evt;
      void _exhaustive;
      action = "ignore";
    }
  }
  return { action, source: evt };
}
var BridgeRequestError = class extends Error {
  constructor(code, message, detail) {
    super(message);
    this.code = code;
    this.detail = detail;
  }
  code;
  detail;
  name = "BridgeRequestError";
};
async function runPollOnce(args) {
  const parsed = parseFlags(args);
  const timeoutMs = flagAsNumber(parsed, "timeout") ?? POLL_LOOP_DEFAULT_TIMEOUT_MS;
  const leaseMs = flagAsNumber(parsed, "lease") ?? POLL_LOOP_DEFAULT_LEASE_MS;
  const cursor = flagAsString(parsed, "cursor");
  const transportRaw = flagAsString(parsed, "transport") ?? "long-poll";
  if (transportRaw !== "long-poll" && transportRaw !== "sse") {
    writeError({
      code: "BAD_FLAG",
      message: `--transport must be "long-poll" or "sse"; got "${transportRaw}"`
    });
    return EXIT_ARG;
  }
  if (timeoutMs < POLL_LOOP_MIN_TIMEOUT_MS) {
    writeError({
      code: "BAD_FLAG",
      message: `--timeout must be >= ${POLL_LOOP_MIN_TIMEOUT_MS}ms; got ${timeoutMs}`
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
      message: err.message
    });
    return EXIT_IO;
  }
  const options = {
    bridgeUrl: bridge.bridgeUrl,
    token: bridge.token,
    timeoutMs,
    leaseMs,
    cursor: cursor ?? void 0,
    transport: transportRaw
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
      message: err.message
    });
    return EXIT_HTTP;
  }
}
async function runPostEvent(args) {
  const parsed = parseFlags(args);
  const eventJson = flagAsString(parsed, "event");
  const kind = flagAsString(parsed, "kind");
  const payloadJson = flagAsString(parsed, "payload");
  let candidate;
  if (eventJson !== void 0) {
    try {
      candidate = JSON.parse(eventJson);
    } catch (err) {
      writeError({
        code: "BAD_FLAG",
        message: `--event must be valid JSON: ${err.message}`
      });
      return EXIT_ARG;
    }
  } else if (kind !== void 0 && payloadJson !== void 0) {
    let payload;
    try {
      payload = JSON.parse(payloadJson);
    } catch (err) {
      writeError({
        code: "BAD_FLAG",
        message: `--payload must be valid JSON: ${err.message}`
      });
      return EXIT_ARG;
    }
    if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
      writeError({
        code: "BAD_FLAG",
        message: "--payload must be a JSON object"
      });
      return EXIT_ARG;
    }
    candidate = { kind, ...payload };
  } else {
    writeError({
      code: "BAD_FLAG",
      message: "post-event requires --event <json> OR (--kind K --payload <json>)"
    });
    return EXIT_ARG;
  }
  const validated = BridgeEventSchema.safeParse(candidate);
  if (!validated.success) {
    writeError({
      code: "BAD_EVENT",
      message: "event failed schema validation",
      detail: validated.error.issues
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
      message: err.message
    });
    return EXIT_IO;
  }
  try {
    const result = await postEvent({
      bridgeUrl: bridge.bridgeUrl,
      token: bridge.token,
      event: validated.data
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
      message: err.message
    });
    return EXIT_HTTP;
  }
}
export {
  BridgeRequestError,
  pollOnce,
  postEvent,
  routeEvent,
  runPollOnce,
  runPostEvent
};
//# sourceMappingURL=poll-loop.js.map