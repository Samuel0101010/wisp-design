---
name: stripe
oneLiner: Committed indigo, dense info, technical confidence
source: vault
license: MIT
attribution: Distilled from Samuel Heftberger's vault (`_brain/inspiration/reference-apps/stripe.md`). Describes visual language only; not affiliated with Stripe.
reference: https://stripe.com
---

# Anchor — Stripe

The Stripe aesthetic: committed indigo as primary, dense information layouts, gradient-as-frame (never as text), careful typography. Reads as "this is technical, this is precise, you can trust the engineering underneath."

## Visual signatures

- **Typography.** Sohne (or near-equivalent custom sans). Display weight 600-700. Body 16 px at weight 400. Negative tracking on display (-0.025 em). Generous line-height (1.5+) on body for scannability.
- **Color.** Surface: white or very light gradient (`oklch(98% 0.02 250) → oklch(95% 0.05 260)`). Accent: indigo at saturation (`oklch(45% 0.22 270)`). Gradients exist but on backgrounds and borders, never on text. Strong commitment to one hue across the brand.
- **Density.** Dense for a marketing site. Documentation-grade information density. Code blocks abundant. Multi-column layouts (`1.2fr 1fr` typical) for value-prop-plus-illustration.
- **Motion.** Subtle. Scroll-tied gradient washes. Hover states tighten elements rather than expanding them. 200-300 ms transitions on state.

## Token-set

```css
:root {
  --stripe-bg:        oklch(99% 0.005 250);
  --stripe-bg-tint:   linear-gradient(180deg, oklch(98% 0.02 250) 0%, oklch(95% 0.05 260) 100%);
  --stripe-fg:        oklch(15% 0.01 250);
  --stripe-fg-muted:  oklch(45% 0.02 250);
  --stripe-accent:    oklch(45% 0.22 270);
  --stripe-accent-fg: oklch(98% 0 0);
  --stripe-border:    oklch(90% 0.02 250);
  --stripe-radius:    8px;
  --stripe-pad:       24px;
  --stripe-h1-fs:     3.5rem;
  --stripe-ease:      cubic-bezier(0.35, 0.35, 0, 1);
}
```

## When to pick this

1. **Developer-facing landing pages.** Documentation-grade information density combined with marketing-grade polish.
2. **B2B SaaS for technical buyers.** The `formal` + `calm` + `authoritative` quadrant of the narrative-questions matrix.
3. **Products where the engineering IS the value.** When credibility comes from precision rather than emotion.

## Counter-examples

1. **Consumer-emotional products.** Stripe-style reads as "this is for the developer", not "this is for you". Use `anthropic` or `apple` for emotional registers.
2. **Brands with strong colour personality already.** If the brand is e.g. orange-first, forcing committed-indigo loses brand recognition. Use `vault-committed-indigo` only if the indigo is brand-true.
3. **Minimalist preferences.** Stripe is dense. If the user wants "more breathing room" as a baseline, start with `modern-minimal`.

## Reference

Stripe's design language is most visible on https://stripe.com — both the marketing site and the docs (https://stripe.com/docs). The two share visual language despite serving different functions, which is a Stripe-specific virtue.
