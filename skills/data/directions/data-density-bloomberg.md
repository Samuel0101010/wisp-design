---
name: data-density-bloomberg
description: Dense information layout with monospace columns, no decoration, and function-first composition — the Bloomberg terminal lineage applied to modern interfaces.
category: huashu-direction
license: MIT
attribution: Adapted from huashu-design (MIT, https://github.com/alchaincyf/huashu-design) `references/design-styles.md` — re-described in wisp-design's voice.
best-for: Trading platforms, analytics dashboards, observability tools, financial products.
mood: [dense, professional, function-first, machine-precise]
maps-to-anchor: dataviz-functional
cautions: []
---

# Data Density Bloomberg

Modelled on the Bloomberg Terminal and descendants (TradingView, Sentry, Datadog). Information density is the goal — every pixel earns its position. Monospace dominates because column alignment matters; semantic colour is non-negotiable; decoration is a sin against the user's time. Built for people who live in it 8+ hours a day.

## Principles
- Information density is a feature, not a problem.
- Monospace for aligned data (prices, numbers, timestamps).
- Semantic colour — red-down, green-up, yellow-warn.
- No decorative whitespace — gaps aid scanning only.
- Tables and grids first-class; cards last-resort.

## Typography
- Body: IBM Plex Mono or JetBrains Mono at 12-13px.
- Labels: Inter or Söhne at 11-12px for metadata.
- Weights: 400 default, 500 emphasis, 700 headings.
- Line-height tight — 1.3-1.4 for tabular density.
- Numerals tabular always; oldstyle never.

## Color Palette
- Ground: `oklch(15% 0 0)`
- Surface: `oklch(18% 0 0)`
- Text: `oklch(88% 0 0)`
- Muted: `oklch(60% 0 0)`
- Up: `oklch(70% 0.16 145)`
- Down: `oklch(65% 0.20 25)`
- Warn: `oklch(78% 0.18 90)`
- Accent: `oklch(70% 0.14 200)` for hover/selection.

## Layout Rules
- Tables dominate — fixed-width columns, sortable headers, frozen panes.
- Row-padding 4-6px, column-padding 8-12px.
- Hover-states subtle (1-2% lift).
- Keyboard shortcuts surfaced everywhere.
- Sparklines and inline histograms welcome.

## Anti-Slop Boundaries
- No decorative cards with shadows.
- No glassmorphism — hides data behind blur.
- No gradients — colour is functional.

## NEVER
- Generous whitespace.
- Rounded corners above 2px.
- Icons without text labels.
- Animations beyond instant state changes.
