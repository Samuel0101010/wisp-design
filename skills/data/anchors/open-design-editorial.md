---
name: editorial
oneLiner: Magazine-style — serif, color, contrast
source: open-design
license: MIT
attribution: Adapted from open-design's "Editorial" visual-direction preset (Apache-2.0, https://github.com/nexu-io/open-design). Re-described in wisp-design's voice.
---

# Anchor — Editorial

The Editorial aesthetic: magazine-style typography, serif display + sans body, generous use of colour for emphasis, intentional asymmetry. Reads as "this is a publication." Use when content is the product.

## Visual signatures

- **Typography.** Serif display (Playfair, Cormorant, or near). Sans body (Inter, Söhne). Display sizes large (4-6 rem). Drop-caps allowed on opening paragraphs. Negative tracking on display, generous leading on body (1.7+).
- **Color.** Surface neutral (`oklch(97% 0.005 80)` cream-leaning) with high-contrast foreground. Accent saturated and used punctually — large blocks of pure colour as section dividers or background washes. Editorial colour palettes are bolder than typical SaaS.
- **Density.** Variable by section. Magazine-style content alternates between dense paragraphs and pull-quotes / full-bleed images. Layout is intentionally asymmetric — 60/40 splits, not 50/50.
- **Motion.** Subtle. Scroll-tied reveal of section headings. Hover states on links underline-thicken or shift colour, never animate transforms.

## Token-set

```css
:root {
  --ed-bg:           oklch(97% 0.005 80);
  --ed-fg:           oklch(15% 0.005 50);
  --ed-fg-muted:     oklch(40% 0.01 50);
  --ed-accent:       oklch(45% 0.22 25);
  --ed-display-font: "Playfair Display", "Cormorant Garamond", Georgia, serif;
  --ed-body-font:    "Inter", system-ui, sans-serif;
  --ed-h1-fs:        clamp(2.5rem, 6vw, 5rem);
  --ed-body-fs:      1.125rem;
  --ed-body-lh:      1.7;
  --ed-radius:       2px;
  --ed-pad:          32px;
}
```

## When to pick this

1. **Content-driven sites.** Magazines, long-form blogs, research publications.
2. **Brands with strong editorial voice.** When the prose IS the brand and the visuals frame it rather than carry it.
3. **Hospitality, fashion, food, culture.** Categories where readers expect typographic sophistication.

## Counter-examples

1. **Dense data UIs.** Serif display at 5 rem doesn't fit in a dashboard.
2. **B2B technical products.** Editorial reads as "leisure read"; wrong tone for "evaluate this tool".
3. **Performance-marketing landing.** The pace is too slow for conversion-driven flows.
