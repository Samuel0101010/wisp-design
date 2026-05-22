# wisp-design — Competitive Landscape

**Scope:** Live frontend-design tools that compete with or overlap wisp-design's intended surface (LLM-driven UI iteration, live edit on a running webapp, design-to-code, Claude Code design plugins).
**Date:** 2026-05-22. Sources cited inline. Confidence flagged "Unknown — needs <source>" where unverified.

---

## Standalone-AI-Tools

### v0 (Vercel) — `v0.app`
- **Form:** Hosted webapp + Next.js sandbox + Git integration + VS-Code-style editor (Feb 2026).
- **Live-Edit:** Prompt → regenerate; no element-level selector. Visual diff via preview pane. Token-priced.
- **Mechanic:** Generates whole React/Next.js components and full-stack apps incl. Server Actions + Supabase CRUD. Deploys to Vercel.
- **Differentiator vs. wisp-design:** Hosted-only, locked to Vercel deploy infra, does NOT run on your local dev server. Output quality (React/Next) currently industry-best (9.5/10 UI score per WeavAI).
- **Market:** Free $0 → $20 Premium → $30/seat Team → $100 Business. v0 leads in UI quality; cited as top of pack.
- **Better than us:** Best raw UI generation, full-stack incl. backend + DB + deploy in one product.
- **Cannot do:** Cannot edit YOUR existing codebase in-place on YOUR localhost. Closed sandbox. No selector-based live edit.

### Lovable (`lovable.dev`)
- **Form:** Hosted webapp with three modes (Agent / Chat / Visual Edits).
- **Live-Edit:** "Visual Edits" — click element, modify without prompts. Plus Supabase + GitHub sync + one-click deploy.
- **Mechanic:** Closed hosted environment, syncs to GitHub.
- **Differentiator:** Non-technical founders, full product (DB + auth + deploy). $330M Series B at $6.6B (Dec 2025). Enterprise customers: Klarna, Uber, Zendesk.
- **Better than us:** Brand, capital, "Visual Edits" feature already exists (click-to-modify), full DB+auth+deploy stack.
- **Cannot do:** Not a Claude Code plugin — separate environment. Not for engineers editing existing codebases. Vendor lock-in.

### Bolt.new (StackBlitz)
- **Form:** Hosted webapp with WebContainers (full Node.js in-browser).
- **Live-Edit:** Prompt + chat → AI rewrites files; live preview alongside. Built-in editor for manual edits. v2 added Bolt Cloud (DB + auth + storage + edge functions + hosting).
- **Mechanic:** AI has full env control (filesystem, npm, terminal, console). 98% reduction in error loops in v2.
- **Differentiator:** WebContainers tech is unique — true full-stack in the browser tab.
- **Better than us:** Mature in-browser runtime, autonomous debugging, integrated deploy.
- **Cannot do:** Not local-first. Not a CC plugin. No element-selector live edit.

### Subframe (`subframe.com`)
- **Form:** Hosted webapp (visual editor) + MCP server + Skills.
- **Live-Edit:** Visual editor uses real React+Tailwind components (not mockups); deterministic code generation. Install via `npx skills add SubframeApp/subframe`.
- **Mechanic:** Code generation is **deterministic / non-AI** ("no AI slop machine") for predictable output. AI is used for context-aware new-page generation only.
- **Differentiator:** "The only design tool with an MCP server" (per their marketing). Code-native — 47 built-in production components. You own the code.
- **Better than us:** Already has MCP server reading their component library that Claude Code/Cursor can consume. Deterministic output beats LLM unpredictability.
- **Cannot do:** Their editor edits THEIR canvas, not YOUR running app at localhost:3000. No live DOM-selector → codebase-edit roundtrip. $29/editor/month gate.
- **Note on "anti-reasoning":** No evidence of a feature literally called "anti-reasoning." Their actual stance is "deterministic generation, no AI for code output." Unknown — needs Subframe changelog if a literal "anti-reasoning" feature shipped.

### Builder.io Visual Copilot
- **Form:** Figma plugin + CLI + AI-IDE integrations (Cursor, Windsurf, Claude Code).
- **Live-Edit:** Figma selection → one-click → production code in React/Next/Vue/Angular/Svelte. CLI integrates designs into existing codebase.
- **Mechanic:** Specialized model trained on 2M+ data points. Maps Figma layers to your existing components (no duplicate parallel components).
- **Differentiator:** Strongest Figma→code pipeline. Component-mapping is the killer feature. Plays nice with AI-IDEs.
- **Better than us:** Mature Figma bridge, multi-framework export, enterprise-ready.
- **Cannot do:** Starting point MUST be a Figma file. Cannot iterate by clicking on a running app. Cannot bootstrap design from a prompt at the IDE level.

---

## Figma-Bridges

### Figma MCP Server (official, by Figma)
- **Form:** Remote MCP server (recommended) + local. Bundled as Anthropic-official plugin: `claude plugin install figma@claude-plugins-official`.
- **Capabilities:** Reads frames/components/variables/styling + Code Connect mappings. Write-to-canvas (remote only) — agents can create/modify frames, components, variables, auto layout USING your design system.
- **Mechanic:** MCP, originally invented at Anthropic (Nov 2024 open-sourced). Figma published their server + bundles it as an official Claude Code plugin.
- **Differentiator vs. wisp-design:** Figma↔Code roundtrip is solved territory. "Live edit" here = Figma canvas, NOT running web app.
- **Cannot do:** Not for teams without Figma. Not for editing the rendered DOM.

### Anima
- **Form:** Figma plugin.
- **Market:** **1.5M+ Figma installs** — most-installed design-to-code plugin. IBM invested Feb 2026.
- **Output:** Most literal Figma→HTML translation (good for design QA, bad for clean component code — absolute positioning everywhere).
- **Better than us:** Massive distribution, enterprise validated.
- **Cannot do:** Output is "screenshot rebuilt as HTML" — not idiomatic React. Not codebase-aware.

### Locofy
- **Form:** Figma plugin + VS Code extension + CLI.
- **Mechanic:** Proprietary "Large Design Models" (LDMs). Tag elements in Figma → generate framework code.
- **Differentiator:** Cleanest component structure of Figma→code tools (named components, flexbox).
- **Better than us:** Best pure design-to-code output quality of the Figma tier.
- **Cannot do:** Figma-dependent. No live-edit on running app.

---

## Claude-Code-Plugins

### Anthropic Frontend Design (official)
- **Form:** Skill bundled in `claude-plugins-official` marketplace, `plugins/frontend-design`.
- **Installs:** 760,428 (claude.com/plugins) / 277k cited Mar 2026 / 418k on claudemarketplaces.com — **fastest-growing official skill.**
- **Mechanic:** Pure prompt-level intervention. Forces Claude to commit to an aesthetic direction (brutalist, maximalist, retro-futuristic, luxury, playful) BEFORE writing code. Bans Inter/Roboto/Arial/Space Grotesk and purple-gradient-on-white clichés.
- **Better than us:** Already shipped, official, massive distribution, free.
- **Cannot do:** **Static code generation only — no live editing on running app.** This is the open lane wisp-design must take.

### Other CC frontend skills/plugins (inventory from wilwaldon/Claude-Code-Frontend-Design-Toolkit)
- **Shadcnblocks-Skill** (masonjames) — Knowledge of 1,300–2,500 shadcn/ui blocks; intelligent composition.
- **UI/UX Pro Max** — 240+ styles, 127 font pairings.
- **Taste Skill** — Tunable variance/motion/density controls.
- **Design System Architect** — OKLCH color spaces, semantic theming, Tailwind @theme blocks.
- **Tailwind CSS Kit** — Tailwind v4 @theme + dark mode.
- **Animation Design Skills** (23) — GSAP, Framer Motion, anime.js, Three.js, Lottie.
- **Web Quality Skills** (5) — LCP/INP/CLS, WCAG 2.1.
- **Frontend Design Pro Demo** (claudekit) — 11 named aesthetics with reference HTML/CSS.

**Common pattern:** ALL of these are skills/prompts. **NONE offer click-to-edit on a running localhost app from Claude Code.**

### Shuffle (`shuffle.dev/claude-code`)
- **Form:** Hosted visual editor + Claude Code as the implementer.
- **Mechanic:** Build UI visually (13,400+ components, drag-drop, Tailwind/Bootstrap/MUI), download, hand to Claude Code for integration into existing codebase.
- **Differentiator:** Decoupled — Shuffle does design, CC does integration.
- **Better than us:** Huge component library, multi-framework export.
- **Cannot do:** Two-tool workflow (Shuffle export → CC integrate). No live in-IDE roundtrip. Pricing: Single License / Teams (specifics not disclosed on page).

### Nimbalyst (`nimbalyst.com`)
- **Form:** Desktop app (macOS/Windows/Linux) + iOS companion. MIT, free.
- **Mechanic:** Wraps Claude Code + Codex in a kanban-based visual workspace. Multiple parallel CC sessions. Side-by-side editing with inline diffs across files (markdown, code, mockups, diagrams, CSV).
- **Differentiator:** Visual session management for multi-agent CC workflows.
- **Better than us:** Multi-session orchestration UX; integrated task management.
- **Cannot do:** Not a runtime-DOM live editor. It's a CC frontend, not a frontend-design tool.

### Stagewise (`stagewise.io`)
- **Form:** Browser-injected toolbar + open-source agentic IDE. AGPL-3.0. **6.7k GitHub stars.** YC S25 backed.
- **Mechanic:** `npx stagewise@latest` starts a proxy, injects a toolbar into your running web app. **Click an element → describe change → built-in agent OR bridged IDE agent (Cursor/Copilot/Windsurf/Cline/Roo Code) generates the edit in your local codebase.**
- **Bridges:** VSCode extension v0.11.4 (Nov 2025). Multiple IDE bridges. **Claude Code bridge: Unknown — needs stagewise docs verification.**
- **Differentiator:** This is **wisp-design's closest direct competitor.** Click-to-prompt-to-codebase-edit on a running localhost app is exactly the loop.
- **Better than us TODAY:** Already shipped, framework-agnostic (React/Vue/Angular/Next/Svelte), open-source, YC-backed, 6.7k stars, real funding, AGPL forces upstream contribution.
- **Cannot do:** AGPL is poison for commercial closed-source consumers. Not a native Claude Code plugin — bridge model. Toolbar approach (injected script) is heavy. Free tier limits models; Pro $20/mo, Ultra $200/mo. Browser-IDE split UX adds context-switching.

### Onlook (`github.com/onlook-dev/onlook`)
- **Form:** Open-source visual editor (was Electron, migrated to Web). Apache 2.0. **25.8k GitHub stars** (highest in this category). Latest release v0.2.32 (July 2025).
- **Mechanic:** Code loads into a web container, preview in iframe, code instrumented to map DOM→source. Right-click element → jump to code. Drag-drop components. Tailwind toolbar. AI chat with code edit (via OpenRouter — GPT-4/Claude/Gemini/Llama/MorphLLM).
- **Differentiator:** "The Cursor for Designers." Most polished visual+code roundtrip in open source.
- **Better than us:** 25.8k stars, mature DOM↔source mapping, drag-drop, polished UI.
- **Cannot do:** **No direct Claude Code integration** — routes Claude via OpenRouter, not as a CC plugin. Last release July 2025 (slowing?). Standalone editor, not embedded in CC. Not skill-based.

### Happy / slopus issue #802
- **Form:** Feature request in `slopus/happy` (a Claude Code UI). "Live Preview Panel with Click-to-Edit for Claude Code sessions."
- **Status:** Open issue, not shipped. **Validates demand and lane is open.**

---

## Anthropic-Skills-Marketplace

- **Total:** 6,700+ skills, 840+ MCP servers per claudemarketplaces.com (community-curated).
- **Official Anthropic skills:** 16 total. Design-relevant: `frontend-design` (760k installs), `web-design-guidelines` (Vercel WIG, 322k installs), `vercel-react-best-practices` (402k installs).
- **Claude Design (product):** Anthropic launched "Claude Design" — workspace for UI prototypes powered by Opus 4.7 (per Neowin). **This is on the same surface as wisp-design and is the biggest strategic threat.** Unknown — needs Anthropic product page for exact feature set.
- **No official Anthropic plugin offers live-edit on user's localhost.** Frontend-design = static codegen only (confirmed by claude.com/plugins/frontend-design fetch).
- **Figma official plugin** (`figma@claude-plugins-official`) ships MCP + agent skills; covers Figma→code lane.

**Gap in marketplace:** Zero official AND community plugins ship a click-on-running-app → CC-edits-codebase loop as a native CC plugin. Stagewise comes closest but is NOT a CC plugin (it's a parallel IDE/toolbar).

---

## Live-Edit-Browser-Tools

| Tool | Live-Edit mechanic | Strength | Weakness |
|---|---|---|---|
| **Stagewise** | Inject toolbar on localhost, click→prompt→codebase edit | Real codebase edits, multi-framework, multi-IDE bridge | Not a CC plugin, AGPL, 2-tool UX |
| **Onlook** | Iframe + DOM↔source mapping + drag-drop + Tailwind toolbar | Most polished OSS visual editor, 25.8k stars | Standalone, no CC plugin path |
| **Visily browser ext.** | Screenshot any webpage → editable wireframe | Reverse-engineer competitor UIs | Goes to wireframe, not running app |
| **Element to LLM** | Select DOM element → JSON payload to clipboard for LLM | Light, no install, fast | Manual paste loop, no edit-back |
| **DOM Extractor for LLMs** | Drag/precision-mode select → structured DOM → CC | Formatted for CC | Read-only context, no write-back |
| **Chrome DevTools MCP** (official Anthropic) | Headless Chrome + perf traces + console + Puppeteer | Official, deep browser introspection | Read/automate, not point-and-click-edit |
| **Browser Feedback MCP** (yepzdk) | Inject widget → point + annotate → MCP → CC acts | CC-native, lightweight | Community project, narrow scope |
| **Builder.io preview/Claude Code visual editor** | Embedded browser in CC desktop app, click element = prompt context | Native to CC desktop | Read-context-only; no canvas; auto-detects dev server |
| **Visual Copilot in Cursor/Windsurf** | Figma selection → IDE edit | Mature bridge | Figma-anchored |

**Claude Code Desktop already ships click-as-context in its embedded browser** (per Builder.io blog): clicking an element sends DOM context to the next prompt. This is **not full live-edit** (no selector→codebase-write loop), but it's the platform baseline wisp-design must beat.

---

## Marktlücke

The unaddressed wedge is a **native Claude Code plugin that closes the loop**: dev server runs locally → user clicks any element in their actual rendered app → wisp-design captures full context (DOM path, computed styles, source file/line via sourcemap, component tree, design-token bindings) → user writes a natural-language change → CC edits the real source file → HMR shows the result → user accepts/rejects. **No existing solution covers this end-to-end as a first-class CC plugin.** Stagewise has the loop but isn't a CC plugin and is AGPL. Onlook has the loop but is a standalone editor with no CC integration. Frontend-design (Anthropic's own) is static prompt-engineering only. Figma MCP, Subframe, Builder.io, Anima, Locofy all start from a design canvas, not from running code. v0/Lovable/Bolt run in their own sandbox, not on your localhost.

---

## USPs-für-wisp-design

1. **CC-native, not a parallel tool.** Ship as a `/plugin install wisp-design` skill+MCP combo. Zero context switch. Inherits CC auth, model routing, hooks. Stagewise/Onlook can't do this without rewriting their product.
2. **Source-mapped click→edit roundtrip.** Selector → exact file:line via Vite/webpack sourcemaps → Edit tool writes only the minimal diff. No "regenerate whole component" like v0.
3. **Codebase-aware, not canvas-aware.** Reads existing components, design tokens (tailwind config, CSS vars, shadcn theme), and respects them. The opposite of Anima's "screenshot rebuilt as HTML."
4. **Design-philosophy layer on top of mechanics.** Embed Anthropic's frontend-design skill DNA (aesthetic-direction-before-code, banned-fonts list, OKLCH tokens) so wisp-design BOTH lets you click-edit AND prevents AI-slop output.
5. **Local-first, BYOM.** Runs entirely on user's machine, hits user's Claude credits, no hosted state, no $29/seat lock-in.
6. **Multi-framework dev-server detection** (Next.js / Vite / Remix / SvelteKit / Astro / Nuxt) — auto-instrument, no manual toolbar setup like Stagewise's `npx`.
7. **Hooks-driven verification loop:** post-edit hook → screenshot → diff against pre-edit → flag visual regressions. CC's own hooks system, not a parallel engine.

---

## Anti-Patterns

1. **Don't build another sandbox.** v0/Lovable/Bolt own that — and they're rich. Edit user's real code on their real machine.
2. **Don't go through Figma.** Builder.io/Anima/Locofy own that lane and Figma's own MCP covers it. Start from running code, not from a canvas.
3. **Don't ship a parallel editor app.** Onlook (25.8k stars) and Stagewise (6.7k) tried this; both are still niche vs. having native CC integration. Be a plugin, not a product.
4. **Don't go AGPL.** Stagewise's AGPL kills enterprise adoption. Permissive (MIT/Apache-2.0) wins skill marketplaces.
5. **Don't regenerate whole components.** v0's "prompt → new component" UX wastes tokens and loses local changes. Surgical edits only — diff < 50 lines per turn.
6. **Don't ignore the design-philosophy layer.** Anthropic's own frontend-design skill proves users want "anti-slop" guardrails. A pure mechanics tool without aesthetic discipline becomes a faster way to make ugly UIs.
7. **Don't require a dedicated browser/extension.** Element-to-LLM/DOM-Extractor extensions add install friction. Inject the wisp-toolbar from the plugin itself when the dev server starts (hook on `dev` script).
8. **Don't lock framework support.** Stagewise covers React/Vue/Angular/Next/Svelte. Match that on day 1; add Astro/Nuxt/SvelteKit/Remix/Qwik.
9. **Don't bury the "you own the code" message.** Subframe's loudest marketing line. Match it explicitly — "wisp edits YOUR code, not ours."
10. **Don't fight Anthropic's "Claude Design" head-on as a product.** Position wisp-design as the **engineer-facing local complement** to Anthropic's designer-facing hosted Claude Design. Different audience, different surface.

---

## Tabelle (alle Konkurrenten)

| Tool | Form | Live-Edit (running app)? | Stars / Market | Differentiator |
|---|---|---|---|---|
| v0 (Vercel) | Webapp + sandbox | No (regen-only) | Top UI-gen quality 9.5/10 | Full-stack incl. backend |
| Lovable | Webapp | Yes — "Visual Edits" click | $330M Series B / $6.6B valuation | Non-tech founders, end-to-end |
| Bolt.new (StackBlitz) | Webapp w/ WebContainers | No (regen-only) | 40% perf gain 2026, Bolt Cloud | Full Node.js in browser tab |
| Subframe | Webapp + MCP + Skills | No (canvas-only) | $29/seat Pro | Deterministic codegen, MCP-native |
| Builder.io Visual Copilot | Figma plugin + CLI + IDE | No (Figma-anchored) | Trained on 2M data points | Component mapping to existing repo |
| Figma MCP (official) | MCP server / CC plugin | Canvas write, not DOM | Anthropic-distributed | Bidirectional Figma↔code |
| Anima | Figma plugin | No | 1.5M+ Figma installs, IBM invested | Most-installed; literal output |
| Locofy | Figma + VS Code + CLI | No | "Best pure D2C for agencies" 2026 | Cleanest component structure |
| Anthropic frontend-design | CC skill (official) | **No** — static codegen | 418k–760k installs | Aesthetic-direction-before-code |
| Shadcnblocks-Skill | CC skill | No | Community | 1,300–2,500 shadcn blocks |
| Shuffle | Web editor → CC import | No (two-tool flow) | 13,400+ components | Decouple design and integration |
| Nimbalyst | Desktop app (MIT, free) | No (CC frontend) | OSS, free, MIT | Multi-session CC kanban |
| **Stagewise** | Toolbar+IDE bridge | **Yes — click→prompt→codebase** | **6.7k stars, YC S25, AGPL-3.0** | **Direct competitor; not a CC plugin** |
| **Onlook** | Standalone web editor | **Yes — iframe+DOM↔source** | **25.8k stars, Apache 2.0** | **Most-starred OSS; no CC plugin** |
| Visily ext. | Browser extension | Screenshot → wireframe | Chrome/Firefox/Edge | Reverse-engineer rival UIs |
| Element to LLM | Browser extension | Select → JSON to clipboard | Free | Manual paste loop |
| DOM Extractor for LLMs | Browser extension | Select → CC-formatted JSON | Free | One-way context only |
| Chrome DevTools MCP | MCP (Anthropic official) | Read/automate only | Anthropic-distributed | Deep browser introspection |
| Browser Feedback MCP | MCP (community) | Annotate → CC acts | Community | CC-native widget |
| Magic Patterns | Webapp | No (canvas) | Funded | Component-library-aware prototypes |
| Uizard | Webapp | No (canvas) | Established | "ChatGPT for UI" |
| tweakcn | Webapp | No (theme only) | OSS | shadcn theme + image→theme AI |
| Claude Code Desktop (native) | Built-in browser | Click = context only | Anthropic native | Baseline to beat |
| Claude Design (Anthropic) | Hosted workspace | **Unknown — needs Anthropic product page** | Anthropic, Opus 4.7-powered | **Biggest strategic threat** |

---

## Confidence Flags / Open Items

- Stagewise → Claude Code direct bridge: **Unknown — needs stagewise.io/docs verification.**
- Subframe "anti-reasoning" feature literally: **Unknown — needs Subframe changelog.** Closest verified concept = "deterministic, no-AI code output."
- Anthropic "Claude Design" product feature set + GA date: **Unknown — needs claude.com/design or Anthropic Mar 2026 announcement.**
- Stagewise funding amount (YC S25 standard ~$500k, but recent rounds): **Unknown — needs Crunchbase/YC page.**
- Onlook commercial roadmap / hosted-app status: **Unknown — needs onlook.com.**
