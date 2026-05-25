// wisp-design — Floating bar (Phase 7 visual polish).
//
// Single DOM bar pinned bottom-right. Five modes:
//   - idle         compact "wisp-design + Pick" pill
//   - picking      "Click an element…" instruction + ESC hint
//   - configuring  target breadcrumb + textarea + variant-count + (Cancel | Generate)
//   - generating   spinner + elapsed + Cancel
//   - cycling      variant CARDS (stacked) + action row + keyboard hints
//
// Design system:
//   - Solid white (#fafafa) background — no glassmorphism, no gradient
//   - Neutral-900/500/400 typography hierarchy
//   - Shadow: layered depth, no blur
//   - Radius: 12px (bar) / 8px (cards, buttons)
//   - Typography: ui-sans-serif system stack, 14px base
//   - Transitions: 250ms cubic for bar entry; 120ms ease for mode switches
//
// Keyboard:
//   - `attachKeyboard({ state, onAction })` wires window keydown and returns an
//     unsubscribe function. Called by index.ts (Agent C). Not called here.
//
// All children carry `data-wisp-ui` so the picker and multi-select handlers
// reject clicks on the bar's own UI. All user/agent strings are funnelled
// through `SanitizeModule`. Never innerHTML.

import {
  ANNOTATION_NOTE_MAX_LEN,
  DEFAULT_VARIANT_COUNT,
  FREE_TEXT_MAX_LEN,
  MAX_VARIANT_COUNT,
  MIN_VARIANT_COUNT,
  WISP_UI_DATA_ATTRIBUTE,
} from "./constants.js";
import type {
  Annotation,
  AnnotationKind,
  BrowserState,
  BrowserStateKind,
  FloatingBarMode,
  ParameterBinding,
  PickResult,
  SanitizeModule,
  Variant,
} from "../contracts/browser.js";
import {
  mountToolPanels,
  type ToolPanelHandle,
} from "./tool-panels.js";
import {
  mountShimmer,
  type ShimmerHandle,
} from "./generation-shimmer.js";
import {
  DEVIATION_DEFAULT,
  DEVIATION_MAX,
  DEVIATION_MIN,
  readDeviation,
  writeDeviation,
} from "./persisted-settings.js";
import { scoreVariant, type RadarScore } from "./a11y-radar.js";
import {
  mountMorphSlider,
  type MorphSliderHandle,
} from "./variant-morph-slider.js";

const SELECTED_ATTR = "data-wisp-selected";
const VARIANT_COUNT_CHOICES = [1, 3, 5, 8] as const;
const ANNOTATION_KINDS: AnnotationKind[] = [
  "padding",
  "color",
  "size",
  "content",
  "spacing",
  "typography",
  "other",
];

// ---------------------------------------------------------------------------
// KeyboardAction type — parsed by attachKeyboard, dispatched via onAction.
// ---------------------------------------------------------------------------

export type KeyboardAction =
  | "cancel"
  | "submit"
  | "accept"
  | "discard"
  | "cycle-next"
  | "cycle-prev"
  | "select-variant-0"
  | "select-variant-1"
  | "select-variant-2"
  | "select-variant-3"
  | "select-variant-4"
  | "select-variant-5"
  | "select-variant-6"
  | "select-variant-7";

// ---------------------------------------------------------------------------
// styles — single block, namespaced so no host CSS bleeds in or out.
// ---------------------------------------------------------------------------

const W = WISP_UI_DATA_ATTRIBUTE;

// Shared color tokens — NO purple, NO blue, NO gradient, NO backdrop-filter.
const C = {
  bg: "#fafafa",
  border: "rgb(229 229 229)",
  shadow: "0 8px 24px -4px rgb(0 0 0 / 0.12), 0 2px 8px -2px rgb(0 0 0 / 0.08)",
  text900: "rgb(23 23 23)",
  text700: "rgb(64 64 64)",
  text500: "rgb(115 115 115)",
  text400: "rgb(163 163 163)",
  neutral100: "rgb(245 245 245)",
  neutral200: "rgb(229 229 229)",
  neutral300: "rgb(212 212 212)",
  neutral900: "rgb(23 23 23)",
  white: "#ffffff",
  outline: "2px solid rgb(23 23 23)",
} as const;

const BAR_STYLES =
  // Bar container
  `[${W}="bar"]{` +
    `position:fixed;right:16px;bottom:16px;z-index:2147483646;` +
    `font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;` +
    `font-size:14px;line-height:1.5;color:${C.text900};` +
    `background:${C.bg};border:1px solid ${C.border};border-radius:12px;` +
    `box-shadow:${C.shadow};` +
    `padding:12px;min-width:320px;max-width:480px;width:max-content;` +
    `box-sizing:border-box;` +
    // Entry animation: slide up from 8px below + fade in
    `transform:translateY(0);opacity:1;` +
    `transition:transform 250ms cubic-bezier(0.4,0,0.2,1),opacity 250ms cubic-bezier(0.4,0,0.2,1);` +
  `}` +
  // Content fade on mode switch
  `[${W}="bar-content"]{` +
    `opacity:1;transition:opacity 120ms ease;` +
  `}` +
  `[${W}="bar-content"][data-wisp-fading="1"]{opacity:0}` +
  // Universal box-sizing reset inside bar
  `[${W}] *{box-sizing:border-box}` +
  // Inherit font into all form elements
  `[${W}] textarea,[${W}] input,[${W}] select,[${W}] button{` +
    `font:inherit;color:inherit;` +
  `}` +
  // Brand label
  `[${W}="brand"]{` +
    `font-size:11px;color:${C.text400};text-transform:uppercase;` +
    `letter-spacing:0.08em;margin-bottom:8px;` +
  `}` +
  // Textarea
  `[${W}] textarea{` +
    `width:100%;background:${C.white};border:1px solid ${C.neutral200};` +
    `border-radius:8px;padding:8px 10px;resize:none;min-height:72px;max-height:200px;` +
    `color:${C.text900};outline:none;transition:border-color 0.15s ease;` +
  `}` +
  `[${W}] textarea:focus{border-color:${C.neutral900}}` +
  // Select
  `[${W}] select{` +
    `background:${C.white};border:1px solid ${C.neutral200};border-radius:8px;` +
    `padding:6px 8px;color:${C.text900};outline:none;cursor:pointer;` +
    `transition:border-color 0.15s ease;` +
  `}` +
  `[${W}] select:focus{border-color:${C.neutral900}}` +
  // PRIMARY button — solid neutral-900 + white text
  `[${W}] button[data-wisp-btn="primary"]{` +
    `background:${C.neutral900};color:${C.white};` +
    `border:1px solid ${C.neutral900};border-radius:8px;` +
    `padding:8px 14px;font-weight:500;font-size:13px;cursor:pointer;` +
    `transition:background 0.1s ease,border-color 0.1s ease;` +
  `}` +
  `[${W}] button[data-wisp-btn="primary"]:hover{background:rgb(38 38 38);border-color:rgb(38 38 38)}` +
  `[${W}] button[data-wisp-btn="primary"]:focus-visible{` +
    `outline:${C.outline};outline-offset:2px;` +
  `}` +
  // SECONDARY button — white + border
  `[${W}] button[data-wisp-btn="secondary"]{` +
    `background:${C.white};color:${C.text900};` +
    `border:1px solid ${C.neutral300};border-radius:8px;` +
    `padding:8px 14px;font-weight:500;font-size:13px;cursor:pointer;` +
    `transition:background 0.1s ease;` +
  `}` +
  `[${W}] button[data-wisp-btn="secondary"]:hover{background:${C.neutral100}}` +
  `[${W}] button[data-wisp-btn="secondary"]:focus-visible{` +
    `outline:${C.outline};outline-offset:2px;` +
  `}` +
  // ICON button — square 32×32
  `[${W}] button[data-wisp-btn="icon"]{` +
    `background:${C.white};color:${C.text900};` +
    `border:1px solid ${C.neutral300};border-radius:8px;` +
    `width:32px;height:32px;padding:0;font-size:13px;font-weight:500;cursor:pointer;` +
    `display:inline-flex;align-items:center;justify-content:center;` +
    `transition:background 0.1s ease;flex-shrink:0;` +
  `}` +
  `[${W}] button[data-wisp-btn="icon"]:hover{background:${C.neutral100}}` +
  `[${W}] button[data-wisp-btn="icon"]:focus-visible{` +
    `outline:${C.outline};outline-offset:2px;` +
  `}` +
  // ALL disabled buttons
  `[${W}] button[disabled]{opacity:0.45;cursor:not-allowed}` +
  // Row / wrap helpers
  `[${W}="row"]{display:flex;gap:8px;align-items:center}` +
  `[${W}="row-wrap"]{display:flex;gap:8px;align-items:center;flex-wrap:wrap}` +
  `[${W}="spacer"]{flex:1}` +
  // Meta / secondary text
  `[${W}="meta"]{font-size:12px;color:${C.text500}}` +
  // Hint text (keyboard)
  `[${W}="hint"]{font-size:11px;color:${C.text400};margin-top:8px}` +
  // Instruction (picking mode)
  `[${W}="instruction"]{` +
    `font-size:13px;color:${C.text500};padding:6px 0;` +
  `}` +
  // Spinner (no purple — uses neutral-900)
  `[${W}="spinner"]{` +
    `width:14px;height:14px;border-radius:50%;` +
    `border:2px solid ${C.neutral200};border-top-color:${C.neutral900};` +
    `animation:wisp-spin 0.7s linear infinite;display:inline-block;flex-shrink:0;` +
  `}` +
  `@keyframes wisp-spin{to{transform:rotate(360deg)}}` +
  // Elapsed timer text
  `[${W}="elapsed"]{font-size:12px;color:${C.text500}}` +
  // Variant CARD stack
  `[${W}="card-stack"]{display:flex;flex-direction:column;gap:6px;margin:8px 0}` +
  `[data-wisp-variant-card]{` +
    `border:1px solid ${C.neutral200};border-radius:8px;padding:12px;` +
    `cursor:pointer;background:${C.bg};` +
    `transition:background 0.12s ease,box-shadow 0.12s ease;` +
    `text-align:left;width:100%;font:inherit;` +
  `}` +
  `[data-wisp-variant-card]:hover{background:${C.neutral100}}` +
  `[data-wisp-variant-card]:focus-visible{outline:${C.outline};outline-offset:2px}` +
  `[data-wisp-variant-card][aria-pressed="true"]{` +
    `background:rgb(250 250 250);` +
    `box-shadow:0 0 0 2px ${C.neutral900};` +
  `}` +
  `[${W}="card-top"]{display:flex;align-items:center;gap:8px;margin-bottom:6px}` +
  `[${W}="card-num"]{` +
    `font-size:11px;color:${C.text400};` +
    `font-variant-numeric:tabular-nums;font-weight:600;` +
  `}` +
  `[${W}="card-badge"]{` +
    `font-size:10px;background:${C.neutral900};color:${C.white};` +
    `border-radius:9999px;padding:1px 7px;font-weight:500;` +
  `}` +
  // a11y-radar badge (Phase 7.16, Tier-2 #1). Score 0..100 with color band.
  `[${W}="radar-badge"]{` +
    `font-size:10px;border-radius:9999px;padding:1px 6px;font-weight:600;` +
    `font-variant-numeric:tabular-nums;letter-spacing:0.02em;` +
    `display:inline-flex;align-items:center;gap:3px;` +
    `cursor:help;` +
  `}` +
  `[${W}="radar-badge"][data-severity="good"]{background:rgb(220 252 231);color:rgb(22 101 52)}` +
  `[${W}="radar-badge"][data-severity="warn"]{background:rgb(254 243 199);color:rgb(120 53 15)}` +
  `[${W}="radar-badge"][data-severity="fail"]{background:rgb(254 226 226);color:rgb(127 29 29)}` +
  `[${W}="radar-dot"]{width:6px;height:6px;border-radius:50%}` +
  `[${W}="radar-dot"][data-severity="good"]{background:rgb(34 197 94)}` +
  `[${W}="radar-dot"][data-severity="warn"]{background:rgb(245 158 11)}` +
  `[${W}="radar-dot"][data-severity="fail"]{background:rgb(239 68 68)}` +
  `[${W}="card-rationale"]{` +
    `font-size:13px;color:${C.text700};` +
    `display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;` +
  `}` +
  // Quick-prompt chips
  // Deviation slider row (Phase 7.15) — sits between textarea and chips.
  `[${W}="deviation-row"]{` +
    `display:flex;align-items:center;gap:8px;margin-top:8px;` +
    `font-size:11px;color:${C.text500};` +
  `}` +
  `[${W}="deviation-label"]{` +
    `font-weight:500;color:${C.text900};letter-spacing:0.01em;` +
  `}` +
  `[${W}="deviation-end"]{font-size:10px;color:${C.text400};letter-spacing:0.03em}` +
  `[${W}="deviation-value"]{` +
    `font-variant-numeric:tabular-nums;font-weight:600;color:${C.text900};` +
    `min-width:14px;text-align:center;` +
  `}` +
  `[${W}="deviation-slider"]{` +
    `flex:1;height:18px;background:transparent;cursor:pointer;` +
    `-webkit-appearance:none;appearance:none;` +
  `}` +
  `[${W}="deviation-slider"]::-webkit-slider-runnable-track{` +
    `height:3px;background:${C.neutral200};border-radius:999px;` +
  `}` +
  `[${W}="deviation-slider"]::-moz-range-track{` +
    `height:3px;background:${C.neutral200};border-radius:999px;border:none;` +
  `}` +
  `[${W}="deviation-slider"]::-webkit-slider-thumb{` +
    `-webkit-appearance:none;appearance:none;` +
    `width:14px;height:14px;border-radius:50%;background:${C.neutral900};` +
    `margin-top:-5px;border:none;cursor:pointer;` +
    `transition:transform 0.1s ease;` +
  `}` +
  `[${W}="deviation-slider"]::-moz-range-thumb{` +
    `width:14px;height:14px;border-radius:50%;background:${C.neutral900};` +
    `border:none;cursor:pointer;` +
  `}` +
  `[${W}="deviation-slider"]::-webkit-slider-thumb:hover{transform:scale(1.15)}` +
  `[${W}="deviation-slider"]:focus-visible{outline:${C.outline};outline-offset:4px;border-radius:999px}` +
  `[${W}="chip-row"]{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}` +
  `[${W}="chip"]{` +
    `background:${C.white};border:1px solid ${C.neutral200};border-radius:9999px;` +
    `padding:4px 10px;font-size:12px;color:${C.text700};cursor:pointer;` +
    `transition:background 0.1s ease,border-color 0.1s ease,color 0.1s ease;` +
  `}` +
  `[${W}="chip"]:hover{background:${C.neutral900};color:${C.white};border-color:${C.neutral900}}` +
  `[${W}="chip"]:focus-visible{outline:${C.outline};outline-offset:2px}` +
  // Action row
  `[${W}="actions"]{display:flex;gap:8px;align-items:center;margin-top:8px}` +
  // Annotation popover
  `[${W}="annotation-popover"]{` +
    `border-top:1px solid ${C.neutral200};margin-top:10px;padding-top:10px;` +
  `}` +
  // Param slot inherits layout
  `[${W}="param-slot"]{margin-top:4px}` +
  // Selected element outline on host page
  `[${SELECTED_ATTR}]{outline:2px dotted ${C.neutral900}!important;outline-offset:2px}`;

// ---------------------------------------------------------------------------
// helpers — DOM creation with the ui attribute pre-set.
// ---------------------------------------------------------------------------

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: Record<string, string>,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.setAttribute(WISP_UI_DATA_ATTRIBUTE, attrs?.[WISP_UI_DATA_ATTRIBUTE] ?? "child");
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (k === WISP_UI_DATA_ATTRIBUTE) continue;
      node.setAttribute(k, v);
    }
  }
  return node;
}

function btn(
  kind: "primary" | "secondary" | "icon",
  text: string,
  onClick: () => void,
): HTMLButtonElement {
  const b = el("button", { "data-wisp-btn": kind });
  b.textContent = text;
  b.setAttribute("type", "button");
  b.addEventListener("click", onClick);
  return b;
}

function clear(node: Element): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

// Phase 7.16 — build an a11y-radar badge element. Score is a 0..100 score
// with severity-coloured background; tooltip carries the top finding so
// the user can hover to see the most-impacting penalty without opening
// the audit panel.
function makeRadarBadge(score: RadarScore): HTMLElement {
  const badge = document.createElement("span");
  badge.setAttribute(WISP_UI_DATA_ATTRIBUTE, "radar-badge");
  badge.setAttribute("data-severity", score.severity);
  badge.setAttribute(
    "aria-label",
    `Accessibility score ${score.score} out of 100, ${score.severity}`,
  );
  const tooltip =
    score.topFinding === null
      ? `a11y ${score.score} / 100 — no detected issues`
      : `a11y ${score.score} / 100 — ${score.topFinding.message}`;
  badge.title = tooltip;
  const dot = document.createElement("span");
  dot.setAttribute(WISP_UI_DATA_ATTRIBUTE, "radar-dot");
  dot.setAttribute("data-severity", score.severity);
  dot.setAttribute("aria-hidden", "true");
  badge.appendChild(dot);
  badge.appendChild(document.createTextNode(`a11y ${score.score}`));
  return badge;
}

function injectStylesOnce(): void {
  if (document.querySelector(`style[${WISP_UI_DATA_ATTRIBUTE}="bar-styles"]`) !== null) return;
  const style = document.createElement("style");
  style.setAttribute(WISP_UI_DATA_ATTRIBUTE, "bar-styles");
  style.textContent = BAR_STYLES;
  document.head.appendChild(style);
}

// ---------------------------------------------------------------------------
// Public surface.
// ---------------------------------------------------------------------------

export interface CycleCtx {
  variants: Variant[];
  activeIndex: number;
  bindings: ParameterBinding[];
}

export interface ConfigureCtx {
  targets: PickResult[];
  freeText: string;
  requestedVariantCount: number;
}

export interface GeneratingCtx {
  startedAt: number;
  requestedVariantCount: number;
}

export interface FloatingBarOptions {
  sanitize: SanitizeModule;
  onFreeTextChange: (text: string) => void;
  /** Phase 7.15 — `deviation` (1..5) tells the agent how far the variants
   *  should drift from the original. Optional for back-compat with callers
   *  that don't read it yet; the generating-event payload simply omits the
   *  field when undefined. */
  onFreeTextSubmit: (text: string, variantCount: number, deviation?: number) => void;
  onConfigureCancel: () => void;
  onGenerateCancel: () => void;
  onCycleNext: () => void;
  onCyclePrev: () => void;
  onCycleSetActive: (index: number) => void;
  onParamChange: (varName: string, value: string) => void;
  onAccept: () => void;
  onDiscard: () => void;
  onAnnotationAdd: (a: Annotation) => void;
  onPickStart: () => void;
  /** Optional — bridge URL displayed in the About tool panel. */
  bridgeUrl?: string;
  /** Optional — bridge token, required for the Recent tool fetch. */
  bridgeToken?: string;
  /** Optional — initial default variant count (shown in Settings). */
  initialVariantCount?: number;
  /** Optional — Settings → variant-count callback. */
  onVariantCountChange?: (count: number) => void;
}

export interface FloatingBarHandle {
  setMode(mode: BrowserStateKind, ctx?: ConfigureCtx | GeneratingCtx | CycleCtx): void;
  teardown(): void;
  attachKeyboard(opts: {
    state: () => BrowserState;
    onAction: (action: KeyboardAction) => void;
  }): () => void;
  el: HTMLElement;
}

export function createFloatingBar(opts: FloatingBarOptions): FloatingBarHandle {
  injectStylesOnce();

  const container = el("aside", {
    [WISP_UI_DATA_ATTRIBUTE]: "bar",
    "aria-label": "wisp-design control panel",
    role: "complementary",
  });

  // Content wrapper — fades between mode switches
  const content = el("div", { [WISP_UI_DATA_ATTRIBUTE]: "bar-content" });
  container.appendChild(content);

  document.body.appendChild(container);

  // Persistent slot for the parameter-sliders subtree.
  const paramSlot = el("div", { [WISP_UI_DATA_ATTRIBUTE]: "param-slot" });

  let elapsedTimer: number | null = null;

  const stopElapsed = (): void => {
    if (elapsedTimer !== null) {
      window.clearInterval(elapsedTimer);
      elapsedTimer = null;
    }
  };

  // Mode-switch with a 60ms opacity dip for smooth transition
  const fadeSwitch = (render: () => void): void => {
    content.setAttribute("data-wisp-fading", "1");
    window.setTimeout(() => {
      render();
      content.removeAttribute("data-wisp-fading");
    }, 60);
  };

  // -------------------------------------------------------------------------
  // Brand header — shown in all modes.
  // -------------------------------------------------------------------------

  function makeBrand(): HTMLElement {
    const brand = el("div", { [WISP_UI_DATA_ATTRIBUTE]: "brand" });
    brand.textContent = "wisp-design";
    return brand;
  }

  // -------------------------------------------------------------------------
  // mode: idle — minimal pick pill.
  // -------------------------------------------------------------------------

  // Track the active tool-panel handle so a state-mode change cleanly tears
  // down any expanded panel. Re-created on every idle-render.
  let activeToolPanels: ToolPanelHandle | null = null;
  const closeActiveTools = (): void => {
    if (activeToolPanels !== null) {
      activeToolPanels.close();
      activeToolPanels = null;
    }
  };

  // Phase 7.14 — Track the active shimmer overlay (the animated dashed
  // border with diagonal sweep mounted OVER the picked element during
  // `generating` state). closeActiveShimmer is called from every render
  // that isn't `generating` so the overlay disappears as soon as variants
  // arrive (cycling) or the user cancels (idle/configuring).
  let activeShimmer: ShimmerHandle | null = null;
  const closeActiveShimmer = (): void => {
    if (activeShimmer !== null) {
      activeShimmer.unmount();
      activeShimmer = null;
    }
  };

  // Phase 7.16 — Track the variant-morph-slider so we can unmount it on
  // state change (idle/configure/picking/generating) or recreate it when
  // the active variant changes within cycling.
  let activeMorph: MorphSliderHandle | null = null;
  const closeActiveMorph = (): void => {
    if (activeMorph !== null) {
      activeMorph.unmount();
      activeMorph = null;
    }
  };
  // Cache the last configure-targets so renderGenerating (which has no
  // ctx.targets — only startedAt + count) can resolve the shimmer mount
  // points. Reset to [] when the bar exits the configure→generate cycle.
  let lastConfigureTargets: PickResult[] = [];

  // Phase 7.14 — single helper to mount the tool-icon row inside `container`.
  // Used by every non-picking/generating render so the 5 tool panels
  // (tokens / audit / recent / settings / about) are reachable mid-flow,
  // not only on the idle bar. Picking and generating intentionally skip
  // tool-icons to keep their focus tight (instruction text or spinner).
  const renderToolRow = (container: HTMLElement): void => {
    const handle = mountToolPanels({
      container,
      ...(opts.bridgeUrl !== undefined ? { bridgeUrl: opts.bridgeUrl } : {}),
      ...(opts.bridgeToken !== undefined ? { token: opts.bridgeToken } : {}),
      initialVariantCount: opts.initialVariantCount ?? DEFAULT_VARIANT_COUNT,
      ...(opts.onVariantCountChange !== undefined
        ? { onVariantCountChange: opts.onVariantCountChange }
        : {}),
    });
    activeToolPanels = handle;
  };

  const renderIdle = (): void => {
    stopElapsed();
    closeActiveTools();
    closeActiveShimmer();
    closeActiveMorph();
    lastConfigureTargets = [];
    clear(content);

    content.appendChild(makeBrand());

    const row = el("div", { [WISP_UI_DATA_ATTRIBUTE]: "row" });
    const pickBtn = btn("primary", "+ Pick", () => opts.onPickStart());
    pickBtn.setAttribute("aria-label", "Pick an element to design");
    row.appendChild(pickBtn);
    content.appendChild(row);

    // Compact tool buttons: tokens / audit / recent / settings / about —
    // each opens an expandable panel below the bar. Renders the same
    // tool-row helper used in configure + cycling so the 5 panels are
    // reachable across the design-loop flow, not only on the idle bar.
    renderToolRow(content);
  };

  // -------------------------------------------------------------------------
  // mode: picking — instruction + ESC hint.
  // -------------------------------------------------------------------------

  const renderPicking = (): void => {
    stopElapsed();
    closeActiveTools();
    closeActiveShimmer();
    closeActiveMorph();
    clear(content);

    content.appendChild(makeBrand());

    const instruction = el("div", { [WISP_UI_DATA_ATTRIBUTE]: "instruction" });
    instruction.textContent = "Click an element to pick it";
    content.appendChild(instruction);

    const hint = el("div", { [WISP_UI_DATA_ATTRIBUTE]: "hint" });
    hint.textContent = "ESC to cancel";
    content.appendChild(hint);
  };

  // -------------------------------------------------------------------------
  // mode: configuring — breadcrumb + textarea + variant-count + actions.
  // -------------------------------------------------------------------------

  const renderConfigure = (ctx: ConfigureCtx): void => {
    stopElapsed();
    closeActiveTools();
    closeActiveShimmer();
    closeActiveMorph();
    // Cache the targets so the next renderGenerating can find the elements
    // to shimmer over. ConfigureCtx is the last state that carries them.
    lastConfigureTargets = ctx.targets;
    clear(content);

    content.appendChild(makeBrand());

    // Target breadcrumb — single element shows tag+classes+size, multi
    // shows count + multi-select hint.
    const meta = el("div", { [WISP_UI_DATA_ATTRIBUTE]: "meta" });
    const targetCount = ctx.targets.length;
    if (targetCount === 0) {
      meta.textContent = "Pick an element on the page (⌘-click to add)";
    } else if (targetCount === 1) {
      const t = ctx.targets[0];
      const summary = formatTargetSummary(t);
      meta.textContent = summary;
      meta.setAttribute("title", t?.selector ?? "");
    } else {
      meta.textContent = `${targetCount} elements selected (⌘-click to add or remove)`;
    }

    const topRow = el("div", { [WISP_UI_DATA_ATTRIBUTE]: "row" });
    topRow.appendChild(meta);
    const pickBtn = btn("secondary", "+ Pick", () => opts.onPickStart());
    topRow.appendChild(pickBtn);
    content.appendChild(topRow);

    const textarea = el("textarea", {
      [WISP_UI_DATA_ATTRIBUTE]: "freetext",
      maxlength: String(FREE_TEXT_MAX_LEN),
      placeholder: "Describe what you'd like to change…",
      rows: "3",
    });
    const safeInitial = opts.sanitize.sanitizeFreeText(ctx.freeText);
    textarea.value = safeInitial;
    textarea.setAttribute("aria-label", "Design prompt");
    textarea.addEventListener("input", () => {
      const safe = opts.sanitize.sanitizeFreeText(textarea.value);
      if (safe !== textarea.value) textarea.value = safe;
      opts.onFreeTextChange(safe);
    });
    content.appendChild(textarea);

    // Phase 7.15 — Deviation slider. Lets the user dial how far variants
    // should drift from the original (1 = subtle refinement, 5 = radical
    // reimagining). Persists via localStorage so the choice survives
    // reload. The value is read at submit-time and threaded into the
    // generating event so the agent can scale variant aggressiveness.
    let currentDeviation = readDeviation(DEVIATION_DEFAULT);
    const deviationRow = el("div", { [WISP_UI_DATA_ATTRIBUTE]: "deviation-row" });
    const devLabel = el("span", { [WISP_UI_DATA_ATTRIBUTE]: "deviation-label" });
    devLabel.textContent = "Boldness";
    const devLo = el("span", { [WISP_UI_DATA_ATTRIBUTE]: "deviation-end" });
    devLo.textContent = "subtle";
    const devSlider = el("input", {
      [WISP_UI_DATA_ATTRIBUTE]: "deviation-slider",
      type: "range",
      min: String(DEVIATION_MIN),
      max: String(DEVIATION_MAX),
      step: "1",
      "aria-label": "How strongly variants should deviate from the original (1 subtle to 5 bold)",
    }) as HTMLInputElement;
    devSlider.value = String(currentDeviation);
    const devHi = el("span", { [WISP_UI_DATA_ATTRIBUTE]: "deviation-end" });
    devHi.textContent = "bold";
    const devValue = el("span", { [WISP_UI_DATA_ATTRIBUTE]: "deviation-value" });
    devValue.textContent = String(currentDeviation);
    devSlider.addEventListener("input", () => {
      const n = Math.max(DEVIATION_MIN, Math.min(DEVIATION_MAX, Number(devSlider.value) || DEVIATION_DEFAULT));
      currentDeviation = n;
      devValue.textContent = String(n);
      writeDeviation(n);
    });
    deviationRow.appendChild(devLabel);
    deviationRow.appendChild(devLo);
    deviationRow.appendChild(devSlider);
    deviationRow.appendChild(devHi);
    deviationRow.appendChild(devValue);
    content.appendChild(deviationRow);

    // variantSelect is built first so the quick-prompt chips below can read
    // it at click-time (the chips submit-with-text using the same count as
    // an explicit Generate click).
    const variantSelect = el("select", {
      [WISP_UI_DATA_ATTRIBUTE]: "variant-count",
      "aria-label": "Number of variants to generate",
    });
    for (const n of VARIANT_COUNT_CHOICES) {
      const opt = document.createElement("option");
      opt.value = String(n);
      opt.textContent = String(n);
      if (n === clamp(ctx.requestedVariantCount, MIN_VARIANT_COUNT, MAX_VARIANT_COUNT)) {
        opt.selected = true;
      }
      variantSelect.appendChild(opt);
    }

    // Quick-prompt chips — one-click common transforms. Each chip submits the
    // configure form immediately (fills the textarea then dispatches), so a
    // user can go pick → click chip → see 3 variants in <1s with no typing.
    const chipRow = el("div", { [WISP_UI_DATA_ATTRIBUTE]: "chip-row" });
    const submitWithText = (text: string): void => {
      textarea.value = text;
      opts.onFreeTextChange(text);
      const count = clamp(
        Number(variantSelect.value) || DEFAULT_VARIANT_COUNT,
        MIN_VARIANT_COUNT,
        MAX_VARIANT_COUNT,
      );
      opts.onFreeTextSubmit(text, count, currentDeviation);
    };
    // Context-aware chip set — adapts to what the picker actually captured.
    // Picking an h1 shouldn't suggest "rounder" (text isn't a corner-radius
    // game) and picking a button shouldn't lean into pure typography. Each
    // chip is `[label, title-tooltip]`.
    const QUICK_PROMPTS: ReadonlyArray<[string, string]> = chipsForTarget(
      ctx.targets[0],
    );
    for (const [label, title] of QUICK_PROMPTS) {
      const chip = el("button", { [WISP_UI_DATA_ATTRIBUTE]: "chip" });
      chip.setAttribute("type", "button");
      chip.setAttribute("title", title);
      chip.textContent = label;
      chip.addEventListener("click", () => submitWithText(label));
      chipRow.appendChild(chip);
    }
    content.appendChild(chipRow);

    const controls = el("div", { [WISP_UI_DATA_ATTRIBUTE]: "row-wrap" });

    const variantLabel = el("span", { [WISP_UI_DATA_ATTRIBUTE]: "meta" });
    variantLabel.textContent = "Variants:";
    controls.appendChild(variantLabel);
    controls.appendChild(variantSelect);

    const spacer = el("div", { [WISP_UI_DATA_ATTRIBUTE]: "spacer" });
    controls.appendChild(spacer);

    const cancel = btn("secondary", "Cancel", () => opts.onConfigureCancel());
    controls.appendChild(cancel);

    const generate = btn("primary", "Generate", () => {
      const text = opts.sanitize.sanitizeFreeText(textarea.value);
      if (text.length === 0) return;
      const count = clamp(
        Number(variantSelect.value) || DEFAULT_VARIANT_COUNT,
        MIN_VARIANT_COUNT,
        MAX_VARIANT_COUNT,
      );
      opts.onFreeTextSubmit(text, count, currentDeviation);
    });
    controls.appendChild(generate);

    content.appendChild(controls);

    // Phase 7.14 — expose the 5 tool-icons in configure too. Sits below the
    // primary actions so it never visually competes with Generate, but the
    // user can still open tokens/audit/recent/settings/about mid-prompt.
    renderToolRow(content);

    // Focus the textarea so users can type immediately
    window.setTimeout(() => textarea.focus(), 80);
  };

  // -------------------------------------------------------------------------
  // mode: generating — spinner + elapsed + cancel.
  // -------------------------------------------------------------------------

  const renderGenerating = (ctx: GeneratingCtx): void => {
    stopElapsed();
    closeActiveTools();
    closeActiveMorph();
    // Mount the generation-shimmer over the picked element(s). If we lost
    // the configure-targets (state-machine started from a non-configure
    // state, or this is a re-render), skip silently — the bar's own
    // spinner is the fallback waiting cue.
    closeActiveShimmer();
    if (lastConfigureTargets.length > 0) {
      activeShimmer = mountShimmer({
        targets: lastConfigureTargets.map((t) => ({
          selector: t.selector,
          rect: t.rect,
        })),
      });
    }
    clear(content);

    content.appendChild(makeBrand());

    const row = el("div", { [WISP_UI_DATA_ATTRIBUTE]: "row" });

    const spinner = el("span", { [WISP_UI_DATA_ATTRIBUTE]: "spinner", "aria-hidden": "true" });
    row.appendChild(spinner);

    const elapsed = el("span", { [WISP_UI_DATA_ATTRIBUTE]: "elapsed" });
    const updateElapsed = (): void => {
      const secs = Math.max(0, Math.floor((perfNow() - ctx.startedAt) / 100) / 10);
      elapsed.textContent = `Generating ${ctx.requestedVariantCount} variant${ctx.requestedVariantCount !== 1 ? "s" : ""}… ${secs.toFixed(1)}s`;
    };
    updateElapsed();
    row.appendChild(elapsed);

    const spacer = el("div", { [WISP_UI_DATA_ATTRIBUTE]: "spacer" });
    row.appendChild(spacer);

    const cancel = btn("secondary", "Cancel", () => opts.onGenerateCancel());
    row.appendChild(cancel);

    content.appendChild(row);

    elapsedTimer = window.setInterval(updateElapsed, 100);
  };

  // -------------------------------------------------------------------------
  // mode: cycling — variant CARDS + param slot + action row.
  // -------------------------------------------------------------------------

  const renderCycling = (ctx: CycleCtx): void => {
    stopElapsed();
    closeActiveTools();
    closeActiveShimmer();
    closeActiveMorph();
    clear(content);

    content.appendChild(makeBrand());

    // Variant card stack
    const cardStack = el("div", { [WISP_UI_DATA_ATTRIBUTE]: "card-stack" });
    for (let i = 0; i < ctx.variants.length; i += 1) {
      const v = ctx.variants[i];
      if (!v) continue;
      const isActive = i === ctx.activeIndex;

      const card = el("button", { [WISP_UI_DATA_ATTRIBUTE]: "child" });
      card.setAttribute("data-wisp-variant-card", String(i));
      card.setAttribute("type", "button");
      card.setAttribute("aria-pressed", isActive ? "true" : "false");
      card.setAttribute("aria-label", `Variant ${i + 1}${isActive ? " (active)" : ""}`);
      card.setAttribute("tabindex", "0");

      const cardTop = el("div", { [WISP_UI_DATA_ATTRIBUTE]: "card-top" });

      const num = el("span", { [WISP_UI_DATA_ATTRIBUTE]: "card-num" });
      num.textContent = String(i + 1).padStart(2, "0");
      cardTop.appendChild(num);

      if (isActive) {
        const badge = el("span", { [WISP_UI_DATA_ATTRIBUTE]: "card-badge" });
        badge.textContent = "active";
        cardTop.appendChild(badge);
      }

      // Phase 7.16 — a11y-radar badge per variant. Scored from the variant's
      // CSS text (contrast, font-size, motion, anti-slop signals). Tooltip
      // surfaces the top finding so the user knows WHY a score is low
      // without opening the audit panel.
      const radarScore = scoreVariant(v.css ?? "");
      const radarBadge = makeRadarBadge(radarScore);
      cardTop.appendChild(radarBadge);

      card.appendChild(cardTop);

      const rationale = el("div", { [WISP_UI_DATA_ATTRIBUTE]: "card-rationale" });
      rationale.textContent = opts.sanitize.sanitizeFreeText(v.rationale, { maxLen: 280 });
      card.appendChild(rationale);

      const idx = i;
      card.addEventListener("click", () => opts.onCycleSetActive(idx));
      cardStack.appendChild(card);
    }
    content.appendChild(cardStack);

    // Param slot — replaced by parameter-sliders.mount()
    clear(paramSlot);
    content.appendChild(paramSlot);

    // Action row
    const actions = el("div", { [WISP_UI_DATA_ATTRIBUTE]: "actions" });
    const active = ctx.variants[ctx.activeIndex];

    const discard = btn("secondary", "Discard", () => opts.onDiscard());
    actions.appendChild(discard);

    const annotate = btn("secondary", "Annotate", () => openAnnotationPopover(active?.id ?? ""));
    actions.appendChild(annotate);

    // Copy CSS — write the active variant's CSS body to the system clipboard
    // as a ready-to-paste rule. Useful for moving the design into another
    // codebase, sharing with teammates, or hand-tuning.
    const copyBtn = btn("secondary", "Copy CSS", () => {
      if (!active) return;
      // Emit the carbonized-style rule, mirroring the source-splice format:
      //   <picker-selector> { <decls> }
      // We don't have the picker selector here (the bar is target-agnostic),
      // so fall back to a generic descendant selector inside the active
      // variant's :scope. The text is descriptive enough for paste-and-tune.
      const cssBody = active.css.trim();
      const text =
        cssBody.includes(":scope") ? cssBody : `:scope { ${cssBody} }`;
      const note = `/* wisp-design variant ${active.id} — ${active.rationale} */\n${text}`;
      const writeToClipboard = (s: string): Promise<void> => {
        if (typeof navigator !== "undefined" && navigator.clipboard) {
          return navigator.clipboard.writeText(s);
        }
        return Promise.reject(new Error("clipboard unavailable"));
      };
      writeToClipboard(note)
        .then(() => {
          // Flash the button label to confirm without a separate toast.
          const original = copyBtn.textContent ?? "Copy CSS";
          copyBtn.textContent = "Copied";
          copyBtn.setAttribute("aria-live", "polite");
          window.setTimeout(() => {
            copyBtn.textContent = original;
            copyBtn.removeAttribute("aria-live");
          }, 1100);
        })
        .catch(() => {
          // Fallback: nothing visible — clipboard is browser-policy denied.
          copyBtn.textContent = "Blocked";
          window.setTimeout(() => {
            copyBtn.textContent = "Copy CSS";
          }, 1500);
        });
    });
    actions.appendChild(copyBtn);

    const spacer = el("div", { [WISP_UI_DATA_ATTRIBUTE]: "spacer" });
    actions.appendChild(spacer);

    const accept = btn("primary", "Accept", () => opts.onAccept());
    actions.appendChild(accept);

    content.appendChild(actions);

    // Phase 7.16 — variant-morph-slider. Interpolate cssVars between the
    // active variant and the next one in the stack. If only one variant
    // exists OR neither shares numeric vars, mountMorphSlider renders a
    // quiet empty-state hint instead of a non-functional slider.
    if (ctx.variants.length >= 2 && active) {
      const nextIdx = (ctx.activeIndex + 1) % ctx.variants.length;
      const partner = ctx.variants[nextIdx];
      if (partner) {
        activeMorph = mountMorphSlider({
          container: content,
          variantA: { id: active.id, cssVars: active.cssVars ?? {} },
          variantB: { id: partner.id, cssVars: partner.cssVars ?? {} },
          onMorph: (vars) => {
            for (const [name, value] of Object.entries(vars)) {
              opts.onParamChange(name, value);
            }
          },
        });
      }
    }

    // Keyboard hint
    const hint = el("div", { [WISP_UI_DATA_ATTRIBUTE]: "hint" });
    hint.textContent = "← → to cycle · 1–8 select · Enter accept · Del discard · ESC cancel";
    content.appendChild(hint);

    // Phase 7.14 — tool-icons in cycle state too. Lets the user open audit
    // (anti-slop + a11y) on the active variant or peek tokens/recent
    // without leaving the cycling flow.
    renderToolRow(content);

    // Focus first card
    const firstCard = cardStack.querySelector<HTMLElement>("[data-wisp-variant-card]");
    if (firstCard) window.setTimeout(() => firstCard.focus(), 80);
  };

  // -------------------------------------------------------------------------
  // annotation popover — inline mini-form anchored to the bar.
  // -------------------------------------------------------------------------

  const openAnnotationPopover = (targetId: string): void => {
    const existing = content.querySelector(`[${WISP_UI_DATA_ATTRIBUTE}="annotation-popover"]`);
    if (existing) existing.remove();

    const popover = el("div", { [WISP_UI_DATA_ATTRIBUTE]: "annotation-popover" });

    const row = el("div", { [WISP_UI_DATA_ATTRIBUTE]: "row" });

    const kindSelect = el("select", { "aria-label": "Annotation kind" });
    for (const k of ANNOTATION_KINDS) {
      const o = document.createElement("option");
      o.value = k;
      o.textContent = k;
      kindSelect.appendChild(o);
    }
    row.appendChild(kindSelect);

    const noteInput = el("textarea", {
      maxlength: String(ANNOTATION_NOTE_MAX_LEN),
      placeholder: "Annotation note…",
      rows: "2",
      "aria-label": "Annotation note",
    });
    noteInput.style.flex = "1";
    row.appendChild(noteInput);

    const submitBtn = btn("primary", "Add", () => {
      const note = opts.sanitize.sanitizeFreeText(noteInput.value, {
        maxLen: ANNOTATION_NOTE_MAX_LEN,
      });
      if (note.length === 0) return;
      const kind = kindSelect.value as AnnotationKind;
      if (!ANNOTATION_KINDS.includes(kind)) return;
      opts.onAnnotationAdd({ targetId, kind, note });
      popover.remove();
    });
    row.appendChild(submitBtn);

    popover.appendChild(row);
    content.appendChild(popover);
    noteInput.focus();
  };

  // -------------------------------------------------------------------------
  // Internal keyboard handler — only annotation ESC. Full routing via
  // attachKeyboard below.
  // -------------------------------------------------------------------------

  const handleKeyInternal = (e: KeyboardEvent): void => {
    if (e.key === "Escape") {
      const popover = content.querySelector(`[${WISP_UI_DATA_ATTRIBUTE}="annotation-popover"]`);
      if (popover) {
        popover.remove();
        return;
      }
    }
  };
  document.addEventListener("keydown", handleKeyInternal, true);

  // -------------------------------------------------------------------------
  // setMode — public entry.
  // -------------------------------------------------------------------------

  let currentMode: BrowserStateKind = "idle";

  const doRender = (mode: BrowserStateKind, ctx?: ConfigureCtx | GeneratingCtx | CycleCtx): void => {
    if (mode === "idle") {
      renderIdle();
    } else if (mode === "picking") {
      renderPicking();
    } else if (mode === "configuring") {
      renderConfigure(
        (ctx as ConfigureCtx) ?? { targets: [], freeText: "", requestedVariantCount: DEFAULT_VARIANT_COUNT },
      );
    } else if (mode === "generating") {
      renderGenerating(
        (ctx as GeneratingCtx) ?? { startedAt: perfNow(), requestedVariantCount: DEFAULT_VARIANT_COUNT },
      );
    } else if (mode === "cycling") {
      renderCycling((ctx as CycleCtx) ?? { variants: [], activeIndex: 0, bindings: [] });
    }
  };

  // Initial render
  renderIdle();

  return {
    el: container,
    setMode(mode, ctx) {
      if (mode === currentMode) {
        // Same mode — re-render without fade (e.g. active variant changed)
        doRender(mode, ctx);
        return;
      }
      currentMode = mode;
      fadeSwitch(() => doRender(mode, ctx));
    },
    teardown(): void {
      stopElapsed();
      closeActiveTools();
      closeActiveShimmer();
      closeActiveMorph();
      document.removeEventListener("keydown", handleKeyInternal, true);
      if (container.parentNode) container.parentNode.removeChild(container);
      const styles = document.querySelector(`style[${WISP_UI_DATA_ATTRIBUTE}="bar-styles"]`);
      if (styles) styles.remove();
    },
    attachKeyboard({ state, onAction }) {
      const handler = (e: KeyboardEvent): void => {
        // Never swallow events inside our own textarea / input
        const target = e.target as HTMLElement | null;
        const inText =
          target !== null &&
          (target.tagName === "TEXTAREA" || target.tagName === "INPUT");

        const s = state();

        if (e.key === "Escape") {
          // Don't check inText for ESC — standard UX lets ESC always dismiss
          const popover = content.querySelector(`[${WISP_UI_DATA_ATTRIBUTE}="annotation-popover"]`);
          if (popover) {
            popover.remove();
            e.preventDefault();
            return;
          }
          onAction("cancel");
          e.preventDefault();
          return;
        }

        if (inText) return; // let textarea / input handle everything else

        if (e.key === "Enter" && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
          if (s.kind === "configuring") {
            onAction("submit");
            e.preventDefault();
          } else if (s.kind === "cycling") {
            onAction("accept");
            e.preventDefault();
          }
          return;
        }

        if (s.kind === "cycling") {
          if (e.key === "ArrowLeft") {
            onAction("cycle-prev");
            e.preventDefault();
            return;
          }
          if (e.key === "ArrowRight") {
            onAction("cycle-next");
            e.preventDefault();
            return;
          }
          if (e.key === "Backspace" || e.key === "Delete") {
            onAction("discard");
            e.preventDefault();
            return;
          }
          const variantKeys: Record<string, KeyboardAction> = {
            "1": "select-variant-0",
            "2": "select-variant-1",
            "3": "select-variant-2",
            "4": "select-variant-3",
            "5": "select-variant-4",
            "6": "select-variant-5",
            "7": "select-variant-6",
            "8": "select-variant-7",
          };
          if (e.key in variantKeys) {
            onAction(variantKeys[e.key] as KeyboardAction);
            e.preventDefault();
          }
        }
      };

      window.addEventListener("keydown", handler, true);
      return () => window.removeEventListener("keydown", handler, true);
    },
  };
}

// Convenience accessor for the entry module — gives it the param-slot to
// hand to parameter-sliders.mount(...).
export function paramSlotOf(bar: FloatingBarHandle): HTMLElement | null {
  return bar.el.querySelector(`[${WISP_UI_DATA_ATTRIBUTE}="param-slot"]`);
}

// Map FloatingBarMode (configure | generating | cycling) → BrowserStateKind
// so the entry module can pass a state kind directly.
export function modeFor(kind: BrowserStateKind): FloatingBarMode {
  if (kind === "generating") return "generating";
  if (kind === "cycling") return "cycling";
  return "configure";
}

// ---------------------------------------------------------------------------
// internal utilities.
// ---------------------------------------------------------------------------

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, Math.floor(n)));
}

// Context-aware quick-prompt chip sets. Each entry is `[label, title-tooltip]`.
// Picking nothing or an unrecognized tag falls back to the generic set.
const CHIP_DEFAULT: ReadonlyArray<[string, string]> = [
  ["bolder", "Make text bolder"],
  ["softer", "Reduce visual weight"],
  ["spacious", "Add breathing room"],
  ["compact", "Tighten spacing"],
  ["accent", "Use the accent color"],
  ["high contrast", "Maximize legibility"],
];

const CHIP_TEXT: ReadonlyArray<[string, string]> = [
  ["bolder", "Increase font weight"],
  ["lighter", "Decrease font weight"],
  ["larger", "Bump font size"],
  ["smaller", "Reduce font size"],
  ["tighter", "Tighten letter-spacing"],
  ["accent", "Use the accent color"],
];

const CHIP_BUTTON: ReadonlyArray<[string, string]> = [
  ["bigger", "Larger padding + font"],
  ["smaller", "Reduce padding + font"],
  ["rounder", "More border-radius"],
  ["squarer", "Less border-radius"],
  ["ghost", "Outline-only style"],
  ["primary", "Solid filled emphasis"],
];

const CHIP_IMAGE: ReadonlyArray<[string, string]> = [
  ["larger", "Increase max-width"],
  ["smaller", "Reduce max-width"],
  ["rounded", "Soften corners"],
  ["circular", "Full circle mask"],
  ["contained", "Constrain aspect"],
  ["bordered", "Add a thin border"],
];

const CHIP_CONTAINER: ReadonlyArray<[string, string]> = [
  ["more space", "Increase padding"],
  ["less space", "Reduce padding"],
  ["bordered", "Add a border"],
  ["elevated", "Add a soft shadow"],
  ["compact", "Tighten layout"],
  ["high contrast", "Stronger background"],
];

const CHIP_INPUT: ReadonlyArray<[string, string]> = [
  ["bigger", "Larger touch target"],
  ["rounded", "Soften corners"],
  ["bordered", "Stronger border"],
  ["ghost", "Borderless underline only"],
  ["accent", "Accent focus ring"],
  ["compact", "Tighter padding"],
];

function chipsForTarget(t: PickResult | undefined): ReadonlyArray<[string, string]> {
  if (!t) return CHIP_DEFAULT;
  const tag = t.tag.toLowerCase();
  if (/^h[1-6]$/.test(tag) || tag === "p" || tag === "span" || tag === "label" || tag === "a") {
    return CHIP_TEXT;
  }
  if (tag === "button") return CHIP_BUTTON;
  if (tag === "img" || tag === "picture" || tag === "video" || tag === "svg") {
    return CHIP_IMAGE;
  }
  if (tag === "input" || tag === "textarea" || tag === "select") return CHIP_INPUT;
  if (
    tag === "div" ||
    tag === "section" ||
    tag === "article" ||
    tag === "aside" ||
    tag === "header" ||
    tag === "footer" ||
    tag === "nav" ||
    tag === "main" ||
    tag === "form"
  ) {
    return CHIP_CONTAINER;
  }
  return CHIP_DEFAULT;
}

function formatTargetSummary(t: PickResult | undefined): string {
  if (!t) return "1 element";
  // Compress the selector: tag.cls1.cls2 plus optional truncation when too
  // many classes. Picker.buildSelector already gives a class-aware chain
  // like `h3.text-base.font-medium`; we keep that and append size in px.
  const sel = t.selector;
  const tag = t.tag.toLowerCase();
  // Find first segment that starts with the tag, e.g. `h3.text-base.font-medium`.
  // Pick the LAST segment of the descendant chain — that's the leaf the
  // picker actually captured.
  const segs = sel.split(/\s*>\s*|\s+/).filter((s) => s.length > 0);
  const leaf = segs.length > 0 ? segs[segs.length - 1] : sel;
  const truncated =
    leaf && leaf.length > 36 ? `${leaf.slice(0, 33)}…` : (leaf ?? tag);
  const size = `${Math.round(t.rect.w)}×${Math.round(t.rect.h)}`;
  return `${truncated} · ${size}`;
}

function perfNow(): number {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}
