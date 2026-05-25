// Phase 7.16 — variant-morph-slider tests.

/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach } from "vitest";
import {
  buildDiff,
  interpolateAt,
  mountMorphSlider,
} from "../../src/browser/variant-morph-slider.js";

describe("variant-morph-slider / buildDiff", () => {
  it("emits no diffs when both sides empty", () => {
    expect(buildDiff({}, {})).toEqual([]);
  });

  it("emits a diff for every union name (A only / B only / both)", () => {
    const out = buildDiff(
      { "--a": "10px", "--shared": "1rem" },
      { "--b": "20px", "--shared": "2rem" },
    );
    expect(out.map((d) => d.name).sort()).toEqual(["--a", "--b", "--shared"]);
  });

  it("marks interpolatable=true when units match + known unit", () => {
    const out = buildDiff({ "--p": "10px" }, { "--p": "20px" });
    expect(out[0]?.interpolatable).toBe(true);
    expect(out[0]?.unit).toBe("px");
  });

  it("marks interpolatable=false when units differ", () => {
    const out = buildDiff({ "--p": "10px" }, { "--p": "1rem" });
    expect(out[0]?.interpolatable).toBe(false);
  });

  it("marks interpolatable=false for non-numeric values (colors, idents)", () => {
    const out = buildDiff({ "--c": "red" }, { "--c": "blue" });
    expect(out[0]?.interpolatable).toBe(false);
  });

  it("outputs are sorted by name (deterministic)", () => {
    const out = buildDiff({ "--z": "1", "--a": "1" }, { "--m": "1" });
    expect(out.map((d) => d.name)).toEqual(["--a", "--m", "--z"]);
  });
});

describe("variant-morph-slider / interpolateAt", () => {
  it("t=0 returns A values", () => {
    const diffs = buildDiff({ "--p": "10px" }, { "--p": "20px" });
    expect(interpolateAt(diffs, 0)).toEqual({ "--p": "10px" });
  });

  it("t=1 returns B values", () => {
    const diffs = buildDiff({ "--p": "10px" }, { "--p": "20px" });
    expect(interpolateAt(diffs, 1)).toEqual({ "--p": "20px" });
  });

  it("t=0.5 returns midpoint for interpolatable", () => {
    const diffs = buildDiff({ "--p": "10px" }, { "--p": "20px" });
    expect(interpolateAt(diffs, 0.5)).toEqual({ "--p": "15px" });
  });

  it("snaps non-interpolatable at t<0.5 to A", () => {
    const diffs = buildDiff({ "--c": "red" }, { "--c": "blue" });
    expect(interpolateAt(diffs, 0.49)).toEqual({ "--c": "red" });
  });

  it("snaps non-interpolatable at t>=0.5 to B", () => {
    const diffs = buildDiff({ "--c": "red" }, { "--c": "blue" });
    expect(interpolateAt(diffs, 0.5)).toEqual({ "--c": "blue" });
  });

  it("clamps t out of [0,1]", () => {
    const diffs = buildDiff({ "--p": "10px" }, { "--p": "20px" });
    expect(interpolateAt(diffs, -1)).toEqual({ "--p": "10px" });
    expect(interpolateAt(diffs, 2)).toEqual({ "--p": "20px" });
  });

  it("rounds to 4 decimal places to avoid scientific notation", () => {
    const diffs = buildDiff({ "--p": "1" }, { "--p": "1.000000001" });
    const result = interpolateAt(diffs, 0.5)["--p"]!;
    expect(result).toMatch(/^1(\.\d{1,4})?$/);
  });

  it("formats integer results without decimals", () => {
    const diffs = buildDiff({ "--p": "10" }, { "--p": "20" });
    expect(interpolateAt(diffs, 0.5)).toEqual({ "--p": "15" });
  });

  it("handles rem unit", () => {
    const diffs = buildDiff({ "--p": "1rem" }, { "--p": "2rem" });
    expect(interpolateAt(diffs, 0.5)).toEqual({ "--p": "1.5rem" });
  });
});

describe("variant-morph-slider / mountMorphSlider", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    document.body.innerHTML = "";
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  it("mounts a slider when variants share at least one interpolatable var", () => {
    const calls: Array<Record<string, string>> = [];
    const h = mountMorphSlider({
      container,
      variantA: { id: "v1", cssVars: { "--p": "10px" } },
      variantB: { id: "v2", cssVars: { "--p": "20px" } },
      onMorph: (v) => calls.push(v),
    });
    const slider = container.querySelector<HTMLInputElement>(
      `input[data-wisp-ui="morph-slider"]`,
    );
    expect(slider).not.toBeNull();
    expect(slider?.type).toBe("range");
    expect(slider?.value).toBe("0");
    h.unmount();
  });

  it("renders an empty-state hint when no interpolatable vars exist", () => {
    mountMorphSlider({
      container,
      variantA: { id: "v1", cssVars: { "--c": "red" } },
      variantB: { id: "v2", cssVars: { "--c": "blue" } },
      onMorph: () => undefined,
    });
    const empty = container.querySelector(`[data-wisp-ui="morph-empty"]`);
    expect(empty?.textContent).toContain("no numeric parameters");
    const slider = container.querySelector(`input[data-wisp-ui="morph-slider"]`);
    expect(slider).toBeNull();
  });

  it("renders an empty-state hint when both cssVars are {}", () => {
    mountMorphSlider({
      container,
      variantA: { id: "v1", cssVars: {} },
      variantB: { id: "v2", cssVars: {} },
      onMorph: () => undefined,
    });
    const empty = container.querySelector(`[data-wisp-ui="morph-empty"]`);
    expect(empty?.textContent).toContain("no shared parameters");
  });

  it("calls onMorph with interpolated vars when the slider is dragged", () => {
    const calls: Array<Record<string, string>> = [];
    mountMorphSlider({
      container,
      variantA: { id: "v1", cssVars: { "--p": "10px" } },
      variantB: { id: "v2", cssVars: { "--p": "20px" } },
      onMorph: (v) => calls.push(v),
    });
    const slider = container.querySelector<HTMLInputElement>(
      `input[data-wisp-ui="morph-slider"]`,
    )!;
    slider.value = "50";
    slider.dispatchEvent(new Event("input"));
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({ "--p": "15px" });
  });

  it("unmount() removes the slider DOM", () => {
    const h = mountMorphSlider({
      container,
      variantA: { id: "v1", cssVars: { "--p": "10px" } },
      variantB: { id: "v2", cssVars: { "--p": "20px" } },
      onMorph: () => undefined,
    });
    expect(container.querySelector(`[data-wisp-ui="morph-row"]`)).not.toBeNull();
    h.unmount();
    expect(container.querySelector(`[data-wisp-ui="morph-row"]`)).toBeNull();
  });

  it("reset() rebuilds diff for new variant pair", () => {
    const calls: Array<Record<string, string>> = [];
    const h = mountMorphSlider({
      container,
      variantA: { id: "v1", cssVars: { "--p": "10px" } },
      variantB: { id: "v2", cssVars: { "--p": "20px" } },
      onMorph: (v) => calls.push(v),
    });
    h.reset({
      variantA: { id: "v3", cssVars: { "--p": "100px" } },
      variantB: { id: "v4", cssVars: { "--p": "200px" } },
    });
    const slider = container.querySelector<HTMLInputElement>(
      `input[data-wisp-ui="morph-slider"]`,
    )!;
    slider.value = "50";
    slider.dispatchEvent(new Event("input"));
    expect(calls[0]).toEqual({ "--p": "150px" });
  });

  it("aria-label describes the variant pair", () => {
    mountMorphSlider({
      container,
      variantA: { id: "elegant", cssVars: { "--p": "10px" } },
      variantB: { id: "subtle", cssVars: { "--p": "20px" } },
      onMorph: () => undefined,
    });
    const slider = container.querySelector<HTMLInputElement>(
      `input[data-wisp-ui="morph-slider"]`,
    );
    expect(slider?.getAttribute("aria-label")).toContain("elegant");
    expect(slider?.getAttribute("aria-label")).toContain("subtle");
  });
});
