---
name: monochrome-minimal
description: Pure greyscale interface where all hierarchy emerges from weight, size, and spacing — no chroma, no accent colour, no decorative elements.
category: huashu-direction
license: MIT
attribution: Adapted from huashu-design (MIT, https://github.com/alchaincyf/huashu-design) `references/design-styles.md` — re-described in wisp-design's voice.
best-for: Photography portfolios, design studios, agencies, content-first products.
mood: [restrained, confident, considered, content-first]
maps-to-anchor: editorial
cautions: []
---

# Monochrome Minimal

Strips colour entirely and forces every hierarchy decision through weight, size, and whitespace. The absence of chroma reads as confidence — when the rhythm is right. The look lives or dies by its type scale and breathing room.

## Principles
- Hierarchy via weight (300/400/600/800) and size; never colour.
- Negative space is a primary element.
- One typeface; two at most with strict role separation.
- Photography carries any chromatic warmth.
- Hairline rules at low values for separation.

## Typography
- Inter, Söhne, or Helvetica Neue throughout.
- Weights: 300 captions, 400 body, 600 subheads, 800 display.
- 1.25 scale for editorial; 1.333 for marketing.
- Tracking neutral on body; -0.02em on display.

## Color Palette
- Ground: `oklch(98% 0 0)`
- Body: `oklch(20% 0 0)`
- Hairline: `oklch(85% 0 0)`
- Surface: `oklch(95% 0 0)`
- Muted: `oklch(50% 0 0)`
- All ratios pass WCAG AA.

## Layout Rules
- 12-column grid with generous outer gutters.
- 65ch prose width, 1200px utility max.
- Section breaks via hairline OR whitespace, never both.
- No card backgrounds except when density demands.
- Images full-bleed or column-aligned; no rounded crops.

## Anti-Slop Boundaries
- No "subtle gradient" accent — accent doesn't exist here.
- No gradient text, glassmorphism, side-stripe patterns.
- No purple-blue gradient fallback when stuck — add whitespace.

## NEVER
- Coloured accent buttons (use weight contrast).
- Drop shadows below z-1 surfaces.
- Pure `#000` on pure `#fff`.
- Decorative dividers or ornament.
