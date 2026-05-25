---
name: terminal-monospace
description: IBM Plex Mono or JetBrains Mono everywhere, scanline-adjacent aesthetic, amber or green text on near-black — the developer terminal raised to a primary visual language.
category: huashu-direction
license: MIT
attribution: Adapted from huashu-design (MIT, https://github.com/alchaincyf/huashu-design) `references/design-styles.md` — re-described in wisp-design's voice.
best-for: Developer tools, CLI dashboards, observability platforms, security products.
mood: [technical, dense, authentic, machine-precise]
maps-to-anchor: terminal-utility
cautions: [niche-only]
---

# Terminal Monospace

Adopts the terminal as a primary surface. Monospace everywhere; alignment is grid-snapped to character width; colour is restrained to two or three semantic tones. Descends from BBS culture, CRT phosphor displays, and modern tools like `tmux`, `helix`, `lazygit`.

## Principles
- One monospace typeface across the entire system.
- Character-width grid: spacing in `1ch` increments.
- Colour is functional — ground, text, dim text, semantic.
- Box-drawing characters (`─`, `│`, `┌`, `┘`) welcome.
- No icons unless density genuinely requires them.

## Typography
- IBM Plex Mono, JetBrains Mono, Berkeley Mono, or Fira Code.
- Single weight (400); 600 for emphasis only.
- 14-15px base — monospace runs visually larger.
- Line-height 1.4-1.5 (tighter than proportional).
- No italics or underlines — colour or weight for emphasis.

## Color Palette
- Ground: `oklch(15% 0 0)`
- Text: `oklch(85% 0.08 80)` amber OR `oklch(85% 0.12 145)` green
- Dim: `oklch(55% 0.04 80)` (or 145)
- Error: `oklch(70% 0.18 25)`
- Success: `oklch(75% 0.14 145)` (only if accent is amber)
- Body-on-ground contrast ≥ 9:1.

## Layout Rules
- Horizontal alignment via `ch`, never `px` or `rem`.
- Tables and lists dominate; cards rare.
- Section dividers via box-drawing or hairline rules.
- Right-align numbers, left-align labels.
- No animations except cursor blink.

## Anti-Slop Boundaries
- No gradients — terminal aesthetic is flat.
- No glassmorphism — phosphor doesn't blur.
- No decorative icons or stock illustrations.

## NEVER
- Proportional fonts mixed in.
- Rounded corners (`border-radius: 0`).
- Drop shadows.
- Photographic imagery (use ASCII or omit).
