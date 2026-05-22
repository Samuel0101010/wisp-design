---
name: vault-committed-indigo
oneLiner: Stripe-adjacent, deeper indigo, higher contrast
source: vault
license: MIT
attribution: Distilled from Samuel Heftberger's vault Variant-Anchor-Map (`_brain/inspiration/taste-anchors/` synthesis).
---

# Anchor — Vault Committed Indigo

A Stripe-adjacent anchor with deeper indigo commitment and higher contrast between accent and surface. Distinguishes from `stripe` by leaning further into saturation and pulling the surface palette toward more decisive light/dark separation.

## Visual signatures

- **Typography.** Sans (Inter, Söhne). Display weight 700. Tight tracking (-0.03 em). Body 16 px at weight 400 with line-height 1.55. Generous tracking on small caps for labels.
- **Color.** Surface `oklch(98% 0.01 260)` cool paper. Foreground `oklch(12% 0.02 260)` deep cool. Accent `oklch(40% 0.24 270)` deep indigo — saturation higher than Stripe. Border `oklch(88% 0.03 250)`. Gradients allowed only as background washes, single-hue family.
- **Density.** Marketing-dense like Stripe but with more contrast separation. Multi-column layouts. Code blocks abundant.
- **Motion.** Considered. 250-350 ms transitions. Scroll-tied colour washes. Hover states tighten rather than expand.

## Token-set

```css
:root {
  --ci-bg:           oklch(98% 0.01 260);
  --ci-bg-tint:      linear-gradient(180deg, oklch(98% 0.01 260) 0%, oklch(94% 0.04 260) 100%);
  --ci-fg:           oklch(12% 0.02 260);
  --ci-fg-muted:     oklch(42% 0.03 260);
  --ci-accent:       oklch(40% 0.24 270);
  --ci-accent-fg:    oklch(98% 0 0);
  --ci-accent-soft:  oklch(95% 0.06 270);
  --ci-border:       oklch(88% 0.03 250);
  --ci-radius:       8px;
  --ci-pad:          24px;
  --ci-h1-fs:        3.5rem;
  --ci-ease:         cubic-bezier(0.35, 0.35, 0, 1);
}
```

## When to pick this

1. **Developer-tooling marketing pages.** Stripe-adjacent products that want a stronger brand signature than Stripe's neutral palette.
2. **B2B products with one decisive brand colour.** Indigo as the brand statement — used confidently and consistently.
3. **API-product documentation.** High-contrast indigo accents on code blocks aid scanability.

## Counter-examples

1. **Brands without a blue-family identity.** Forcing indigo on an orange-first brand loses brand recognition.
2. **Calm consumer brands.** Indigo at 0.24 chroma is decisive — too loud for a `calm` voice.
3. **High-density admin tools.** The accent saturation fights with semantic-state colours (success green, warning amber).
