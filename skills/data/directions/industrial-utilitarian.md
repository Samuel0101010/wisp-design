---
name: industrial-utilitarian
description: Concrete-grey palette with oversized type, hard right-angles, and zero decoration — function-first interface modeled on industrial signage and machine UIs.
category: huashu-direction
license: MIT
attribution: Adapted from huashu-design (MIT, https://github.com/alchaincyf/huashu-design) `references/design-styles.md` — re-described in wisp-design's voice.
best-for: Manufacturing, logistics, industrial SaaS, B2B operations, fleet management.
mood: [functional, durable, no-nonsense, machine-grade]
maps-to-anchor: industrial-utility
cautions: []
---

# Industrial Utilitarian

Takes seriously the aesthetic of industrial signage, machine interfaces, and shop-floor instrumentation. Concrete-grey surfaces; large condensed type; right-angles dominate. Decoration is a maintenance cost. Reads as durable — built for reading at distance, in poor light, by someone wearing gloves.

## Principles
- Concrete-grey ground — never warm, never pure.
- Type larger than fashion permits — 18-20px body minimum.
- Right-angles everywhere; `border-radius: 0` default.
- Iconography silhouette-only, or text labels.
- Status uses convention (yellow-warn, red-stop) without re-interpretation.

## Typography
- Display: Roboto Condensed, Barlow Condensed, or DIN 1451.
- Body: Roboto, Inter, or Söhne at weight 500.
- Numerals tabular, large, lining.
- All-caps with +0.04em tracking on status labels.
- No italics; emphasis via weight or colour.

## Color Palette
- Ground: `oklch(85% 0.005 240)` (concrete grey)
- Surface: `oklch(78% 0.005 240)`
- Body: `oklch(20% 0 0)`
- Caution: `oklch(78% 0.18 95)`
- Stop: `oklch(55% 0.22 25)`
- Go: `oklch(60% 0.18 145)`

## Layout Rules
- Grid-snapped to 8px increments.
- Status indicators always visible without hover.
- Tables and lists dominate; cards rectangular only.
- Section dividers via thick rules (2-3px), not hairlines.
- Iconography paired with text label always.

## Anti-Slop Boundaries
- No gradients — fail in low-light/glare conditions.
- No glassmorphism — hides critical information.
- No decorative animations — motion is for status changes only.

## NEVER
- Rounded corners.
- Pastel status colours.
- Drop shadows.
- Body text under 16px.
