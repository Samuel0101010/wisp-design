---
name: tech-utility
oneLiner: Dense, mono accents, functional clarity
source: open-design
license: MIT
attribution: Adapted from open-design's "Tech Utility" visual-direction preset (Apache-2.0, https://github.com/nexu-io/open-design). Re-described in wisp-design's voice.
---

# Anchor — Tech Utility

The Tech Utility aesthetic: high information density, monospace accents, functional ornamentation, terminal-adjacent. Reads as "this is for people who read documentation for fun." A more chromatic cousin of `linear`.

## Visual signatures

- **Typography.** Sans body (Inter, IBM Plex Sans). Mono for code, data, identifiers (JetBrains Mono, IBM Plex Mono). Small body sizes (13-14 px common). Multiple mono accents per page — file paths, hash IDs, version numbers all in mono.
- **Color.** Surface neutral with cool tint. Multiple semantic accents (success green, warning amber, info blue, destructive red) all visible at the same time — this is a tooling UI, not a marketing page. Borders visible and informative.
- **Density.** High. Lists with 4-8 px padding. Tables with all columns visible. Sidebars persistent. Multiple panels stack.
- **Motion.** Almost absent. State changes via background or text colour. No transforms. Reduced-motion default-feeling.

## Token-set

```css
:root {
  --tu-bg:           oklch(99% 0.003 220);
  --tu-bg-elev:      oklch(96% 0.005 220);
  --tu-fg:           oklch(15% 0.01 220);
  --tu-fg-muted:     oklch(40% 0.01 220);
  --tu-accent:       oklch(50% 0.16 240);
  --tu-success:      oklch(55% 0.16 145);
  --tu-warning:      oklch(70% 0.16 75);
  --tu-error:        oklch(55% 0.20 25);
  --tu-border:       oklch(90% 0.005 220);
  --tu-mono-font:    "JetBrains Mono", "IBM Plex Mono", ui-monospace, monospace;
  --tu-radius:       4px;
  --tu-pad:          12px;
  --tu-body-fs:      14px;
  --tu-body-lh:      1.45;
}
```

## When to pick this

1. **Developer tools.** CLI dashboards, log viewers, IDE-style apps, deployment dashboards.
2. **Data-heavy admin panels.** Tables, charts, metrics — anywhere information density is the product.
3. **Infrastructure and observability UIs.** Datadog-adjacent territory.

## Counter-examples

1. **Marketing surfaces.** Tech Utility's density reads as intimidating to non-technical visitors.
2. **Mobile-first products.** Tech Utility's density assumes a desktop screen with stable focus.
3. **Brands wanting warmth.** Tech Utility is functional, not emotional.
