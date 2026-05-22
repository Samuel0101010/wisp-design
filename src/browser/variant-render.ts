// wisp-design — Variant rendering via CSS @scope (Phase 2).
//
// For each target node:
//   1. Remember the original parent + nextSibling so teardown can restore the
//      DOM byte-equivalent (Phase-3 carbonize relies on this).
//   2. Build a host wrapper `<div data-wisp-variants-host="<targetId>">` with
//      N sibling `<div data-wisp-variant="i">` clones. Sibling 0 = original
//      node MOVED in (not cloned — preserves event listeners on the live tree
//      for the most realistic "I accept this look" preview). Siblings 1..N-1
//      are deep clones.
//   3. Inject one `<style data-wisp-css="<sessionId>">` block carrying
//      `@scope ([data-wisp-variant="i"]) { … variant.css … }` per variant.
//   4. `setActive(i)` flips the `hidden` attribute on the siblings so only
//      one is visible at a time.
//   5. `teardown` reverses all three steps.
//
// We deliberately do NOT use Shadow DOM — Tailwind / shadcn / component-lib
// utility classes have to keep applying to clones.

import {
  WISP_CSS_DATA_ATTRIBUTE,
  WISP_SESSION_DATA_ATTRIBUTE,
  WISP_UI_DATA_ATTRIBUTE,
  WISP_VARIANT_DATA_ATTRIBUTE,
} from "./constants.js";
import type {
  PickResult,
  SanitizeModule,
  Variant,
  VariantRenderHandle,
  VariantRenderModule,
} from "../contracts/browser.js";

interface MountRecord {
  targetId: string;
  originalNode: Element;
  originalParent: Node;
  originalNextSibling: Node | null;
  host: HTMLElement;
  siblings: HTMLElement[];
  styleEl: HTMLStyleElement;
}

// ---------------------------------------------------------------------------
// CSS assembly — sanitises variant.css line-by-line for the worst offenders
// (it never escapes the @scope rule, so the host can't escape variant
// isolation via a stray `}`).
// ---------------------------------------------------------------------------

const FORBIDDEN_CSS_SUBSTRINGS = ["</style", "<script", "expression(", "@import"];

function sanitiseVariantCss(css: string): string {
  let out = css;
  for (const bad of FORBIDDEN_CSS_SUBSTRINGS) {
    const re = new RegExp(escapeRe(bad), "gi");
    out = out.replace(re, "/* removed */");
  }
  // Strip carriage-returns to simplify the @scope wrapping below.
  return out.replace(/\r\n/g, "\n");
}

function escapeRe(s: string): string {
  return s.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
}

function assembleStyleBlock(variants: Variant[]): string {
  const parts: string[] = [];
  for (let i = 0; i < variants.length; i += 1) {
    const v = variants[i];
    if (!v) continue;
    const safe = sanitiseVariantCss(v.css);
    parts.push(`@scope ([${WISP_VARIANT_DATA_ATTRIBUTE}="${i}"]) {\n${safe}\n}`);
  }
  return parts.join("\n\n");
}

// ---------------------------------------------------------------------------
// renderVariants — main entry. Mounts one target with N variants.
// ---------------------------------------------------------------------------

export interface RenderVariantsOptions {
  target: PickResult;
  variants: Variant[];
  sessionId: string;
  sanitize: SanitizeModule;
}

export function renderVariants(
  opts: RenderVariantsOptions,
): VariantRenderHandle {
  const { target, variants, sessionId } = opts;
  if (variants.length === 0) {
    throw new Error("renderVariants requires at least one variant");
  }

  // Resolve the target via its selector. We accept the selector by
  // construction (we built it in picker.ts) but still gate through the
  // SanitizeModule for defence-in-depth.
  const selCheck = opts.sanitize.trustedSelector(target.selector);
  if (!selCheck.ok) {
    throw new Error(`renderVariants: rejected selector — ${selCheck.reason.message}`);
  }

  const originalNode = document.querySelector(selCheck.selector);
  if (originalNode === null) {
    throw new Error(`renderVariants: target not found — ${target.selector}`);
  }
  const originalParent = originalNode.parentNode;
  if (originalParent === null) {
    throw new Error("renderVariants: target has no parent");
  }
  const originalNextSibling = originalNode.nextSibling;

  // Build the wrapper.
  const host = document.createElement("div");
  host.setAttribute(WISP_UI_DATA_ATTRIBUTE, "variants-host");
  host.setAttribute("data-wisp-variants-host", target.id);

  const siblings: HTMLElement[] = [];

  // Variant 0 takes the live original node (move, not clone).
  const live0 = document.createElement("div");
  live0.setAttribute(WISP_VARIANT_DATA_ATTRIBUTE, "0");
  live0.setAttribute(WISP_UI_DATA_ATTRIBUTE, "variant-host");
  // Move the original into the new sibling.
  originalParent.insertBefore(host, originalNextSibling);
  host.appendChild(live0);
  live0.appendChild(originalNode);
  siblings.push(live0);

  // Remaining variants: deep clones of the original.
  for (let i = 1; i < variants.length; i += 1) {
    const sib = document.createElement("div");
    sib.setAttribute(WISP_VARIANT_DATA_ATTRIBUTE, String(i));
    sib.setAttribute(WISP_UI_DATA_ATTRIBUTE, "variant-host");
    // Deep clone preserving subtree styles.
    sib.appendChild(originalNode.cloneNode(true));
    host.appendChild(sib);
    siblings.push(sib);
  }

  // Inject the @scope style block.
  const styleEl = document.createElement("style");
  styleEl.setAttribute(WISP_CSS_DATA_ATTRIBUTE, sessionId);
  styleEl.setAttribute(WISP_SESSION_DATA_ATTRIBUTE, sessionId);
  styleEl.setAttribute(WISP_UI_DATA_ATTRIBUTE, "variant-styles");
  styleEl.textContent = assembleStyleBlock(variants);
  document.head.appendChild(styleEl);

  // Apply the initial cssVars to each sibling's @scope root.
  for (let i = 0; i < variants.length; i += 1) {
    const v = variants[i];
    const sib = siblings[i];
    if (!v || !sib) continue;
    for (const [name, value] of Object.entries(v.cssVars)) {
      const check = opts.sanitize.trustedCssVar(name, value);
      if (check.ok) {
        sib.style.setProperty(check.varName, check.value);
      }
    }
  }

  // Initial state: variant 0 visible.
  let activeIndex = 0;
  applyVisibility(siblings, activeIndex);

  const record: MountRecord = {
    targetId: target.id,
    originalNode,
    originalParent,
    originalNextSibling,
    host,
    siblings,
    styleEl,
  };

  return {
    setActive(index: number): void {
      if (index < 0 || index >= record.siblings.length) return;
      activeIndex = index;
      applyVisibility(record.siblings, activeIndex);
    },
    setParamOverride(varName: string, value: string): void {
      const check = opts.sanitize.trustedCssVar(varName, value);
      if (!check.ok) {
        if (typeof console !== "undefined") {
          console.warn("[wisp-design] rejected param override", check.reason);
        }
        return;
      }
      const sib = record.siblings[activeIndex];
      if (sib) sib.style.setProperty(check.varName, check.value);
    },
    teardown(): void {
      // 1. Move the original node back to its parent before removing the host.
      try {
        record.originalParent.insertBefore(
          record.originalNode,
          record.originalNextSibling,
        );
      } catch {
        // If the parent is gone, fall back to body — we still want listeners
        // to survive even if the DOM moved.
        document.body.appendChild(record.originalNode);
      }
      // 2. Remove the host + style block.
      if (record.host.parentNode) {
        record.host.parentNode.removeChild(record.host);
      }
      if (record.styleEl.parentNode) {
        record.styleEl.parentNode.removeChild(record.styleEl);
      }
    },
  };
}

function applyVisibility(siblings: HTMLElement[], activeIndex: number): void {
  for (let i = 0; i < siblings.length; i += 1) {
    const sib = siblings[i];
    if (!sib) continue;
    if (i === activeIndex) {
      sib.removeAttribute("hidden");
      sib.style.display = "";
    } else {
      sib.setAttribute("hidden", "");
      sib.style.display = "none";
    }
  }
}

// ---------------------------------------------------------------------------
// Multi-target wrapper — index.ts uses this when CONFIGURING produced N>1
// targets. Each target gets its own VariantRenderHandle; setActive applies
// to all of them in lockstep so variant i is consistent across the set.
// ---------------------------------------------------------------------------

export interface RenderManyOptions {
  targets: PickResult[];
  variants: Variant[];
  sessionId: string;
  sanitize: SanitizeModule;
}

export interface ManyHandle {
  setActive(index: number): void;
  getActiveScopeRoot(): HTMLElement | null;
  setParamOverride(varName: string, value: string): void;
  teardown(): void;
}

export function renderVariantsMany(opts: RenderManyOptions): ManyHandle {
  const handles: Array<{ targetId: string; h: VariantRenderHandle; scopeRoots: HTMLElement[] }> = [];
  for (const t of opts.targets) {
    const h = renderVariants({
      target: t,
      variants: opts.variants,
      sessionId: opts.sessionId,
      sanitize: opts.sanitize,
    });
    // Collect scope roots for this target.
    const roots: HTMLElement[] = [];
    const host = document.querySelector<HTMLElement>(
      `[data-wisp-variants-host="${cssEscape(t.id)}"]`,
    );
    if (host) {
      for (const sib of Array.from(host.children)) {
        if (sib instanceof HTMLElement) roots.push(sib);
      }
    }
    handles.push({ targetId: t.id, h, scopeRoots: roots });
  }

  let activeIndex = 0;

  return {
    setActive(index: number): void {
      activeIndex = index;
      for (const { h } of handles) h.setActive(index);
    },
    getActiveScopeRoot(): HTMLElement | null {
      const first = handles[0];
      if (!first) return null;
      return first.scopeRoots[activeIndex] ?? null;
    },
    setParamOverride(varName: string, value: string): void {
      for (const { h } of handles) h.setParamOverride(varName, value);
    },
    teardown(): void {
      for (const { h } of handles) h.teardown();
    },
  };
}

function cssEscape(s: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(s);
  }
  return s.replace(/["\\]/g, "\\$&");
}

// ---------------------------------------------------------------------------
// VariantRenderModule export — single-target contract surface.
// The runtime entry uses `renderVariantsMany` for multi-select.
// ---------------------------------------------------------------------------

export function makeVariantRenderModule(
  sanitize: SanitizeModule,
): VariantRenderModule {
  return {
    mount({ target, variants, sessionId }) {
      return renderVariants({ target, variants, sessionId, sanitize });
    },
  };
}
