// @vitest-environment node
//
// wisp-design — Constants-drift guard (Phase 2).
//
// `src/browser/constants.ts` deliberately re-declares the zod-free subset of
// `src/contracts/browser.ts` so the live.js bundle stays under 50 kB. If the
// two ever diverge, callers in `src/browser/**` will silently work against a
// stale value. This file pins them byte-equal.

import { describe, expect, it } from "vitest";

import * as contracts from "../../src/contracts/browser.js";
import * as constants from "../../src/browser/constants.js";

describe("constants ↔ contracts equivalence", () => {
  it("MIN_PICKABLE_PX matches", () => {
    expect(constants.MIN_PICKABLE_PX).toBe(contracts.MIN_PICKABLE_PX);
  });

  it("DEFAULT_VARIANT_COUNT matches", () => {
    expect(constants.DEFAULT_VARIANT_COUNT).toBe(contracts.DEFAULT_VARIANT_COUNT);
  });

  it("MAX_VARIANT_COUNT matches", () => {
    expect(constants.MAX_VARIANT_COUNT).toBe(contracts.MAX_VARIANT_COUNT);
  });

  it("MIN_VARIANT_COUNT matches", () => {
    expect(constants.MIN_VARIANT_COUNT).toBe(contracts.MIN_VARIANT_COUNT);
  });

  it("WISP_UI_DATA_ATTRIBUTE matches", () => {
    expect(constants.WISP_UI_DATA_ATTRIBUTE).toBe(contracts.WISP_UI_DATA_ATTRIBUTE);
  });

  it("WISP_VARIANT_DATA_ATTRIBUTE matches", () => {
    expect(constants.WISP_VARIANT_DATA_ATTRIBUTE).toBe(
      contracts.WISP_VARIANT_DATA_ATTRIBUTE,
    );
  });

  it("WISP_CSS_DATA_ATTRIBUTE matches", () => {
    expect(constants.WISP_CSS_DATA_ATTRIBUTE).toBe(contracts.WISP_CSS_DATA_ATTRIBUTE);
  });

  it("WISP_SESSION_DATA_ATTRIBUTE matches", () => {
    expect(constants.WISP_SESSION_DATA_ATTRIBUTE).toBe(
      contracts.WISP_SESSION_DATA_ATTRIBUTE,
    );
  });

  it("LIVE_JS_VERSION_TAG matches", () => {
    expect(constants.LIVE_JS_VERSION_TAG).toBe(contracts.LIVE_JS_VERSION_TAG);
  });

  it("FREE_TEXT_MAX_LEN matches", () => {
    expect(constants.FREE_TEXT_MAX_LEN).toBe(contracts.FREE_TEXT_MAX_LEN);
  });

  it("ANNOTATION_NOTE_MAX_LEN matches", () => {
    expect(constants.ANNOTATION_NOTE_MAX_LEN).toBe(contracts.ANNOTATION_NOTE_MAX_LEN);
  });

  it("CODE_SNIPPET_MAX_LEN matches", () => {
    expect(constants.CODE_SNIPPET_MAX_LEN).toBe(contracts.CODE_SNIPPET_MAX_LEN);
  });

  it("VARIANT_HTML_MAX_LEN matches", () => {
    expect(constants.VARIANT_HTML_MAX_LEN).toBe(contracts.VARIANT_HTML_MAX_LEN);
  });

  it("STATE_TRANSITIONS arrays are deep-equal (same length & entries in order)", () => {
    expect(constants.STATE_TRANSITIONS).toHaveLength(contracts.STATE_TRANSITIONS.length);
    expect(constants.STATE_TRANSITIONS).toEqual(contracts.STATE_TRANSITIONS);
  });
});
