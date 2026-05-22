---
description: The 5-10-2-8 Brand Asset Protocol. OPT-IN via `--brand` flag or explicit `brand` mode. Default-off elsewhere to avoid disrupting iterative design work. Use for greenfield brand work or when consolidating an inherited brand mess.
license: MIT
attribution: Distilled from Samuel Heftberger's vault (`_brain/principles/brand-asset-protocol.md`) and huashu-design's Core Asset Protocol (MIT, https://github.com/alchaincyf/huashu-design).
---

# Brand Asset Protocol — 5-10-2-8

A four-stage timeline for setting up a brand foundation that the rest of `wisp-design` can build on. Each number is a time budget; together they describe a path from "no brand" to "production-ready brand system".

## Open Decision #4 — confirmed

This protocol is **opt-in**. It is NOT triggered by default in regular variant-generation work. It IS the default inside an explicit `brand` mode:

- Triggered by `/wisp-design init --brand`.
- Triggered by `/wisp-design brand` (sub-command).
- Triggered by a `freeText` request that mentions "brand audit", "design system from scratch", "set up the brand".

NOT triggered by:

- Regular `configure` events ("make this card bolder").
- New-page work via `skills/methodology/junior-designer-flow.md`.
- Token extraction via `/wisp-design tokens extract`.

Rationale: forcing 5-10-2-8 on every iterative request would crater velocity. Most projects don't need the full ritual — they need a brand-spec that's good enough and a way to evolve it. The ritual is for the moments when "good enough" stops being good enough.

## The Protocol

### 5 minutes — Audit

In five minutes, the model and user assemble what brand assets already exist.

Inventory checklist:

- **Logo** — does one exist? Where? What format (SVG / PNG / inline)?
- **Wordmark** — distinct from logo? Lock-up?
- **Primary palette** — does the project's existing CSS reveal one? Run `/wisp-design tokens extract` if not.
- **Type** — what fonts are loaded? Are they intentional (`next/font/google` import) or inherited?
- **Brand voice** — is there a `PRODUCT.md`, `BRAND.md`, or any document where someone described the brand in words?
- **Anti-references** — has anyone written down what the brand is NOT?

Output: a brand-spec sketch in `.wisp/brand-spec.json`, with `name`, `oneLiner`, `audience`, and any palette values that survived audit. Fields not yet known stay empty.

5 minutes is the budget. If audit takes longer, the project is past the protocol's scope — escalate to a real brand consultancy.

### 10 minutes — Three mood-board options

In ten minutes, the model presents **three distinct visual directions**. Each one:

- Has a name (e.g. "Restrained Cool", "Drenched Warm", "Committed Indigo").
- References an anchor from `skills/data/anchors/` or a real-world reference brand.
- Comes with a 50-100 word rationale of why it fits the user's audience and voice.
- Includes a tiny visual sample — typically a HTML snippet showing a card + button + heading in that direction.

The three are deliberately distinct on different primary axes (the same 5 axes as variant generation — hierarchy / layout / typography / color / density). If the user is leaning toward "modern minimal", three "modern minimal" variants is a failure.

Output: a chat message with three labelled snippets. User picks one (or remixes).

This is the **interactive form** from huashu-design's Direction-Advisor flow, adapted for chat. The model is the advisor, the user is the client, the three options are the deliverable.

### 2 hours — Build one cohesive design system

With the direction confirmed, spend two hours producing a production-ready foundation:

1. **Palette** — full OKLch token set, including:
   - Surface tokens (`bg`, `bg-elevated`, `bg-overlay`).
   - Foreground tokens (`fg`, `fg-muted`, `fg-subtle`).
   - Accent + on-accent.
   - Semantic state colours (`success`, `warning`, `destructive`, `info`).
   - Each tone tested for AA contrast against its paired token.

2. **Typography** — full type-scale:
   - `--type-step` chosen (default 1.333; brutalist 1.5; minimal 1.25).
   - Font families (heading + body + mono).
   - Weight set (minimum 3: 400 / 500 / 600).
   - Line-height tokens (`--lh-tight / -comfortable / -loose`).
   - Text-wrap tokens (`balance` for headings, `pretty` for body).

3. **Motion** — easing + duration tokens:
   - `--ease-smooth` (default 90% reveal).
   - `--ease-sharp` (hero / declarative).
   - `--ease-spring` (intentional overshoot).
   - `--ease-power` (gradient sweeps).
   - `--duration-100 / 300 / 500` (feedback / state-change / layout).

4. **Radius** — single source `--radius` (0 brutalist / 0.25 subtle / 0.5 default / 1 friendly / 1.5 playful).

5. **Spacing** — 4 px base grid; tier set (`--space-0/4/8/12/16/24/32/48/64`).

6. **Brand-spec write-back** — finalise `.wisp/brand-spec.json` with all 9 sections (`name`, `oneLiner`, `audience`, `voice`, `visualDirection`, `variantAnchor`, `palette`, `typeScale`, `motion`).

This stage is intensive. Two hours is the budget because beyond it, marginal returns drop sharply — the system needs real usage to refine.

### 8 weeks — Refine via real usage

The remaining 8 weeks are NOT spent designing. They're spent SHIPPING. The brand-spec evolves through contact with reality:

- Every new page surfaces a gap in the palette → add the token.
- Every animation that feels wrong reveals a missing duration → add it.
- Every component that fights the system gets a `policy.md` entry.

During the 8 weeks, the model uses the in-session policy-proposal flow (`src/agent/policy-proposal.ts`, Phase 6) to suggest additions to the brand-spec when it observes patterns:

> "I've noticed the last three components used `padding: 28px`. This isn't in `designTokens.spacing` (which has 24 and 32). Should I add 28, or normalise to 32?"

After 8 weeks, the brand-spec is mature. Most subsequent design work uses it without modification.

## The non-negotiable rule — Logo

**Logo is non-negotiable when it exists.**

If the user has a logo (in any format), the design MUST use it. No CSS-painted alternatives. No SVG-silhouette substitutes. No "logo coming soon" placeholders that ship to production.

If the logo's resolution or format is wrong (e.g. PNG with white background on a dark theme), the protocol PAUSES — the user must supply a usable version. The model does not improvise a replacement.

If the user has NO logo, the protocol's 5-minute audit flags it as a gap. The 2-hour build phase can include a wordmark (text-only logo using the brand typeface), but only if the user explicitly accepts text-only as final.

## Anti-references

The 5-minute audit should capture **anti-references** — brands the user explicitly does NOT want to look like. Vault audit data: explicit anti-references are 2x more useful than explicit references for steering away from slop.

Common anti-reference patterns:

- "Not Linear" → avoid restrained-cool greys + ultra-thin borders.
- "Not Stripe" → avoid committed-indigo + dense info layouts.
- "Not v0/Lovable defaults" → avoid every AI-generated visual cliché (purple-blue, glass cards, hero-metric grid).
- "Not corporate" → avoid stock-photo human-staring-at-laptop hero.

Anti-references go into `brandSpec.audience.antiReferences` (extension field; not enforced by the schema yet — use freely).

## Quality floor — 8/10 across all dimensions

Adopted from huashu-design. The 5 evaluation dimensions are:

1. **Sharpness** — every asset (logo, photography) at production resolution. No blurry uploads. Score 8+/10.
2. **Authenticity** — the brand reads as the brand. A "premium" brand should look it on the first millisecond of attention. Score 8+/10.
3. **Brand alignment** — the visual choices align with the stated voice. A calm brand should not have aggressive motion. Score 8+/10.
4. **Style consistency** — three pages share one visual language. Not three different aesthetics in three sections. Score 8+/10.
5. **Narrative independence** — the design doesn't require the rest of the marketing site to make sense. Each surface stands. Score 8+/10.

Sub-8 in any dimension = the protocol re-enters that stage. This is the closest the methodology gets to a hard gate.

## When to skip the protocol

Skip when:

- The project is < 4 weeks old and the brand is intentionally evolving.
- The user is iterating on a single component and brand work would be a context switch.
- The user has a mature brand and is doing a single-screen redesign.

Don't skip when:

- The model's previous variants felt "off" and the user can't articulate why → the brand is missing.
- The project is being handed off to a different team → the brand-spec MUST be portable.
- A re-platform or major redesign is starting → re-audit before scaling.

## Output artefacts

After running the protocol:

- `.wisp/brand-spec.json` — 9-section schema, complete or near-complete.
- `.wisp/brand-mood-boards/` — three HTML snippets captured from the 10-minute stage, for posterity.
- `.wisp/sessions/<id>.jsonl` — full session log including the user's picks at each stage.
- Optionally a `BRAND.md` written into the project root (only on user request).

These artefacts feed the rest of `wisp-design` — every subsequent variant generation reads `brandSpec` first.
