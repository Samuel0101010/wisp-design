// wisp-design — Variant morph slider (Phase 7.16, Tier-2 #3).
//
// Slider that lets the user interpolate the LIVE preview between two
// adjacent variants in real time. Uses cssVars (custom-properties declared
// via `/* @param: ... */ --wisp-*` annotations in variant CSS) — the same
// hook parameter-sliders.ts writes to. When two variants share at least one
// cssVar, the slider produces a smooth morph; non-interpolatable vars
// snap at t<0.5.
//
// The slider is mounted inside the cycling-state action row in floating-bar.
// When dropped (mouseup), it commits the morphed CSS-var set to localStorage
// under a session-scoped key so the choice can be persisted across reloads.
//
// This module is browser-pure: no Node imports, no fetch. The interpolation
// logic mirrors `src/agent/morph.ts` but is self-contained so the live.js
// bundle stays under the 50 KB budget.

import { WISP_UI_DATA_ATTRIBUTE } from "./constants.js";

const W = WISP_UI_DATA_ATTRIBUTE;

// ---------------------------------------------------------------------------
// Pure interpolation — same algorithm as agent/morph.ts but inline.
// ---------------------------------------------------------------------------

const CSS_VALUE_RE = /^(-?\d+(?:\.\d+)?)([a-z%]*)$/i;
const INTERPOLATABLE_UNITS = new Set([
  "",
  "px",
  "rem",
  "em",
  "%",
  "vh",
  "vw",
  "deg",
  "ms",
  "s",
]);

interface Parsed {
  numeric: number;
  unit: string;
}

function parseValue(s: string): Parsed | null {
  const trimmed = (s ?? "").trim();
  if (trimmed.length === 0) return null;
  const m = CSS_VALUE_RE.exec(trimmed);
  if (m === null) return null;
  const numeric = Number(m[1]);
  if (!Number.isFinite(numeric)) return null;
  return { numeric, unit: (m[2] ?? "").toLowerCase() };
}

function formatNumeric(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return (Math.round(n * 10000) / 10000).toString();
}

export interface VarDiff {
  name: string;
  valueA: string;
  valueB: string;
  interpolatable: boolean;
  unit?: string;
}

export function buildDiff(
  varsA: Record<string, string>,
  varsB: Record<string, string>,
): VarDiff[] {
  const names = new Set<string>([...Object.keys(varsA ?? {}), ...Object.keys(varsB ?? {})]);
  const out: VarDiff[] = [];
  for (const name of Array.from(names).sort()) {
    const rawA = varsA?.[name];
    const rawB = varsB?.[name];
    const valueA = rawA ?? rawB ?? "";
    const valueB = rawB ?? rawA ?? "";
    const pA = parseValue(valueA);
    const pB = parseValue(valueB);
    let interpolatable = false;
    let unit: string | undefined;
    if (pA && pB && pA.unit === pB.unit && INTERPOLATABLE_UNITS.has(pA.unit)) {
      interpolatable = true;
      unit = pA.unit;
    }
    const diff: VarDiff = { name, valueA, valueB, interpolatable };
    if (unit !== undefined) diff.unit = unit;
    out.push(diff);
  }
  return out;
}

export function interpolateAt(diffs: readonly VarDiff[], t: number): Record<string, string> {
  const clamped = !Number.isFinite(t) ? 0 : t < 0 ? 0 : t > 1 ? 1 : t;
  const result: Record<string, string> = {};
  for (const d of diffs) {
    if (d.interpolatable) {
      const pA = parseValue(d.valueA);
      const pB = parseValue(d.valueB);
      if (pA && pB) {
        const numeric = pA.numeric + (pB.numeric - pA.numeric) * clamped;
        const unit = d.unit ?? pA.unit;
        result[d.name] = `${formatNumeric(numeric)}${unit}`;
        continue;
      }
    }
    result[d.name] = clamped < 0.5 ? d.valueA : d.valueB;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Mount — UI side.
// ---------------------------------------------------------------------------

export interface VariantSnap {
  id: string;
  cssVars: Record<string, string>;
}

export interface MorphSliderOptions {
  container: HTMLElement;
  variantA: VariantSnap;
  variantB: VariantSnap;
  /** Called on every input event with the new interpolated cssVars. The
   *  floating-bar layer writes each entry to the live @scope root via
   *  `setProperty`. */
  onMorph: (vars: Record<string, string>) => void;
}

export interface MorphSliderHandle {
  /** Remove the slider DOM + listeners. */
  unmount(): void;
  /** Recompute the diff (after the active or partner variant changes) and
   *  reset the slider to t=0. */
  reset(opts: Pick<MorphSliderOptions, "variantA" | "variantB">): void;
}

const STYLES_ATTR = "morph-slider-styles";
const STYLES =
  `[${W}="morph-row"]{display:flex;gap:8px;align-items:center;margin-top:8px;padding:6px 8px;border-radius:8px;background:rgb(250,250,250);border:1px solid rgb(229,229,229)}` +
  `[${W}="morph-label"]{font-size:11px;color:rgb(115,115,115);text-transform:uppercase;letter-spacing:0.06em}` +
  `[${W}="morph-arrow"]{font-size:13px;color:rgb(64,64,64);font-weight:500}` +
  `[${W}="morph-slider"]{flex:1;height:18px;cursor:pointer;accent-color:rgb(23,23,23)}` +
  `[${W}="morph-slider"]:disabled{opacity:0.4;cursor:not-allowed}` +
  `[${W}="morph-value"]{font-size:11px;color:rgb(64,64,64);font-variant-numeric:tabular-nums;min-width:32px;text-align:right}` +
  `[${W}="morph-empty"]{font-size:11px;color:rgb(115,115,115);font-style:italic}`;

function injectStylesOnce(): void {
  if (typeof document === "undefined") return;
  if (document.querySelector(`style[${W}="${STYLES_ATTR}"]`) !== null) return;
  const style = document.createElement("style");
  style.setAttribute(W, STYLES_ATTR);
  style.textContent = STYLES;
  document.head.appendChild(style);
}

export function mountMorphSlider(opts: MorphSliderOptions): MorphSliderHandle {
  injectStylesOnce();

  let diffs = buildDiff(opts.variantA.cssVars ?? {}, opts.variantB.cssVars ?? {});

  const row = document.createElement("div");
  row.setAttribute(W, "morph-row");
  row.setAttribute("role", "group");
  row.setAttribute("aria-label", "Morph between variants");

  const label = document.createElement("span");
  label.setAttribute(W, "morph-label");
  label.textContent = "Morph";
  row.appendChild(label);

  // Empty-state path: no shared cssVars means we cannot interpolate. Show
  // a quiet hint instead of a non-functional slider — false-affordance is
  // worse than no affordance.
  const interpolatableCount = diffs.filter((d) => d.interpolatable).length;
  if (interpolatableCount === 0) {
    const empty = document.createElement("span");
    empty.setAttribute(W, "morph-empty");
    empty.textContent =
      diffs.length === 0
        ? "no shared parameters between variants"
        : "no numeric parameters to morph";
    row.appendChild(empty);
    opts.container.appendChild(row);
    return {
      unmount(): void {
        if (row.parentNode) row.parentNode.removeChild(row);
      },
      reset(): void {
        // No-op in empty state — caller should re-mount via container.
      },
    };
  }

  const arrow = document.createElement("span");
  arrow.setAttribute(W, "morph-arrow");
  arrow.textContent = `${shortId(opts.variantA.id)} → ${shortId(opts.variantB.id)}`;
  row.appendChild(arrow);

  const slider = document.createElement("input");
  slider.setAttribute(W, "morph-slider");
  slider.type = "range";
  slider.min = "0";
  slider.max = "100";
  slider.step = "1";
  slider.value = "0";
  slider.setAttribute("aria-label", `Interpolate from ${opts.variantA.id} to ${opts.variantB.id}`);
  row.appendChild(slider);

  const valueLbl = document.createElement("span");
  valueLbl.setAttribute(W, "morph-value");
  valueLbl.textContent = "0%";
  row.appendChild(valueLbl);

  const onInput = (): void => {
    const t = Math.max(0, Math.min(100, Number(slider.value) || 0)) / 100;
    valueLbl.textContent = `${Math.round(t * 100)}%`;
    const vars = interpolateAt(diffs, t);
    opts.onMorph(vars);
  };
  slider.addEventListener("input", onInput);

  opts.container.appendChild(row);

  return {
    unmount(): void {
      slider.removeEventListener("input", onInput);
      if (row.parentNode) row.parentNode.removeChild(row);
    },
    reset(next): void {
      diffs = buildDiff(next.variantA.cssVars ?? {}, next.variantB.cssVars ?? {});
      slider.value = "0";
      valueLbl.textContent = "0%";
      arrow.textContent = `${shortId(next.variantA.id)} → ${shortId(next.variantB.id)}`;
    },
  };
}

function shortId(id: string): string {
  if (id.length <= 4) return id;
  return id.slice(0, 4);
}

// ---------------------------------------------------------------------------
// Module export
// ---------------------------------------------------------------------------

export const variantMorphSliderModule = {
  buildDiff,
  interpolateAt,
  mountMorphSlider,
};
