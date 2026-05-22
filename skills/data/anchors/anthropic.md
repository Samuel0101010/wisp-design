---
name: anthropic
oneLiner: Drenched warm, soft, considered, careful
source: vault
license: MIT
attribution: Distilled from Samuel Heftberger's vault (`_brain/inspiration/reference-apps/anthropic.md`). Describes visual language only; not affiliated with Anthropic.
reference: https://www.anthropic.com
---

# Anchor — Anthropic

The Anthropic aesthetic: warm papery surfaces, soft type, considered restraint. Reads as "this is by people who think a lot before they speak." The visual equivalent of a research lab that talks slowly because it's choosing words.

## Visual signatures

- **Typography.** Serif display (Tiempos or near) paired with humanist sans body. Generous leading (1.6+ on body). Negative tracking on display. No uppercase abuse — even buttons stay in mixed case. Long-form reading is a first-class concern.
- **Color.** Drenched warm. Surface `oklch(96% 0.03 80)` (papery cream). Foreground `oklch(20% 0.02 30)` (warm dark). Accent rare; when used, terracotta or warm clay. Borders barely visible — depth is implied by typography, not chrome.
- **Density.** Generous. Lots of whitespace. Body width capped at 65-72 ch for prose-rhythm. Spacing tiers feel slow, not tight.
- **Motion.** Almost absent. State changes via colour shifts, not transforms. No scroll-triggered effects in main content. Reduced-motion default-feeling.

## Token-set

```css
:root {
  --anthropic-bg:        oklch(96% 0.03 80);
  --anthropic-bg-elev:   oklch(98% 0.02 80);
  --anthropic-fg:        oklch(20% 0.02 30);
  --anthropic-fg-muted:  oklch(40% 0.03 40);
  --anthropic-accent:    oklch(55% 0.14 30);
  --anthropic-border:    oklch(90% 0.03 60);
  --anthropic-radius:    4px;
  --anthropic-pad:       32px;
  --anthropic-h1-fs:     3rem;
  --anthropic-body-lh:   1.65;
  --anthropic-ease:      cubic-bezier(0.4, 0, 0.6, 1);
}
```

## When to pick this

1. **Long-form reading products.** Documentation that's prose, essays, research papers — anywhere reading endurance matters.
2. **Research-tone brands.** When the voice is `calm` + `considered` + `formal` and the audience expects intellectual seriousness.
3. **Anti-AI-vibe products.** Anthropic's design actively rejects the genre defaults of AI-product UI (purple gradients, glass cards, hero metrics). Choose it specifically when the audience is sceptical of AI-styled marketing.

## Counter-examples

1. **Dense dashboards.** Anthropic's generosity fights with information density. Use `linear` or `tech-utility` for high-data UIs.
2. **Performance-marketing landing pages.** The slow rhythm reads as "thoughtful" — wrong tone for "convert now". Use `stripe` or `modern-minimal`.
3. **Brutalist or playful brands.** Anthropic is grown-up; force-fit hurts both ends. Use `brutalist` or `soft-warm` instead.

## Reference

Anthropic's design language is most visible on https://www.anthropic.com and its research publications. The visual restraint is itself a brand message.
