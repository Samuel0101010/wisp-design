// wisp-design — DOM picker (Phase 2).
//
// Implements `PickerModule` from src/contracts/browser.ts:
//   - `pickable(el, opts)`  predicate per docs/browser-runtime.md
//   - `buildPickResult(el)` flat snapshot for state machine + bridge
//   - `arm(handlers)`       installs pointermove + click listeners, returns
//                           an unsubscribe.
//
// All work goes through `[data-wisp-ui]` exclusion so the floating bar and
// variant overlays can never be re-selected.

import { MIN_PICKABLE_PX, WISP_UI_DATA_ATTRIBUTE } from "./constants.js";
import type {
  PickRect,
  PickResult,
  PickableOptions,
  PickerModule,
} from "../contracts/browser.js";

const FORBIDDEN_TAGS = new Set([
  "HTML",
  "BODY",
  "SCRIPT",
  "STYLE",
  "LINK",
  "META",
  "HEAD",
  "TITLE",
]);

const DEFAULT_PICKABLE: PickableOptions = {
  minWidth: MIN_PICKABLE_PX,
  minHeight: MIN_PICKABLE_PX,
  excludeWispUi: true,
};

const RELEVANT_ATTRS = ["id", "class", "role"];

// ---------------------------------------------------------------------------
// pickable — predicate.
// ---------------------------------------------------------------------------

export function pickable(
  el: Element,
  opts?: Partial<PickableOptions>,
): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const o: PickableOptions = { ...DEFAULT_PICKABLE, ...(opts ?? {}) };

  if (FORBIDDEN_TAGS.has(el.tagName)) return false;
  if (o.excludeWispUi && el.closest(`[${WISP_UI_DATA_ATTRIBUTE}]`) !== null) {
    return false;
  }

  const rect = el.getBoundingClientRect();
  if (rect.width < o.minWidth || rect.height < o.minHeight) return false;

  // getComputedStyle returns "" for detached nodes — treat as not pickable.
  const cs = el.ownerDocument?.defaultView?.getComputedStyle(el);
  if (!cs) return false;
  if (cs.visibility === "hidden") return false;
  if (cs.display === "none") return false;

  return true;
}

// ---------------------------------------------------------------------------
// buildSelector — id → `#id`, else tag + :nth-of-type chain to root.
// Stable enough for the agent's purposes; not unique under all DOM mutations.
// ---------------------------------------------------------------------------

function isValidIdForSelector(id: string): boolean {
  // CSS.escape would be safer but we want a human-readable selector. Stick
  // to a conservative shape: leading letter/underscore, then word chars or
  // dashes. Anything else falls back to the nth-of-type chain.
  return /^[A-Za-z_][\w-]*$/.test(id);
}

function nthOfType(el: HTMLElement): number {
  const parent = el.parentElement;
  if (!parent) return 1;
  let n = 0;
  for (let i = 0; i < parent.children.length; i += 1) {
    const sib = parent.children[i];
    if (!sib) continue;
    if (sib.tagName === el.tagName) {
      n += 1;
      if (sib === el) return n;
    }
  }
  return n;
}

export function buildSelector(el: HTMLElement): string {
  if (el.id && isValidIdForSelector(el.id)) return `#${el.id}`;

  const parts: string[] = [];
  let cur: HTMLElement | null = el;
  // Walk up to (but not including) <body>; the body selector adds noise.
  while (cur && cur.tagName !== "BODY" && cur.tagName !== "HTML") {
    if (cur.id && isValidIdForSelector(cur.id)) {
      parts.unshift(`#${cur.id}`);
      break;
    }
    const tag = cur.tagName.toLowerCase();
    const idx = nthOfType(cur);
    parts.unshift(`${tag}:nth-of-type(${idx})`);
    cur = cur.parentElement;
  }
  return parts.length > 0 ? parts.join(" > ") : el.tagName.toLowerCase();
}

// ---------------------------------------------------------------------------
// id helpers.
// ---------------------------------------------------------------------------

function newId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof (crypto as Crypto).randomUUID === "function"
  ) {
    return (crypto as Crypto).randomUUID();
  }
  // Fallback — non-cryptographic but unique enough for in-page targets.
  return `tgt-${Date.now()}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}

// ---------------------------------------------------------------------------
// rectOf — DOMRect → PickRect (plain object, JSON-safe).
// ---------------------------------------------------------------------------

function rectOf(el: HTMLElement): PickRect {
  const r = el.getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height };
}

// ---------------------------------------------------------------------------
// attributesOf — pick the relevant subset; data-* always included.
// ---------------------------------------------------------------------------

function attributesOf(el: HTMLElement): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of RELEVANT_ATTRS) {
    const v = el.getAttribute(name);
    if (v !== null) out[name] = v;
  }
  for (const attr of Array.from(el.attributes)) {
    if (attr.name.startsWith("data-")) {
      // Exclude our own marker so we never re-serialise wisp internals.
      if (attr.name === WISP_UI_DATA_ATTRIBUTE) continue;
      out[attr.name] = attr.value;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// textPreviewOf — first 80 chars of textContent, single-spaced.
// ---------------------------------------------------------------------------

function textPreviewOf(el: HTMLElement): string {
  const raw = el.textContent ?? "";
  const collapsed = raw.replace(/\s+/g, " ").trim();
  return collapsed.length > 80 ? `${collapsed.slice(0, 80)}…` : collapsed;
}

// ---------------------------------------------------------------------------
// extractPickResult — full snapshot.
// ---------------------------------------------------------------------------

export function extractPickResult(el: HTMLElement): PickResult {
  return {
    id: newId(),
    selector: buildSelector(el),
    tag: el.tagName.toLowerCase(),
    rect: rectOf(el),
    attributes: attributesOf(el),
    textPreview: textPreviewOf(el),
  };
}

export function buildPickResult(el: Element): PickResult {
  if (!(el instanceof HTMLElement)) {
    throw new Error("buildPickResult requires an HTMLElement");
  }
  return extractPickResult(el);
}

// ---------------------------------------------------------------------------
// attachPicker — pointermove + click + escape; returns detach.
// ---------------------------------------------------------------------------

export interface AttachPickerOptions {
  onHover: (sel: string | null) => void;
  onPick: (result: PickResult, withMulti: boolean) => void;
  onCancel?: () => void;
  pickableOpts?: Partial<PickableOptions>;
}

export function attachPicker(opts: AttachPickerOptions): () => void {
  let lastHovered: HTMLElement | null = null;

  const handleMove = (e: PointerEvent): void => {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (el === null || !pickable(el, opts.pickableOpts)) {
      if (lastHovered !== null) {
        lastHovered = null;
        opts.onHover(null);
      }
      return;
    }
    const html = el as HTMLElement;
    if (html === lastHovered) return;
    lastHovered = html;
    opts.onHover(buildSelector(html));
  };

  const handleClick = (e: MouseEvent): void => {
    const target = e.target;
    if (!(target instanceof Element)) return;
    // Exclude clicks on our own UI.
    if (target.closest(`[${WISP_UI_DATA_ATTRIBUTE}]`) !== null) return;
    if (!pickable(target, opts.pickableOpts)) return;
    e.preventDefault();
    e.stopPropagation();
    const withMulti = e.metaKey || e.ctrlKey;
    opts.onPick(extractPickResult(target as HTMLElement), withMulti);
  };

  const handleKey = (e: KeyboardEvent): void => {
    if (e.key === "Escape" && opts.onCancel) {
      e.preventDefault();
      opts.onCancel();
    }
  };

  document.addEventListener("pointermove", handleMove, true);
  document.addEventListener("click", handleClick, true);
  document.addEventListener("keydown", handleKey, true);

  return (): void => {
    document.removeEventListener("pointermove", handleMove, true);
    document.removeEventListener("click", handleClick, true);
    document.removeEventListener("keydown", handleKey, true);
    lastHovered = null;
  };
}

// ---------------------------------------------------------------------------
// PickerModule export — composes the above into the contract surface.
// ---------------------------------------------------------------------------

export const pickerModule: PickerModule = {
  pickable,
  buildPickResult,
  arm(handlers) {
    return attachPicker({
      onHover: (sel) => {
        if (sel === null) {
          handlers.onHover(null);
          return;
        }
        // We pass the element-of-hover back as null; the bar only needs the
        // selector string for the "hovered: …" hint. To keep the contract
        // honest we resolve the element via document.querySelector — but
        // sanitisation of selectors lives in SanitizeModule and is enforced
        // in the runtime entry, not here.
        try {
          const el = document.querySelector(sel);
          handlers.onHover(el);
        } catch {
          handlers.onHover(null);
        }
      },
      onPick: (result, withMulti) => {
        // PickerModule.arm signature wants the element back, but downstream
        // code (state machine, bar) only ever uses `result`. Resolve the
        // selector to give the contract surface what it wants.
        try {
          const el = document.querySelector(result.selector);
          if (el instanceof Element) {
            handlers.onConfirm(el, withMulti);
            return;
          }
        } catch {
          // fall through to onCancel-equivalent
        }
        handlers.onCancel();
      },
      onCancel: handlers.onCancel,
    });
  },
};
