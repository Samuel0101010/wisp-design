# wisp-design — Live User-Test Report (Chrome MCP)

**Date:** 2026-05-23
**Mode:** `wisp-design live --strict --inject sample/index.html`
**Bridge:** http://127.0.0.1:31338 (auto-discovered, lockfile + token UUID)
**Tab:** 1617693749 ("wisp-design sample — QA sweep")

I drove the plugin as a user would — through the floating bar, clicking
real elements, typing into the textarea, cycling variants, accepting,
discarding, multi-selecting, annotating. This is the deepest E2E pass
beyond the verifier's CLI-level integration tests.

## What worked — fully

| Phase | Flow | Result |
|---|---|---|
| Setup | Bridge boot + script-tag auto-inject + Chrome refresh + `WispDesign.init({bridgeUrl, token})` | ✓ Floating bar live in DOM, handle returned `{state, pick, cancel, teardown}` |
| A | `h.pick()` → state IDLE → PICKING; user-click on slop h3 → state CONFIGURING with full target metadata (id, selector, tag, rect, attributes) | ✓ Target selector `main > section(2) > div > h3` correct |
| B | Textarea input "Make it calmer and more readable" + Generate button click → state CONFIGURING → GENERATING → CYCLING (1.5–2.5s round-trip) | ✓ 3 variants in state, freeText preserved |
| C | Floating bar in cycling mode: 8 buttons (Variant 1/2/3, ◀ ▶, Discard, Annotate, Accept). Click `▶` → activeIndex 0→1. Click `Variant 3` → activeIndex 2. Click `Variant 1` → activeIndex 0. | ✓ State machine tracks activeIndex correctly |
| F | `h.cancel()` from PICKING → state IDLE | ✓ |
| F | Cmd-click multi-select: pick + click slop h3 + Cmd-click clean h3 → `state.targets.length === 2`, both tagged `h3` | ✓ Improvement #1 wired |
| F | Annotate button click → adds "Add" button for note input, stays in CYCLING | ✓ Annotation flow accessible |
| F | HTTP `GET /stop?token=<T>` → `{"stopping":true,"graceMs":500}` → `.wisp/live/port.lock` deleted | ✓ Bug #11 confirmed FIXED end-to-end |
| F | Bridge logs INFO line for inject session + bridgeUrl + sessionId | ✓ Output JSON to stdout, machine-parseable |

## What's BROKEN — discovered in live user-test

### 🚨 Bug #21 — Variants don't render visually in DOM

State machine reaches CYCLING with 3 variants in state, but:

- `document.querySelectorAll('style[data-wisp-css]')` → 0 elements
- `[data-wisp-variant]` attribute on slop h3 → not set
- `getComputedStyle(slop).getPropertyValue('--wisp-pad')` → empty string

The variant CSS @scope blocks that Phase 2 `variant-render.ts` is
supposed to mount are never inserted into the DOM. State machine
*reports* cycling correctly; floating bar *shows* the variant buttons;
but the actual picked element receives NO CSS changes. User sees the
floating bar UI but no visual variant rendering.

Probable cause: `bridge.subscribe` SSE handler in
`src/browser/index.ts` receives `cycling` events from the bridge, calls
`machine.send("generate-variants-arrived", ...)`, but the state
subscription that should call `variant-render.mountVariants(...)` never
fires — OR the mount path uses a different target/selector pattern that
doesn't match the picked element.

### 🚨 Bug #22 — Live-process variants are Phase-4 placeholders, not coder-3's deterministic stub

Variant payload from the bridge:

```js
{
  id: "placeholder-0",
  css: ":scope { /* @param: kind=range min=0 max=24 step=2 label=\"padding\" */ --wisp-pad: 4px; }",
  rationale: "Placeholder variant 1 — Phase 4 will replace this with agent output."
}
```

Coder-3 wrote `generateVariantsStub` in `src/agent/live.ts` with three
distinct deltas (identity / increased-weight / decreased-weight). That
code path is NOT executing — instead, `src/browser/index.ts:346`'s
`schedulePlaceholderVariants` (a 1500ms fallback timer that fires when
no real variants arrive via SSE) is what renders.

Root cause hypothesis: the live process's `pollOnce` loop is running,
but `dispatchEvent` for `configure` events isn't POST'ing the resulting
variants back to the bridge — or it's POST'ing with the wrong event
kind, so the browser's `bridge.subscribe` handler never sees a real
`cycling` event before the 1500ms placeholder timeout fires.

### 🚨 Bug #23 — Accept clears state to idle but DOES NOT modify source file

`md5sum sample/index.html` identical before + after clicking Accept in
`--strict` mode. State machine transitions cycling → idle, floating bar
reverts to idle controls, but the source file is unchanged.

Likely cascade from #22: the active variant is `placeholder-0` (browser
fallback). When Accept POSTs `{kind: "accept", variantId: "placeholder-0"}`
to the bridge, the live process's `dispatchEvent` can't find a variant
with that ID in its own state (it never generated those placeholders),
so the splice silently no-ops.

Side-effect: `--strict` verify-gate USP block CANNOT be demonstrated
through the user-facing flow, because the real variants that would feed
the gate never arrive. The strict-mode block is reachable only through
the agent's internal dispatchEvent path (covered by unit tests).

### ⚠️ Bug #24 — `clientX/clientY` mouse click works to capture but real PICKER click handler may use elementFromPoint

`document.elementFromPoint(rect.x + rect.w/2, rect.y + rect.h/2)` is
the standard browser-side picker mechanism. My simulated MouseEvent
with `clientX/Y` worked, but real Chrome MCP click coordinates may
hit overlay/wrapper elements first. Confirmed acceptable since the
state machine still captured the right element via bubbling, but worth
documenting for the demo GIF script.

## What I couldn't test — gated by bugs above

| Phase | Why blocked |
|---|---|
| Variant cycle VISUAL diff | #21 — no CSS mounts to DOM |
| Slider tuning (CSS-var live update) | #21 — no `--wisp-pad` var present on element |
| Accept → carbonize → splice | #23 — no source mutation |
| Verify-gate USP block in strict mode | #22, #23 — no real variant CSS to scan; agent doesn't reach gate.run |
| Annotation persistence (does the note write to session log?) | Annotate UI works but session-log inspection deferred |

## Architecture insight from this test

The bridge ↔ browser ↔ agent triple has three orchestration paths that
are wired but not connected end-to-end:

1. **Bridge serves** /events POST + /poll GET + /events SSE.
   Tested green by QA-B (96 checks). ✓
2. **Browser** posts picker/configure events, listens via SSE,
   maintains state machine + floating bar.
   State machine: green. UI: green. SSE fallback timeout: green.
   Visual variant rendering: **broken** (#21).
3. **Live process** polls /events, runs dispatchEvent, generates
   variant stub, posts cycling event back.
   CLI boot: green. Lockfile cleanup: green. **dispatchEvent
   variant-generation path → bridge POST → SSE: broken** (#22).

Of these, #21 (browser rendering) and #22 (agent posting variants
back) are the two real launch-blockers for the variant USP. Both are
"plumbing not connected" — neither the state-machine subscription
that calls variant-render, nor the live-process postEvent after
generateVariantsStub, fires correctly.

## Bridge cleanup (#11 in live)

`GET /stop?token=<TOKEN>` returns `{"stopping":true,"graceMs":500}`
**and** removes `.wisp/live/port.lock`. The `onBeforeStop` callback
wired in foreground Phase 6.5 fix DOES fire on the HTTP /stop path.
Confirmed in live browser session.

Earlier verifier test missed this because they called `/stop` WITHOUT
token — the bridge returned 401 before reaching `stopServer()`.
The auth-protected /stop endpoint is intentional (prevents
drive-by /stop calls from any page in the browser).

## Verdict for Phase 7 launch

| Status | Items |
|---|---|
| ✅ READY for v1.0.0 launch | CLI surface (audit, init, live, doctor, history --list, post-event, poll-once, skills, sync, morph, policy, hook). Bridge layer. Verify-gate (anti-slop catches Tailwind; a11y catches button-name + image-alt on Node 22; tab-order msgs concrete). Component-detect all 6 libs. Session logger. Picker state machine + multi-select + cancel + annotate. Lockfile cleanup. |
| 🚨 NEW launch-blockers from user-test | **#21 variant @scope CSS doesn't mount to DOM** (USP visual). **#22 live process doesn't post real variants to bridge** (USP fidelity). **#23 accept doesn't modify source file** (USP persistence). |
| ⚠️ Cosmetic / acknowledged v1.1 | #18 `live --help` hangs. #19 `--port 0` rejected. #20 no auto-init from script-tag. #24 elementFromPoint vs MouseEvent dispatch (testing nit). |

**Recommended action:** The 3 plumbing bugs (#21–#23) are tightly
coupled in the variant flow. They block the headline live-edit
demo (pick → 3 variants visible → accept → source-spliced). A
**single Phase 6.6 sprint with one coder** can fix all three: trace
the state-machine subscription → variant-render mount path (#21);
verify dispatchEvent's POST to bridge with correct event kind (#22);
test full picker→accept→splice loop against the sample once #21/#22
fire correctly (#23 falls out).

Total estimated work: 2–4h for one coder + tester.

After Phase 6.6: the visual live demo works end-to-end → ready for
Phase 7 README + GIF + public launch + v1.0.0.

## Tests run by this session — what's now in the test suite

| Test category | Count | Where |
|---|---|---|
| Unit + integration | 712 | `tests/**/*.test.ts` (vitest, 45 files) |
| QA-A install/manifest/hooks (Bash drivers) | 38 checks | `qa/agent-a/SUMMARY.md` |
| QA-B bridge E2E (vitest) | 96 checks | `qa/agent-b/SUMMARY.md` |
| QA-C verify/anti-slop/session/detect | 32+ checks | `qa/agent-c/*.md` |
| Verifier rounds 0-9 | full re-validation | `qa/verifier/SUMMARY.md` |
| Live user-test (Chrome MCP, this report) | 19 user-visible flows | `qa/LIVE-USER-TEST-REPORT.md` |

**Cumulative coverage:** unit + integration + 3-parallel-domain QA +
foreground-fix verification + **live browser user-flow exercise**. The
last layer is what surfaced #21–#23 — none of the prior layers caught
them because they're plumbing-between-modules, not module-internal.
