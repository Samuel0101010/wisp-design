---
name: linear
oneLiner: Restrained, monochrome, sharp edges, focused
source: vault
license: MIT
attribution: Distilled from Samuel Heftberger's vault (`_brain/inspiration/reference-apps/linear.md`, `_brain/inspiration/taste-anchors/linear.md`). Describes visual language only; not affiliated with Linear.
reference: https://linear.app
---

# Anchor — Linear

The Linear aesthetic: cool greys, ultra-thin borders, near-monochrome interface, sharp typography. Reads as "this is for people who already know what they want and don't need to be sold to."

## Visual signatures

- **Typography.** Inter at 510 weight for UI (custom weight), 600 for headings. Body 14-15 px. Tight tracking on display sizes (-0.02 em). System mono for code.
- **Color.** Surface: `oklch(8% 0.005 250)` deep cool background. Foreground: `oklch(95% 0 0)`. Borders: `oklch(15% 0.005 250)` at 50% opacity — the famous "ultra-thin white" effect. Accent: rarely. When present, electric purple or cyan, single instance.
- **Density.** Dense by web standards, sparse by app standards. Lists with 8-12 px row padding. Information ratios feel like a code editor, not a marketing page.
- **Motion.** Minimal. State changes use 120-200 ms transitions. No hover lifts. No spring physics. Reduced-motion friendly by default.

## Token-set

```css
:root {
  --linear-bg:        oklch(8% 0.005 250);
  --linear-bg-elev:   oklch(11% 0.005 250);
  --linear-fg:        oklch(95% 0 0);
  --linear-fg-muted:  oklch(65% 0.005 250);
  --linear-border:    oklch(20% 0.005 250 / 0.5);
  --linear-accent:    oklch(60% 0.18 290);
  --linear-radius:    6px;
  --linear-pad:       12px;
  --linear-gap:       8px;
  --linear-ease:      cubic-bezier(0.4, 0, 0.2, 1);
}
```

## When to pick this

1. **Internal tools.** Issue trackers, admin dashboards, dev-tooling — anywhere the user is power-user-skewed and the volume of content per screen is high.
2. **Skeptical-developer audience.** "Calm professional who lives in keyboard shortcuts" matches the persona.
3. **Dark-mode-first products.** Linear's whole aesthetic IS dark mode; light mode is the exception, not the default.

## Counter-examples

1. **Consumer marketing.** Linear-style is hostile to first-touch users — too dense, too cold, too understated for someone who needs to be persuaded.
2. **Warm brands.** Linear's coolness fights any brand whose voice is `temperature: warm`. Use `anthropic` or `vault-drenched-warm` instead.
3. **Content-heavy editorial.** Linear's typography is for UI, not for long-form reading. Use `editorial` for prose.

## Reference

Linear's design language is most visible on https://linear.app and in the product itself. The visual choices are deliberate: every surface treatment serves "focus and speed" over decoration.
