// wisp-design — Browser state-machine (Phase 2).
//
// Pure logic. No DOM access. Implements `StateMachineModule` from
// src/contracts/browser.ts. Authoritative transition table lives in
// `STATE_TRANSITIONS`; this module is a lookup + observer fan-out.
//
// The reducer maps an event + payload onto the next `BrowserState` shape.
// Payload typing is intentionally `unknown` at the boundary — each handler
// narrows the slice it needs. Invalid transitions are no-ops (the snapshot
// is returned unchanged); callers can detect that by comparing identity.

import { STATE_TRANSITIONS } from "./constants.js";
import type {
  BrowserState,
  BrowserStateEvent,
  BrowserStateKind,
  IsValidTransition,
  PickResult,
  StateMachineModule,
  StateMachineSnapshot,
  Variant,
} from "../contracts/browser.js";

// ---------------------------------------------------------------------------
// isValidTransition — table-lookup; no string compare anywhere else.
// ---------------------------------------------------------------------------

export const isValidTransition: IsValidTransition = (from, to, event) => {
  for (const edge of STATE_TRANSITIONS) {
    if (edge.from === from && edge.to === to && edge.event === event) {
      return true;
    }
  }
  return false;
};

function targetKindFor(
  from: BrowserStateKind,
  event: BrowserStateEvent,
): BrowserStateKind | null {
  for (const edge of STATE_TRANSITIONS) {
    if (edge.from === from && edge.event === event) return edge.to;
  }
  return null;
}

// ---------------------------------------------------------------------------
// now() — performance.now() with a safe fallback for non-DOM contexts (tests).
// ---------------------------------------------------------------------------

function now(): number {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

// ---------------------------------------------------------------------------
// Payload typing helpers — narrow `unknown` at the reducer entry.
// ---------------------------------------------------------------------------

interface PickHoverPayload {
  hoverSelector: string | null;
}
interface PickConfirmPayload {
  target: PickResult;
}
interface PickAddPayload {
  target: PickResult;
}
interface ConfigureEditPayload {
  freeText: string;
}
interface ConfigureSubmitPayload {
  requestedVariantCount: number;
  /** Phase 7.15 — deviation 1..5 (subtle..bold). Optional for back-compat;
   *  when undefined, the generating event omits the field and the agent
   *  uses its default behavior. */
  deviation?: number;
  /** Phase 7.17 — pasted design-reference code (snippet popup). Optional;
   *  empty strings are dropped at the parser. */
  codeSnippet?: string;
}
interface GenerateArrivedPayload {
  variants: Variant[];
}
interface CycleSetActivePayload {
  index: number;
}
interface CycleParamChangePayload {
  varName: string;
  value: string;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function pickHover(payload: unknown): PickHoverPayload {
  if (!isObject(payload)) return { hoverSelector: null };
  const sel = payload.hoverSelector;
  return { hoverSelector: typeof sel === "string" ? sel : null };
}

function pickConfirm(payload: unknown): PickConfirmPayload | null {
  if (!isObject(payload) || !isObject(payload.target)) return null;
  return { target: payload.target as PickResult };
}

function configureEdit(payload: unknown): ConfigureEditPayload | null {
  if (!isObject(payload) || typeof payload.freeText !== "string") return null;
  return { freeText: payload.freeText };
}

function configureSubmit(payload: unknown): ConfigureSubmitPayload {
  let count = 3;
  let deviation: number | undefined;
  let codeSnippet: string | undefined;
  if (isObject(payload)) {
    if (typeof payload.requestedVariantCount === "number") {
      count = payload.requestedVariantCount;
    }
    if (typeof payload.deviation === "number") {
      const d = Math.round(payload.deviation);
      if (d >= 1 && d <= 5) deviation = d;
    }
    if (typeof payload.codeSnippet === "string" && payload.codeSnippet.length > 0) {
      codeSnippet = payload.codeSnippet;
    }
  }
  const out: ConfigureSubmitPayload = { requestedVariantCount: count };
  if (deviation !== undefined) out.deviation = deviation;
  if (codeSnippet !== undefined) out.codeSnippet = codeSnippet;
  return out;
}

function generateArrived(payload: unknown): GenerateArrivedPayload | null {
  if (!isObject(payload) || !Array.isArray(payload.variants)) return null;
  return { variants: payload.variants as Variant[] };
}

function cycleSetActive(payload: unknown): CycleSetActivePayload | null {
  if (!isObject(payload) || typeof payload.index !== "number") return null;
  return { index: payload.index };
}

function cycleParamChange(
  payload: unknown,
): CycleParamChangePayload | null {
  if (
    !isObject(payload) ||
    typeof payload.varName !== "string" ||
    typeof payload.value !== "string"
  ) {
    return null;
  }
  return { varName: payload.varName, value: payload.value };
}

// ---------------------------------------------------------------------------
// reduce — total function from (state, event, payload) → next state.
// Invalid transitions return the input state unchanged.
// ---------------------------------------------------------------------------

function reduce(
  state: BrowserState,
  event: BrowserStateEvent,
  payload: unknown,
): BrowserState {
  const targetKind = targetKindFor(state.kind, event);
  if (targetKind === null) return state;
  if (!isValidTransition(state.kind, targetKind, event)) return state;

  switch (event) {
    case "pick-start":
      return { kind: "picking", hoverSelector: null };

    case "pick-hover": {
      if (state.kind !== "picking") return state;
      return { kind: "picking", hoverSelector: pickHover(payload).hoverSelector };
    }

    case "pick-confirm": {
      const p = pickConfirm(payload);
      if (!p) return state;
      return { kind: "configuring", targets: [p.target], freeText: "" };
    }

    case "pick-cancel":
    case "configure-cancel":
    case "cycle-accept":
    case "cycle-discard":
    case "cycle-bar-closed":
      return { kind: "idle" };

    case "pick-add": {
      if (state.kind !== "configuring") return state;
      const p = payload as PickAddPayload | undefined;
      if (!p || !isObject(p) || !isObject(p.target)) return state;
      // Toggle semantics — if already present (by id), no-op; caller can pre-
      // filter for removal via a separate `configure-edit-text` round.
      const exists = state.targets.some((t) => t.id === p.target.id);
      if (exists) return state;
      return {
        kind: "configuring",
        targets: [...state.targets, p.target],
        freeText: state.freeText,
      };
    }

    case "configure-edit-text": {
      if (state.kind !== "configuring") return state;
      const p = configureEdit(payload);
      if (!p) return state;
      return {
        kind: "configuring",
        targets: state.targets,
        freeText: p.freeText,
      };
    }

    case "configure-submit": {
      if (state.kind !== "configuring") return state;
      const p = configureSubmit(payload);
      const next: BrowserState = {
        kind: "generating",
        targets: state.targets,
        freeText: state.freeText,
        requestedVariantCount: p.requestedVariantCount,
        startedAt: now(),
      };
      if (p.deviation !== undefined) {
        (next as { deviation?: number }).deviation = p.deviation;
      }
      if (p.codeSnippet !== undefined) {
        (next as { codeSnippet?: string }).codeSnippet = p.codeSnippet;
      }
      return next;
    }

    case "generate-variants-arrived": {
      // Phase 7.8 — accept from BOTH generating and cycling. The latter
      // lets the agent push a replacement set (refinement round) while a
      // previous one is displayed: swap in, reset activeIndex + overrides.
      if (state.kind !== "generating" && state.kind !== "cycling") return state;
      const p = generateArrived(payload);
      if (!p || p.variants.length === 0) return state;
      return {
        kind: "cycling",
        targets: state.targets,
        variants: p.variants,
        activeIndex: 0,
        paramOverrides: {},
      };
    }

    case "generate-error":
    case "generate-cancel": {
      if (state.kind !== "generating") return state;
      return {
        kind: "configuring",
        targets: state.targets,
        freeText: state.freeText,
      };
    }

    case "cycle-next": {
      if (state.kind !== "cycling") return state;
      const next = (state.activeIndex + 1) % state.variants.length;
      return { ...state, activeIndex: next };
    }

    case "cycle-prev": {
      if (state.kind !== "cycling") return state;
      const len = state.variants.length;
      const prev = (state.activeIndex - 1 + len) % len;
      return { ...state, activeIndex: prev };
    }

    case "cycle-set-active": {
      if (state.kind !== "cycling") return state;
      const p = cycleSetActive(payload);
      if (!p) return state;
      if (p.index < 0 || p.index >= state.variants.length) return state;
      return { ...state, activeIndex: p.index };
    }

    case "cycle-param-change": {
      if (state.kind !== "cycling") return state;
      const p = cycleParamChange(payload);
      if (!p) return state;
      return {
        ...state,
        paramOverrides: { ...state.paramOverrides, [p.varName]: p.value },
      };
    }

    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// createStateMachine — factory + observer fan-out.
// ---------------------------------------------------------------------------

export function createStateMachine(
  initial: BrowserState = { kind: "idle" },
): StateMachineModule {
  let snap: StateMachineSnapshot = { state: initial, enteredAt: now() };
  const subs = new Set<(s: StateMachineSnapshot) => void>();

  const emit = (): void => {
    // Iterate over a copy — handlers may unsubscribe themselves.
    for (const h of Array.from(subs)) {
      try {
        h(snap);
      } catch {
        // Observer errors must not crash the state machine; swallow.
      }
    }
  };

  return {
    current(): StateMachineSnapshot {
      return snap;
    },
    send(event: BrowserStateEvent, payload?: unknown): StateMachineSnapshot {
      const prev = snap.state;
      const next = reduce(prev, event, payload);
      if (next !== prev) {
        snap = { state: next, enteredAt: now() };
        emit();
      }
      return snap;
    },
    subscribe(handler: (snap: StateMachineSnapshot) => void): () => void {
      subs.add(handler);
      return () => {
        subs.delete(handler);
      };
    },
    reset(): void {
      snap = { state: { kind: "idle" }, enteredAt: now() };
      emit();
    },
  };
}
