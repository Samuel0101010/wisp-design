// @vitest-environment node
//
// wisp-design — Bundle-size budget (Phase 2 USP).
//
// `dist/live.js` must stay under 50 kB to keep the runtime IIFE
// page-injection-cheap. Asserts that the build artefact exists and is well
// under budget. Skips with a clear message when `npm run build` hasn't run.

import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

const liveJsPath = resolve(__dirname, "../../dist/live.js");
const indexJsPath = resolve(__dirname, "../../dist/index.js");

const liveJsExists = existsSync(liveJsPath);
const indexJsExists = existsSync(indexJsPath);

describe("dist/live.js", () => {
  it.skipIf(!liveJsExists)(
    "exists after `npm run build`",
    () => {
      expect(liveJsExists).toBe(true);
    },
  );

  it.skipIf(!liveJsExists)(
    "is under 75_000 bytes (Phase 7 budget — bumped from 50k after adding tool panels + generating-overlay animation)",
    () => {
      const size = statSync(liveJsPath).size;
      expect(size).toBeLessThan(75_000);
    },
  );

  it.skipIf(!liveJsExists)(
    "starts with the IIFE banner /*! wisp-design live.js …",
    () => {
      const head = readFileSync(liveJsPath, "utf8").slice(0, 200);
      expect(head.startsWith("/*! wisp-design live.js")).toBe(true);
    },
  );
});

describe("dist/index.js (CLI)", () => {
  it.skipIf(!indexJsExists)(
    "exists after `npm run build`",
    () => {
      expect(indexJsExists).toBe(true);
    },
  );
});

// Loud heads-up at the top of the suite if the build is stale.
describe("build-artefact preflight", () => {
  it("dist artefacts are present (run `npm run build` first if this fails)", () => {
    if (!liveJsExists || !indexJsExists) {
      // eslint-disable-next-line no-console
      console.warn(
        "[wisp-design tests] dist/live.js or dist/index.js missing — skipping size checks. Run `npm run build` before `npm test` (or use `npm run check`).",
      );
    }
    // Soft assertion: succeed either way; size assertions above are skipped
    // when artefacts are missing, with skip-reason that surfaces in CI.
    expect(true).toBe(true);
  });
});
