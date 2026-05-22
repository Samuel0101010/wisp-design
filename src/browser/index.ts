// wisp-design — Browser runtime entry (Phase 2).
//
// Single IIFE bundle (tsup `globalName: "WispDesign"`). Exposes
// `window.WispDesign.init({ bridgeUrl, token })` returning a
// `WispDesignHandle`. Wires:
//   state-machine ↔ floating-bar ↔ picker ↔ multi-select ↔ variant-render
//                                ↔ parameter-sliders ↔ annotations
//                                ↔ bridge-client (fetch + EventSource)
//
// PHASE-4 BOUNDARY: variants currently arrive from the bridge SSE stream as
// `BridgeEventOf<"cycling">`. Until the agent is wired (Phase 4) the bridge
// will not push any cycling events — so we fall back to a placeholder set
// 1.5s after GENERATING. Tagged with `PHASE-4` for the agent author to find.

import { DEFAULT_VARIANT_COUNT, LIVE_JS_VERSION_TAG } from "./constants.js";
import type {
  Annotation,
  BrowserState,
  InitOptions,
  PickResult,
  Variant,
  WispDesignHandle,
} from "../contracts/browser.js";
import { createBridgeClient } from "./bridge-client.js";
import type {
  BridgeEvent,
  ElementTarget,
  StructuredAnnotation,
  AnnotationKind as BridgeAnnotationKind,
} from "../contracts/bridge.js";

import { createStateMachine } from "./state-machine.js";
import {
  attachPicker,
  buildSelector,
  extractPickResult,
  pickable,
} from "./picker.js";
import {
  attachMultiSelect,
  createMultiSelect,
} from "./multi-select.js";
import {
  createFloatingBar,
  paramSlotOf,
  type CycleCtx,
  type ConfigureCtx,
  type GeneratingCtx,
  type FloatingBarHandle,
} from "./floating-bar.js";
import {
  extractParameterBindings,
  mountParameterSliders,
} from "./parameter-sliders.js";
import {
  renderVariantsMany,
  type ManyHandle,
} from "./variant-render.js";
import { sanitizeModule } from "./sanitize.js";

// ---------------------------------------------------------------------------
// Type conversions: browser PickResult / Annotation → bridge ElementTarget /
// StructuredAnnotation. Browser carries richer data; bridge has the
// minimum-viable shape.
// ---------------------------------------------------------------------------

function toElementTarget(p: PickResult): ElementTarget {
  return {
    selector: p.selector,
    rect: p.rect,
    tag: p.tag.toUpperCase(),
  };
}

function toBridgeAnnotationKind(k: Annotation["kind"]): BridgeAnnotationKind {
  // Bridge schema is the narrower enum — collapse browser-only kinds.
  if (k === "padding" || k === "color" || k === "size" || k === "content") {
    return k;
  }
  return "other";
}

function toBridgeAnnotation(a: Annotation): StructuredAnnotation {
  return {
    kind: toBridgeAnnotationKind(a.kind),
    note: a.note,
  };
}

// ---------------------------------------------------------------------------
// init — the only documented entry.
// ---------------------------------------------------------------------------

export async function init(opts: InitOptions): Promise<WispDesignHandle> {
  const sessionId = opts.sessionId ?? newSessionId();

  const bridge = createBridgeClient({
    bridgeUrl: opts.bridgeUrl,
    token: opts.token,
    sessionId,
    ...(opts.transport ? { transport: opts.transport } : {}),
  });

  // Best-effort readiness — never block init on a 401/404 here.
  bridge.ready().catch(() => undefined);

  const machine = createStateMachine();
  const multi = createMultiSelect();

  let detachPicker: (() => void) | null = null;
  let detachMultiSelect: (() => void) | null = null;
  let activeRender: ManyHandle | null = null;
  let detachSliders: (() => void) | null = null;
  let placeholderTimer: number | null = null;

  // -------------------------------------------------------------------------
  // bar — instantiated once, mode-driven by state-machine snapshots.
  // -------------------------------------------------------------------------

  const bar: FloatingBarHandle = createFloatingBar({
    sanitize: sanitizeModule,
    onFreeTextChange: (text) => {
      machine.send("configure-edit-text", { freeText: text });
    },
    onFreeTextSubmit: (text, count) => {
      machine.send("configure-edit-text", { freeText: text });
      machine.send("configure-submit", { requestedVariantCount: count });
    },
    onConfigureCancel: () => machine.send("configure-cancel"),
    onGenerateCancel: () => machine.send("generate-cancel"),
    onCycleNext: () => machine.send("cycle-next"),
    onCyclePrev: () => machine.send("cycle-prev"),
    onCycleSetActive: (index) => machine.send("cycle-set-active", { index }),
    onParamChange: (varName, value) => {
      machine.send("cycle-param-change", { varName, value });
    },
    onAccept: () => machine.send("cycle-accept"),
    onDiscard: () => machine.send("cycle-discard"),
    onAnnotationAdd: (a) => {
      const st = machine.current().state;
      if (st.kind !== "cycling" && st.kind !== "configuring") return;
      const target = (st.kind === "cycling" ? st.targets[0] : st.targets[0]);
      if (!target) return;
      const ev: BridgeEvent = {
        kind: "annotation",
        target: toElementTarget(target),
        annotation: toBridgeAnnotation(a),
        sessionId,
      };
      void bridge.postEvent(ev).catch(() => undefined);
    },
    onPickStart: () => machine.send("pick-start"),
  });

  // -------------------------------------------------------------------------
  // picker arming — only attached while PICKING.
  // -------------------------------------------------------------------------

  const armPicker = (): void => {
    if (detachPicker !== null) return;
    detachPicker = attachPicker({
      onHover: (sel) => machine.send("pick-hover", { hoverSelector: sel }),
      onPick: (result, withMulti) => {
        if (withMulti) {
          machine.send("pick-add", { target: result });
        } else {
          machine.send("pick-confirm", { target: result });
        }
      },
      onCancel: () => machine.send("pick-cancel"),
    });
  };
  const disarmPicker = (): void => {
    if (detachPicker !== null) {
      detachPicker();
      detachPicker = null;
    }
  };

  // -------------------------------------------------------------------------
  // multi-select — armed while CONFIGURING.
  // -------------------------------------------------------------------------

  const armMultiSelect = (): void => {
    if (detachMultiSelect !== null) return;
    detachMultiSelect = attachMultiSelect({
      isModifierPressed: () => true, // listener already gates on modifier
      buildPickResult: (el) => extractPickResult(el),
      onAdd: (result) => {
        multi.add(result);
        machine.send("pick-add", { target: result });
      },
      onRemove: (id) => multi.remove(id),
      onClear: () => multi.clear(),
    });
  };
  const disarmMultiSelect = (): void => {
    if (detachMultiSelect !== null) {
      detachMultiSelect();
      detachMultiSelect = null;
    }
  };

  // -------------------------------------------------------------------------
  // render lifecycle.
  // -------------------------------------------------------------------------

  const tearDownRender = (): void => {
    if (detachSliders !== null) {
      detachSliders();
      detachSliders = null;
    }
    if (activeRender !== null) {
      activeRender.teardown();
      activeRender = null;
    }
  };

  const mountRender = (state: Extract<BrowserState, { kind: "cycling" }>): void => {
    tearDownRender();
    try {
      activeRender = renderVariantsMany({
        targets: state.targets,
        variants: state.variants,
        sessionId,
        sanitize: sanitizeModule,
      });
      activeRender.setActive(state.activeIndex);
    } catch (err) {
      if (typeof console !== "undefined") {
        console.warn("[wisp-design] render failed", err);
      }
      return;
    }

    // Mount the sliders for the active variant.
    const variant = state.variants[state.activeIndex];
    const slot = paramSlotOf(bar);
    if (variant && slot) {
      const bindings = extractParameterBindings(variant.css);
      const root = activeRender.getActiveScopeRoot();
      detachSliders = mountParameterSliders({
        container: slot,
        bindings,
        initialValues: variant.cssVars,
        sanitize: sanitizeModule,
        scopeRoot: root,
        onChange: (varName, value) => {
          machine.send("cycle-param-change", { varName, value });
        },
      });
    }
  };

  // -------------------------------------------------------------------------
  // state subscription — single source of truth for what's mounted.
  // -------------------------------------------------------------------------

  const unsubscribe = machine.subscribe((snap) => {
    const st = snap.state;
    switch (st.kind) {
      case "idle":
        disarmPicker();
        disarmMultiSelect();
        tearDownRender();
        multi.clear();
        clearPlaceholderTimer();
        bar.setMode("idle", { targets: [], freeText: "", requestedVariantCount: DEFAULT_VARIANT_COUNT });
        break;
      case "picking":
        disarmMultiSelect();
        tearDownRender();
        armPicker();
        bar.setMode("picking", { targets: [], freeText: "", requestedVariantCount: DEFAULT_VARIANT_COUNT });
        break;
      case "configuring": {
        disarmPicker();
        armMultiSelect();
        tearDownRender();
        const cfg: ConfigureCtx = {
          targets: st.targets,
          freeText: st.freeText,
          requestedVariantCount: DEFAULT_VARIANT_COUNT,
        };
        bar.setMode("configuring", cfg);
        break;
      }
      case "generating": {
        disarmPicker();
        disarmMultiSelect();
        const gen: GeneratingCtx = {
          startedAt: st.startedAt,
          requestedVariantCount: st.requestedVariantCount,
        };
        bar.setMode("generating", gen);
        // Push the bridge event so the agent (Phase 4) can start working.
        const target = st.targets[0];
        if (target) {
          const ev: BridgeEvent = {
            kind: "generating",
            target: toElementTarget(target),
            freeText: st.freeText,
            variantCount: st.requestedVariantCount,
            sessionId,
          };
          void bridge.postEvent(ev).catch(() => undefined);
        }
        schedulePlaceholderVariants(st.requestedVariantCount);
        break;
      }
      case "cycling": {
        disarmPicker();
        disarmMultiSelect();
        clearPlaceholderTimer();
        mountRender(st);
        const ctx: CycleCtx = {
          variants: st.variants,
          activeIndex: st.activeIndex,
          bindings: [], // floating-bar doesn't use this — sliders are mounted directly
        };
        bar.setMode("cycling", ctx);
        // Push cycling event so the agent / session log sees the active index.
        const target = st.targets[0];
        if (target) {
          const ev: BridgeEvent = {
            kind: "cycling",
            target: toElementTarget(target),
            variants: st.variants.map((v) => ({
              id: v.id,
              css: v.css,
              rationale: v.rationale,
            })),
            activeIndex: st.activeIndex,
            sessionId,
          };
          void bridge.postEvent(ev).catch(() => undefined);
        }
        break;
      }
      default:
        break;
    }
  });

  // PHASE-4: placeholder variants until agent is wired.
  const schedulePlaceholderVariants = (count: number): void => {
    clearPlaceholderTimer();
    placeholderTimer = window.setTimeout(() => {
      const fallback: Variant[] = Array.from({ length: Math.max(1, count) }).map(
        (_, i) => ({
          id: `placeholder-${i}`,
          css: `:scope { /* @param: kind=range min=0 max=24 step=2 label="padding" */ --wisp-pad: ${4 * (i + 1)}px; }`,
          cssVars: { "--wisp-pad": `${4 * (i + 1)}px` },
          rationale: `Placeholder variant ${i + 1} — Phase 4 will replace this with agent output.`,
        }),
      );
      machine.send("generate-variants-arrived", { variants: fallback });
    }, 1500);
  };
  const clearPlaceholderTimer = (): void => {
    if (placeholderTimer !== null) {
      window.clearTimeout(placeholderTimer);
      placeholderTimer = null;
    }
  };

  // -------------------------------------------------------------------------
  // bridge SSE — agent → browser. PHASE-4 wires the real handler; for now we
  // just listen and forward `cycling` frames into the state machine.
  // -------------------------------------------------------------------------

  const detachBridge = bridge.subscribe((ev) => {
    if (ev.kind === "cycling") {
      clearPlaceholderTimer();
      const variants: Variant[] = ev.variants.map((v) => ({
        id: v.id,
        css: v.css,
        cssVars: {},
        rationale: v.rationale,
      }));
      machine.send("generate-variants-arrived", { variants });
    } else if (ev.kind === "error") {
      machine.send("generate-error");
    }
  });

  // Render the initial (idle) bar.
  bar.setMode("idle");

  // -------------------------------------------------------------------------
  // handle.
  // -------------------------------------------------------------------------

  return {
    state(): BrowserState {
      return machine.current().state;
    },
    pick(): void {
      machine.send("pick-start");
    },
    cancel(): void {
      const k = machine.current().state.kind;
      if (k === "picking") machine.send("pick-cancel");
      else if (k === "configuring") machine.send("configure-cancel");
      else if (k === "generating") machine.send("generate-cancel");
      else if (k === "cycling") machine.send("cycle-discard");
    },
    teardown(): void {
      clearPlaceholderTimer();
      unsubscribe();
      detachBridge();
      disarmPicker();
      disarmMultiSelect();
      tearDownRender();
      multi.clear();
      bar.teardown();
      bridge.close();
    },
  };
}

function newSessionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `session-${Date.now()}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}

// Suppress unused-import warnings for symbols re-exported for tests.
void buildSelector;
void pickable;

// ---------------------------------------------------------------------------
// Default export shape — tsup `globalName: "WispDesign"` binds this to the
// global. `window.WispDesign.init(...)` / `window.WispDesign.version`.
// ---------------------------------------------------------------------------

const WispDesign = {
  init,
  version: LIVE_JS_VERSION_TAG,
};

export default WispDesign;
export { LIVE_JS_VERSION_TAG };
