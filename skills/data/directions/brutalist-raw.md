---
name: brutalist-raw
oneLiner: System fonts, sharp corners, oversized type, hard borders.
category: huashu-direction
license: MIT
attribution: Adapted from huashu-design (MIT, https://github.com/alchaincyf/huashu-design) `references/design-styles.md` — re-described in wisp-design's voice. Web-brutalism heritage: bloomberg.com, awwwards-2016-2018, balenciaga.com.
best-for: Studios, agencies, music labels, conferences, art platforms, anti-corporate brands.
mood: [confrontational, honest, unpolished, expressive]
maps-to-anchor: brutalist
cautions: ["Reads as confrontational on first visit — wrong default for trust-driven SaaS or finance. Match brand voice before applying."]
---

# Brutalist Raw

Brutalism on the web rejects the smooth, the rounded, the polished. It exposes the construction — system fonts, raw HTML elements, default browser styles, hard rectangles. The aesthetic is the opposite of "trust me with your money": it says "we know what we're doing and we don't need a gradient to prove it".

## Principles

- **System fonts only.** `-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif`. No webfonts. The OS dictates the typeface.
- **Sharp corners.** `border-radius: 0` is the default. Rounding is reserved for explicit semantic purpose.
- **Oversized type.** Headlines at 6-10rem. The page screams.
- **Hard borders.** 1-3px solid borders, no shadows. Cards are rectangles, not surfaces.
- **Asymmetry over symmetry.** Layouts off-balance on purpose. Negative space uneven.
- **Raw form elements.** Native `<input>`, native `<select>`, native `<button>`. No restyling unless functionally necessary.

## Typography

- **Display:** System font, weight 800-900, scale 2.0 (golden ratio).
- **Body:** System font, weight 400, line-height 1.4 (tight by design).
- **Mono:** System mono (`ui-monospace`) for code, labels, metadata.
- **Numerals:** `tabular-nums`, mono-feel preferred.

## Palette (OKLCH)

- Ground: `oklch(99% 0 0)` (off-white) or `oklch(15% 0 0)` (off-black) — high contrast either way
- Foreground: `oklch(10% 0 0)` or `oklch(95% 0 0)`
- Accent: `oklch(60% 0.30 30)` (raw orange) or `oklch(55% 0.30 145)` (chemical green)
- Border: `oklch(0% 0 0)` — true black hard-rules ARE the brutalist signature

## Layout

CSS Grid with explicit `grid-template-areas`. Off-grid placement intentional. Items extending beyond viewport allowed. Mobile may stack differently than desktop in non-obvious ways.

## NEVER

- `border-radius` > 4px anywhere.
- Box-shadows. Brutalism has no fake depth.
- Gradient anything.
- Loading-spinner animations. The page either loads or doesn't.
- Stock photography. Use uploaded photos, raw screenshots, or no images.
