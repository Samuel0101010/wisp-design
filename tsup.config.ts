import { defineConfig } from "tsup";

// Two-bundle build:
//   1. CLI bundle (Node ESM, src/index.ts → dist/index.js).
//      `clean: true` wipes dist first; runs before the browser bundle in
//      this array so the browser-side `clean: false` is safe.
//   2. Browser bundle (IIFE, src/browser/index.ts → dist/live.js).
//      Served by the bridge as `GET /live.js`. Budget 95 kB minified (bumped
//      from the original 50 kB after a11y-radar + morph-slider; enforced by
//      tests/browser/bundle-size.test.ts);
//      no runtime deps; exposed on `window.WispDesign`. `noExternal: [/.*/]`
//      forces every import to be inlined so nothing leaks to `require()`
//      at runtime.

export default defineConfig([
  {
    entry: {
      index: "src/index.ts",
      // Phase 4 agent runners — emitted as separate ESM modules so the
      // dispatcher's `await import("./agent/poll-loop.js")` resolves at
      // runtime against `dist/agent/*.js`. The indirect-string-import in
      // src/index.ts prevents tsup from inlining them into index.js.
      "agent/poll-loop": "src/agent/poll-loop.ts",
      "agent/skills-index": "src/agent/skills-index.ts",
      "agent/sync": "src/agent/sync.ts",
      // Phase 5 — verification-gate. `agent/audit` is the CLI entry the
      // top-level dispatcher lazy-loads via `./agent/audit.js`. The verify
      // gate + anti-slop linter are emitted as separate ESM modules so the
      // Stop-hook dispatcher can dynamic-import `../verify/anti-slop-linter.js`
      // directly (skipping orchestrator cost on the p99 < 100ms hot path).
      "agent/audit": "src/agent/audit.ts",
      "verify/anti-slop-linter": "src/verify/anti-slop-linter.ts",
      "verify/gate": "src/verify/gate.ts",
      "verify/a11y-axe": "src/verify/a11y-axe.ts",
      "verify/console-scan": "src/verify/console-scan.ts",
      "verify/tab-order": "src/verify/tab-order.ts",
      "verify/reduced-motion": "src/verify/reduced-motion.ts",
      "verify/multi-viewport": "src/verify/multi-viewport.ts",
      // Phase 6 — session-replay, history CLI, policy-proposal. Same
      // lazy-load pattern as Phase 4/5: src/index.ts dynamic-imports each
      // entry by its relative dist path.
      "session/logger": "src/session/logger.ts",
      "session/replay": "src/session/replay.ts",
      "agent/history": "src/agent/history.ts",
      "agent/policy": "src/agent/policy.ts",
      // Phase 6 — Improvements #3, #6, #11. component-detect runs before each
      // variant generation; structure-variant-mode generates JSX-subtree
      // replacements under `--structural`; morph interpolates between two
      // accepted variants for slider-driven blends.
      "agent/component-detect": "src/agent/component-detect.ts",
      "agent/morph": "src/agent/morph.ts",
      "source/structure-variant-mode": "src/source/structure-variant-mode.ts",
      // Phase 7 — `live` and `init` CLI runners. Skeleton + scaffolding live
      // in src/agent/{live,init}.ts; contracts in src/contracts/{live,init}.ts.
      "agent/live": "src/agent/live.ts",
      "agent/init": "src/agent/init.ts",
      // Phase 7.9 — headless claude invocation wrapper. Spawns `claude -p`
      // for each `generating` event so the live daemon delivers real LLM
      // variants without requiring an interactive Claude session.
      "agent/claude-invoke": "src/agent/claude-invoke.ts",
    },
    format: ["esm"],
    target: "node20",
    platform: "node",
    outDir: "dist",
    clean: true,
    sourcemap: true,
    dts: false,
    splitting: false,
    shims: false,
    minify: false,
    // Optional-deps must stay external so the bundler doesn't try to inline
    // them. They are resolved at runtime via `await import("playwright")`
    // / `await import("pixelmatch")` with a try/catch in the verify modules.
    // `axe-core` and `jsdom` are regular deps but still kept external —
    // bundling them inflates the CLI bundle and breaks their internal
    // dynamic requires.
    external: ["playwright", "playwright-core", "pixelmatch", "axe-core", "jsdom"],
    banner: { js: "#!/usr/bin/env node" },
  },
  {
    entry: { live: "src/browser/index.ts" },
    format: ["iife"],
    target: "es2020",
    platform: "browser",
    outDir: "dist",
    clean: false,
    sourcemap: true,
    dts: false,
    splitting: false,
    shims: false,
    minify: true,
    globalName: "WispDesign",
    noExternal: [/.*/],
    // Strip the `.global` infix tsup appends to IIFE bundles by default
    // — the bridge serves this as plain `/live.js`. Without this override
    // the output would be `dist/live.global.js`.
    outExtension: () => ({ js: ".js" }),
    banner: {
      js: "/*! wisp-design live.js v0.11.0-prerelease — MIT */",
    },
  },
]);
