---
description: Attribution and fork plan for the Design Directions corpus. Phase 4 ships only the INDEX; Phase 7 forks the full content from huashu-design under MIT attribution.
license: MIT
attribution: Source corpus is huashu-design's `references/design-styles.md` (MIT, https://github.com/alchaincyf/huashu-design).
---

# Design Directions — README

## What lives in this folder

In Phase 4 (current):

- `00-INDEX.md` — the table of 25 design directions with one-liners.
- `README.md` — this file.

In Phase 7 (post-launch prep):

- One file per direction (e.g. `minimalism-swiss.md`, `brutalism.md`, `cyberpunk-neon.md`), each containing:
  - Frontmatter (name, oneLiner, source, license, attribution).
  - 3-5 visual hallmarks (concrete CSS choices).
  - 3-5 mood keywords (semantic frame for variant prompts).
  - Reference work or designer (when applicable, with public link).
  - Sample HTML snippet illustrating the direction.

## Why phased

Forking 25 direction files at once would crater Phase 4's signal-to-noise. The Phase 4 variant-generation loop primarily uses ANCHORS (`skills/data/anchors/`), not directions. The directions become useful in:

1. The Brand-Asset-5-10-2-8 protocol's 10-minute mood-board stage (`skills/methodology/brand-asset-5-10-2-8.md`).
2. Cold-start scenarios where the user's brief is vague.

Both are post-MVP for Phase 4. Phase 7 (`launch prep`) is the right time to materialise the full corpus.

## Source and license

The 25 directions are adapted from huashu-design's `references/design-styles.md` (MIT-licensed, https://github.com/alchaincyf/huashu-design). The huashu-design corpus catalogs 20+ design philosophies with rationale, hallmarks, and reference work. wisp-design adopts the LIST (the corpus structure) and the FRAME (one-liner + hallmarks + mood + reference), but rewrites the content in wisp-design's voice and adds 5 directions of its own.

### Attribution requirement

Every direction file MUST include a frontmatter `attribution` field pointing to huashu-design and noting the MIT licence. Example:

```yaml
---
name: brutalism
attribution: Adapted from huashu-design (MIT, https://github.com/alchaincyf/huashu-design) `references/design-styles.md` — re-described in wisp-design's voice.
license: MIT
---
```

The 5 wisp-design-originated directions (those marked in the INDEX with `source: vault`) do not require huashu attribution — but they DO need vault attribution.

## Fork plan (Phase 7)

The forking work, when it happens:

1. **Pull huashu-design's `references/design-styles.md`** at the commit referenced in `research/repos/huashu-design.md`.
2. **Split per-direction.** Each section in huashu's monolithic file becomes its own wisp-design file.
3. **Rewrite in wisp-design voice.** Same content, different phrasing — preserves the discrimination of the source while preventing copy-paste duplication of competing skills.
4. **Add wisp-design extras.** Token-set mappings (which anchors fit the direction), concrete HTML samples, mood keyword list aligned to wisp's vocabulary.
5. **AgentDB-HNSW index.** Each direction file is indexed into the `directions` sub-namespace via `wisp-design skills index --namespace directions`.

## Currently missing from the index

The Phase 4 INDEX is intentionally incomplete (lazy-load mentality). Known gaps to fill in Phase 7:

- Information-architecture-driven directions (atomic-design, content-first, hyperlinking).
- Motion-poetic directions (image-sequence-scrub, sticky-image-stack, lenis-foundation).
- Emerging directions (post-AI restraint, anti-template, intentional incompleteness).

These map to vault-source patterns (`_brain/patterns/scroll-narrative.md`, etc.) more cleanly than huashu's HTML-output-focused list. Phase 7 will reconcile.

## Why not Phase 4

Reasonable question. Three reasons:

1. **The variant loop doesn't need directions.** Variants reference ANCHORS; directions are above-the-loop concepts.
2. **Forking 20-25 files for "discoverability" inflates the Phase 4 surface unnecessarily.** Better to land tight and grow.
3. **The fork itself is licence-trivial but voice-heavy.** Rewriting 25 design-philosophy descriptions in wisp's voice is a 4-hour task. Better budgeted alongside launch prep than during agent-loop work.

## What to do if the user asks for a direction file in Phase 4

The Phase 4 fallback: respond with the one-liner from `00-INDEX.md` and either:

1. Resolve to an anchor — e.g. user asks for `editorial-magazine` direction → use `editorial` anchor (`skills/data/anchors/open-design-editorial.md`).
2. State the gap honestly: "Full direction file lands in Phase 7. For now I'll use the closest anchor and note this limitation in my rationale."

Never fake content; never auto-generate a placeholder direction file. The Phase 7 forks are deliberate; Phase 4 stays honest about the gap.
