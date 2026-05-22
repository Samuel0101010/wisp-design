// wisp-design — Floating bar (Phase 2).
//
// Single DOM bar pinned bottom-center. Three modes:
//   - configure  textarea + variant-count selector + (Cancel | Generate)
//   - generating spinner + elapsed + Cancel
//   - cycling    variant tabs (1/2/…/n) + rationale + param-sliders + actions
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
  BrowserStateKind,
  FloatingBarMode,
  ParameterBinding,
  PickResult,
  SanitizeModule,
  Variant,
} from "../contracts/browser.js";

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
// styles — single block, scoped via the ui attribute so we don't leak to host.
// ---------------------------------------------------------------------------

const W = WISP_UI_DATA_ATTRIBUTE;
const BAR_STYLES =
  `[${W}="bar"]{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:2147483646;font:13px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;color:#f4f4f5;background:#18181b;border:1px solid #3f3f46;border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,.35);padding:10px 12px;max-width:min(640px,calc(100vw - 24px));min-width:320px;box-sizing:border-box}` +
  `[${W}] *{box-sizing:border-box}` +
  `[${W}] textarea,[${W}] input,[${W}] select,[${W}] button{font:inherit;color:inherit}` +
  `[${W}] textarea{width:100%;background:#27272a;border:1px solid #3f3f46;border-radius:6px;padding:8px;resize:vertical;min-height:56px;max-height:200px}` +
  `[${W}] button{background:#3f3f46;border:1px solid #52525b;border-radius:6px;padding:6px 10px;cursor:pointer}` +
  `[${W}] button[data-wisp-primary="1"]{background:#6366f1;border-color:#6366f1;color:#fff}` +
  `[${W}] button[disabled]{opacity:.5;cursor:not-allowed}` +
  `[${W}] select{background:#27272a;border:1px solid #3f3f46;border-radius:6px;padding:4px 6px}` +
  `[${W}="row"]{display:flex;gap:8px;align-items:center}` +
  `[${W}="row-wrap"]{display:flex;gap:8px;align-items:center;flex-wrap:wrap}` +
  `[${W}="meta"]{font-size:11px;color:#a1a1aa}` +
  `[${W}="rationale"]{font-size:12px;color:#d4d4d8;margin:6px 0}` +
  `[${W}="param-row"]{display:grid;grid-template-columns:90px 1fr 56px;gap:6px;align-items:center;margin:4px 0}` +
  `[${W}="spinner"]{width:12px;height:12px;border-radius:50%;border:2px solid #6366f1;border-top-color:transparent;animation:wisp-spin .7s linear infinite;display:inline-block}` +
  `@keyframes wisp-spin{to{transform:rotate(360deg)}}` +
  `[${SELECTED_ATTR}]{outline:2px dotted #6366f1!important;outline-offset:2px}`;

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

function clear(node: Element): void {
  while (node.firstChild) node.removeChild(node.firstChild);
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
  onFreeTextSubmit: (text: string, variantCount: number) => void;
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
}

export interface FloatingBarHandle {
  setMode(mode: BrowserStateKind, ctx?: ConfigureCtx | GeneratingCtx | CycleCtx): void;
  teardown(): void;
  el: HTMLElement;
}

export function createFloatingBar(opts: FloatingBarOptions): FloatingBarHandle {
  injectStylesOnce();

  const container = el("div", { [WISP_UI_DATA_ATTRIBUTE]: "bar", role: "dialog" });
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

  // -------------------------------------------------------------------------
  // mode renderers.
  // -------------------------------------------------------------------------

  const renderConfigure = (ctx: ConfigureCtx): void => {
    stopElapsed();
    clear(container);

    const header = el("div", { [WISP_UI_DATA_ATTRIBUTE]: "row" });
    const meta = el("div", { [WISP_UI_DATA_ATTRIBUTE]: "meta" });
    const targetCount = ctx.targets.length;
    meta.textContent =
      targetCount === 0
        ? "Pick an element on the page (⌘-click to add)"
        : targetCount === 1
          ? `1 element selected — ${ctx.targets[0]?.tag ?? ""}`
          : `${targetCount} elements selected (⌘-click to add or remove)`;
    header.appendChild(meta);

    const pickBtn = el("button");
    pickBtn.textContent = "+ Pick";
    pickBtn.setAttribute("type", "button");
    pickBtn.addEventListener("click", () => opts.onPickStart());
    header.appendChild(pickBtn);
    container.appendChild(header);

    const textarea = el("textarea", {
      [WISP_UI_DATA_ATTRIBUTE]: "freetext",
      maxlength: String(FREE_TEXT_MAX_LEN),
      placeholder: "Describe what you'd like to change…",
    });
    const safeInitial = opts.sanitize.sanitizeFreeText(ctx.freeText);
    textarea.value = safeInitial;
    textarea.addEventListener("input", () => {
      const safe = opts.sanitize.sanitizeFreeText(textarea.value);
      if (safe !== textarea.value) textarea.value = safe;
      opts.onFreeTextChange(safe);
    });
    container.appendChild(textarea);

    const controls = el("div", { [WISP_UI_DATA_ATTRIBUTE]: "row-wrap" });

    const variantLabel = el("span", { [WISP_UI_DATA_ATTRIBUTE]: "meta" });
    variantLabel.textContent = "Variants:";
    controls.appendChild(variantLabel);

    const variantSelect = el("select", { [WISP_UI_DATA_ATTRIBUTE]: "variant-count" });
    for (const n of VARIANT_COUNT_CHOICES) {
      const opt = document.createElement("option");
      opt.value = String(n);
      opt.textContent = String(n);
      if (n === clamp(ctx.requestedVariantCount, MIN_VARIANT_COUNT, MAX_VARIANT_COUNT)) {
        opt.selected = true;
      }
      variantSelect.appendChild(opt);
    }
    controls.appendChild(variantSelect);

    const spacer = el("div");
    spacer.style.flex = "1";
    controls.appendChild(spacer);

    const cancel = el("button");
    cancel.textContent = "Cancel";
    cancel.setAttribute("type", "button");
    cancel.addEventListener("click", () => opts.onConfigureCancel());
    controls.appendChild(cancel);

    const generate = el("button", { "data-wisp-primary": "1" });
    generate.textContent = "Generate";
    generate.setAttribute("type", "button");
    generate.addEventListener("click", () => {
      const text = opts.sanitize.sanitizeFreeText(textarea.value);
      if (text.length === 0) return;
      const count = clamp(Number(variantSelect.value) || DEFAULT_VARIANT_COUNT, MIN_VARIANT_COUNT, MAX_VARIANT_COUNT);
      opts.onFreeTextSubmit(text, count);
    });
    controls.appendChild(generate);

    container.appendChild(controls);
  };

  const renderGenerating = (ctx: GeneratingCtx): void => {
    stopElapsed();
    clear(container);

    const row = el("div", { [WISP_UI_DATA_ATTRIBUTE]: "row" });

    const spinner = el("span", { [WISP_UI_DATA_ATTRIBUTE]: "spinner" });
    row.appendChild(spinner);

    const status = el("span");
    const updateStatus = (): void => {
      const elapsed = Math.max(0, Math.floor((perfNow() - ctx.startedAt) / 100) / 10);
      status.textContent = `Generating ${ctx.requestedVariantCount} variants… ${elapsed.toFixed(1)}s`;
    };
    updateStatus();
    row.appendChild(status);

    const spacer = el("div");
    spacer.style.flex = "1";
    row.appendChild(spacer);

    const cancel = el("button");
    cancel.textContent = "Cancel";
    cancel.setAttribute("type", "button");
    cancel.addEventListener("click", () => opts.onGenerateCancel());
    row.appendChild(cancel);

    container.appendChild(row);

    elapsedTimer = window.setInterval(updateStatus, 100);
  };

  const renderCycling = (ctx: CycleCtx): void => {
    stopElapsed();
    clear(container);

    const tabRow = el("div", { [WISP_UI_DATA_ATTRIBUTE]: "row-wrap" });
    for (let i = 0; i < ctx.variants.length; i += 1) {
      const tab = el("button", {
        "data-wisp-primary": i === ctx.activeIndex ? "1" : "0",
      });
      tab.textContent = `Variant ${i + 1}`;
      tab.setAttribute("type", "button");
      // Local copy so the listener captures the correct index.
      const idx = i;
      tab.addEventListener("click", () => opts.onCycleSetActive(idx));
      tabRow.appendChild(tab);
    }

    const prev = el("button");
    prev.textContent = "◀";
    prev.setAttribute("type", "button");
    prev.addEventListener("click", () => opts.onCyclePrev());
    tabRow.appendChild(prev);

    const next = el("button");
    next.textContent = "▶";
    next.setAttribute("type", "button");
    next.addEventListener("click", () => opts.onCycleNext());
    tabRow.appendChild(next);

    container.appendChild(tabRow);

    const rationale = el("div", { [WISP_UI_DATA_ATTRIBUTE]: "rationale" });
    const active = ctx.variants[ctx.activeIndex];
    if (active) {
      // textContent — not innerHTML.
      rationale.textContent = opts.sanitize.sanitizeFreeText(active.rationale, { maxLen: 280 });
    }
    container.appendChild(rationale);

    // Param slot is replaced by parameter-sliders.mount(); we provide it.
    clear(paramSlot);
    container.appendChild(paramSlot);

    // Action row.
    const actions = el("div", { [WISP_UI_DATA_ATTRIBUTE]: "row" });

    const discard = el("button");
    discard.textContent = "Discard";
    discard.setAttribute("type", "button");
    discard.addEventListener("click", () => opts.onDiscard());
    actions.appendChild(discard);

    const annotate = el("button");
    annotate.textContent = "Annotate";
    annotate.setAttribute("type", "button");
    annotate.addEventListener("click", () => openAnnotationPopover(active?.id ?? ""));
    actions.appendChild(annotate);

    const spacer = el("div");
    spacer.style.flex = "1";
    actions.appendChild(spacer);

    const accept = el("button", { "data-wisp-primary": "1" });
    accept.textContent = "Accept";
    accept.setAttribute("type", "button");
    accept.addEventListener("click", () => opts.onAccept());
    actions.appendChild(accept);

    container.appendChild(actions);
  };

  // -------------------------------------------------------------------------
  // annotation popover — inline mini-form anchored to the bar.
  // -------------------------------------------------------------------------

  const openAnnotationPopover = (targetId: string): void => {
    const existing = container.querySelector(
      `[${WISP_UI_DATA_ATTRIBUTE}="annotation-popover"]`,
    );
    if (existing) existing.remove();

    const popover = el("div", { [WISP_UI_DATA_ATTRIBUTE]: "annotation-popover" });
    popover.style.borderTop = "1px solid #3f3f46";
    popover.style.marginTop = "8px";
    popover.style.paddingTop = "8px";

    const row = el("div", { [WISP_UI_DATA_ATTRIBUTE]: "row" });

    const kindSelect = el("select");
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
    });
    noteInput.style.flex = "1";
    noteInput.style.minHeight = "32px";
    row.appendChild(noteInput);

    const submit = el("button", { "data-wisp-primary": "1" });
    submit.textContent = "Add";
    submit.setAttribute("type", "button");
    submit.addEventListener("click", () => {
      const note = opts.sanitize.sanitizeFreeText(noteInput.value, {
        maxLen: ANNOTATION_NOTE_MAX_LEN,
      });
      if (note.length === 0) return;
      const kind = kindSelect.value as AnnotationKind;
      if (!ANNOTATION_KINDS.includes(kind)) return;
      opts.onAnnotationAdd({ targetId, kind, note });
      popover.remove();
    });
    row.appendChild(submit);

    popover.appendChild(row);
    container.appendChild(popover);
    noteInput.focus();
  };

  // -------------------------------------------------------------------------
  // keyboard shortcuts.
  // -------------------------------------------------------------------------

  const handleKey = (e: KeyboardEvent): void => {
    if (e.key === "Escape") {
      const popover = container.querySelector(
        `[${WISP_UI_DATA_ATTRIBUTE}="annotation-popover"]`,
      );
      if (popover) {
        popover.remove();
        return;
      }
    }
    if ((e.metaKey || e.ctrlKey) && /^[1-9]$/.test(e.key)) {
      const n = Number(e.key) - 1;
      opts.onCycleSetActive(n);
    }
  };
  document.addEventListener("keydown", handleKey, true);

  return {
    el: container,
    setMode(mode, ctx) {
      if (mode === "idle" || mode === "picking") {
        renderConfigure(
          (ctx as ConfigureCtx) ?? { targets: [], freeText: "", requestedVariantCount: DEFAULT_VARIANT_COUNT },
        );
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
    },
    teardown(): void {
      stopElapsed();
      document.removeEventListener("keydown", handleKey, true);
      if (container.parentNode) container.parentNode.removeChild(container);
      const styles = document.querySelector(
        `style[${WISP_UI_DATA_ATTRIBUTE}="bar-styles"]`,
      );
      if (styles) styles.remove();
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

function perfNow(): number {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}
