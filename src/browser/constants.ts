// wisp-design — Browser-side constants (Phase 2).
//
// Re-declares the subset of values from src/contracts/browser.ts that the
// IIFE bundle needs at runtime. Contracts imports `zod` at the top level
// and instantiates `z.object(...)` schemas with side effects, which means
// any value-import from contracts pulls all of zod into the bundle and
// blows the 50 kB live.js budget.
//
// These literals MUST stay byte-equal to contracts. The test in
// `tests/browser/constants.spec.ts` (added in Phase 3) asserts equality
// so drift is caught at CI time.

export const MIN_PICKABLE_PX = 20;
export const DEFAULT_VARIANT_COUNT = 3;
export const MAX_VARIANT_COUNT = 8;
export const MIN_VARIANT_COUNT = 1;

export const WISP_UI_DATA_ATTRIBUTE = "data-wisp-ui";
export const WISP_VARIANT_DATA_ATTRIBUTE = "data-wisp-variant";
export const WISP_CSS_DATA_ATTRIBUTE = "data-wisp-css";
export const WISP_SESSION_DATA_ATTRIBUTE = "data-wisp-session";

export const LIVE_JS_VERSION_TAG = "0.11.2-prerelease";

export const FREE_TEXT_MAX_LEN = 4000;
export const ANNOTATION_NOTE_MAX_LEN = 2000;
export const CODE_SNIPPET_MAX_LEN = 20000;

// State-transition table — the authoritative shape lives in contracts as
// `STATE_TRANSITIONS`. Re-declared here as plain string tuples to avoid the
// zod transitive cost. state-machine.ts performs the lookup against this.
import type {
  BrowserStateEvent,
  BrowserStateKind,
  StateTransition,
} from "../contracts/browser.js";

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
  // Phase 7.8 — accept variant-swap from cycling too: the agent may push a
  // replacement set (refinement round) while the previous one is displayed.
  { from: "cycling", to: "cycling", event: "generate-variants-arrived" },
  { from: "cycling", to: "cycling", event: "cycle-next" },
  { from: "cycling", to: "cycling", event: "cycle-prev" },
  { from: "cycling", to: "cycling", event: "cycle-set-active" },
  { from: "cycling", to: "cycling", event: "cycle-param-change" },
  { from: "cycling", to: "idle", event: "cycle-accept" },
  { from: "cycling", to: "idle", event: "cycle-discard" },
  { from: "cycling", to: "idle", event: "cycle-bar-closed" },
];

// Re-export type aliases used by callers so they don't need to dual-import.
export type { BrowserStateEvent, BrowserStateKind };
