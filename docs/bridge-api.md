# Bridge API — wisp-design Phase 1

Local HTTP+SSE bridge between the dev-page browser runtime (`live.js`), the
bridge server (Plain Node `http`), and the agent (long-poll loop).

- **Transport:** plain HTTP, no WebSocket. SSE for server→browser push;
  long-poll for server→agent pull.
- **Port:** auto-discovered in range `31337..31400`. Lockfile at
  `.wisp/live/port.lock` (see `PortLockSchema` in `src/contracts/bridge.ts`).
- **Auth:** every authenticated endpoint requires `?token=<uuid>` query param.
  Token is a UUIDv4 generated on `wisp-design live` boot. Constant-time compare.
- **Error envelope:** every non-2xx response is `BridgeHttpError` —
  `{ error: { code, message, detail? } }`.
- **Source of truth:** `src/contracts/bridge.ts`. If a shape disagrees with
  this doc, the contract wins.

## Endpoint Summary

| Method | Path | Query | Body | 200 Response | Errors | Auth |
|--------|------|-------|------|--------------|--------|------|
| GET    | `/health` | — | — | `BridgeHealth` | 500 internal | none |
| GET    | `/status` | `token` | — | `BridgeStatus` | 401 UNAUTHORIZED | yes |
| GET    | `/live.js` | — | — | JS bundle (`text/javascript`) | 500 internal | none |
| GET    | `/design-system.json` | `token` | — | tokens JSON (`application/json`) | 401, 404 NOT_FOUND | yes |
| GET    | `/source` | `token`, `path` | — | file body (`text/plain`) | 401, 403 PATH_TRAVERSAL, 404 | yes + traversal-guard |
| GET    | `/events` | `token` | — | SSE stream of `BridgeEvent` | 401 | yes (SSE) |
| POST   | `/events` | `token` | `BridgeEvent` (JSON) | `{accepted: true, cursor}` | 401, 400 BAD_BODY | yes |
| GET    | `/poll` | `token`, `timeout?`, `leaseMs?`, `cursor?` | — | `LongPollResponse` | 401, 400 BAD_TIMEOUT | yes |
| POST   | `/poll` | — | `LongPollRequest` (JSON) | `LongPollResponse` | 401, 400 BAD_TIMEOUT | yes |
| POST   | `/annotation` | `token` | annotation `BridgeEvent` | `{accepted: true, cursor}` | 401, 400 BAD_BODY | yes |
| GET    | `/stop` | `token` | — | `{stopping: true, graceMs}` | 401 | yes |

## Endpoints

### `GET /health`

Unauthenticated liveness probe. Returns `{ ok: true, version }`.

- **Purpose:** lets `wisp-design doctor` + `live.js` confirm the bridge is up
  before doing anything that requires the token.
- **Hot-path:** cold path. Cheap, no I/O beyond reading `package.json` version.
- **Notes:** intentionally token-free so the dev page can reach it from any
  origin during boot without leaking the token in console errors.
- **Caveats:** must NEVER expose project paths or session IDs here — anonymous.

### `GET /status?token=...`

Authenticated session snapshot. Returns `BridgeStatus`:
`{ port, startedAt, uptimeMs, sessionId, pendingEvents, connectedSseClients, projectRoot }`.

- **Purpose:** drives `wisp-design status` CLI + the floating-bar's "agent
  online" indicator.
- **Hot-path:** cold path; polled at ~5s in CLI, on-demand from browser.
- **Notes:** `pendingEvents` reflects what the next `/poll` would return —
  useful for UI debugging.
- **Caveats:** must not include the token in the response body. Token-in,
  status-out only.

### `GET /live.js`

Serves the IIFE-bundled browser runtime. Phase 2 implements the actual JS;
Phase 1 stubs this endpoint and returns a no-op script so injection round-trip
can be tested end-to-end.

- **Purpose:** the `<script src="http://localhost:PORT/live.js">` tag patched
  into the project's HTML/template entry loads this.
- **Hot-path:** cold path. Cached aggressively (`Cache-Control: no-store`
  during dev — HMR-friendly). Sent as `text/javascript; charset=utf-8`.
- **Notes:** intentionally token-free so the script tag works without
  query-string mangling in the dev HTML. The token is delivered inside the
  bundle as a build-time `__WISP_TOKEN__` placeholder substituted on each
  request — never trust the bundle for auth, every subsequent endpoint
  re-checks the token.
- **Caveats:** CSP-bypass is the responsibility of `bridge/csp.ts` (Phase 1).
  This endpoint should always respond with permissive CORS for `localhost:*`.

### `GET /design-system.json?token=...`

Returns the project's `.wisp/design-tokens.json` so the browser runtime can
ground variant-rendering parameters (colors, spacing scale, radii) in the
project's existing design system.

- **Purpose:** the floating bar's slider defaults pull from this. Phase 4's
  `wisp-design tokens extract` writes this file.
- **Hot-path:** cold path; fetched once per session on first `pick` event.
- **Notes:** if the file is missing the bridge returns `404 NOT_FOUND` with
  `error.code = "TOKENS_MISSING"`. live.js falls back to defaults.
- **Caveats:** must not stream arbitrary files — only the canonical path
  `.wisp/design-tokens.json` resolved against `projectRoot`.

### `GET /source?token=...&path=...`

Streams a project source file's contents. Used by `live.js` for in-bar source
context preview and by the agent's `inject.ts` (Phase 3) for byte-equivalence
checks before write.

- **Purpose:** read-only access to project source so the browser bar can show
  "this variant edits `pages/index.tsx:42-68`" without re-fetching via fetch
  from the user's dev server (which would 404 on non-public paths).
- **Hot-path:** warm path on accept; not on every keystroke.
- **Notes:** `path` is relative to `projectRoot`. `guardPath` MUST reject any
  resolution outside `projectRoot`, any symlink that exits the root, and any
  absolute paths. Returns `403 PATH_TRAVERSAL` on violation, not `404`, so
  the client can distinguish "missing" from "blocked".
- **Caveats:** never serve files matching `**/.git/**`, `**/.env*`, or
  `**/node_modules/**`. Hard-deny list, not a regex on `path`.

### `GET /events?token=...`

Server-Sent Events stream. Each `data:` line is one `BridgeEvent` JSON.
Heartbeats (`{kind:"heartbeat", at}`) are sent every 15 seconds to keep
corporate proxies from closing idle connections.

- **Purpose:** server → browser push channel for variant arrival, "generating"
  progress, agent-error toasts.
- **Hot-path:** persistent connection for the lifetime of the dev page tab.
- **Notes:** the bridge maintains one SSE subscriber per browser tab. If
  the same `sessionId` reconnects, the previous stream is closed (last-write
  wins) so HMR-driven reloads don't accumulate ghost subscribers.
- **Caveats:** SSE response MUST include `Connection: keep-alive`,
  `Content-Type: text/event-stream`, and `X-Accel-Buffering: no`.

### `POST /events?token=...`

Browser → bridge event push. Body is a `BridgeEvent` (JSON). Bridge validates
with `BridgeEventSchema`, assigns a monotonic cursor, enqueues for the next
`/poll`, fans out to other SSE subscribers in the same `sessionId` (Phase 6
multi-cursor), and returns `{ accepted: true, cursor }`.

- **Purpose:** the floating bar's "Go", "Accept", "Discard", "parameter-change"
  actions all funnel here.
- **Hot-path:** hot path. Must complete in <50ms p95 (no LLM, no fs I/O
  beyond cursor allocation + queue append).
- **Notes:** validation errors return `400 BAD_BODY` with the zod issue path
  in `detail`. Unknown `kind` values fail validation — there is no escape
  hatch for forward-compatibility on purpose (the contract is the contract).
- **Caveats:** an `accept` event must NOT trigger the source-edit here; the
  bridge only enqueues. The agent's poll loop pulls the event and runs the
  actual fs.writeFileSync. Keeps the bridge stateless and the agent in
  control of all writes.

### `GET /poll?token=...&timeout=...&leaseMs=...&cursor=...`

Long-poll endpoint for the agent. Blocks until at least one event is
available or `timeout` elapses, then returns `LongPollResponse`.

- **Purpose:** agent ← bridge pull channel. Drives the entire variant loop.
- **Hot-path:** the agent holds one long-poll open at all times. `timeout`
  defaults to `LONG_POLL_DEFAULT_LEASE_MS` (30s) and is capped at
  `LONG_POLL_CAP_MS` (270s, NOT 300s — Node fetch caps headers timeout at
  300s; staying under that lets retries succeed cleanly).
- **Notes:** `cursor` is a resume token from the previous response. If
  omitted, the agent receives only events that arrive after this call lands.
  When the server slices a long poll without events it returns
  `{ events: [], cursor, slicedAt }` so the agent can re-issue immediately.
- **Caveats:** if `timeout > LONG_POLL_CAP_MS` the bridge returns
  `400 BAD_TIMEOUT` rather than silently clamping — agents must know they
  asked for too much.

### `POST /poll`

JSON-body variant of `GET /poll`. Same `LongPollRequest` / `LongPollResponse`
shapes; included so the agent loop can post `cursor`-heavy requests without
URL-length concerns.

- **Purpose:** identical to `GET /poll`; pick whichever the harness handles
  best (Claude Code background tasks tolerate both).
- **Hot-path:** same as `GET /poll`.
- **Notes:** body is parsed with `LongPollRequestSchema`. Empty bodies are
  treated as `{ token: <header>, timeout: default }` only if the token
  appears in `Authorization: Bearer ...` — query-string-only POSTs are
  rejected with `400 BAD_BODY`.
- **Caveats:** rate-limit per `sessionId` to ≤2 open polls at any time so a
  misbehaving agent doesn't fork a leaking poll-storm.

### `POST /annotation?token=...`

Browser → bridge for structured annotations (`{target, annotation: {kind, note}}`).
Equivalent to `POST /events` with `kind:"annotation"` but kept as its own
endpoint so future versions can attach larger payloads (e.g. optional
PNG-overlay) without changing the event JSON shape.

- **Purpose:** the user circles/labels something on the page; this carries the
  structured signal to the agent.
- **Hot-path:** warm. One annotation per gesture, not per mouse-move.
- **Notes:** body must validate as `BridgeEventOf<"annotation">`. The bridge
  is intentionally strict here — no free-form note metadata beyond `kind`
  and `note`, because the agent's prompt template only knows those keys.
- **Caveats:** never accept HTML in `note`. Plain text only; the agent strips
  control chars before persisting to the session log.

### `GET /stop?token=...`

Graceful shutdown. Returns `{ stopping: true, graceMs }` immediately, then
the bridge closes SSE connections, drains pending polls with empty responses,
removes `.wisp/live/port.lock`, and exits after `graceMs` (default 500ms).

- **Purpose:** the CLI uses this for `wisp-design live --stop`; the browser
  runtime uses it on `beforeunload` only if the user explicitly disables the
  live session.
- **Hot-path:** cold. Token-gated so a stray fetch on `/stop` from any other
  origin can't kill a running session.
- **Notes:** returns before exiting so the caller can confirm graceful close.
  The PID in `port.lock` is the source-of-truth for "did it actually exit".
- **Caveats:** must NOT call `process.exit` synchronously inside the request
  handler — flush the response, then `setTimeout(exit, graceMs)`.

## Cursor / Sequencing

- Every successful event ingest (`POST /events`, `POST /annotation`)
  allocates a monotonically increasing cursor (string, `seq-<n>-<sessionId>`).
- `LongPollResponse.cursor` echoes the highest cursor that was included.
- An agent can resume after restart by passing `cursor` to the next `/poll` —
  the bridge replays events from the queue that are newer than `cursor`
  while they remain buffered. Buffer eviction is sessionId-scoped and capped
  at 1024 events; older events are dropped (and a one-shot
  `kind:"error", code:"REPLAY_TRUNCATED"` is emitted on the next poll).

## Path Traversal Rules (GET /source)

Implementations of `AuthModule.guardPath` MUST:

1. Reject paths containing `..` segments after normalization.
2. Reject absolute paths (`/...`, `C:\...`).
3. Reject paths that, after `realpathSync`, are not prefixed by `realpathSync(projectRoot)`.
4. Reject any path matching the hard-deny globs (`**/.git/**`, `**/.env*`,
   `**/node_modules/**`).
5. Return `{ ok:false, error:{ code:"PATH_TRAVERSAL", message, detail:{ requested } } }`
   on any violation.

## Security Boundaries

`security` (the named agent) owns implementation of the following in
`src/bridge/auth.ts`:

- `generateToken(): string` — UUIDv4.
- `validateToken(provided, expected): { ok } | { ok:false, error:AuthError }` —
  constant-time compare; treats `undefined`/non-string `provided` as
  `UNAUTHORIZED`.
- `guardPath(requestedPath, projectRoot): { ok, resolved } | { ok:false, error:AuthError }` —
  rules above.

The bridge server (coder) wires these as middleware. No endpoint may bypass
either function. Tests (tester) cover: missing token, wrong token, malformed
token, `..` traversal, absolute path, symlink-out-of-root, hard-deny glob.
