---
description: Index of the UI-UX-Pro-Max corpus — 14 CSVs catalogued by topic. Phase 4 ships a sample CSV demonstrating the schema; Phase 7 forks the full corpus with AgentDB-HNSW indexing.
license: MIT
attribution: Source corpus is ui-ux-pro-max (MIT, https://github.com/nextlevelbuilder/ui-ux-pro-max-skill). See `README.md` for fork plan and licensing.
---

# UI-UX-Pro-Max Corpus Index

The UI-UX-Pro-Max corpus is **the single largest design-knowledge dataset that's also MIT-licensed**. It encodes ~700 rows of pattern + style + colour + typography + UX-rule cross-references in 14 CSV files. wisp-design forks the corpus (with attribution) and re-indexes it via AgentDB HNSW, replacing the original Python+BM25 search with semantic embeddings.

Phase 4 ships ONE sample CSV demonstrating the schema (`sample-style-modern-minimal.csv`). Phase 7 forks the full corpus. The strategic call (per `research/repos/ui-ux-pro-max.md` and Open Decision #5): **MIT-fork with attribution; saves months over re-building**.

## The 14 CSVs

| File                  | Approx rows | Schema highlight                                                                                                |
| --------------------- | ----------- | --------------------------------------------------------------------------------------------------------------- |
| `styles.csv`          | 67          | 22 columns — style → AI Prompt Keywords + CSS Keywords + Implementation Checklist + Design System Variables    |
| `colors.csv`          | 161         | shadcn-token-aligned palette per product type — Primary / Secondary / Accent / Muted / Border / Ring + Notes   |
| `typography.csv`      | 57          | Font pairing → category (Serif+Sans, Sans+Sans, …) + Heading Font + Body Font + Mood + Tailwind Config         |
| `ui-reasoning.csv`    | 161         | The reasoning engine — UI Category → Pattern + Style Priority + Color Mood + Decision Rules (JSON conditionals) |
| `products.csv`        | 161         | Product-type catalog (SaaS, Micro-SaaS, E-com, Financial Dashboard, …)                                          |
| `landing.csv`         | ~30         | Landing-page section-order patterns and CTA strategies                                                         |
| `charts.csv`          | 25          | Chart type → data shape → library recommendation                                                               |
| `ux-guidelines.csv`   | 99          | Category, Issue, Platform, Description — quoted rules like "Anchor links should scroll smoothly"               |
| `icons.csv`           | ~30         | Icon-family recommendations (Phosphor, Lucide, Heroicons)                                                      |
| `google-fonts.csv`    | ~50         | Google Fonts metadata for query routing                                                                        |
| `design.csv`          | ~40         | General design rules                                                                                           |
| `draft.csv`           | ~20         | Working notes / pending entries                                                                                |
| `app-interface.csv`   | ~40         | Mobile/native interaction patterns                                                                             |
| `react-performance.csv` | ~30        | React-specific perf checklists (rerender, memo, virtualization)                                                |

Plus per-stack guidelines under `stacks/`:

| Stack file              | Stack target                                            |
| ----------------------- | ------------------------------------------------------- |
| `stacks/html-tailwind.csv` | HTML + Tailwind (the default)                        |
| `stacks/react.csv`      | React (vanilla)                                          |
| `stacks/nextjs.csv`     | Next.js                                                  |
| `stacks/svelte.csv`     | Svelte / SvelteKit                                       |
| `stacks/vue.csv`        | Vue                                                      |
| `stacks/nuxt.csv`       | Nuxt                                                     |
| `stacks/shadcn.csv`     | shadcn/ui                                                |

Note: wisp-design is Claude-Code-native. We DROP the swiftui / react-native / flutter / jetpack-compose stack files (out of scope for live-frontend-edit).

## Shape of a style row

`styles.csv` is the most important file. Each row is a (style, prompt, code, checklist, vars) quadruple — a ready-to-render variant seed. Example schema:

| Column                  | Purpose                                                                                |
| ----------------------- | -------------------------------------------------------------------------------------- |
| Style Category          | Top-level taxonomy (Glassmorphism, Brutalism, Modern Minimal, …)                       |
| Type                    | Sub-classification                                                                     |
| Keywords                | Semantic terms for embedding-based retrieval                                            |
| Primary Colors          | Surface and foreground colour role tokens                                              |
| Secondary Colors        | Accent and supporting role tokens                                                       |
| Effects & Animation     | Motion and effect tokens for the style                                                  |
| Best For                | When to choose this style                                                              |
| Do Not Use For          | When to avoid                                                                          |
| Light/Dark Mode         | Mode-specific notes                                                                    |
| Performance             | Cost notes (e.g. `backdrop-filter` is expensive)                                        |
| Accessibility           | a11y considerations                                                                    |
| Mobile-Friendly         | Mobile UX notes                                                                         |
| Conversion-Focused      | Marketing-page friendliness                                                            |
| Framework Compatibility | Which stacks support cleanly                                                            |
| Era/Origin              | Historical context                                                                     |
| Complexity              | Implementation effort                                                                  |
| AI Prompt Keywords      | Ready-made prompt one-liner                                                            |
| CSS/Technical Keywords  | Concrete CSS snippets                                                                  |
| Implementation Checklist | Step-by-step verification items                                                       |
| Design System Variables | CSS custom-properties for the style                                                    |

## How wisp-design uses this corpus

When a `configure` event arrives:

1. The variant prompt extracts keywords from `freeText` and the target's classes.
2. `wisp-design skills search "<query>" --namespace corpus` returns the top-k rows.
3. Matching rows feed the variant prompt as concrete (prompt, code, checklist) examples.
4. The model adapts the row's CSS-vars + checklist to the actual target.

This replaces the original UI-UX-Pro-Max workflow (Python BM25 search → text-only output) with AgentDB HNSW search → live-preview-loop. Same corpus; better activation.

## What's different from upstream

When forked in Phase 7:

- **Search.** AgentDB HNSW + embeddings instead of Python BM25. 150-12,500x faster, semantic > keyword.
- **Stacks.** Drop swiftui/react-native/flutter/jetpack-compose files. Keep html-tailwind / react / nextjs / svelte / vue / nuxt / shadcn.
- **Form.** Markdown frontmatter at the top of each CSV file declaring source/license/attribution.
- **No CLI dep.** UI-UX-Pro-Max's `python3 search.py` flow is gone. wisp-design's `skills search` is Node-only, lives in `src/agent/skills-index.ts`.

## Sample shipped in Phase 4

`sample-style-modern-minimal.csv` ships in this folder as a single demonstration row-set. It shows the expected shape (target_type, style, prompt, css_template, checklist, css_vars) using "modern minimal" examples. The full 67-row `styles.csv` lands in Phase 7.

Schema for the Phase-4 sample:

```
target_type,style,prompt,css_template,checklist,css_vars
```

This is a simplified projection of the upstream 22-column schema — the 6 fields the variant prompt actually consumes during generation.
