---
name: cyberpunk-neon
description: Saturated magenta-cyan-yellow palette on near-black with glow accents and aggressive typography — high-energy, narrowly applicable, easy to slop.
category: huashu-direction
license: MIT
attribution: Adapted from huashu-design (MIT, https://github.com/alchaincyf/huashu-design) `references/design-styles.md` — re-described in wisp-design's voice.
best-for: Gaming, music platforms, demos, hackathon brands, niche entertainment.
mood: [aggressive, kinetic, high-energy, dystopian]
maps-to-anchor: cyberpunk-neon
cautions: [anti-slop-adjacent, a11y-risk]
---

# Cyberpunk Neon

Narrow legitimate use, broad slop risk. Descends from Blade Runner colour-grading and arcade marquees: saturated complementaries against deep darkness, type that feels broadcast rather than typeset. Done wrong, reads as Fiverr-tier "futuristic". Use only with genuine high-energy brand permission.

## Principles
- Saturated chroma against true-black — magenta, cyan, sulfur.
- Glow is a TOOL for emphasis, not a decorative default.
- Type is broadcast — wide tracking, all-caps, condensed.
- Asymmetry welcome; centred symmetry forbidden.
- One scene-grade temperature — pick warm-cyan or cool-magenta.

## Typography
- Display: Druk, Monument Extended, NB Architekt.
- Body: clean grotesk (Inter, Söhne) to prevent fatigue.
- All-caps with +0.10em tracking on display.
- Numerals tabular, often in accent colour.
- One italic/skewed accent per view, not throughout.

## Color Palette
- Ground: `oklch(13% 0 0)`
- Magenta: `oklch(65% 0.30 0)`
- Cyan: `oklch(75% 0.18 200)`
- Sulfur: `oklch(88% 0.22 100)`
- Text: `oklch(92% 0.02 200)`
- Body-on-ground passes AA — use off-white for body, neons for headings/accents only.

## Layout Rules
- Asymmetric — no centred symmetry.
- Glow via single-hue diffusion, max 12px blur.
- Scanlines at <5% opacity only.
- One photographic image per view, scene-graded.
- Motion respects `prefers-reduced-motion`.

## Anti-Slop Boundaries
- No purple-blue gradient — kills the aesthetic instantly.
- No glassmorphism on top of glow — visual mud.
- Neon never as default UI colour.
- Body text NEVER in neon.

## NEVER
- Generic "futuristic" 3D stock illustrations.
- Stacked glow + blur + gradient.
- Neon body text.
- Purple-blue diagonal gradient.
