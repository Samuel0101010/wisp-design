---
description: Index of 20+ Design Directions — pickable visual philosophies. Used for cold-start scenarios where the user's brief is vague and needs concrete option-shape proposals. Distinct from anchors (anchors = brand-style references; directions = visual philosophies).
license: MIT
attribution: Adapted from huashu-design's `references/design-styles.md` (MIT, https://github.com/alchaincyf/huashu-design). Re-described one-liners; full content forked in Phase 7 launch prep. See `README.md` for fork plan.
---

# Design Directions Index

Twenty-plus visual philosophies. Each is broader than a brand anchor — anchors describe what Linear looks like; directions describe what minimalism IS. Used when:

1. The user's brief is vague ("I want it to look modern").
2. The 4 Narrative Questions identified a temperature but not an anchor.
3. The Brand-Asset-5-10-2-8 protocol's 10-minute mood-board stage needs three options to present.

Each direction in the table is one-liner. Full content lives in dedicated direction files (forked in Phase 7).

| Direction              | One-liner                                                               | Best-For                                          |
| ---------------------- | ----------------------------------------------------------------------- | ------------------------------------------------- |
| `minimalism-swiss`     | Grid-based, generous whitespace, sans-only, restrained colour           | Trust-driven SaaS, professional services          |
| `neumorphism`          | Soft 3D extruded surfaces — light/shadow simulation                     | Settings panels (NEVER default; a11y-hostile)     |
| `glassmorphism`        | Frosted glass overlays with blur + translucent backgrounds              | Modal layers ONLY; never as default chrome        |
| `claymorphism`         | Rounded 3D clay-like surfaces with soft shadows                         | Children's apps, playful onboarding               |
| `brutalism`            | Heavy display weights, sharp edges, asymmetry, raw feel                 | Studios, agencies, music labels, conferences      |
| `bento-grid`           | Asymmetric grid of mixed-size content cards                             | Product feature pages (when content justifies)    |
| `skeuomorphism`        | Real-world material textures, leather, paper, wood                      | Note-taking apps, calendars (rare today)          |
| `flat-design`          | Pure flat colour blocks, no shadows, no gradients                       | Mobile UI 2014-style; back in pendulum cycle      |
| `material-design`      | Google's design system — elevation, motion, layered surfaces            | Android apps, internal tools needing familiarity  |
| `apple-hig`            | iOS/macOS conventions — spring physics, vibrancy, tab bars              | iOS apps, Mac apps                                |
| `editorial-magazine`   | Serif display + sans body, intentional asymmetry, drop-caps             | Long-form content, fashion, hospitality           |
| `cyberpunk-neon`       | Saturated neons on dark, scanlines, glitch effects                      | Gaming, music, demos (a11y-hostile)               |
| `dark-academia`        | Sepia warm darks, serif typography, scholarly restraint                 | Education, classical-arts brands                  |
| `y2k-futurism`         | Chrome, holographics, bubble shapes, anti-aliased pixelation            | Fashion, music, niche consumer (cyclical)         |
| `vaporwave-aesthetic`  | Pastel pink/cyan, retro grids, Greek statues, nostalgic VHS feel        | Music, art-tooling, niche creative                |
| `terminal-utility`     | Mono-everywhere, ASCII frames, no decoration, max density               | Developer tools, observability dashboards         |
| `papercraft`           | Layered paper-like surfaces, sharp edges, illustrated style             | Children's products, hospitality, hand-feel       |
| `noir-monochrome`      | Pure black/white with single accent, high contrast, dramatic            | Photography portfolios, film, fashion             |
| `botanical-organic`    | Earth tones, organic shapes, natural illustration                       | Wellness, sustainability, food                    |
| `dataviz-functional`   | Charts-first, mono-numerals, semantic colour, dense                     | Analytics, fintech, scientific tools              |
| `motion-poetics`       | Motion as primary expression — scroll-driven, image-sequence            | Premium product launches, brand storytelling      |
| `info-architecture`    | Hierarchy-first, table-of-contents-driven, dense linking                | Documentation, reference sites                    |
| `cinematic-spatial`    | Full-viewport sections, parallax, photography-first                     | Hardware, luxury brands                           |
| `eastern-philosophy`   | Ma (negative space), asymmetric balance, considered restraint           | Premium brands, Asian-market products             |
| `experimental-avant-garde` | Rule-breaking layouts, unconventional navigation, art-piece feel | Studios, art platforms, design portfolios         |
| `monochrome-minimal`   | Pure greyscale, all hierarchy via weight + size, no chroma              | Photography, studios, content-first products      |
| `dark-mode-noir`       | True-black ground, single restrained accent, thin type                  | Developer tools, music apps, premium evening apps |
| `paper-tactile`        | Textured cream ground, real serif body, ink-saturated colour            | Reading apps, journals, publishing, hospitality   |
| `terminal-monospace`   | Monospace everywhere, scanline aesthetic, amber/green on near-black     | Dev tools, observability, security products       |
| `bauhaus-geometric`    | Primary triad + black/white, strict grid, geometric sans                | Studios, design schools, manufacturing brands     |
| `scandi-warm-minimal`  | Sand/cream/charcoal, humanist sans, generous whitespace                 | Hospitality, wellness, lifestyle products         |
| `museum-archive`       | Cream ivory, dense small-cap labels, hairline rules                     | Archives, galleries, cultural institutions        |
| `industrial-utilitarian` | Concrete grey, oversized type, hard right-angles, no decoration       | Manufacturing, logistics, B2B operations          |
| `editorial-fashion`    | Extreme display serif, pure-white ground, generous tracking             | Fashion, beauty, jewelry, luxury hospitality      |
| `1990s-print`          | Risograph-inspired off-register, limited 3-color palette                | Zines, music labels, indie publishing, festivals  |
| `playful-rounded`      | Heavy rounded corners, humanist sans, soft pastel accents               | Children's apps, consumer fintech, wellness       |
| `data-density-bloomberg` | Dense info, monospace columns, no decoration, function-first          | Trading platforms, analytics, observability       |
| `archival-typewriter`  | Courier type, faded ink colors, paper tone, manuscript layout           | Writing tools, screenwriting, archives            |
| `glass-architectural`  | Restrained glass on layer-2+ surfaces only (modals, palettes)           | Modal overlays, command palettes, Apple-platform  |

## How to use

The variant-generation prompt does NOT directly reference these directions — they're conceptual frames. The `skills/data/anchors/` files map directions to concrete token-sets (e.g. `editorial-magazine` direction → `editorial` anchor).

The Brand-Asset-5-10-2-8 protocol's 10-minute mood-board stage uses this list: "show three directions on different axes". The user picks one; the protocol then resolves to a concrete anchor.

## Forking note

The full content of each direction (3-5 hallmarks, 3-5 mood keywords, optional reference work, sample HTML) lives in huashu-design's `references/design-styles.md` under MIT. Phase 7 of the wisp-design build will fork the full content into `skills/data/directions/<name>.md` files. Phase 4 ships ONLY this index as a discoverability surface.

See `README.md` in this folder for the fork plan and attribution requirements.

## What this is NOT

- Not a complete taxonomy of design. The list is opinionated and curated, not exhaustive.
- Not a fashion forecast. Most directions cycle; the index notes "(cyclical)" where the trend is currently rising or falling.
- Not a substitute for anchors. Anchors are concrete and operational; directions are conceptual and presentational.
