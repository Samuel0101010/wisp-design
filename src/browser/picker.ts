// wisp-design — DOM picker (Phase 2 + Phase 7 UX improvements).
//
// Implements `PickerModule` from src/contracts/browser.ts:
//   - `pickable(el, opts)`  predicate per docs/browser-runtime.md
//   - `buildPickResult(el)` flat snapshot for state machine + bridge
//   - `arm(handlers)`       installs pointermove + click listeners, returns
//                           an unsubscribe.
//
// Phase 7 additions:
//   - Hover outline overlay (`data-wisp-ui="picker-outline"`)
//   - Element-info tooltip (`data-wisp-ui="picker-tooltip"`)
//   - buildSelector: class-aware tag-chain that locateTargetSpan can anchor on
//     (fix for #29 selector mismatch). Emits `tag.cls1.cls2.cls3` leaf segments,
//     falling back to `:nth-of-type` only when no classes. Disambiguates with
//     ancestor `#id > leaf` chain when the leaf is not unique in the document.
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
// buildSelector — class-aware tag-chain (Phase 7, fix #29).
//
// Strategy:
//   1. Walk up from el to BODY (cap 6 levels), building segments.
//   2. Each segment: `tag.cls1.cls2.cls3` (up to 3 filtered classes, sorted
//      alpha for stability). Skip wisp-* and Tailwind state-prefixed classes
//      (hover:, sm:, dark:, focus: etc.). Fall back to :nth-of-type only when
//      no usable classes.
//   3. Anchor early on an ancestor `#id` — stops the walk.
//   4. Emit leaf-only when unique via document.querySelectorAll; otherwise
//      include ancestors until unique; final fallback = full chain.
//
// The resulting selector is:
//   - A valid CSS selector (querySelectorAll works).
//   - Parseable by selectorToAnchor in wrap.ts:
//       • `#id` → `id="…"` anchor ✓
//       • starts with tag name → `<tag` literal anchor ✓
//   - More stable than nth-of-type chains across HMR re-mounts.
// ---------------------------------------------------------------------------

function isValidId(id: string): boolean {
  return /^[A-Za-z_][\w-]*$/.test(id);
}

/** Filtered class list: no wisp-* attrs, no Tailwind state-prefixed, word-chars only. */
function filteredClasses(el: Element): string[] {
  return Array.from(el.classList)
    .filter(
      (c) =>
        !c.startsWith("wisp-") &&
        !c.includes(":") &&
        /^[a-zA-Z][\w-]+$/.test(c),
    )
    .sort()
    .slice(0, 3);
}

/** nth-of-type index among parent's children sharing the same tagName. */
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

/** Build one segment for a single element (no ancestry). */
function buildSegment(el: HTMLElement): string {
  const tag = el.tagName.toLowerCase();
  const classes = filteredClasses(el);
  if (classes.length > 0) {
    return `${tag}.${classes.join(".")}`;
  }
  // nth-of-type fallback only when parent has multiple same-tag siblings.
  const parent = el.parentElement;
  if (parent) {
    const siblings = Array.from(parent.children).filter(
      (s) => s.tagName === el.tagName,
    );
    if (siblings.length > 1) {
      return `${tag}:nth-of-type(${nthOfType(el)})`;
    }
  }
  return tag;
}

export function buildSelector(el: HTMLElement): string {
  // Fast path: element itself has a clean id.
  if (el.id && isValidId(el.id)) return `#${el.id}`;

  const segments: string[] = [];
  let cur: HTMLElement | null = el;
  let anchoredOnId = false;

  while (cur && cur.tagName !== "BODY" && cur.tagName !== "HTML" && segments.length < 6) {
    // Anchor on an ancestor id — stops the walk.
    if (cur !== el && cur.id && isValidId(cur.id)) {
      segments.unshift(`#${cur.id}`);
      anchoredOnId = true;
      break;
    }
    segments.unshift(buildSegment(cur));
    cur = cur.parentElement;
  }

  if (segments.length === 0) return el.tagName.toLowerCase();

  // When anchored on an ancestor id, always return the full chain from the id
  // anchor — do not try to shorten past it (the id IS the uniqueness anchor).
  if (anchoredOnId) {
    return segments.join(" > ");
  }

  // Try progressively shorter suffixes (leaf first) until querySelector is unique.
  // This gives wrap.ts the best leaf anchor while still being unambiguous.
  const doc = el.ownerDocument ?? (typeof document !== "undefined" ? document : null);
  if (doc) {
    for (let i = segments.length - 1; i >= 0; i -= 1) {
      const candidate = segments.slice(i).join(" > ");
      try {
        if (doc.querySelectorAll(candidate).length === 1) {
          return candidate;
        }
      } catch {
        // Malformed candidate — skip.
      }
    }
  }

  return segments.join(" > ");
}

// ---------------------------------------------------------------------------
// Hover outline + tooltip (Goal 1).
//
// Both are `pointer-events: none` overlays driven by mousemove on the document.
// They are only active while the picker is armed (attachPicker returned fn
// has not been called yet). requestAnimationFrame throttles layout reads.
// ---------------------------------------------------------------------------

function getOrCreateOverlay(
  doc: Document,
  wispKind: string,
): HTMLElement {
  const existing = doc.querySelector<HTMLElement>(`[data-wisp-ui="${wispKind}"]`);
  if (existing) return existing;
  const el = doc.createElement("div");
  el.setAttribute(WISP_UI_DATA_ATTRIBUTE, wispKind);
  // Base styles applied inline — no external stylesheet required.
  Object.assign(el.style, {
    position: "fixed",
    pointerEvents: "none",
    zIndex: "2147483640",
    boxSizing: "border-box",
  });
  doc.body?.appendChild(el);
  return el;
}

function applyOutlineStyles(outline: HTMLElement): void {
  Object.assign(outline.style, {
    border: "2px solid rgb(23 23 23)",
    outlineOffset: "2px",
    background: "none",
    borderRadius: "2px",
    display: "block",
  });
}

function applyTooltipStyles(tooltip: HTMLElement): void {
  Object.assign(tooltip.style, {
    background: "rgb(23 23 23)",
    color: "#fff",
    fontSize: "11px",
    fontFamily: "ui-monospace, monospace",
    padding: "4px 8px",
    borderRadius: "4px",
    lineHeight: "1.4",
    whiteSpace: "nowrap",
    display: "block",
  });
}

function positionOutline(outline: HTMLElement, rect: DOMRect): void {
  outline.style.left = `${rect.left - 2}px`;
  outline.style.top = `${rect.top - 2}px`;
  outline.style.width = `${rect.width + 4}px`;
  outline.style.height = `${rect.height + 4}px`;
}

function positionTooltip(
  tooltip: HTMLElement,
  cursorX: number,
  cursorY: number,
): void {
  tooltip.style.left = `${cursorX + 12}px`;
  tooltip.style.top = `${cursorY + 12}px`;
}

function tooltipText(el: HTMLElement): string {
  const tag = el.tagName.toLowerCase();
  const classes = filteredClasses(el).slice(0, 2);
  const classSuffix = classes.length > 0 ? `.${classes.join(".")}` : "";
  const rect = el.getBoundingClientRect();
  const w = Math.round(rect.width);
  const h = Math.round(rect.height);
  return `${tag}${classSuffix} · ${w}×${h}`;
}

function removeOverlays(doc: Document): void {
  for (const kind of ["picker-outline", "picker-tooltip"]) {
    const el = doc.querySelector(`[data-wisp-ui="${kind}"]`);
    if (el) el.remove();
  }
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
// Installs hover-outline + element-info tooltip while active.
// ---------------------------------------------------------------------------

export interface AttachPickerOptions {
  onHover: (sel: string | null) => void;
  onPick: (result: PickResult, withMulti: boolean) => void;
  onCancel?: () => void;
  pickableOpts?: Partial<PickableOptions>;
}

export function attachPicker(opts: AttachPickerOptions): () => void {
  let lastHovered: HTMLElement | null = null;
  let rafId: number | null = null;

  const doc = typeof document !== "undefined" ? document : null;
  if (!doc) {
    // Non-browser environment (e.g. Node tests without jsdom) — no-op listeners.
    return () => { /* nothing */ };
  }

  const handleMove = (e: PointerEvent): void => {
    const el = doc.elementFromPoint(e.clientX, e.clientY);
    if (el === null || !pickable(el, opts.pickableOpts)) {
      if (lastHovered !== null) {
        lastHovered = null;
        opts.onHover(null);
      }
      // Hide overlays when hovering non-pickable.
      const outline = doc.querySelector<HTMLElement>('[data-wisp-ui="picker-outline"]');
      const tooltip = doc.querySelector<HTMLElement>('[data-wisp-ui="picker-tooltip"]');
      if (outline) outline.style.display = "none";
      if (tooltip) tooltip.style.display = "none";
      return;
    }

    const html = el as HTMLElement;

    // Update overlays — throttle via rAF.
    if (rafId !== null) cancelAnimationFrame(rafId);
    const cx = e.clientX;
    const cy = e.clientY;
    rafId = requestAnimationFrame(() => {
      rafId = null;
      const rect = html.getBoundingClientRect();

      const outline = getOrCreateOverlay(doc, "picker-outline");
      applyOutlineStyles(outline);
      positionOutline(outline, rect);

      const tooltip = getOrCreateOverlay(doc, "picker-tooltip");
      applyTooltipStyles(tooltip);
      tooltip.textContent = tooltipText(html);
      positionTooltip(tooltip, cx, cy);
    });

    if (html === lastHovered) return;
    lastHovered = html;
    opts.onHover(buildSelector(html));
  };

  const handleLeave = (): void => {
    if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
    const outline = doc.querySelector<HTMLElement>('[data-wisp-ui="picker-outline"]');
    const tooltip = doc.querySelector<HTMLElement>('[data-wisp-ui="picker-tooltip"]');
    if (outline) outline.style.display = "none";
    if (tooltip) tooltip.style.display = "none";
    lastHovered = null;
    opts.onHover(null);
  };

  const handleClick = (e: MouseEvent): void => {
    const target = e.target;
    if (!(target instanceof Element)) return;
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
  document.addEventListener("mouseleave", handleLeave, true);
  document.addEventListener("click", handleClick, true);
  document.addEventListener("keydown", handleKey, true);

  return (): void => {
    if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
    document.removeEventListener("pointermove", handleMove, true);
    document.removeEventListener("mouseleave", handleLeave, true);
    document.removeEventListener("click", handleClick, true);
    document.removeEventListener("keydown", handleKey, true);
    lastHovered = null;
    removeOverlays(doc);
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
        try {
          const el = document.querySelector(sel);
          handlers.onHover(el);
        } catch {
          handlers.onHover(null);
        }
      },
      onPick: (result, withMulti) => {
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
