---
name: wisp-design
description: Use when the user runs /wisp-design live in a project, OR when a wisp-design bridge is active (`.wisp/live/port.lock` exists) and bridge events arrive needing variant generation. Orchestrates the agent loop — poll the bridge, classify each event, reason about variants using the reference and policy sub-skills, and post results back via the wisp-design CLI. Never invoke without an active bridge.
license: MIT
---

# wisp-design — Live Frontend Design Loop

Claude Code's reasoning IS the loop. There is no daemon. This skill encodes the while-loop body that the model executes between `Bash` calls to the wisp-design CLI.

The skill is loaded automatically when the user invokes `/wisp-design live` and a bridge process is reachable. It exits automatically when the user types `stop`, when `.wisp/live/port.lock` disappears, or after 30 minutes of idle time.

## The loop

```
while bridge alive:
  result = Bash("wisp-design poll-once --timeout 270000 --cursor $CURSOR")
  for event in result.events:
    handle(event)
  if result.shouldRetry:
    continue          # bridge sliced before deadline — re-enter immediately
  if no events for 30 min or user said "stop":
    break
```

Slicing rule: `pollOnce` returns `shouldRetry: true` whenever the bridge cut the 270 s cap before the caller's deadline expired. Re-invoke the CLI immediately. Cursor advances at-least-once — handlers MUST be idempotent.

## Event-routing table

| `event.kind`         | Action                       | Skill loaded                                                          |
| -------------------- | ---------------------------- | --------------------------------------------------------------------- |
| `generating`         | generate-variants            | `skills/reference/live.md` + `skills/policy/anti-slop.md` (always)    |
| `configure`          | generate-variants (legacy)   | legacy alias — the browser no longer emits this; kept for scripted POSTs |
| `accept`             | write-accept                 | `Bash("wisp-design accept --session SID --variant VID")` (Phase 3)    |
| `discard`            | clean-discard                | `Bash("wisp-design discard --session SID")` (Phase 3)                 |
| `annotation`         | log-annotation               | append entry to `.wisp/sessions/<SID>.jsonl`                          |
| `pick`               | ignore                       | (browser state telemetry — no agent action)                           |
| `cycling`            | ignore                       | (echo of own post — heard once via at-least-once delivery)            |
| `parameter-change`   | ignore                       | (slider tick — no agent round-trip by design)                         |
| `heartbeat`          | ignore                       | (15 s keepalive)                                                      |
| `error`              | ignore (log)                 | (bridge or browser-side error already surfaced)                       |

> **Bug #22 / browser vocabulary:** the browser POSTs `generating` (carrying `freeText` + `variantCount`) on configure-submit — it never emits `configure`. `generating` is therefore the live trigger; `configure` is a back-compat alias only. If the browser vocabulary changes, revisit this table, `routeEvent` (`src/agent/poll-loop.ts`), and `docs/agent-loop.md` together.

When the model handles a `generating` event, it MUST emit `requestedVariantCount` variants via:

```
Bash("wisp-design post-event --kind cycling --payload <json>")
```

where `<json>` is a `VariantGenerationResponse` (see `src/contracts/agent.ts`).

## Always-loaded sub-skills

Three sub-skills are loaded into context for every `generating` event:

1. **`skills/reference/live.md`** — the variant-generation prompt. Defines the 5 axes (`hierarchy`, `layout`, `typography`, `color`, `density`), the distinct-variants rule, the output CSS shape (`@scope` + tunable CSS-vars), and three worked examples.
2. **`skills/policy/anti-slop.md`** — the hard-bans and soft-warnings. Every generated variant is filtered against the hard-ban list before posting. The rationale string MUST cite the rule when the user's `freeText` brushed against one (e.g. "User asked for gradient, but anti-slop bans rainbow text → emitted a single-stop accent gradient on the border instead").
3. **`skills/data/anchors/00-INDEX.md`** — the 13 variant-anchor index. Loaded for anchor-lookup when the user references one ("more like Linear" → load `skills/data/anchors/linear.md`).

Sub-skills loaded conditionally:

- `skills/methodology/narrative-questions.md` — when the user's `freeText` mentions "new page", "new screen", "new section", "from scratch". Triggers the 4 Pre-Code Questions before any variants are emitted.
- `skills/methodology/junior-designer-flow.md` — when the model is creating a new page/screen (not editing existing). Sets the 4-phase Stub → Checkpoint → Fill → Verify approach.
- `skills/methodology/brand-asset-5-10-2-8.md` — only when `--brand` flag is set or explicit `brand` mode is active. Opt-in per Open Decision #4.
- `skills/reference/polish.md` / `bolder.md` / `quieter.md` / `colorize.md` / `layout.md` — when the user's `freeText` matches the file's theme (e.g. "make it bolder" loads `bolder.md`).

## Hard rules for variant generation

1. **Distinct primary axes.** Three default variants → three different primary axes. Three colour variations of the same layout is slop, regardless of how well-crafted each is.
2. **Variant count is fixed by the request.** `requestedVariantCount ∈ {1, 3, 5, 8}`. Never invent extra variants; never emit fewer. If the user asked for 3 and you only have 2 distinct axes that fit, ask via a `cycling` event with `variants: []` and a clarifier annotation — but only once per session.
3. **Variant-rationale ≤ 180 chars, axis-attributed.** Example: `"Looser density + larger touch targets — primary action gains weight from the surrounding breathing room."`. No emoji unless the user requested them.
4. **CSS is `@scope`-wrapped.** Every variant is `@scope ([data-wisp-variant="N"]) { :scope { … } }`. Tunable params declared as CSS custom properties (`--wisp-pad`, `--wisp-radius`, …) with inline `/* @param: kind=range min=0 max=24 step=2 label="padding" */` directives so `parameter-sliders.ts` can bind them.
5. **Prefer existing tokens.** If `.wisp/design-tokens.json` or `.wisp/brand-spec.json` exists, pull values from there rather than inventing new ones. Avoids "yet another 13.5 px spacing" drift.
6. **Component-library aware.** If `componentLib === "shadcn" | "radix" | "mui"`, the rationale notes which prop-edit (`<Button size="lg" variant="ghost">`) the change maps to. Phase 6 will surface this; Phase 4 captures the hint in the rationale only.

## Stop conditions

- User says `stop` in chat → break the loop, do not poll again.
- `.wisp/live/port.lock` is removed (e.g. user ran `/wisp-design stop` or pressed the bar's Exit) → break.
- 30 minutes pass without any non-heartbeat event → break and report "idle exit".
- The CLI returns a non-zero exit code with `error: "bridge-unreachable"` → break and report.

## What this skill does NOT do

- It does not run the verification-gate. Phase 4 posts variants unconditionally; Phase 5 (`src/verify/*.ts`) gates `accept`.
- It does not write to source files directly — that is `wisp-design accept` (Phase 3).
- It does not maintain its own state across CLI invocations — the bridge's cursor IS the state.
- It does not poll in parallel with multiple sessions — one session-id per loop instance.

The Phase-4 surface is intentionally narrow: parse events, classify, generate variants, post back. Everything that wants to be a daemon stays out of this skill.
