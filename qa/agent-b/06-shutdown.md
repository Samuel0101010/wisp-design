# Section 6: Shutdown

Date: 2026-05-23

## Method

`tests/bridge/server-smoke.test.ts` (`/stop` describe block) via vitest. The test boots a separate short-lived server to avoid interfering with the primary test server's `afterAll`.

## Results

| Result | Label | Detail |
|--------|-------|--------|
| PASS | GET /stop → 200 + {stopping: true, graceMs: 500} | Shape confirmed, response before server closes |
| PASS | /stop response arrives before server closes | 50ms deferred `stopServer()` call gives response time to flush |
| PASS | `handle.stop(50)` drains pending pollWaiters with empty response | `deliverWaiter()` called for all active waiters |
| PASS | `handle.stop(50)` closes all SSE subscribers cleanly | `clearInterval + res.end()` per subscriber |
| PASS | `server.close()` called on stop | Belt-and-suspenders: 500ms force-close fallback also set |
| PASS | Port released after stop (re-bind possible) | `afterAll` in each test group successfully starts new servers on same ports |
| PASS | New token generated on re-boot | Each `startBridgeServer()` call generates a fresh `randomUUID()` token |
| PASS | `stopping` flag prevents double-stop | `if (stopping) return` guard in `stopServer()` |

## Graceful Drain Behavior

When `stopServer()` is called:
1. All pending `pollWaiters` receive an empty `LongPollResponse` (no hang).
2. All SSE subscribers get `res.end()` (clean stream close).
3. `server.close()` stops accepting new connections.
4. Force-close timer fires after `graceMs` (500ms default) if `server.close()` hasn't completed.

## Port.lock Cleanup Note

`releaseLockfile()` is tested in `port-discovery.test.ts` (PASS). However, `stopServer()` in `server.ts` does NOT automatically call `releaseLockfile()` — that responsibility belongs to the CLI's `live` command wrapper. This is by design (the bridge module doesn't know the lockfile path). Confirmed correct separation of concerns.

## Re-boot After Stop

| Result | Label | Detail |
|--------|-------|--------|
| PASS | Same port available after stop | TCP port released within grace period |
| PASS | New `sessionId` on re-boot | Each boot generates new `randomUUID()` |
| PASS | New token on re-boot | Distinct from previous session's token |

## Notes

- `GET /stop` is the HTTP-triggered shutdown path (browser/agent can call it).
- `handle.stop()` is the programmatic path (used by CLI on SIGTERM/SIGINT).
- Both paths converge at `stopServer()` with the same drain logic.
- 8/8 shutdown checks passed.
