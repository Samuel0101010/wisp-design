---
name: apple
oneLiner: Cinematic, spatial, motion-led, premium
source: vault
license: MIT
attribution: Distilled from Samuel Heftberger's vault (`_brain/inspiration/reference-apps/apple.md`, `_brain/inspiration/taste-anchors/apple.md`). Describes visual language only; not affiliated with Apple.
reference: https://www.apple.com
---

# Anchor — Apple

The Apple aesthetic: edge-to-edge cinematic tiles, scroll-driven storytelling, ultra-high-fidelity imagery, single accent (action-blue #0066cc) on otherwise neutral surfaces. Reads as "this is a piece of cinema that happens to be a product page." Highest bar of any anchor.

## Visual signatures

- **Typography.** SF Pro Display (or `-apple-system` fallback). Massive headlines (often 100-160 px on desktop) with weight 600-700. Tight letter-spacing (-0.04 em) on display. Body 17 px at weight 400. Generous line-height (1.4) on body.
- **Color.** Neutral chrome — white surfaces in light mode, `oklch(8% 0 0)` near-black in dark mode. Single accent: action-blue `#0066cc` (oklch ~45% 0.18 250) on links and CTAs. Photography is the colour — UI itself is restrained.
- **Density.** Sparse. Sections are full-viewport. Information arrives one beat at a time, scroll-driven. Cards rare; tile-grids common.
- **Motion.** Cinema-grade. Image-sequence scrubbing on hero (`<canvas>` + scroll position). Parallax multi-layer. Fade-up entrance animations tied to intersection observers. Lenis-style smooth-scroll foundation.

## Token-set

```css
:root {
  --apple-bg:        oklch(99% 0 0);
  --apple-bg-elev:   oklch(96% 0 0);
  --apple-fg:        oklch(15% 0 0);
  --apple-fg-muted:  oklch(45% 0 0);
  --apple-accent:    #0066cc;
  --apple-accent-fg: oklch(98% 0 0);
  --apple-border:    oklch(90% 0 0);
  --apple-radius:    16px;
  --apple-h1-fs:     clamp(3rem, 8vw, 8rem);
  --apple-display-tracking: -0.04em;
  --apple-body-lh:   1.4;
  --apple-ease-cinema: cubic-bezier(0.16, 1, 0.3, 1);
}
```

## When to pick this

1. **Premium product launches.** When the product IS the story and photography exists at brand-grade resolution.
2. **Hardware or physical-good marketing.** Apple's pattern works because there's a tangible thing to photograph. Software products struggle to fill the cinematic frames.
3. **Single-page narrative sites.** Scroll-driven storytelling where each section earns its full-viewport claim.

## Counter-examples

1. **Apps with dense content.** Apple's marketing pattern is bad for apps that need to expose dense functionality. Use `linear` or `tech-utility`.
2. **Brands without photography budget.** This anchor depends on production-grade photography. Without it, the layout exposes empty space and reads as unfinished.
3. **Performance-constrained contexts.** Apple-grade motion is expensive — image sequences and parallax need real engineering. Skip on mobile-first projects with strict performance budgets.

## Anti-slop note

Many AI-generated "Apple-style" outputs miss the actual virtue: Apple's restraint. The model is tempted to over-decorate. The discipline is to USE the photography as the visual interest and let the chrome disappear.

## Reference

Apple's design language is visible across https://www.apple.com and the product pages. The image-sequence-scrub pattern (e.g. AirPods page) is a specific technical achievement covered in vault's `_brain/patterns/scroll-narrative.md`.
