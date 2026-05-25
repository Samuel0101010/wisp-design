# Section 2: Auth Token Enforcement

Date: 2026-05-23

## Method

`tests/bridge/auth.test.ts` + `tests/bridge/server-smoke.test.ts` via vitest.
The auth module uses `timingSafeEqual` for constant-time comparison; UUID shape validated with regex before the crypto comparison.

## Auth-Gating Matrix

| Endpoint | No Token | Wrong Token | Correct Token |
|----------|----------|-------------|---------------|
| GET /status | 401 UNAUTHORIZED | 401 UNAUTHORIZED | 200 PASS |
| GET /design-system.json | 401 UNAUTHORIZED | 401 UNAUTHORIZED | 200 (or 404 if no tokens file) |
| GET /source | 401 UNAUTHORIZED | 401 UNAUTHORIZED | 200 (or 400/404 per path) |
| GET /events (SSE) | 401 UNAUTHORIZED | 401 UNAUTHORIZED | 200 text/event-stream |
| GET /poll | 401 UNAUTHORIZED | 401 UNAUTHORIZED | 200 LongPollResponse |
| POST /events | 401 UNAUTHORIZED | 401 UNAUTHORIZED | 200 {accepted:true, cursor} |
| POST /annotation | 401 UNAUTHORIZED | 401 UNAUTHORIZED | 200 {accepted:true, cursor} |
| GET /stop | 401 UNAUTHORIZED | 401 UNAUTHORIZED | 200 {stopping:true} |

## Public Endpoints (No Auth Required)

| Endpoint | Status | Content-Type |
|----------|--------|--------------|
| GET /health | 200 | application/json |
| GET /live.js | 200 | application/javascript |

## Token Validation Cases

| Result | Label | Detail |
|--------|-------|--------|
| PASS | undefined → UNAUTHORIZED | "missing token" |
| PASS | null → UNAUTHORIZED | null cast handled defensively |
| PASS | empty string → UNAUTHORIZED | "" handled before UUID check |
| PASS | non-UUID format → MALFORMED_TOKEN | "not-a-uuid" → code=MALFORMED_TOKEN |
| PASS | correct UUID shape, wrong value → UNAUTHORIZED | timingSafeEqual fails, no timing leak |
| PASS | exact match → ok | validateToken(t, t) = {ok:true} |
| PASS | uppercase UUID match → ok | UUID_RE has i flag |
| PASS | real generateToken validates against itself | generateToken() loop verified |

## Notes

- Auth error envelope shape: `{error: {code, message, detail?}}` — consistent across all endpoints.
- HTTP status mapping: UNAUTHORIZED/MALFORMED_TOKEN → 401; FORBIDDEN/PATH_TRAVERSAL → 403.
- Token is passed via `?token=UUID` query param OR `Authorization: Bearer UUID` header (both supported via `extractBearer()`).
- 17/17 auth checks passed.
