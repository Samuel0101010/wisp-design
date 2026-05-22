# open-design (nexu-io/open-design) — Research Brief

Source: https://github.com/nexu-io/open-design
Fetched: 2026-05-22

---

## Was-es-ist

**Form-Factor**: Local-first **Desktop-/Web-Application** — explicitly NOT a plugin, NOT a library. Three deployment targets ship from the same monorepo:

1. **Electron desktop app** (macOS Apple Silicon + Intel, Windows) — pre-built installers at open-design.ai
2. **Self-hosted web stack** via `docker compose up -d` in `deploy/`
3. **From source**: Node 24 + pnpm, `pnpm tools-dev run web` starts daemon + frontend

**Positioning**: "Local-first, open-source alternative to Claude Design" (= the proprietary Anthropic Claude design surface). It does NOT bundle a model; it **delegates to whichever coding agent the user already has** (Claude Code, Cursor, Gemini CLI, +13 others detected via PATH scan). For users without a local CLI, a BYOK OpenAI-compatible proxy supports Anthropic/OpenAI/Azure/Gemini/Ollama.

**Primary use case**: User describes a design intent → interactive question form locks down surface/audience/tone/visual direction → the platform spawns the user's existing coding-agent CLI as a child process with `Read/Write/Bash/WebFetch` against a project directory → artifacts (HTML/PDF/PPTX/ZIP/Markdown) stream into a sandboxed iframe preview. Projects persist in local SQLite (`.od/`).

**Not** a Claude Code plugin. Not a TUI. Not an in-editor tool. It is a **standalone desktop product** with its own UI shell that *uses* coding agents as backends.

---

## Architektur

### Top-Level Layout (monorepo, pnpm workspaces)

```
apps/                  # runtime applications
  daemon/              # Express + SQLite local daemon — ships `od` CLI binary
  desktop/             # Electron wrapper
  web/                 # Next.js 16 frontend (SSR → static export, deploys Vercel)
  landing-page/        # marketing site
  packaged/            # packaging/distribution outputs
  telemetry-worker/    # observability sink

packages/              # shared libraries
  contracts/           # pure-TS request/response shapes (boundary)
  sidecar-proto/       # protocol definitions
  sidecar/             # sidecar process runtime
  host/                # host integration
  platform/            # cross-cutting platform code
  plugin-runtime/      # internal plugin/skill loader
  registry-protocol/
  diagnostics/
  agui-adapter/

tools/                 # control planes
  dev/                 # `tools-dev` — single dev lifecycle entry
  pack/                # `tools-pack` — packaging
  pr/                  # `tools-pr` — PR helpers
  serve/               # `tools-serve` — serving

skills/                # 300+ skill folders, plain Markdown + assets, no compile
design-systems/        # 71+ brand-grade design systems (lowercase kebab-case folders)
design-templates/      # template scaffolds
craft/                 # crafting primitives
prompt-templates/      # prompt scaffolds
specs/                 # spec docs
plugins/               # external plugin slot (skills go in skills/, not here)
e2e/                   # end-to-end tests (own workspace entry)
deploy/                # docker-compose
nix/, flake.nix        # reproducible builds
.vaunt/                # release/automation metadata
```

`pnpm-workspace.yaml`: `packages/*`, `apps/*`, `tools/*`, `e2e`.

### Layer-Trennung (hard rules, from AGENTS.md)

- **App isolation**: apps cannot import private code from other apps. Web ↔ daemon flows go through HTTP + `packages/contracts`.
- **Contracts as boundary**: `packages/contracts` is pure TypeScript — no Next.js, no Express, no Node fs/process, no browser APIs, no SQLite. It is the only sanctioned shared surface.
- **Sidecar stamp protocol**: every sidecar process is identified by exactly 5 fields (`app`, `mode`, `namespace`, `ipc`, `source`) — enforced at protocol level.
- **Dual-surface rule**: every user feature ships in BOTH web UI AND `od` CLI. Shipping single-surface = regression. PRs must land HTTP endpoint + UI + CLI subcommand together.
- **Tests live in package-level `tests/`**, sibling to `src/`, never scattered.

### Runtime Architecture

```
┌──────────────────┐         ┌──────────────────────┐
│ Next.js 16 web   │ ──HTTP→ │ Express daemon (od)  │
│ (React 18 +      │ ←SSE──  │ better-sqlite3       │
│  Tailwind 4 +    │         │ chokidar watcher     │
│  Anthropic SDK   │         │ MCP SDK server       │
│  + OpenAI SDK)   │         │ blake3-wasm hashing  │
└──────────────────┘         └──────────┬───────────┘
                                        │ spawn child process
                                        ▼
                             ┌──────────────────────┐
                             │ Detected coding-agent│
                             │ CLI (claude/cursor/  │
                             │ gemini/+13)          │
                             │ → 16 JSON parsers    │
                             │ (claude-stream-json, │
                             │  ACP, pi-rpc, ...)   │
                             └──────────────────────┘
                                        │
                                        ▼
                             ┌──────────────────────┐
                             │ .od/projects/<id>/   │
                             │ real filesystem +    │
                             │ SQLite tables:       │
                             │ projects,            │
                             │ conversations,       │
                             │ messages, tabs,      │
                             │ templates            │
                             └──────────────────────┘
```

**Preview rendering**: sandboxed iframes via `srcdoc` injection, React 18 + Babel bundled into the sandbox for live evaluation.

**MCP server**: daemon exposes an MCP endpoint so external Claude Code / Cursor sessions can query open-design project files without export loops.

### Build & Tooling

- **TypeScript 5.9.3** end-to-end, ES Modules everywhere.
- **Bundler**: `esbuild` (seen in `packages/contracts/esbuild.config.mjs`), Vitest 4.1.6 for tests.
- **No root `pnpm test` or `pnpm build`** — commands must be package-scoped (`pnpm --filter <pkg>`). Single dev entry is `pnpm tools-dev`.
- **Node ~24**, **pnpm 10.33.2** pinned via Corepack.
- **Nix flake** for reproducible env.

### Release channels

`beta` (daily R&D) → `nightly` (internal stable validation) → `preview` (early access, stable-rigor) → `stable`. Each channel ships under a distinct app identity (`Open Design`, `Open Design Beta`, `Open Design Preview`).

---

## Tech-Stack

| Layer | Tech |
|---|---|
| Language | TypeScript 5.9.3 (strict, ESM) |
| Web frontend | Next.js 16.2.6, React 18.3.1, Tailwind CSS 4.3.0, lucide-react |
| Desktop shell | Electron (apps/desktop) |
| Daemon | Node 24, Express, better-sqlite3, chokidar, undici, jszip/tar, blake3-wasm |
| LLM SDKs | `@anthropic-ai/sdk` 0.32.1, `openai` 6.38.0 (BYOK proxy normalizes both + Azure/Gemini/Ollama) |
| Streaming | SSE (server) + provider-specific stream parsers (16 CLI adapters) |
| Persistence | SQLite (`projects`, `conversations`, `messages`, `tabs`, `templates`) + real fs under `.od/` |
| MCP | `@modelcontextprotocol/sdk` (daemon-side server) |
| Build | esbuild, tsx 4.22.3, Vitest 4.1.6 |
| Telemetry | prom-client, posthog-node (server) + posthog-js 1.374.2 (web) |
| Distribution | Electron installers, Docker Compose, `vercel.json` for landing/web, Nix flake |
| Repo mgmt | pnpm 10.33.2 workspaces, Corepack-pinned |

**LLM integration shape**: the platform is **provider-agnostic at the runtime layer**. It does not "call Claude" directly for design work — it spawns the user's coding-agent CLI as a child process. The Anthropic/OpenAI SDKs in the web bundle are for the BYOK proxy path (fallback when no local CLI is installed).

---

## Feature-Set

**Generation surfaces**: web prototypes, desktop UIs, mobile prototypes, slides (PPTX), images, videos, HyperFrames.

**Skill library (300+ skill folders, 19 curated in headline)**: e.g. `artifacts-builder`, `frontend-dev`, `design-brief`, `design-consultation`, `design-review`, `brand-guidelines`, `color-expert`, `ui-ux-pro-max`, `figma-generate-design`, `d3-visualization`, `pptx-generator`, `slides`, `ad-creative`, `web-design-guidelines`, `creative-director`, `data-report`, `canvas-design`, `algorithmic-art`, `fal-generate`/`fal-image-edit`/`fal-upscale`/`fal-video-edit`, `youtube-clipper`, ...

**Design systems (71+ in headline, 129 in README)**: brand specs as portable Markdown with a fixed 9-section schema. Includes `apple`, `linear`, `stripe`, `vercel`, `notion`, `airbnb`, `arc`, `canva`, `binance`, `bmw`, `bugatti`, `claude`, `cohere`, `coinbase`, plus aesthetic categories (`brutalism`, `claymorphism`, `bento`, ...).

**Anti-AI-slop machinery**:
- 5-dimensional self-critique gate (philosophy / hierarchy / execution / specificity / restraint)
- Brand-spec extraction protocol
- P0/P1/P2 checklist per skill
- Distilled from `huashu-design` (Apache-2.0 attribution)

**Structured discovery**: every new design starts with an interactive form locking surface type / audience / tone / visual direction BEFORE the model runs ("Junior-Designer" approach, reduces redirects).

**Visual Direction fallback**: 5 deterministic presets (Editorial, Modern Minimal, Tech Utility, Brutalist, Soft Warm), each with OKLch palette + font stack — used when the user provides no brand spec.

**Live project persistence**: SQLite + filesystem under `.od/projects/<id>/`. Reopen tomorrow with tabs, todo cards, conversation history intact.

**Export formats**: HTML, PDF, PPTX (agent-driven), ZIP, Markdown.

**Multi-agent CLI auto-detection**: scans PATH for 16 known coding-agent CLIs (Claude Code, Cursor, Gemini CLI, +13). One-click switching between them.

**MCP server**: external agents in other repos can query Open Design projects directly.

**i18n**: README + CONTRIBUTING + MAINTAINERS + QUICKSTART have language variants; `i18n:check` and `i18n:coverage` scripts.

**No plugin compilation**: skills and design systems are plain Markdown + asset folders. Drop folder → restart → appears in picker. No build step.

---

## Adoption-for-wisp-design

What wisp-design should **mirror**:

1. **"Skills as plain Markdown folders, no compile"** — drop-in extensibility is the single biggest UX win here. wisp-design should let users drop a folder into `~/.wisp/design-systems/<name>/` and have it appear with zero rebuild. Matches Claude Code's own skill model.
2. **Design-system-as-Markdown with fixed schema** — the 9-section brand-spec schema (philosophy / palette OKLch / typography / spacing / motion / components / patterns / voice / examples) is the right shape. Steal the schema, not the implementation.
3. **5 deterministic visual-direction presets** as fallback when user has no brand — Editorial / Modern Minimal / Tech Utility / Brutalist / Soft Warm. Each as OKLch + font stack. This is the lowest-friction onboarding pattern in the space.
4. **5-dimensional self-critique gate** (philosophy/hierarchy/execution/specificity/restraint) — implementable as a Claude subagent that gates every generated artifact. Direct port to wisp-design's review loop.
5. **Structured discovery form before generation** — locks surface/audience/tone before the model runs. Trivial to implement as a Claude slash-command flow.
6. **Contracts package as hard boundary** — pure TS, no runtime deps. If wisp-design grows past one binary, copy this pattern: `packages/contracts/` is the only shared type surface.
7. **Sandboxed iframe preview via `srcdoc` + React+Babel injection** — for live frontend rendering this is the proven escape hatch. No iframe build pipeline needed.
8. **SSE streaming from daemon → UI** — proven pattern for live agent output.

What wisp-design should **NOT** copy:

- **The whole stack.** open-design is a 900 MB monorepo with Electron + Next.js + Express + SQLite. wisp-design is a Claude Code **plugin** — completely different form-factor. Their daemon-architecture is overkill for an in-editor plugin.
- **CLI auto-detection of 16 agents.** wisp-design lives inside Claude Code — no need to delegate to other CLIs.
- **BYOK proxy.** Claude Code already handles auth.
- **Electron desktop wrapper.** Plugin = no shell.
- **Dual-surface rule (web UI + `od` CLI).** wisp-design has one surface: Claude Code itself (slash commands + agents + hooks).
- **Telemetry stack** (posthog + prom-client). Plugin shouldn't ship telemetry.

**Architecture-pattern to steal end-to-end**: the **skill folder + design-system folder + Markdown brand-spec + visual-direction presets + self-critique gate** quartet. That's the differentiated IP; the rest is glue.

---

## License-Marktsignal

| Metric | Value |
|---|---|
| License | **Apache-2.0** (permissive, attribution required) |
| Stars | **48,870** |
| Forks | 5,556 |
| Watchers | 48,870 (mirrors stars in GH API) |
| Subscribers | 173 |
| Open issues | 450 |
| Repo size | 904 MB |
| Default branch | `main` |
| Last push | 2026-05-21 21:02 UTC (1 day before this brief) |
| Primary language | TypeScript |
| Version | 0.7.0 (pre-1.0) |

**Signal read**: ~49k stars in a pre-1.0 release with daily pushes = **dominant open-source brand** in the "AI design surface" category. Apache-2.0 means we can copy patterns, schemas, even prompt templates with attribution — without forking. Daily commit cadence + a real Electron + Docker + Nix release pipeline = the team is shipping, not just demoing.

Topics confirm positioning: `claude-code-for-design`, `claude-design`, `figma-alternative`, `local-first`, `vibe-coding`, `byok`, `hermes-agent`, `coding-agents`.

**Risk for wisp-design**: this is the established incumbent in the same space. Differentiation must be the **plugin-form-factor** (lives inside Claude Code, zero install friction, no Electron, no daemon, no BYOK setup) — not feature parity on skill count.

---

## Verdict

**open-design is the reference implementation of "AI-native design tooling" — but it solves the wrong shape for wisp-design.** It is a full-fat local-first desktop product (Electron + Next.js + Express + SQLite + 16 CLI adapters) competing with Figma + Claude Design. wisp-design's job is to be the **Claude Code-native** version of the same idea: zero install, lives inside the editor, uses Claude Code's existing skills + agents + hooks system as the runtime — not a parallel daemon.

**Take from open-design** (high-value, low-cost):
- Markdown-folder skill + design-system architecture (drop-in, no compile)
- 9-section brand-spec schema
- 5 visual-direction presets with OKLch palettes
- 5-dimensional self-critique gate
- Structured pre-generation discovery form
- Sandboxed iframe preview via `srcdoc` + React+Babel for live render

**Reject from open-design**:
- Daemon + SQLite + Express runtime
- Electron shell
- Multi-CLI auto-detection
- BYOK proxy
- Dual-surface (web + CLI) rule
- Monorepo with 6 apps + 9 packages + 4 tools

**Bottom line**: open-design proves the market (49k stars, daily commits, Apache-2.0). wisp-design wins by being **the plugin-form-factor answer** to the same user — same IP (skills, design systems, critique loop), one-tenth the install friction. Mirror their content architecture, drop their runtime architecture.

---

## Source files referenced

- https://github.com/nexu-io/open-design (repo root)
- https://raw.githubusercontent.com/nexu-io/open-design/main/README.md
- https://raw.githubusercontent.com/nexu-io/open-design/main/AGENTS.md
- https://raw.githubusercontent.com/nexu-io/open-design/main/CONTEXT.md (glossary-style — partial signal only)
- https://raw.githubusercontent.com/nexu-io/open-design/main/package.json
- https://raw.githubusercontent.com/nexu-io/open-design/main/pnpm-workspace.yaml
- https://raw.githubusercontent.com/nexu-io/open-design/main/apps/daemon/package.json
- https://raw.githubusercontent.com/nexu-io/open-design/main/apps/web/package.json
- https://api.github.com/repos/nexu-io/open-design (metadata)
- https://api.github.com/repos/nexu-io/open-design/contents/{apps,packages,skills,design-systems,tools}

**Unknown — needs source dive**:
- Exact internal API of `packages/plugin-runtime` (skill loader contract) — needs `packages/plugin-runtime/src/` read
- Exact JSON-stream parser interface for the 16 CLI adapters — needs `apps/daemon/src/adapters/` read
- Exact 9-section design-system schema — needs `design-systems/_schema/` read
- Live-artifact refresh protocol — referenced in CONTEXT.md glossary but not architecturally specified in fetched material
