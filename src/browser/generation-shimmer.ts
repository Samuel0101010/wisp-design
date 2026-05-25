// wisp-design — Generation-Shimmer (Phase 7.14).
//
// Visible animation rendered OVER the picked element(s) while variants are
// being designed. Replaces the silent "nothing happening on the page" gap
// between Generate click and cycling-state render with a deliberate,
// branded waiting cue:
//
//   - Dashed border that pulses (matches picker outline color)
//   - Diagonal scanline gradient sweeping across the element
//   - A small "Designing variants…" label in the top-right corner
//
// The overlay is `pointer-events: none` so it never blocks the page. It
// is positioned relative to the document so it scrolls with the target
// element naturally; a scroll + resize listener + ResizeObserver keeps
// the rect in sync. Respects `prefers-reduced-motion: reduce` by stilling
// the animations (border stays solid, no sweep, no pulse).
//
// Mount lifetime: from `state-machine.generate-start` → first cycling
// event arrives. The floating-bar owns the handle and calls .unmount()
// on every render that isn't `generating`.
//
// Tested in tests/browser/generation-shimmer.test.ts.

import { WISP_UI_DATA_ATTRIBUTE as W } from "./constants.js";

const SHIMMER_STYLES_ATTR = "shimmer-styles";

const SHIMMER_CSS = `
[${W}="shimmer-overlay"] {
  position: absolute;
  pointer-events: none;
  box-sizing: border-box;
  z-index: 2147483645;
  border: 2px dashed rgba(23, 23, 23, 0.78);
  border-radius: 6px;
  background:
    linear-gradient(
      135deg,
      transparent 0%,
      transparent 30%,
      rgba(23, 23, 23, 0.06) 48%,
      rgba(23, 23, 23, 0.10) 50%,
      rgba(23, 23, 23, 0.06) 52%,
      transparent 70%,
      transparent 100%
    );
  background-size: 200% 200%;
  background-repeat: no-repeat;
  animation:
    wisp-shimmer-sweep 2.2s linear infinite,
    wisp-shimmer-pulse 1.6s ease-in-out infinite;
  contain: layout paint;
}
[${W}="shimmer-label"] {
  position: absolute;
  top: -10px;
  right: 12px;
  font: 500 11px/1 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  letter-spacing: 0.02em;
  color: rgb(245, 245, 245);
  background: rgb(23, 23, 23);
  padding: 5px 9px;
  border-radius: 999px;
  white-space: nowrap;
  transform: translateZ(0);
}
[${W}="shimmer-label"]::before {
  content: "";
  display: inline-block;
  width: 6px;
  height: 6px;
  margin-right: 6px;
  border-radius: 50%;
  background: rgb(194, 161, 72);
  vertical-align: middle;
  animation: wisp-shimmer-dot 1.2s ease-in-out infinite;
}
@keyframes wisp-shimmer-sweep {
  0%   { background-position: 200% 0%; }
  100% { background-position: -100% 0%; }
}
@keyframes wisp-shimmer-pulse {
  0%, 100% { border-color: rgba(23, 23, 23, 0.78); }
  50%      { border-color: rgba(23, 23, 23, 0.28); }
}
@keyframes wisp-shimmer-dot {
  0%, 100% { transform: scale(1);    opacity: 1;   }
  50%      { transform: scale(1.35); opacity: 0.55; }
}
@media (prefers-reduced-motion: reduce) {
  [${W}="shimmer-overlay"] {
    animation: none;
    background: none;
    border-color: rgba(23, 23, 23, 0.6);
  }
  [${W}="shimmer-label"]::before { animation: none; }
}
`;

function injectShimmerStylesOnce(): void {
  if (typeof document === "undefined") return;
  if (document.querySelector(`style[${W}="${SHIMMER_STYLES_ATTR}"]`) !== null) {
    return;
  }
  const style = document.createElement("style");
  style.setAttribute(W, SHIMMER_STYLES_ATTR);
  style.textContent = SHIMMER_CSS;
  document.head.appendChild(style);
}

export interface ShimmerTarget {
  /** CSS selector — used to look up the live element after mount. */
  selector: string;
  /** Last-known bounding rect (used as initial position before resync). */
  rect: { x: number; y: number; w: number; h: number };
}

export interface ShimmerHandle {
  /** Remove the overlay and detach all listeners. Safe to call twice. */
  unmount(): void;
  /** Force a re-position (useful when the bar finishes a transition). */
  reposition(): void;
}

export interface MountShimmerOptions {
  /** Targets to shimmer over — typically one (the picked element), but the
   *  multi-select case is supported (one overlay per target). */
  targets: ShimmerTarget[];
  /** Optional custom label text. Defaults to "Designing variants…". */
  label?: string;
}

export function mountShimmer(opts: MountShimmerOptions): ShimmerHandle {
  injectShimmerStylesOnce();
  const labelText = opts.label ?? "Designing variants…";

  interface Mounted {
    selector: string;
    overlay: HTMLDivElement;
  }
  const mounted: Mounted[] = [];

  for (const t of opts.targets) {
    const overlay = document.createElement("div");
    overlay.setAttribute(W, "shimmer-overlay");
    overlay.setAttribute("aria-hidden", "true");

    const label = document.createElement("div");
    label.setAttribute(W, "shimmer-label");
    label.textContent = labelText;
    overlay.appendChild(label);

    document.body.appendChild(overlay);
    mounted.push({ selector: t.selector, overlay });
    positionFromRect(overlay, t.rect);
  }

  const reposition = (): void => {
    for (const m of mounted) {
      const el = safeQuerySelector(m.selector);
      if (el === null) continue;
      const rect = el.getBoundingClientRect();
      positionFromRect(m.overlay, {
        x: rect.left + window.scrollX,
        y: rect.top + window.scrollY,
        w: rect.width,
        h: rect.height,
      });
    }
  };

  // Initial sync — the rect we got from PickResult is a viewport rect, but
  // overlays are position:absolute against the document. Re-derive from
  // the live element if it still exists.
  reposition();

  // Track resize / scroll. ResizeObserver covers element-size changes
  // (HMR re-renders, content-driven reflow). window scroll + resize cover
  // viewport shifts. All passive so we never block scrolling.
  let scrollRaf = 0;
  const onScrollOrResize = (): void => {
    if (scrollRaf !== 0) return;
    scrollRaf = window.requestAnimationFrame(() => {
      scrollRaf = 0;
      reposition();
    });
  };
  window.addEventListener("scroll", onScrollOrResize, { passive: true, capture: true });
  window.addEventListener("resize", onScrollOrResize);

  const observers: ResizeObserver[] = [];
  if (typeof ResizeObserver !== "undefined") {
    for (const m of mounted) {
      const el = safeQuerySelector(m.selector);
      if (el === null) continue;
      const ro = new ResizeObserver(onScrollOrResize);
      try {
        ro.observe(el);
        observers.push(ro);
      } catch {
        /* observer threw — degrade silently */
      }
    }
  }

  let unmounted = false;
  return {
    reposition,
    unmount(): void {
      if (unmounted) return;
      unmounted = true;
      if (scrollRaf !== 0) {
        window.cancelAnimationFrame(scrollRaf);
        scrollRaf = 0;
      }
      window.removeEventListener("scroll", onScrollOrResize, { capture: true } as EventListenerOptions);
      window.removeEventListener("resize", onScrollOrResize);
      for (const ro of observers) {
        try { ro.disconnect(); } catch { /* ignore */ }
      }
      for (const m of mounted) {
        if (m.overlay.parentNode !== null) {
          m.overlay.parentNode.removeChild(m.overlay);
        }
      }
    },
  };
}

function positionFromRect(
  overlay: HTMLElement,
  rect: { x: number; y: number; w: number; h: number },
): void {
  overlay.style.left = `${rect.x}px`;
  overlay.style.top = `${rect.y}px`;
  overlay.style.width = `${rect.w}px`;
  overlay.style.height = `${rect.h}px`;
}

function safeQuerySelector(selector: string): Element | null {
  try {
    return document.querySelector(selector);
  } catch {
    return null;
  }
}

export const generationShimmerModule = { mountShimmer };
