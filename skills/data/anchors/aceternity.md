---
name: aceternity
oneLiner: Full-palette neon, gradient-heavy, demo-y
source: vault
license: MIT
attribution: Distilled from Samuel Heftberger's vault (`_brain/inspiration/reference-apps/aceternity.md`). Describes visual language only; not affiliated with Aceternity UI.
reference: https://ui.aceternity.com
---

# Anchor — Aceternity

The Aceternity aesthetic: saturated multi-hue gradients, ambient glow effects, animated borders, neon-on-dark surfaces. Reads as "this is the demo reel of what motion + colour can do." Choose deliberately — the look is loud.

## Visual signatures

- **Typography.** Modern sans (Inter or Geist). Display sizes large with generous tracking. Often paired with gradient-text on headlines (the rare valid case — only on brand-intent decoration headlines, never on functional text).
- **Color.** Full palette neon — multiple hues per page (purple, cyan, magenta, lime). Surface deep dark (`oklch(8% 0.02 280)`). Backgrounds use gradient meshes and animated noise. Borders glow via `box-shadow` halos.
- **Density.** Variable. Hero sections are spacious to showcase motion; feature sections compress for product-density feel.
- **Motion.** Heavy. Mouse-tracking spotlights, animated gradient borders (`@property --beam-angle`), tilt-on-hover, scroll-triggered fade-ups. Every component has at least one animation.

## Token-set

```css
:root {
  --acet-bg:        oklch(8% 0.02 280);
  --acet-bg-elev:   oklch(12% 0.03 290);
  --acet-fg:        oklch(98% 0 0);
  --acet-fg-muted:  oklch(70% 0.02 280);
  --acet-grad-1:    oklch(65% 0.2 290);
  --acet-grad-2:    oklch(70% 0.18 200);
  --acet-grad-3:    oklch(75% 0.22 320);
  --acet-border:    oklch(20% 0.03 290);
  --acet-glow:      0 0 32px oklch(60% 0.2 290 / 0.4);
  --acet-radius:    16px;
  --acet-ease:      cubic-bezier(0.16, 1, 0.3, 1);
}
```

## When to pick this

1. **Product demos and showcases.** Anywhere the user is meant to be impressed before they're sold to. Hackathon projects, motion-design demos, agency portfolios.
2. **Late-stage marketing sites for visual-forward brands.** Brands whose product or service is visual (creative tooling, design platforms, generative-AI products).
3. **Component library demos.** Aceternity's own use case — show off what the library can do.

## Counter-examples

1. **Anything calm.** This anchor is the opposite of `calm` — every choice screams.
2. **Information density.** Aceternity's animations + gradients fight dense data. Use `linear` or `tech-utility`.
3. **Accessibility-first products.** Multi-hue gradients are AA-hostile by default. If you choose Aceternity, EVERY contrast pair needs verification.
4. **Brand voices that aren't excited.** Forcing Aceternity on a `calm` or `formal` brand creates obvious mismatch.

## Anti-slop note

Aceternity is a slop-magnet because most AI-generated UI defaults toward its surface signatures (gradients, glow, animation). The hard rule: Aceternity is a CHOICE, never a fallback. The variant prompt MUST cite a specific reason ("user requested demo-energy", "agency-showcase brand") before applying.

## Reference

Aceternity UI is visible on https://ui.aceternity.com. The library is well-engineered (uses `@property` for animated gradients correctly); the aesthetic is intentional, not accidental.
