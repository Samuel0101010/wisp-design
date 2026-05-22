---
description: Variant sub-prompt for polish requests. Loaded in addition to `live.md` when freeText contains "polish", "refine", "tighten up", "make it nice". Focuses on micro-improvements — rounding, easing, hover/focus states.
license: MIT
---

# Polish

Polish is the axis-light sub-prompt. The user isn't asking for a redesign; they're asking for the thousand 1%s that separate a competent UI from a considered one.

## When to load

`freeText` matches: `polish`, `refine`, `tighten up`, `make it nice`, `clean it up`, `production-ready`, `ship-ready`.

Loaded ALONGSIDE `skills/reference/live.md`. Not a replacement.

## What "polish" means here

Polish variants do NOT change the structure, the colour scheme, the typography, or the layout. They DO change:

- **Easing tokens.** Replace ad-hoc `ease-out` with `--ease-smooth`. Replace ad-hoc `0.3s` with `var(--duration-300)`.
- **Hover states.** Add a hover state if missing. Hover should change at least two things — background AND elevation, or border AND scale. Never just one.
- **Focus rings.** Verify `:focus-visible` is present and visible. WCAG-AA contrast against background.
- **Disabled states.** Verify opacity + cursor + aria-disabled match.
- **Border radius consistency.** If the project uses `--radius`, the variant uses it. No inline `8px`.
- **Shadows.** Multi-layer shadows (`0 1px 2px -1px ... / 0 4px 8px -4px ...`) read more polished than single-layer.
- **Text-wrap.** Add `text-wrap: balance` to headings, `text-wrap: pretty` to body.
- **Numerals.** Add `font-variant-numeric: tabular-nums` to any data display.

## What polish is NOT

- A different layout. If the polish prompt tempts you to restructure, redirect to `skills/reference/layout.md`.
- A different colour. Redirect to `skills/reference/colorize.md`.
- A bolder version. Redirect to `skills/reference/bolder.md`.
- A new component. The user wants the existing component, better.

## Output shape

3 default variants. Each emphasises a different MICRO-axis:

- **v0 — motion polish.** Hover, focus, active transitions tied to motion tokens.
- **v1 — typography polish.** Numerals, text-wrap, line-height refinement.
- **v2 — surface polish.** Multi-layer shadow, border refinement, micro-radius adjustments.

```css
/* v0 — motion polish */
@scope ([data-wisp-variant="0"]) {
  :scope {
    transition:
      background-color var(--duration-150) var(--ease-smooth),
      box-shadow var(--duration-300) var(--ease-smooth),
      transform var(--duration-150) var(--ease-smooth);
  }
  :scope:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px -4px oklch(0% 0 0 / 0.12);
  }
  :scope:focus-visible {
    outline: 2px solid oklch(60% 0.18 250);
    outline-offset: 2px;
  }
  :scope:active {
    transform: translateY(0);
    transition-duration: 50ms;
  }
}

/* v1 — typography polish */
@scope ([data-wisp-variant="1"]) {
  :scope > h2,
  :scope > h3 {
    text-wrap: balance;
    letter-spacing: -0.015em;
  }
  :scope > p {
    text-wrap: pretty;
    max-width: 65ch;
  }
  :scope [data-numeric] {
    font-variant-numeric: tabular-nums;
  }
}

/* v2 — surface polish */
@scope ([data-wisp-variant="2"]) {
  :scope {
    border-radius: var(--radius, 8px);
    box-shadow:
      0 1px 2px -1px oklch(0% 0 0 / 0.08),
      0 4px 8px -4px oklch(0% 0 0 / 0.06);
    border: 1px solid oklch(92% 0.005 250);
  }
}
```

## Rationales

- v0: `"Motion polish: hover lift + smooth easing + visible focus ring — tactile without being noisy."`
- v1: `"Typography polish: balanced headings + pretty body + tabular numerals — readability at the rhythm level."`
- v2: `"Surface polish: multi-layer shadow + token-driven radius + soft border — depth without weight."`

## Anti-slop check

Polish prompts are slop-magnets. The model must NOT, under polish:

- Add a gradient background.
- Add glassmorphism.
- Add bounce/elastic easing.
- Add purple accent unless the brand already uses it.
- Increase border-radius past the project's existing scale.

If the polish prompt tempts you toward any of these, the variant has drifted into `colorize` or `bolder` territory — redirect.
