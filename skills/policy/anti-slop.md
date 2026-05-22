---
description: Hard-bans and soft-warnings for generated UI. Loaded alongside `skills/reference/live.md` for every variant generation. Hard-bans are enforced by the Phase-5 verification-gate; the prompt-time guardrail catches most cheaply, the gate-time linter catches the rest.
license: MIT
attribution: Distilled from Samuel Heftberger's design vault (`_brain/principles/anti-slop-extensions.md`) and huashu-design (MIT, https://github.com/alchaincyf/huashu-design — Anti-AI-Slop doctrine).
---

# wisp-design — Anti-Slop Policy

Two layers of enforcement. Defence in depth.

1. **Prompt-time guardrails** — the rules below are loaded for every `configure` event. The model self-filters at generation time. Cheap.
2. **Gate-time linting** — `src/verify/anti-slop-linter.ts` (Phase 5) runs against the generated CSS before `accept` is allowed. Hard-bans block; soft-warnings warn.

When the user's `freeText` brushes against a rule, the variant's rationale MUST cite the rule and the alternative chosen. Example: `"User asked for gradient, but anti-slop bans rainbow text → emitted a single-stop accent gradient on the border instead."`

## Hard-bans (gate blocks)

### 1. Em-dash UI decoration

Em-dashes (`—`) used as decoration in UI copy: button labels, headlines, empty states, tooltips, microcopy. They read as docs-prose, not interface. Vault doc may use them freely; UI may not.

Bad:
```html
<button>Subscribe — get updates</button>
<h2>Built — by engineers, for engineers</h2>
```

Acceptable:
```html
<button>Subscribe to updates</button>
<h2>Built by engineers, for engineers</h2>
```

Detection: any `—` (U+2014) in text nodes of `<button>`, `<h1>` … `<h6>`, `<label>`, `[role="tooltip"]`, `.empty-state`.

### 2. Gradient text on critical UI

`background: linear-gradient(...); -webkit-background-clip: text;` on text that must remain scannable: links, button labels, headlines for body content, navigation items. Decoration headlines in a hero are the only OK case, and only with brand justification.

Bad:
```css
a { background: linear-gradient(90deg, #a855f7, #3b82f6); -webkit-background-clip: text; color: transparent; }
```

Detection: `background-clip: text` on selectors matching button / link / nav / form-label patterns.

### 3. Default glassmorphism without rationale

`backdrop-filter: blur(...)` with `background: rgba(255, 255, 255, 0.X)` as the default chrome of a card or panel, without a stated rationale in the variant's `rationale` string. Glassmorphism is fine when it's intentional — when it's not, it's the default AI vibe.

Bad (no rationale): a card with `backdrop-filter: blur(12px); background: rgba(255,255,255,0.15)` on a page that has no other glass treatment.

Acceptable: a modal overlay where the rationale says "glass treatment chosen to keep underlying page legible during multi-step flow".

### 4. Hero-metric template

The "3 huge numbers" hero ("100k+ users • 99.9% uptime • 24/7 support"). Recognisable by: three elements in a row, each containing a large-font number + small label, separated by dividers or generous gaps.

Detection: any section with three sibling elements each containing a number `font-size > 2rem` followed by a label `font-size < 1rem`.

Replace with: a single concrete claim ("Cut deploy time from 4h to 12min — Klarna"), or testimonial-driven hero, or honest empty state.

### 5. Side-stripe decoration

A solid or gradient vertical stripe on the left edge of cards or sections. Recognisable as the "Linear-clone" tell. The pattern is so over-used in AI-generated UI that it has become invisible.

Bad:
```css
.card { border-left: 4px solid #a855f7; }
.card::before { content: ""; position: absolute; left: 0; width: 6px; background: linear-gradient(...); }
```

Acceptable: a side-stripe as INTENTIONAL design with brand reason (e.g. "indicates priority level — orange for urgent, blue for info").

### 6. Purple-blue gradient

`linear-gradient(...)` blending `#a855f7` (or any oklch around `h≈300, c>0.15`) with `#3b82f6` (or any oklch around `h≈250, c>0.15`). The generic AI vibe. Allowed only when the user explicitly asks for it OR `brandSpec.palette` contains the colours.

Detection: linear-gradient with two stops, one in hue range 280-320 with chroma > 0.12, one in hue range 230-260 with chroma > 0.12.

### 7. Generic AI illustrations

Cartoon people staring at laptops. 3D blob avatars. Gradient-mesh backgrounds. Floating orbs as background decoration. CSS-painted phones / browsers / stat counter rows.

Detection (prompt-time): any reference in `freeText` to "illustration" without a specific source. The variant should either request a real image asset or omit illustration entirely.

### 8. Bento-grid abuse

A bento layout (asymmetric grid of mixed-size cards) where the content doesn't justify it. If every card holds the same kind of content (e.g. "feature card with icon + title + body"), it is a regular grid pretending to be bento. Bento works when cards genuinely differ in importance / type / data shape.

Detection: a `grid-template` containing `repeat`-style asymmetry, where all children share the same component type.

### 9. Bounce / elastic easing on production UI

`cubic-bezier(0.68, -0.55, 0.265, 1.55)` or `ease-in-out-back` on click feedback, modal open/close, toast slide-in. Reads as toy / game / demo. Acceptable on intentionally playful brands (Duolingo-style) — never the default.

Detection: any timing function with overshoot (control points < 0 or > 1 on the y-axis) on properties `transform`, `opacity`, `top`, `left`.

### 10. `#000` / `#fff` literals

Pure black and pure white as colour values. Tinted neutrals read more polished and avoid the "harsh contrast" feel. Use OKLch with low chroma toward the brand hue.

Bad:
```css
color: #000; background: #fff;
```

Acceptable:
```css
color: oklch(15% 0.005 250); background: oklch(99% 0.002 250);
```

### 11. Hard-coded hex in component CSS

Any `#XXXXXX` in component-level CSS, when the project has `brandSpec.palette` or `designTokens.colors` available. Forces drift from the design system.

Detection: hex literal in `:scope` block when a token would have sufficed.

### 12. Arbitrary spacing values

`13px`, `7px`, `21px`, `19px`. Spacing not on the project's 4 px grid. The rule: if `designTokens.spacing` exists, every padding / margin / gap MUST be one of those values.

Detection: any length unit not in the project's sampled spacing set.

## Soft-warnings (gate warns; do not block)

These shouldn't be reached for thoughtlessly. The model should self-correct at prompt time. The gate logs them; the user sees a non-blocking warning.

### S1. Too-perfect alignment

Real layouts breathe — a single 1 px nudge can soften a too-perfect grid. When everything is mathematically centred and grid-aligned to within zero variance, the result reads as a wireframe rather than a designed page.

### S2. Round-number whitespace

`16px`, `24px`, `32px` everywhere reads as `Tailwind default`. Slight irregularity (`18px`, `22px`, `26px`) reads as considered. Within a 4 px grid, prefer mixing tiers (`16` + `20` + `24`) over uniform application of one tier.

### S3. Default Tailwind blue everywhere

`text-blue-500`, `bg-blue-600`. The single most overused brand colour in the AI vibe. Even when the project's brand IS blue, ground it via OKLch with a stated chroma — not Tailwind's named token.

### S4. Single-weight typography

The same font-weight on headline + body + label. Real typography uses 2-3 weights to create hierarchy. Even a minimal design needs `400` body + `500` label + `600` headline.

### S5. All-rounded corners

Every surface at the same `border-radius`. Mix sharp + rounded for hierarchy: cards rounded, buttons more rounded, sub-utility surfaces sharper. A consistent radius scale (`0` / `4` / `8` / `16` / `9999`) is fine; a single value everywhere is slop.

### S6. Centred text walls

More than 2 lines of left/right-aligned-to-centre prose in body copy. Reads as poster, not interface. Centre headlines and microcopy; left-align everything else.

### S7. Lorem ipsum / placeholder copy

`Lorem ipsum`, `"Your headline here"`, `"Description goes here"`, `"Click here"`, generic `"Submit"`. Microcopy is a load-bearing design surface — leaving it generic loses 30% of the design's clarity.

### S8. Generic "Welcome to X" / "Get started" headlines

If the headline could apply to any product, it doesn't apply to THIS product. Specify the value proposition or remove the headline.

## The 5-Dimension Self-Critique Rubric

Each variant, before posting, should pass a quick mental score across these 5 dimensions. Sub-5 in any dimension warrants regeneration on a different axis.

| Dimension      | Question                                                | 0-10 scale |
| -------------- | ------------------------------------------------------- | ---------- |
| **Hierarchy**  | Is information weighting intentional and readable?      | 0-10       |
| **Color**      | Is the palette intentional, accessible (AA min), and on-spec? | 0-10 |
| **Typography** | Is the pairing intentional, the scale considered, the body readable? | 0-10 |
| **Spacing**    | Does the layout breathe? Is the rhythm tied to body line-height? | 0-10 |
| **Polish**     | Are micro-interactions, edge-cases, dark-mode, reduced-motion handled? | 0-10 |

Adapted from huashu-design's 5-Dim Radar (MIT) — the original framework is *philosophy / hierarchy / execution / specificity / restraint*. wisp-design uses the more concrete frontend-aligned axes for parity with the variant axes.

Variants that score < 5 on any dimension should not be posted. Re-roll on a different axis pivot.

## Variant-anchor-FIRST rule

Every variant generation MUST start by acknowledging which variant anchor (`linear`, `stripe`, `anthropic`, `aceternity`, `apple`, `vercel`, `raycast`, `notion`, `github`, `tailwind-ui`, `shadcn-default`, `shadcn-soft`, `shadcn-bold`, `editorial`, `modern-minimal`, `tech-utility`, `brutalist`, `soft-warm`, `vault-restrained-cool`, `vault-committed-indigo`, `vault-drenched-warm`) is being used — or explicitly stating "no anchor, house style".

This rule is the **single highest-leverage quality hebel** (audit data: variants WITH explicit anchor scored 50% on the 5-dim rubric; variants WITHOUT scored 3%). The vault audit identified this as the top finding.

Anchor resolution order:

1. If `freeText` references a reference app by name → use that anchor.
2. Else if `brandSpec.variantAnchor` is set → use that.
3. Else if `brandSpec.visualDirection` is set → use the matching open-design preset (e.g. `editorial`).
4. Else → declare "house style" in the rationale.

## The slop-failure-mode test

Before posting, ask: "Would a senior frontend reviewer ask 'why does this look like every AI-generated demo from 2024?'". If yes, regenerate.

Common slop failure modes (auto-detect at gate time):

- Three variants all using oklch hue around 270 (purple) — colour-monoculture.
- Three variants all using the same font-family — typography-monoculture.
- Three variants all using `rounded-lg` — corner-monoculture.
- Three variants all with shadow elevation 4-8 — shadow-monoculture.
- One variant explicitly bypassing the anchor while the other two follow it — coherence break.

## Output-summary block

After generating variants, append to the response a one-line policy summary:

```
policy: anchor=stripe; hard-bans=0; soft-warnings=1 (S2 round-number-whitespace on v1); rule-citations=1 (#6 purple-blue gradient rejected, single-stop accent on border emitted instead).
```

This is consumed by the verification-gate (Phase 5) for fast pre-screening and by the session-replay viewer (Phase 6) for audit trails.

## Why two layers

If the gate were the only enforcement, every variant would be regenerated on hard-ban hits — wastes tokens and adds latency. Prompt-time filtering means most variants don't trigger gate-blocks. The gate is there for the small fraction that slip through: model drift, edge-case prompts, novel slop patterns the rule-list doesn't yet describe.

The two layers also serve different audiences:

- Prompt-time rules are advisory to the model — they're guidance, not policy.
- Gate-time rules are policy enforced against the artefact — they're objective.
