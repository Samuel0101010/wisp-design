---
name: editorial-magazine
oneLiner: Cambria/Georgia serif headlines, monospace eyebrows, hairline rules, ivory/cream ground.
category: huashu-direction
license: MIT
attribution: Adapted from huashu-design (MIT, https://github.com/alchaincyf/huashu-design) `references/design-styles.md` — re-described in wisp-design's voice.
best-for: Long-form content, fashion, hospitality, food writing, premium journalism.
mood: [literary, considered, slow-read, hospitable]
maps-to-anchor: editorial
cautions: []
---

# Editorial Magazine

Direction descended from print magazines (`The New York Times Magazine`, `Aperture`, `Apartamento`). The pleasure of an editorial page is rhythm: a heavy serif headline, a hair-thin sans rule, generous margins, and an entire ecosystem of text styles that whisper "this was edited".

## Principles

- **Type does the work.** No decorative chrome. The headline IS the design.
- **Hairline rules separate**, not borders or boxes. 0.5px or 1px lines at low chroma.
- **Asymmetric whitespace.** Outer margins narrower than inter-column gutters — the page feels like an open spread.
- **Drop-caps and small-caps allowed.** First letter of feature stories at 4-5× body size.
- **Sans for utility, serif for voice.** Eyebrows, captions, metadata in mono or geometric sans; headlines and body in serif.

## Typography

- **Display:** Cambria, Georgia, Iowan Old Style, GT Sectra, Tiempos. Weight 400-600, scale 1.333+.
- **Body:** same serif family at 16-18px, line-height 1.6-1.75, max 65ch.
- **Eyebrow / metadata:** JetBrains Mono or IBM Plex Mono at 11-13px, uppercase, +0.08em tracking.
- **Numerals:** `font-variant-numeric: oldstyle-nums` for prose; `tabular-nums` for data.

## Palette (OKLCH)

- Ground: `oklch(97% 0.012 80)` (ivory)
- Body: `oklch(20% 0.008 60)` (warm near-black)
- Rule / hairline: `oklch(70% 0.008 60)`
- Accent: `oklch(38% 0.14 25)` (deep terracotta)
- Highlight: `oklch(92% 0.04 80)` (cream wash)

## Layout

12-column grid with wide outer gutters. Headlines may break the grid intentionally. Pull-quotes set in display weight, no quote marks (em-rules used inline only — never in UI chrome). Images full-bleed or quarter-column; no in-betweens.

## NEVER

- Sans-serif body.
- Background gradients of any kind.
- Drop shadows. Hairline rules only.
- Pure `#000` on pure `#fff` — always warm-tinted.
- Hero-metric template.
