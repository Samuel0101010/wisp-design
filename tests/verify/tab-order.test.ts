// @vitest-environment jsdom
//
// wisp-design — tab-order tests (Phase 5).
//
// Tests jsdom-driven heuristics: focus-trap-leak, missing-focus-ring,
// nonzero-tabindex. The check uses its OWN jsdom internally; we still set
// the test env to jsdom because some node bindings (Element prototype
// checks) are friendlier under jsdom.

import { describe, expect, it } from "vitest";

import { runTabOrder } from "../../src/verify/tab-order.js";
import type { TabOrderViolation } from "../../src/contracts/verify.js";

function pageWith(body: string, style = ""): string {
  return `<!DOCTYPE html><html><head><style>${style}</style></head><body>${body}</body></html>`;
}

function vs(res: { violations?: ReadonlyArray<unknown> }): TabOrderViolation[] {
  return (res.violations ?? []) as TabOrderViolation[];
}

describe("runTabOrder — focus-trap-leak", () => {
  it("detects leak: open dialog + focusable outside", async () => {
    const html = pageWith(
      `<dialog open aria-modal="true"><button>X</button></dialog><button>Outside</button>`,
    );
    const res = await runTabOrder({ html });
    const leak = vs(res).find((v) => v.kind === "focus-trap-leak");
    expect(leak).toBeDefined();
    expect(res.severity).toBe("fail");
  });

  it("does NOT flag closed dialog (no aria-modal=true and no native open dialog)", async () => {
    const html = pageWith(
      `<div role="dialog"><button>X</button></div><button>Outside</button>`,
    );
    const res = await runTabOrder({ html });
    // role=dialog without aria-modal=true is NOT treated as modal.
    expect(vs(res).find((v) => v.kind === "focus-trap-leak")).toBeUndefined();
  });

  it("does NOT flag when outsiders are aria-hidden", async () => {
    const html = pageWith(
      `<dialog open aria-modal="true"><button>X</button></dialog><div aria-hidden="true"><button>Outside</button></div>`,
    );
    const res = await runTabOrder({ html });
    expect(vs(res).find((v) => v.kind === "focus-trap-leak")).toBeUndefined();
  });
});

describe("runTabOrder — nonzero-tabindex", () => {
  it("flags tabindex=5 on button", async () => {
    const res = await runTabOrder({ html: pageWith(`<button tabindex="5">X</button>`) });
    const hit = vs(res).find((v) => v.kind === "nonzero-tabindex");
    expect(hit).toBeDefined();
  });

  it("does NOT flag tabindex=0 (standard programmatic focus)", async () => {
    const res = await runTabOrder({ html: pageWith(`<div role="button" tabindex="0">X</div>`) });
    expect(vs(res).find((v) => v.kind === "nonzero-tabindex")).toBeUndefined();
  });

  it("does NOT flag tabindex=-1 (programmatic-only)", async () => {
    const res = await runTabOrder({ html: pageWith(`<div tabindex="-1">X</div>`) });
    expect(vs(res).find((v) => v.kind === "nonzero-tabindex")).toBeUndefined();
  });
});

describe("runTabOrder — missing-focus-ring", () => {
  it("flags a button when no :focus-visible rule exists anywhere", async () => {
    const res = await runTabOrder({ html: pageWith(`<button>X</button>`) });
    const hit = vs(res).find((v) => v.kind === "missing-focus-ring");
    expect(hit).toBeDefined();
  });

  it("does NOT flag when document has any :focus-visible rule", async () => {
    const res = await runTabOrder({
      html: pageWith(
        `<button>X</button>`,
        `button:focus-visible { outline: 2px solid blue; }`,
      ),
    });
    expect(vs(res).find((v) => v.kind === "missing-focus-ring")).toBeUndefined();
  });

  it("does NOT flag when document has :focus (legacy) rule", async () => {
    const res = await runTabOrder({
      html: pageWith(`<button>X</button>`, `button:focus { outline: 2px solid orange; }`),
    });
    expect(vs(res).find((v) => v.kind === "missing-focus-ring")).toBeUndefined();
  });
});

describe("runTabOrder — overall severity", () => {
  it("severity=pass on clean markup", async () => {
    const res = await runTabOrder({
      html: pageWith(`<button>X</button>`, `:focus-visible { outline: 2px solid blue; }`),
    });
    expect(res.severity).toBe("pass");
  });

  it("severity=warn when only nonzero-tabindex hit (no trap leak)", async () => {
    const res = await runTabOrder({
      html: pageWith(`<button tabindex="3">X</button>`, `:focus-visible { outline: 2px solid; }`),
    });
    expect(res.severity).toBe("warn");
  });

  it("never throws on malformed HTML", async () => {
    const res = await runTabOrder({ html: `<<<not html>>>` });
    expect(res.name).toBe("tab-order");
  });
});

// ---------------------------------------------------------------------------
// Bug #2 fix — violations must have non-empty message fields so the CLI
// formatter renders meaningful output rather than "tab-order: ".
// ---------------------------------------------------------------------------

describe("runTabOrder — violation messages are non-empty", () => {
  it("nonzero-tabindex violation includes selector and value in message", async () => {
    const res = await runTabOrder({
      html: pageWith(`<button tabindex="5">Click</button>`, `:focus-visible { outline: 2px solid; }`),
    });
    const hit = vs(res).find((v) => v.kind === "nonzero-tabindex") as (TabOrderViolation & { message?: string }) | undefined;
    expect(hit).toBeDefined();
    // message must be non-empty and contain the tabindex value
    expect(hit?.message).toBeDefined();
    expect(hit!.message!.length).toBeGreaterThan(0);
    expect(hit!.message).toMatch(/tabindex=5/);
  });

  it("missing-focus-ring violation has non-empty message", async () => {
    const res = await runTabOrder({
      html: pageWith(`<button>X</button>`),
    });
    const hit = vs(res).find((v) => v.kind === "missing-focus-ring") as (TabOrderViolation & { message?: string }) | undefined;
    expect(hit).toBeDefined();
    expect(hit?.message).toBeDefined();
    expect(hit!.message!.length).toBeGreaterThan(0);
  });

  it("focus-trap-leak violation message names the leak count", async () => {
    const res = await runTabOrder({
      html: pageWith(
        `<dialog open aria-modal="true"><button>Inside</button></dialog><button>Outside</button>`,
      ),
    });
    const hit = vs(res).find((v) => v.kind === "focus-trap-leak") as (TabOrderViolation & { message?: string }) | undefined;
    expect(hit).toBeDefined();
    expect(hit?.message).toBeDefined();
    expect(hit!.message!.length).toBeGreaterThan(0);
    // Message should mention how many elements leak
    expect(hit!.message).toMatch(/1 focusable/);
  });
});
