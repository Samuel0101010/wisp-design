---
description: Variant sub-prompt for layout-shift requests. Loaded with `live.md` when freeText contains "layout", "rearrange", "restructure", "side-by-side", "stacked", "different shape", "reposition".
license: MIT
---

# Layout

Layout variants change WHERE things sit, not just how they look. Three axes: STRUCTURE (grid vs flex, columns, rows), ORDER (visual ordering, sticky positions, reorder), DENSITY (column counts, spacing tiers).

## When to load

`freeText` matches: `layout`, `rearrange`, `restructure`, `side-by-side`, `stacked`, `different shape`, `reposition`, `move`, `reorganize`, `top to bottom`, `bottom up`, `left to right`.

Loaded alongside `skills/reference/live.md`.

## Three valid axes

- **v0 — structure change.** Grid vs flex. Side-by-side vs stacked. Inline vs block. The arrangement primitive changes.
- **v1 — order / position.** Same primitive, different order. Sticky footer becomes inline. Nav moves from top to side. Visual ordering tweaks via `order:` or DOM-order.
- **v2 — density / columns.** Same arrangement, different breathing room or column counts.

## Output shape

```css
/* v0 — structure change */
@scope ([data-wisp-variant="0"]) {
  :scope {
    display: grid;
    /* @param: kind=steps values="1fr,1fr 1fr,1fr 2fr,2fr 1fr" label="columns" */
    grid-template-columns: 1fr 2fr;
    /* @param: kind=range min=16 max=80 step=8 label="gap" */
    --wisp-gap: 48px;
    gap: var(--wisp-gap);
    align-items: start;
  }
}

/* v1 — order / position */
@scope ([data-wisp-variant="1"]) {
  :scope {
    display: flex;
    flex-direction: column;
  }
  :scope > .cta-block {
    /* @param: kind=toggle label="sticky-bottom" */
    --wisp-sticky: 1;
    position: sticky;
    bottom: 16px;
    order: 99;
    z-index: 5;
  }
  :scope > .nav {
    order: 1;
  }
  :scope > .content {
    order: 2;
  }
}

/* v2 — density / columns */
@scope ([data-wisp-variant="2"]) {
  :scope {
    /* @param: kind=steps values="2,3,4" label="columns" */
    --wisp-cols: 3;
    /* @param: kind=range min=16 max=64 step=4 label="gap" */
    --wisp-gap: 24px;

    display: grid;
    grid-template-columns: repeat(var(--wisp-cols), minmax(0, 1fr));
    gap: var(--wisp-gap);
  }

  @media (max-width: 768px) {
    :scope {
      grid-template-columns: 1fr;
    }
  }
}
```

## Rationales

- v0: `"Structure change: stacked → side-by-side grid (1fr 2fr) — content gains companion sidebar; eye flows L→R."`
- v1: `"Order shift: CTA-block moves to sticky-bottom — primary action follows the scroll without competing for top space."`
- v2: `"Density: 3-column grid + medium gap — features become scannable peers instead of long vertical list."`

## Responsive checks

Layout variants MUST include a sensible mobile fallback. The variant prompt's CSS:

- Includes a `@media (max-width: 768px)` block that collapses multi-column to single-column.
- Replaces sticky positioning with static when `prefers-reduced-motion` is set or viewport is small.
- Preserves tab order (DOM order should match visual order on mobile, where possible — `order:` reads weird with screen readers).

## Anti-slop check

Layout-shift slop patterns to avoid:

- **Hero-metric template.** Three big numbers + small labels in a row. Banned by `skills/policy/anti-slop.md` #4. If the layout prompt tempts you toward this, reject and propose alternatives (single concrete claim, testimonial-driven hero).
- **Bento-grid abuse.** Asymmetric grid where the content doesn't justify it. Banned by `skills/policy/anti-slop.md` #8.
- **Card-in-card.** Vault rule: a card inside a card is always wrong. If the layout creates nesting, refactor.
- **Side-stripe accents.** Vertical gradient stripe on left edge of cards. Banned by `skills/policy/anti-slop.md` #5.

## Cards are NOT default

From the vault: "Cards NOT default. Container-only-when-needed." When a layout prompt suggests "wrap each section in a card", the model should first try borderless layout (just spacing + typography hierarchy) and only add card chrome when the content benefits from clear separation (mixed content types, hover-affordances needed).

## Responsive-rule reminders

From the vault:

- `100dvh` not `100vh` on mobile (Safari).
- iOS inputs at 16 px font-size minimum (auto-zoom prevention).
- Touch targets ≥ 44 × 44 px.
- Mobile-first: `sm` / `md` / `lg` / `xl` breakpoints in ascending order.
- Container queries (`@container`) when component-level responsive matters more than viewport.

The layout variant MUST respect these unless the user explicitly overrides.

## Counter-prompt

If `freeText` is "rearrange" but the target is a single component (button, badge, single card), ask:

> "The target is a single element; layout-shift usually applies to a section or page. Are you asking to:
> 
> 1. Restructure the SECTION this element lives in?
> 2. Reposition this element within its parent (e.g. move from inline to absolute)?
> 3. Change the internal layout of this component (e.g. icon-left vs icon-top)?"

Wait for response.
