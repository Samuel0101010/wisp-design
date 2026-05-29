import { defineConfig } from "vitest/config";

// Per-file environment override: tests under tests/browser/** run against
// jsdom (DOM globals available); everything else stays in pure Node.
// Picker/state-machine/sanitize unit tests need a DOM; bridge + source
// tests do not, and would pay the jsdom boot cost for nothing.
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    environmentMatchGlobs: [["tests/browser/**", "jsdom"]],
    globals: false,
    // Several integration tests do real work that is slow under full parallel
    // load on Windows: launching headless chromium (multi-viewport, a11y-axe),
    // spawning `node dist/index.js` subprocesses (audit/stop-hook), and deep
    // 200-file filesystem scans (component-detect). The 5 s default is too
    // tight for those under contention — they pass in isolation but can exceed
    // 5 s when 60+ test files run concurrently. Widen the ceiling so a genuine
    // hang is still caught while load-induced jitter does not flake the suite.
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
