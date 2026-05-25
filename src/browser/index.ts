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
import { readVariantCount } from "./persisted-settings.js";
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
  type KeyboardAction,
} from "./floating-bar.js";
import {
  extractParameterBindings,
  mountParameterSliders,
} from "./parameter-sliders.js";
import {
  renderVariantsMany,
  type ManyHandle,
} from "./variant-render.js";
import {
  mountGeneratingOverlay,
  type GeneratingOverlayHandle,
} from "./generating-overlay.js";
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
  let generatingOverlay: GeneratingOverlayHandle | null = null;
  let generatingOverlayMountedAt = 0;
  let pendingOverlayUnmount: number | null = null;
  // Minimum visible time so the animation actually registers — without
  // this, an agent that responds in <100ms leaves the overlay invisible.
  const MIN_OVERLAY_MS = 600;

  const unmountGeneratingOverlay = (): void => {
    if (generatingOverlay === null) return;
    const elapsed = Date.now() - generatingOverlayMountedAt;
    if (elapsed < MIN_OVERLAY_MS) {
      // Defer the unmount so the animation has a visible "beat".
      if (pendingOverlayUnmount !== null) {
        window.clearTimeout(pendingOverlayUnmount);
      }
      const remaining = MIN_OVERLAY_MS - elapsed;
      const captureHandle = generatingOverlay;
      pendingOverlayUnmount = window.setTimeout(() => {
        captureHandle.unmount();
        if (generatingOverlay === captureHandle) generatingOverlay = null;
        pendingOverlayUnmount = null;
      }, remaining);
      generatingOverlay = null;
      return;
    }
    generatingOverlay.unmount();
    generatingOverlay = null;
    if (pendingOverlayUnmount !== null) {
      window.clearTimeout(pendingOverlayUnmount);
      pendingOverlayUnmount = null;
    }
  };

  // -------------------------------------------------------------------------
  // bar — instantiated once, mode-driven by state-machine snapshots.
  // -------------------------------------------------------------------------

  // Extracted accept/discard helpers so keyboard wiring and button callbacks
  // share the same code path (DRY — avoids divergence if the postEvent shape
  // changes). Declared before createFloatingBar so the closure captures them.
  const dispatchAccept = (): void => {
    const st = machine.current().state;
    if (st.kind === "cycling") {
      const target = st.targets[0];
      const active = st.variants[st.activeIndex];
      if (target && active) {
        // Phase 7.8 — include the variant CSS and rationale in the accept
        // event. Without this the in-process accept handler had to regen
        // variants from the local stub catalog, which (a) is wrong if Claude
        // generated them and (b) is broken if non-deterministic. The browser
        // already has the variants in memory at accept-time, so just include.
        const ev: BridgeEvent = {
          kind: "accept",
          target: toElementTarget(target),
          variantId: active.id,
          sessionId,
          variantCss: active.css,
          rationale: active.rationale,
        };
        void bridge.postEvent(ev).catch(() => undefined);
      }
      machine.send("cycle-accept");
    }
  };

  const dispatchDiscard = (): void => {
    const st = machine.current().state;
    if (st.kind === "cycling") {
      const target = st.targets[0];
      if (target) {
        const ev: BridgeEvent = {
          kind: "discard",
          target: toElementTarget(target),
          sessionId,
        };
        void bridge.postEvent(ev).catch(() => undefined);
      }
      machine.send("cycle-discard");
    }
  };

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
    onAccept: () => {
      // POST the bridge accept event BEFORE flipping state to idle, so the
      // active variant + selector are still in scope. The agent (Phase 4
      // live process) runs verify-gate + carbonizes the active variant into
      // the source file via src/source/accept.ts. Bug #26 — without this
      // post, clicking Accept just cleared state without persisting anything.
      dispatchAccept();
    },
    onDiscard: () => {
      // Same fix as onAccept — the agent needs to know the user discarded
      // so it can clean up any pending wrap markers in the source file.
      dispatchDiscard();
    },
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
    bridgeUrl: opts.bridgeUrl,
    bridgeToken: opts.token,
    initialVariantCount: readVariantCount(DEFAULT_VARIANT_COUNT),
    onVariantCountChange: (_count) => {
      // Phase 7.13 — Settings-panel writes the new count to localStorage in
      // tool-panels.ts:select.onChange BEFORE invoking this callback. Each
      // subsequent state-machine transition (idle/picking/configuring) reads
      // `readVariantCount()` when building its setMode ctx, so the new
      // default takes effect on the very next pick — no reload required.
    },
  });

  // -------------------------------------------------------------------------
  // keyboard wiring — delegated to bar.attachKeyboard when Agent A ships it.
  // The guard lets this file compile today while the method is absent, and
  // activates automatically once FloatingBarHandle gains attachKeyboard.
  // -------------------------------------------------------------------------

  // Wire keyboard shortcuts. `attachKeyboard` is typed in FloatingBarHandle;
  // it was added by Agent A. The closure captures dispatchAccept/dispatchDiscard
  // so keyboard and button clicks share the same code path.
  const detachKeyboard: (() => void) = bar.attachKeyboard({
    state: () => machine.current().state,
    onAction: (action: KeyboardAction) => {
      switch (action) {
        case "cancel": {
          const st = machine.current().state;
          if (st.kind === "picking") machine.send("pick-cancel");
          else if (st.kind === "configuring") machine.send("configure-cancel");
          else if (st.kind === "generating") machine.send("generate-cancel");
          else if (st.kind === "cycling") machine.send("cycle-discard");
          break;
        }
        case "submit": {
          const st = machine.current().state;
          if (st.kind === "configuring") {
            machine.send("configure-submit", { requestedVariantCount: 3 });
          }
          break;
        }
        case "accept":
          dispatchAccept();
          break;
        case "discard":
          dispatchDiscard();
          break;
        case "cycle-next":
          machine.send("cycle-next");
          break;
        case "cycle-prev":
          machine.send("cycle-prev");
          break;
        default: {
          const m = /^select-variant-(\d)$/.exec(action);
          if (m !== null) {
            const idx = Number(m[1]);
            machine.send("cycle-set-active", { index: idx });
          }
        }
      }
    },
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
        console.error("[wisp-design] mountRender failed:", err);
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

  // Track the last rendered configuring fingerprint so we can SKIP setMode
  // when only the freeText changed. Without this, every keystroke would
  // re-render the bar → destroy the textarea → lose focus → next key lands
  // nowhere. Bug found Phase 7.6 — typed "test text" but only "t" registered.
  let lastConfiguringFingerprint = "";
  const configuringFingerprint = (targets: ReadonlyArray<PickResult>): string =>
    `${targets.length}:${targets.map((t) => t.id).join(",")}`;

  const unsubscribe = machine.subscribe((snap) => {
    const st = snap.state;
    switch (st.kind) {
      case "idle":
        disarmPicker();
        disarmMultiSelect();
        tearDownRender();
        unmountGeneratingOverlay();
        multi.clear();
        clearPlaceholderTimer();
        lastConfiguringFingerprint = "";
        bar.setMode("idle", { targets: [], freeText: "", requestedVariantCount: readVariantCount(DEFAULT_VARIANT_COUNT) });
        break;
      case "picking":
        disarmMultiSelect();
        tearDownRender();
        unmountGeneratingOverlay();
        armPicker();
        lastConfiguringFingerprint = "";
        bar.setMode("picking", { targets: [], freeText: "", requestedVariantCount: readVariantCount(DEFAULT_VARIANT_COUNT) });
        break;
      case "configuring": {
        disarmPicker();
        armMultiSelect();
        tearDownRender();
        unmountGeneratingOverlay();
        const cfg: ConfigureCtx = {
          targets: st.targets,
          freeText: st.freeText,
          requestedVariantCount: readVariantCount(DEFAULT_VARIANT_COUNT),
        };
        // Skip re-render if the only change is freeText — the textarea
        // already holds the new value and re-rendering destroys focus.
        const fp = configuringFingerprint(st.targets);
        const wasInConfiguring = lastConfiguringFingerprint !== "";
        if (wasInConfiguring && fp === lastConfiguringFingerprint) {
          // Same targets, same mode → no-op (textarea state already current).
          break;
        }
        lastConfiguringFingerprint = fp;
        bar.setMode("configuring", cfg);
        break;
      }
      case "generating": {
        disarmPicker();
        disarmMultiSelect();
        lastConfiguringFingerprint = "";
        const gen: GeneratingCtx = {
          startedAt: st.startedAt,
          requestedVariantCount: st.requestedVariantCount,
        };
        bar.setMode("generating", gen);
        // Mount the animated generating-overlay above each picked target.
        // Unmounts (with min-display debounce) when transitioning out.
        // Cancel any pending unmount from a previous round.
        if (pendingOverlayUnmount !== null) {
          window.clearTimeout(pendingOverlayUnmount);
          pendingOverlayUnmount = null;
        }
        if (generatingOverlay !== null) generatingOverlay.unmount();
        generatingOverlay = mountGeneratingOverlay({
          selectors: st.targets.map((t) => t.selector),
          variantCount: st.requestedVariantCount,
        });
        generatingOverlayMountedAt = Date.now();
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
        unmountGeneratingOverlay();
        lastConfiguringFingerprint = "";
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

  // Defensive fallback when the bridge doesn't deliver a `cycling` event
  // within `PLACEHOLDER_TIMEOUT_MS`. The most common cause is the agent's
  // live process not running (the user closed `wisp-design live`, lost the
  // network connection to the bridge, or never started it). Surfacing this
  // honestly in the rationale text helps integrators diagnose. CSS still
  // includes the `--wisp-pad` slider so the parameter-binding flow stays
  // demoable even when offline.
  //
  // Phase 7.10 — bumped from 30s → 300s (5 min). In external-agent mode the
  // active Claude session might be cron-driven (poll every 2 min) → up to
  // ~3 min latency from generate-click to first variant. 30s placeholder
  // raced this and the user saw "offline fallback" before real Opus variants
  // arrived. 5 min is long enough to cover cron latency + LLM design time.
  // The generating-overlay animation continues to indicate "designer working".
  const PLACEHOLDER_TIMEOUT_MS = 300_000;
  const schedulePlaceholderVariants = (count: number): void => {
    clearPlaceholderTimer();
    placeholderTimer = window.setTimeout(() => {
      const fallback: Variant[] = Array.from({ length: Math.max(1, count) }).map(
        (_, i) => ({
          id: `placeholder-${i}`,
          css: `:scope { /* @param: kind=range min=0 max=24 step=2 label="padding" */ --wisp-pad: ${4 * (i + 1)}px; }`,
          cssVars: { "--wisp-pad": `${4 * (i + 1)}px` },
          rationale:
            i === 0
              ? "Offline fallback after 30s — no /wisp-design live session is polling. Run `/wisp-design live` in Claude Code so I can design real variants."
              : `Offline fallback ${i + 1} — adjust the padding slider to preview.`,
        }),
      );
      machine.send("generate-variants-arrived", { variants: fallback });
    }, PLACEHOLDER_TIMEOUT_MS);
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
      // Phase 7.8 — echo-guard. The browser POSTs cycling to the bridge on
      // every cycling state entry (for session log + agent visibility); the
      // bridge fanouts that event back to us via SSE; we'd then re-enter
      // cycling → cycling, infinite loop. Skip if incoming variant IDs match
      // current state. Only forward when IDs DIFFER (real agent replacing
      // placeholder, or different agent variants).
      const cur = machine.current().state;
      if (cur.kind === "cycling") {
        const sameLength = cur.variants.length === variants.length;
        const sameIds =
          sameLength && cur.variants.every((v, i) => v.id === variants[i]!.id);
        if (sameIds) return; // own echo — ignore
      }
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
      detachKeyboard();
      disarmPicker();
      disarmMultiSelect();
      tearDownRender();
      unmountGeneratingOverlay();
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

// ---------------------------------------------------------------------------
// Auto-bootstrap from the injected script-tag's query params.
//
// The `inject` flow always produces:
//   <script id="wisp-design-live" src="http://127.0.0.1:<port>/live.js?token=UUID">
//
// This lets integrators drop in the tag without writing any JS — the bridge
// URL and token are read directly from the script's `src` attribute.
//
// If someone has already called `WispDesign.init(...)` manually, a second
// auto-init call will still proceed (two separate handles). If idempotency is
// needed, callers should check `window.__wispHandle` before calling init, or
// simply rely on the auto-init being the sole init path.
//
// Guards: only fires when BOTH the id="wisp-design-live" attribute AND a
// non-empty `?token=` query param are present, so a bare script tag added
// for dev-testing without a real bridge token is silently skipped.
// ---------------------------------------------------------------------------

export function tryAutoInit(): void {
  if (typeof document === "undefined") return;
  // Find OUR script tag — the inject path uses id="wisp-design-live".
  const scriptEl = document.getElementById("wisp-design-live") as HTMLScriptElement | null;
  if (scriptEl === null) return;
  let url: URL;
  try {
    url = new URL(scriptEl.src);
  } catch {
    return;
  }
  const token = url.searchParams.get("token");
  if (token === null || token === "") return;
  // bridgeUrl is the script's origin (live.js was served by the bridge).
  const bridgeUrl = url.origin;
  // Defer to next tick so the document is fully parsed and the host page's
  // own scripts have run. queueMicrotask is preferred over setTimeout(0)
  // because it still runs before the next rendering task.
  const start = (): void => {
    void WispDesign.init({ bridgeUrl, token })
      .then((handle) => {
        // Phase 7.8 — expose the handle for programmatic testing (e2e via
        // browser MCP) and DevTools console debugging. Production use only
        // touches the floating bar UI; this is a low-cost diagnostic hook.
        (window as unknown as { __wispHandle?: unknown }).__wispHandle = handle;
      })
      .catch((err) => {
        // Surface init failures so integrators can debug without opening DevTools.
        // eslint-disable-next-line no-console
        console.error("[wisp-design] auto-init failed:", err);
      });
  };
  if (document.readyState === "complete" || document.readyState === "interactive") {
    queueMicrotask(start);
  } else {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  }
}
tryAutoInit();
