---
name: vault-restrained-cool
oneLiner: Linear-adjacent but cooler greys, more chromatic neutrals
source: vault
license: MIT
attribution: Distilled from Samuel Heftberger's vault Variant-Anchor-Map (`_brain/inspiration/taste-anchors/` synthesis). One of the 8 vault-derived anchors beyond the open-design 5.
---

# Anchor — Vault Restrained Cool

A Linear-adjacent anchor with intentionally cooler greys and a slightly chromatic neutral palette. Distinguishes from `linear` by sitting one step warmer and one step more saturated on the neutrals — better for products that want Linear's restraint but with a touch more personality.

## Visual signatures

- **Typography.** Inter or Geist Sans. Display weight 600, body 450-510. Tight tracking on display (-0.025 em). Body 14-15 px. Mono accents in IBM Plex Mono or JetBrains Mono.
- **Color.** Surface `oklch(10% 0.008 230)` (one step cooler than Linear). Foreground `oklch(94% 0.003 230)`. Borders chromatic-tinted (`oklch(22% 0.012 230 / 0.6)`). Accent rare; when present, ice blue (`oklch(70% 0.18 220)`) or saturated teal (`oklch(60% 0.16 195)`).
- **Density.** Linear-dense — 8-12 px row padding on lists. Slightly more line-height than Linear (1.5 vs 1.4).
- **Motion.** Subtle. 150-200 ms state transitions. No hover lifts. Reduced-motion friendly.

## Token-set

```css
:root {
  --rc-bg:        oklch(10% 0.008 230);
  --rc-bg-elev:   oklch(13% 0.01 230);
  --rc-fg:        oklch(94% 0.003 230);
  --rc-fg-muted:  oklch(62% 0.008 230);
  --rc-border:    oklch(22% 0.012 230 / 0.6);
  --rc-accent:    oklch(70% 0.18 220);
  --rc-accent-2:  oklch(60% 0.16 195);
  --rc-radius:    6px;
  --rc-pad:       12px;
  --rc-gap:       8px;
  --rc-ease:      cubic-bezier(0.4, 0, 0.2, 1);
}
```

## When to pick this

1. **Internal tools wanting personality beyond Linear.** When Linear feels too cold but the density preference holds.
2. **Dev-tool products with a "calm + capable" voice.** Slightly more inviting than Linear; still serious.
3. **Dark-mode-default products that want a hint of brand colour without compromising the restrained feel.**

## Counter-examples

1. **Marketing surfaces.** Same disqualifier as Linear — too dense, too cold for first-touch.
2. **Warm brands.** Use `vault-drenched-warm` instead.
3. **Brands committed to a specific brand hue.** This anchor is hue-flexible at the accent level but constrained at the surface level.
