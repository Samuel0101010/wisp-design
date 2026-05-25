// wisp-design — Browser-side settings persistence (Phase 7.13).
//
// localStorage-backed user-preference layer for the floating-bar settings
// panel. Initial use case: Default Variant Count survives page reload.
//
// Failure mode: graceful no-op. localStorage may throw on:
//   - Strict same-origin policies (file:// or sandboxed iframes)
//   - Quota exceeded
//   - Disabled by browser privacy mode
// In all cases we fall back to the in-memory default. The plugin must still
// work when storage is unavailable.

import { DEFAULT_VARIANT_COUNT } from "./constants.js";

const STORAGE_KEY_VARIANT_COUNT = "wisp-design:variantCount";

/** Bounds-checked variant count: 1..8, integer. */
function clampVariantCount(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_VARIANT_COUNT;
  const r = Math.round(n);
  if (r < 1) return 1;
  if (r > 8) return 8;
  return r;
}

function safeStorage(): Storage | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    // Some sandboxed contexts throw on the `localStorage` access itself.
    return null;
  }
}

export function readVariantCount(fallback?: number): number {
  const fb = clampVariantCount(fallback ?? DEFAULT_VARIANT_COUNT);
  const ls = safeStorage();
  if (ls === null) return fb;
  try {
    const raw = ls.getItem(STORAGE_KEY_VARIANT_COUNT);
    if (raw === null || raw === "") return fb;
    const n = Number(raw);
    if (!Number.isFinite(n)) return fb;
    return clampVariantCount(n);
  } catch {
    return fb;
  }
}

export function writeVariantCount(n: number): void {
  const ls = safeStorage();
  if (ls === null) return;
  try {
    ls.setItem(STORAGE_KEY_VARIANT_COUNT, String(clampVariantCount(n)));
  } catch {
    // Quota or strict mode — drop. Settings panel will keep its in-memory
    // value for the current page lifetime regardless.
  }
}

// Exported for the test suite to reset state between cases.
export const _internals = {
  STORAGE_KEY_VARIANT_COUNT,
  clampVariantCount,
};
