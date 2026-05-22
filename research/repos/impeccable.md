# Impeccable — Research for wisp-design

Repo: https://github.com/pbakaus/impeccable
Fetched: 2026-05-22. Source-of-truth: GitHub API + raw files on `main`.

## TL;DR

Impeccable is **two products in one repo**:
1. A **design-language skill pack** (markdown skills + 23 commands + anti-pattern rules) distributed to 11+ AI harnesses — this is what gives it 29k stars.
2. A **live visual-variant editor** (`/impeccable live`) — a Claude-Code-driven loop where the user picks a DOM element in their running dev server, types a freeform prompt, and the agent generates 3 variants that are previewed in-browser via CSS `@scope` injection and, on accept, written back to the actual source file.

The live-editor is the part that matters for wisp-design. It is **not** a Chrome extension, **not** CDP-based, **not** an MCP server. It is a **local HTTP+SSE bridge on port 8400** + a **JS runtime injected into the dev page via a `<script src="localhost:8400/live.js">` tag patched into the project's HTML entry**. The Chrome extension that lives in `extension/` is unrelated — it's a standalone "scan this page for anti-patterns" devtools panel.

## [Mechanism]

### Live-edit loop — exact wiring

```
┌──────────────────────────┐        ┌──────────────────────┐        ┌──────────────────────┐
│  User's dev server       │ <──5── │  Impeccable helper   │ <──2── │ Claude Code agent    │
│  (Vite/Next/whatever)    │  HMR   │  server :8400         │  poll  │ (CLI, blocking loop) │
│  + injected live.js      │ ──1──> │  HTTP + SSE bridge   │ ──3──> │  generates variants  │
└──────────────────────────┘  POST  └──────────────────────┘        └──────────────────────┘
       ▲                          /events                                      │
       └──────────────────────────────────────4 (write source file)────────────┘
```

1. **Element selection (browser-side).** `live.js` runs in the user's dev page. State machine: `IDLE → PICKING → CONFIGURING → GENERATING → CYCLING`. In `PICKING`, mouse-move calls `document.elementFromPoint(x,y)`, filters via a `pickable()` predicate (≥20×20px, excludes Impeccable's own UI chrome), draws a magenta border + dark tooltip showing `tag#id.classes`. Click selects → `CONFIGURING`.
2. **Prompt entry.** A single floating bar pins itself relative to the selected element (prefers below, falls back above). Modes: configure (action dropdown + freeform text input + variant-count toggle + Go), generating (label + animated dots), cycling (prev/next + dots + Tune popover + Accept/Discard). User clicks Go → POST `/events` with `{type:'go', token, id, action, prompt, count, elementContext:{outerHTML,tagName,...}, annotations:{comments,strokes}, pageUrl}`.
3. **Agent polling.** The Claude Code agent runs `node skill/scripts/live-poll.mjs` in a blocking loop. It GETs `/poll?token=X&timeout=270000` (sliced because Node fetch caps headers timeout at 300s; total budget default 600s). Server holds the connection open until a browser event lands, then returns the event JSON. Agent prints it to stdout, processes, then POSTs an ack back to `/poll`.
4. **Variant generation = source-file edit, not DOM mutation.** On `generate`, the agent runs `live-wrap.mjs` which inserts markers (`impeccable-variants-start`/`-end`) into the **actual source file** containing the selected element, plus a single `<style data-impeccable-css="SESSION_ID">` block. The agent then writes 3 `<div data-impeccable-variant="N">` siblings inside the wrapper, each scoped via CSS `@scope` rules (`":scope > .child"`, never bare `":scope"`). Each variant can declare 0–4 parameters (`range`/`steps`/`toggle`) that drive CSS variables for live tuning.
5. **Preview = dev-server HMR.** Because the agent edited a real source file, the user's existing HMR pipeline (Vite/Next/etc.) reloads and the page renders the wrapper with all 3 variants. `live.js` switches to `CYCLING` and shows only one variant at a time via display toggling; Tune popover binds sliders to the variant's CSS custom properties for live param adjustment with **no agent round-trip**.
6. **Accept = line-range splice, not patch file.** `live-accept.mjs` reads the target file, uses `findMarkerBlock()` to locate marker line numbers, calls `expandReplaceRange()` to include the outer `<div data-impeccable-variants>` (critical for JSX), `extractVariant(N)` to pull the chosen variant's children, then `fs.writeFileSync` replaces the marker range with the variant content + an optional `<div data-impeccable-variant="N">` wrapper for carbonization cleanup. Refuses to edit generated/built files — falls back to `fallback:'agent-driven'` which makes the agent extract from the served file into true source manually.
7. **Carbonize cleanup.** On accept, temporary `@scope` rules are rewritten into permanent stylesheet selectors and user-selected param values are baked in as concrete CSS values, removing the variant scaffolding.

### Browser bridge — concrete protocol

Helper server: `http://localhost:8400` (default; configurable). Auth: per-session token in every query string. All payload IDs are UUIDs; variant IDs numeric-only; `/source` path-traversal-blocked.

| Endpoint | Direction | Purpose |
|---|---|---|
| `GET /live.js` | server → browser | The injected runtime; bakes in `TOKEN` and `PORT` at serve time |
| `GET /detect.js` | server → browser | Anti-pattern overlay (separate from live) |
| `GET /design-system.json?token=X` | server → browser | DESIGN.md tokens for variant grounding |
| `GET /source?token=X&path=FILE` | server → browser | Read source for context |
| `POST /events` | browser → server | `{type:'go'\|'accept'\|'discard'\|'checkpoint'\|'exit', ...}` |
| `GET /events?token=X` | browser ← server | SSE stream for server→browser replies (variant arrival, status) |
| `GET /poll?token=X&timeout=N&leaseMs=M` | agent ← server | Long-poll; returns next browser event or `{type:'timeout'}` |
| `POST /poll` | agent → server | Ack `{type:'done'\|'complete'}` |
| `POST /annotation?token=X&eventId=ID` | browser → server | PNG of strokes/comments overlay |
| `GET /health`, `/status`, `/stop` | ops | Lifecycle |

The user's dev server stays on its own port. `localhost:8400` is **only** the bridge. CSP is auto-patched via `detect-csp.mjs` (dev mode only) — appends `http://localhost:8400` to `script-src` and `connect-src`, preserves original in `data-impeccable-csp-original` for clean removal.

### Script injection

`live-inject.mjs` modifies project HTML/JSX entry files declared in `.impeccable/live/config.json`. Anchors: `insertBefore: '</body>'` (or `insertAfter: '<head>'`). Inserts `<script src="http://localhost:PORT/live.js">`. The injection is **byte-for-byte reversible** (test contract: file matches original after insert/remove round-trip), including indentation and CSP attributes.

## [Tech-Stack]

| Layer | Choice |
|---|---|
| Language | JavaScript (ESM, `.mjs`) — no TypeScript |
| Runtime | Node ≥18, build via Bun |
| Bridge server | Plain Node HTTP + SSE (no Express, no socket.io) on `localhost:8400` |
| Browser runtime | Single bundled `live.js` injected via `<script>` tag — no extension, no iframe, no CDP |
| Element picking | `document.elementFromPoint` + state machine, plain DOM |
| Variant rendering | CSS `@scope` rules + `<div data-impeccable-variant="N">` siblings in source HTML |
| Persistence | Direct `fs.writeFileSync` line-range splice into source files |
| Screenshot | `modern-screenshot` (vendored UMD) for annotation captures |
| Annotation overlays | Custom strokes/comments captured client-side, PNG uploaded via `POST /annotation` |
| HTML/CSS parsing | `htmlparser2`, `css-tree`, `css-select`, `domutils` (deps in package.json) |
| Site (impeccable.style) | Astro on Cloudflare Pages (`wrangler.toml`) |
| Distribution | npm `impeccable` package (`bin: cli/bin/cli.js`); Claude Code plugin (`plugin/.claude-plugin/plugin.json` v3.1.1); 11 harness directories (`.claude`, `.cursor`, `.codex`, `.gemini`, `.opencode`, `.kiro`, `.trae`, `.qoder`, `.rovodev`, `.pi`, plus Copilot via `.github`) |
| Chrome extension | Separate product in `extension/` — MV3, `activeTab`+`scripting`+`storage`+`webNavigation`+`<all_urls>`, devtools panel, only for ANTI-PATTERN scanning. NOT used by `/impeccable live`. |
| Claude integration | **Slash command + skill** via Claude Code's native plugin system (`plugin.json` declares `"skills": "./skills/"`). The agent runs `skill/scripts/*.mjs` via `Bash`/`execFileSync`. No MCP server. No SDK calls in the live loop itself — variant generation is plain agent prompting against `skill/reference/live.md`. |
| Harness specifics | Claude Code runs the poll loop as a **background task**; Cursor/Codex run it **foreground** because their background terminals don't surface stdout reliably. |

Notable absent dependencies for what one might expect: no Playwright/Puppeteer in the runtime path (Puppeteer is `optionalDependencies`, only for screenshot generation in build scripts). No WebSocket library — SSE only. No CDP client. No Tailwind transforms.

## [UX-Flow]

Concrete sequence for a user on Claude Code editing a Next.js site:

1. `npx impeccable skills install` (one-time) → drops `skill/` into `.claude/skills/impeccable/` and `plugin/` for `/impeccable` slash commands.
2. User runs their dev server (`next dev` → `:3000`).
3. User in Claude Code chat: `/impeccable live`.
4. Agent runs `node skill/scripts/live.mjs`. This:
   - Reads/creates `.impeccable/live/config.json` (entry HTML/JSX files, insertBefore anchor, CSP rules).
   - Boots helper server on `:8400`, returns `serverPort` + `serverToken`.
   - Injects `<script src="localhost:8400/live.js">` into entry files.
   - Loads `PRODUCT.md` + `DESIGN.md` from project root.
   - Reports drift (HTML pages not covered by config).
5. Agent tells user: "open http://localhost:3000". Agent starts `node live-poll.mjs` in background (Claude Code) or foreground (Cursor/Codex).
6. User opens `:3000`. `live.js` boots, shows a small toolbar/indicator. User clicks "Pick" → hover over any element → magenta border + tag tooltip → click.
7. Floating bar opens next to element: action dropdown (polish, bolder, quieter, colorize, animate, layout, …), text input ("make it more editorial"), variant count (default 3), Go button. User can optionally annotate (strokes + comments) on a transparent overlay before going.
8. Click Go → POST `/events`. Bar switches to generating mode with animated dots and per-variant progress.
9. Agent's `live-poll.mjs` receives event → runs `live-wrap.mjs` to insert markers into the actual source file → loads matching `skill/reference/*.md` (e.g. `polish.md`) → plans 3 variants (default mode: vary hierarchy/layout/typography/color/density on different axes; departure mode: explicit re-anchor) → single edit writing all 3 variants + `<style>` block + optional 2–3 parameters.
10. Dev server HMR fires → `live.js` sees the wrapper appear → transitions to `CYCLING`. Bar shows prev/next + dots + Tune popover + Accept/Discard.
11. User cycles, opens Tune popover, drags range sliders → CSS vars update live, **no agent call**.
12. User clicks Accept → POST `/events accept` → agent's `live-accept.mjs` runs: marker block → expand range → extract chosen variant → splice source file → carbonize `@scope` rules into permanent CSS + bake parameter values. Bar shows green "Variant applied" for 2s.
13. User picks another element → loop. Eventually clicks Exit → `live-server.mjs stop` halts bridge, strips injected `<script>`, removes any leftover markers.

**Latency:** First variant arrival depends entirely on Sonnet/Opus generation speed (agent is doing a real LLM call to write the source edit). Tune-popover param adjustment is instant (CSS-only). Element pick → bar open is instant (vanilla JS). HMR reload after variant write is whatever the dev server delivers (Vite ~100–300ms typical).

## [Differentiator-Insight]

### What Impeccable does RIGHT — adopt these for wisp-design

1. **Source-file edits, not DOM patches.** Variants survive page reload, work with the user's existing HMR, end up in `git diff`. No "looks great in browser, gone on refresh" surprise. **Copy this exactly.**
2. **CSS `@scope` for safe preview.** Three variants coexist in the DOM at once with zero cross-pollution. The browser handles isolation; the agent doesn't need to maintain a sandbox.
3. **Single floating bar, three states.** No left-rail, no modal, no separate "design mode" window. The UI vanishes into the page. The state machine (PICKING/CONFIGURING/GENERATING/CYCLING) is the entire UX surface area.
4. **Parameters as CSS vars with sliders.** Once 3 variants exist, 90% of refinement is param tuning — which means **zero agent round-trips** for fine-tuning. This is the killer feature; it makes the loop feel instant.
5. **Long-poll over plain HTTP, not WebSockets.** Trivial to debug with curl, no reconnect logic, plays nice with corporate proxies. The SSE channel handles server-push for variant arrival; everything else is GET/POST.
6. **Token-gated localhost endpoints + path-traversal guards.** Security model is simple and correct for a dev-only tool. Don't reinvent.
7. **Reversible injection.** `<script>` insertion and CSP patching are byte-for-byte reversible, with original CSP preserved in a data-attribute. Adopt this — it makes "uninstall" trivial and trustworthy.
8. **Harness-aware execution policy.** Background poll on Claude Code, foreground on Cursor/Codex — codified, not improvised. wisp-design should ship a similar policy matrix.
9. **`live-wrap` fallback for generated/runtime-injected elements.** When the element lives in a built bundle or a runtime-`createElement`, the agent falls back to editing the **served** file and on accept manually extracts into true source. Acknowledges that the source-edit ideal isn't always reachable.
10. **No Chrome extension required.** Just a `<script>` tag injected into the dev page. Zero install friction; works on any browser; survives incognito; CI-friendly.

### Where Impeccable is WEAK — wisp-design should beat them here

1. **Only one element at a time.** The state machine is single-selection. Can't pick "header + 3 cards" and ask for a coherent redesign. Wisp-design should support **multi-element selection with shared context** (and probably "page-level" mode that gives the agent the full DOM as context but lets it write multi-file edits).
2. **No undo beyond accept/discard.** Once accepted, the variant is in the source file; reverting means a git operation or a fresh `/impeccable live` cycle. Wisp-design should ship a **per-session edit stack** with first-class undo/redo across the entire live session, persisted to a `.wisp/sessions/<id>.jsonl` log.
3. **Three variants, always.** Hard-coded count is fine for polish, wrong for explore. Wisp-design should support **adaptive variant counts** (1 for refine, 5–8 for explore) and a "morph between two variants" mode driven by an interpolation param.
4. **No design-system inference during pick.** The agent reads DESIGN.md if you wrote one, otherwise it guesses from computed styles. Wisp-design should run a **first-time design-token extraction pass** (sample computed styles of representative elements, cluster into a token system, write to `.wisp/design-tokens.json`) so even projects without a design system get grounded variants.
5. **Markdown skill files for variant policy = slow to iterate.** Every change to "how the agent plans variants" is a markdown edit + harness reload. Wisp-design should let the agent **propose policy diffs from the live session itself** ("this project always wants more spacing; add to .wisp/policy.md?") with one-click accept.
6. **CSS-only variants.** All 3 variants share the same DOM children; differences are styling + optional structural rewrap inside the marker. No way to express "this variant uses a completely different component tree" without falling back to source edit and losing the cycle/tune UX. Wisp-design should support **structure-variant mode** where each variant is a distinct JSX subtree, with the cycle UX trading off param-tuning depth.
7. **No collab / multi-cursor.** Single user, single browser tab. Wisp-design could add **shareable session URLs** (the bridge already has token auth — extend to multi-client SSE fanout) so a designer + dev can co-pilot.
8. **Annotations are PNG uploads, not structured input.** Strokes/comments are flattened to a PNG sent to `/annotation`. The agent sees an image, not "user circled the padding around the title." Wisp-design should ship **structured annotations** (`{target: selector, kind: 'padding'|'color'|'size'|'content', note}`) so the agent has discrete signals.
9. **Bridge port is fixed default `:8400` with no discovery.** Conflicts with anything else using that port. Wisp-design should pick a free port and write it to `.wisp/live/port.lock`.
10. **No replay / no audit trail.** A session is ephemeral; there's no "show me every variant the agent generated this afternoon and which I accepted." Wisp-design should persist every event/variant to a session log and ship a `wisp design history` viewer — also great for fine-tuning a project-specific design model later.
11. **Chrome extension is dead weight for the live use case.** They built a separate MV3 extension that overlaps cognitively with `/impeccable live` (both deal with the rendered page) but does anti-pattern scanning only. Confusing positioning. Wisp-design should pick ONE bridge model and stick with it.
12. **No "explain the variant" affordance.** The agent generates 3 variants; the user has to read CSS to understand *why* each differs. Wisp-design should attach a 1-sentence rationale per variant (returned in the SSE payload, shown on hover in the cycle UI).

### What's missing entirely from Impeccable

- **Component-library awareness.** No knowledge of shadcn/Radix/MUI/Tailwind component boundaries. Variants are CSS edits, not "swap Button variant=outline for variant=ghost." Wisp-design should detect the component library and prefer prop-level edits over CSS overrides.
- **Mobile/responsive preview.** The bar lives in whatever viewport the user has open. No "preview at 375px" affordance. Wisp-design should ship per-variant responsive previews (postMessage-driven iframe trio at 375/768/1280).
- **Accessibility delta.** Generating a variant doesn't surface "this changed contrast from 7.1 to 3.8." wisp-design should run an a11y diff on each variant and badge it in the cycle UI.
- **A11y-blocking accept.** No way to say "refuse to accept if contrast drops below AA." Wisp-design should make this a per-project policy.
- **Hot-reload-less framework support.** Pure-static-HTML projects work, but anything without HMR (raw PHP, Rails default, etc.) has no automatic refresh. Wisp-design's bridge should ship an optional **manual refresh signal** via SSE for these cases.

## [License-Marktsignal]

| Field | Value |
|---|---|
| License | Apache-2.0 (skill heritage from Anthropic's frontend-design) |
| Stars | 29,384 |
| Forks | 1,597 |
| Created | 2025-11-16 |
| Last push | 2026-05-18 |
| Last update | 2026-05-21 |
| Repo size | 31.3 MB |
| Primary language | JavaScript (93.2%) |
| npm package | `impeccable` (v2.1.9 in repo; plugin v3.1.1) |
| Plugin manifest | `plugin/.claude-plugin/plugin.json` declares Claude Code plugin |
| Author | Paul Bakaus (paul@paulbakaus.com) |
| Homepage | https://impeccable.style |
| Topics on GitHub | none set |

**Reading the signal.** 29k stars in 6 months, very active (push within last week), 11 harness integrations shipped — this is the breakout design tool for AI coding agents right now. The bulk of the stars are for the **skill pack**, not the live editor (the live mode is recent and only mentioned once in the README — "Visual variant mode: iterate on elements in the browser"). The market is hungry; the live-edit surface is **under-marketed and under-developed inside the repo itself**. wisp-design's wedge: make the live editor the headline product, not a footnote.

License is Apache-2.0 — we can study, fork, take inspiration freely. Attribution required. Skill content is derived from Anthropic's frontend-design skill (further upstream Apache-2.0).

## [Verdict-for-wisp-design]

### Take from Impeccable (proven, copy the pattern)

- Local HTTP+SSE bridge on a fixed-port localhost server; long-poll for agent→server work pickup.
- `<script>` injection into dev-server entry files, byte-for-byte reversible, with CSP auto-patch.
- Source-file edits via marker-bounded line-range splice; no patch files, no DOM-only mutations.
- CSS `@scope`-based variant coexistence so multiple options render simultaneously without cross-talk.
- Single floating bar with explicit state machine (PICKING/CONFIGURING/GENERATING/CYCLING).
- Parameters-as-CSS-vars with sliders for zero-roundtrip refinement after generation.
- Token-gated endpoints, UUID event IDs, path-traversal guards on `/source`.
- Harness execution policy table (background vs foreground poll).
- Claude Code integration via native plugin + skill, agent invokes `.mjs` scripts via Bash. No MCP server needed for the live loop.

### Improve on Impeccable (clear wins)

- Multi-element selection + page-mode.
- Per-session edit stack with cross-cycle undo/redo persisted to JSONL.
- Adaptive variant counts + "morph between" mode.
- First-time design-token extraction so projects without DESIGN.md still get grounded variants.
- Structured annotations (typed signals) instead of PNG flatten.
- Auto-port discovery + lockfile.
- Session replay / history viewer.
- Per-variant a11y delta + contrast/AA gating policy.
- Per-variant 1-sentence rationale in the SSE payload.
- Component-library-aware edits (shadcn/Radix/MUI/Tailwind variants by prop, not CSS overrides).
- Per-viewport responsive preview trio.
- Manual-refresh SSE signal for non-HMR frameworks.

### Reject from Impeccable

- Separate Chrome extension for design work — confuses positioning. wisp-design = one bridge model.
- Markdown-only variant policy that requires reload to iterate. Ship in-session policy proposal flow.
- Fixed 3-variant count and CSS-only variant scope. Make both modes available.

### Open questions (need decisions before build)

- **Bridge transport.** Stick with HTTP+SSE+long-poll (proven, debuggable) or upgrade to WebSocket for lower latency on the variant-arrival path? Recommendation: keep SSE, it's enough.
- **Source-edit safety on non-HMR projects.** What's the contract when a user is editing PHP/Rails without HMR? Manual-refresh signal is one answer; "Wisp also injects a tiny live-reload" is heavier but more seamless.
- **Variant policy storage.** `.wisp/policy.md` (human-editable) vs `.wisp/policy.json` (structured)? Probably both: structured for the agent, markdown wrapper for readability.
- **Authoring boundary with existing design systems.** When `tailwind.config.ts` or a tokens file is present, do we prefer editing it over inline overrides? Recommendation: yes, gated by a per-project flag, default on.

### Concrete files to mirror-study before implementing

(All Apache-2.0 — read freely, don't copy verbatim.)

- `skill/scripts/live.mjs` — entry orchestrator (boot, inject, drift detect).
- `skill/scripts/live-server.mjs` — bridge server (HTTP+SSE, token, endpoints).
- `skill/scripts/live-poll.mjs` — agent-side long-poll loop with 270s slicing.
- `skill/scripts/live-wrap.mjs` — marker insertion into source files.
- `skill/scripts/live-accept.mjs` — line-range splice + carbonize.
- `skill/scripts/live-inject.mjs` — reversible `<script>` injection with CSP patch.
- `skill/scripts/live-browser.js` — the in-page runtime (state machine, picker, floating bar).
- `skill/reference/live.md` — the variant-generation prompt the agent runs.
- `tests/live-*.test.mjs` — the contract tests; they encode the invariants better than any docs.
- `plugin/.claude-plugin/plugin.json` — Claude Code plugin manifest shape (skills-only plugin, no hooks/commands declared at plugin level; commands come from skill).

### Decision recap

Build wisp-design as: **a Claude Code plugin** (`.claude-plugin/plugin.json`) that ships **slash commands + a skill + scripts**, with a **local HTTP+SSE bridge** and **injected in-page runtime** — the Impeccable architecture — and differentiate on multi-select, undo stack, token-extraction, structured annotations, component-library awareness, and session replay. Do not build a Chrome extension. Do not build an MCP server for the live loop. Do not invent a new transport.
