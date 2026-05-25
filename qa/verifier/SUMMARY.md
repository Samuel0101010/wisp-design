# wisp-design Phase 6.5 / Phase 7 Launch Readiness — Verifier Report

**Date:** 2026-05-23  **Node:** 22.16.0 (Windows 11)

## Round 0 — Baseline

| Check | Result |
|---|---|
| `npx tsc --noEmit` | PASS — zero errors |
| `npx vitest run` | PASS — 712/712 green (694 prior + 18 new) |
| `npm run build` | PASS — 71ms |
| `node dist/index.js doctor` | PASS — 14/14 OK |

## Per-Blocker Results

| # | Title | Verdict | Evidence |
|---|---|---|---|
| 1 | `live` functional | PASS | Boots bridge, `/health` ok, port.lock written |
| 2 | `init` functional | PASS | Creates brand-spec.json + policy.md; idempotent |
| 3 | `tokens extract` stub | DEFERRED v1.1 | — |
| 4 | `verify-spec` stub | DEFERRED v1.1 | — |
| 5 | `history --replay` stub | DEFERRED v1.1 | — |
| 6 | Linter Tailwind-blind | PASS | AiHero → 7 hits, 4 unique rules; PricingCard → 0 |
| 7 | `audit` default=stop-hook | PARTIAL | `--mode full` runs all 6 checks; default stop-hook intentional |
| 8 | a11y silent-pass on error | PASS | Reports violations with non-empty messages |
| 9 | multi-viewport silent-pass | PARTIAL | Returns severity:warn+skipped; reason code is "error" not "optional-dep-missing" |
| 10 | tab-order empty messages | PASS | All violations have descriptive messages with selector |
| 11 | lockfile not cleaned on stop | FAIL | /stop endpoint + SIGTERM on Windows both leave port.lock |
| 12 | Stop-hook ETIMEDOUT Windows | PASS | 160ms git budget, no timeouts in 20 runs |
| 13 | Stop-hook p99 budget | PASS (relaxed) | p99=113ms < 200ms Windows budget |
| 14 | a11y-axe HTML timeout | PASS | 860-991ms < 1500ms budget |
| 15 | Node 22 navigator-setter | PASS | Object.defineProperty fix; catches button-name + image-alt |
| 16 | Component-detect threshold | PARTIAL | radix 0.70✓, shadcn→radix 0.70✓, antd 0.50✓, mui/chakra/tailwind → vanilla 0.43✗ |

## Stop-Hook p99 (Windows, n=20)

p50=110ms, p90=112ms, **p99=113ms** — within 200ms relaxed budget.

## a11y-axe Coverage (jsdom mode)

| Rule | Caught in jsdom | Notes |
|---|---|---|
| button-name | YES | Critical A — structural |
| image-alt | YES | Critical A — structural |
| color-contrast | NO | Requires headless chromium (computed styles) |
| document-title / html-has-lang | FP on TSX fragments | Expected — real pages won't trigger |

## New Bugs Found (not in original 16)

| N-# | Severity | Description |
|---|---|---|
| N-17 | Medium | Stop-hook scans `git diff HEAD` (unstaged); staged-only files (`git add`) are not scanned. Pre-commit CI gap; normal edit workflow unaffected. |
| N-18 | Low | multi-viewport skipped `reason:"error"` instead of `"optional-dep-missing"` when livePreviewUrl absent |
| N-19 | Low | No hint in audit output that `--mode full` is needed for a11y checks |

## Final Test Count

712 / 712 green (45 test files). Integration test file: `tests/integration/phase-6.5-launch-readiness.test.ts` (18 tests).

## VERDICT: NO-GO for v1.0.0

### Remaining blockers (2)

1. **Bug #11 — lockfile cleanup** (medium, ~1h fix): `handleStop()` in `server.ts` closes the HTTP server but never calls `releaseLockfile`. The `live.ts` shutdown path has the fix but only fires on SIGINT/SIGTERM, not on the `/stop` HTTP endpoint. Fix: add `onStop?: () => Promise<void>` callback to `startBridgeServer` options; `live.ts` registers `safeReleaseLock` there.

2. **Bug #16 — component-detect 3/6 fail** (medium, ~2h fix): mui/chakra/antd score 0.43 from `devDependencies`-only fixtures (tailwind) or shallow imports. Fix: include `devDependencies` in package-json scan; recalibrate cap-then-average formula.

### Path to GO

Fix #11 + either fix #16 or formally defer with README note. Then re-run `npx vitest run` + `node dist/index.js doctor` — both must stay green. Estimated: 3–4h to v1.0.0 GO.
