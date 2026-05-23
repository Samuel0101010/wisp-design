// wisp-design — Phase 6 session-replay tests.
//
// Validates: buildTimeline folds JSONL entries into a SessionReplayTimeline.
// Aggregates (totalVariantsGenerated, acceptRate, primaryAxisHistogram) are
// deterministic. Malformed lines warn-skip; missing-file returns empty timeline.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  findMostRecentSessionId,
  readSessionEntries,
  sessionReplay,
} from "../../src/session/replay.js";
import type { SessionEventEntry } from "../../src/contracts/session.js";

function makeRoot(): string {
  return mkdtempSync(join(tmpdir(), "wisp-replay-"));
}
function cleanup(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* best-effort */
  }
}

function writeJsonl(
  root: string,
  sessionId: string,
  entries: Array<Record<string, unknown>>,
  rawSuffix = "",
): string {
  const dir = join(root, ".wisp", "sessions");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${sessionId}.jsonl`);
  const lines = entries.map((e) => JSON.stringify(e)).join("\n");
  writeFileSync(path, lines + (lines.length > 0 ? "\n" : "") + rawSuffix, "utf8");
  return path;
}

const SID = "sid-001";
const ISO0 = "2026-05-22T10:00:00.000Z";
const ISO1 = "2026-05-22T10:00:01.000Z";
const ISO2 = "2026-05-22T10:00:02.000Z";
const ISO3 = "2026-05-22T10:00:03.000Z";
const ISO4 = "2026-05-22T10:00:04.000Z";
const ISO5 = "2026-05-22T10:00:05.000Z";
const ISO6 = "2026-05-22T10:00:06.000Z";

describe("buildTimeline — empty + missing", () => {
  let root: string;
  beforeEach(() => {
    root = makeRoot();
  });
  afterEach(() => cleanup(root));

  it("missing file returns an empty timeline (entriesCount=0)", async () => {
    const t = await sessionReplay.buildTimeline("does-not-exist", {
      projectRoot: root,
    });
    expect(t.entriesCount).toBe(0);
    expect(t.picks).toEqual([]);
    expect(t.variantGenerations).toEqual([]);
    expect(t.accepts).toEqual([]);
  });

  it("empty file returns an empty timeline", async () => {
    writeJsonl(root, SID, []);
    const t = await sessionReplay.buildTimeline(SID, { projectRoot: root });
    expect(t.entriesCount).toBe(0);
  });

  it("acceptRate guards /0 — returns 0 not NaN when no variants", async () => {
    const t = await sessionReplay.buildTimeline("nope", { projectRoot: root });
    expect(t.acceptRate).toBe(0);
    expect(Number.isFinite(t.acceptRate)).toBe(true);
  });
});

describe("buildTimeline — folds + aggregates", () => {
  let root: string;
  let warnCalls: number;
  let origWrite: typeof process.stderr.write;
  beforeEach(() => {
    root = makeRoot();
    warnCalls = 0;
    origWrite = process.stderr.write.bind(process.stderr);
    process.stderr.write = ((_chunk: unknown) => {
      warnCalls += 1;
      return true;
    }) as typeof process.stderr.write;
  });
  afterEach(() => {
    process.stderr.write = origWrite;
    cleanup(root);
  });

  it("malformed JSONL line warn-skips and continues", async () => {
    const entries: Array<Record<string, unknown>> = [
      { ts: ISO0, sessionId: SID, kind: "session-start", detail: {} },
    ];
    writeJsonl(root, SID, entries, "this is not json\n");
    const t = await sessionReplay.buildTimeline(SID, { projectRoot: root });
    // The malformed line is skipped, only the valid entry is folded.
    expect(t.entriesCount).toBe(1);
    expect(warnCalls).toBeGreaterThan(0);
  });

  it("schema-invalid line warn-skips", async () => {
    const entries: Array<Record<string, unknown>> = [
      { ts: ISO0, sessionId: SID, kind: "session-start", detail: {} },
      { totally: "wrong shape" }, // valid JSON, bad schema
    ];
    writeJsonl(root, SID, entries);
    const t = await sessionReplay.buildTimeline(SID, { projectRoot: root });
    expect(t.entriesCount).toBe(1);
  });

  it("folds picks + variants-emitted + accepts → correct timeline shape", async () => {
    const entries: Array<Record<string, unknown>> = [
      { ts: ISO0, sessionId: SID, kind: "session-start", detail: {} },
      {
        ts: ISO1,
        sessionId: SID,
        kind: "pick",
        detail: { selector: "#a", tag: "div", targetId: "T1" },
      },
      {
        ts: ISO2,
        sessionId: SID,
        kind: "variants-emitted",
        detail: {
          targetId: "T1",
          variants: [
            { id: "v1", rationale: "r1", primaryAxis: "hierarchy" },
            { id: "v2", rationale: "r2", primaryAxis: "hierarchy" },
            { id: "v3", rationale: "r3", primaryAxis: "color" },
          ],
        },
      },
      {
        ts: ISO3,
        sessionId: SID,
        kind: "accept-variant",
        filePath: "/tmp/page.tsx",
        detail: { variantId: "v1" },
      },
      { ts: ISO4, sessionId: SID, kind: "session-end", detail: {} },
    ];
    writeJsonl(root, SID, entries);
    const t = await sessionReplay.buildTimeline(SID, { projectRoot: root });
    expect(t.entriesCount).toBe(5);
    expect(t.startedAt).toBe(ISO0);
    expect(t.endedAt).toBe(ISO4);
    expect(t.picks).toHaveLength(1);
    expect(t.picks[0]?.selector).toBe("#a");
    expect(t.variantGenerations).toHaveLength(1);
    expect(t.variantGenerations[0]?.variantCount).toBe(3);
    expect(t.accepts).toHaveLength(1);
    expect(t.accepts[0]?.variantId).toBe("v1");
    expect(t.accepts[0]?.filePath).toBe("/tmp/page.tsx");
  });

  it("totalVariantsGenerated = sum of variantGenerations[].variantCount", async () => {
    const entries: Array<Record<string, unknown>> = [
      {
        ts: ISO0,
        sessionId: SID,
        kind: "variants-emitted",
        detail: {
          targetId: "T1",
          variants: [
            { id: "v1", rationale: "x", primaryAxis: "hierarchy" },
            { id: "v2", rationale: "x", primaryAxis: "color" },
          ],
        },
      },
      {
        ts: ISO1,
        sessionId: SID,
        kind: "variants-emitted",
        detail: {
          targetId: "T2",
          variants: [
            { id: "v3", rationale: "x", primaryAxis: "layout" },
            { id: "v4", rationale: "x", primaryAxis: "layout" },
            { id: "v5", rationale: "x", primaryAxis: "layout" },
          ],
        },
      },
    ];
    writeJsonl(root, SID, entries);
    const t = await sessionReplay.buildTimeline(SID, { projectRoot: root });
    expect(t.totalVariantsGenerated).toBe(5);
  });

  it("acceptRate = accepts / variants; guards /0", async () => {
    const entries: Array<Record<string, unknown>> = [
      {
        ts: ISO0,
        sessionId: SID,
        kind: "variants-emitted",
        detail: {
          targetId: "T",
          variants: [
            { id: "v1", rationale: "x", primaryAxis: "hierarchy" },
            { id: "v2", rationale: "x", primaryAxis: "color" },
            { id: "v3", rationale: "x", primaryAxis: "color" },
            { id: "v4", rationale: "x", primaryAxis: "color" },
          ],
        },
      },
      {
        ts: ISO1,
        sessionId: SID,
        kind: "accept-variant",
        filePath: "/x.tsx",
        detail: { variantId: "v1" },
      },
      {
        ts: ISO2,
        sessionId: SID,
        kind: "accept-variant",
        filePath: "/x.tsx",
        detail: { variantId: "v2" },
      },
    ];
    writeJsonl(root, SID, entries);
    const t = await sessionReplay.buildTimeline(SID, { projectRoot: root });
    expect(t.acceptRate).toBeCloseTo(2 / 4);
  });

  it("primaryAxisHistogram tallies accepts via variants-emitted forward-join", async () => {
    const entries: Array<Record<string, unknown>> = [
      {
        ts: ISO0,
        sessionId: SID,
        kind: "variants-emitted",
        detail: {
          targetId: "T",
          variants: [
            { id: "v1", rationale: "x", primaryAxis: "density" },
            { id: "v2", rationale: "x", primaryAxis: "color" },
            { id: "v3", rationale: "x", primaryAxis: "density" },
          ],
        },
      },
      {
        ts: ISO1,
        sessionId: SID,
        kind: "accept-variant",
        filePath: "/p.tsx",
        detail: { variantId: "v1" },
      },
      {
        ts: ISO2,
        sessionId: SID,
        kind: "accept-variant",
        filePath: "/p.tsx",
        detail: { variantId: "v3" },
      },
    ];
    writeJsonl(root, SID, entries);
    const t = await sessionReplay.buildTimeline(SID, { projectRoot: root });
    expect(t.primaryAxisHistogram).toEqual({ density: 2 });
  });

  it("captures policy-proposal outcomes (shown-only / accepted / declined)", async () => {
    const entries: Array<Record<string, unknown>> = [
      {
        ts: ISO0,
        sessionId: SID,
        kind: "policy-proposal-shown",
        detail: { axis: "density", proposed: "x" },
      },
      {
        ts: ISO1,
        sessionId: SID,
        kind: "policy-proposal-accepted",
        detail: { axis: "density" },
      },
      {
        ts: ISO2,
        sessionId: SID,
        kind: "policy-proposal-shown",
        detail: { axis: "color", proposed: "y" },
      },
      {
        ts: ISO3,
        sessionId: SID,
        kind: "policy-proposal-declined",
        detail: { axis: "color" },
      },
      {
        ts: ISO4,
        sessionId: SID,
        kind: "policy-proposal-shown",
        detail: { axis: "layout", proposed: "z" },
      },
    ];
    writeJsonl(root, SID, entries);
    const t = await sessionReplay.buildTimeline(SID, { projectRoot: root });
    const byAxis = new Map(t.policyProposals.map((p) => [p.axis, p.outcome]));
    expect(byAxis.get("density")).toBe("accepted");
    expect(byAxis.get("color")).toBe("declined");
    expect(byAxis.get("layout")).toBe("shown-only");
  });

  it("captures verify-report entries", async () => {
    const entries: Array<Record<string, unknown>> = [
      {
        ts: ISO0,
        sessionId: SID,
        kind: "verify-report",
        detail: { verdict: "fail", hardBanCount: 2, a11yFailCount: 1 },
      },
      {
        ts: ISO1,
        sessionId: SID,
        kind: "verify-report",
        detail: { verdict: "pass", hardBanCount: 0, a11yFailCount: 0 },
      },
    ];
    writeJsonl(root, SID, entries);
    const t = await sessionReplay.buildTimeline(SID, { projectRoot: root });
    expect(t.verifyReports).toHaveLength(2);
    expect(t.verifyReports[0]?.verdict).toBe("fail");
    expect(t.verifyReports[0]?.hardBanCount).toBe(2);
    expect(t.verifyReports[1]?.verdict).toBe("pass");
  });
});

describe("listSessions + findMostRecentSessionId", () => {
  let root: string;
  beforeEach(() => {
    root = makeRoot();
  });
  afterEach(() => cleanup(root));

  it("listSessions on empty .wisp/sessions/ (missing dir) returns []", async () => {
    const out = await sessionReplay.listSessions({ projectRoot: root });
    expect(out).toEqual([]);
  });

  it("listSessions lists each .jsonl file (skips .rotated)", async () => {
    writeJsonl(root, "sa", [
      { ts: ISO0, sessionId: "sa", kind: "session-start", detail: {} },
    ]);
    writeJsonl(root, "sb", [
      { ts: ISO1, sessionId: "sb", kind: "session-start", detail: {} },
      { ts: ISO2, sessionId: "sb", kind: "session-end", detail: {} },
    ]);
    // a rotated archive — must not appear in the list
    writeFileSync(
      join(root, ".wisp", "sessions", "old.jsonl.123.rotated"),
      "{}\n",
      "utf8",
    );
    const out = await sessionReplay.listSessions({ projectRoot: root });
    const ids = out.map((s) => s.sessionId).sort();
    expect(ids).toEqual(["sa", "sb"]);
  });

  it("each listSessions entry has sessionId/startedAt/entriesCount; endedAt only when session-end present", async () => {
    writeJsonl(root, "sa", [
      { ts: ISO0, sessionId: "sa", kind: "session-start", detail: {} },
    ]);
    writeJsonl(root, "sb", [
      { ts: ISO1, sessionId: "sb", kind: "session-start", detail: {} },
      { ts: ISO2, sessionId: "sb", kind: "session-end", detail: {} },
    ]);
    const out = await sessionReplay.listSessions({ projectRoot: root });
    const sa = out.find((s) => s.sessionId === "sa");
    const sb = out.find((s) => s.sessionId === "sb");
    expect(sa?.entriesCount).toBe(1);
    expect(sa?.endedAt).toBeUndefined();
    expect(sb?.endedAt).toBe(ISO2);
  });

  it("findMostRecentSessionId returns the newest by mtime", async () => {
    writeJsonl(root, "old", [
      { ts: ISO0, sessionId: "old", kind: "session-start", detail: {} },
    ]);
    // small delay so mtime differs on coarse-grained filesystems
    await new Promise((r) => setTimeout(r, 20));
    writeJsonl(root, "new", [
      { ts: ISO1, sessionId: "new", kind: "session-start", detail: {} },
    ]);
    const recent = await findMostRecentSessionId(root);
    expect(recent).toBe("new");
  });

  it("findMostRecentSessionId returns null when no sessions", async () => {
    const recent = await findMostRecentSessionId(root);
    expect(recent).toBeNull();
  });

  it("readSessionEntries exposes raw parsed entries", async () => {
    writeJsonl(root, SID, [
      { ts: ISO0, sessionId: SID, kind: "session-start", detail: {} },
      {
        ts: ISO1,
        sessionId: SID,
        kind: "pick",
        detail: { selector: "#x", tag: "div", targetId: "T" },
      },
    ]);
    const entries = await readSessionEntries(root, SID);
    expect(entries).toHaveLength(2);
    expect(entries[0]?.kind).toBe("session-start");
    expect(entries[1]?.kind).toBe("pick");
  });

  it("E2E: 8-entry JSONL folds into expected timeline shape", async () => {
    const entries: Array<Record<string, unknown>> = [
      { ts: ISO0, sessionId: SID, kind: "session-start", detail: {} },
      {
        ts: ISO1,
        sessionId: SID,
        kind: "pick",
        detail: { selector: "#h", tag: "h1", targetId: "T1" },
      },
      {
        ts: ISO2,
        sessionId: SID,
        kind: "variants-emitted",
        detail: {
          targetId: "T1",
          variants: [
            { id: "v1", rationale: "r1", primaryAxis: "hierarchy" },
            { id: "v2", rationale: "r2", primaryAxis: "hierarchy" },
            { id: "v3", rationale: "r3", primaryAxis: "layout" },
          ],
        },
      },
      {
        ts: ISO3,
        sessionId: SID,
        kind: "accept-variant",
        filePath: "/tmp/x.tsx",
        detail: { variantId: "v2" },
      },
      {
        ts: ISO4,
        sessionId: SID,
        kind: "verify-report",
        detail: { verdict: "pass", hardBanCount: 0, a11yFailCount: 0 },
      },
      {
        ts: ISO5,
        sessionId: SID,
        kind: "component-lib-detected",
        detail: { lib: "shadcn", confidence: 0.82 },
      },
      {
        ts: ISO6,
        sessionId: SID,
        kind: "session-end",
        detail: {},
      },
    ];
    writeJsonl(root, SID, entries);
    const t = await sessionReplay.buildTimeline(SID, { projectRoot: root });
    expect(t.entriesCount).toBe(7);
    expect(t.startedAt).toBe(ISO0);
    expect(t.endedAt).toBe(ISO6);
    expect(t.picks).toHaveLength(1);
    expect(t.variantGenerations).toHaveLength(1);
    expect(t.totalVariantsGenerated).toBe(3);
    expect(t.accepts).toHaveLength(1);
    expect(t.acceptRate).toBeCloseTo(1 / 3);
    expect(t.primaryAxisHistogram).toEqual({ hierarchy: 1 });
    expect(t.verifyReports).toHaveLength(1);
    expect(t.componentLibDetections).toHaveLength(1);
    expect(t.componentLibDetections[0]?.lib).toBe("shadcn");
  });
});

// Touch the imported type so eslint/tsc don't flag unused imports.
void ({} as SessionEventEntry);
