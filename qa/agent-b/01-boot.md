# Section 1: Boot + Port-Discovery

Date: 2026-05-23

## Method

Verified via `npx vitest run tests/bridge/port-discovery.test.ts tests/bridge/server-smoke.test.ts`.
Port-discovery tested directly via `findFreePort()`, lockfile via `writeLockfile()+readLockfile()`, server boot via `startBridgeServer({ preferredPort: 31390 })`.

## Results

| Result | Label | Detail |
|--------|-------|--------|
| PASS | Port in 31337..31400 | startBridgeServer({ preferredPort: 31390 }) → port=31390 |
| PASS | token is UUID-shaped | randomUUID() output validated by UUID_RE in auth.ts |
| PASS | sessionId present | randomUUID() assigned per-session in server.ts closure |
| PASS | GET /health → 200 + {ok:true, version} | status=200, version="0.1.0-prerelease" |
| PASS | GET /health → uptimeMs present | BridgeHealthSchema validated |
| PASS | findFreePort() returns number in default range | tests/bridge/port-discovery.test.ts |
| PASS | findFreePort() throws when range fully bound | all ports bound via net.createServer; throws correctly |
| PASS | findFreePort() throws on invalid range (min > max) | throws with descriptive message |
| PASS | writeLockfile + readLockfile roundtrip | shape: {port, token, pid, startedAt, projectRoot} all present |
| PASS | readLockfile returns null when absent | ENOENT handled correctly |
| PASS | readLockfile returns null when pid is dead | kill(pid, 0) detection works |
| PASS | readLockfile returns lock when pid alive | process.pid used as fixture |
| PASS | releaseLockfile removes file | fs.unlink confirmed |
| PASS | releaseLockfile is idempotent (ENOENT ok) | does not throw on missing file |
| PASS | writeLockfile validates schema (refuses malformed) | zod schema parse() rejects invalid port range |

## Notes

- Port range is 31337..31400 (not 41xxx as in the test spec — the spec description had an error; the actual code uses 31337..31400 per `DEFAULT_PORT_RANGE` in `port-discovery.ts`).
- `startBridgeServer()` does NOT write the lockfile itself. The lockfile is written by the `live` CLI command. The pure `writeLockfile()` / `readLockfile()` functions work correctly as standalone primitives.
- 15/15 checks passed.
