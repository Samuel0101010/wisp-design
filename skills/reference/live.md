---
description: Variant-generation prompt. Loaded for every `configure` event. Defines the 5 axes, the distinct-variants rule, the output CSS shape, and three worked examples. Read this end-to-end before generating any variants.
license: MIT
---

# wisp-design — Live Variant Generation

This file is the prompt-API. When `wisp-design poll-once` returns a `configure` event, the model assembles a `VariantGenerationRequest`, then reasons about design under the rules below, and finally emits a `VariantGenerationResponse` posted via `wisp-design post-event --kind cycling`.

The contract source-of-truth is `src/contracts/agent.ts` — read it once for the exact zod shapes. This file is the prose and worked examples that make the contract usable at reasoning time.

## Input contract — `VariantGenerationRequest`

| Field                    | Source                                        | Notes                                                              |
| ------------------------ | --------------------------------------------- | ------------------------------------------------------------------ |
| `target`                 | `event.target`                                | `PickResult` — selector, rect, attributes, tagName                 |
| `freeText`               | `event.freeText`                              | Sanitised, ≤ 4000 chars                                            |
| `requestedVariantCount`  | bar state                                     | One of `1 \| 3 \| 5 \| 8`                                          |
| `deviation?`             | `event.deviation` (Phase 7.15)                | `1..5`. **Scales variant aggressiveness.** See "Deviation scale".  |
| `sessionId`              | `event.sessionId`                             | UUID; routes to `.wisp/sessions/<id>.jsonl`                        |
| `brandSpec?`             | `.wisp/brand-spec.json`                       | 9-section schema; optional                                         |
| `designTokens?`          | `.wisp/design-tokens.json`                    | Spacing/radii/font-sizes/colors extracted from running app         |
| `componentLib?`          | `package.json` scan                           | `shadcn \| radix \| mui \| tailwind \| vanilla`                    |
| `axesEmphasis?`          | derived from `freeText` keywords              | Subset of the 5 axes; defaults to all 5                            |

## Deviation scale (Phase 7.15)

The `deviation` value, when present, tells you how strongly each non-baseline variant should drift from the original design. Default is `3` (balanced — the historic behavior). Treat it as a **per-variant strength dial**, not a global "spice up everything" knob; v0 stays baseline regardless.

| `deviation` | Treatment                                                                                                        |
| ----------- | ---------------------------------------------------------------------------------------------------------------- |
| `1` subtle  | Touch ONE axis per variant. Weight shifts, line-height tweaks, single-color emphasis. No layout / structure / family changes. Refinement-only. |
| `2` mild    | One axis per variant + minor secondary tweak (e.g. tracking change + color shift). Layout stays.                  |
| `3` balanced (default) | Each variant owns a distinct primary axis (hierarchy / layout / typography / color / density). Layout MAY shift modestly. |
| `4` bold    | Variants may combine two axes per variant and structurally reorder (flex order, banded zones, inverted dark). Different family allowed. |
| `5` radical | Reimagine. Variants may discard the original shape entirely (e.g. price-only billboard, prose-block layout, glyph-first identity). Multiple axes per variant; the only constraint is anti-slop + a11y. |

Rules of thumb:
- v0 NEVER deviates — always the baseline.
- Distinct-axes-rule still applies at deviation 1–3 (each non-v0 variant must own a different axis).
- At deviation 4–5 the distinct-axes rule relaxes — you may have two "color" variants if they pursue genuinely different color stories.
- A user who picked `5` is asking you to surprise them; don't ship 5 timid variants. Bring at least one variant that breaks expectations.
- When `deviation` is `undefined` (older client / scripted POST), assume `3`.

## Output contract — `VariantGenerationResponse`

```ts
{
  variants: Array<{
    id: string;            // stable per-variant id, e.g. "v0", "v1", "v2"
    css: string;           // full @scope block, see below
    cssVars: Record<string, string>;   // initial values for the @param vars
    rationale: string;     // one sentence, ≤ 180 chars, axis-first
    primaryAxis: "hierarchy" | "layout" | "typography" | "color" | "density";
  }>,
  generatedAt: string;     // ISO-8601
  modelUsed: string;       // e.g. "claude-opus-4-7"
}
```

## The 5 axes (load-bearing)

Three variants → three different primary axes. Eight variants → eight different. If the request asks for more variants than there are axes, the model reuses axes but pivots the *secondary* axis between them (axis pairs become the distinguisher).

### `hierarchy`
Information weighting via size, weight, contrast, position. Bolder headline + indented sub-content. Larger H1/body ratio. Promoting one action over peers via badge or stroke. The visual answer to "which of these matters most?".

### `layout`
Structural arrangement. Side-by-side vs stacked. Grid vs flex. Content-first vs nav-first. Pulling an inline action into a sticky footer. The variant changes WHERE elements live, not just how they look.

### `typography`
Typeface choice, pairing, scale. Serif-display + sans-body. Mono accents. Variable-font weight contrast. Changing `--type-step` from `1.25` to `1.333`. Always pair changes with one explicit pairing rationale — never "use a different font" with no reason.

### `color`
Palette, mode, contrast. Monochromatic + accent. Dark-mode-first. OKLch cool vs warm. Surface-level changes (background tint) AND foreground (accent role). Always verify against WCAG AA — see `skills/policy/anti-slop.md` for AA hard-bans.

### `density`
Whitespace, line-height, padding multiplier. Tighter list-item padding. Increased section spacing. Wider gutters. Touch-target-friendly minimum 44 × 44 px on interactive targets.

## Distinct-variants rule

This is the single most important rule. **Three variants must emphasise three different primary axes.** Three colour variations of the same layout, typography and density is slop, regardless of how well each is crafted. The rule exists because:

- Real design alternatives feel like decisions, not paint colours.
- Users learn faster from contrast than from gradient.
- The downstream slider tunes within an axis — there is no point generating three of the same axis if the slider already covers that range.

Counter-rule: if `axesEmphasis` is set (the user said "make this tighter"), all variants MUST satisfy the emphasis. They still differ on a SECOND axis. Example: emphasis `["density"]` → three density-tighter variants that ALSO differ on hierarchy / layout / typography respectively.

## CSS output shape

Every variant is wrapped in CSS Cascading-Scoped notation. The browser injects the resulting block verbatim into `<style data-wisp-css="<sessionId>">`. Use `:scope > .child` selectors (not bare `:scope`) when targeting children of the picked element.

```css
@scope ([data-wisp-variant="0"]) {
  :scope {
    /* @param: kind=range min=0 max=32 step=2 label="padding" */
    --wisp-pad: 16px;
    /* @param: kind=range min=0 max=24 step=1 label="radius" */
    --wisp-radius: 8px;
    /* @param: kind=toggle label="bold-label" */
    --wisp-label-weight: 600;

    padding: var(--wisp-pad);
    border-radius: var(--wisp-radius);
  }
  :scope > .label {
    font-weight: var(--wisp-label-weight);
  }
}
```

Three `@param` directive shapes are recognised:

- `kind=range min=A max=B step=C label="…"` → continuous slider
- `kind=steps values="A,B,C" label="…"` → discrete step picker
- `kind=toggle label="…"` → on/off binary

The browser parses these in `parameter-sliders.ts`; you do not need to emit any JS.

## Reference-app anchors

If `freeText` references a reference app ("more like Linear", "Stripe-y", "Apple-cinematic"), look up the matching card under `skills/data/anchors/<name>.md` and bring its token-set into your variant. The variant's rationale MUST acknowledge the anchor by name.

If `brandSpec.variantAnchor` is set, treat it as the default reference for the session — only override when the user explicitly references a different one.

Allowed anchors (see `skills/data/anchors/00-INDEX.md`): `linear`, `stripe`, `anthropic`, `aceternity`, `apple`, `vercel`, `raycast`, `notion`, `github`, `tailwind-ui`, `shadcn-default`, `shadcn-soft`, `shadcn-bold`, plus the 5 open-design presets (`editorial`, `modern-minimal`, `tech-utility`, `brutalist`, `soft-warm`) and 3 vault-derived (`vault-restrained-cool`, `vault-committed-indigo`, `vault-drenched-warm`).

## Token preference order

When emitting CSS values, prefer in this order:

1. **`brandSpec.palette.values`** if the role is brand-significant (`accent`, `primary`, …)
2. **`designTokens.*`** if a value exists in the project's sampled set
3. **`anchors/<name>.md` token-set** if a reference anchor is invoked
4. **House defaults** — 4 px spacing grid, OKLch neutrals, 1.333 type-scale, system fonts, `--ease-smooth` motion

Drop a `/* token: <source> */` comment next to any non-token-sourced value so the verification-gate can flag drift later.

## Component-library awareness

When `componentLib === "shadcn"` or `"radix"`:

- CSS still emits via `@scope`, BUT the rationale should suggest the equivalent prop-edit. Example: `"Hierarchy: promote primary via shadcn <Button size='lg' variant='default'> — CSS bridge applied for live preview, prop-edit baked on accept."`
- Use Tailwind utility hints in the rationale (`px-6 py-3 rounded-lg`) so the carbonize step can translate cleanly.

When `componentLib === "mui"`:

- Reference the MUI theme variant (`<Button size="large" color="primary">`) in the rationale.
- Avoid CSS that fights MUI's internal styles — prefer composable additions over overrides.

When `componentLib === "vanilla"`:

- Pure CSS only. No utility-class assumptions.

## Anti-slop tight coupling

The hard-bans and soft-warnings live in `skills/policy/anti-slop.md`. Load that file alongside this one for every `configure` event. Concrete commitments at prompt-time:

1. No em-dash UI decoration. No `— foo —` chrome.
2. No gradient text on critical UI (links, buttons, headlines that need scannability).
3. No default-glassmorphism without rationale. If you reach for `backdrop-filter`, justify it in the variant's rationale.
4. No hero-metric template ("100k+ users • 99.9% uptime").
5. No purple-to-blue gradient unless the user explicitly asked.
6. No "Welcome to" / "Get started" headlines without product context.
7. No CSS-painted phones / browsers / stat counter rows.

When the user's prompt brushes against a rule, the rationale MUST cite the rule and the alternative chosen.

## Rationale phrasing

180 chars hard limit. Axis-first. Declarative.

Good: `"Density: tighter list-item padding (8 → 4 px) + larger gutter (24 → 32 px) — promotes scannability without crowding."`

Good: `"Hierarchy: primary action gains scale (1.0 → 1.15) + extra shadow — secondary actions step back via reduced contrast."`

Bad: `"Made it look nicer with some improvements to the design."` (no axis, no specifics)

Bad: `"This variant uses a beautiful purple-to-blue gradient that creates a sense of premium feel and modernity that I think you'll love. 🎨✨"` (em-dash-adjacent, no axis, emoji without request, abstract).

## Worked example 1 — Button, "make it bolder"

**Target.** A `<button class="primary-cta">Subscribe</button>` inside a card.

**FreeText.** `"make it bolder"`

**axesEmphasis** derived: `["hierarchy", "typography", "color"]` — three valid interpretations of "bolder".

**Variants emitted:**

```css
/* v0 — primaryAxis: hierarchy */
@scope ([data-wisp-variant="0"]) {
  :scope {
    /* @param: kind=range min=1.0 max=1.3 step=0.05 label="scale" */
    --wisp-scale: 1.15;
    /* @param: kind=range min=0 max=24 step=2 label="shadow-y" */
    --wisp-shadow-y: 8px;

    transform: scale(var(--wisp-scale));
    box-shadow: 0 var(--wisp-shadow-y) 24px -8px oklch(0% 0 0 / 0.25);
    transform-origin: center;
  }
}

/* v1 — primaryAxis: typography */
@scope ([data-wisp-variant="1"]) {
  :scope {
    /* @param: kind=range min=400 max=900 step=100 label="weight" */
    --wisp-weight: 700;
    /* @param: kind=range min=-0.04 max=0.04 step=0.01 label="letter-spacing" */
    --wisp-tracking: -0.02em;

    font-weight: var(--wisp-weight);
    letter-spacing: var(--wisp-tracking);
    text-transform: uppercase;
  }
}

/* v2 — primaryAxis: color */
@scope ([data-wisp-variant="2"]) {
  :scope {
    /* @param: kind=range min=0 max=100 step=5 label="accent-lightness" */
    --wisp-l: 55;

    background: oklch(calc(var(--wisp-l) * 1%) 0.18 250);
    color: oklch(98% 0 0);
    border: 1px solid oklch(40% 0.18 250);
  }
}
```

**Rationales:**

- v0: `"Hierarchy: primary action gains scale (1.0 → 1.15) + shadow lift — visual weight from surrounding breathing room."`
- v1: `"Typography: heavier weight (400 → 700) + uppercase + negative tracking — formal call-to-action register."`
- v2: `"Color: saturated accent + high-contrast surface — earns the eye via chroma rather than scale."`

## Worked example 2 — Card grid, "more breathing room"

**Target.** A `<div class="card-grid">` containing six `.card` children.

**FreeText.** `"more breathing room"`

**axesEmphasis** derived: `["density", "layout", "typography"]` — density is the obvious primary, but layout and typography both deliver "breathing room" too.

**Variants emitted:**

```css
/* v0 — primaryAxis: density */
@scope ([data-wisp-variant="0"]) {
  :scope {
    /* @param: kind=range min=12 max=48 step=4 label="gap" */
    --wisp-gap: 32px;
    /* @param: kind=range min=16 max=48 step=4 label="card-padding" */
    --wisp-card-pad: 28px;
    gap: var(--wisp-gap);
  }
  :scope > .card {
    padding: var(--wisp-card-pad);
  }
}

/* v1 — primaryAxis: layout */
@scope ([data-wisp-variant="1"]) {
  :scope {
    /* @param: kind=steps values="2,3,4" label="columns" */
    --wisp-cols: 2;
    grid-template-columns: repeat(var(--wisp-cols), 1fr);
    /* @param: kind=range min=16 max=64 step=4 label="row-gap" */
    --wisp-row-gap: 48px;
    row-gap: var(--wisp-row-gap);
  }
}

/* v2 — primaryAxis: typography */
@scope ([data-wisp-variant="2"]) {
  :scope > .card > h3 {
    /* @param: kind=range min=1.0 max=1.8 step=0.1 label="line-height" */
    --wisp-lh: 1.4;
    line-height: var(--wisp-lh);
    text-wrap: balance;
  }
  :scope > .card > p {
    text-wrap: pretty;
    max-width: 42ch;
  }
}
```

**Rationales:**

- v0: `"Density: gap + padding both lift (16 → 32 / 16 → 28 px) — uniform breathing room without changing structure."`
- v1: `"Layout: fewer columns (3 → 2) + row-gap doubled — content gets vertical air, each card commands more attention."`
- v2: `"Typography: balanced headline + pretty body wrap + max-line 42ch — breathing comes from line-rhythm rather than spacing."`

## Worked example 3 — Hero section, "more like Stripe"

**Target.** A `<section class="hero">` with headline, sub-headline, primary CTA, supporting image.

**FreeText.** `"more like Stripe"`

**Lookup.** Load `skills/data/anchors/stripe.md`. Token-set: committed indigo, dense info, technical confidence, careful contrast, gradient-as-frame (not as text).

**Variants emitted:** 3 variants, each ALSO emphasising a different axis on top of the Stripe anchor.

```css
/* v0 — anchor=stripe, primaryAxis: layout */
@scope ([data-wisp-variant="0"]) {
  :scope {
    /* @param: kind=range min=40 max=80 step=4 label="side-padding-vh" */
    --wisp-pad: 8vw;
    display: grid;
    grid-template-columns: 1.2fr 1fr;
    gap: 64px;
    align-items: center;
    padding-inline: var(--wisp-pad);
  }
}

/* v1 — anchor=stripe, primaryAxis: color */
@scope ([data-wisp-variant="1"]) {
  :scope {
    background: linear-gradient(
      180deg,
      oklch(98% 0.02 250) 0%,
      oklch(95% 0.05 260) 100%
    );
    border-bottom: 1px solid oklch(85% 0.06 250);
  }
  :scope .cta {
    background: oklch(45% 0.22 270);
    color: oklch(98% 0 0);
  }
}

/* v2 — anchor=stripe, primaryAxis: hierarchy */
@scope ([data-wisp-variant="2"]) {
  :scope > h1 {
    /* @param: kind=range min=2.5 max=5.0 step=0.25 label="size-rem" */
    --wisp-h1: 3.5rem;
    font-size: var(--wisp-h1);
    font-weight: 600;
    letter-spacing: -0.03em;
    text-wrap: balance;
    max-width: 18ch;
  }
  :scope > .subhead {
    color: oklch(45% 0 0);
    font-size: 1.125rem;
    max-width: 48ch;
  }
}
```

**Rationales:**

- v0: `"Layout (anchor Stripe): 1.2/1 side-by-side grid + wide inline padding — Stripe-style two-column information density."`
- v1: `"Color (anchor Stripe): committed-indigo wash + saturated CTA — Stripe's gradient-as-frame, never as text."`
- v2: `"Hierarchy (anchor Stripe): tight 18-ch headline + measured subhead — typographic confidence over visual decoration."`

## Stop conditions on generation

Refuse to emit variants and instead post a `cycling` event with `variants: []` and an annotation clarifier when:

- `freeText` is empty AND `requestedVariantCount > 1` (no signal to differentiate on).
- The target is a `<script>`, `<style>`, `<head>`, or another non-visual element.
- Every variant would violate an anti-slop hard-ban with no daylight (e.g. user says "make it a purple-blue gradient hero metric bar" — say no, propose three alternatives).
- The verification-gate (Phase 5, default `warn` mode) reports zero passable variants — Phase 4 ignores the warning, but the rationale should still pre-empt it.

Only one clarifier per session — after that, fall back to house defaults and emit anyway.
