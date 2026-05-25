// wisp-design — Generating animation overlay (Phase 7.2)
//
// Renders a shimmering positioned-fixed overlay above each picked target
// while the agent generates variants. The overlay is purely decorative,
// pointer-events:none, and self-destroys when `unmount()` is called.
//
// Reduced-motion users see a soft pulse (no traveling shimmer band).
// The overlay tracks each target's bounding-rect across scroll/resize via
// rAF so it stays glued to the element. It is removed by `unmount()`
// when the cycling event arrives.

import { WISP_UI_DATA_ATTRIBUTE } from "./constants.js";

const W = WISP_UI_DATA_ATTRIBUTE;

const OVERLAY_STYLES =
  `[${W}="generating-overlay"]{` +
    `position:fixed;pointer-events:none;` +
    `border-radius:8px;` +
    // Two layers: pulsing tint + traveling shimmer band — accents bumped
    // for visibility at a glance (was 0.18 / 0.04, now 0.34 / 0.10).
    `background:rgba(23,23,23,0.06);` +
    `box-shadow:0 0 0 2px rgba(23,23,23,0.34),` +
                `0 0 0 10px rgba(23,23,23,0.10);` +
    `animation:wisp-gen-pulse 1.2s ease-in-out infinite;` +
    `overflow:hidden;` +
    `z-index:2147483645;` +
  `}` +
  `[${W}="generating-overlay"]::after{` +
    `content:"";position:absolute;inset:0;` +
    `background:linear-gradient(110deg,` +
      `transparent 30%,` +
      `rgba(23,23,23,0.07) 50%,` +
      `transparent 70%);` +
    `transform:translateX(-100%);` +
    `animation:wisp-gen-shimmer 1.6s linear infinite;` +
  `}` +
  `[${W}="generating-overlay-label"]{` +
    `position:absolute;top:-26px;left:0;` +
    `font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;` +
    `font-size:11px;font-weight:500;color:rgb(23,23,23);` +
    `background:rgba(250,250,250,0.95);` +
    `border:1px solid rgb(229,229,229);border-radius:4px;` +
    `padding:2px 6px;letter-spacing:0.02em;` +
    `display:inline-flex;align-items:center;gap:6px;` +
    `pointer-events:none;` +
  `}` +
  `[${W}="generating-overlay-spinner"]{` +
    `width:8px;height:8px;border-radius:50%;` +
    `border:1.5px solid rgb(229,229,229);border-top-color:rgb(23,23,23);` +
    `animation:wisp-gen-spin 0.7s linear infinite;` +
  `}` +
  `@keyframes wisp-gen-pulse{` +
    `0%,100%{box-shadow:0 0 0 2px rgba(23,23,23,0.34),0 0 0 10px rgba(23,23,23,0.10)}` +
    `50%{box-shadow:0 0 0 3px rgba(23,23,23,0.50),0 0 0 14px rgba(23,23,23,0.14)}` +
  `}` +
  `@keyframes wisp-gen-shimmer{` +
    `to{transform:translateX(100%)}` +
  `}` +
  `@keyframes wisp-gen-spin{to{transform:rotate(360deg)}}` +
  // Reduced-motion: keep just the pulsing border, drop shimmer + spin
  `@media (prefers-reduced-motion: reduce){` +
    `[${W}="generating-overlay"]{animation:wisp-gen-pulse 2s ease-in-out infinite}` +
    `[${W}="generating-overlay"]::after{display:none}` +
    `[${W}="generating-overlay-spinner"]{animation:none;border-top-color:rgb(229,229,229)}` +
  `}`;

const STYLES_ATTR = "generating-overlay-styles";

function injectStylesOnce(): void {
  if (typeof document === "undefined") return;
  if (document.querySelector(`style[${W}="${STYLES_ATTR}"]`) !== null) return;
  const style = document.createElement("style");
  style.setAttribute(W, STYLES_ATTR);
  style.textContent = OVERLAY_STYLES;
  document.head.appendChild(style);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface GeneratingOverlayHandle {
  unmount(): void;
  /** Force a position update — useful for ad-hoc DOM mutations. */
  reposition(): void;
}

export interface MountGeneratingOverlayOptions {
  /** Selectors (one per target) — overlay sticks to each element. */
  selectors: string[];
  /** Optional label override (default: `Generating N variants…`). */
  label?: string;
  /** Number of variants being generated (for the default label). */
  variantCount?: number;
}

/**
 * Mount an animated overlay above each target. Returns a handle whose
 * `unmount()` removes the overlays and stops the tracking rAF. Calling
 * unmount() twice is a no-op. Safe to call when no targets resolve — the
 * overlay collection simply stays empty.
 */
export function mountGeneratingOverlay(
  opts: MountGeneratingOverlayOptions,
): GeneratingOverlayHandle {
  injectStylesOnce();

  const variantCount = Math.max(1, opts.variantCount ?? 3);
  const labelText =
    opts.label ?? `Generating ${variantCount} variant${variantCount > 1 ? "s" : ""}…`;

  interface Entry {
    selector: string;
    overlay: HTMLDivElement;
  }
  const entries: Entry[] = [];
  let rafId: number | null = null;
  let unmounted = false;

  for (const sel of opts.selectors) {
    let target: Element | null = null;
    try {
      target = document.querySelector(sel);
    } catch {
      target = null;
    }
    if (target === null) continue;
    const overlay = document.createElement("div");
    overlay.setAttribute(W, "generating-overlay");
    overlay.setAttribute("aria-hidden", "true");

    const label = document.createElement("span");
    label.setAttribute(W, "generating-overlay-label");
    const spinner = document.createElement("span");
    spinner.setAttribute(W, "generating-overlay-spinner");
    spinner.setAttribute("aria-hidden", "true");
    label.appendChild(spinner);
    label.appendChild(document.createTextNode(labelText));
    overlay.appendChild(label);

    document.body.appendChild(overlay);
    entries.push({ selector: sel, overlay });
  }

  const reposition = (): void => {
    if (unmounted) return;
    for (const e of entries) {
      let el: Element | null;
      try {
        el = document.querySelector(e.selector);
      } catch {
        el = null;
      }
      if (el === null) {
        e.overlay.style.display = "none";
        continue;
      }
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) {
        e.overlay.style.display = "none";
        continue;
      }
      e.overlay.style.display = "";
      // Position-fixed overlay aligned to the target's viewport rect.
      e.overlay.style.left = `${r.left - 4}px`;
      e.overlay.style.top = `${r.top - 4}px`;
      e.overlay.style.width = `${r.width + 8}px`;
      e.overlay.style.height = `${r.height + 8}px`;
    }
  };

  const tick = (): void => {
    if (unmounted) return;
    reposition();
    rafId = window.requestAnimationFrame(tick);
  };
  // Initial position + start tracking.
  reposition();
  rafId = window.requestAnimationFrame(tick);

  return {
    unmount(): void {
      if (unmounted) return;
      unmounted = true;
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
        rafId = null;
      }
      for (const e of entries) {
        if (e.overlay.parentNode) e.overlay.parentNode.removeChild(e.overlay);
      }
      entries.length = 0;
    },
    reposition,
  };
}

// ---------------------------------------------------------------------------
// Module export
// ---------------------------------------------------------------------------

export const generatingOverlayModule = { mountGeneratingOverlay };
