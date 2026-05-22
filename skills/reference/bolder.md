---
description: Variant sub-prompt for bolder requests. Loaded with `live.md` when freeText contains "bolder", "stronger", "louder", "more aggressive", "high-contrast", "stand out".
license: MIT
---

# Bolder

Bolder variants increase visual weight. The user is saying: "this fades into the page; make it earn the eye." Three valid interpretations: more SIZE (hierarchy), more WEIGHT (typography), more CONTRAST (color).

## When to load

`freeText` matches: `bolder`, `stronger`, `louder`, `more aggressive`, `high-contrast`, `stand out`, `more prominent`, `bigger impact`.

Loaded alongside `skills/reference/live.md`.

## Three valid axes

Three default variants, each on a different primary axis:

- **v0 — hierarchy.** Scale up. Add weight to elevation (shadow, border). Reduce surrounding negative space.
- **v1 — typography.** Heavier weight. Negative letter-spacing on display sizes. Possible uppercase + tracking for buttons.
- **v2 — color.** Higher saturation accent. Stronger contrast against background. Border or fill in accent colour.

## Output shape

```css
/* v0 — hierarchy bolder */
@scope ([data-wisp-variant="0"]) {
  :scope {
    /* @param: kind=range min=1.0 max=1.4 step=0.05 label="scale" */
    --wisp-scale: 1.15;
    /* @param: kind=range min=0 max=24 step=2 label="shadow-y" */
    --wisp-shadow-y: 8px;

    transform: scale(var(--wisp-scale));
    box-shadow: 0 var(--wisp-shadow-y) 24px -8px oklch(0% 0 0 / 0.25);
    z-index: 1;
  }
}

/* v1 — typography bolder */
@scope ([data-wisp-variant="1"]) {
  :scope {
    /* @param: kind=range min=400 max=900 step=100 label="weight" */
    --wisp-weight: 700;
    /* @param: kind=range min=-0.06 max=0.04 step=0.01 label="tracking" */
    --wisp-tracking: -0.03em;

    font-weight: var(--wisp-weight);
    letter-spacing: var(--wisp-tracking);
  }
}

/* v2 — color bolder */
@scope ([data-wisp-variant="2"]) {
  :scope {
    /* @param: kind=range min=20 max=70 step=5 label="accent-lightness" */
    --wisp-l: 50;

    background: oklch(calc(var(--wisp-l) * 1%) 0.18 var(--brand-hue, 250));
    color: oklch(98% 0 0);
    border: 1px solid oklch(35% 0.18 var(--brand-hue, 250));
  }
}
```

## Rationales

- v0: `"Hierarchy bolder: scale + shadow lift — visual weight from breathing room around the element."`
- v1: `"Typography bolder: heavier weight + negative tracking — formal declarative register."`
- v2: `"Color bolder: saturated accent + high-contrast surface — earns the eye via chroma rather than scale."`

## Anti-slop check

Bolder is a slop-magnet for the wrong reasons:

- **Reject overshooting.** "Bolder" doesn't mean `font-size: 5rem` and `background: red`. The variant should be one or two notches up, not five.
- **Reject the purple-blue gradient.** Bolder color does NOT mean adding a gradient with hue rotation. One accent, intentional, saturated.
- **Reject uppercase abuse.** Uppercase reads as label, not body. Only on small action items where the context expects it.
- **Reject pure black backgrounds.** `#000` is harsh. Use `oklch(15% 0.005 250)` for the same visual weight, less aggression.

## Counter-prompt

If `freeText` is "bolder" AND the target is ALREADY bold (heading at 700 weight, accent colour saturated), the model should ask: "this element is already at the bolder end of the scale. Are you asking to:

1. Make the SURROUNDING quieter (so it stands out more by contrast)?
2. Add a different KIND of boldness (e.g. motion, animation)?
3. Shift the layout so this element commands more space?"

Wait for response, then proceed.
