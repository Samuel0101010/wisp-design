---
name: playful-rounded
description: Heavily-rounded corners, friendly humanist sans, and soft pastel accents — the consumer-friendly direction with built-in a11y traps.
category: huashu-direction
license: MIT
attribution: Adapted from huashu-design (MIT, https://github.com/alchaincyf/huashu-design) `references/design-styles.md` — re-described in wisp-design's voice.
best-for: Children's apps, consumer fintech, onboarding, wellness, hospitality booking.
mood: [friendly, approachable, soft, optimistic]
maps-to-anchor: claymorphism
cautions: [a11y-risk]
---

# Playful Rounded

Softens the entire interface through corner-radius, humanist typography, and pastel accents. Cash App, Duolingo, Headspace, Calm operate here. Twin risks: pastel-on-pastel kills WCAG contrast; over-rounding (>24px on small elements) reads cartoonish. Done right, warm and competent; done wrong, a toy.

## Principles
- Corner radius substantial but proportional — 12-16px cards, 8-12px buttons.
- Humanist sans for warmth in letterforms.
- Pastel accents that PASS AA — chroma low, lightness considered.
- Generous spacing; large tap targets (44px min).
- Custom flat illustration welcome; never generic stock.

## Typography
- Söhne, Inter, or Mulish at 400/500/700.
- Body 16-17px with 1.55 line-height.
- Display 1.5-2× body at weight 700.
- Neutral tracking on body, slight negative on display.
- Numerals tabular for amounts.

## Color Palette
- Ground: `oklch(98% 0.01 80)`
- Surface: `oklch(95% 0.03 80)`
- Body: `oklch(22% 0.02 60)` (must hit AAA on ground)
- Accent: `oklch(70% 0.13 25)` (warm coral, AA-verified)
- Secondary: `oklch(70% 0.10 165)` (mint, AA-verified)
- All accents tested AA against ground AND each other.

## Layout Rules
- 12-16px radius cards dominate.
- 24-32px padding inside cards.
- 44px minimum tap targets.
- Illustration beside text, not behind (contrast-safe).
- Soft animations 250-400ms; respect `prefers-reduced-motion`.

## Anti-Slop Boundaries
- No pastel-on-pastel — every accent verified AA.
- No glassmorphism — soft surfaces are solid.
- No generic AI-style illustrations.
- No gradient text — warmth lives in typography.

## NEVER
- Pastel body text.
- Corner radius >24px on small elements.
- Drop shadows above 4px blur.
- Stock vector illustrations.
