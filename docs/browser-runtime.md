# Browser Runtime — wisp-design Phase 2

The browser runtime is the IIFE-bundled `live.js` injected into the dev
page. It owns the picker, the floating bar, the variant cycling, and the
client side of the bridge. **No build step at runtime** — it ships as a
single minified bundle exposed on `window.WispDesign`.

- **Source of truth:** `src/contracts/browser.ts`. If a shape disagrees
  with this doc, the contract wins.
- **Bundle entry:** `src/browser/index.ts` → `dist/live.js` (IIFE, ES2020).
- **Companion contract:** `src/contracts/bridge.ts` — every cross-boundary
  message uses `BridgeEvent` from there.

## State Machine

Five kinds. Authoritative transition table is `STATE_TRANSITIONS` in
`browser.ts` (18 edges). Anything not listed is invalid.

```
                  pick-start
       ┌──────────────────────────────┐
       │                              ▼
   ┌────────┐  pick-confirm   ┌──────────────┐
   │  IDLE  │ ◀───────────── ─│   PICKING    │
   └────────┘  pick-cancel    └──────────────┘
       ▲                              │
       │ cycle-accept                 │ pick-confirm
       │ cycle-discard                ▼
       │ cycle-bar-closed     ┌──────────────┐
       │                      │ CONFIGURING  │◀──── configure-edit-text
       │                      │              │      pick-add
       │                      └──────────────┘      (self-loops)
       │                              │
       │                              │ configure-submit
       │                              ▼
       │                      ┌──────────────┐
       │   generate-error     │  GENERATING  │
       │   generate-cancel    └──────────────┘
       │     (→ CONFIGURING)          │
       │                              │ generate-variants-arrived
       │                              ▼
       │                      ┌──────────────┐
       └──────────────────────│   CYCLING    │◀──── cycle-next/prev
                              │              │      cycle-set-active
                              └──────────────┘      cycle-param-change
                                                    (self-loops)
```

| From          | Event                          | To           |
|---------------|--------------------------------|--------------|
| idle          | pick-start                     | picking      |
| picking       | pick-hover                     | picking      |
| picking       | pick-confirm                   | configuring  |
| picking       | pick-cancel                    | idle         |
| configuring   | configure-edit-text            | configuring  |
| configuring   | pick-add                       | configuring  |
| configuring   | configure-submit               | generating   |
| configuring   | configure-cancel               | idle         |
| generating    | generate-variants-arrived      | cycling      |
| generating    | generate-error                 | configuring  |
| generating    | generate-cancel                | configuring  |
| cycling       | cycle-next / -prev / -set-active | cycling    |
| cycling       | cycle-param-change             | cycling      |
| cycling       | cycle-accept                   | idle         |
| cycling       | cycle-discard                  | idle         |
| cycling       | cycle-bar-closed               | idle         |

## Pickable Predicate

`pickable(el, opts)` returns `true` iff **all** of:

1. `el.getBoundingClientRect()` has `width ≥ opts.minWidth` (default 20)
   **and** `height ≥ opts.minHeight` (default 20).
2. `el.closest('[' + WISP_UI_DATA_ATTRIBUTE + ']')` is `null` — we never
   pick our own floating bar or variant overlays.
3. `el.tagName` is **not** one of `HTML`, `BODY`, `SCRIPT`, `STYLE`,
   `LINK`, `META`, `HEAD`, `TITLE`.
4. `getComputedStyle(el).display !== "none"` and `visibility !== "hidden"`.

Default `opts`:

```ts
{ minWidth: MIN_PICKABLE_PX, minHeight: MIN_PICKABLE_PX, excludeWispUi: true }
```

## Variant Rendering — CSS `@scope`

Per accepted target (single-select or multi-select set), the runtime:

1. Wraps the target node in three siblings:
   ```html
   <div data-wisp-variant="0">…original…</div>
   <div data-wisp-variant="1" hidden>…clone…</div>
   <div data-wisp-variant="2" hidden>…clone…</div>
   ```
2. Injects one `<style data-wisp-css="<sessionId>" data-wisp-session="<sessionId>">`
   block into `<head>` containing three `@scope` rules:
   ```css
   @scope ([data-wisp-variant="0"]) { /* variant 0 CSS */ }
   @scope ([data-wisp-variant="1"]) { /* variant 1 CSS */ }
   @scope ([data-wisp-variant="2"]) { /* variant 2 CSS */ }
   ```
3. `setActive(i)` flips the `hidden` attribute so only one sibling is
   visible at a time. No layout thrash beyond a single attribute write.
4. `teardown()` removes the `<style>` block and unwraps the siblings so
   the DOM is **byte-equivalent** to its pre-mount state. Phase-3
   `carbonize` relies on this reversibility for the discard path.

**Why @scope, not Shadow DOM:** the dev project's own Tailwind /
component-library CSS must keep applying to the variants — that requires
flat DOM. Shadow DOM would break utility classes. `@scope` is supported
in evergreen Chromium/Firefox/Safari (2024+), which is the only target
audience for a dev-time tool.

## Parameter Sliders — Zero-Roundtrip

Variants embed inline directives in their CSS:

```css
@scope ([data-wisp-variant="1"]) {
  :scope {
    /* @param: kind=range min=0 max=24 step=2 label="padding" */
    --wisp-pad: 12px;
    /* @param: kind=color label="accent" */
    --wisp-accent: #6366f1;
    /* @param: kind=toggle toggleOnValue="bold" toggleOffValue="normal" label="weight" */
    --wisp-weight: normal;
  }
  .card { padding: var(--wisp-pad); color: var(--wisp-accent); font-weight: var(--wisp-weight); }
}
```

`extractParameterBindings(cssText)` parses those directives into
`ParameterBinding[]`. The floating bar renders the appropriate control
(range/steps/toggle/color). On change the bar writes the new value
**directly** to the `@scope` root's CSS custom property — no bridge call,
no agent round-trip. The state machine still records the change as a
`cycle-param-change` event so session-replay can reproduce it.

Validation lives in `SanitizeModule.trustedCssVar`: name must match
`/^--[a-z][a-z0-9-]*$/i`; value must be free of `;`, `{`, `}`, `<`, `>`,
`url(`, `@import`, `expression(`.

## Annotations — Structured, Never Pixels

A `kind` enum drives the agent prompt template; a `note` is a sanitised
free-text string capped at `ANNOTATION_NOTE_MAX_LEN` (2000). Annotations
flow through `POST /annotation` as `BridgeEventOf<"annotation">`.

```json
{
  "kind": "annotation",
  "target": { "selector": ".cta-row > button", "rect": { "x": 240, "y": 600, "w": 180, "h": 44 }, "tag": "BUTTON" },
  "annotation": { "kind": "spacing", "note": "double the gap to the field above" },
  "sessionId": "…"
}
```

This is the explicit anti-Impeccable choice — Impeccable flattens
annotations to a PNG overlay, which the agent then has to vision-read.
We pass the structured signal directly so the prompt can quote `kind`
and `note` verbatim.

## Multi-Select — ⌘-Click / Ctrl-Click

In `picking` state, holding ⌘ (macOS) or Ctrl (Windows/Linux) on the
confirm-click invokes the `pick-add` event instead of `pick-confirm`,
extending the `targets[]` array on the (already-)CONFIGURING state.
Each member is decorated with a dotted outline (managed by
`MultiSelectModule`, not by inline styles on the target element — the
outline is a painted overlay so we never mutate target styles outside the
variant `@scope`).

Improvement #1 vs Impeccable, which can only pick a single element.

## Bridge Communication

```
browser ──POST /events──▶ bridge ──poll/SSE──▶ agent
   ▲                                              │
   └────────────GET /events (SSE)─────────────────┘
                or GET /poll fallback
```

- **Push (browser → bridge):** `POST /events?token=…`. The runtime
  batches up to one event per microtask but never delays an event
  through user-perceivable latency; expect ~one HTTP call per click /
  submit / accept.
- **Subscribe (bridge → browser):** by default `EventSource` against
  `GET /events?token=…`. Falls back to long-poll on `GET /poll` when
  `EventSource` is unavailable (e.g. CSP `connect-src` excluded
  `event-stream` — `bridge/csp.ts` patches this in dev).
- **Heartbeat:** the bridge emits `kind:"heartbeat"` every 15s; the
  runtime treats two missed heartbeats as a disconnect and reconnects
  with exponential backoff capped at 8s.

The `BridgeClient` interface in `browser.ts` is the only surface the
rest of the browser modules see. They never import fetch helpers
directly.

## Bundle Constraints

| Constraint            | Limit / Rule                                            |
|-----------------------|---------------------------------------------------------|
| Format                | IIFE                                                    |
| Global name           | `WispDesign` (exposes `WispDesignGlobal`)               |
| Target                | `es2020`                                                |
| Platform              | `browser`                                               |
| Bundle size (minified)| **< 95 kB** (budget bumped from 50 kB after a11y-radar + morph-slider; ~81 kB today, enforced by `tests/browser/bundle-size.test.ts`) |
| Sourcemap             | `dist/live.js.map` (committed alongside `dist/live.js`) |
| Dependencies          | **None at runtime.** `zod` is dev-time only — schemas live in the contracts; the browser bundle uses hand-rolled lightweight checks where validation is unavoidable. |
| Framework             | **None.** Vanilla DOM. No React, no Preact, no Lit.     |
| Entry                 | `window.WispDesign.init({ bridgeUrl, token })` returns `Promise<WispDesignHandle>` |
| Version probe         | `window.WispDesign.version === LIVE_JS_VERSION_TAG`     |

`tsup.config.ts` ships both bundles in one `defineConfig([…])` array:
the Node CLI bundle (`src/index.ts`) and the browser bundle
(`src/browser/index.ts`). The browser-side config sets
`noExternal: [/.*/]` so nothing leaks to a `require()` at runtime.

## Security Layer

Every string crossing the trust boundary into the DOM funnels through
`SanitizeModule`:

| Surface                      | Sanitiser                                  |
|------------------------------|--------------------------------------------|
| Floating-bar freeText render | `escapeHtml` (after `sanitizeFreeText`)    |
| Annotation note render       | `escapeHtml` (after `sanitizeFreeText`)    |
| Variant CSS custom prop write| `trustedCssVar`                            |
| Selector → querySelector     | `trustedSelector`                          |
| Agent rationale render       | `escapeHtml`                               |

Forbidden in any sanitised string:

- C0 control characters (`\x00–\x1F` except `\t`, `\n`, `\r`).
- For CSS values: `;`, `{`, `}`, `<`, `>`, and the substrings `url(`,
  `@import`, `expression(` (case-insensitive).
- For selectors: newlines, `<`, `>`, `javascript:`, `data:`.
- For free text: maxLen enforced (`FREE_TEXT_MAX_LEN`, default 4000;
  annotations 2000).

The runtime **never** calls `innerHTML`, `outerHTML`,
`insertAdjacentHTML`, or `element.style.cssText = …` on user-controlled
data. The injected `<style data-wisp-css>` block is built from a
template literal that only interpolates sanitised CSS-var values and
selectors trusted by construction (variant index `0|1|2`).

## Telemetry

`TelemetryEvent` is the loose-coupling shape between browser modules and
the Phase-6 session logger. Browser modules import only the
`EmitTelemetry` function type, never the logger module. This keeps the
bundle small and the dependency graph one-way.

## Anti-Patterns

- ❌ Mount React / Preact / Lit. The bundle is vanilla DOM. (50 kB cap.)
- ❌ Shadow DOM for variant isolation. Use `@scope` so the project's
  Tailwind / component-library CSS keeps applying.
- ❌ PNG-flatten annotations. We pass structured `{kind, note}`.
- ❌ Single-element selection. Multi-select via ⌘-click is built-in.
- ❌ WebSocket transport. SSE + long-poll fallback only.
- ❌ Bridge round-trip per slider tick. CSS-var writes are zero-roundtrip.
- ❌ `innerHTML =` on agent data. Always `escapeHtml` + `textContent`.
- ❌ Inline `<script>` injection. The runtime is loaded once via
  `<script src="…/live.js">` and exposes its API through
  `window.WispDesign`.
