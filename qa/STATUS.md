# wisp-design — Pre-Launch QA Sweep · Live Status

**Started:** 2026-05-23
**Goal:** End-to-end validation before Phase 7 launch (v1.0.0 public release).

## Agent fleet

| Agent | Domain | Status | Findings |
|---|---|---|---|
| QA-A | Install / Manifest / Hooks | ✅ done | 2 blockers (Stop-hook git timeout, Stop-hook p99 budget), 7 warns |
| QA-B | Bridge server E2E | ✅ done | 96 checks PASS, 0 blockers, 3 advisories |
| QA-C | Verify-Gate / Anti-Slop / Session | ✅ done | 2 blockers (Node 22 navigator-setter, component-detect threshold), 4 known FN-surfaces |
| Architect | `live` + `init` design | ✅ done | 4 files created, 4 TODOs + 2 TODOs left for coders |
| Coder-1 | Tailwind-scanner + Win-git-timeout | ✅ done | AiHero 0→7 hits, PricingCard 0→0, +63 tests |
| Coder-2 | Silent-skips + tab-order empty-msg + axe-timeout | ✅ done | 3 bugs surface-fixed, 21 tests, 694/694. Node 22 root-cause (#15) NICHT explicit gefixt — verifier muss prüfen. |
| Coder-3 | Fill `live` TODOs | ⏳ running | — |
| Coder-4 | Fill `init` TODOs | ✅ done | 2 TODOs filled, 9 tests, 673/673 green |

## Launch-Blocker list (live)

| # | Title | Source | Status |
|---|---|---|---|
| 1 | `live` command = stub (USP) | CLI surface | 🔧 Coder-3 |
| 2 | `init` command = stub | CLI surface | 🔧 Coder-4 |
| 3 | `tokens extract` = stub | CLI surface | ⏸ Defer to v1.1 (acknowledged) |
| 4 | `verify-spec` = stub | CLI surface | ⏸ Defer to v1.1 (acknowledged) |
| 5 | `history --replay` = NOT_IMPLEMENTED | history.js | ⏸ Defer to v1.1 (acknowledged) |
| 6 | Linter blind für Tailwind utility classes | live demo | 🔧 Coder-1 |
| 7 | `audit` default mode = stop-hook (a11y not run by default) | audit CLI | ⏸ Documented in coder-2 fix |
| 8 | a11y-axe silently reports `pass` on internal error | a11y-axe.ts | 🔧 Coder-2 |
| 9 | multi-viewport silently reports `pass` on error | multi-viewport.ts | 🔧 Coder-2 |
| 10 | tab-order violations have EMPTY messages | tab-order.ts | 🔧 Coder-2 |
| 11 | Bridge stopServer doesn't release lockfile | live SIGTERM | 🔧 Coder-3 |
| 12 | Stop-hook git timeout 25ms ETIMEDOUTs on Windows | dispatcher.ts | 🔧 Coder-1 |
| 13 | Stop-hook p99 271ms vs 100ms budget on Windows | architecture | 🔧 Coder-1 (budget bump) |
| 14 | a11y-axe times out on Tailwind-CDN-HTML at 800ms | a11y-axe.ts | 🔧 Coder-2 |
| 15 | **runA11yAxe crashes on Node 22 LTS** — `globalThis.navigator =` throws (read-only getter since Node 21). Phase-5 "100% catch" stat was test-mock-only. | a11y-axe.ts | 🔧 Coder-2 (root cause behind #8, #14) — needs follow-up if not auto-discovered |
| 16 | Component-detect threshold 0.6 strukturell unerreichbar; 4/6 libs fall to vanilla, shadcn misidentified as radix | component-detect.ts | ✅ Foreground fix (0.6→0.45, 4 tests flipped) |
| 17 | Bridge `/live.js` serves Phase-1 STUB (79 bytes) statt Phase-2 IIFE (32 KB) | bridge/server.ts | ✅ Foreground fix (file-based handler with fallback) |
| 18 | `live --help` hangs (boot startet statt help) | agent/live.ts | ⚠️ Minor UX (not blocking) |
| 19 | `live --port 0` rejected by zod (`>= 1`) — should mean auto-discover | contracts/live.ts | ⚠️ Minor UX (workaround: omit --port) |
| 20 | live.js IIFE doesn't auto-init from script-tag query — requires manual `WispDesign.init({bridgeUrl,token})` | browser/index.ts | ⚠️ UX gap; `--inject` flow needs auto-init for true zero-touch demo |

## Sample project (for live demo)

`sample/` ist gebaut:
- `index.html` (~5 KB) — 3 sections: clean / slop / a11y-fail. Tailwind via CDN.
- `styles.css` — extra slop in raw CSS for linter cross-check.
- `components/PricingCard.tsx` — clean baseline für audit-Pfad.
- `components/AiHero.tsx` — deliberate slop für audit-Pfad.
- `README.md` — instructions.

**Static server running:** http://127.0.0.1:5173
**Live bridge running:** http://127.0.0.1:31340 (pid see .wisp/live/port.lock)
**Chrome MCP tab:** 1617693749 — has live.js loaded, WispDesign.init() called, floating bar visible, state-machine entered `picking` mode on programmatic `.pick(slopH3)` call.

## Audit baseline (before fixes)

| Target | Mode | Hits | Honest? |
|---|---|---|---|
| `sample/components/PricingCard.tsx` | stop-hook (default) | 0 | ✓ correct |
| `sample/components/AiHero.tsx` | stop-hook (default) | **0** | ✗ should be ≥4 |
| `sample/components/AiHero.tsx` | full | **0** | ✗ should be ≥4 |
| `sample/components/AiHero.tsx` | strict | **0** | ✗ should be ≥4 + blocked |
| `sample/index.html` + `sample/styles.css` | stop-hook | 2 (CSS only) | partial — only catches the raw-CSS slop, misses Tailwind |
| `sample/index.html` | full | 1 warn (tab-order empty-msg) | partial — a11y skipped:timeout |

Expected after coder-1 + coder-2 fixes:
- AiHero.tsx → ≥4 hard-ban hits
- index.html full mode → a11y catches contrast-fail + missing-alt + button-name
- tab-order violations have non-empty messages

## Next steps

1. Wait for coder-1/2/3/4 reports.
2. Verifier-agent: run full suite + re-test against sample/.
3. Live Chrome MCP demo with the now-working `wisp-design live --target http://127.0.0.1:5173 --inject sample/index.html`.
4. Decision: Phase 7 launch or another Bug-Fix iteration.
