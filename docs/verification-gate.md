# Verification-Gate (Phase 5) — Spec

The verification-gate is wisp-design's defining USP. Every Accept signal —
whether from a Stop-hook on every Claude turn, a browser-driven click in the
floating bar, or a CLI `wisp-design audit` invocation — passes through a
multi-check pass that combines a11y, console health, anti-slop linting,
tab-order, reduced-motion respect, and (when toggled) multi-viewport
screenshot capture.

## Why this matters — the USP argument

The competitive landscape (see `research/competitive-landscape.md`):

| Tool | Live-Edit | A11y-Gate | Screenshot-Gate | Anti-Slop-Linter |
|---|---|---|---|---|
| Impeccable (29.4k★) | yes | no | no | partial (skill) |
| Stagewise (6.7k★, AGPL) | yes | no | no | no |
| Onlook (25.8k★) | yes | partial | no | no |
| Anthropic Claude Design | canvas | unknown | unknown | unknown |
| v0 / Lovable / bolt.new | sandbox | no | render-only | no |
| **wisp-design** | **yes** | **yes (AA-block in strict)** | **yes (multi-viewport)** | **yes (12 rules, 7 hard-ban)** |

No other live-edit tool gates accept on (a11y + screenshot + anti-slop)
simultaneously. UI-UX-Pro-Max stops at "generated text." Impeccable stops at
"wrote to file." Huashu has a 5-dim self-critique but no gate. Open-design
has a 5-dim gate but no source-edit loop. wisp-design connects all four.

## Mode hierarchy

Five modes, fixed in `src/contracts/verify.ts` (`MODE_CHECK_SETS`,
`MODE_BLOCKS_ON_FAIL`, `MODE_TIMING_BUDGET_MS`):

| Mode | Trigger | Checks | Budget | Blocks on fail? |
|---|---|---|---|---|
| `stop-hook` | every Claude turn | anti-slop | 100ms (p99 hard limit) | no (warn-only)¹ |
| `live-accept` | bridge `accept` event → before fs.writeFileSync | anti-slop, a11y-axe, console-scan, tab-order, reduced-motion | 3000ms (p95) | no (warn-only) |
| `live-with-screenshot` | same + user toggled "screenshot" in floating-bar | + multi-viewport | 6000ms (p95) | no (warn-only) |
| `audit` | `wisp-design audit --mode full` | all 6 | 30000ms | no (warn-only) |
| `audit-strict` | `wisp-design audit --mode strict` | all 6 | 30000ms | **YES — hard-block on hard-ban / AA-fail** |

¹ — exception: `WISP_DESIGN_STRICT=1` env-var promotes stop-hook to hard-block
on hard-ban hits. Off by default.

**Design rationale.** Lead-confirmed (research/synthesis.md Open Decision #7):
warn-default in v0.x, hard-block opt-in via `--strict`. Conservative until
real-world false-positive rate is known. v1.x revisits this.

## Gate orchestrator — algorithm

```
function run(ctx: VerifyContext): VerifyReport
  mode      = ctx.mode
  checks    = MODE_CHECK_SETS[mode]
  budget    = MODE_TIMING_BUDGET_MS[mode]
  started   = Date.now()

  promises = checks.map(c =>
    runWithTimeout(
      runCheck(c, ctx),
      CHECK_BUDGET_MS[c]
    ).catch(err => skipResult(c, "error", err.message))
  )

  results = await Promise.allSettled(promises)
  resolved = results.map(r =>
    r.status === "fulfilled" ? r.value : skipResult(?, "error", r.reason)
  )

  totalMs  = Date.now() - started
  verdict  = worstSeverity(resolved)
  counts   = aggregateCounts(resolved)

  return {
    verdict,
    mode,
    checks: resolved,
    timing: { totalMs, budgetMs: budget, budgetExceeded: totalMs > budget },
    ...counts,
    blocked: verdict === "fail" && MODE_BLOCKS_ON_FAIL[mode]
  }
```

Key properties:

- **Parallel** — `Promise.allSettled` runs every check concurrently. The mode
  budget is wall-clock, not the sum of per-check budgets.
- **Resilient** — any check that throws is encoded as `{ skipped: { reason:
  "error" } }` with `severity: "pass"`. One broken check does not poison the
  verdict.
- **Time-capped** — each check has its own ceiling (`CHECK_BUDGET_MS`); the
  orchestrator times out and emits `{ skipped: { reason: "timeout" } }` when
  exceeded.
- **Idempotent** — running the gate twice on the same `VerifyContext`
  produces the same `verdict`. No side effects until accept is committed.

## Per-check spec

### anti-slop-linter

`src/verify/anti-slop-linter.ts`. The 7 hard-bans + 5 soft suggestions
from `skills/policy/anti-slop.md`. Pure regex / pattern matching against
CSS + (optionally) DOM. Pre-compiled at module-load time — the Stop-hook
hot path does ZERO disk I/O after the first import.

- **Input**: CSS string, optional rendered HTML for selector-based rules
  (em-dash-ui needs to know element types).
- **Output**: `AntiSlopViolation[]` — one per rule hit. `severity` derived
  from `HARD_BAN_RULES` (7 entries → fail; rest → warn).
- **Rules emitted**:
  - `em-dash-ui` — `—` in `<button>`/`<h1-6>`/`<label>`/microcopy
  - `gradient-text-headline` — `background-clip: text` on button/link/nav
  - `default-glassmorphism` — `backdrop-filter: blur(...)` with no rationale
  - `hero-metric-template` — three siblings each with big-number + small-label
  - `side-stripe-decoration` — `border-left: Npx solid <colour>` decorative
  - `purple-blue-gradient` — gradient between hue ~280-320 and ~230-260
  - `generic-ai-illustration` — declared in `freeText`, no source asset
  - Soft: `too-perfect-alignment`, `round-number-whitespace`,
    `default-tailwind-blue`, `single-weight-typography`,
    `all-rounded-corners`
- **Budget**: 50ms per invocation. Stop-hook budgets typical 5 files × 5ms.
- **False-positive guard**: < 5% on a 100-component fixture
  (`ANTI_SLOP_FALSE_POSITIVE_RATE_MAX`). Enforced by
  `tests/verify/anti-slop-fp-rate.test.ts` (tester writes).

### a11y-axe

`src/verify/a11y-axe.ts`. Runs axe-core (regular dependency, ~250KB) against
the rendered HTML. Two paths:

1. **Live-mode**: hits `ctx.livePreviewUrl` via a headless probe and runs
   `axe.run()` in-page (jsdom fallback when Playwright is absent).
2. **Audit-mode**: jsdom-renders the file's exported component (best-effort,
   skips if the file is not a self-contained renderable unit).

- **Severity mapping**: AA + serious|critical → `fail`. AA + minor|moderate
  → `warn`. AAA → always `warn` (v0.x does not block on AAA). Per
  axe-core convention `impact` and `tags` are the inputs.
- **Budget**: 800ms. axe-core's `frameWaitTime: 0` and a single-shot
  `disableOtherRules: true` for known-noisy rules.
- **Output**: `A11yViolation[]`.

### console-scan

`src/verify/console-scan.ts`. Walks the session log + browser-reported
`console.error/.warn` since the wrap timestamp.

- **Pattern**: case-insensitive `error|warn|fail|exception`. Customisable
  per project via `.wisp/policy.md` (Phase 6).
- **Window**: from wrap → now (or last N seconds for stop-hook diff path).
- **Quiesce**: 1.5s after the last HMR fire to allow framework warnings to
  flush before the scan starts.
- **Budget**: 2000ms — includes the HMR-quiesce wait.
- **Output**: `ConsoleScanResult[]`. Empty list = pass.

### tab-order

`src/verify/tab-order.ts`. Three sub-checks; severity = worst of the three:

1. **focus-trap-leak** — opens any `[role="dialog"]` / `[role="modal"]`,
   tabs through, asserts focus stays within. Synthetic Tab events via
   `KeyboardEvent`.
2. **missing-focus-ring** — every `button`, `a`, `input`, `select`,
   `textarea`, `[tabindex="0"]` must have a `:focus-visible` style that
   differs from the resting style. Computed-style probe.
3. **nonzero-tabindex** — any element with `tabindex > 0` (forces non-DOM
   order — accessibility anti-pattern).

- **Severity**: `focus-trap-leak` → `fail` (always serious). Others →
  `warn` by default.
- **Budget**: 300ms.

### reduced-motion

`src/verify/reduced-motion.ts`. Renders the page twice — once with
`prefers-reduced-motion: no-preference`, once with `: reduce` — and compares
the computed-style diff for elements with `transition`, `animation`, or
`transform`.

- **Optional dep**: `pixelmatch` for image-diff fallback. When absent,
  falls back to computed-style comparison (no PNG generation).
- **Threshold**: per-element pixel-diff area > 50 = violation. Tunable per
  project via `.wisp/policy.md`.
- **Severity**: always `warn` (motion-respect is best-practice, not WCAG-A).
- **Budget**: 600ms.
- **Graceful skip**: when `pixelmatch` is missing and computed-style probe
  can't run, emit `{ skipped: { reason: "optional-dep-missing" } }`.

### multi-viewport

`src/verify/multi-viewport.ts`. Captures 4 widths × 2 modes = 8 PNGs:

- Widths: 375 (mobile), 768 (tablet), 1280 (desktop), 1920 (wide). From
  `DEFAULT_VIEWPORTS`.
- Modes: light, dark. From `DEFAULT_COLOR_SCHEMES`.
- Output path:
  `.wisp/sessions/<sessionId>/screenshots/<variantId>/<label>.<mode>.png`.
- **Optional dep**: `playwright`. When `node_modules/playwright/` is
  absent, the check emits `{ skipped: { reason: "optional-dep-missing" } }`
  and the orchestrator includes it as a `pass` with `severity: "pass"`,
  `screenshots: []`. The verdict is unaffected.
- **Launch flags**: chromium sandbox ON (no `--no-sandbox`),
  `--disable-extensions`, `--no-default-browser-check`. URL whitelist
  restricted to `localhost` (enforced by `src/verify/_sandbox.ts`, owned
  by the security agent).
- **Budget**: 3500ms — chromium boot dominates first run; subsequent runs
  amortise.

## Stop-Hook integration (p99 < 100ms)

The Stop-hook fires on every Claude turn — it must be fast or the entire
loop slows down. Wiring lives in `src/hooks/dispatcher.ts`:

```
on "stop":
  start = Date.now()
  payload = await drainStdin()
  changedFiles = read `git diff HEAD --name-only` (capped at 50 files)
  cssToCheck = extract-CSS-relevant-lines(changedFiles)
  if cssToCheck.size === 0: exit 0
  if Date.now() - start > STOP_HOOK_HARD_LIMIT_MS - 50: exit 0   // pre-flight gate
  result = await runAntiSlop(cssToCheck, ctx)
  if result.severity === "fail":
    if process.env.WISP_DESIGN_STRICT === "1":
      stdout.write(JSON.stringify({
        decision: "block",                        // Stop-hook contract — NOT permissionDecision (that is PreToolUse and Stop ignores it)
        reason: "wisp-design anti-slop: <rule citation + fix>"
      }))
    else:
      stderr.write("wisp-design anti-slop: <warning>\n")
  exit 0
```

Key properties:

- **Hard 100ms budget**: `STOP_HOOK_HARD_LIMIT_MS`. The dispatcher
  checkpoints `Date.now()` after stdin drain and aborts the linter run if
  approaching the limit.
- **Non-blocking by default**: warns to stderr; exits 0. Only
  `WISP_DESIGN_STRICT=1` env-var promotes to hard-block.
- **No file I/O on the hot path**: rule regexes pre-compiled at module
  load. `git diff` uses `node:child_process` with safe args (no shell
  expansion).
- **Cached imports**: dynamic import of the linter happens once per
  process; subsequent turns hit the module cache.

## Live-Mode integration

The bridge `accept-request` event flows through:

```
browser  → POST /events { kind: "accept", variantId, ... }
bridge   → enqueue event
agent    → poll-once picks up event
agent    → call gate.run(VerifyContext { mode, beforeContent, afterContent, ... })
agent    → if blocked:
           → POST /events { kind: "error", message: "<rule citation>" }
           → floating-bar renders confirmation
         → else (warn or pass):
           → call acceptVariant(AcceptOperation)  // Phase-3 source-edit
           → POST /events { kind: "accept-confirm", ... }
```

The mode is `live-accept` by default; `live-with-screenshot` when the
floating-bar's screenshot toggle is on. The user toggle is a UX choice — they
opt into the extra 3s of capture latency.

When `verdict === "warn"`, the floating-bar shows a non-blocking
confirmation: "Found 2 warnings — accept anyway?". The user can override
with a single click; the override is logged as `UndoEntry { kind:
"safety-refused" }` with the reason.

## Audit CLI

`wisp-design audit [paths...] [--mode <fast|full|strict>] [--screenshot]
[--format <text|json|markdown>] [--fail-on-warn]`

| Flag | Mode mapping | Behaviour |
|---|---|---|
| (default) | `stop-hook` | Anti-slop only on changed files (5-file cap) |
| `--mode fast` | `stop-hook` | Same as default |
| `--mode full` | `audit` | All 6 checks, warn-only |
| `--mode full --screenshot` | `live-with-screenshot` | + multi-viewport |
| `--mode strict` | `audit-strict` | All 6 checks, hard-block |
| `--fail-on-warn` | (any) | Exit 1 on warn (CI knob) |
| paths positional | (any) | Audit specified files; else `git diff HEAD` |

Output format:

- **text** (default): per-file table, hard-ban count, warning count,
  verdict, total time.
- **json**: `VerifyReport` shape verbatim — pipe-friendly.
- **markdown**: human-readable report for PR comments.

## False-positive policy

The anti-slop linter MUST stay below 5% false-positive rate on a 100-real-
world-component fixture (`ANTI_SLOP_FALSE_POSITIVE_RATE_MAX`). Documented
in `tests/verify/anti-slop-fp-rate.test.ts` (tester owns). When a rule
exceeds 5% FPR in production:

1. Add a soft-suggestion variant of the rule.
2. Demote the hard-ban to a soft suggestion until the regex is tightened.
3. File a tracking issue; never silently disable.

A11y-axe inherits axe-core's FPR (well-documented in axe-core docs); we do
not re-measure it.

## Override flow

When a user overrides a warn or fail verdict:

1. The floating-bar's "accept anyway" button POSTs to the bridge.
2. Agent loop appends `UndoEntry { kind: "safety-refused", filePath,
   detail: { ruleIds: [...], reason: "<user-supplied note>" } }` to
   `.wisp/sessions/<sessionId>.jsonl`.
3. The accept proceeds via the standard Phase-3 path.
4. Subsequent `wisp-design history` renders the override with a
   highlighted row.

Strict-mode (`audit-strict`, `WISP_DESIGN_STRICT=1`) cannot be overridden
mid-flight — the user must rerun without strict to override. This keeps CI
deterministic.

## Playwright sandbox safety

When `multi-viewport` launches chromium:

- **Sandbox**: chromium's seccomp sandbox is ON (no `--no-sandbox` ever).
- **Extensions**: `--disable-extensions` — no user extension state leaks
  into the test browser.
- **Browser-check**: `--no-default-browser-check`, `--no-first-run`.
- **URL whitelist**: only `localhost` URLs are navigated to. Enforced by
  `src/verify/_sandbox.ts` (security agent owns). External URLs throw
  `SafetyError { code: "PATH_OUTSIDE_ROOT" }` analogue.
- **Headless**: always headless; the user doesn't see a window pop.
- **Process lifecycle**: chromium is launched per `audit` invocation, kept
  alive across viewports within one run, terminated on completion. In
  live-mode, chromium is launched on first screenshot toggle and reused
  across accepts in the same session.

## Wiring summary — what the verify module integrates with

| Caller | Mode | When |
|---|---|---|
| `src/hooks/dispatcher.ts` (stop hook) | `stop-hook` | every Claude turn |
| `src/agent/audit.ts` (CLI) | `audit` / `audit-strict` | `wisp-design audit` |
| `src/agent/poll-loop.ts` (bridge accept event) | `live-accept` / `live-with-screenshot` | before fs.writeFileSync |
| `src/cli/doctor.ts` | n/a | probes `axe-core`, `playwright`, `pixelmatch` presence |

The agent layer NEVER invokes individual checks directly — always
through `gate.run(ctx)`. The Stop-hook is the single exception: it calls
`gate.runAntiSlop(css, ctx)` to skip orchestrator overhead.

## What this file is NOT

- Not the implementation. That lives in `src/verify/*.ts` (coder agent
  owns).
- Not the test plan. Tests live in `tests/verify/*.test.ts` (tester agent
  owns), referenced from `CLAUDE.md > Quality-Gates`.
- Not a user-facing guide. That's `README.md > Verification-Gate`,
  written at Phase-7 launch.
