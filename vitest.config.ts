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
  },
});
