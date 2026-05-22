# ui-ux-pro-max — Research Dossier for wisp-design

**Source:** https://github.com/nextlevelbuilder/ui-ux-pro-max-skill
**Date analyzed:** 2026-05-22
**Verdict (TL;DR):** Single most valuable design-knowledge corpus we found. CSV-driven, BM25-searchable, MIT-licensed. wisp-design should **adopt its data layer wholesale**, **rewrite the activation/UX layer to be live-preview-first**, and **avoid its weakness** (Python-CLI hard dependency, no rendering loop).

---

## Design-Knowledge-Corpus

The corpus is **14 canonical CSV files** under `src/ui-ux-pro-max/data/`, treated as the Source of Truth. Symlinked into `.claude/skills/`, `.factory/skills/`, `.shared/`, and bundled into the npm CLI (`cli/assets/`).

### Files & what they encode

| File | Rows (approx) | Schema highlights |
|---|---|---|
| `styles.csv` | 67 | 22 columns — `Style Category, Type, Keywords, Primary Colors, Secondary Colors, Effects & Animation, Best For, Do Not Use For, Light/Dark Mode, Performance, Accessibility, Mobile-Friendly, Conversion-Focused, Framework Compatibility, Era/Origin, Complexity, AI Prompt Keywords, CSS/Technical Keywords, Implementation Checklist, Design System Variables` |
| `colors.csv` | 161 | shadcn-token-aligned palette per product type — `Product Type, Primary, On Primary, Secondary, On Secondary, Accent, On Accent, Background, Foreground, Card, Card Foreground, Muted, Muted Foreground, Border, Destructive, On Destructive, Ring, Notes`. WCAG-3:1 adjustments documented in `Notes`. |
| `typography.csv` | 57 | `Font Pairing Name, Category (Serif+Sans, Sans+Sans, …), Heading Font, Body Font, Mood Keywords, Best For, Google Fonts URL, CSS Import, Tailwind Config, Notes` |
| `ui-reasoning.csv` | 161 | The reasoning engine — `UI_Category, Recommended_Pattern, Style_Priority, Color_Mood, Typography_Mood, Key_Effects, Decision_Rules (JSON conditionals), Anti_Patterns, Severity` |
| `products.csv` | 161 | Product-type catalog (SaaS, Micro-SaaS, E-com, E-com Luxury, B2B Service, Financial Dashboard, Healthcare App, Gaming, Fintech, …) |
| `landing.csv` | ~30 | Section-order patterns & CTA strategies |
| `charts.csv` | 25 | Chart type → data shape → library recommendation |
| `ux-guidelines.csv` | 99 | `Category, Issue, Platform, Description` — quoted rules like "Anchor links should scroll smoothly" |
| `icons.csv` | — | Icon-family recommendations (Phosphor, Lucide, Heroicons) |
| `google-fonts.csv` | — | Google Fonts metadata for query routing |
| `design.csv` | — | Likely tokens/general design rules — Unknown — needs file inspection |
| `draft.csv` | — | Unknown — needs file inspection |
| `app-interface.csv` | — | Mobile/native interaction patterns |
| `react-performance.csv` | — | React-specific perf checklists (rerender, memo, virtualization) |
| `data/stacks/*.csv` | 13 stacks | Per-stack guidelines: `html-tailwind` (default), `react`, `nextjs`, `astro`, `vue`, `nuxtjs`, `nuxt-ui`, `svelte`, `swiftui`, `react-native`, `flutter`, `shadcn`, `jetpack-compose` |

### Design principles / frameworks referenced
- **Material Design** — explicit (4.5:1 contrast, 48dp touch target, 4/8dp spacing rhythm, "Bottom nav ≤5 items with both labels and icons").
- **Apple HIG** — explicit (44×44pt touch, haptic feedback for confirmations, spring physics, Tab Bar for top-level nav).
- **WCAG 2.x** — AA (4.5:1) and AAA (7:1) baked into the color CSV `Notes` column.
- **Swiss/International Style** — listed as Style #1 (Minimalism & Swiss).
- **CLS / Core Web Vitals** — CLS<0.1, FOIT avoidance via `font-display:swap`, 60fps/~16ms main-thread budget.
- No proprietary "UI-PRO-MAX framework" — the originality is in the **catalog** and **decision rules**, not the principles.

### Typography rules (encoded)
- Base size ≥16px on mobile (iOS auto-zoom prevention).
- Line height 1.5–1.75 body.
- Line length 65–75 chars desktop, 35–60 mobile.
- Heading 600–700, body 400, label 500.
- Pairings categorized as `Serif+Sans` / `Sans+Sans` / `Mono+Sans` etc. with mood tags.

### Spacing / layout system
- 4/8dp incremental rhythm.
- Vertical-rhythm tiers `16 / 24 / 32 / 48`.
- Breakpoints `375 / 768 / 1024 / 1440`.
- Z-index scale `0 / 10 / 20 / 40 / 100 / 1000`.

### Color theory
- Per-product-type **shadcn-token tuples** (Primary / Secondary / Accent / Muted / Destructive + `On *` foregrounds + Border / Ring).
- WCAG fallback documented inline ("Accent adjusted from #F97316 for WCAG 3:1").
- Dark-mode rule: **desaturated/lighter tonal variants, not inverted**.

### Layout / interaction patterns
- 10 prioritized rule categories (Accessibility CRIT → Touch CRIT → Performance HIGH → Style HIGH → Layout HIGH → Typography MED → Animation MED → Forms MED → Navigation HIGH → Charts LOW).
- Animation: 150–300ms micro, ≤400ms transitions, `transform`/`opacity` only, ease-out enter / ease-in exit, respect `prefers-reduced-motion`.

---

## Skill-Activation-Pattern

### Skill manifest shape
- **Anthropic Skills format** — `SKILL.md` with YAML frontmatter (`name`, `description`).
- Skill name: `ui-ux-pro-max`.
- One single mega-description (~800 chars) that mashes **actions × projects × elements × styles × topics × integrations** into one keyword soup. This is the activation surface.

### Activation keyword strategy (verbatim, from the description)
- **Actions:** plan, build, create, design, implement, review, fix, improve, optimize, enhance, refactor, check.
- **Projects:** website, landing page, dashboard, admin panel, e-commerce, SaaS, portfolio, blog, mobile app.
- **Elements:** button, modal, navbar, sidebar, card, table, form, chart.
- **Styles (trigger words):** glassmorphism, claymorphism, minimalism, brutalism, neumorphism, bento grid, dark mode, responsive, skeuomorphism, flat design.
- **Topics:** color systems, accessibility, animation, layout, typography, font pairing, spacing, interaction states, shadow, gradient.
- **Integrations advertised:** shadcn/ui MCP.

### "When to Apply" (3-tier gating in SKILL.md)
- **Must Use** — new pages/screens, component creation/refactor, color/typography/spacing/layout decisions, UI accessibility review, navigation/animation/responsive impl, product-level design decisions.
- **Recommended** — unclear professionalism issues, usability/accessibility feedback, pre-launch optimization, cross-platform alignment, design-system/component-library work.
- **Skip** — backend, API/DB, non-UI infra, non-visual scripts. (Explicit anti-trigger.)
- **Core principle stated:** "Use this skill when the work affects how features look, feel, move, or are interacted with."

### Plugin shape
- Multi-skill plugin — `.claude/skills/` contains 7 sibling skills: `banner-design`, `brand`, `design-system`, `design`, `slides`, `ui-styling`, `ui-ux-pro-max`. Suggests a **modular skill family** pattern (different surfaces of the same corpus).

---

## Methodology-Workflows

The skill defines an explicit **4-step workflow** (this is the load-bearing methodology — wisp-design's flow must rival or beat this):

### Step 1 — Analyze Requirements
Extract: product type / target audience / style keywords / tech stack.

### Step 2 — Generate Design System (REQUIRED — the "atomic action")
```bash
python3 .../search.py "<product_type> <industry> <keywords>" --design-system [-p "Project Name"]
```
**Returns a unified dict:** `pattern, style, colors, typography, effects, anti-patterns`.

Internals (`design_system.py`):
1. Search `product` domain → identify category.
2. Look up `ui-reasoning.csv` for that category (3-tier match: exact → substring → keyword-split). Extracts `Style_Priority`.
3. Multi-domain parallel search across `product` (n=1), `style` (n=3, query enhanced with style priority), `color` (n=2), `landing` (n=2), `typography` (n=2).
4. `_select_best_match` ranks: style-category-name match `+10`, generic keyword match `+3`.
5. Merge → dict with hex tokens mapped to CSS variables.

### Step 2b — Persist (Hierarchical Design System)
```bash
python3 .../search.py "<query>" --design-system --persist -p "Project Name"
```
Creates:
- `design-system/MASTER.md` — global source of truth.
- `design-system/pages/[page].md` — page-specific overrides (override wins over MASTER).

This is the **token-driven theming** + **hierarchical retrieval** pattern. **wisp-design must replicate this two-level token system.**

### Step 3 — Domain Drill-Down
```bash
python3 .../search.py "<keyword>" --domain <product|style|color|typography|landing|chart|ux|google-fonts|prompt|react|web>
```
BM25 + regex hybrid ranking. Auto-detects domain when `--domain` omitted.

### Step 4 — Stack Guidelines
```bash
python3 .../search.py "<keyword>" --stack react-native
```

### Common-Scenario Routing Table (verbatim)
| Scenario | Start From |
|---|---|
| New project / page | Step 1 → Step 2 (design system) |
| New component | Step 3 (domain: style, ux) |
| Choose style / color / font | Step 2 |
| Review existing UI | Quick Reference checklist |
| Fix a UI bug | Quick Reference → relevant section |
| Improve / optimize | Step 3 (ux, stack) |
| Implement dark mode | Step 3 (style "dark mode") |
| Add charts / data viz | Step 3 (chart) |

### Pre-Delivery Checklist (5 sections, ~25 items)
Visual Quality / Interaction / Light-Dark Mode / Layout / Accessibility. Each is a discrete checkbox — directly usable as a wisp-design `verify` gate.

---

## Templates-Examples

### Template architecture
```
src/ui-ux-pro-max/templates/
├── base/
│   ├── skill-content.md        # Common SKILL.md body (rendered per-platform)
│   └── quick-reference.md      # Claude-only deep-dive cheatsheet
└── platforms/
    ├── claude.json             # Per-platform manifest
    ├── cursor.json
    └── … (15+ platforms)
```

The CLI (`uipro-cli`, npm) **renders** the per-platform skill from base templates. wisp-design can fork this approach but **doesn't need 15-platform multi-targeting** — Claude Code only.

### Per-row implementation artifacts in `styles.csv`
Every style row ships with:
- **AI Prompt Keywords** column — a ready-made one-liner prompt ("Design a minimalist landing page. Use: white space, geometric layouts…").
- **CSS/Technical Keywords** — concrete CSS snippets (`backdrop-filter: blur(15px); background: rgba(255,255,255,0.15); …`).
- **Implementation Checklist** — `☐ Backdrop-filter blur 10-20px ☐ Translucent white 15-30% opacity ☐ …`.
- **Design System Variables** — CSS custom properties (`--blur-amount: 15px; --glass-opacity: 0.15;`).

This is **gold for wisp-design's live-preview loop**: every catalog row is already a (prompt, code, verification) triple.

### Decision-Rules JSON
`ui-reasoning.csv` `Decision_Rules` column contains inline JSON:
```json
{"if_ux_focused": "prioritize-minimalism", "if_data_heavy": "add-glassmorphism"}
{"if_luxury": "switch-to-liquid-glass", "if_conversion_focused": "add-urgency-colors"}
```
These are **conditional style routers** — wisp-design should parse + execute these as actual branching logic in its design-system step.

### No live-preview / renderer
Critically: this skill has **zero rendering**. It only returns text/markdown. **That is wisp-design's wedge.** UI/UX Pro Max tells you what to build; wisp-design must show it, iterate it, and commit it.

---

## Adoption-for-wisp-design

### MUST adopt (verbatim or near-verbatim)

1. **The 14 CSV corpus** — license is MIT. Fork the data, keep attribution, repackage as `wisp-design/skills/design-corpus/data/`. Skip Python CLI; load CSVs directly in Node/TS or embed.
2. **The 22-column `styles.csv` schema** — `AI Prompt Keywords` + `CSS Keywords` + `Implementation Checklist` + `Design System Variables` is the perfect substrate for our live preview round-trip.
3. **The 161 shadcn-token color palettes** — already WCAG-adjusted, already shadcn-named (Primary / On-Primary / Background / Foreground / Card / Muted / Border / Ring / Destructive). Drop straight into `tailwind.config` / CSS-vars.
4. **The 10-tier priority taxonomy** (Accessibility CRIT → Charts LOW) as wisp-design's **review-gate ordering**.
5. **`ui-reasoning.csv` Decision_Rules JSON** — parse these as actual rule engine in wisp-design's "generate design system" step.
6. **MASTER.md + `pages/[name].md` hierarchy** — wisp-design's "persisted project design system" must work this way.
7. **Pre-Delivery Checklist** (25 items, 5 sections) — wire as a `verify` skill that blocks completion until all checks pass.

### SHOULD rewrite better

1. **Activation pattern** — their mega-description works but is heavy. wisp-design uses leaner, role-specific sub-skills (e.g. `wisp-design:critique`, `wisp-design:tokens`, `wisp-design:preview`).
2. **Stack support** — drop their 13 stacks; wisp-design ships with `react+tailwind+shadcn`, `next`, `svelte`, `vue`, `astro` (the live-preview targets). SwiftUI/Flutter/Jetpack are out-of-scope.
3. **Search engine** — replace Python BM25 (`core.py`) with **AgentDB embeddings + HNSW** (we already have it). 150–12,500× faster + semantic > BM25 for design-keyword fuzziness.
4. **Drop CLI dependency** — no `python3 search.py`, no `npx uipro init`. wisp-design must work with zero install beyond `/plugin install`.

### MUST NOT copy

1. **Python runtime requirement** — Claude Code users on Windows without Python = dead skill. Use Node-only or pure-MD-lookup.
2. **15-platform multi-targeting** — wisp-design is Claude Code-native. The template-rendering complexity isn't worth it for one target.
3. **Stale separation** — they ship MASTER.md as **text the LLM reads back later**. wisp-design should ship it as **tokens the renderer compiles**.

### Net-new (wisp-design's unique wedge over ui-ux-pro-max)

1. **Live preview loop** — render → screenshot → critique → iterate (their skill stops at "generated"; wisp-design closes the loop).
2. **DOM/visual diff per iteration** — Chrome DevTools MCP + Playwright integration.
3. **A11y verification gate** — actual axe-core run, not a checklist.
4. **Token export** — `tailwind.config.ts`, `globals.css` CSS-vars, `theme.json` written to disk on confirm.
5. **Component-library aware** — detect `shadcn/ui`, `radix`, `headlessui` in project, generate within those primitives.

---

## License-Marktsignal

| Signal | Value |
|---|---|
| **License** | MIT — full reuse OK with attribution |
| **Stars** | 81.3k (extremely high — likely inflated/farmed, but treat as "category leader" signal) |
| **Forks** | 8.4k |
| **Watchers** | 387 |
| **Latest release** | v2.5.0 (2026-03-10) |
| **Last commit** | recent — actively maintained — Unknown exact date — needs `gh api repos/.../commits/main` |
| **Primary language** | Python 78.5% (CSV-search engine) |
| **CLI on npm** | `uipro-cli` (separate package) |
| **Homepage** | https://uupm.cc |
| **Distribution channels** | Claude Marketplace + npm CLI + 17 AI-tool integrations (Cursor, Windsurf, Copilot, Kiro, Codex, Gemini, Trae, OpenCode, Continue, CodeBuddy, Droid, KiloCode, Warp, Augment, Antigravity, Qoder, RooCode) |

**Market read:** This is the **incumbent** in "AI design knowledge for code assistants." 81k stars + 17-tool reach means it sets the user's mental model for what a design skill does. wisp-design must be **demonstrably better at the thing it doesn't do** (live iteration) — competing on corpus alone is a loser's game.

---

## Verdict

**Strategic call: Fork the data, surpass the loop.**

1. **Take the 14 CSVs (MIT)** — they are 12+ months of curation we don't need to redo. Treat as a vendored corpus under `wisp-design/skills/design-corpus/data/` with `ATTRIBUTION.md`.
2. **Replace their Python+BM25 stack with our Node + AgentDB/HNSW + embeddings** — same answers, semantic match, no Python dep, ~100× faster.
3. **Adopt their 4-step methodology** (Analyze → Generate → Drill-Down → Stack) but extend with **Step 5: Preview & Iterate** (the wedge).
4. **Adopt their MASTER.md + page-override pattern** for persisted design tokens, but render to real `tailwind.config` / `globals.css`, not just docs.
5. **Borrow their activation-keyword taxonomy** (actions × projects × elements × styles × topics), but split across 3–4 focused sub-skills instead of one mega-description.
6. **Their weaknesses are wisp-design's product:** no rendering, no diff, no a11y-tool integration, Python dependency, no visual feedback. Each of those is a feature we ship on day one.

**Risk:** their 81k-star inertia means users will compare wisp-design to ui-ux-pro-max immediately. The pitch must be **"everything they teach you, plus you see it work."** Not "different corpus" — same corpus, better loop.

**Files relevant to this dossier (absolute):**
- `C:\Users\samue\github ideas\ruflo\wisp-design\research\repos\ui-ux-pro-max.md` (this file)
