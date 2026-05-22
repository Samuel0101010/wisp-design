---
name: modern-minimal
oneLiner: Sans, monochrome, generous whitespace
source: open-design
license: MIT
attribution: Adapted from open-design's "Modern Minimal" visual-direction preset (Apache-2.0, https://github.com/nexu-io/open-design). Re-described in wisp-design's voice.
---

# Anchor — Modern Minimal

The Modern Minimal aesthetic: pure sans-serif typography, monochrome palette with single accent, generous whitespace, considered restraint. Reads as "this is high-end without being loud." The safest defensible default.

## Visual signatures

- **Typography.** Sans-only (Inter, Geist, Söhne). 2-3 weights total (400 / 500 / 600). Display sizes moderate (3-4 rem on desktop). Tight tracking on display (-0.02 em). Body 16 px, line-height 1.5-1.6.
- **Color.** Monochrome surface — white in light mode, near-black in dark. Foreground tinted neutral. Single accent at controlled chroma (`oklch(50% 0.12 hue)` typical). No gradients in core UI.
- **Density.** Generous. Section spacing 80-120 px on desktop. Content max-width 60-72 ch. Breathing room is the point.
- **Motion.** Minimal. Hover states are colour shifts or 1 px underline-thicken. Transitions on background-color and border only. 200-300 ms standard.

## Token-set

```css
:root {
  --mm-bg:        oklch(99% 0.002 250);
  --mm-bg-elev:   oklch(97% 0.002 250);
  --mm-fg:        oklch(15% 0.005 250);
  --mm-fg-muted:  oklch(45% 0.005 250);
  --mm-accent:    oklch(50% 0.12 250);
  --mm-border:    oklch(92% 0.003 250);
  --mm-radius:    8px;
  --mm-pad:       24px;
  --mm-section-y: 96px;
  --mm-h1-fs:     clamp(2.5rem, 5vw, 4rem);
  --mm-body-lh:   1.55;
}
```

## When to pick this

1. **Default for SaaS products.** When no specific brand direction exists, Modern Minimal is the lowest-risk choice.
2. **Brands prioritising trust over personality.** Financial, healthcare, professional services.
3. **First MVPs.** When the brand is intentionally evolving, Modern Minimal gives breathing room to discover identity.

## Counter-examples

1. **Brands needing personality.** Modern Minimal is intentionally identity-neutral. If the brand needs to be MEMORABLE, pick something with more character.
2. **Long-form content products.** Use `editorial` instead — Modern Minimal's body type isn't tuned for reading endurance.
3. **High-density admin tools.** Modern Minimal's generosity wastes too much screen real estate. Use `linear` or `tech-utility`.
