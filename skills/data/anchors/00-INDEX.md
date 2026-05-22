---
description: Index of 13 variant-anchor reference cards. Loaded when a user references a reference app by name (e.g. "more like Linear"). Each anchor describes a visual language — typography, color, density, motion signatures — not a brand.
license: MIT
---

# Variant-Anchor Index

The variant-generation prompt (`skills/reference/live.md`) MUST acknowledge a chosen anchor in every variant's rationale. Anchors are the single highest-leverage quality hebel (vault audit: variants with explicit anchors scored 50% on the 5-dim rubric; without, 3%).

This file is the entry point. Each anchor in the table below has its own file with token-set, signatures, scenarios, and counter-examples.

| Anchor                    | Source        | One-liner                                                      | File                                |
| ------------------------- | ------------- | -------------------------------------------------------------- | ----------------------------------- |
| `linear`                  | vault         | Restrained, monochrome, sharp edges, focused                   | `linear.md`                         |
| `stripe`                  | vault         | Committed indigo, dense info, technical confidence             | `stripe.md`                         |
| `anthropic`               | vault         | Drenched warm, soft, considered, careful                       | `anthropic.md`                      |
| `aceternity`              | vault         | Full-palette neon, gradient-heavy, demo-y                      | `aceternity.md`                     |
| `apple`                   | vault         | Cinematic, spatial, motion-led, premium                        | `apple.md`                          |
| `editorial`               | open-design   | Magazine-style: serif, color, contrast                         | `open-design-editorial.md`          |
| `modern-minimal`          | open-design   | Sans, monochrome, generous whitespace                          | `open-design-modern-minimal.md`     |
| `tech-utility`            | open-design   | Dense, mono accents, functional clarity                        | `open-design-tech-utility.md`       |
| `brutalist`               | open-design   | Heavy weights, sharp edges, asymmetry                          | `open-design-brutalist.md`          |
| `soft-warm`               | open-design   | Pastel, rounded, gentle, friendly                              | `open-design-soft-warm.md`          |
| `vault-restrained-cool`   | vault         | Linear-adjacent but cooler greys, more chromatic neutrals      | `vault-restrained-cool.md`          |
| `vault-committed-indigo`  | vault         | Stripe-adjacent, deeper indigo, higher contrast                | `vault-committed-indigo.md`         |
| `vault-drenched-warm`     | vault         | Anthropic-adjacent, warmer accents, papery surfaces            | `vault-drenched-warm.md`            |

## Source attribution

- **vault** — distilled from Samuel Heftberger's design vault (`_brain/inspiration/reference-apps/*.md`, `_brain/inspiration/taste-anchors/*.md`). Original observations on real reference apps.
- **open-design** — adapted from open-design's 5 deterministic visual-direction presets (Apache-2.0, attributed: https://github.com/nexu-io/open-design). The presets are public knowledge of design archetypes; wisp-design re-describes them in its own words.

## Trademark note

The brand-name anchors (`linear`, `stripe`, `anthropic`, `aceternity`, `apple`) describe the VISUAL LANGUAGE associated with those products' public marketing surfaces. They make no trademark claim. Each card includes a "Reference" section pointing to the public site. wisp-design does not embed any proprietary assets (logos, fonts, photography) — it describes the design choices an external observer can see.

## How to pick an anchor

Priority order (also encoded in `skills/policy/anti-slop.md`):

1. If `freeText` references a reference app by name → use that anchor.
2. Else if `brandSpec.variantAnchor` is set → use that.
3. Else if `brandSpec.visualDirection` is set → use the matching open-design preset (`editorial`, `modern-minimal`, `tech-utility`, `brutalist`, `soft-warm`).
4. Else → declare "no anchor — house style" in the rationale.

## Anchor token-set shape

Each anchor file contains:

- **Frontmatter** — name, oneLiner, source, license, attribution.
- **Visual signatures** — typography, color, density, motion. 4-6 sentences.
- **Token-set** — 5-10 CSS-var defaults the variant prompt can drop in directly.
- **When to pick this** — 3 concrete scenarios.
- **Counter-examples** — 3 scenarios where this anchor is the wrong choice.
- **Reference** (only for brand-name anchors) — public URL.

## House style fallback

When no anchor applies, the variant prompt uses these defaults:

- 4 px spacing grid.
- OKLch neutrals, tinted toward brand hue (chroma 0.005-0.015).
- 1.333 type-scale step.
- System fonts (`-apple-system, "Segoe UI", system-ui`).
- `--ease-smooth: cubic-bezier(0.35, 0.35, 0, 1)` motion default.
- `--radius: 8px` (subtle).
- AA contrast minimum.

These map to a "considered but unopinionated" baseline. Most projects benefit from picking an actual anchor as soon as the brand direction is known.
