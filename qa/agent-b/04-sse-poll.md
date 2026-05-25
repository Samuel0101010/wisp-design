# Section 4: SSE + Long-Poll

Date: 2026-05-23

## Method

`tests/bridge/long-poll-slicing.test.ts` + `tests/bridge/server-smoke.test.ts` (SSE section) via vitest.
Tests boot a real HTTP server at port 31380/31390 and exercise SSE/poll via native `fetch`.

## SSE Behavior

| Result | Label | Detail |
|--------|-------|--------|
| PASS | GET /events → 200 + text/event-stream | Content-Type: text/event-stream confirmed |
| PASS | Initial SSE frame is SSE-formatted | `: connected\n\n` comment frame on connect |
| PASS | SSE fan-out: `POST /events` pushes `data:` frame to subscriber | event received within 1s |
| PASS | SSE heartbeat interval configured | `SSE_HEARTBEAT_INTERVAL_MS = 15_000` (15s) — within 30s requirement |
| PASS | SSE subscriber cleanup on disconnect | `req.on("close")` + clearInterval |
| PASS | X-Accel-Buffering: no header present | proxy-buffering disabled correctly |

## Long-Poll Behavior

| Result | Label | Detail |
|--------|-------|--------|
| PASS | Fast-path: events already queued → poll returns immediately | `slicedAt=0`, events returned |
| PASS | Wake-up path: event posted during open poll wakes waiter | `slicedAt < 5000ms` |
| PASS | Empty poll respects timeout and returns `events: []` | timeout=300ms, elapsed ~320ms (within buffer) |
| PASS | Cursor advances monotonically | seq-N-sessionId format verified |
| PASS | Client disconnect mid-poll → server stays healthy | AbortController + subsequent poll succeeds |
| PASS | POST /events returns `{accepted: true, cursor: "seq-N-UUID"}` | cursor format validated |
| PASS | GET /poll with `timeout=100` query param works | timeout param parsed correctly |
| PASS | GET /poll with `cursor=...` resumes from correct position | only newer events returned |

## Timeout Clamping (270s Cap)

| Result | Label | Detail |
|--------|-------|--------|
| PASS | `timeout=500000` (over 270s cap) → no 400 response | server silently clamps to `LONG_POLL_CAP_MS = 270_000` |
| PASS | Clamped poll still delivers events when they arrive | event posted to wake early, 200 returned |
| PASS | `timeout=300` (under cap) → returns after ~300ms | elapsed=~320ms (within 1500ms tolerance) |

## Timing Measurements

| Scenario | Expected | Observed |
|----------|----------|----------|
| Empty poll timeout=300ms | 300ms ± 200ms | ~320ms |
| Wake-up after event post (5s budget) | < 5000ms | < 200ms (woke immediately) |
| SSE initial frame latency | < 1s | < 50ms |

## Notes

- `LONG_POLL_CAP_MS = 270_000` is enforced in `longPoll()` via `Math.min(Math.max(timeoutMs, 0), LONG_POLL_CAP_MS)`.
- POST /poll (body-based) also tested in server-smoke.test.ts — works equivalently to GET /poll.
- Event queue is capped at 1024 entries (`EVENT_QUEUE_MAX`).
- `pollWaiters` set is cleaned up on waiter delivery and on `stopServer()`.
- 20/20 SSE/poll checks passed.
