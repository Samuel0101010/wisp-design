---
description: Variant sub-prompt for color-shift requests. Loaded with `live.md` when freeText contains "colorize", "different color", "add color", "shift palette", "warmer", "cooler", "accent".
license: MIT
---

# Colorize

Colorize variants change the palette. Three axes within colour: HUE (shift the angle on the OKLch wheel), CHROMA (saturation level), LIGHTNESS (surface treatment).

## When to load

`freeText` matches: `colorize`, `different color`, `add color`, `shift palette`, `warmer`, `cooler`, `accent`, `more colorful`, `paint it`, `recolor`.

Loaded alongside `skills/reference/live.md`.

## Three valid axes

- **v0 — hue shift.** Change the brand hue from current. If the project uses blue, try warm (orange, amber) and earth (teal, sage). If warm, try cool. If neutral, pick an intentional brand colour.
- **v1 — chroma shift.** Same hue, different saturation. Often the user wants "more colourful" while preserving the brand — chroma bumps deliver that.
- **v2 — surface vs accent.** Move colour from the accent role to the surface role (or vice versa). Background gets the colour; accent goes neutral.

## OKLch only

All colorize variants use OKLch, never hex. The reason: OKLch is perceptually uniform, so hue/chroma/lightness changes feel proportional. Hex changes feel arbitrary.

If the project uses raw hex in `brandSpec.palette`, the variant emits OKLch equivalents and notes the drift in the rationale.

## Output shape

```css
/* v0 — hue shift */
@scope ([data-wisp-variant="0"]) {
  :scope {
    /* @param: kind=range min=0 max=360 step=15 label="hue" */
    --wisp-hue: 30;
    /* @param: kind=range min=0.05 max=0.25 step=0.02 label="chroma" */
    --wisp-c: 0.18;

    background: oklch(95% calc(var(--wisp-c) * 0.3) var(--wisp-hue));
    color: oklch(25% calc(var(--wisp-c) * 0.5) var(--wisp-hue));
  }
  :scope .accent,
  :scope button {
    background: oklch(55% var(--wisp-c) var(--wisp-hue));
    color: oklch(98% 0 0);
  }
}

/* v1 — chroma shift */
@scope ([data-wisp-variant="1"]) {
  :scope {
    /* @param: kind=range min=0.02 max=0.30 step=0.02 label="chroma" */
    --wisp-c: 0.20;

    background: oklch(95% calc(var(--wisp-c) * 0.25) var(--brand-hue, 250));
  }
  :scope .accent {
    background: oklch(55% var(--wisp-c) var(--brand-hue, 250));
  }
}

/* v2 — surface vs accent inversion */
@scope ([data-wisp-variant="2"]) {
  :scope {
    background: oklch(50% 0.18 var(--brand-hue, 250));
    color: oklch(98% 0 0);
  }
  :scope .accent,
  :scope button {
    background: oklch(98% 0 0);
    color: oklch(40% 0.18 var(--brand-hue, 250));
  }
}
```

## Rationales

- v0: `"Hue shift: brand from 250 (blue) to 30 (warm amber) — temperature changes feel, not structure."`
- v1: `"Chroma shift: same hue, saturation 0.12 → 0.20 — more vivid without losing brand alignment."`
- v2: `"Inversion: colour moves from accent to surface — element becomes the chrome instead of the highlight."`

## AA contrast — mandatory check

Every colorize variant MUST pass WCAG AA contrast on its primary text-on-background pair. The OKLch math is roughly:

- Text on background: difference in `L` ≥ 45 for body text.
- Large display (≥ 24 px, 700 weight): difference in `L` ≥ 35.

If the variant fails, regenerate with adjusted lightness. The rationale should note "AA verified at L-delta=NN" so the gate doesn't need to recompute.

## Anti-slop check

Colorize is the highest-risk axis for slop. The model MUST NOT:

- Emit a purple-blue gradient. Banned by `skills/policy/anti-slop.md` #6.
- Use raw hex when the project uses OKLch.
- Pick a third-party brand colour (Tailwind blue, GitHub purple) when the project has a brand-spec.
- Generate three colour variants that all share the same hue range — that violates the distinct-axes rule for colour-only generation.

If the user asks for "more colorful" specifically, the three variants ARE all colour-axis — but each MUST also differ on a SECOND axis (hue / chroma / surface-vs-accent). The distinct-axes rule still applies; the secondary axis becomes the distinguisher.

## Reference-anchor integration

If the user says "Stripe colours" or "Apple palette", lookup the matching anchor under `skills/data/anchors/<name>.md` and bring its token-set in. Example: "Linear colors" → `skills/data/anchors/linear.md` → use the restrained-cool greys with extremely low chroma neutrals.

## Counter-prompt

If `freeText` is "add color" AND the target is on a page with a strict mono palette (e.g. an admin dashboard for a calm brand), ask:

> "This page is currently monochromatic. Adding colour will probably:
> 
> 1. Break the calm tone (if you want a single accent, fine — which role: CTA only, or page-wide?).
> 2. Or — do you want me to introduce a SEMANTIC colour for state (warning amber, success green) but keep the chrome neutral?"

Wait for response.
