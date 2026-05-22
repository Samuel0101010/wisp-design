# wisp-design — Build Configuration

Claude-Code-Plugin für Live-Frontend-Design mit Verification-Gate. Source-edit-based variant-loop (click element → 3 distinct variants → tune via slider → a11y-gated accept → write tailwind.config). Encodiert Samuels Vault-Wissen + UI-UX-Pro-Max-Corpus + Huashu-Anti-Slop-Doktrin als integrierten Skill-Korpus.

**Grundlage:** `research/synthesis.md`. Diese Datei ist die Build-Steuerung — jede Entscheidung dort ist hier verbindlich.

## Mission

User klickt Element im laufenden Dev-Server an → freitext-Prompt → **3 distincte Varianten** in echtem HMR sichtbar → Parameter-Slider ohne Agent-Roundtrip → **Verification-Gate** (a11y-Diff + Multi-Viewport-Screenshot + console-clean + contrast-AA + Anti-Slop-Linter) → Accept = `fs.writeFileSync` Source-File-Splice → Carbonize CSS @scope → done.

**Differentiator gegen Impeccable** (29.4k★): 15 dokumentierte Improvements (multi-select, undo-stack, design-token-extract, structured annotations, component-lib-aware, session-replay, a11y-gating, viewport-trio, per-variant-rationale, auto-port-discovery, in-session-policy-proposal, structure-variant-mode, multi-cursor, manual-refresh, morph-mode).
**Differentiator gegen alle anderen:** einziges Tool mit Verification-Gate vor Accept. UI-UX-Pro-Max stops at "generated text"; Onlook/Stagewise stop at "wrote to file"; nur wisp-design blockt accept bei AA-violation.

## Build-Roadmap (8 Phasen)

### Phase 0 — Scaffolding & Manifest

- [x] `package.json` mit `tsup`, `zod`, `vitest`, `@types/node@20`, ESM
- [x] `tsconfig.json` strict
- [x] `tsup.config.ts` → single bundled `dist/index.js`
- [x] `.claude-plugin/plugin.json` (repository=**string**, hooks 3-layer schema — siehe global CLAUDE.md)
- [x] `.claude-plugin/marketplace.json` (plugins[].source als **object** `{source:"github",repo:"..."}`)
- [x] `hooks/hooks.json` (3-Layer-Shape mit matcher-envelope)
- [x] `commands/wisp-design.md` als Top-Level-Command
- [x] `LICENSE` MIT
- [x] `.gitignore` (siehe `wisp-design/.gitignore`; **dist/ NICHT ignored**)
- [x] `wisp-design doctor` CLI gibt OK zurück
- [x] gh repo create wisp-design --private + initial commit + push + tag v0.1.0-prerelease

### Phase 1 — Local Bridge Server

- [ ] `src/bridge/server.ts` — Plain Node HTTP + SSE auf auto-port
- [ ] `src/bridge/port-discovery.ts` — finde freien Port, schreib `.wisp/live/port.lock`
- [ ] `src/bridge/auth.ts` — Token (UUID) + Path-Traversal-Guard auf `/source`
- [ ] Endpoints: `GET /live.js`, `GET /design-system.json?token=X`, `GET /source?token=X&path=…`, `POST /events`, `GET /events?token=X` (SSE), `GET /poll?token=X&timeout=270000&leaseMs=…`, `POST /poll`, `POST /annotation`, `GET /health`, `GET /status`, `GET /stop`
- [ ] `src/bridge/csp.ts` — auto-patch CSP für dev-mode (`data-wisp-csp-original` für reversibel-remove)
- [ ] Unit-Tests: token-required, path-traversal-blocked, long-poll-slicing (270s cap)
- [ ] tag v0.2.0-prerelease + push

### Phase 2 — Browser Runtime (live.js)

- [ ] `src/browser/state-machine.ts` — IDLE → PICKING → CONFIGURING → GENERATING → CYCLING
- [ ] `src/browser/picker.ts` — `document.elementFromPoint` + `pickable()` Predikat (≥20×20, exclude eigene UI)
- [ ] `src/browser/floating-bar.ts` — single bar, 3 Modes (configure / generating / cycling)
- [ ] `src/browser/variant-render.ts` — CSS `@scope` cycling, display-toggle
- [ ] `src/browser/parameter-sliders.ts` — bind range/steps/toggle zu CSS-Vars (zero-roundtrip)
- [ ] `src/browser/annotations.ts` — strukturierte annotations `{target,kind,note}` (NICHT PNG-flatten)
- [ ] `src/browser/multi-select.ts` — ⌘-click-add für Multi-Element (Improvement #1)
- [ ] Bundle als `live.js` IIFE via tsup (kein React)
- [ ] Manual-Test: pick element auf `next dev`, sieh bar erscheinen, dummy-cycle 3 variants
- [ ] tag v0.3.0-prerelease + push

### Phase 3 — Source-Edit Engine

- [ ] `src/source/inject.ts` — `<script src=…/live.js>` reversibel injizieren (byte-equivalence-Test)
- [ ] `src/source/wrap.ts` — Marker `wisp-variants-start`/`-end` + `<style data-wisp-css="SESSION">` Block
- [ ] `src/source/accept.ts` — `findMarkerBlock` + `expandReplaceRange` + `extractVariant` + `fs.writeFileSync` Line-Range-Splice
- [ ] `src/source/carbonize.ts` — `@scope` → permanent selectors + Param-Werte baken
- [ ] `src/source/safety.ts` — refuse-edit auf generated/built files; fallback `agent-driven`
- [ ] `src/source/undo-stack.ts` — Per-Session `.wisp/sessions/<id>.jsonl` Logger (Improvement #2)
- [ ] Vitest Contract-Tests: inject+remove byte-equivalent; accept-variant erzeugt valides JSX
- [ ] tag v0.4.0-prerelease + push

### Phase 4 — Agent-Loop + Skill-Korpus

- [ ] `src/agent/poll-loop.ts` — Long-Poll-Schleife mit 270s slicing, ack-pattern
- [ ] `skills/wisp-design/SKILL.md` — Auto-Trigger-Pattern (Anthropic Skills Standard)
- [ ] `skills/reference/live.md` — Variant-Generation-Prompt (3 distincte Axes: hierarchy / layout / typography / color / density)
- [ ] `skills/policy/anti-slop.md` — Vault Hard-Bans als Linter-Regeln (siehe `research/vault-obsidian.md` Section "Goldnuggets #1")
- [ ] `skills/data/anchors/` — 13 Variant-Anchors (Linear/Stripe/Anthropic/Aceternity/Apple + Open-design's 5 OKLch + 3 weitere aus Vault)
- [ ] `skills/data/directions/` — Huashu's 20+ Design-Directions imports (MIT, mit Attribution)
- [ ] `skills/data/corpus/` — UI-UX-Pro-Max 14 CSVs forken (MIT, mit Attribution) + HNSW-indexieren via ruflo `agentdb_pattern-store`
- [ ] `skills/methodology/narrative-questions.md` — 4 Pre-Code-Fragen (Role / Distance / Temperature / Capacity)
- [ ] `skills/methodology/junior-designer-flow.md` — 4-Phasen Stub→Checkpoint→Fill→Verify
- [ ] `skills/methodology/brand-asset-5-10-2-8.md` — Brand-Asset-Protocol
- [ ] E2E: real `/wisp-design live` auf Test-Projekt → 3 variants gerendert, jede mit 1-Satz-Rationale in SSE-Payload
- [ ] tag v0.5.0-prerelease + push

### Phase 5 — Verification-Gate (USP)

- [ ] `src/verify/anti-slop-linter.ts` — Hard-Bans (em-dash-UI, gradient-text, glassmorphism-default, hero-metric-template, side-stripe, purple-blue-gradient, generic-AI-illustrations, ...)
- [ ] `src/verify/a11y-axe.ts` — axe-core delta zwischen pre/post Variant + AA-block-policy
- [ ] `src/verify/console-scan.ts` — pattern `error|warn|fail|exception` nach HMR-wait 2s
- [ ] `src/verify/multi-viewport.ts` — Screenshot-Trio 375/768/1280/1920 + Light+Dark via Playwright (optionalDep nur für CI)
- [ ] `src/verify/tab-order.ts` — focus-trap-leak smoke
- [ ] `src/verify/reduced-motion.ts` — diff render mit prefers-reduced-motion
- [ ] `src/verify/gate.ts` — orchestrator, parallel, p95 ≤ 3s, block-or-warn-policy
- [ ] Default-Strenge: **warn**. `--strict` für hard-block. Override-Tastenkürzel mit Log-Eintrag.
- [ ] Acceptance-Test: bad-contrast → accept blocked + rule-citation
- [ ] tag v0.6.0-prerelease + push

### Phase 6 — Session-Replay + Component-Lib-Awareness

- [ ] `src/session/logger.ts` — append-only `.wisp/sessions/<id>.jsonl` (events, variants, decisions, verify-scores)
- [ ] `commands/wisp-design-history.md` — Viewer/Replay-Command
- [ ] `src/agent/component-detect.ts` — detect shadcn/Radix/MUI/Tailwind → prefer prop-edits über CSS-overrides (Improvement #11)
- [ ] `src/source/structure-variant-mode.ts` — `--structural` flag → JSX-subtree-variants statt CSS-only (Improvement #6)
- [ ] `src/agent/policy-proposal.ts` — in-session "this project always wants more spacing — add to .wisp/policy.md?" Flow (Improvement #5)
- [ ] `src/agent/morph-mode.ts` — Interpolation zwischen 2 Variants via Slider (Improvement #3)
- [ ] tag v0.7.0-prerelease + push

### Phase 7 — Launch

- [ ] README.md mit GIF (Pick → 3 variants → Tune → Accept → AA-block-demo)
- [ ] docs/architecture.md — full diagram, sources & sinks
- [ ] docs/comparison.md — Impeccable / Stagewise / Onlook / v0 / Lovable / Claude Design table
- [ ] CI: Linux/Windows/macOS × Node 20+22 matrix
- [ ] gh repo edit --visibility public
- [ ] gh release create v1.0.0 (kein prerelease)
- [ ] HN-Post + X-Thread + Twitter-Image
- [ ] Status-Tracking-Tabelle (unten) finalisieren

## Hook-Choreographie & Slash-Commands

| Hook / Command | Wann | Was es tut |
|---|---|---|
| `/wisp-design init` | Projekt-Setup | scan Stack, schreibe `.wisp/brand-spec.json`, extract design-tokens, frage 4 Narrative Questions |
| `/wisp-design live` | Live-Mode | boot bridge, inject script, start poll-loop, "open localhost:PORT" |
| `/wisp-design audit` | Pre-Commit-Gate | run Anti-Slop-Linter + a11y-axe-delta auf changed files |
| `/wisp-design history` | Session-Review | render `.wisp/sessions/<id>.jsonl` als interactive viewer |
| `/wisp-design tokens extract` | Design-Token-Init | sample computed-styles, cluster → `.wisp/design-tokens.json` |
| `/wisp-design sync --from "<vault-path>"` | Vault → Plugin | sync neue Pattern-Docs aus Samuels Vault in Skill-Korpus |
| `UserPromptSubmit` Hook | bei "new page"/"new screen" keywords | inject 4 Narrative Questions als Pre-Code-Gate |
| `PostToolUse` Hook (after Edit/Write auf .tsx/.jsx/.svelte/.vue) | jede UI-Source-File-Edit | append zu Session-Log; trigger HMR-wait + console-scan |
| `Stop` Hook | vor Final-Antwort | run Verification-Gate; block stop bei AA-fail (im `--strict`-Mode) |

**Wichtig:** Im `--strict` Mode blockt `Stop` mit `permissionDecision: "block"` und Citation der gebrochenen Regel — wie wisp-receipt. Default `warn` damit Plugin nicht intrusive ist.

## Tech-Stack

```
plugin manifest:    .claude-plugin/plugin.json + marketplace.json (v3.x schema)
build:              tsup → dist/index.js (committed; plugin-clone hat keinen build step)
language:           TypeScript strict, ESM
browser runtime:    Vanilla JS bundle live.js (kein React, < 50kb)
bridge:             Plain Node HTTP + SSE, no Express, no WebSocket
transport:          Long-Poll (270s slice wegen Node fetch 300s cap)
hot-path budget:    p95 ≤ 3s (LLM-generate) + ≤ 1s (verification parallel)
skill corpus:       Markdown + CSV in skills/, indexed via ruflo agentdb-HNSW
verification:       axe-core (a11y), Playwright (optionalDep für screenshot), custom linter
persistence:        .wisp/ projekt-lokal (sessions/, brand-spec.json, tokens.json, policy.md, live/port.lock)
distribution:       /plugin marketplace add Samuel0101010/wisp-design
                   /plugin install wisp-design@wisp
license:            MIT
```

## Projektstruktur

```
wisp-design/
├─ .claude-plugin/
│  ├─ plugin.json
│  └─ marketplace.json
├─ commands/
│  ├─ wisp-design.md            (top-level mit subcommands live/init/audit/history/tokens/sync)
│  └─ ...
├─ hooks/
│  └─ hooks.json                (UserPromptSubmit / PostToolUse / Stop)
├─ skills/
│  ├─ wisp-design/SKILL.md      (Auto-Trigger)
│  ├─ reference/
│  │  ├─ live.md                (variant-generation prompt)
│  │  ├─ polish.md / bolder.md / quieter.md / colorize.md / animate.md / layout.md
│  │  └─ accept.md / discard.md
│  ├─ policy/
│  │  ├─ anti-slop.md           (Vault Hard-Bans)
│  │  └─ verification-gate.md
│  ├─ methodology/
│  │  ├─ narrative-questions.md
│  │  ├─ junior-designer-flow.md
│  │  └─ brand-asset-5-10-2-8.md
│  └─ data/
│     ├─ anchors/               (13 Variant-Anchors)
│     ├─ directions/            (Huashu's 20+, MIT attr)
│     ├─ corpus/                (UI-UX-Pro-Max 14 CSVs, MIT attr)
│     └─ patterns/              (Samuels 80+ pattern-docs synced via `wisp-design sync`)
├─ src/
│  ├─ index.ts                  (CLI: doctor, install, verify-spec, history)
│  ├─ bridge/                   (server, port-discovery, auth, csp)
│  ├─ browser/                  (state-machine, picker, floating-bar, variant-render, parameter-sliders, annotations, multi-select)
│  ├─ source/                   (inject, wrap, accept, carbonize, safety, undo-stack)
│  ├─ agent/                    (poll-loop, component-detect, policy-proposal, morph-mode)
│  ├─ verify/                   (anti-slop-linter, a11y-axe, console-scan, multi-viewport, tab-order, reduced-motion, gate)
│  ├─ session/                  (logger, replay-viewer)
│  ├─ contracts/                (pure-TS types shared across layers — Open-design pattern)
│  └─ utils/
├─ tests/
│  ├─ bridge/                   (token, path-traversal, long-poll)
│  ├─ source/                   (inject-roundtrip, accept-splice, carbonize)
│  ├─ verify/                   (each rule + gate-orchestration)
│  └─ e2e/                      (real next-dev variant cycle)
├─ docs/
│  ├─ architecture.md
│  └─ comparison.md
├─ dist/                        (committed!)
├─ research/                    (synthesis + 6 research files; NICHT in npm-publish)
├─ .gitignore
├─ LICENSE                      (MIT)
├─ README.md
└─ CLAUDE.md                    (this file)
```

## GitHub-Workflow

**Regeln:**
- Repo bleibt **privat** bis v1.0.0 (`gh repo create wisp-design --private`).
- Pro Task: `git commit` + `git push`. Conventional Commits.
- Pro Phase: `gh release create v0.X.0 --prerelease` mit Release-Notes.
- Launch (Phase 7 grün): `gh repo edit --visibility public` + `gh release create v1.0.0` (kein prerelease).
- NIE `--no-verify`. NIE `git push --force` auf main.

## Quality-Gates

| Gate | Phase | Check |
|---|---|---|
| Plugin-Schema-Validity | 0 | manuell `/plugin install` auf clean machine (NICHT plugin-dev:plugin-validator subagent — der hat stale schemas) |
| Inject-Roundtrip-Byte-Equiv | 3 | vitest contract test |
| Long-Poll-Slicing-Edge | 1 | vitest mit 280s timeout simuliert |
| Variant-Render-Isolation | 2 | manual: 3 variants gleichzeitig im DOM, kein bleed |
| Verification-Gate-p95 | 5 | benchmark < 3000ms auf medium project |
| Anti-Slop-False-Positive-Rate | 5 | < 5% bei 100 echten Component-Samples |
| Hot-Path-Stop-Hook-p99 | 5 | < 100ms (siehe wisp-receipt: Stop-Hook ist non-blocking-für-User) |

## First-Session-Quickstart (für neue Claude-Code-Session in diesem Ordner)

```bash
# 1. Ruflo recall vor jedem Task
mcp__ruflo__memory_search { query: "wisp-design", namespace: "patterns" }
mcp__ruflo__agentdb_pattern-search { query: "live-frontend-edit source-splice" }
mcp__ruflo__hooks_route { task: "<aktueller-task>" }

# 2. Phase 0 starten
# Lies research/synthesis.md komplett.
# Lies research/repos/impeccable.md — Sections [Mechanism] + [Tech-Stack] sind kritisch.
# Schau dir wisp-receipt/ als Form-Factor-Vorbild an.
# Erstelle package.json, tsup.config.ts, .claude-plugin/plugin.json, marketplace.json,
# hooks/hooks.json, LICENSE (MIT), commands/wisp-design.md, src/index.ts (CLI mit doctor).
```

## Anti-Patterns (was wir NICHT tun)

- ❌ Chrome-Extension separat (wie Impeccable's `extension/`) — confuses Positioning
- ❌ Electron-Desktop + SQLite-Daemon (open-design Pattern) — falsche Form für CC-Plugin
- ❌ Eigener Canvas / Sandbox (v0/Lovable Pattern) — wir editieren echte source files
- ❌ Python+BM25-Korpus-Search (UI-UX-Pro-Max Pattern) — wir nehmen AgentDB+HNSW
- ❌ WebSocket-Transport — Long-Poll ist debuggable und reicht (Impeccable-proven)
- ❌ AGPL-Lizenz (Stagewise Pattern) — adoption-kill
- ❌ Fixed-Port `:8400` (Impeccable Pattern) — wir auto-discoveren mit Lockfile
- ❌ PNG-Flatten-Annotations (Impeccable Pattern) — wir machen strukturierte `{target,kind,note}`
- ❌ Hardcoded 3-Variants (Impeccable Pattern) — adaptive 1/3/5/8 + morph-mode
- ❌ Markdown-only Policy mit Reload-Iteration (Impeccable Pattern) — in-session proposal-flow
- ❌ Single-Element-Selection (Impeccable Pattern) — multi-select via ⌘-click
- ❌ `--no-verify` git commit — NIE
- ❌ `git push --force` auf main — NIE
- ❌ npx-fetch in Hook-Commands — `node "${CLAUDE_PLUGIN_ROOT}/dist/index.js"` stattdessen
- ❌ "fertig"-Meldung ohne Verification-Gate-Pass — NIE (das ist literally der USP)

## Status-Tracking

| Phase | Status | Tag | Notes |
|---|---|---|---|
| 0 — Scaffolding & Manifest | completed | v0.1.0-prerelease | Doctor 7/7 OK; smoke tests green; dist 9.7 kB; private repo at Samuel0101010/wisp-design |
| 1 — Local Bridge Server | pending | — | — |
| 2 — Browser Runtime (live.js) | pending | — | — |
| 3 — Source-Edit Engine | pending | — | — |
| 4 — Agent-Loop + Skill-Korpus | pending | — | — |
| 5 — Verification-Gate (USP) | pending | — | — |
| 6 — Session-Replay + Component-Lib-Awareness | pending | — | — |
| 7 — Launch | pending | — | — |

## References

- **Synthesis:** `research/synthesis.md` (zentrale Entscheidungs-Matrix, MUST READ FIRST)
- **Impeccable Architektur:** `research/repos/impeccable.md` Sections [Mechanism], [Tech-Stack], [Verdict-for-wisp-design]
- **UI-UX-Pro-Max Corpus:** `research/repos/ui-ux-pro-max.md` Sections [Design-Knowledge-Corpus], [Templates-Examples]
- **Huashu Doktrin:** `research/repos/huashu-design.md` (Anti-AI-Slop, 5-Dim Critique)
- **Open-design Brand-Spec:** `research/repos/open-design.md` Sections [9-section schema], [5 OKLch presets]
- **Samuels Vault-Goldnuggets:** `research/vault-obsidian.md` Sections [Goldnuggets], [Empfohlene-Adoption]
- **Marktlücke + USPs:** `research/competitive-landscape.md` Sections [Marktlücke], [USPs-für-wisp-design], [Anti-Patterns]
- **Plugin-Schema-Gotchas:** `C:\Users\samue\.claude\CLAUDE.md` Section "Claude Code plugin schema (verified end-to-end)"
- **Wisp-Form-Factor-Vorbild:** `../wisp-receipt/CLAUDE.md` (Build-Roadmap-Pattern), `../wisp-agentdiff/README.md` (Launch-fertiger Stil)
