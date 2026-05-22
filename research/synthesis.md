# wisp-design — Synthesis & Decision Matrix

Konsolidierung aller 6 Research-Quellen. Diese Datei ist die Entscheidungsgrundlage für CLAUDE.md (Build-Roadmap) und README.md (Launch-Vision). Stand: 2026-05-22.

## Executive Summary

**Was wir bauen.** Ein Claude-Code-Plugin namens `wisp-design`. Live-Frontend-Edit-Loop nativ in CC: User klickt Element im laufenden Dev-Server an, beschreibt freitext was sich ändern soll, bekommt **3 distincte Varianten** sichtbar im echten HMR (nicht im fake-Canvas), tunet Parameter via Slider ohne Agent-Roundtrip, akzeptiert → Source-File-Splice via `fs.writeFileSync`. Vor jedem "fertig"-Signal: **Verification-Gate** (a11y-Diff, Multi-Viewport-Screenshot, console-clean, contrast-AA). Das gesamte Design-Wissen aus Samuels Vault + die kuratierten Corpora von UI-UX-Pro-Max und Huashu sind als Skill-Files mitgeshippt.

**Warum wir gewinnen.** Wir sind das einzige Tool das (a) den Live-Loop hat **als CC-Plugin** statt standalone, (b) den Verification-Loop hat (kein Wettbewerber schließt ihn), (c) Anti-Slop-Hard-Bans als gating rule encodiert (alle anderen ship soft guidance), (d) Component-Library-aware editiert (shadcn/Radix Prop-Edits statt CSS-Overrides), (e) per-Session undo-stack + replay-log hat.

**Wovor wir uns positionieren.** **Anthropic's "Claude Design"** (Opus-4.7-powered, frontend-design Skill mit 760k Installs) ist die ernste Bedrohung — nicht v0/Lovable. Wir positionieren uns als **engineer-facing, local, source-edit-first complement**, nicht als Canvas-Designer. Claude Design ist konzeptionell SaaS-Designer-zentriert; wir sind plugin-im-Editor-für-Entwickler.

## Convergence Map — was alle Quellen übereinstimmend sagen

Wenn 6 unabhängige Quellen sich einig sind, ist das ein Signal mit hoher Konfidenz. Die Konvergenz hier ist auffällig:

| Pattern | Impeccable | UI-UX-Pro-Max | Huashu | Open-design | Vault | Landscape |
|---|---|---|---|---|---|---|
| **3-Variants-Default (kein Mikro-Variieren)** | ✓ hardcoded 3 | — | ✓ default | — | ✓ "3-Variants-Rule" | — |
| **Anti-Slop / Anti-AI-Default** | (implizit via skill) | — | ✓ Anti-AI-Slop-Doktrin | — | ✓ Pre-Commit-Checklist | ✓ als USP-Lücke |
| **Self-Critique-Gate (multi-dim)** | — | ✓ checklist pro style | ✓ 5-Dim Radar | ✓ 5-dim gate | ✓ Verify-Phase | — |
| **Brand-Anchor BEFORE palette** | — | ✓ 67 styles | ✓ 20+ Direktionen | ✓ 5 OKLch presets | ✓ Variant-Anchor-Map | — |
| **OKLCH / Token-System** | (via DESIGN.md) | ✓ 161 palettes | ✓ design_canvas | ✓ 9-section brand-spec | ✓ explicit | — |
| **Source-Edit, nicht DOM-Patch** | ✓ fs.writeFileSync | — | — | — | ✓ surgical-changes | ✓ Stagewise/Onlook |
| **Pre-Code-Gate (Questions vor Code)** | (configure-mode) | ✓ 4-step workflow | ✓ Four-Position | ✓ discovery form | ✓ 4 Narrative Questions | — |
| **Reference-App-Anchors als Pflicht** | — | (implizit) | ✓ Showcase | ✓ presets | ✓ explicit (höchster Quality-Lift) | — |

**Lesehilfe.** Die Spalten "Vault" + "Huashu" + "Open-design" sind die strengsten Anti-Slop-Quellen. "Impeccable" ist die stärkste Architektur-Quelle. "UI-UX-Pro-Max" ist der größte Daten-Korpus. "Landscape" definiert die Marktlücke. Diese 6 Konvergenz-Punkte werden **alle** zu Core-Features in wisp-design, nicht zu Optionals.

## Strategic Wedge — was wisp-design anders macht

Der Markt ist nicht leer. Aber er hat einen scharfen Lücken-Punkt:

| Akteur | Form-Factor | Live-Edit-Loop | Verification-Loop | Anti-Slop-Gate | Skill-Korpus |
|---|---|---|---|---|---|
| **Anthropic "Claude Design"** | SaaS / claude.ai | Canvas-Edit | ? unbekannt | ? unbekannt | (proprietär) |
| **v0.dev, Lovable, bolt.new** | Web-Sandbox | sandboxed | Browser-render | nein | nein |
| **Stagewise** (6.7k★, AGPL) | Standalone | ✓ source-edit | nein | nein | nein |
| **Onlook** (25.8k★, Apache-2.0) | Standalone | ✓ canvas+source | partial | nein | nein |
| **Impeccable** (29.4k★, Apache-2.0) | CC-Plugin + npm | ✓ source-edit | nein | partial (skill) | ✓ 23 commands |
| **UI-UX-Pro-Max** (81.3k★, MIT) | Skill | nein (text-output) | nein | nein | ✓ 14 CSVs |
| **Huashu-design** (14.5k★, MIT) | Skill | nein (HTML demos) | ✓ 5-dim radar | ✓ Anti-Slop | ✓ 24 refs |
| **Open-design** (49k★, Apache-2.0) | Desktop+daemon | nein (preview only) | ✓ 5-dim gate | partial | ✓ 9-section spec |
| **wisp-design** | **CC-Plugin** | ✓ source-edit | ✓ **a11y+screenshot+console** | ✓ **hard-ban linter** | ✓ Vault+UI-UX+Huashu |

**Die Wedge in einem Satz.** *Click-on-running-app → 3 source-mapped variants → tune via slider → a11y-gated accept → write tailwind.config* — als first-class Claude-Code-Plugin, mit dem über Monate kuratierten Anti-Slop-Wissen eines erfahrenen Frontend-Praktikers (Samuels Vault) als integriertem Skill-Korpus, statt als loosely-shipped Skill.

## What we adopt 1:1 (per Quelle)

### Aus Impeccable (Architektur-Bibel)

| Element | Wie wir es übernehmen |
|---|---|
| **Local HTTP+SSE Bridge** | `localhost:<auto-port>` mit Token. Port-Discovery + Lockfile (Impeccable hat fixed `:8400` — wir verbessern). |
| **Long-Poll-Transport** (`/poll?timeout=270000`) | 1:1 übernehmen. Sliced wegen Node-fetch 300s Cap. Kein WebSocket. |
| **`<script src=…/live.js>` Reversibel-Inject** | 1:1. Byte-für-Byte-reversibel, CSP-auto-patch mit `data-wisp-csp-original`. |
| **DOM-State-Machine** PICKING → CONFIGURING → GENERATING → CYCLING | 1:1. `document.elementFromPoint` + `pickable()` Predikat (≥20×20). |
| **Single floating bar** (drei Modi: configure / generating / cycling) | 1:1 als UX-Grundlage. |
| **CSS `@scope` für Variant-Coexistence** | 1:1. 3 `<div data-wisp-variant>` Siblings, `<style data-wisp-css>` Block. |
| **Parameters as CSS-Vars + Slider** | 1:1. **Killer-Feature** — Tune ohne Agent-Roundtrip. |
| **Source-File-Splice mit Markern** (`fs.writeFileSync`) | 1:1. `findMarkerBlock` + `expandReplaceRange` + `extractVariant`. |
| **Carbonize** auf Accept (CSS @scope → permanent + Param-Werte bake) | 1:1. |
| **Token-gated Endpoints + Path-Traversal-Guard auf `/source`** | 1:1. |
| **Native Plugin.json + Skills + Slash-Commands** statt MCP-Server | 1:1. CC-Plugin Form-Factor. |
| **Harness-Execution-Policy** (background vs foreground) | 1:1. Background-Poll für Claude Code. |

### Aus UI-UX-Pro-Max (Corpus + Methodik)

| Element | Wie wir es übernehmen |
|---|---|
| **14 CSVs als Skill-Datenquelle** | Forken (MIT). Konvertieren in `skills/data/*.csv` mit AgentDB+HNSW-Index. Ersetzt deren Python+BM25. |
| **(prompt, CSS, checklist, CSS-vars) Quadruple** pro Row | 1:1 als Variant-Generation-Template. Jede Row ist ein vorgemerktes Variant-Seed. |
| **`design-system/MASTER.md` + `pages/[name].md` Override-Pattern** | 1:1. Hierarchisches Token-System pro Projekt. |
| **4-Step-Workflow** Analyze → design-system → drill-down → stack | 1:1 als Wizard für `/wisp-design init`. |

### Aus Huashu (Doktrin)

| Element | Wie wir es übernehmen |
|---|---|
| **Anti-AI-Slop-Checklist** | 1:1 als Hard-Ban-Linter-Rules. Pre-Accept-Gate. |
| **5-Dim Self-Critique mit Radar** (Hierarchy / Color / Typography / Spacing / Polish) | 1:1 nach jedem Variant-Generate. SSE-Payload trägt den Score. |
| **3-Variations-Default** | 1:1 (deckt sich mit Impeccable + Vault). |
| **Junior-Designer-Workflow mit 50%-Showcase** | 1:1 als `wisp-design draft` mode (Stub-mit-Assumptions vor Vollfill). |
| **Four-Position-Questions** | Adaptiert als Pre-Code-Gate (siehe Vault: Role/Distance/Temperature/Capacity). |
| **20+ Design-Direktionen-Library** | Forken als `skills/data/directions/*.md`. |
| **Device-Frame-Components** (`ios_frame.jsx`, `design_canvas.jsx`) | Übernehmen für Multi-Viewport-Preview-Trio. |

### Aus Open-design (Brand-Schema + Architektur-Patterns)

| Element | Wie wir es übernehmen |
|---|---|
| **9-Section Brand-Spec-Schema** | 1:1 als `.wisp/brand-spec.json` Format. |
| **5 OKLch visual-direction Presets** (Editorial / Modern Minimal / Tech Utility / Brutalist / Soft Warm) | 1:1 ergänzt um Vault's 8 Variant-Anchors. |
| **Pure-TS `contracts` package** als Shared-Type-Surface | 1:1. `src/contracts/*.ts` ist die einzige Cross-Layer-Schnittstelle. |
| **SSE-Streaming Runtime → UI** | Deckt sich mit Impeccable's `/events` SSE. |
| **Sandboxed iframe `srcdoc` + React+Babel-Injection** | Adoptieren für Multi-Viewport-Preview (375/768/1280/1920). Trio läuft im Sandboxed-Iframe. |

### Aus Vault (Samuels Goldnuggets)

| Element | Wie wir es übernehmen |
|---|---|
| **Anti-Slop Pre-Commit-Checklist** (`_brain/principles/anti-slop-extensions.md`) | 1:1 als `src/verify/anti-slop.ts` Linter-Rule-Engine. Hard-Ban. |
| **4 Narrative Questions** (Role/Distance/Temperature/Capacity) | 1:1 als Pre-Code-Gate vor neuer Page. UserPromptSubmit-Hook. |
| **Variant-Anchor-Map** (Linear=Restrained-Cool, Stripe=Committed-Indigo, Anthropic=Drenched-Warm, Aceternity=Full-Palette-Neon, Apple=Cinematic) + 8 weitere | 1:1 als `skills/data/anchors/*.md`. Wahl ZUERST, Palette DANACH. |
| **Pattern → Reference-App-Backlinks als Pflicht** | 1:1. Größter Quality-Hebel (Audit 3% → 50% Coverage = größter Lift). |
| **Mathematisches Type-Scale** mit `--type-step: 1.333` | 1:1 als Token-Default in jedem neuen Projekt. |
| **Signature-Easing-Tokens** (`--ease-smooth/sharp/spring/power`) | 1:1 als CSS-Var-Defaults. Nie ad-hoc cubic-bezier inline. |
| **Junior-Designer-Flow 4-Phasen** (Stub → Checkpoint → Fill → Verify) | 1:1. Default-Mode bei Page-Creation. |
| **Brand-Asset-Protocol 5-10-2-8** | 1:1 für Brand-Tasks. Logo non-negotiable wenn existiert. |
| **Pflicht-Verifikation nach UI-Edit** (HMR-wait → console-check → Light+Dark Screenshot → 375/768/1280/1920 → reduced-motion → Tab-Order) | 1:1 als `src/verify/*.ts` Gate. Acceptance blockiert ohne pass. |
| **Stack-Default**: Next 15 + React 19 + Tailwind v4 + shadcn/ui + motion/react + lucide + rhf+zod + sonner + next-themes + cva+clsx+tailwind-merge + anime.js v4 (Multi-Element) | 1:1 als Default-Init-Profile. SvelteKit/Vite als Alternatives. |

## What we improve / reject

### Improvements über Impeccable (klare Wins, alle dokumentiert)

1. **Multi-Element-Selection** (Impeccable: nur single). "Header + 3 Cards kohärent redesign."
2. **Per-Session Edit-Stack mit Undo/Redo** in `.wisp/sessions/<id>.jsonl`. Impeccable: nur accept/discard, kein cross-cycle undo.
3. **Adaptive Variant-Counts** (1 für refine, 5-8 für explore) + **Morph-zwischen-zwei-Varianten** via Interpolation-Param. Impeccable: hardcoded 3.
4. **First-Time Design-Token-Extraction** (sample computed styles, cluster, schreibe `.wisp/design-tokens.json`). Impeccable: errät aus computed-styles wenn keine DESIGN.md.
5. **In-Session Policy-Diff-Proposals** ("dieses Projekt will mehr Spacing — zu .wisp/policy.md adden?"). Impeccable: Markdown-Edit + Harness-Reload nötig.
6. **Structure-Variant-Mode** (verschiedene JSX-Subtrees pro Variant). Impeccable: nur CSS-Varianten.
7. **Strukturierte Annotations** (`{target, kind: padding|color|size|content, note}`). Impeccable: PNG-Flatten.
8. **Auto-Port-Discovery + Lockfile** in `.wisp/live/port.lock`. Impeccable: fixed `:8400`.
9. **Session-Replay** via `wisp-design history`. Impeccable: keine Audit-Trail.
10. **Per-Variant a11y-Delta + AA-Gating** (refuse-accept wenn Contrast < AA). Impeccable: kein a11y-Awareness.
11. **Component-Library-aware Edits** (shadcn/Radix detected → prop-edit statt CSS-Override). Impeccable: nur CSS.
12. **Per-Viewport Preview-Trio** (postMessage-iframes 375/768/1280). Impeccable: aktueller Viewport only.
13. **Per-Variant 1-Sentence Rationale** in SSE-Payload. Impeccable: User muss CSS lesen.
14. **Manual-Refresh SSE-Signal** für non-HMR Frameworks (PHP/Rails). Impeccable: only HMR.
15. **Multi-Cursor / Co-Pilot Session-URLs** via SSE-Fanout (Token-Multi-Client). Impeccable: single-tab.

### Reject (was wir NICHT bauen)

| Reject | Aus | Warum |
|---|---|---|
| **Chrome-Extension separates** | Impeccable (`extension/`) | Confuses Positioning. One-bridge-model. |
| **Electron-Desktop + Daemon + SQLite** | Open-design | Falsche Form für CC-Plugin. Plugin-clone hat keinen build step. |
| **Python+BM25-Search** | UI-UX-Pro-Max | Ersetzen durch AgentDB+HNSW (ruflo). |
| **15-Harness-Multi-Target** | UI-UX-Pro-Max | Claude-Code-only. Spart Pflege. |
| **Voiceover/TTS/Video/PPTX-Pipeline** | Huashu | Falsche Output-Domäne. |
| **Eigene browser extension** | Landscape Anti-Pattern | Friction. `<script>` injection reicht. |
| **AGPL-Lizenz** | Stagewise | Adoption-Kill. Wir bleiben MIT. |
| **Ganz-Komponenten-Regen ohne Pick** | v0/Lovable Pattern | Verliert source-mapping. Pick-first. |
| **Eigener Canvas/Sandbox** | Anthropic Claude Design likely | Wir editieren echte source files im echten dev-server. |
| **Markdown-only variant policy** | Impeccable | In-Session Proposal-Flow stattdessen. |
| **Figma als Brücke** | v0/Builder | Wir sind code-first. Vault sagt: Figma kaum erwähnt. |

## The Verification-Loop USP (kein Wettbewerber hat ihn)

Vor jedem Accept-Signal läuft folgender Gate (alle parallel, ≤3s total p95):

```
HMR-fire → wait 2s
       ├─ Screenshot Light + Dark + 375 + 768 + 1280 + 1920 (6 PNGs)
       ├─ Console-Scan (pattern "error|warn|fail|exception")  → block on fail
       ├─ a11y-axe-core delta (was 7.1, now 3.8?)             → block if < AA
       ├─ Tab-Order Smoke (focus-trap-leak detect)            → warn
       ├─ Reduced-motion toggle render                         → warn if differs > epsilon
       └─ Anti-Slop Linter (Vault Hard-Bans)                  → block on fail
                                                ↓
                                     Show Score + Diff in cycling-bar
                                                ↓
                                          Accept allowed?
```

**Block-Verhalten:** Bei Block bekommt User die konkrete Regel + Quick-Fix-Vorschlag. Override per Tastenkürzel mit Log-Eintrag in `.wisp/sessions/<id>.jsonl`.

**Warum das gewinnt.** UI-UX-Pro-Max stops at "generated text." Impeccable stops at "wrote to file." Huashu hat 5-dim radar aber kein gate. Open-design hat 5-dim gate aber kein source-edit. **Niemand verbindet source-edit + a11y-block + screenshot-diff + anti-slop-lint in einem accept-gate.** Das ist defendable und konkret messbar.

## Stack & Architecture Decision

| Layer | Wahl | Begründung |
|---|---|---|
| **Plugin-Manifest** | `.claude-plugin/plugin.json` v3.x | CC-native. plugin.json schema gemäß CLAUDE.md (repository=string, hooks 3-layer). |
| **Sprache (Plugin-Code)** | TypeScript strict, ESM | Type-safety, `contracts` package pattern (open-design). |
| **Build** | tsup → single bundled `dist/index.js` | Plugin-clone hat keinen build step → dist/ committed. |
| **Bridge-Server** | Plain Node HTTP + SSE, no Express | Impeccable-pattern. Trivial-debug. |
| **Browser-Runtime** | Single bundled `live.js` (Vanilla DOM, no React) | Injection-payload muss klein sein. State-Machine. |
| **TUI/Hooks-Output** | Plain stdout JSON (kein Ink — CC-Plugins haben kein TTY) | Hooks-Outputs sind JSON-fed. |
| **Skill-Korpus-Storage** | `skills/data/*.md` + `*.csv` + AgentDB-HNSW-Index | ruflo MCP übernimmt Indexing. Statt UI-UX-Pro-Max's Python+BM25. |
| **Slash-Commands** | `/wisp-design live`, `/wisp-design init`, `/wisp-design audit`, `/wisp-design history`, `/wisp-design tokens` | Mirror Impeccable's Slash-Surface, eigenes Branding. |
| **Hot-Path** (browser-event → bridge → agent → file-write → HMR) | p95 ≤ 3s nach LLM-Generate. Verification-Gate parallel. | Live-feel ist non-negotiable. |
| **Persistence** | `.wisp/` Projekt-lokal (sessions/, brand-spec.json, design-tokens.json, policy.md, live/port.lock) | Like Impeccable's `.impeccable/`. |
| **License** | MIT | Adoption-Maximum. Stagewise ist AGPL → der Anti-Vergleich. |
| **GitHub-Workflow** | private bis v1.0.0, per-task push, per-phase pre-release | Wisp-Standard (siehe wisp-receipt CLAUDE.md). |

## Risiko-Matrix

| Risiko | Mitigation |
|---|---|
| **Anthropic "Claude Design" überlappt** | Positionierung als engineer-facing local complement (nicht SaaS-Designer). Source-edit-first ist defensible. |
| **Impeccable ist 6 Monate Vorsprung** | Wir bauen die 12 dokumentierten Lücken. Wir können Impeccable's MIT-fremde Apache-2.0 Skills nicht direkt embedden — wir bauen eigenen Korpus aus Vault + UI-UX-Pro-Max (MIT). |
| **CC-Plugin-Schema bricht** | Stick to verified schemas aus dem global CLAUDE.md. Plugin-validator subagent trauen NICHT — error-pfade trauen. |
| **Bridge-Port-Konflikt** | Auto-port-discovery + Lockfile (Improvement #8 über Impeccable). |
| **HMR-fail in non-HMR-Stacks** | Manual-refresh SSE-Signal (Improvement #14). |
| **Live-Mode + Verification-Gate ist zu langsam** | Verification parallel zur Generate (≤3s p95). Hard-Bans run in <100ms. axe-core ist Async. |
| **User-Confusion bei `wisp-design` vs `wisp-receipt`** | Klare Brand-Familie. README cross-link table (wie wisp-agentdiff README). |

## Build-Order Recommendation (Phasen 0-5)

| Phase | Inhalt | Verify-Trigger |
|---|---|---|
| **0 — Scaffold** | package.json, tsup, plugin.json/marketplace.json/hooks.json, .gitignore (dist/ committed), MIT LICENSE, gh repo create --private | `wisp-design doctor` returns OK |
| **1 — Bridge** | localhost HTTP+SSE server, /events /poll /source endpoints, token+UUID, path-traversal-guard, auto-port + lockfile | curl `/health` returns 200; long-poll-timeout-test passes |
| **2 — Live.js Browser-Runtime** | State-Machine, elementFromPoint picker, floating bar, CSS @scope variant render, parameter sliders | Manual: pick element on a `next dev` project, see bar, 3 placeholder variants render |
| **3 — Source-Edit Engine** | live-wrap (marker insert), live-accept (line-range splice + carbonize), live-inject (reversible script + CSP patch), source-edit safety (refuse generated files) | Contract test: inject+remove byte-equivalence; accept-variant test creates valid JSX |
| **4 — Agent-Loop + Skill-Korpus** | live-poll.mjs long-poll loop, variant-generation prompts in `skills/reference/live.md`, Vault-Anti-Slop encoded in `skills/policy/anti-slop.md`, 20+ design-directions imported, UI-UX-Pro-Max CSVs imported + HNSW-indexed via AgentDB | E2E: real generate-3-variants on test project; variant-rationale in SSE payload |
| **5 — Verification-Gate** | a11y-axe-delta, multi-viewport-screenshot, console-scan, anti-slop-linter, tab-order-smoke, AA-blocking-accept policy | Acceptance-Test: insert bad contrast → accept blocked with rule citation |
| **6 — Session-Replay + Polish** | .wisp/sessions/<id>.jsonl logger, `wisp-design history` viewer, per-variant rationale, component-library-detection, structured annotations | `wisp-design history` shows full session; component-lib-aware-edit-test passes |
| **7 — Public Launch** | gh repo edit --visibility public, v1.0.0 release, README mit GIF, HN-post, X-thread | Launch-Day-Verify: install via `/plugin marketplace add` works on clean machine |

## Open Decisions

1. **Multi-element selection: marquee oder ⌘-click-add?** → Recommendation: ⌘-click-add (less visual chrome, fits state machine). DECIDE in Phase 2.
2. **CSS `@scope` Variant-Mode vs Structure-Variant-Mode**: ein-Modus-default oder pro-Prompt-Toggle? → Recommendation: `@scope` default, structure-mode via flag `--structural`. DECIDE in Phase 3.
3. **Anthropic-Claude-Design Konfrontation in README**: explicit nennen oder nur implizit positionieren? → Recommendation: explicit nennen in "Why not …" Section, defensiv aber faktisch. DECIDE in Phase 7.
4. **Brand-Asset-Protokoll vs lazy Default**: Erzwingen wir die 5-10-2-8 Pflicht oder nur als opt-in? → Recommendation: opt-in via flag, aber Default-On in `brand` mode. DECIDE in Phase 4.
5. **UI-UX-Pro-Max-Forken vs Re-Building**: Direkt Fork mit Attribution oder eigene CSVs in vergleichbarem Format? → Recommendation: Fork mit MIT-Attribution, eigene Layer drauf. Spart Monate. DECIDE in Phase 4.
6. **Vault-Sync-Strategie**: Wie wandern Samuels neue Pattern-Docs in den Plugin-Korpus? Push-Script vs `wisp-design sync` command? → Recommendation: explicit `wisp-design sync --from "vault-path"` command. DECIDE in Phase 4.
7. **Verification-Gate Default-Strenge**: AA-block per default oder nur warn? → Recommendation: warn-default, hard-block opt-in via `--strict`. Conservative bei v0.X, strict bei v1.x. DECIDE in Phase 5.

## Risk-flagged Confidence Gaps (vom landscape-scout)

Vor go/no-go der Marketing-Position prüfen:

- **Stagewise→CC Bridge:** existiert ein offizielles CC-Plugin von Stagewise schon? (verified-via context7 oder gh search nötig)
- **"Claude Design" Feature-Set:** ist es Canvas-only oder hat es source-edit? (Anthropic-blog oder claude.ai/skills check)
- **Stagewise YC S25 Funding:** wenn YC-backed mit Capital → schnellere Iteration. Risk-Level: high wenn confirmed.

## Decision Recap (für CLAUDE.md)

- **Form-Factor:** Claude-Code-Plugin mit `.claude-plugin/plugin.json`, Slash-Commands, Skills, lokale HTTP+SSE-Bridge. Keine Extension, kein MCP-Server für die live-loop, kein Electron.
- **Live-Architektur:** 1:1 Impeccable's Bridge + Inject + Source-Splice + CSS @scope + CSS-Var-Parameter — mit den 15 dokumentierten Verbesserungen.
- **Design-Korpus:** Samuels Vault + UI-UX-Pro-Max CSVs (gefork-mit-Attribution-MIT) + Huashu Anti-Slop-Refs + Open-design Brand-Spec — alle als Markdown/CSV in `skills/`, AgentDB-HNSW indexiert.
- **USP:** **Verification-Gate** vor Accept (a11y + screenshot + console + tab-order + anti-slop-linter) — kein anderer Wettbewerber hat das.
- **Stack:** TypeScript strict + tsup + Node 20+ + Plain HTTP/SSE + Vanilla-JS in live.js + AgentDB (via ruflo MCP).
- **License:** MIT, private bis v1.0.0, per-Phase pre-release Tag.

Diese Synthese ist die Grundlage für `CLAUDE.md` (Build-Roadmap) und `README.md` (Launch-Vision). Alle Phasen-Inhalte und Commands sind aus den obigen Tabellen direkt ableitbar.
