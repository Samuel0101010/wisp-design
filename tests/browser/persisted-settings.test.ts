// wisp-design — Phase 7.13 persisted-settings tests.
//
// localStorage-backed default-variant-count persistence. Failure path must be
// graceful (no throws) when storage is unavailable, throws on write, or holds
// a malformed value.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DEVIATION_DEFAULT,
  DEVIATION_MAX,
  DEVIATION_MIN,
  _internals,
  readDeviation,
  readVariantCount,
  writeDeviation,
  writeVariantCount,
} from "../../src/browser/persisted-settings.js";

const KEY = _internals.STORAGE_KEY_VARIANT_COUNT;

// Tiny in-memory localStorage stub for the happy paths.
function installMemoryStorage(): { read: () => Record<string, string>; clear: () => void } {
  const store: Record<string, string> = {};
  // jsdom may already define this; we re-assign for clarity.
  globalThis.localStorage = {
    getItem: (k: string) => (k in store ? store[k]! : null),
    setItem: (k: string, v: string) => {
      store[k] = String(v);
    },
    removeItem: (k: string) => {
      delete store[k];
    },
    clear: () => {
      for (const k of Object.keys(store)) delete store[k];
    },
    key: (i: number) => Object.keys(store)[i] ?? null,
    get length() {
      return Object.keys(store).length;
    },
  } as Storage;
  return {
    read: () => ({ ...store }),
    clear: () => {
      for (const k of Object.keys(store)) delete store[k];
    },
  };
}

describe("persisted-settings — readVariantCount", () => {
  let mem: { read: () => Record<string, string>; clear: () => void };

  beforeEach(() => {
    mem = installMemoryStorage();
  });
  afterEach(() => {
    mem.clear();
    // @ts-expect-error
    delete globalThis.localStorage;
  });

  it("returns fallback when storage is empty", () => {
    expect(readVariantCount(5)).toBe(5);
  });

  it("returns DEFAULT (3) when no fallback and storage empty", () => {
    expect(readVariantCount()).toBe(3);
  });

  it("returns the persisted value when written prior", () => {
    writeVariantCount(8);
    expect(readVariantCount(3)).toBe(8);
  });

  it("clamps malformed string to fallback", () => {
    // directly poke storage
    globalThis.localStorage.setItem(KEY, "not-a-number");
    expect(readVariantCount(5)).toBe(5);
  });

  it("clamps over-range to 8", () => {
    writeVariantCount(99);
    expect(readVariantCount(3)).toBe(8);
  });

  it("clamps under-range to 1", () => {
    writeVariantCount(0);
    expect(readVariantCount(3)).toBe(1);
  });

  it("rounds non-integers", () => {
    writeVariantCount(3.7);
    expect(readVariantCount(3)).toBe(4);
  });
});

describe("persisted-settings — graceful failure", () => {
  it("returns fallback when localStorage is undefined", () => {
    // @ts-expect-error
    delete globalThis.localStorage;
    expect(readVariantCount(7)).toBe(7);
    // write is a no-op (must not throw)
    expect(() => writeVariantCount(5)).not.toThrow();
  });

  it("returns fallback when getItem throws", () => {
    globalThis.localStorage = {
      getItem: () => {
        throw new Error("strict-mode");
      },
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
      key: () => null,
      length: 0,
    } as Storage;
    expect(readVariantCount(5)).toBe(5);
    // @ts-expect-error
    delete globalThis.localStorage;
  });

  it("write does not throw when setItem rejects (quota)", () => {
    globalThis.localStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
      removeItem: vi.fn(),
      clear: vi.fn(),
      key: () => null,
      length: 0,
    } as Storage;
    expect(() => writeVariantCount(5)).not.toThrow();
    // @ts-expect-error
    delete globalThis.localStorage;
  });
});

describe("persisted-settings — deviation (Phase 7.15)", () => {
  let mem: { read: () => Record<string, string>; clear: () => void };

  beforeEach(() => {
    mem = installMemoryStorage();
  });
  afterEach(() => {
    mem.clear();
    // @ts-expect-error
    delete globalThis.localStorage;
  });

  it("DEVIATION constants match spec (1..5, default 3)", () => {
    expect(DEVIATION_MIN).toBe(1);
    expect(DEVIATION_MAX).toBe(5);
    expect(DEVIATION_DEFAULT).toBe(3);
  });

  it("returns DEFAULT (3) when storage empty", () => {
    expect(readDeviation()).toBe(3);
  });

  it("returns fallback when storage empty", () => {
    expect(readDeviation(4)).toBe(4);
  });

  it("persists and reads back integer values 1..5", () => {
    for (const n of [1, 2, 3, 4, 5]) {
      writeDeviation(n);
      expect(readDeviation()).toBe(n);
    }
  });

  it("clamps over-range writes to MAX (5)", () => {
    writeDeviation(99);
    expect(readDeviation()).toBe(5);
  });

  it("clamps under-range writes to MIN (1)", () => {
    writeDeviation(0);
    expect(readDeviation()).toBe(1);
    writeDeviation(-5);
    expect(readDeviation()).toBe(1);
  });

  it("rounds non-integers", () => {
    writeDeviation(2.8);
    expect(readDeviation()).toBe(3);
    writeDeviation(4.2);
    expect(readDeviation()).toBe(4);
  });

  it("malformed string in storage falls back to default", () => {
    // directly poke storage
    globalThis.localStorage.setItem(_internals.STORAGE_KEY_DEVIATION, "not-a-number");
    expect(readDeviation()).toBe(3);
    expect(readDeviation(2)).toBe(2);
  });

  it("uses a separate storage key from variantCount", () => {
    writeVariantCount(5);
    writeDeviation(2);
    expect(mem.read()).toEqual({
      "wisp-design:variantCount": "5",
      "wisp-design:deviation": "2",
    });
  });
});

describe("persisted-settings — deviation graceful failure", () => {
  it("returns fallback when localStorage is undefined", () => {
    // @ts-expect-error
    delete globalThis.localStorage;
    expect(readDeviation(4)).toBe(4);
    expect(() => writeDeviation(2)).not.toThrow();
  });

  it("write does not throw on quota exceeded", () => {
    globalThis.localStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
      removeItem: () => undefined,
      clear: () => undefined,
      key: () => null,
      length: 0,
    } as Storage;
    expect(() => writeDeviation(3)).not.toThrow();
    // @ts-expect-error
    delete globalThis.localStorage;
  });
});

describe("persisted-settings — round-trip semantics", () => {
  let mem: { read: () => Record<string, string>; clear: () => void };

  beforeEach(() => {
    mem = installMemoryStorage();
  });
  afterEach(() => {
    mem.clear();
    // @ts-expect-error
    delete globalThis.localStorage;
  });

  it("write then read returns the same value", () => {
    for (const n of [1, 3, 5, 8]) {
      writeVariantCount(n);
      expect(readVariantCount()).toBe(n);
    }
  });

  it("storage key is namespaced (wisp-design:variantCount)", () => {
    writeVariantCount(5);
    expect(mem.read()).toEqual({ "wisp-design:variantCount": "5" });
  });
});
