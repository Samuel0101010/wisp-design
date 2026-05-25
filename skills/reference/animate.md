---
name: animate
description: Variant sub-prompt for animation requests. Loaded alongside `live.md` when freeText contains "animate", "animated", "make it move", "alive", "motion". Focuses on 5 distinct motion axes; enforces prefers-reduced-motion and bans bounce-easing by default.
license: MIT
---

# Animate

Motion is information, not decoration. Animation variants should answer the question "how does this element behave?" — never "how can I make this jiggle?".

## When to load

`freeText` matches: `animate`, `animated`, `make it move`, `alive`, `motion`, `motion design`, `add transitions`, `come alive`.

Loaded ALONGSIDE `skills/reference/live.md`. Not a replacement.

## The 5 motion axes

Three variants → three different primary axes (same distinct-variants rule as `live.md`).

### 1. Timing-Cascade (mount stagger)
Children mount in sequence with small offsets. Used to direct attention through a hierarchy of items (list, grid, hero-stack). Typical: `transition-delay: calc(var(--i) * 40ms)` paired with `opacity` + `translateY(4px)` start state. Stagger budget ≤ 320ms total — beyond that, the cascade reads as slow.

### 2. Hover-Physics (static-at-rest + interactive)
Element does NOTHING until interacted with. On hover: tactile feedback (lift, scale ≤ 1.03, shadow expansion, border-shift). On `:focus-visible`: same affordance as hover, never less. On `:active`: contraction snap (50-80ms). The default-state-is-still rule is load-bearing — perpetual motion is slop (see axis 4).

### 3. Spring-Impact (emphasis on a key element)
ONE key element — primary CTA, hero number, success-state checkmark — gets a single spring-bounce on mount or state-change. Easing `cubic-bezier(0.34, 1.56, 0.64, 1)` allowed HERE and only here. Limited to one element per viewport. Anything more is toy-feel.

### 4. Perpetual-Idle (subtle ongoing — flag risk of slop)
A continuous low-amplitude loop on a non-functional element (loader, badge pulse, status indicator). MAXIMUM 1.5Hz pulse rate. MAXIMUM 0.6 alpha-delta. The rationale MUST justify the loop ("this drives attention to the active connection state"). Without justification, this axis is automatic regeneration.

### 5. Scroll-Driven (animation-timeline, Chrome 115+)
CSS `animation-timeline: view()` ties an animation to the element's viewport position. Use for "reveal on enter", parallax-of-meaning, progress bars tied to read-position. Graceful fallback REQUIRED: `@supports not (animation-timeline: view())` block keeps the page usable on Safari.

## Mandatory guards

```css
@media (prefers-reduced-motion: reduce) {
  :scope, :scope * {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
  }
}
```

This block MUST appear in every animate variant. The Phase-5 verification-gate's `reduced-motion` check (CSS-regex scan) blocks accept if any `transition` or `animation` declaration lacks a paired `@media (prefers-reduced-motion: reduce)` guard within the same `@scope`.

## Easing defaults

- **Transitions** (hover, focus, state-change): `cubic-bezier(0.22, 1, 0.36, 1)` — smooth-out, no overshoot.
- **Spring-bounce** (axis 3 only): `cubic-bezier(0.34, 1.56, 0.64, 1)` — exactly one key element per viewport.
- **Active/release** (click feedback): `cubic-bezier(0.4, 0, 1, 1)` — sharp ease-in, 50-80ms.

## Hard-bans

- **Continuous full-page animation.** Any background-position/gradient loop covering > 30% viewport. Reads as a screensaver.
- **Pulses > 1.5Hz.** Faster than that triggers vestibular-disorder accessibility failures. Verification-gate blocks.
- **Bounce/elastic on default UI.** Modals, toasts, buttons, dropdowns. Spring-bounce is reserved for axis 3.
- **Confetti / falling-emoji on success.** Always slop unless brand is explicitly playful (Duolingo-tier).
- **Parallax on body text.** Reading-surface motion is a comprehension cost — never apply.

## Rationales

- v0: `"Timing-Cascade: stagger children (40ms × index) on mount — guides reading order without arrows."`
- v1: `"Hover-Physics: static-at-rest + 1.02 lift + shadow expand on hover — tactile feedback only when invited."`
- v2: `"Spring-Impact: primary CTA mounts with single bounce — earns the eye once, then quiet."`
