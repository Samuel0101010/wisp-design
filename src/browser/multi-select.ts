// wisp-design — Multi-select (Phase 2).
//
// ⌘-click (macOS) / Ctrl-click (Win/Linux) extends the target set during
// CONFIGURING. Outline decoration lives on a sibling overlay attribute
// (`data-wisp-selected`) — we never mutate inline styles on the target.
// Improvement #1 vs Impeccable (single-element only).

import { WISP_UI_DATA_ATTRIBUTE } from "./constants.js";
import type {
  MultiSelectModule,
  PickResult,
} from "../contracts/browser.js";

const SELECTED_ATTR = "data-wisp-selected";

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
    `[${SELECTED_ATTR}="${CSS.escape(id)}"]`,
  );
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

    // Toggle: if already selected (by SELECTED_ATTR presence), remove.
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

  // ESC clears the whole selection.
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
    document.removeEventListener("click", handleClick, true);
    document.removeEventListener("keydown", handleKey, true);
    // Clean any leftover decorations.
    const all = document.querySelectorAll(`[${SELECTED_ATTR}]`);
    for (const el of Array.from(all)) undecorate(el);
  };
}

// ---------------------------------------------------------------------------
// createMultiSelect — in-memory tracker that backs `MultiSelectModule`.
// ---------------------------------------------------------------------------

export function createMultiSelect(): MultiSelectModule {
  const items = new Map<string, PickResult>();

  return {
    add(target: PickResult): void {
      items.set(target.id, target);
      // Best-effort visual decoration; ignored if selector no longer resolves.
      try {
        const el = document.querySelector(target.selector);
        if (el !== null) decorate(el, target.id);
      } catch {
        /* ignore */
      }
    },
    remove(targetId: string): void {
      items.delete(targetId);
      const el = findDecoratedFor(targetId);
      if (el !== null) undecorate(el);
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
    },
  };
}
