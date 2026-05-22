---
name: vault-drenched-warm
oneLiner: Anthropic-adjacent, warmer accents, papery surfaces
source: vault
license: MIT
attribution: Distilled from Samuel Heftberger's vault Variant-Anchor-Map (`_brain/inspiration/taste-anchors/` synthesis).
---

# Anchor — Vault Drenched Warm

An Anthropic-adjacent anchor with warmer accent colours and an even more papery surface treatment. Distinguishes from `anthropic` by allowing slightly more colour expression — terracotta and clay accents at higher chroma, while preserving the slow rhythm and considered restraint.

## Visual signatures

- **Typography.** Serif display (Tiempos, Cormorant) paired with humanist sans body (Inter, Söhne). Body weight 450-500. Generous line-height (1.65+). Display sizes moderate (3-4 rem).
- **Color.** Surface `oklch(95% 0.04 70)` warm cream-papery. Foreground `oklch(22% 0.025 35)` warm dark. Accent terracotta `oklch(55% 0.18 30)` or clay `oklch(60% 0.14 50)`. Borders barely visible (`oklch(88% 0.04 60)`).
- **Density.** Generous. Section spacing 80-120 px. Body width 60-70 ch. Padding tiers feel slow.
- **Motion.** Minimal. Colour-based transitions only. No transforms unless functional.

## Token-set

```css
:root {
  --dw-bg:           oklch(95% 0.04 70);
  --dw-bg-elev:      oklch(97% 0.03 70);
  --dw-fg:           oklch(22% 0.025 35);
  --dw-fg-muted:     oklch(42% 0.03 40);
  --dw-accent:       oklch(55% 0.18 30);
  --dw-accent-2:     oklch(60% 0.14 50);
  --dw-border:       oklch(88% 0.04 60);
  --dw-radius:       6px;
  --dw-pad:          32px;
  --dw-section-y:    96px;
  --dw-body-lh:      1.7;
  --dw-h1-fs:        3rem;
  --dw-display-font: "Tiempos Text", "Cormorant Garamond", Georgia, serif;
  --dw-ease:         cubic-bezier(0.4, 0, 0.6, 1);
}
```

## When to pick this

1. **Research-tone products with brand personality.** Anthropic's restraint plus a hint of warm expression — for products that want to feel both serious and inviting.
2. **Long-form content with a warm voice.** Essays, considered journalism, founder-led brand storytelling.
3. **Consumer-research products.** Health, wellness, study aids — categories where warmth makes the user feel met.

## Counter-examples

1. **Performance-marketing landings.** The slow rhythm reads as "I am thoughtful" — wrong for conversion-driven contexts.
2. **High-density admin UIs.** Same disqualifier as Anthropic; the generous spacing wastes screen real estate.
3. **Tech-utility products.** Drenched warmth fights with the functional-clarity register that developer tools need.

## Pairing note

When choosing between `anthropic` and `vault-drenched-warm`:

- `anthropic` — almost monochrome with rare terracotta accent. Reads as "minimal warm".
- `vault-drenched-warm` — same papery base but accent is part of the system. Reads as "expressive warm".

The difference is one degree on the personality dial.
