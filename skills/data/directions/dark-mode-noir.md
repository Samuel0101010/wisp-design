---
name: dark-mode-noir
description: True-black ground with restrained single-hue accent and thin typography — dark mode as a primary surface, not an inverted afterthought.
category: huashu-direction
license: MIT
attribution: Adapted from huashu-design (MIT, https://github.com/alchaincyf/huashu-design) `references/design-styles.md` — re-described in wisp-design's voice.
best-for: Developer tools, music apps, cinematography portfolios, evening-usage products.
mood: [cinematic, focused, premium, after-hours]
maps-to-anchor: linear-dark
cautions: [a11y-risk]
---

# Dark Mode Noir

Dark mode treated as a primary design surface. Descends from cinematography colour-grading: true-black grounds, a single restrained accent, type weighted for legibility against deep surfaces. The discipline is restraint — most dark interfaces fail by over-saturating accents.

## Principles
- True-black ground, not navy or slate.
- Exactly one accent hue across the system.
- Thin-to-regular weights only; bold on dark reads as shouting.
- Surfaces stack via lightness lift, not borders.
- Photography carries warmth; chrome stays cool.

## Typography
- Inter or IBM Plex Sans at 300/400/500.
- Body 15-16px with 1.6 line-height — dark needs breathing.
- No weight above 500 except display headlines.
- Letter-spacing +0.01em on body for optical compensation.

## Color Palette
- Ground: `oklch(12% 0 0)`
- Surface-1: `oklch(15% 0 0)`
- Surface-2: `oklch(18% 0 0)`
- Body: `oklch(90% 0 0)`
- Muted: `oklch(60% 0 0)`
- Accent: `oklch(70% 0.15 250)` (one hue only)
- Body-on-ground contrast ≥ 13:1.

## Layout Rules
- Surfaces stack via lightness, not borders.
- More whitespace than light mode, not less.
- Accent reserved for interactive states and primary CTA.
- Hairlines at `oklch(25% 0 0)` for quiet separators.
- No drop shadows — invisible on dark.

## Anti-Slop Boundaries
- No purple-blue gradient — one hue, committed.
- No glassmorphism on dark hero — reads as muddy.
- No gradient text for "premium" — restraint reads premium.

## NEVER
- Pure `#000` ground (hides surface stack).
- Multi-hue accent system.
- Bold body text.
- Drop shadows on z-1 surfaces.
