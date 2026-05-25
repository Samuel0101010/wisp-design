// wisp-design — Multi-select (Phase 2 + Phase 7 badge UX).
//
// ⌘-click (macOS) / Ctrl-click (Win/Linux) extends the target set during
// CONFIGURING. Outline decoration lives on a sibling overlay attribute
// (`data-wisp-selected`) — we never mutate inline styles on the target.
// Improvement #1 vs Impeccable (single-element only).
//
// Phase 7 — Goal 3:
//   Each picked element gets a `data-wisp-ui="multi-badge"` floating badge
//   showing its 1-based index in the targets array. 18×18 circle, neutral-900,
//   white bold 11px. Badges are fully managed by createMultiSelect; they are
//   removed when an item is removed or clear() is called, and replaced on add.

import { WISP_UI_DATA_ATTRIBUTE } from "./constants.js";
import type {
  MultiSelectModule,
  PickResult,
} from "../contracts/browser.js";

const SELECTED_ATTR = "data-wisp-selected";
const BADGE_ATTR = "data-wisp-badge-for";

// ---------------------------------------------------------------------------
// cssAttrEscape — minimal escape for use inside `[attr="<value>"]` selectors.
// Escapes backslash and double-quote; avoids a hard dependency on CSS.escape
// which is absent in jsdom test environments.
// ---------------------------------------------------------------------------
function cssAttrEscape(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

// ---------------------------------------------------------------------------
// isCmdOrCtrl — single source of truth for the modifier-test.
// ---------------------------------------------------------------------------

export function isCmdOrCtrl(e: KeyboardEvent | MouseEvent): boolean {
  return e.metaKey === true || e.ctrlKey === true;
}

// ---------------------------------------------------------------------------
// outline helpers — paint via data-attribute; CSS lives in floating-bar's
// injected <style> block.
// ---------------------------------------------------------------------------

function decorate(el: Element, id: string): void {
  if (!(el instanceof HTMLElement)) return;
  el.setAttribute(SELECTED_ATTR, id);
}

function undecorate(el: Element | null): void {
  if (!(el instanceof HTMLElement)) return;
  el.removeAttribute(SELECTED_ATTR);
}

function findDecoratedFor(id: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(
    `[${SELECTED_ATTR}="${cssAttrEscape(id)}"]`,
  );
}

// ---------------------------------------------------------------------------
// Badge helpers (Goal 3).
//
// Each badge is a `position: fixed` circle overlaid on its target's top-right
// corner. It carries `data-wisp-badge-for="<id>"` so it can be found and
// removed independently of the target element.
// ---------------------------------------------------------------------------

function createBadge(doc: Document, id: string, index: number): HTMLElement {
  const badge = doc.createElement("div");
  badge.setAttribute(WISP_UI_DATA_ATTRIBUTE, "multi-badge");
  badge.setAttribute(BADGE_ATTR, id);
  badge.textContent = String(index);
  Object.assign(badge.style, {
    position: "fixed",
    width: "18px",
    height: "18px",
    borderRadius: "50%",
    background: "rgb(23 23 23)",
    color: "#fff",
    fontWeight: "bold",
    fontSize: "11px",
    fontFamily: "ui-monospace, monospace",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 1px 4px rgba(0,0,0,0.4)",
    pointerEvents: "none",
    zIndex: "2147483641",
    lineHeight: "1",
  });
  return badge;
}

function placeBadge(badge: HTMLElement, target: Element): void {
  const rect = target.getBoundingClientRect();
  // top-right corner, offset by half-badge-width so it sits on the corner.
  badge.style.left = `${rect.right - 9}px`;
  badge.style.top = `${rect.top - 9}px`;
}

function removeBadgeFor(doc: Document, id: string): void {
  const badge = doc.querySelector(`[${BADGE_ATTR}="${cssAttrEscape(id)}"]`);
  if (badge) badge.remove();
}

function removeAllBadges(doc: Document): void {
  const all = doc.querySelectorAll(`[${BADGE_ATTR}]`);
  for (const b of Array.from(all)) b.remove();
}

/** Re-render all badges so indices stay consecutive after a remove. */
function refreshBadges(
  doc: Document,
  items: Map<string, PickResult>,
): void {
  // Remove all existing badges first.
  removeAllBadges(doc);
  let index = 1;
  for (const [id] of items) {
    try {
      const target = doc.querySelector(`[${SELECTED_ATTR}="${cssAttrEscape(id)}"]`);
      if (!target) { index += 1; continue; }
      const badge = createBadge(doc, id, index);
      doc.body?.appendChild(badge);
      placeBadge(badge, target);
    } catch {
      /* ignore if selector fails */
    }
    index += 1;
  }
}

// ---------------------------------------------------------------------------
// attachMultiSelect — wires the modifier-click listener.
// ---------------------------------------------------------------------------

export interface AttachMultiSelectOptions {
  isModifierPressed: () => boolean;
  onAdd: (result: PickResult) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
  buildPickResult: (el: HTMLElement) => PickResult;
}

export function attachMultiSelect(opts: AttachMultiSelectOptions): () => void {
  const handleClick = (e: MouseEvent): void => {
    if (!isCmdOrCtrl(e)) return;
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.closest(`[${WISP_UI_DATA_ATTRIBUTE}]`) !== null) return;

    e.preventDefault();
    e.stopPropagation();

    const existingId = target.getAttribute(SELECTED_ATTR);
    if (existingId !== null) {
      undecorate(target);
      opts.onRemove(existingId);
      return;
    }

    const result = opts.buildPickResult(target);
    decorate(target, result.id);
    opts.onAdd(result);
  };

  const handleKey = (e: KeyboardEvent): void => {
    if (e.key === "Escape" && isCmdOrCtrl(e)) {
      const all = document.querySelectorAll(`[${SELECTED_ATTR}]`);
      for (const el of Array.from(all)) undecorate(el);
      opts.onClear();
    }
  };

  document.addEventListener("click", handleClick, true);
  document.addEventListener("keydown", handleKey, true);

  return (): void => {
    // Detach is now LISTENER-ONLY — badges and outline decoration stay so
    // the user can see what's selected while configuring (Phase 7.4 polish).
    // The state machine clears via `multi.clear()` when entering idle/picking,
    // which is the explicit "wipe selection" signal.
    document.removeEventListener("click", handleClick, true);
    document.removeEventListener("keydown", handleKey, true);
  };
}

// ---------------------------------------------------------------------------
// createMultiSelect — in-memory tracker that backs `MultiSelectModule`.
// Adds/removes badges alongside selection state.
// ---------------------------------------------------------------------------

export function createMultiSelect(): MultiSelectModule {
  const items = new Map<string, PickResult>();
  const doc = typeof document !== "undefined" ? document : null;

  return {
    add(target: PickResult): void {
      items.set(target.id, target);
      try {
        const el = doc ? doc.querySelector(target.selector) : null;
        if (el !== null) {
          decorate(el, target.id);
          if (doc) refreshBadges(doc, items);
        }
      } catch {
        /* ignore */
      }
    },
    remove(targetId: string): void {
      items.delete(targetId);
      const el = findDecoratedFor(targetId);
      if (el !== null) undecorate(el);
      if (doc) refreshBadges(doc, items);
    },
    list(): PickResult[] {
      return Array.from(items.values());
    },
    clear(): void {
      for (const id of Array.from(items.keys())) {
        const el = findDecoratedFor(id);
        if (el !== null) undecorate(el);
      }
      items.clear();
      if (doc) removeAllBadges(doc);
    },
  };
}
