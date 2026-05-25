---
name: swiss-international-style
oneLiner: Akzidenz/Inter, grid-aligned, blacks-and-reds, no decoration.
category: huashu-direction
license: MIT
attribution: Adapted from huashu-design (MIT, https://github.com/alchaincyf/huashu-design) `references/design-styles.md` — re-described in wisp-design's voice. Roots in Müller-Brockmann, Hofmann, Bill.
best-for: Trust-driven SaaS, professional services, transit/wayfinding, museums, civic.
mood: [rigorous, neutral, objective, durable]
maps-to-anchor: modern-minimal
cautions: []
---

# Swiss International Style

The grid is not a suggestion. Type is set with intent. Decoration is failure. This is the design language that gave the 20th century its train timetables, civic posters, and the Helvetica subway signs — and gave the 21st century Stripe, Linear, Vercel, and Anthropic.

## Principles

- **Mathematical grid.** 8 or 12 columns, equal gutters. Every element snaps.
- **Sans-serif only.** Akzidenz-Grotesk, Helvetica, Inter, IBM Plex Sans. One family. Weight contrast carries hierarchy.
- **Flat colour blocks.** No gradients, no shadows. Optical contrast comes from value and chroma, not depth.
- **Asymmetric balance.** Left-aligned text, asymmetric image placement. Centring is reserved for posters.
- **The negative space is content.** Whitespace is not "empty" — it's structural.

## Typography

- **Headlines:** Inter / Helvetica Neue. Weight 500-700. Scale 1.25 (musical fourth) or 1.333.
- **Body:** same family, weight 400, line-height 1.5, 60-72ch max.
- **Caps:** uppercase only for short labels (≤ 16 chars), +0.02em tracking.
- **Numerals:** `tabular-nums` everywhere. This is functional design.

## Palette (OKLCH)

- Ground: `oklch(98% 0.003 250)`
- Foreground: `oklch(15% 0.005 250)`
- Accent (red): `oklch(55% 0.22 25)` — the Swiss-poster red
- Accent (alt): `oklch(45% 0.18 250)` — restrained blue, for trust contexts
- Rule: `oklch(85% 0.005 250)`

## Layout

12-column with consistent inter-column gutters. Type sets to the grid; images crop to it. Buttons are rectangular, slightly rounded if at all (≤ 4px). Forms align to the same grid as body text.

## NEVER

- Decorative borders, ornaments, "flourishes".
- Centred body copy.
- More than 3 weights from the same family.
- Drop shadows other than `box-shadow: none`.
- Gradient backgrounds.
- Sans-serif paired with serif — Swiss style is mono-cultured by doctrine.
