---
name: editorial-luxury
oneLiner: Display serif (Didot/Bodoni), generous whitespace, gold/black accents, restrained.
category: huashu-direction
license: MIT
attribution: Adapted from huashu-design (MIT, https://github.com/alchaincyf/huashu-design) `references/design-styles.md` — re-described in wisp-design's voice. Heritage: Vogue, Aman, Tiffany, Hermès editorial properties.
best-for: Luxury hospitality, premium fashion, fine jewellery, private wealth, heritage brands.
mood: [refined, exclusive, considered, quiet]
maps-to-anchor: editorial
cautions: ["Whitespace-heavy by design — fights against content-dense SaaS layouts. Wrong default for B2B tooling."]
---

# Editorial Luxury

Where `editorial-magazine` is for reading, `editorial-luxury` is for being read AT. Whitespace is generous to the point of audacity; type is set at display weights with precise tracking; the palette is restricted to two values and a metallic accent. The page says "we have considered everything, including how much you would dislike clutter".

## Principles

- **Whitespace is currency.** Section padding 120-200px vertical. Margins generous to the point of feeling under-utilised — that IS the point.
- **High-contrast display serif.** Didot, Bodoni, Playfair Display, Italiana. Stroke contrast extreme.
- **Two-value palette + one metallic.** Black, white, and gold (or ivory + black + brass). Resist the temptation to add a third.
- **Tracking is design.** Display headlines often run at `letter-spacing: 0.04-0.1em` for monumental feel.
- **No icons.** Luxury brands trust text. Icons read as utilitarian.

## Typography

- **Display:** Didot, Bodoni 72, Playfair Display, Italiana. Weight 400-500 (the high-contrast strokes carry the visual weight). Scale 1.414 (musical fifth).
- **Body:** same display serif OR a paired humanist sans (Optima, Avenir Next) at weight 400, line-height 1.7, max 56ch.
- **Eyebrows / labels:** uppercase, +0.18em tracking, weight 500, 11px. Set in a transitional sans.
- **Numerals:** `oldstyle-nums` in prose, `tabular-nums` for prices and figures.

## Palette (OKLCH)

- Ground: `oklch(99% 0.005 80)` (warm ivory) or `oklch(8% 0.005 80)` (warm black)
- Foreground: inverse of ground, equally warm
- Accent (gold): `oklch(75% 0.12 90)`
- Accent (brass alt): `oklch(60% 0.10 80)`
- Hairline: `oklch(85% 0.005 80)` on light, `oklch(25% 0.005 80)` on dark

## Layout

12-column with VERY wide outer margins (12-16% per side at desktop). Hero sections occupy full viewport-height with a single centred composition. Imagery occupies meaningful space — never thumbnails, never grids of three. One image, captioned.

## NEVER

- More than 3 typographic sizes per viewport.
- Background gradients. Solid grounds only.
- Buttons with rounded-pill shapes. Rectangular only, often borderless underline-on-hover.
- Hero-metric template — antithetical to the restraint.
- More than ONE accent colour. Gold OR brass, never both.
- Drop shadows. Hairlines and groundlines only.
