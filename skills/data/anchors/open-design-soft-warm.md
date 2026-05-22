---
name: soft-warm
oneLiner: Pastel, rounded, gentle, friendly
source: open-design
license: MIT
attribution: Adapted from open-design's "Soft Warm" visual-direction preset (Apache-2.0, https://github.com/nexu-io/open-design). Re-described in wisp-design's voice.
---

# Anchor — Soft Warm

The Soft Warm aesthetic: pastel surfaces, rounded corners, friendly typography, gentle motion. Reads as "this is safe and welcoming." Choose for brands that need to feel approachable rather than authoritative.

## Visual signatures

- **Typography.** Humanist sans (Manrope, DM Sans, Nunito, Plus Jakarta Sans). Rounded letterforms preferred over geometric. Mid-weight defaults (500 body, 600 headline). Body line-height generous (1.6+).
- **Color.** Pastel surface (`oklch(96% 0.03 60)` warm cream, `oklch(94% 0.04 30)` peach, `oklch(95% 0.04 100)` mint). Foregrounds warm dark (`oklch(25% 0.02 30)`). Accents low-chroma warm — terracotta, sage, butter yellow. Never pure black on pure white.
- **Density.** Generous. Padding tiers higher than Modern Minimal. Section spacing slow. Touch targets larger than minimum (52+ px common).
- **Motion.** Gentle. `--ease-smooth` defaults. State changes via colour + slight scale (1.02). Hover lifts soft (1-2 px). No sharp easing.

## Token-set

```css
:root {
  --sw-bg:        oklch(96% 0.03 60);
  --sw-bg-elev:   oklch(98% 0.02 60);
  --sw-bg-card:   oklch(94% 0.04 30);
  --sw-fg:        oklch(25% 0.02 30);
  --sw-fg-muted:  oklch(45% 0.025 40);
  --sw-accent:    oklch(60% 0.14 30);
  --sw-success:   oklch(60% 0.12 145);
  --sw-border:    oklch(88% 0.04 50);
  --sw-radius:    16px;
  --sw-radius-pill: 9999px;
  --sw-pad:       28px;
  --sw-section-y: 80px;
  --sw-ease:      cubic-bezier(0.35, 0.35, 0, 1);
}
```

## When to pick this

1. **Wellness, education, family-oriented products.** Categories where warmth IS the value proposition.
2. **Onboarding flows.** New users need reassurance; soft-warm reads as "this won't be hard".
3. **Community platforms.** Friendly trumps efficient.

## Counter-examples

1. **Trust-via-precision brands.** Soft-warm reads as "approachable but not necessarily expert". Use `stripe` or `tech-utility` when expertise is the core message.
2. **Edgy or counterculture brands.** Soft-warm contradicts the brand intent entirely.
3. **High-information-density UIs.** Soft-warm's generosity wastes screen real estate in dashboards.

## Anti-slop note

Soft-warm is the most-imitated AI-generated style after gradient-text. Common slop patterns to AVOID:

- Cartoon human illustration. Use real photography or no illustration.
- Pastel-plus-gradient. Pastels are warm enough; gradients fight the calm tone.
- Overuse of `border-radius: 9999px` on every element. Pills are for buttons; cards stay at 16 px.
