# huashu-design — Analyse für wisp-design

**Repo:** https://github.com/alchaincyf/huashu-design
**Default-Branch:** `master`
**Stand:** 2026-05-22

---

## Was-es-ist

**Agent-Skill** (kein Plugin, kein CLI, kein Webapp) für Claude Code und kompatible Agents (Cursor, Trae, Hermes, OpenClaw).

- Liefert eine einzelne `SKILL.md` (Skill-Manifest mit Triggern + Instruktionen) plus Asset-, Reference-, Demo- und Script-Verzeichnisse.
- Installation: `npx skills add alchaincyf/huashu-design` (Skills-Registry-Mechanismus, nicht Claude-Code-Plugin-Schema).
- **Kein** `plugin.json`, **kein** `marketplace.json`, **kein** `hooks/`. Es ist ein Skill-File-Bundle.
- Repo-Layout (Root): `SKILL.md`, `README.md`, `README.zh.md`, `LICENSE`, `assets/`, `references/`, `demos/`, `scripts/`, `test-prompts.json`, `.env.example`.
- Sprache: zweisprachig EN/ZH. Original chinesisch, EN-Mirror gleichberechtigt.
- Tagline: *"Type. Hit enter. A finished design lands in your lap."*
- Output-Modus: **HTML als Design-Produktions-Tool** (nicht als Web-Medium) — single-file HTMLs mit inline React + Babel als Deliverable-Format, plus MP4/GIF/PPTX/PDF-Export via Node-Scripts.

## Design-Philosophie

Strikt durchnummeriertes Prinzipien-System (Priority Order in `SKILL.md`):

- **#0 Fact Verification Before Assumption** — jede konkrete Produktbehauptung muss vor Designstart per WebSearch verifiziert werden. Forbidden Phrases: "I recall", "should be", "possibly doesn't exist".
- **#1 Extract from Existing Context** — niemals generisch von null; immer aus vorhandenen Design-Systems / UI-Kits / Codebases / Brand-Screenshots ableiten.
- **#1.a Core Asset Protocol** (5-Step bei Brand-Arbeit): Ask → Search → Download → Verify → Document (`brand-spec.md`).
- **Quality Floor "5-10-2-8"**: 5 Search-Rounds, 10 Candidates, 2 Best, jeweils ≥8/10 (Resolution, Copyright, Brand-Fit, Style-Consistency, Narrative-Independence). Logo ist non-negotiable.
- **#2 Junior Designer Workflow** — Assumptions + Reasoning + Placeholders FRÜH zeigen (vor Implementation), nicht heroisches One-Shot.
- **#3 Variations Over Single Answer** — immer 3+ Varianten auf unterschiedlichen Achsen (visual / interaction / color / layout / animation).
- **#4 Honest Placeholders Beat Poor Execution** — graue Blocks + Text-Label schlagen krude SVG-Zeichnungen; Leere schlägt erfundenen Content.
- **#5 System-Driven, Not Filler-Driven** — jedes Element muss seinen Platz verdienen; "data slop" (sinnlose Stats, deko-Icons) verboten.
- **#6 Anti-AI-Slop-Checklist** (zentrales Differenzierungs-Merkmal):
  - Verboten: lila Gradients, Emoji-Icons überall, rounded-cards mit Left-Accent-Border, SVG-gezeichnete Faces/Objects, generic CSS-Cutouts statt echter Produktfotos, System-Fonts als Display, Default-GitHub-Darkmode-Aesthetic.
  - Gefordert: `text-wrap: pretty`, CSS Grid, `oklch()` Colors, intentionale Typography-Pairing, **120% Excellence auf einem Detail** (80% sonst), echte Imagery (Wikimedia, Unsplash, Met Museum API, AI-generated mit Reference).
- **Critical Rule**: Niemals CSS-Silhouetten / SVG-Hand-Drawings statt echter Produktbilder — das löscht Brand-Recognition (Case-Study: DJI Pocket 4, 2026-04-20).
- Slogan-Kern: *"Not decent for AI quality"* — zielt explizit gegen den typischen AI-Look.

Es ist also **eine ausformulierte Design-Doktrin**, kein Style-Guide. Sehr opinionated, fast manifest-artig.

## Templates-Patterns

### `assets/` — wiederverwendbare React/JS-Komponenten

| Component | Use Case |
|---|---|
| `deck_index.html` | Slide-Aggregator (multi-file Architecture, ≥10 Pages) |
| `deck_stage.js` | Slide Web-Component (single-file ≤10 Pages) |
| `design_canvas.jsx` | Side-by-Side-Varianten-Display |
| `animations.jsx` | Stage + Sprite + zeit-basierte Animation-Primitives |
| `ios_frame.jsx` | iPhone 15 Pro Bezel (Dynamic Island 124×36px, Status Bar, Home Indicator) |
| `narration_stage.jsx` | Voiceover-synced Animation-Container (NarrationStage + Scene + Cue Components) |
| `assets/showcases/` | **24 vorgebackene Showcases** (8 Scenes × 3 Styles) für Design-Direction-Advisor |

### `references/` — 24 Markdown-Doctrine-Files

Animation: `animation-best-practices.md`, `animation-pitfalls.md`, `animations.md`, `cinematic-patterns.md`.
Design: `design-styles.md` (**20 Design-Philosophien** quer durch Information-Architecture / Motion-Poetics / Minimalism / Experimental-Avant-Garde / Eastern-Philosophy), `design-context.md`.
Case-Studies: `hero-animation-case-study.md`, `multi-perspective-parallel-case-study.md`, `apple-gallery-showcase.md`, `launch-film-director-notes.md`.
Tech: `react-setup.md` (gepinnte React/Babel-Versionen, Scope-Rules), `video-export.md`, `voiceover-pipeline.md`, `scene-templates.md`, `tweaks-system.md`.
Guidelines: `content-guidelines.md`, `critique-guide.md` (**5-Dimensions Radar-Chart-Scoring**), `audio-design-rules.md`, `sfx-library.md` (**37 vorgefertigte SFX**), `workflow.md`, `verification.md`.
Slides: `slide-decks.md` (34KB — größte File), `editable-pptx.md`.

### `demos/` — 18 HTML-Demo-Files

- **Course-Serie** (C1–C6, EN+ZH): iOS-Prototype / Slides-PPTX / Motion-Design / Tweaks / Infographic / Expert-Review.
- **Workshop-Serie** (W1–W3, EN+ZH): Brand-Protocol / Junior-Designer / Fallback-Advisor.
- `hero-animation-v10-en.html`, `md-html-narration/`, `voiceover-demo/`.

### `scripts/` — 12 Production-Scripts

`html2pptx.js` (46KB — größtes File), `export_deck_pdf.mjs`, `export_deck_pptx.mjs`, `export_deck_stage_pdf.mjs`, `narrate-pipeline.mjs` (Doubao TTS), `tts-doubao.mjs`, `render-narration.sh`, `render-video.js`, `mix-voiceover.sh`, `add-music.sh`, `convert-formats.sh`, `verify.py`.

### Output-Capabilities-Matrix (aus README + SKILL.md)

| Output | Format | Timeline |
|---|---|---|
| Interactive Prototypes | Single-file HTML + Device-Bezel | 10–15 min |
| Slide Decks | HTML (default) + optional PPTX/PDF | 15–25 min |
| Motion Design | MP4 25fps→60fps interpolated + GIF + BGM | 8–12 min |
| Infographics | Print-quality PDF/PNG/SVG | 10 min |
| Design Critique | 5-Dim Radar-Chart + Punch-List | 3 min |

## Workflow

**Standard-Sequenz** (4 Checkpoints):

1. **Checkpoint 1 — Batched Clarification**: Alle Fragen vor Start (Design-System? Varianten-Anzahl? Achsen? Tweaks?).
2. **Checkpoint 2 — Asset-Verification**: Logo + Produktfotos + UI-Screens + extrahierte Colors müssen vorhanden sein, sonst pause.
3. **Checkpoint 3 — Four Position Questions** vor System-Design:
   - Narrative Role (Hero/Transition/Data/Quote/Outro)
   - Viewing Distance (10cm Phone / 1m Laptop / 10m Projection)
   - Visual Temperature (quiet/excited/calm/authoritative/warm/sad)
   - Capacity Math (passen 3 Thumbnail-Sketches ohne Overflow?)
4. **Checkpoint 4 — Show work at 50%**: Browser-Check + Playwright-Screenshot vor Delivery.

**Fallback: Design-Direction-Advisor** (8-Phase) bei vagen Anforderungen — endet mit *"I've prepared 3 directions"*, je Direction: Designer-Name + 50–100w Rationale + 3–5 visual hallmarks + 3–5 mood keywords + optional reference work. Generiert 3 parallele Visual-Demos mit User-Content. User picks/remixes/revises. Extrahiert AI-Prompt-Template.

**Specialized Workflows**:
- **Decks**: HTML-Aggregator first; Multi-file (≥10 pages) vs. Single-file (≤10 pages); ab 5 Pages zwingend 2-Page-Visual-Grammar-Showcase davor.
- **Animation**: Always-with-Audio (Pure-Animation-without-Sound = half product); 25fps→60fps→palette-optimized GIF; 6 BGM-Optionen + 37 SFX.
- **Voiceover Long-Form (5–20min Explainer)**: **Iron Rule**: one continuous motion narrative, 1–2 Hero-Elements morphen across scenes, KEIN szenenweise-Fade (= "PowerPoint with audio = zero craft"). Pipeline: script.md → narrate-pipeline.mjs (Doubao-TTS) → measured timeline.json → animation via `narration_stage.jsx` → MP4 via `render-narration.sh`.
- **iOS-Prototypes**: Single-file inline React (weil `file://` external-JS blockt; "double-click to open"-UX wichtig); Overview-flat vs. Flow-demo; `ios_frame.jsx` mandatory.

## Adoption-for-wisp-design

Das ist die wertvollste Section. wisp-design = "best live frontend design plugin ever" laut Brief. Hier was direkt übernehmbar ist:

### Direkt übernehmen (1:1 Inspiration)

1. **Anti-AI-Slop-Doktrin als Kern-Differenzierung.** Genau das, was generische Frontend-Tools nicht haben. wisp-design sollte eine eigene Anti-Slop-Liste pflegen (Tailwind-Default-Look, shadcn-Boilerplate-Aesthetic, lila Gradients, Linear-Klon-Aesthetic). Das ist der USP.
2. **5-Dimensions Critique-Mode mit Radar-Chart.** Killer-Feature für "Live"-Design-Plugin — Agent kritisiert eigene Outputs vor Delivery. Übernehmen.
3. **Junior-Designer-Workflow**: 50%-Showcase + Assumptions vorab. Passt perfekt zu "Live" — User sieht Iterationen real-time.
4. **Variations-Over-Single-Answer Default.** 3 Varianten auf unterschiedlichen Achsen statt einer "polished" Lösung. Massive UX-Verbesserung gegenüber v0/bolt/lovable.
5. **Four Position Questions vor System-Design** (Narrative Role / Viewing Distance / Visual Temperature / Capacity Math). Sehr starkes Framing-Tool — wisp-design kann das als interaktiven "Brief"-Step vor Code-Gen nutzen.
6. **Core Asset Protocol** für Brand-Arbeit (Ask→Search→Download→Verify→Document). Direkt übertragbar auf Frontend: ask for brand assets → official search → download → verify → freeze in `brand-spec.md`.
7. **20 Design-Philosophien als pickbare Direktionen** (`design-styles.md`). wisp-design braucht eigene Library — z.B. 15–25 Frontend-Direktionen (Linear-Modern, Apple-Hardware, Vercel-Brutalist, Stripe-Pro, Notion-Soft, Anthropic-Editorial, etc.) mit Designer/Studio-Reference + 3–5 Visual-Hallmarks.

### Adaptieren (Konzept ja, Output anders)

8. **Single-File-HTML-Deliverable-Pattern.** huashu nutzt single-file HTML+Babel weil `file://` keine Server braucht. Für wisp-design → single-file React/Vue/Svelte-Components, die in Stackblitz/Sandpack laufen, plus optional Next.js/Vite-Projekt-Export.
9. **Device-Frame-Components** (`ios_frame.jsx`). wisp-design braucht: iOS-Frame, Android-Frame, Browser-Chrome (Safari/Chrome/Arc), Desktop-Window (macOS/Windows-11) — für Live-Preview-Renderings.
10. **Showcase-Galerie als Cold-Start-Fallback** (24 Showcases = 8 Scenes × 3 Styles). wisp-design analog: N Component-Categories × M Style-Directions = Gallery für "ich weiß nicht was ich will"-Cases.
11. **Production-Scripts-Sammlung.** huashu hat `export_deck_pptx`, `render-video`, `mix-voiceover`. wisp-design Pendants: `export-figma.mjs`, `export-storybook.mjs`, `render-component-gif.mjs`, `screenshot-responsive.mjs` (Playwright multi-viewport).

### Workflow-Strukturen 1:1 klauen

12. **4-Checkpoint-Pattern** (Clarify → Assets → Position-Questions → 50%-Show). Übertragbar auf jeden Frontend-Build-Loop.
13. **Iron-Rule-Mechanik**: harte, namentlich-genannte No-Gos (z.B. *"each scene has independent layout + fade-up = PowerPoint with audio = zero craft"*). wisp-design braucht analoge Iron-Rules (z.B. *"every component a flex-row of rounded-cards = shadcn-slop"*).
14. **Trigger-Keyword-Liste in SKILL.md** — exakt was Claude Code für Skill-Discovery braucht.
15. **Fallback-Matrix-Tabelle** (Unclear / User refuses clarify / Conflict / Tight deadline / Missing context → konkrete Aktion). Direkt portierbar.

### Was NICHT übernehmen

- Voiceover/TTS/Video-Rendering — irrelevant für Frontend-Plugin.
- PPTX-Export — falsche Output-Domäne.
- Doubao-TTS-Dependency — China-spezifisch, kein westliches Audience-Match.

### Schema-Hinweis (kritisch für Adoption)

huashu-design ist **kein Claude-Code-Plugin** (`.claude-plugin/plugin.json`-Schema), sondern ein **Skill via `npx skills add`**. wisp-design soll laut Brief ein **Plugin** sein → braucht andere Manifest-Struktur (siehe globale CLAUDE.md: Plugin-Schema mit `plugin.json` + `marketplace.json` + optional `hooks/hooks.json` + `commands/` + Sub-Skills via `skills/`-Subfolder). Die Doktrin von huashu-design kann als interne `skills/wisp-design.skill.md` im wisp-design-Plugin gebundlet werden.

## License-Marktsignal

- **License**: MIT (seit 2026-05-14 relizenziert von "Personal Use Restriction" auf MIT — freie Commercial-Use ohne Attribution).
- **Stars**: 14.545
- **Forks**: 1.971
- **Open Issues**: 5
- **Created**: 2026-04-19
- **Last Push**: 2026-05-21 (gestern — sehr aktiv)
- **Latest Release**: v2.0 (2026-04-21)
- **Repo Size**: 222 MB (groß — viel Asset-Material drin)
- **Sprachen**: HTML 64.3% / JavaScript 31.0% / Shell 3.5% / Python 1.2%
- **Lokalisierung**: zweisprachig EN+ZH (`README.md` + `README.zh.md`, alle 18 Demos in beiden Sprachen).

**Markt-Signal**: 14.5k Stars in **5 Wochen** seit Create-Date (2026-04-19 → 2026-05-22) ist außergewöhnlich. Das Repo trifft ein echtes Bedürfnis — *"AI macht hässliche generic Designs, ich will Craft"*. Forks-Ratio (~13.6% von Stars) ist hoch für ein Skill-Repo → Leute klauen aktiv den Doktrin-Content. License-Switch auf MIT mid-May 2026 signalisiert Author wollte breite Adoption (vorher non-commercial-restricted).

## Verdict

**Sehr starke Inspiration für wisp-design — aber andere Output-Domäne.** huashu-design ist die State-of-the-Art für **HTML-Output-Skills** (Decks, Animations, iOS-Prototypes). Die Architektur — opinionated Doktrin + Asset-Components + Reference-Library + Demo-Showcases + Production-Scripts — ist genau das Pattern, das wisp-design adaptieren sollte, nur auf Frontend-Component-Generation (React/Vue/Svelte + Tailwind/shadcn) gerichtet.

**Top-3 Take-aways**:
1. **Anti-AI-Slop-Doktrin** ist das wichtigste differenzierende Asset — wisp-design braucht eine eigene Frontend-spezifische Version (gegen Tailwind-Default-Look, shadcn-Boilerplate, lila Gradients, Linear-Klone).
2. **Junior-Designer + 50%-Showcase + 3-Variations + 5-Dim-Critique** als Default-Workflow ist UX-Goldstandard für "Live"-Design-Plugins.
3. **Asset-Components + Pre-baked Showcases + Reference-Library-Trinity** ist die richtige Repo-Struktur. wisp-design sollte das Layout spiegeln: `skills/wisp-design.skill.md` (Doktrin) + `components/` (Frame-Wrapper, Preview-Stages) + `references/` (15–25 Frontend-Stilrichtungen, Critique-Guide, Anti-Slop-Liste) + `showcases/` (N×M Gallery) + `scripts/` (Export-Tools).

**Risiko**: Doktrin-Tonalität ist sehr stark ("never", "forbidden", "iron rule"). Funktioniert weil Skill-File-Form Tokens billig macht. Bei Plugin mit Hooks/Slash-Commands muss die Doktrin in kompakterer Form in die Skill-Files — sonst Bloat.

**Empfehlung**: huashu-design clone (MIT erlaubt), die Doktrin-Struktur 1:1 als Vorlage nehmen, Inhalte von HTML/Animation/Deck auf React/Vue/Svelte + Tailwind/shadcn + Storybook/Stackblitz mappen. Quick-Win: in einem Nachmittag eine `wisp-design.skill.md` schreiben, die strukturell parallel zu `SKILL.md` von huashu liegt, aber Frontend-Stack-spezifisch ist.
