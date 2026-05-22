---
description: The 4-phase Stub → Checkpoint → Fill → Verify workflow. Default-mode when creating new pages or screens. Replaces "200-line one-shot that misunderstood the brief" with show-work-at-50% to catch direction errors early.
license: MIT
attribution: Distilled from Samuel Heftberger's vault (`_brain/principles/junior-designer-flow.md`) and huashu-design's Junior-Designer Workflow with 50%-Showcase (MIT, https://github.com/alchaincyf/huashu-design).
---

# Junior-Designer Flow — 4 Phases

This methodology is the default execution flow for new pages and new screens. It pairs with the 4 Narrative Questions (`skills/methodology/narrative-questions.md`): the questions are the BRIEF, this flow is the EXECUTION.

The flow exists because of one observation: when the model writes 200 lines of production-ready JSX in one shot, the user finds out about the misunderstanding 30 seconds before they would have shipped. Stub-first means errors of direction surface 30 seconds into the work, not 5 minutes in.

## When to use

- New page from scratch (`/wisp-design init` flow).
- New screen in an existing app (e.g. "add an onboarding flow").
- Major redesign of an existing screen.

NOT for:

- Tuning existing elements ("make this card bolder") — that's the live variant loop in `skills/reference/live.md`.
- Single-component additions to an existing screen.
- Edits ≤ 20 lines.

## Phase 1 — Stub (skeleton with assumptions inline)

Generate the skeleton of the page. Every interpretive decision is a visible comment.

The stub looks like a wireframe. Boxes labeled with their content type. Generic placeholders. Layout pure. No real images, no real copy beyond labels, no styling beyond structural CSS (`display`, `grid`, `flex`, gap, padding).

The assumptions are inline as comments:

```tsx
<section className="hero">
  {/* TODO: ASSUMING — audience is developers, distance=formal, temperature=calm. */}
  {/* TODO: ASSUMING — primary action is "Try free for 30 days", no secondary action above fold. */}
  <h1>{/* TODO: 1-line value prop, ≤ 12 words */}</h1>
  <p className="lead">{/* TODO: 1 supporting sentence, ≤ 22 words */}</p>
  <button className="cta">{/* TODO: action verb + object */}</button>

  {/* TODO: ASSUMING — no hero image; reduces slop risk. Replace with concrete demo if available. */}
  <div className="hero-aside" />
</section>

<section className="features">
  {/* TODO: ASSUMING — 3 features, each: icon + title + 1-sentence body */}
  {/* TODO: ASSUMING — features matter less than the hero; use density to step them back */}
</section>
```

What the stub MUST include:

- The skeleton structure (sections, regions, landmarks).
- Every interpretive decision as `{/* TODO: ASSUMING — ... */}`.
- A semantic-HTML scaffold (`<header>`, `<main>`, `<nav>`, `<section>`, `<footer>`).
- Pure layout CSS. No colour, no font, no animation.

What the stub MUST NOT include:

- Real copy (placeholder labels are fine).
- Real images (use empty `<div>` placeholders, never AI-generated illustrations).
- Brand styling.
- Production-quality typography.

## Phase 2 — Checkpoint (show, ask, wait)

Render the stub. Show the user either in browser (via the live bridge) or as a screenshot (Playwright). State the assumptions out loud. Ask if they hold.

In chat, the model says something like:

```
Here's the stub. I've made these interpretive calls:

1. Audience: developers, 30-45, formal+calm temperature.
2. Primary action above fold: "Try free for 30 days".
3. No secondary CTA above fold.
4. No hero image — reduces slop risk.
5. Features section is 3 items, stepped back via density.

Look at the screenshot. Tell me which of these is wrong before I fill in copy and styling.
```

ONLY after the user confirms (or corrects, in which case re-stub), proceed to Phase 3.

This is the highest-ROI checkpoint in the whole flow. A 30-second pause now saves a 5-minute rework later.

## Phase 3 — Fill (content + styling, axis by axis)

With confirmed assumptions, fill in:

1. **Real copy** — written to the brief from the 4 Narrative Questions. Specific verbs. No "Welcome to" / "Get started" headlines. No em-dashes. No filler.
2. **Brand styling** — colours from `brandSpec.palette` or anchor token-set. Typography from `brandSpec.typeScale` or anchor. Motion from `brandSpec.motion.tokens` or default `--ease-smooth`.
3. **Components** — if `componentLib === "shadcn"`, use shadcn primitives. If `radix`, use Radix patterns. If `vanilla`, plain HTML + CSS.
4. **Variant axes** — for each major section (hero, features, CTA-block), the model picks a primary visual axis and applies it consistently within the section.

What to add carefully:

- Loading states — every async-fetched region.
- Empty states — every collection that could be empty.
- Error states — every form, every async region.
- Dark-mode tokens — every colour reference uses semantic tokens, never raw hex.

What to omit:

- Decorations that don't earn their place.
- Hero metric templates (banned, see `skills/policy/anti-slop.md`).
- Glass cards without a stated reason.
- Animations beyond what serves the user (entry transitions on critical content only).

## Phase 4 — Verify (the gate)

Before saying "done", run the verification protocol. This is the same protocol the Phase 5 verification-gate enforces — running it inline avoids surprise blocks at accept time.

The protocol (default `warn` mode in Phase 4; `--strict` enforces it in Phase 5):

1. **HMR-wait 2 s** — let the dev-server settle.
2. **Console scan** — search for `error|warn|fail|exception`. Block on real errors; ignore React-dev hot-reload chatter.
3. **Multi-viewport screenshots** — capture at `375 / 768 / 1280 / 1920` widths. Each in light + dark mode if `next-themes` or equivalent is in use.
4. **a11y delta (axe-core)** — run axe before + after. If post-edit count is higher, that's a regression. Block if AA-criticals introduced; warn on minor.
5. **Reduced-motion check** — render with `prefers-reduced-motion: reduce`. Compare with default. If the diff exceeds epsilon (animations not respected), warn.
6. **Tab-order smoke** — trigger Tab repeatedly from the top, log the focus targets. Warn if focus is invisible at any step or if it leaves the page unexpectedly (focus-trap leak).
7. **Anti-slop lint** — `src/verify/anti-slop-linter.ts` runs against the generated CSS. Hard-bans block.

Output of Phase 4: a verification report block, signed off OR with citations.

```
verify:
  console:        clean
  a11y-delta:     +0 (no new violations)
  screenshots:    375✓ 768✓ 1280✓ 1920✓ (light + dark)
  reduced-motion: respected (transitions skipped, layout intact)
  tab-order:      clean
  anti-slop:      0 hard-bans, 1 soft-warning (S2 round-number-whitespace on .features)

verdict: pass with warnings
```

ONLY after a pass (or pass-with-warnings, in `warn` mode) can the model claim "done".

## What Phase 4 says NO to

- "Should work" without running the check. Verification is run, not asserted.
- Visual diff via screenshot alone. axe-core MUST run.
- Dark-mode skipped. Always both light AND dark.
- One-viewport-only screenshots.

The vault's standing rule: **Verifizieren, nicht behaupten.** (Verify, do not assert.)

## Worked example

User: `"Add an onboarding flow for new users — 3 steps, last one is choosing a workspace."`

**Phase 1 — Stub.** Model generates `/onboarding/page.tsx` with three step components. Each is a `<section>` with empty content and TODO comments stating assumptions: 3 steps, persistence in localStorage, step 3 is the workspace picker, no animations between steps, focus auto-jumps on next.

**Phase 2 — Checkpoint.** Model takes a screenshot. In chat:

> "Stub is up. Assumptions: 3 linear steps, no skip option, no progress bar (counter `1/3` instead), no animation between steps, focus auto-jumps to first input on each step. Check the screenshot — any of those wrong?"

User responds: "Add a skip option for step 2. Otherwise good."

**Phase 3 — Fill.** Model goes back and adds the skip option, then fills:

- Step 1 copy: `"What should we call you?"` (intimate distance, calm temperature → first-person question).
- Step 2 copy: `"How will you use this? (optional)"` (skip-able as requested).
- Step 3 copy: `"Pick a workspace — you can create more later."` (specific, action-anchored).
- Colours from `brandSpec.palette.values.bg / fg / accent`.
- Typography: `brandSpec.typeScale.baseSize` 16, step 1.333.

**Phase 4 — Verify.** Model runs the gate. axe-core flags missing `aria-current` on the step indicator. Model fixes. Re-runs. Clean. Reports verdict.

This is what "done" looks like.
