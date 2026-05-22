---
description: The 4 Pre-Code Questions — Role, Distance, Temperature, Capacity. Injected by the `UserPromptSubmit` hook when the user's freeText mentions "new page", "new screen", "new section", "from scratch". Locks the narrative direction before any variants are generated.
license: MIT
attribution: Distilled from Samuel Heftberger's vault (`_brain/principles/narrative-questions.md`) and huashu-design's Four-Position-Questions (MIT, https://github.com/alchaincyf/huashu-design).
---

# 4 Narrative Questions

Before generating UI for a new page or screen, answer these four questions aloud (in chat). Wait for the user's nod or correction. Only then generate variants.

The questions are deliberately short. They each constrain a different facet of the design: who, how close, how warm, how much. Together they replace "purple gradient because 2023" with a specific, defensible direction.

## Why this exists

LLMs without framing default to genre. AI-generated frontend defaults to: gradient hero, three-card grid, sans-serif heading, accent-purple CTA, glassmorphism somewhere. The 4 Questions force the model to pick a target — and a real target excludes a lot of defaults.

Vault audit data: pages designed with the questions answered scored 50% on the 5-dim rubric (`skills/policy/anti-slop.md`). Pages designed without scored 3%. The single highest-leverage upstream gate.

This methodology pairs with `skills/methodology/junior-designer-flow.md` — the 4 Questions are the BRIEF; the Junior-Designer-Flow is the EXECUTION. Brief first, execute second.

## When to run

- New page or new screen requested (`/wisp-design init`, or freeText mentioning "new page", "new screen", "create from scratch", "build a landing page").
- Major redesign (freeText mentions "redesign", "rebuild", "rethink", "tear it down").

NOT for: tuning existing elements ("make this bolder"), small refactors, single-component variants on an existing screen.

## The Four Questions

### Question 1 — Role

> **Who is this for?**
> 
> Answer in one persona, named.

The persona is one human, given a name, age range, and one defining habit or constraint. Not a market segment. Not "developers" — that's 200 segments. Pick one and ride.

**Why it matters.** Personas constrain visual register. A 24-year-old solo dev with three side-projects on her laptop has a different relationship to a UI than a 45-year-old engineering manager at a payments company. Different attention budget, different tolerance for cleverness, different reasons to come back tomorrow.

**Sample answers.**

- `"Maya, 26, ML researcher who lives in a Jupyter notebook and treats most SaaS pages as friction."`
- `"Tomás, 41, head of engineering at a fintech who needs his dashboards to stay calm even when production is on fire."`
- `"Lola, 19, design student looking for tools that don't make her feel stupid."`

**Design implication.** The persona maps loosely to a visual register on `skills/data/anchors/`:

- Skeptic-developer → Linear / Notion / Raycast (restrained-cool).
- Calm-professional → Stripe / Vercel (committed-indigo).
- Open-curious → Aceternity / Anthropic (drenched-warm).
- Power-user → tech-utility / shadcn-bold.

### Question 2 — Distance

> **How intimate is the relationship?**
> 
> One of: `intimate` / `conversational` / `formal`.

How close does the page sit to the user emotionally? Is this a tool they use 8 hours a day (intimate), a tool they consult weekly (conversational), or a tool they meet once in a checkout flow (formal)?

**Why it matters.** Distance maps directly to voice, density, and animation style.

- Intimate → first-person voice ("Let's go"), high information density, fast feedback (100ms), few decorative animations.
- Conversational → second-person voice ("Your reports"), medium density, generous space, considered animations (300ms).
- Formal → third-person/no-person voice ("Reports"), low density, abundant space, no animation unless functional.

**Sample answers.**

- `"intimate"` — A daily-driver dashboard. The user's home page.
- `"conversational"` — A weekly review tool. The user remembers the brand.
- `"formal"` — A first-touch landing page. The user has never heard of us.

**Design implication.** Distance constrains the `voice.distance` field in `brandSpec` and biases the variant prompt:

```yaml
voice:
  distance: intimate   # variants use shorter copy, denser layout, faster transitions
```

### Question 3 — Temperature

> **What is the emotional register?**
> 
> One of: `warm` / `cool` / `neutral`. Optionally extend with `excited` / `calm` / `authoritative` / `gentle` / `sad`.

The temperature is the felt sense of the page. Not the colour temperature — the affective temperature. A blue page can feel warm if its motion is gentle and copy is generous; a red page can feel cool if its motion is sharp and copy is terse.

**Why it matters.** Temperature drives:

- Colour saturation: warm pages → higher chroma; cool → lower.
- Motion easing: warm → `--ease-smooth`; cool → `--ease-sharp`.
- Typography weight: warm → 500/600 headline; cool → 700/800.
- Border radius: warm → 12-16px; cool → 4-8px.

**Sample answers.**

- `"calm"` — A payments dashboard during an outage. Reassurance is the job.
- `"excited"` — A product launch landing. The energy is the message.
- `"authoritative"` — A compliance reporting tool. The user trusts the brand.

**Design implication.** Maps to `voice.temperature` and biases the colour and motion variant axes.

### Question 4 — Capacity (Thumbnail Test)

> **What is the user's mental state when they land?**
> 
> One of: `focused` / `distracted` / `urgent` / `exploratory`.
> 
> Bonus test: if you printed the page at thumbnail size (40px wide), would the user still recognise what it does?

Capacity is the user's available attention budget. A user on an urgent task has 3 seconds. A user exploring has 30. A user focused on the right task has 10 minutes. The design must match.

**Why it matters.** Capacity constrains:

- The single primary action per section (`urgent` → one button, no alternatives; `exploratory` → 3-5 cards of options).
- The amount of text above the fold (`urgent` → ≤ 20 words; `exploratory` → up to a paragraph).
- The number of competing visual elements (`focused` → tight focal point; `distracted` → high-contrast attention magnet).

**Sample answers.**

- `"urgent"` — Pager-duty landing page. User has 30 seconds and an incident on hand.
- `"focused"` — Code editor. User is in flow.
- `"distracted"` — Marketing site. User is in a tab tournament.
- `"exploratory"` — Onboarding wizard. User has time and curiosity.

**Design implication.** Drives layout, hierarchy, and copy length. Also drives the variant `axesEmphasis`:

- `urgent` → emphasise `hierarchy` (one clear action) + `density` (tight scan zone).
- `focused` → emphasise `layout` + `typography` (long-form rhythm).
- `distracted` → emphasise `color` + `density` (attention-grabbing without being noisy).
- `exploratory` → all 5 axes balanced.

## Answer template

Drop this into chat. Fill it. Wait for the nod.

```
Role:        ____
Distance:    intimate | conversational | formal
Temperature: warm | cool | neutral   (and/or excited|calm|authoritative|gentle|sad)
Capacity:    focused | distracted | urgent | exploratory

Thumbnail test:  At 40px wide, what does the user see?
                 ________________________________
```

## Worked example

User says: `"Build me a new landing page for a CLI tool that helps DevOps teams audit their cloud bills."`

The model answers, in chat:

```
Role:        Tomás, 38, SRE-lead at a startup who got the bill from AWS last month and is now nervous.
Distance:    formal — Tomás has never heard of us; first touch.
Temperature: calm + authoritative — bills are stressful; the page should feel like a senior engineer who has solved this before.
Capacity:    distracted — Tomás is in a tab tournament; he has 15 seconds before he switches back to PagerDuty.

Thumbnail test: At 40px wide, Tomás sees a dark calm page with one number ($X saved) and one CTA.

Does this match? If yes, I'll generate 3 variants emphasising hierarchy + color + typography.
If you want me to pick a different persona, just say so.
```

ONLY after the user nods (or corrects), proceed to generate variants. The answers go into `brandSpec.voice` and bias the variant prompt.

## What this is NOT

- Not a marketing exercise. The answers stay in `brandSpec`, not in copy.
- Not exhaustive. Four questions, no more. If you need a fifth, you've drifted into product strategy, not design.
- Not skippable when generating new pages. The vault audit is unambiguous: pages without these answers regress to slop.
- Not applicable to existing-element tuning. "Make this card bolder" doesn't need a persona — that's `skills/reference/live.md` territory.
