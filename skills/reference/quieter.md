---
description: Variant sub-prompt for quieter requests. Loaded with `live.md` when freeText contains "quieter", "softer", "calmer", "less aggressive", "more breathing room", "step back".
license: MIT
---

# Quieter

Quieter variants reduce visual noise. The user is saying: "this fights for attention; let it step back." Three axes: more SPACE (density), less WEIGHT (typography), less CONTRAST (color).

## When to load

`freeText` matches: `quieter`, `softer`, `calmer`, `less aggressive`, `more breathing room`, `step back`, `tone it down`, `understated`, `subtle`.

Loaded alongside `skills/reference/live.md`.

## Three valid axes

- **v0 — density.** Increase padding, gap, margin. Reduce information density per visual unit.
- **v1 — typography.** Lighter weight. Looser line-height. Smaller display sizes. Body returns to defaults.
- **v2 — color.** Lower-chroma accents. Less surface contrast. Border replaced with muted background.

## Output shape

```css
/* v0 — density quieter */
@scope ([data-wisp-variant="0"]) {
  :scope {
    /* @param: kind=range min=12 max=48 step=4 label="padding" */
    --wisp-pad: 24px;
    /* @param: kind=range min=8 max=32 step=4 label="gap" */
    --wisp-gap: 16px;

    padding: var(--wisp-pad);
    gap: var(--wisp-gap);
  }
}

/* v1 — typography quieter */
@scope ([data-wisp-variant="1"]) {
  :scope > h2,
  :scope > h3 {
    /* @param: kind=range min=400 max=700 step=100 label="weight" */
    --wisp-weight: 500;
    /* @param: kind=range min=1.2 max=1.8 step=0.1 label="line-height" */
    --wisp-lh: 1.4;
    font-weight: var(--wisp-weight);
    line-height: var(--wisp-lh);
    letter-spacing: 0;
  }
  :scope > p {
    line-height: 1.6;
    color: oklch(45% 0 0);
  }
}

/* v2 — color quieter */
@scope ([data-wisp-variant="2"]) {
  :scope {
    /* @param: kind=range min=0.01 max=0.15 step=0.01 label="accent-chroma" */
    --wisp-c: 0.05;

    background: oklch(98% 0.002 250);
    color: oklch(25% 0.005 250);
    border: 1px solid oklch(92% 0.005 250);
  }
  :scope .accent {
    color: oklch(50% var(--wisp-c) 250);
  }
}
```

## Rationales

- v0: `"Density quieter: padding + gap both lift (16 → 24 / 8 → 16) — uniform breathing room without restructuring."`
- v1: `"Typography quieter: lighter weight + looser leading + muted body color — long-form readability over declarative impact."`
- v2: `"Color quieter: low-chroma accent + paper background + thin border — content carries; styling steps back."`

## Anti-slop check

Quieter is the right answer when the prompt feels like "make it less AI". Common slop the model should AVOID adding under quieter:

- Glassmorphism. "Subtle" is not "frosted glass".
- Purple accent at low chroma. Use the brand hue or a neutral.
- Increased border-radius. Quieter doesn't mean rounder.
- Animation. Adding motion is the opposite of quieter.

## Counter-prompt

If `freeText` is "quieter" AND the target is ALREADY quiet (body weight, muted greys, generous padding), ask: "this element is already on the quieter end. Are you asking to:

1. Make the SURROUNDING louder (so this fades into context)?
2. Remove the element entirely?
3. Replace its content with whitespace?"

Wait for response.
