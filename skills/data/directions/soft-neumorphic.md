---
name: soft-neumorphic
oneLiner: Light pastels, subtle shadows, rounded corners, low-contrast.
category: huashu-direction
license: MIT
attribution: Adapted from huashu-design (MIT, https://github.com/alchaincyf/huashu-design) `references/design-styles.md` — re-described in wisp-design's voice.
best-for: Settings panels, smart-home dashboards, audio apps, children's products, brands explicitly playful.
mood: [tactile, soft, calming, residential]
maps-to-anchor: soft-warm
cautions: ["Anti-a11y by default: low-contrast surfaces routinely fail WCAG AA. Opt-in only. The verification-gate will block accept on text/control contrast violations — neumorphic variants MUST emit explicit high-contrast foreground tokens or compensate with iconography + labels.", "Defaults to a particular visual era (2020 dribbble-revival). Dates quickly outside its niche."]
---

# Soft Neumorphic

Neumorphism simulates extruded soft-material surfaces — controls feel like they're pressed up from below a sheet of clay. The pleasure is tactile: every interactive element looks like you could press it with a finger. The cost is contrast: real neumorphism is a11y-hostile by construction.

## Principles

- **Twin shadows for extrusion.** One light shadow top-left, one dark shadow bottom-right. The element appears pushed-out from the ground.
- **Twin shadows for indentation.** Reversed: dark top-left, light bottom-right. Element appears pressed-in.
- **Surfaces and ground share hue.** Background is the same colour family as cards; contrast comes from shadow, not value.
- **Pastel palette.** Low chroma (< 0.05), mid-high lightness (88-95%).
- **Round generously.** Border-radius 12-24px on controls, 16-32px on cards.
- **Compensate contrast in text.** Text and icons MUST cross WCAG AA by virtue of darker foreground colours, not by virtue of the surface effect.

## Typography

- **Display:** Inter, SF Pro Display, weight 500-600. Sans, friendly.
- **Body:** same family, weight 400-500, line-height 1.55.
- **Avoid serif** — competes with the soft surfaces visually.
- **Foreground colour MUST be at least `oklch(35% 0.02 H)` on light grounds** to satisfy contrast.

## Palette (OKLCH)

- Ground: `oklch(93% 0.02 250)` (cool pastel) or `oklch(94% 0.03 30)` (warm pastel)
- Surface (same as ground — neumorphism mandate)
- Foreground: `oklch(30% 0.02 250)` — DARK enough for AA against the pale ground
- Accent: `oklch(60% 0.18 270)` (soft purple) or `oklch(60% 0.16 145)` (soft mint)
- Shadow-light: `oklch(99% 0.005 250 / 0.8)`
- Shadow-dark: `oklch(75% 0.02 250 / 0.4)`

## Layout

Generous padding (24-40px on cards). Controls separated by clear gaps. NEVER stack neumorphic-on-neumorphic — the dual-shadow logic breaks visually.

Sample shadow pattern (extruded button):

```css
box-shadow:
  -6px -6px 12px oklch(99% 0.005 250 / 0.8),
   6px  6px 12px oklch(75% 0.02 250 / 0.4);
```

Inverted on `:active` (pressed-in).

## NEVER

- Pure white or pure black backgrounds — defeats the soft-shadow logic entirely.
- High-contrast accent colours — competes with the tactile effect.
- Sharp corners (`border-radius < 8px`) on any interactive element.
- Skip the WCAG AA contrast check. EVER. Defaults fail; you must verify.
- Apply neumorphism to ENTIRE pages. Use selectively: dashboards, settings, audio controls.
