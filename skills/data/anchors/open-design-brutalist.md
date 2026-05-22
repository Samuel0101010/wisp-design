---
name: brutalist
oneLiner: Heavy weights, sharp edges, asymmetry
source: open-design
license: MIT
attribution: Adapted from open-design's "Brutalist" visual-direction preset (Apache-2.0, https://github.com/nexu-io/open-design). Re-described in wisp-design's voice.
---

# Anchor — Brutalist

The Brutalist aesthetic: zero border-radius, heavy display weights, intentional asymmetry, raw-feeling surfaces. Reads as "this is the rough draft on purpose." Highest personality of any anchor; choose deliberately.

## Visual signatures

- **Typography.** Heavy sans (Inter Black, Söhne Buch, Helvetica Black) at display sizes. Body in mid-weight sans, often 500. Type-scale aggressive (`--type-step: 1.5` typical). Letter-spacing zero or slightly positive on display — the opposite of polished tracking.
- **Color.** Often near-monochrome (black + cream + one electric accent), but inverted from the usual. Surfaces can be saturated. Pure black backgrounds and pure white text are valid here (the one anchor where this is acceptable).
- **Density.** Variable. Headlines blow up to dominate; body sections can be dense. Asymmetric layouts default — left-aligned overflowing into negative grid columns, content escaping container bounds intentionally.
- **Motion.** Variable. Either none (static, poster-feel) or aggressive (smash-cut transitions, hard easing curves like `cubic-bezier(1, 0, 0, 1)`). Never the polite middle.

## Token-set

```css
:root {
  --br-bg:          oklch(98% 0.005 60);
  --br-fg:          oklch(8% 0 0);
  --br-fg-inverted: oklch(98% 0 0);
  --br-accent:      oklch(60% 0.28 150);
  --br-border:      oklch(8% 0 0);
  --br-border-w:    2px;
  --br-radius:      0;
  --br-display-fs:  clamp(3rem, 10vw, 12rem);
  --br-display-weight: 900;
  --br-display-tracking: 0;
  --br-pad:         16px;
}
```

## When to pick this

1. **Studios, agencies, design portfolios.** Brutalist signals "we make decisions" and works as a brand statement.
2. **Counterculture or anti-corporate brands.** Music labels, independent publishers, art platforms.
3. **Conferences, events.** Time-bounded brands where the visual makes a statement and then retires.

## Counter-examples

1. **Trust-driven products.** Brutalist signals "edge" — wrong message for financial or healthcare brands.
2. **Mass-market consumer products.** Brutalist excludes part of the audience by design.
3. **Long-form content reading.** Brutalist typography is for impact, not endurance.

## Anti-slop note

Brutalist is easy to fake and hard to do well. The model should NOT pick brutalist just because the user said "different" or "unique". Brutalist is a specific design language, not "the absence of polish". When tempted, ask the user if they want `brutalist` specifically — if they hesitate, pick `modern-minimal` instead.
