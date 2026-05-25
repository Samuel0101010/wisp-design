// @vitest-environment node
//
// wisp-design — Browser state-machine tests (Phase 2).
//
// Targets src/browser/state-machine.ts. Pure-logic module — no DOM needed,
// so we override the environment to plain node for a quicker boot.

import { describe, expect, it } from "vitest";

import { createStateMachine, isValidTransition } from "../../src/browser/state-machine.js";
import { STATE_TRANSITIONS } from "../../src/browser/constants.js";
import type {
  BrowserStateEvent,
  PickResult,
  Variant,
} from "../../src/contracts/browser.js";

const target: PickResult = {
  id: "t1",
  selector: "#foo",
  tag: "div",
  rect: { x: 0, y: 0, w: 100, h: 50 },
  attributes: {},
  textPreview: "",
};

const target2: PickResult = { ...target, id: "t2", selector: "#bar" };

const variants: Variant[] = [
  { id: "v0", css: "", cssVars: {}, rationale: "a" },
  { id: "v1", css: "", cssVars: {}, rationale: "b" },
  { id: "v2", css: "", cssVars: {}, rationale: "c" },
];

describe("createStateMachine — initial state", () => {
  it("starts in { kind: 'idle' }", () => {
    const m = createStateMachine();
    expect(m.current().state).toEqual({ kind: "idle" });
  });
});

describe("createStateMachine — transitions", () => {
  it("idle + pick-start → picking", () => {
    const m = createStateMachine();
    m.send("pick-start");
    expect(m.current().state.kind).toBe("picking");
  });

  it("invalid event returns identical snapshot (silent, no throw)", () => {
    const m = createStateMachine();
    const before = m.current();
    // 'cycle-next' is invalid from idle.
    const after = m.send("cycle-next" as BrowserStateEvent);
    expect(after).toBe(before);
    expect(after.state).toEqual({ kind: "idle" });
  });

  it("walks full happy path idle → picking → configuring → generating → cycling → idle", () => {
    const m = createStateMachine();
    m.send("pick-start");
    expect(m.current().state.kind).toBe("picking");
    m.send("pick-confirm", { target });
    expect(m.current().state.kind).toBe("configuring");
    m.send("configure-submit", { requestedVariantCount: 3 });
    expect(m.current().state.kind).toBe("generating");
    m.send("generate-variants-arrived", { variants });
    expect(m.current().state.kind).toBe("cycling");
    m.send("cycle-accept");
    expect(m.current().state.kind).toBe("idle");
  });

  it("self-loop pick-hover keeps kind=picking and updates hoverSelector", () => {
    const m = createStateMachine();
    m.send("pick-start");
    m.send("pick-hover", { hoverSelector: "#x" });
    const s = m.current().state;
    expect(s.kind).toBe("picking");
    if (s.kind === "picking") expect(s.hoverSelector).toBe("#x");
  });

  it("pick-add on configuring keeps kind=configuring and appends target", () => {
    const m = createStateMachine();
    m.send("pick-start");
    m.send("pick-confirm", { target });
    m.send("pick-add", { target: target2 });
    const s = m.current().state;
    expect(s.kind).toBe("configuring");
    if (s.kind === "configuring") {
      expect(s.targets).toHaveLength(2);
      expect(s.targets.map((t) => t.id)).toEqual(["t1", "t2"]);
    }
  });

  it("pick-add with already-present target is a no-op", () => {
    const m = createStateMachine();
    m.send("pick-start");
    m.send("pick-confirm", { target });
    const beforeSnap = m.current();
    m.send("pick-add", { target });
    expect(m.current()).toBe(beforeSnap);
  });

  it("cycle-next stays in cycling and advances activeIndex (modulo)", () => {
    const m = createStateMachine();
    m.send("pick-start");
    m.send("pick-confirm", { target });
    m.send("configure-submit", { requestedVariantCount: 3 });
    m.send("generate-variants-arrived", { variants });
    m.send("cycle-next");
    let s = m.current().state;
    if (s.kind === "cycling") expect(s.activeIndex).toBe(1);
    m.send("cycle-next");
    m.send("cycle-next"); // wraps to 0
    s = m.current().state;
    if (s.kind === "cycling") expect(s.activeIndex).toBe(0);
  });

  it("cycle-prev wraps backwards", () => {
    const m = createStateMachine();
    m.send("pick-start");
    m.send("pick-confirm", { target });
    m.send("configure-submit", { requestedVariantCount: 3 });
    m.send("generate-variants-arrived", { variants });
    m.send("cycle-prev");
    const s = m.current().state;
    if (s.kind === "cycling") expect(s.activeIndex).toBe(2);
  });

  it("cycle-set-active accepts in-bounds index", () => {
    const m = createStateMachine();
    m.send("pick-start");
    m.send("pick-confirm", { target });
    m.send("configure-submit", {});
    m.send("generate-variants-arrived", { variants });
    m.send("cycle-set-active", { index: 2 });
    const s = m.current().state;
    if (s.kind === "cycling") expect(s.activeIndex).toBe(2);
  });

  it("cycle-set-active rejects out-of-bounds", () => {
    const m = createStateMachine();
    m.send("pick-start");
    m.send("pick-confirm", { target });
    m.send("configure-submit", {});
    m.send("generate-variants-arrived", { variants });
    const before = m.current();
    m.send("cycle-set-active", { index: 99 });
    expect(m.current()).toBe(before);
  });

  it("cycle-param-change stays in cycling and records override", () => {
    const m = createStateMachine();
    m.send("pick-start");
    m.send("pick-confirm", { target });
    m.send("configure-submit", {});
    m.send("generate-variants-arrived", { variants });
    m.send("cycle-param-change", { varName: "--pad", value: "8px" });
    const s = m.current().state;
    expect(s.kind).toBe("cycling");
    if (s.kind === "cycling") expect(s.paramOverrides["--pad"]).toBe("8px");
  });

  it("generate-error returns to configuring with prior context preserved", () => {
    const m = createStateMachine();
    m.send("pick-start");
    m.send("pick-confirm", { target });
    m.send("configure-edit-text", { freeText: "make bolder" });
    m.send("configure-submit", {});
    m.send("generate-error");
    const s = m.current().state;
    expect(s.kind).toBe("configuring");
    if (s.kind === "configuring") {
      expect(s.freeText).toBe("make bolder");
      expect(s.targets).toHaveLength(1);
    }
  });
});

describe("createStateMachine — subscribe", () => {
  it("invokes subscriber on transition; unsubscribe stops calls", () => {
    const m = createStateMachine();
    const seen: string[] = [];
    const unsub = m.subscribe((snap) => seen.push(snap.state.kind));
    m.send("pick-start"); // → picking
    m.send("pick-cancel"); // → idle
    expect(seen).toEqual(["picking", "idle"]);
    unsub();
    m.send("pick-start"); // no observer
    expect(seen).toEqual(["picking", "idle"]);
  });

  it("subscribers do NOT fire on no-op transitions", () => {
    const m = createStateMachine();
    let count = 0;
    m.subscribe(() => (count += 1));
    m.send("cycle-next" as BrowserStateEvent); // invalid from idle
    expect(count).toBe(0);
  });

  it("subscriber that throws is swallowed and does not break the machine", () => {
    const m = createStateMachine();
    m.subscribe(() => {
      throw new Error("oops");
    });
    expect(() => m.send("pick-start")).not.toThrow();
    expect(m.current().state.kind).toBe("picking");
  });
});

describe("STATE_TRANSITIONS table — coverage", () => {
  it("contains 19 edges", () => {
    // Phase 7.8 — added cycling → cycling on `generate-variants-arrived` so
    // the late-arriving real-agent variants can replace the placeholder.
    expect(STATE_TRANSITIONS).toHaveLength(19);
  });

  it("isValidTransition agrees with every table row", () => {
    for (const edge of STATE_TRANSITIONS) {
      expect(isValidTransition(edge.from, edge.to, edge.event)).toBe(true);
    }
  });

  it("isValidTransition returns false for an edge not in the table", () => {
    expect(isValidTransition("idle", "cycling", "pick-start")).toBe(false);
  });
});
