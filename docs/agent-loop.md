# Agent-Loop Architecture (Phase 4)

The `wisp-design` agent layer is unusual: there is **no daemon, no resident process, no scheduler**. Claude Code's own reasoning IS the loop. The CLI ships one-shot primitives (`poll-once`, `post-event`, `accept`, `skills search`); the loop body lives in `skills/wisp-design/SKILL.md` as instructions the model executes step-by-step.

This document specifies the loop's contract, the variant-generation prompt-API, and the boundary between Phase-4 (agent-loop + skill-corpus) and Phase-5 (verification-gate).

---

## 1. End-to-end flow

```
┌────────────┐  pick/configure/         ┌──────────────────┐
│  browser   │  accept/discard/         │  bridge server   │
│  (live.js) │ ─ annotation ─────────▶  │  (Node HTTP/SSE) │
│            │                          │                  │
│            │ ◀────── cycling ──────── │  + event queue   │
│            │   parameter-change       │  + cursor store  │
└────────────┘                          └────────┬─────────┘
                                                 │
                                  GET /poll      │  POST /events
                                  long-poll      │  one-shot
                                  ≤ 270 s slice  │
                                                 ▼
                                       ┌───────────────────┐
                                       │ wisp-design CLI   │
                                       │ poll-once / post  │
                                       └────────┬──────────┘
                                                │ stdout JSON
                                                ▼
                              ┌──────────────────────────────┐
                              │ Claude Code (the agent loop) │
                              │  • parse PollOnceResult      │
                              │  • route by event.kind       │
                              │  • for configure:            │
                              │      reason about design     │
                              │      using skills/reference/ │
                              │      live.md + skills search │
                              │      → 3 distinct variants   │
                              │  • for accept:               │
                              │      Bash(wisp-design accept)│
                              │  • re-invoke poll-once       │
                              └──────────────────────────────┘
```

The skill prompt encodes the while-loop. When `pollOnce` returns
`shouldRetry: true` (the bridge sliced its 270-second cap before any new
events arrived, or before the caller's `timeoutMs`), the skill immediately
re-invokes `wisp-design poll-once --cursor <last>`. Otherwise it processes
each event and only then re-polls.

This design has a notable property: **if the user's Claude Code session
crashes, the loop is restartable from `cursor`**. Events are append-only on
the bridge side; the browser doesn't care which Claude session is on the
other end of the long-poll.

---

## 2. Long-poll slicing

The bridge enforces `LONG_POLL_CAP_MS = 270_000` (defined in
`src/contracts/bridge.ts`). Node's `fetch` caps headers-timeout at 300 s, and
some HTTP/2 proxies trim at 280 s, so 270 s is the safe interior. The CLI's
default `--timeout` matches the cap exactly; callers can request shorter
slices for tests.

**Cursor advancement**:

- The bridge allocates a monotonic cursor per `POST /events` body.
- `GET/POST /poll` returns events strictly greater than the supplied cursor.
- After a slice, `cursor` reflects the highest cursor the bridge has emitted
  to this client (NOT the highest globally allocated — that would race against
  concurrent posters).
- **At-least-once delivery**: if the agent crashes mid-handling, the next
  `poll-once` may re-deliver events the previous run already saw. Handlers
  MUST be idempotent. Practically: `accept` writes once (file-hash check
  refuses double-apply); `cycling` re-posts are safe (the browser sees the
  same variant ids and idempotently replaces the @scope block).

**Idle behaviour**:

- A `heartbeat` event is emitted by the bridge every 15 s while a long-poll
  is parked. This keeps corporate proxies from dropping the connection. The
  skill's `routeEvent` returns `"ignore"` for heartbeats, but their arrival
  proves the channel is alive.
- A truly idle bridge slices at 270 s with `events: []` and
  `shouldRetry: true`. Cost is negligible — no LLM tokens consumed.

---

## 3. Variant generation contract

When `pollOnce` returns a `configure` event, the skill assembles a
`VariantGenerationRequest` (see `src/contracts/agent.ts`):

| Field                    | Source                                           |
| ------------------------ | ------------------------------------------------ |
| `target`                 | `event.target` (selector, rect, attributes…)     |
| `freeText`               | `event.freeText` (sanitized; ≤ 4000 chars)       |
| `requestedVariantCount`  | `1 \| 3 \| 5 \| 8` — bar state                   |
| `sessionId`              | `event.sessionId`                                |
| `brandSpec`              | `.wisp/brand-spec.json` (if exists)              |
| `designTokens`           | `.wisp/design-tokens.json` (if exists)           |
| `componentLib`           | detected from `package.json` (see §5)            |
| `axesEmphasis`           | derived from `freeText` keywords (optional)      |

The actual prompt body lives in `skills/reference/live.md`. The Phase-4
contract says: **the model MUST emit `requestedVariantCount` variants, each
attributed to a primary axis among `hierarchy | layout | typography | color | density`,
and distinct enough to feel like different design directions — not
micro-variations of the same look.**

### 3.1 What "distinct" means

The 5 axes are the explicit guardrail. Three default variants emphasising
three different axes — say `density` (looser spacing), `hierarchy` (bigger
primary action, smaller label), `color` (semantic accent shift) — feel like
three real options. Three variants all emphasising `color` (one teal, one
blue, one violet) are slop.

The prompt instructs the model to:

1. Pick `requestedVariantCount` distinct primary axes.
2. For each, write CSS that meaningfully shifts the chosen axis.
3. Write a one-sentence rationale (`≤ 180 chars`) of the form
   "Looser density + larger touch targets" — axis-first, declarative.
4. Tag the variant's `primaryAxis`.

### 3.2 CSS-vars + sliders

Each variant declares CSS custom properties (`--wisp-pad`, `--wisp-radius`,
…) and exposes them via inline `@param` directives:

```css
@scope ([data-wisp-variant="0"]) {
  :scope {
    /* @param: kind=range min=0 max=24 step=2 label="padding" */
    --wisp-pad: 12px;
    /* @param: kind=range min=0 max=24 step=1 label="radius" */
    --wisp-radius: 8px;
    padding: var(--wisp-pad);
    border-radius: var(--wisp-radius);
  }
}
```

The browser parses the directives (`src/browser/parameter-sliders.ts`,
defined in `src/contracts/browser.ts`) and renders sliders that drive the
vars directly. Zero agent round-trip per slider tick — only the final
`accept` request carries the accumulated `paramOverrides` for source-bake.

---

## 4. Brand-spec + design-tokens lookup

Two opt-in JSON files in `.wisp/` change how the variant prompt behaves:

### `.wisp/brand-spec.json` — 9-section schema (`BrandSpecSchema`)

Adapted from `research/repos/open-design.md`. Only `name` and `oneLiner` are
required; the rest layer in as the project matures.

- `voice.{tone,distance,temperature}` → constrains rationale phrasing.
- `visualDirection` ∈ {editorial, modern-minimal, tech-utility, brutalist, soft-warm}
  → biases axis weighting (brutalist → typography + density; editorial → hierarchy + color).
- `variantAnchor` ∈ {linear, stripe, anthropic, aceternity, apple, vercel,
  raycast, notion, github, tailwind-ui, shadcn-default, shadcn-soft,
  shadcn-bold} → the prompt fetches exemplar pattern-cards via
  `wisp-design skills search "<anchor>"` for inline study.
- `palette.{mode,values}` → OKLch / HSL / Hex tokens. Overrides sampled
  colors.
- `typeScale.{baseSize,step}` → constrains font-size variants.
- `motion.tokens` → ease curves (`--ease-smooth`, `--ease-sharp`,
  `--ease-spring`, `--ease-power`).

### `.wisp/design-tokens.json` — `DesignTokensSchema`

Written by `/wisp-design tokens extract`. Samples computed styles across the
running app and clusters into legal value sets:

```jsonc
{
  "extractedAt": "2026-05-22T13:42:00Z",
  "spacing": [0, 4, 8, 12, 16, 24, 32, 48, 64],
  "radii": [0, 4, 8, 12, 16, 9999],
  "fontSizes": [12, 14, 16, 18, 20, 24, 32, 48],
  "fontWeights": [400, 500, 600, 700],
  "colors": ["#0a0a0a", "#ffffff", "#3b82f6"],
  "fontFamilies": ["Inter", "ui-monospace"],
  "zIndex": [0, 10, 50, 100],
}
```

The variant prompt prefers existing tokens over fresh-invented ones — this
keeps generated CSS consistent with the rest of the codebase and avoids
"yet another 13.5px spacing" slop.

### Fallback when both are missing

The prompt asks the user one targeted clarifier (delivered via a `cycling`
event with `variants: []` and a `clarifier` annotation) before generating —
but only ONCE per session. After that, "house style" defaults apply: 4-px
spacing grid, OKLch neutral palette, 1.333 type-scale, system fonts.

---

## 5. Component-library detection

Phase 4 records the hint; Phase 6 (`src/agent/component-detect.ts`) acts on
it.

The detection rule:

| `package.json` dependency                                        | `componentLib` |
| ---------------------------------------------------------------- | -------------- |
| Any `@radix-ui/*`, exact-name `shadcn` markers, or `@shadcn/ui`  | `"shadcn"`     |
| `@radix-ui/*` only (no shadcn)                                   | `"radix"`      |
| `@mui/material` or `@mui/joy`                                    | `"mui"`        |
| `tailwindcss` in deps or devDeps, no component lib               | `"tailwind"`   |
| None of the above                                                | `"vanilla"`    |

When `componentLib === "shadcn" | "radix" | "mui"`, the Phase-6
implementation prefers JSX prop-edits (`<Button size="lg" variant="ghost">`)
over CSS overrides where the requested change maps to a known prop. Phase 4
records the hint inside `VariantGenerationRequest`; the variant prompt
still emits `@scope` CSS — Phase 6 layers prop-edits on top.

---

## 6. Skill-corpus access

`skills/data/*` is indexed into AgentDB HNSW under the
`DEFAULT_SKILLS_NAMESPACE = "wisp-design"` namespace. The variant prompt
retrieves topK pattern-cards during generation via:

```bash
wisp-design skills search "<query>" --top-k 8
```

returning `SkillsSearchResult[]` (filePath, score, snippet, namespace). The
prompt embeds the snippets inline as exemplar evidence. The skill's
implementation lives in `src/agent/skills-index.ts` (coder-owned).

**Sub-namespaces** (`SkillsIndexResult.byNamespace`):

- `anchors` — 13 variant-anchor reference cards (Linear, Stripe, …).
- `directions` — Huashu's 20+ design-directions (MIT, attributed).
- `corpus` — UI-UX-Pro-Max 14 CSVs (MIT, attributed).
- `patterns` — Samuels vault patterns synced via `wisp-design sync`.
- `policy` — anti-slop rules and verification-gate policy.
- `methodology` — narrative-questions, junior-designer-flow, brand-asset-5-10-2-8.
- `reference` — the prompt bodies for live / polish / bolder / quieter / colorize / animate / layout / accept / discard.

Re-indexing is idempotent and explicit:

```bash
wisp-design skills index             # rebuilds the whole corpus
wisp-design skills index --namespace patterns   # rebuilds one sub-namespace
```

---

## 7. Sync flow

`/wisp-design sync --from <vault-path>` is the ONLY way new vault material
enters the corpus. **No push-script, no file-watcher** (Open Decision #6,
`research/synthesis.md`).

The flow:

1. Validate `<vault-path>` exists and resolves under a user-accessible root
   (no traversal escape; same guards as `bridge/auth.ts:guardPath`).
2. Walk `<vault-path>` for `patterns` glob (default `**/*.md`).
3. Copy each match into `skills/data/patterns/`, preserving relative
   sub-folder structure. Existing files with identical SHA-256 are skipped
   (the `SyncResult.skippedCount`).
4. Append `--- attribution: { owner, license } ---` frontmatter to any
   copied file that lacked it.
5. Re-run `wisp-design skills index --namespace patterns` (unless
   `--no-index` is passed).
6. Return `SyncResult` with copied/skipped counts and a confirmation that
   AgentDB was re-indexed.

**Why explicit (not push)**: licence + attribution. The user is the only
party who can certify that a given vault file is theirs to ship under MIT.
A daemon push-script would silently copy whatever lands in the vault —
including third-party patterns the user hasn't reviewed.

---

## 8. Anti-slop policy enforcement

`skills/policy/anti-slop.md` is loaded as **context for every variant
generation**. The model is asked, in the prompt body, to NOT emit:

- `<span style="...em-dash...">` decorative em-dashes in UI copy
- `background: linear-gradient(text-clip)` rainbow text without a brand reason
- Default glassmorphism (`backdrop-filter: blur(8px)` + 0.2 alpha) absent a
  stated rationale
- Hero-metric template ("10,000+ developers • 99.9% uptime • 24/7 support")
- Side-stripe accent rule (Impeccable's anti-pattern)
- Generic purple-to-blue gradient
- Generic AI-illustration placeholder slop

These are **soft-suggestions at prompt time**. The Phase-5
verification-gate (`src/verify/anti-slop-linter.ts`) enforces them as **hard
checks against the generated CSS** before `accept` is allowed. The two
layers exist for defence in depth: prompt-time filtering catches most slop
cheaply; gate-time linting catches the rest.

The Phase-4 contract says: **the prompt MUST cite which anti-slop rule it
chose to comply with** when the user's freeText brushed against one (e.g.
"User asked for gradient, but anti-slop bans rainbow text → emitted a
single-stop accent gradient on the border instead"). This goes into the
rationale string.

---

## 9. Open Decisions (confirmed)

| # | Decision                                | Resolution                                                                                                              |
| - | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 4 | Brand-Asset-Protokoll (5-10-2-8)        | **opt-in** via flag; default-on only inside an explicit `brand` mode. Most projects don't need the full 5-10-2-8 ritual. |
| 5 | UI-UX-Pro-Max fork vs re-build          | **MIT-fork with attribution**. Saves months; respects licence. Frontmatter in `skills/data/corpus/*.md` carries attribution.           |
| 6 | Vault-sync strategy                     | **Explicit `wisp-design sync --from <path>`**. No push-script, no watcher. User retains licence-curation gate.                     |

---

## 10. Module surface (recap)

Defined in `src/contracts/agent.ts`:

- `PollLoopModule` — `pollOnce(opts) → PollOnceResult`, `postEvent(opts) → PostEventResult`, `routeEvent(evt) → { action, source }`.
- `SkillsIndexModule` — `index(opts) → SkillsIndexResult`, `search(query, opts?) → SkillsSearchResult[]`.
- `SyncModule` — `sync(source, { projectRoot, index? }) → SyncResult`.

CLI dispatchers (in `src/index.ts`) call these via dynamic import so the
type surface is stable even when the runtime implementation is still being
written:

- `wisp-design poll-once [--timeout N] [--cursor C]` → `runPollOnce(args)`
- `wisp-design post-event --kind K --payload <json>` → `runPostEvent(args)`
- `wisp-design skills index [--namespace N]` → `runSkills(["index", ...])`
- `wisp-design skills search <query>` → `runSkills(["search", ...])`
- `wisp-design sync --from <vault-path> [--no-index]` → `runSync(args)`

---

## 11. What Phase 4 explicitly does NOT do

- **No verification-gate** — that's Phase 5. The agent loop posts variants
  to the browser unconditionally in Phase 4; `accept` is allowed without
  a11y / anti-slop checks (default `warn` mode just logs).
- **No session replay** — that's Phase 6. The loop appends UndoEntry rows to
  `.wisp/sessions/<id>.jsonl` (Phase 3 logger), but doesn't render them.
- **No structural-variant mode** — `--structural` is a Phase-6 flag. Phase 4
  emits CSS-only variants.
- **No morph-mode interpolation** — Phase 6.
- **No in-session policy proposal flow** — Phase 6.

The Phase-4 surface is intentionally narrow: one-shot CLI primitives, a
small contracts file, and a skill prompt. Everything that wants to be a
daemon stays out.
