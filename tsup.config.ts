import { defineConfig } from "tsup";

// Two-bundle build:
//   1. CLI bundle (Node ESM, src/index.ts → dist/index.js).
//      `clean: true` wipes dist first; runs before the browser bundle in
//      this array so the browser-side `clean: false` is safe.
//   2. Browser bundle (IIFE, src/browser/index.ts → dist/live.js).
//      Served by the bridge as `GET /live.js`. Must stay < 50 kB minified;
//      no runtime deps; exposed on `window.WispDesign`. `noExternal: [/.*/]`
//      forces every import to be inlined so nothing leaks to `require()`
//      at runtime.

export default defineConfig([
  {
    entry: { index: "src/index.ts" },
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
      js: "/*! wisp-design live.js v0.3.0-prerelease — MIT */",
    },
  },
]);
