---
name: glass-architectural
description: VERY restrained glassmorphism used ONLY on layer-2+ modal surfaces (never hero, never background) with reasoned use of backdrop-blur — the legitimate-use line for an otherwise-banned pattern.
category: huashu-direction
license: MIT
attribution: Adapted from huashu-design (MIT, https://github.com/alchaincyf/huashu-design) `references/design-styles.md` — re-described in wisp-design's voice.
best-for: Modal overlays, command palettes, contextual menus on photography-heavy backgrounds, Apple-platform apps.
mood: [layered, considered, premium, contextual]
maps-to-anchor: glassmorphism
cautions: [anti-slop-adjacent]
---

# Glass Architectural

Documents where glassmorphism is LEGITIMATE rather than slop. The default anti-slop policy bans glass because 95% of its use is decorative — applied to hero and primary chrome where it hides content. The legitimate 5%: contextual layers (modals, palettes, tooltips) above primary content where seeing what's behind has actual value. This direction is the LINE.

## Principles
- Glass on z-index 2+ surfaces ONLY — modals, palettes, menus.
- Glass NEVER on hero, background, or default chrome.
- `backdrop-filter: blur()` always paired with solid-colour fallback.
- The surface behind the glass must be intentionally chosen content.
- Glass surface uses `rgba()`/`oklch()` with alpha, not pseudo-glass via gradient.

## Typography
- Body sits ON glass — verify AA against worst-case underlying content.
- Inter or Söhne at weight 500 (slightly heavier) for legibility.
- Body 15-16px with 1.55 line-height.
- No type weight below 400 on glass surfaces.

## Color Palette
- Glass on dark: `oklch(20% 0 0 / 0.65)` with `backdrop-filter: blur(18px) saturate(140%)`
- Glass on light: `oklch(98% 0 0 / 0.70)` with `backdrop-filter: blur(20px) saturate(140%)`
- Border: `oklch(100% 0 0 / 0.15)` (1px hairline)
- Body: full opacity, AA verified against solid fallback.
- No gradient inside glass — blur IS the visual interest.

## Layout Rules
- 1px hairline border at low alpha — defines the edge.
- 24-32px inner padding — glass needs breathing room.
- Rounded corners (12-16px) — sharp edges read as glitchy.
- High-contrast content on glass — no muted secondary text.
- Glass layers do NOT stack — one per view.

## Anti-Slop Boundaries
- No glass on hero or full-bleed background.
- No glass-on-glass stacking.
- No glass + gradient inside — pick one effect.
- No glass without `@supports not (backdrop-filter)` fallback.

## NEVER
- Glass on primary background.
- Glass + gradient + drop shadow stacked.
- Glass without fallback.
- Glass where it adds no information value.
