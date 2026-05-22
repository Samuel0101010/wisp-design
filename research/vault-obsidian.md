# Vault-Mining Report — `Obsidian x Claude x Designer`

Destillat aus Samuels über Monate gewachsenem Frontend-Design-Vault. Quellen sind vault-relativ (root = `C:\Users\samue\Obsidian\Obsidian x Claude x Designer`).

## Vault-Status

- **Exists, riesig, gepflegt.** ~80+ Pattern-Docs, ~160 Next.js-Snippets, ~105 Vite-React + 105 SvelteKit-Ports, 53 "taste-anchor" Brand-Files (`linear`, `apple`, `stripe`, `binance`, `bmw-m`, `clay`, `vodafone`, …), 11 Reference-Apps mit Deep-Dives, 6 Stack-Skeletons (nextjs, vite-react, sveltekit, react-native, flutter, swiftui).
- **Letzte signifikante Pflege:** 2026-05-17 (Vault-Audit + 19 neue Snippets + apple.md, siehe `_solutions/2026-05-17-*`).
- **Tone:** Opinionated, terse, "Anti-AI-Slop" als ausdrückliches Designziel. Deutsch + Englisch gemischt.

## Vault-Struktur

```
_brain/               Wissen (4-Level-Taxonomie)
  ├─ design-system/   Tokens — colors, typography, spacing, motion, dark-mode, radius, elevation-and-shadow
  ├─ principles/      WARUM-Regeln — a11y, responsive, microcopy, loading, feedback, error-handling,
  │                   performance-budget + Huashu-Methodik (fact-verification, brand-asset-protocol,
  │                   narrative-questions, anti-slop-extensions, junior-designer-flow)
  ├─ patterns/        ~80 UX-Pattern-Docs (variants + A11y + anti-patterns + stack-defaults)
  ├─ stacks/          nextjs.md, vite-react.md, sveltekit.md, mobile.md
  └─ inspiration/
      ├─ reference-apps/        Deep-Dive pro App (linear, stripe, vercel, anthropic, aceternity,
      │                         arc, raycast, notion, apple, animejs, stringtune)
      ├─ reference-apps-mobile/ ios-music, linear-mobile, notion-mobile, things-3
      ├─ taste-anchors/         53 Brand-DESIGN.md im getdesign.md-Format (Apple, Tesla, Binance, BMW M, …)
      ├─ animation-libraries/   motion-dev/{README, react, javascript, vue, recipes}
      ├─ component-libraries.md · design-systems.md · moodboards.md · design-tools.md
_snippets/<stack>/<category>/<snippet>/   Hybrid: README.md (frontmatter) + _raw/<PascalCase>.ext
  ├─ _compositions/    Full-Page-Skelette mit Style-Variants (landing-page minimal|bold|glass etc.)
_solutions/           YYYY-MM-DD-<topic>.md — ce-compound-Output
_meta/templates/      new-project, new-snippet, new-solution, stack-skeletons
projects/<name>/      README, PRODUCT.md, DESIGN.md, HANDOFF.md, frontend/, assets/, decisions/
docs/superpowers/     Specs aus Brainstorming-Sessions
CLAUDE.md             Vault-Index (zentral) — Pfad-Tabellen, Konventionen, Workflows
DESIGN.md             Vault-Konventionen (Colors/Typo/Spacing kuratierte Regeln)
PRODUCT.md            Users, Purpose, Brand Personality, Anti-References, Design Principles
```

**Taxonomie-Kern:** `_brain/` = Wissen, `_snippets/` = ausführbarer Code, `_solutions/` = gelöste Probleme, `projects/` = aktive Frontend-Projekte (transportabel an Backend-Claude). Unterstrich-Präfix trennt System-Inhalte von transportablen Projekten.

**Linking-Konvention (load-bearing):** Pattern-Doc-Namen sind global eindeutig → `[[forms]]` funktioniert. Snippet-READMEs heißen alle `README.md` → MÜSSEN per relativem Markdown-Pfad gelinkt werden (`[Label](../../forms/x/README.md)`), Wikilink wäre mehrdeutig. Jede Pattern-Doc hat `## Snippets`-Footer mit Links zu allen Stack-Implementierungen.

## Design-Prinzipien

Aus `PRODUCT.md`, `DESIGN.md`, `_brain/principles/*.md`, `_brain/design-system/*.md`.

### Übergreifend (DNA)

1. **Anti-AI-Slop ist explizites Designziel.** Patterns + Compositions + Reference-Apps sind kuratiert um LLM-Trainings-Reflexe zu überschreiben.
2. **Surgical changes, not rewrites.** Match existing style, keine spekulativen Refactors.
3. **Multistack-first.** Wenn ein Snippet in einen Stack kommt, wird er in alle sinnvollen Stacks portiert. Nicht "später" — später ist nie.
4. **Pattern-Docs = Wahrheit (Konzept + Variants + A11y + Anti-Patterns). Snippet-READMEs = Setup-Hilfe pro Stack.** Doppelung vermeiden.
5. **Verifizieren, nicht behaupten.** Vor "fertig"-Meldung: Diff-Check, Render-Test, Type-Check, Screenshot + Console-Check.
6. **Konventionen nicht verhandelbar, Defaults schon.** Default-Stack ist Next.js — aber wenn das Projekt SvelteKit verlangt, kein Argument.

### Color (`_brain/design-system/colors.md`, `DESIGN.md`)

- **OKLCH first.** Kein HSL für neue Tokens. Kein `#000` / `#fff`. Tinted neutrals mit chroma 0.005-0.015 zur Brand-Hue.
- **Semantic-Naming statt Raw-Values** — `bg-background` / `bg-primary`, NICHT `bg-blue-500`.
- **Color-Strategy bewusst wählen:** Restrained / Committed / Full-Palette / Drenched. Default ist NICHT "Restrained mit lila Akzent".
- **Variant-Anchors:** Linear=Restrained-Cool, Stripe=Committed-Indigo, Anthropic=Drenched-Warm, Aceternity=Full-Palette-Neon. **Vor neuer Composition: Variant-Anchor wählen, dann Palette.**
- **Dark-Mode:** Higher-elevation = lighter (oklch 12% / 18% / 24%), NICHT via Shadow.

### Typography (`_brain/design-system/typography.md`, `DESIGN.md`)

- **Modular Scale ≥1.25, max. 5 Größen.**
- **Measure 65-75ch.** Body fixed (rem), nicht fluid.
- **Fluid `clamp()` nur für Headings**, mit `max ≤ 2.5 × min`.
- **Inter ist NICHT Default.** System-Stack (`-apple-system, "Segoe UI", system-ui`) für Apps oft die beste Wahl.
- **Variable Fonts ab 3 Weights.** `font-display: optional` wenn Layout-Shift kritisch, `swap` sonst.
- **OpenType-Features:** `tabular-nums` für Daten, `text-wrap: balance` für Headings, `text-wrap: pretty` für Long-Form.
- **Niemals 800/900 für Body.** Niemals Em-Dashes in UI-Copy (Vault-Doku darf).
- **Mathematisches Type-Scale (StringTune-Insight):** Single `--type-step`-Variable (1.333=Perfect Fourth) leitet die ganze Hierarchie via `calc()` + `pow()` ab. Single source of truth.

### Spacing (`_brain/design-system/spacing.md`)

- **Base 4px.** Tailwind-Scale strikt, KEINE arbiträren Werte (`p-[13px]`).
- **Vertical Rhythm = Body-Line-Height** als Spacing-Base-Unit. Variation für Rhythmus, nicht überall dasselbe Padding.
- **Touch-Targets ≥44×44px** auf Mobile (Pflicht).
- **Page-Wrapper:** `mx-auto max-w-7xl px-4 sm:px-6 lg:px-8`. Section-y: `py-12 md:py-16 lg:py-24` (Hero: bis lg:py-32).

### Motion (`_brain/design-system/motion.md`)

- **Durations 100/300/500-Regel** (Feedback / State-Change / Layout). Exit ≈ 75% von Enter. Über 500ms wirkt langsam.
- **Easing `ease-out` Default**, KEIN Bounce / Elastic auf Buttons.
- **Signature-Easings (StringTune-derived):** `--ease-smooth: cubic-bezier(0.35,0.35,0,1)` (90% reveal), `--ease-sharp: cubic-bezier(0.69,0,0,1)` (hero), `--ease-spring: cubic-bezier(0.6,0.5,0,3)` (overshoot Buttons).
- **`prefers-reduced-motion` PFLICHT** in jedem Snippet. Tailwind `motion-reduce:` Modifier.
- **Animate only `transform` + `opacity`.** Niemals `width`/`height`/`top`. Separate `scale` + `translate` Properties statt `transform`-Combo.
- **Niemals 2 CSS-Keyframes wenn Transition reicht** (StringTune-Beobachtung).

### Layout

- **Cards NICHT Default.** Card-in-Card ist IMMER falsch. Container-only-when-needed.
- **Mobile-first** mit `sm`/`md`/`lg`/`xl`. Container-Queries (`@container`) wo sinnvoll.
- **`100dvh` statt `100vh`** auf Mobile (Safari-Issue).
- **iOS Inputs auf 16px halten** (sonst Auto-Zoom).

### Accessibility (`_brain/principles/accessibility.md`)

- **WCAG 2.2 AA Minimum** (EAA 2025 ist gesetzliche Pflicht in EU).
- **Contrast:** Text 4.5:1, Large 3:1, UI-Components 3:1.
- **Focus-Visible** sichtbarer Ring auf JEDEM interaktiven Element.
- **Semantic HTML > ARIA.** `<button>` statt `<div role="button">`.
- **Color nie alleiniges Signal** — Error rot UND Icon UND Text.
- **Skip-Link** als erstes fokussierbares Element.

### Methodik (Huashu-Bausteine, `_brain/principles/`)

- **Fact-Verification** — keine Library-Behauptungen aus Memory, immer context7/WebSearch. Markieren als "(verified via …)" oder "(unverified)".
- **Brand-Asset-Protocol 5-10-2-8** — bei Brand-Tasks: 5 Suchen, 10 Kandidaten, 2 Finalisten, Score ≥8/10 in Schärfe+Authentizität+Brand-Alignment. Logo non-negotiable wenn er existiert.
- **4 Narrative Questions** vor jeder neuen Page: (1) Narrative Role — Hero/Transition/Data/Quote/Closing, (2) Viewing Distance — 10cm/40cm/1m/3m/10m, (3) Visual Temperature — quiet/excited/calm/authoritative/gentle/sad, (4) Capacity / Thumbnail-Test.
- **Junior-Designer-Flow 4-Phasen:** Assumption-Stub (Gray-Boxes + `[ASSUMING X]`-Comments) → User-Checkpoint (Screenshot + Confirm) → Fill → Verify (Console + Multi-Viewport + Dark/Light + Reduced-Motion + Tab-Order).

## Pattern-Sammlungen (Top-20 explizit)

Aus `_brain/patterns/` (~80 Files) — diese sind die wichtigsten als Encoding-Basis für wisp-design:

| Pattern | File | Highlight |
|---|---|---|
| **CTA-Sections** | `_brain/patterns/cta-sections.md` | Genau 1 Primary pro Section, "Specificity > Cleverness", verb-first Microcopy, `<section>` + `<h2>` |
| **Pricing-Sections** | `_brain/patterns/pricing-sections.md` | Cards ≤3 Tiers, Tables ab 3+, mid-tier-highlight via **EINE** Methode (border/shadow/scale/badge) |
| **Testimonials** | `_brain/patterns/testimonials.md` | `<blockquote>`+`<cite>` semantisch, Specific over Generic ("Cut deploy time 4h→12min"), keine Stock-Photo-Avatare |
| **Auth-Flows** | `_brain/patterns/auth-flows.md` | Sign-In-Errors generisch (Security), Magic-Link als Alternative, `autocomplete`-Attribute Pflicht |
| **Hero-Sections** | (Pattern-Doc) | Wird im scroll-narrative-Toolkit gefüttert (apple.md ist Anker) |
| **Buttons** | `_brain/patterns/buttons.md` | 11 Variants — default/outline/ghost/soft/shimmer/magnetic/border-beam/glow/morph-on-load/icon-only/family |
| **Forms** | `_brain/patterns/forms.md` | rhf+zod default, floating-label, inline-validation, conversational (Typeform) |
| **AI-Chat 2026** | `_brain/patterns/ai-chat.md` | Tool-Call-Bubble, Thinking-Indicator, Citation-Cards, Artifact-Pane, Voice-Mode, Streaming/Branching |
| **Floating-Family** | dropdowns/menus/popovers/tooltips/selects | Cross-Link-Block mit Trigger/Content/A11y-Role Decision-Tabelle |
| **Cards** | `_brain/patterns/cards.md` | spotlight-card (cursor-glow), tilt-card (3D), animated-bento-card |
| **Scroll-Narrative** | `_brain/patterns/scroll-narrative.md` | 10 Snippets — image-sequence-scrub (Apple-AirPods), parallax-multi-layer, lenis-foundation, sticky-image-stack |
| **Dialogs/Modals** | `_brain/patterns/dialogs-and-modals.md` | Modal-as-First-Thought ist Hard-Ban — inline-Alternativen zuerst |
| **Empty-States** | `_brain/patterns/empty-states.md` | 3 Sub-Typen: First-Use / Filtered / Error — jedes mit Next-Action-CTA |
| **Toasts/Alerts/Banners/Notifications** | `_brain/principles/feedback-and-status.md` | Decision-Tree welches Element wann |
| **Loading/Skeleton** | `_brain/principles/loading-and-skeleton.md` | <100ms nothing, 100-300ms button-feedback, 300ms-1s spinner, 1s-10s skeleton, >10s progress+cancel |
| **Effects/Shaders/Animated-Backgrounds** | dedicated Pattern-Docs | dithered-swirl, gooey-filter, neural-noise |
| **Page-Compositions** | `_snippets/<stack>/_compositions/` | landing-page / dashboard-shell / auth-flow / pricing-page / settings-page mit je 3 Style-Variants (minimal/bold/glass etc.) |
| **Animated Borders/Text-Effects** | dedicated Docs | border-beam (`@property --beam-angle`-Trick), shimmer, gradient-text-blobs |
| **Command-Palette** | `_snippets/.../menus/raycast-command-palette/` | Volle WAI-ARIA combobox+listbox+option+selected, LCS-Fuzzy ohne cmdk-Dep |
| **Dashboard-Shell** | Composition + `_brain/patterns/dashboard-shells.md` | minimal/cockpit/glass Variants |

## Tool-Präferenzen

Aus `CLAUDE.md` + `_brain/stacks/*.md` + Code-Imports.

### Web (Default-Stack: Next.js)

- **Next.js 15** (App Router, RSC default, Server Actions, streaming via `loading.tsx`+`<Suspense>`)
- **React 19** (use-hook, Actions)
- **TypeScript strict**
- **Tailwind CSS v4** (`@theme` direkt in CSS, kein `tailwind.config.ts` mehr nötig)
- **shadcn/ui** (Radix-based) — Component-Foundation
- **lucide-react** — Icon-System (Phosphor / Hugeicons als Alternativen)
- **react-hook-form + zod + @hookform/resolvers** — Form-Default
- **framer-motion / motion v12 (`motion/react`)** — Animation-Default. Beobachtete Convention-Drift: einige Snippets noch auf `framer-motion`, neue auf `motion/react`.
- **sonner** — Toast-Library
- **next-themes** — Theme-Toggle (class-based dark-mode)
- **class-variance-authority + clsx + tailwind-merge** — CVA-Pattern für Components
- **lenis** — smooth-scroll foundation für scroll-narrative

### Alternative Stacks

- **Vite + React** (Custom ThemeProvider statt next-themes)
- **SvelteKit** (mode-watcher für Theming)
- **Mobile:** Expo SDK 52 + NativeWind v4 (RN); Material 3 + Riverpod + google_fonts (Flutter); SwiftUI native

### Auth / Data

- Auth: **Auth.js (NextAuth) v5**, **Clerk**, **BetterAuth**, **Supabase Auth**
- Data: **Drizzle ORM + Postgres (Neon/Supabase)**, Server Actions + **TanStack Query**

### Animation (zweite Library für Choreografie)

- **anime.js v4** für Multi-Element-Timeline-Choreografie (`createTimeline({ autoplay: onScroll({ sync: true }) })`, Timeline-Slot-Notation `'-=300'`, `'<'`).
- Decision-Rule: **>3 Targets pro Section → anime.js. Einzelne Layout-Animation → motion.**

### Tooling / Inspiration

- **21st.dev MCP** — Component-Builder
- **Figma** wird kaum erwähnt (Sam arbeitet code-first, nicht design-first)
- **Aceternity / Magic UI / motion-primitives** als Visual-Inspiration
- **shadcn/ui examples** als Pattern-Source
- **Playwright + Chrome-DevTools MCP + claude-in-chrome MCP** für Verifikation

## Workflow-Beobachtungen

### Aktueller Flow (`CLAUDE.md` "Workflows")

1. **Neues Projekt:** Template-Kopie → `PRODUCT.md` ausfüllen (`/impeccable teach`) → `/impeccable shape` (UX/IA-Plan vor Code) → `DESIGN.md` ausfüllen (`/impeccable document`) → Stack-Skeleton scaffolden → **`/impeccable live` PFLICHT als erste Iteration im Browser** → `/impeccable polish` + Anti-Slop-Check → `/impeccable audit` (P0-P3) → `HANDOFF.md` für Backend.
2. **Snippet:** Code in Chat → Stack + Kategorie auto-detect → kebab-case-Ordner anlegen → README mit Frontmatter + `_raw/` → automatisch in alle anderen Stacks portieren → Pattern-Doc-Footer + Stack-README + CLAUDE.md aktualisieren.
3. **Solution:** "fertig"/"passt"/"speichern" → `ce-compound` Skill → `_solutions/YYYY-MM-DD-<topic>.md`.

### `/impeccable live` als Live-Iteration-Loop

- Sam clickt Elemente im Browser an → Claude generiert **3 distinct Variants** (zwingt zu echten Alternativen statt 10 Mikro-Variationen) → HMR swappt sofort → Comments + Strokes auf Screenshots als Input.
- **`Monitor`-Tool MUSS** für den Watch-Loop verwendet werden, NICHT `Bash run_in_background` (sonst werden Events erst beim Process-Exit zugestellt — verifizierter Pain-Point).
- Stale-Watcher-Kill-Ritual via `Get-CimInstance Win32_Process` vor jedem Monitor-Start (PowerShell-spezifisch).

### Schmerzpunkte aus den Solutions

Aus `_solutions/2026-05-17-*.md`:

1. **Slop-Falle: Single-Variant-Categories.** Wenn eine Category nur 1 Snippet hat → wird zur Default-Lösung → generisch. Mindestens 2-3 distincte Variants pro hochfrequenter Category nötig.
2. **Slop-Falle: Pattern-Docs ohne Reference-App-Backlinks.** Vor Audit: nur 2/70 Patterns hatten Inspiration-Anker. Ohne Anker fällt jeder Bau zurück auf "noch ein shadcn-Klon". **Höchster Hebel auf Output-Qualität.**
3. **Linking-Drift:** Snippet-Sibling-Links per `[[<name>]]` brechen, weil alle Snippet-READMEs gleich heißen → 42 broken Links in einem Audit. Konvention: Sibling-Links IMMER Markdown-Pfad.
4. **Convention-Drift Library-Imports:** Manche Snippets `framer-motion`, manche `motion/react` — Skeleton-Lockfile hinkt nach. Jede neue Snippet-Aufnahme braucht Convention-Check.
5. **Multistack-Drift:** 10 Categories sind nextjs-only obwohl Auto-Multistack-Konvention besteht.
6. **Hydration-Mismatch** in scroll-driven + theme-aware Components — `useTheme()` ohne mounted-Gate, `Date.now()` im Server-Render.
7. **Image-Sequence-Scrub Memory-Leak** ohne `AbortController` beim Unmount (Apple-AirPods-Style Canvas-Scrub).
8. **`@property --beam-angle` statt `offset-path`** für Border-Beam-Button (visual-correct, GPU-beschleunigt, modern-browser-only — explizit dokumentiert).

### Multistack-Auto-Port-Konvention

Bei neuem Snippet AUTOMATISCH in alle sinnvollen Stacks (nextjs ↔ vite-react ist fast 1:1, sveltekit via Syntax-Konvertierung). Mobile nur, wenn Pattern dort sinnvoll. Pattern-Doc-Footer + Stack-README + CLAUDE.md MÜSSEN gleichzeitig aktualisiert werden.

## Goldnuggets (1:1 in wisp-design einbauen)

### 1. Anti-Slop Pre-Commit Checklist (`_brain/principles/anti-slop-extensions.md`)

Hard-Gate vor jedem "fertig"-Signal. Direkt als Skill-Rule encodieren:

```
- Em-Dashes nur in Vault-Doku, nicht in UI-Copy (Buttons/Headlines/Empty/Tooltips/Labels)
- Keine Lorem-Ipsum / "Your headline here" / "Description goes here"
- Keine generischen AI-Illustrationen (3D-Blob-Avatar-Slop, Gradient-Mesh-BG, Floating-Orbs)
- Keine "Welcome to" / "Get started" Headlines ohne Produkt-Kontext
- Buttons haben spezifische Verben — kein "Click here", kein generisches "Submit"
- Keine zentrierten Text-Walls (>2 Zeilen zentriert = Redesign)
- Color-Tokens aus DESIGN.md, KEINE eingestreuten #hex
- Spacing folgt 4/8px-Grid, KEINE arbiträren 13px/7px/21px
- Dark-Mode verifiziert (Theme-Toggle + Screenshot)
- Empty States haben spezifische Microcopy + Next-Action
- Keine Side-Stripe-Borders, kein Default-Glassmorphism, keine Bounce/Elastic-Easing, kein #000/#fff
- Kein Purple-Blue-Gradient als Decoration, keine CSS-gemalten Phones/Browsers/Stat-Counter-Rows
```

### 2. 4 Narrative Questions als Pre-Code-Gate (`_brain/principles/narrative-questions.md`)

Vor JEDER neuen Page/Screen: Role / Distance / Temperature / Capacity laut beantworten + User-Nod abwarten + ERST DANN Code. Verhindert "purple gradient weil 2023"-Defaults.

### 3. Three-Variants-Per-Click Live-Loop

Wenn ein UI-Element verbessert wird: **3 distinct Variants** anbieten (nicht 10 Mikro-Variationen vom selben). Zwingt zu echten Alternativen. Direkt als Skill-Default in wisp-design.

### 4. Mathematisches Type-Scale via Single `--type-step` (`_brain/design-system/typography.md` + StringTune-Analyse)

```css
:root {
  --type-step: 1.333;          /* Perfect Fourth — premium musical ratio */
  --body-fs: 1rem;
  --body-lh: 1.2;
  --lh-step: calc(var(--body-lh) / var(--type-step));
  --h1: calc(var(--p) * var(--type-step) * var(--type-step) * var(--type-step) * var(--type-step) * var(--type-step) * var(--type-step));
  --large: max(calc(var(--h1) * var(--type-step) * var(--type-step)), 17.6vw);
  --h1-lh: calc(var(--body-lh) * pow(var(--lh-step), 4));
}
```

Single source of truth — Step tauschen = ganze Hierarchie atmet konsistent mit. Premium typografische Identität für Marketing-Pages.

### 5. Signature-Easing-Tokens (StringTune-derived)

```css
:root {
  --ease-smooth: cubic-bezier(0.35, 0.35, 0, 1);  /* Default 90% reveal */
  --ease-sharp:  cubic-bezier(0.69, 0, 0, 1);     /* Hero scale/rotate, snappy */
  --ease-spring: cubic-bezier(0.6, 0.5, 0, 3);    /* Overshoot Buttons */
  --ease-power:  cubic-bezier(0.5, 0, 0.3, 1);    /* Gradient sweeps */
}
```

Pflicht: immer als CSS-Var registrieren, nie ad-hoc cubic-bezier inline.

### 6. Variant-Anchor-Map (vor jeder Composition)

```
Restrained-Cool     → Linear   (#08090a, Inter 510, ultra-thin white borders)
Committed-Indigo    → Stripe
Drenched-Warm       → Anthropic
Full-Palette-Neon   → Aceternity
Cinematic-Photography → Apple   (edge-to-edge tiles, single #0066cc action blue)
Scroll-Narrative    → StringTune, Apple (image-sequence-scrub)
Editorial-Dark      → TheVerge, Cohere
Productivity-Tool   → Raycast, Notion
```

Bei "im Stil von X"-Brief oder als Start-DESIGN.md für neues Projekt — **Variant-Anchor wählen BEVOR Palette gewählt wird.** 53 Brand-DESIGN.md-Files in `_brain/inspiration/taste-anchors/` sind die kuratierte Sammlung.

## Empfohlene-Adoption-für-wisp-design

Diese sieben Bausteine 1:1 (oder mit minimaler Adaption) übernehmen — sie sind das destillierte Resultat von Monaten Vault-Pflege:

1. **Pattern→Reference-App-Backlinks als Pflicht-Section in jedem Pattern.** "Inspiration-Anker"-Block mit konkreten reference-apps + taste-anchors + motion-recipes. Ohne Anker → Slop. Höchster Output-Quality-Hebel (3% → 50% Coverage in Audit war der größte Lift).
2. **Hard-Bans als Linter-Rules.** Side-stripe borders, gradient-text, glassmorphism-as-default, hero-metric-template, identical-card-grids, modal-as-first-thought, em-dashes-in-UI, purple-blue-gradient, #000/#fff, bounce/elastic-easing, generic-AI-illustrations.
3. **3-Variants-Rule auf Element-Click.** Statt 1 "verbesserter" Vorschlag → 3 distinct Approaches mit eigener Identität. (Live-Mode-Lesson aus dem Vault.)
4. **4 Narrative Questions als Pre-Code-Gate.** Role/Distance/Temperature/Capacity laut beantworten + User-Nod, BEVOR Code anfängt.
5. **Junior-Designer-Flow 4-Phasen.** Stub mit `[ASSUMING X]`-Comments → Checkpoint-Screenshot → Fill → Verify. Statt 200-Zeilen-One-Shot der falsch verstanden ist.
6. **Brand-Asset-Protocol 5-10-2-8.** Bei Brand-Tasks: 5 Suchen, 10 Kandidaten, 2 Finalisten, Score ≥8/10. Logo non-negotiable wenn er existiert. CSS/SVG-Silhouetten verboten.
7. **Pflicht-Verifikation nach UI-Edit:** HMR → 2-3s warten → console-check (pattern "error|warn|fail|exception") → Screenshot in Light+Dark → Multi-Viewport (375/768/1280/1920) → reduced-motion-toggle → Tab-Order-Smoke. Vorher KEIN "fertig"-Signal.

**Token-Defaults für jeden neuen Frontend-Boot:**

- Color: OKLCH, tinted neutrals, KEIN HSL. Variant-Anchor zuerst wählen.
- Type: Mathematisches Scale via `--type-step: 1.333` Default. `text-wrap: balance` für Headings, `pretty` für Long-Form, `tabular-nums` für Daten.
- Spacing: 4px-Base strikt. Vertical-Rhythm = Body-LH.
- Motion: `--ease-smooth` default. 100/300/500-Durations. `prefers-reduced-motion` Pflicht. Separate `scale`+`translate` statt `transform`-Combo.
- Radius: `--radius` Single-Var, Brand-Charakter über einen Wert tunen (0 brutalist, 0.25 subtle, 0.5 default, 1 friendly, 1.5 playful).
- Stack-Default: Next.js 15 + React 19 + Tailwind v4 + shadcn/ui + motion/react + lucide + rhf+zod + sonner + next-themes + cva+clsx+tailwind-merge.
