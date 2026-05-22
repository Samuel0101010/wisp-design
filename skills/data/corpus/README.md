---
description: Attribution and fork plan for the UI-UX-Pro-Max corpus. Phase 4 ships a sample; Phase 7 forks the full 14-CSV corpus with AgentDB HNSW indexing.
license: MIT
attribution: Source corpus is ui-ux-pro-max (MIT, https://github.com/nextlevelbuilder/ui-ux-pro-max-skill). See licence notice below.
---

# UI-UX-Pro-Max Corpus — README

## Source

The full UI-UX-Pro-Max corpus is published at https://github.com/nextlevelbuilder/ui-ux-pro-max-skill under MIT. The skill is the category leader (81k+ stars, 17 AI-tool integrations). Its primary value is **12+ months of curation of design-knowledge in CSV form** — knowledge that wisp-design does not need to recreate.

## Open Decision #5 — confirmed

The strategic call (per `research/synthesis.md` and `docs/agent-loop.md`):

> **MIT-fork with attribution.** Saves months over re-building; respects the licence. Frontmatter in `skills/data/corpus/*.md` carries attribution.

This is binding for Phase 4 (the sample) and Phase 7 (the full fork).

## What ships in Phase 4

- `00-INDEX.md` — catalogue of the 14 CSVs with row counts and schema summary.
- `README.md` — this file.
- `sample-style-modern-minimal.csv` — a 30-row sample CSV in the wisp-design Quadruple format, demonstrating the expected shape.

That's it. No upstream CSV is forked in Phase 4 — the schema is shown by example; the model can already retrieve via `wisp-design skills search "<query>" --namespace corpus` once even a sample is indexed.

## What ships in Phase 7

The full fork:

1. **Pull the upstream CSVs.** From `nextlevelbuilder/ui-ux-pro-max-skill` `src/ui-ux-pro-max/data/` at a pinned commit.
2. **Project columns.** Convert the 22-column upstream schema to wisp-design's 6-column Quadruple (`target_type, style, prompt, css_template, checklist, css_vars`). Most fields can be merged or dropped; CSV Notes column compresses into rationale comments.
3. **Drop out-of-scope stacks.** Remove swiftui/react-native/flutter/jetpack-compose files. Keep web stacks only.
4. **Add wisp-design frontmatter.** Top of each `*.csv` file gets a markdown header comment block declaring source/license/attribution.
5. **Index into AgentDB HNSW.** Each row becomes a searchable record with embeddings. The `corpus` sub-namespace is rebuilt.

The forked corpus lives entirely under `skills/data/corpus/` once Phase 7 lands.

## Attribution requirements

Every file in this folder MUST carry the upstream attribution. The frontmatter pattern:

```yaml
---
source: ui-ux-pro-max
upstream: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill
upstream-commit: <SHA-pinned>
license: MIT
attribution: Adapted from nextlevelbuilder/ui-ux-pro-max-skill (MIT). Schema condensed; stacks scoped to web; indexed via AgentDB HNSW for wisp-design.
---
```

The CSV files themselves, which don't have YAML frontmatter, get a leading comment block:

```csv
# Source: nextlevelbuilder/ui-ux-pro-max-skill (MIT, https://github.com/nextlevelbuilder/ui-ux-pro-max-skill)
# Adapted for wisp-design: schema condensed to 6 columns; web stacks only.
# License: MIT
target_type,style,prompt,css_template,checklist,css_vars
...
```

## Why fork rather than depend

Three reasons:

1. **wisp-design lives offline.** Plugin install must NOT require a network fetch of an upstream package. The corpus has to be vendored.
2. **Search-engine swap.** Upstream uses Python+BM25 in a CLI. wisp-design uses Node + AgentDB HNSW. The corpus is the only shared artefact.
3. **Stack scoping.** Upstream targets 13 stacks; wisp-design targets 6. Forking lets us drop the irrelevant stacks cleanly.

## Why phased (Phase 4 sample → Phase 7 full)

The variant-generation loop in Phase 4 works fine with the curated anchors (`skills/data/anchors/`) and the live.md prompt. Adding the full corpus before the loop is proven is premature optimisation:

- Phase 4 validates: the loop works, anchors guide, anti-slop blocks.
- Phase 7 scales: full corpus + indexing + retrieval-augmented generation.

A working sample in Phase 4 also lets the indexer + search command be tested without depending on the full fork being ready.

## What the sample demonstrates

`sample-style-modern-minimal.csv` shows the expected shape for a single style category. Modern Minimal was chosen because it's the safest default (per `skills/data/anchors/open-design-modern-minimal.md`) and because its CSS surfaces are concrete enough to demonstrate the schema without ambiguity.

Each row in the sample:

- `target_type` — what UI element this row applies to (button, card, hero, …).
- `style` — the style category (always `modern-minimal` in this sample).
- `prompt` — the natural-language phrasing that should trigger this row in retrieval.
- `css_template` — the variant CSS that the model can adapt (NOT a finished output; a starting point).
- `checklist` — verification items (axe-aware, mobile-aware, dark-mode-aware).
- `css_vars` — the design-system variables the template binds to.

## Compliance

By licensing wisp-design as MIT and shipping this fork with explicit attribution, the project complies with the upstream MIT requirement:

> Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions: The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

The wisp-design `LICENSE` file at the repo root carries the MIT notice for both wisp-design and the upstream attributions accumulated across the corpus / directions / anchors layers.
