// wisp-design — Browser-runtime contracts (Phase 2).
//
// Pure-TS shared type surface for the IIFE-bundled `live.js` runtime that
// runs in the dev page. Mirrors `bridge.ts`: zod schemas, derived TS types,
// module interfaces. No runtime side effects. No DOM imports. No bridge I/O
// — that surface lives in `bridge.ts` and is consumed here only via the
// `BridgeClient` interface.
//
// Three invariants downstream code MUST respect:
//   1. Every user-controlled string entering the DOM (freeText, annotation
//      notes, cssVar values, selectors) flows through `SanitizeModule` —
//      browser code MUST NOT touch innerHTML / element.style without it.
//   2. `BrowserStateKind` transitions are exhaustively listed in
//      `STATE_TRANSITIONS`. `isValidTransition` MUST consult that table; no
//      ad-hoc string compare in the state machine.
//   3. Variants are CSS @scope isolated, NOT iframes, NOT shadow-DOM. The
//      `WISP_VARIANT_DATA_ATTRIBUTE` indexes which sibling is active; the
//      `WISP_CSS_DATA_ATTRIBUTE` tags the injected <style> block so Phase-3
//      source-edit can find + carbonize it.

import { z } from "zod";
import type { BridgeEvent } from "./bridge.js";

// --- Constants ---

export const MIN_PICKABLE_PX = 20;
export const DEFAULT_VARIANT_COUNT = 3;
export const MAX_VARIANT_COUNT = 8;
export const MIN_VARIANT_COUNT = 1;

export const WISP_UI_DATA_ATTRIBUTE = "data-wisp-ui";
export const WISP_VARIANT_DATA_ATTRIBUTE = "data-wisp-variant";
export const WISP_CSS_DATA_ATTRIBUTE = "data-wisp-css";
export const WISP_SESSION_DATA_ATTRIBUTE = "data-wisp-session";

export const LIVE_JS_VERSION_TAG = "0.11.2-prerelease";

// Bridge enforces 4000 chars on `ConfigureEventSchema`. Mirrored here so the
// floating bar can show a counter without round-tripping.
export const FREE_TEXT_MAX_LEN = 4000;
export const ANNOTATION_NOTE_MAX_LEN = 2000;
// Phase 7.17 — pasted design-reference code (snippet popup). Much larger than
// freeText because real component sources run long; bounded so a stray paste
// of a whole bundle can't blow up the bridge payload / session log.
export const CODE_SNIPPET_MAX_LEN = 20000;

// --- Element targeting ---
// Browser-side analogue of bridge `ElementTarget`, enriched with `id`,
// `attributes`, and a `textPreview` shown above the freeText input.

export const PickRectSchema = z.object({
  x: z.number(),
  y: z.number(),
  w: z.number().nonnegative(),
  h: z.number().nonnegative(),
});
export type PickRect = z.infer<typeof PickRectSchema>;

export const PickResultSchema = z.object({
  id: z.string().min(1),
  selector: z.string().min(1),
  tag: z.string().min(1),
  rect: PickRectSchema,
  attributes: z.record(z.string(), z.string()),
  textPreview: z.string().max(200),
});
export type PickResult = z.infer<typeof PickResultSchema>;

export const PickableOptionsSchema = z.object({
  minWidth: z.number().int().positive().default(MIN_PICKABLE_PX),
  minHeight: z.number().int().positive().default(MIN_PICKABLE_PX),
  excludeWispUi: z.boolean().default(true),
});
export type PickableOptions = z.infer<typeof PickableOptionsSchema>;

// --- Variant ---
// `cssVars` carries *initial* values; `parameter-sliders.ts` writes new
// values back into the same CSS custom properties at runtime — zero
// bridge round-trip per slider tick.

export const VariantSchema = z.object({
  id: z.string().min(1),
  css: z.string(),
  cssVars: z.record(z.string(), z.string()),
  rationale: z.string().min(1).max(280),
  structureNotes: z.string().max(1000).optional(),
});
export type Variant = z.infer<typeof VariantSchema>;

// --- Parameter sliders ---
// Variant CSS embeds inline directives like
//   /* @param: kind=range min=0 max=24 step=2 label="padding" */ --wisp-pad: 12px;
// `extractParameterBindings` parses them so the bar can render the right
// control without the agent describing them per-event.

export const ParameterKindSchema = z.enum(["range", "steps", "toggle", "color"]);
export type ParameterKind = z.infer<typeof ParameterKindSchema>;

export const ParameterBindingSchema = z
  .object({
    varName: z.string().regex(/^--[a-z][a-z0-9-]*$/i, "must be a CSS custom property"),
    kind: ParameterKindSchema,
    label: z.string().min(1).max(60),
    min: z.number().optional(),
    max: z.number().optional(),
    step: z.number().positive().optional(),
    options: z.array(z.string()).optional(),
    toggleOnValue: z.string().optional(),
    toggleOffValue: z.string().optional(),
  })
  .superRefine((b, ctx) => {
    if (b.kind === "range" && (b.min === undefined || b.max === undefined)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "range bindings require min and max" });
    }
    if (b.kind === "steps" && (b.options === undefined || b.options.length < 2)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "steps bindings require options[] with ≥2 entries" });
    }
    if (b.kind === "toggle" && (b.toggleOnValue === undefined || b.toggleOffValue === undefined)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "toggle bindings require toggleOnValue and toggleOffValue" });
    }
  });
export type ParameterBinding = z.infer<typeof ParameterBindingSchema>;

// Coder implements in `src/browser/parameter-sliders.ts`. Pure parsing, no DOM.
export type ExtractParameterBindings = (cssText: string) => ParameterBinding[];

// --- Annotations ---
// Structured signal, NOT pixel overlays. (Improvement #7 vs Impeccable.)
// Browser may emit local-only kinds (`spacing`, `typography`) that the bridge
// normalises to its narrower `"other"` bucket before persistence.

export const AnnotationKindSchema = z.enum([
  "padding",
  "color",
  "size",
  "content",
  "spacing",
  "typography",
  "other",
]);
export type AnnotationKind = z.infer<typeof AnnotationKindSchema>;

export const AnnotationSchema = z.object({
  targetId: z.string().min(1),
  kind: AnnotationKindSchema,
  note: z.string().min(1).max(ANNOTATION_NOTE_MAX_LEN),
});
export type Annotation = z.infer<typeof AnnotationSchema>;

// --- State machine ---
// IDLE         start → bar invisible; picker armed.
// PICKING      hovering with crosshair; outline follows pointer.
// CONFIGURING  one+ targets locked; freeText + annotation editors visible.
// GENERATING   awaiting agent variants; bar shows skeleton, picker disarmed.
// CYCLING      variants in DOM; left/right cycles; sliders tune; accept/discard.
//
// `STATE_TRANSITIONS` is the only place to add a new edge. The state machine
// impl in `state-machine.ts` consults this table; tests assert it covers
// every (from, event) pair the floating bar can produce.

export type BrowserStateKind =
  | "idle"
  | "picking"
  | "configuring"
  | "generating"
  | "cycling";

export type BrowserState =
  | { kind: "idle" }
  | { kind: "picking"; hoverSelector: string | null }
  | { kind: "configuring"; targets: PickResult[]; freeText: string }
  | {
      kind: "generating";
      targets: PickResult[];
      freeText: string;
      /** Phase 7.17 — pasted design-reference code from the snippet popup.
       *  May carry the whole intent (freeText empty) or complement it. */
      codeSnippet?: string;
      requestedVariantCount: number;
      /** Phase 7.15 — Deviation (1=subtle, 5=bold). Optional/back-compat. */
      deviation?: number;
      startedAt: number;
    }
  | {
      kind: "cycling";
      targets: PickResult[];
      variants: Variant[];
      activeIndex: number;
      paramOverrides: Record<string, string>;
    };

export type BrowserStateEvent =
  | "pick-start"
  | "pick-hover"
  | "pick-confirm"
  | "pick-add" // ⌘-click multi-select extension (Improvement #1)
  | "pick-cancel"
  | "configure-edit-text"
  | "configure-submit"
  | "configure-cancel"
  | "generate-variants-arrived"
  | "generate-error"
  | "generate-cancel"
  | "cycle-next"
  | "cycle-prev"
  | "cycle-set-active"
  | "cycle-param-change"
  | "cycle-accept"
  | "cycle-discard"
  | "cycle-bar-closed";

export interface StateTransition {
  from: BrowserStateKind;
  to: BrowserStateKind;
  event: BrowserStateEvent;
}

// Authoritative transition table — 18 edges. Anything not listed is INVALID
// and `isValidTransition` returns false.
export const STATE_TRANSITIONS: readonly StateTransition[] = [
  { from: "idle", to: "picking", event: "pick-start" },
  { from: "picking", to: "picking", event: "pick-hover" },
  { from: "picking", to: "configuring", event: "pick-confirm" },
  { from: "picking", to: "idle", event: "pick-cancel" },
  { from: "configuring", to: "configuring", event: "configure-edit-text" },
  { from: "configuring", to: "configuring", event: "pick-add" },
  { from: "configuring", to: "generating", event: "configure-submit" },
  { from: "configuring", to: "idle", event: "configure-cancel" },
  { from: "generating", to: "cycling", event: "generate-variants-arrived" },
  { from: "generating", to: "configuring", event: "generate-error" },
  { from: "generating", to: "configuring", event: "generate-cancel" },
  // Phase 7.8 — the agent may push a replacement set while one is displayed.
  { from: "cycling", to: "cycling", event: "generate-variants-arrived" },
  { from: "cycling", to: "cycling", event: "cycle-next" },
  { from: "cycling", to: "cycling", event: "cycle-prev" },
  { from: "cycling", to: "cycling", event: "cycle-set-active" },
  { from: "cycling", to: "cycling", event: "cycle-param-change" },
  { from: "cycling", to: "idle", event: "cycle-accept" },
  { from: "cycling", to: "idle", event: "cycle-discard" },
  { from: "cycling", to: "idle", event: "cycle-bar-closed" },
];

// Type-only signature. Coder implements via lookup over STATE_TRANSITIONS.
export type IsValidTransition = (
  from: BrowserStateKind,
  to: BrowserStateKind,
  event: BrowserStateEvent,
) => boolean;

// --- State-machine module ---
// `src/browser/state-machine.ts` implements.

export interface StateMachineSnapshot {
  state: BrowserState;
  // performance.now() when the current state was entered. Used by GENERATING
  // to render "1.4s elapsed"; by tests for deterministic transition-latency
  // assertions.
  enteredAt: number;
}

export interface StateMachineModule {
  current(): StateMachineSnapshot;
  send(event: BrowserStateEvent, payload?: unknown): StateMachineSnapshot;
  subscribe(handler: (snap: StateMachineSnapshot) => void): () => void;
  reset(): void;
}

// --- Picker module ---
// `src/browser/picker.ts` implements. `pickable` enforces ≥20×20, excludes
// `[data-wisp-ui]`, html/body/script/style/link/meta, and display:none.

export interface PickerModule {
  pickable(el: Element, opts?: Partial<PickableOptions>): boolean;
  buildPickResult(el: Element): PickResult;
  // `arm` returns an unsubscribe; picker installs pointermove + click on the
  // document and tears them down on unsubscribe.
  arm(handlers: {
    onHover: (el: Element | null) => void;
    onConfirm: (el: Element, withMulti: boolean) => void;
    onCancel: () => void;
  }): () => void;
}

// --- Floating bar ---
// `src/browser/floating-bar.ts` implements. One instance per page tab. Three
// modes mirror state-machine kinds: "configure" (also during PICKING),
// "generating" (skeleton + cancel), "cycling" (arrows + sliders + accept).

export type FloatingBarMode = "configure" | "generating" | "cycling";

export interface FloatingBarModule {
  mount(): void;
  unmount(): void;
  render(mode: FloatingBarMode, snap: StateMachineSnapshot): void;
}

// --- Variant render ---
// `src/browser/variant-render.ts` implements. Mounts three sibling
// <div data-wisp-variant="0|1|2"> wrappers around the target, injects one
// <style data-wisp-css="<sessionId>"> with `@scope` rules, toggles display
// via the active-index attribute. Reversible — `teardown` is byte-equivalent
// to pre-mount (Phase-3 carbonize relies on this).

export interface VariantRenderHandle {
  setActive(index: number): void;
  // Apply a single CSS-var override on the active variant's @scope root.
  // No bridge round-trip; the slider drives the browser directly.
  setParamOverride(varName: string, value: string): void;
  teardown(): void;
}

export interface VariantRenderModule {
  mount(opts: {
    target: PickResult;
    variants: Variant[];
    sessionId: string;
  }): VariantRenderHandle;
}

// --- Parameter-sliders module ---
// Pure DOM-builder; no bridge calls. The state-machine relays change events
// into `cycle-param-change` so session-replay can observe.

export interface ParameterSlidersModule {
  extract: ExtractParameterBindings;
  mount(opts: {
    bindings: ParameterBinding[];
    initialValues: Record<string, string>;
    onChange: (varName: string, value: string) => void;
  }): { unmount: () => void };
}

// --- Multi-select module ---
// `src/browser/multi-select.ts`. Tracks ⌘-click / Ctrl-click set; decorates
// each member with a dotted outline (painted overlay, never inline styles on
// the target). Improvement #1 vs Impeccable (single-element only).

export interface MultiSelectModule {
  add(target: PickResult): void;
  remove(targetId: string): void;
  list(): PickResult[];
  clear(): void;
}

// --- Annotation module ---
// `src/browser/annotations.ts`. Builds structured `Annotation` from in-bar
// form input; never captures pixels.

export interface AnnotationModule {
  build(targetId: string, kind: AnnotationKind, note: string): Annotation;
  validate(annotation: Annotation): { ok: true } | { ok: false; reason: string };
}

// --- Sanitize module ---
// security implements in `src/browser/sanitize.ts`. All user-controlled or
// agent-controlled strings entering the DOM MUST flow through this. State
// machine, floating bar, variant-render, parameter-sliders are forbidden to
// call innerHTML / element.style / setAttribute on user data without it.

export type SanitizeReason =
  | "EMPTY"
  | "TOO_LONG"
  | "INVALID_CSS_VAR_NAME"
  | "INVALID_CSS_VALUE"
  | "INVALID_SELECTOR"
  | "FORBIDDEN_CHAR";

export interface SanitizeError {
  code: SanitizeReason;
  message: string;
  detail?: unknown;
}

export interface SanitizeFreeTextOptions {
  maxLen?: number;
}

export interface SanitizeModule {
  // HTML-escape for textContent-safe rendering. Never returns markup.
  escapeHtml(s: string): string;

  // Trim, normalise CR/LF, strip C0 controls, cap at maxLen (default
  // FREE_TEXT_MAX_LEN). Does NOT html-escape — pair with `escapeHtml` at the
  // rendering site.
  sanitizeFreeText(s: string, opts?: SanitizeFreeTextOptions): string;

  // Validate a CSS custom-property assignment. `varName` must match
  // /^--[a-z][a-z0-9-]*$/i; `value` must be free of `;`, `{`, `}`, `<`, `>`,
  // and the substrings `url(`, `@import`, `expression(` (case-insensitive).
  trustedCssVar(
    varName: string,
    value: string,
  ):
    | { ok: true; varName: string; value: string }
    | { ok: false; reason: SanitizeError };

  // Validate a selector before passing to `document.querySelector`. Rejects
  // newlines, angle brackets, and `javascript:` / `data:` substrings.
  trustedSelector(
    sel: string,
  ): { ok: true; selector: string } | { ok: false; reason: SanitizeError };
}

// --- Bridge client ---
// `src/browser/bridge-client.ts` implements. Wraps fetch(POST /events) +
// EventSource(GET /events) or long-poll fallback. `ready()` resolves once
// the SSE (or first long-poll) connection has been established.

export type BridgeClientTransport = "sse" | "long-poll";

export interface BridgeClientOptions {
  bridgeUrl: string;
  token: string;
  sessionId: string;
  transport?: BridgeClientTransport;
}

export interface BridgeClient {
  postEvent(evt: BridgeEvent): Promise<{ cursor: string }>;
  subscribe(handler: (evt: BridgeEvent) => void): () => void;
  ready(): Promise<void>;
  close(): void;
}

export interface BridgeClientModule {
  create(opts: BridgeClientOptions): BridgeClient;
}

// --- Top-level IIFE entry ---
// Exposed on `window.WispDesign`. `init` is the only documented entry;
// `version` lets the source-inject step (Phase 3) verify the bundle is the
// expected build before relying on it.

export interface InitOptions {
  bridgeUrl: string;
  token: string;
  sessionId?: string;
  transport?: BridgeClientTransport;
}

export interface WispDesignHandle {
  // Remove every DOM artefact + event listener the runtime installed.
  teardown(): void;
  // Snapshot of current state-machine state. Cheap read.
  state(): BrowserState;
  // Programmatic equivalents of "pick" and "esc" hotkeys; the floating bar's
  // buttons call these so e2e tests can drive the runtime without simulating
  // mouse events.
  pick(): void;
  cancel(): void;
}

export interface WispDesignGlobal {
  init(opts: InitOptions): Promise<WispDesignHandle>;
  readonly version: string;
}

// --- Telemetry ---
// Local-only events the session logger (Phase 6) records. Lives here so
// coder can emit them from browser modules without depending on the logger
// module — loose coupling via a single function-shape.

export type TelemetryEventKind =
  | "state-transition"
  | "variant-cycle"
  | "param-change"
  | "accept"
  | "discard"
  | "annotation"
  | "error";

export interface TelemetryEvent {
  kind: TelemetryEventKind;
  at: number; // performance.now() at emission
  payload: unknown;
}

export type EmitTelemetry = (evt: TelemetryEvent) => void;
