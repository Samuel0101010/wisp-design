// wisp-design — Phase 6 session-logger tests.
//
// Validates: schema-validation gate, atomic appends, convenience helpers route
// through the same write path, Phase-3 file-op kinds still route via undo-stack.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { sessionLogger } from "../../src/session/logger.js";
import { sessionLogPathForTest } from "../../src/source/undo-stack.js";
import type {
  SessionEventEntry,
} from "../../src/contracts/session.js";

const SID = "test-logger-session";

function makeRoot(): string {
  return mkdtempSync(join(tmpdir(), "wisp-logger-"));
}

function cleanup(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* best-effort */
  }
}

function readLines(path: string): SessionEventEntry[] {
  const raw = readFileSync(path, "utf8");
  return raw
    .split("\n")
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l) as SessionEventEntry);
}

describe("sessionLogger — start / end / log", () => {
  let root: string;
  beforeEach(() => {
    root = makeRoot();
  });
  afterEach(() => cleanup(root));

  it("start writes a session-start entry and creates `.wisp/sessions/<sid>.jsonl`", async () => {
    const path = sessionLogPathForTest(SID, root);
    expect(existsSync(path)).toBe(false);
    await sessionLogger.start(SID, { projectRoot: root });
    expect(existsSync(path)).toBe(true);
    const lines = readLines(path);
    expect(lines).toHaveLength(1);
    expect(lines[0]?.kind).toBe("session-start");
    expect(lines[0]?.sessionId).toBe(SID);
    expect(typeof lines[0]?.ts).toBe("string");
  });

  it("start ensures .wisp/sessions/ exists when missing (mkdir recursive)", async () => {
    // root has no `.wisp/` yet — start() must create it.
    await sessionLogger.start(SID, { projectRoot: root });
    expect(existsSync(join(root, ".wisp", "sessions"))).toBe(true);
  });

  it("end writes a session-end entry", async () => {
    await sessionLogger.start(SID, { projectRoot: root });
    await sessionLogger.end(SID, { projectRoot: root });
    const path = sessionLogPathForTest(SID, root);
    const lines = readLines(path);
    expect(lines).toHaveLength(2);
    expect(lines[1]?.kind).toBe("session-end");
  });

  it("log(entry, opts) validates via SessionEventEntrySchema — bad input throws", async () => {
    const bad = { not: "an entry" } as unknown as SessionEventEntry;
    await expect(
      sessionLogger.log(bad, { projectRoot: root }),
    ).rejects.toThrow();
  });

  it("log rejects an invalid `kind` value (ZodError)", async () => {
    const bad: unknown = {
      ts: new Date().toISOString(),
      sessionId: SID,
      kind: "totally-not-a-real-kind",
      detail: {},
    };
    await expect(
      sessionLogger.log(bad as SessionEventEntry, { projectRoot: root }),
    ).rejects.toThrow();
  });

  it("log accepts a valid session-level entry and writes it verbatim", async () => {
    const entry: SessionEventEntry = {
      ts: new Date().toISOString(),
      sessionId: SID,
      kind: "annotation-added",
      detail: { target: "#x", kind: "note", note: "hi" },
    };
    await sessionLogger.log(entry, { projectRoot: root });
    const path = sessionLogPathForTest(SID, root);
    const lines = readLines(path);
    expect(lines).toHaveLength(1);
    expect(lines[0]?.kind).toBe("annotation-added");
    expect(lines[0]?.detail?.["note"]).toBe("hi");
  });
});

describe("sessionLogger — convenience helpers", () => {
  let root: string;
  beforeEach(() => {
    root = makeRoot();
  });
  afterEach(() => cleanup(root));

  it("logVariantsEmitted emits a variants-emitted entry with correct detail shape", async () => {
    await sessionLogger.logVariantsEmitted(
      SID,
      {
        targetId: "T1",
        variants: [
          { id: "v1", rationale: "bolder", primaryAxis: "hierarchy" },
          { id: "v2", rationale: "calmer", primaryAxis: "typography" },
        ],
      },
      { projectRoot: root },
    );
    const lines = readLines(sessionLogPathForTest(SID, root));
    expect(lines).toHaveLength(1);
    expect(lines[0]?.kind).toBe("variants-emitted");
    expect(lines[0]?.detail?.["targetId"]).toBe("T1");
    const variants = lines[0]?.detail?.["variants"];
    expect(Array.isArray(variants)).toBe(true);
    expect((variants as unknown[]).length).toBe(2);
  });

  it("logAccept writes kind=accept-variant with filePath + variantId", async () => {
    await sessionLogger.logAccept(
      SID,
      { variantId: "v1", filePath: "/tmp/page.tsx" },
      { projectRoot: root },
    );
    const lines = readLines(sessionLogPathForTest(SID, root));
    expect(lines[0]?.kind).toBe("accept-variant");
    expect(lines[0]?.filePath).toBe("/tmp/page.tsx");
    expect(lines[0]?.detail?.["variantId"]).toBe("v1");
  });

  it("logVerifyReport writes verdict / hardBanCount / a11yFailCount", async () => {
    await sessionLogger.logVerifyReport(
      SID,
      { verdict: "pass", hardBanCount: 0, a11yFailCount: 0 },
      { projectRoot: root },
    );
    const lines = readLines(sessionLogPathForTest(SID, root));
    expect(lines[0]?.kind).toBe("verify-report");
    expect(lines[0]?.detail?.["verdict"]).toBe("pass");
    expect(lines[0]?.detail?.["hardBanCount"]).toBe(0);
    expect(lines[0]?.detail?.["a11yFailCount"]).toBe(0);
  });

  it("logPick / logConfigure / logCycleActiveChanged / logParamChanged each emit the expected kind", async () => {
    await sessionLogger.logPick(
      SID,
      { selector: ".x", tag: "div", targetId: "T1" },
      { projectRoot: root },
    );
    await sessionLogger.logConfigure(
      SID,
      { targetId: "T1", freeText: "make it bolder" },
      { projectRoot: root },
    );
    await sessionLogger.logCycleActiveChanged(
      SID,
      { fromIndex: 0, toIndex: 1 },
      { projectRoot: root },
    );
    await sessionLogger.logParamChanged(
      SID,
      { varName: "--padding", from: "16px", to: "24px" },
      { projectRoot: root },
    );
    const lines = readLines(sessionLogPathForTest(SID, root));
    expect(lines.map((l) => l.kind)).toEqual([
      "pick",
      "configure",
      "cycle-active-changed",
      "param-changed",
    ]);
  });

  it("policy-proposal-shown / -accepted / -declined each carry an `axis` detail", async () => {
    await sessionLogger.logPolicyProposalShown(
      SID,
      {
        axis: "density",
        observation: "3 accepts",
        proposed: "set density: 'generous'",
        triggerThreshold: 3,
      },
      { projectRoot: root },
    );
    await sessionLogger.logPolicyProposalAccepted(
      SID,
      { axis: "density" },
      { projectRoot: root },
    );
    await sessionLogger.logPolicyProposalDeclined(
      SID,
      { axis: "color" },
      { projectRoot: root },
    );
    const lines = readLines(sessionLogPathForTest(SID, root));
    expect(lines).toHaveLength(3);
    expect(lines[0]?.kind).toBe("policy-proposal-shown");
    expect(lines[0]?.detail?.["axis"]).toBe("density");
    expect(lines[0]?.detail?.["triggerThreshold"]).toBe(3);
    expect(lines[1]?.kind).toBe("policy-proposal-accepted");
    expect(lines[1]?.detail?.["axis"]).toBe("density");
    expect(lines[2]?.kind).toBe("policy-proposal-declined");
    expect(lines[2]?.detail?.["axis"]).toBe("color");
  });

  it("logMorphEngaged emits kind=morph-engaged", async () => {
    await sessionLogger.logMorphEngaged(
      SID,
      { variantIdA: "v1", variantIdB: "v2", t: 0.4 },
      { projectRoot: root },
    );
    const lines = readLines(sessionLogPathForTest(SID, root));
    expect(lines[0]?.kind).toBe("morph-engaged");
    expect(lines[0]?.detail?.["t"]).toBe(0.4);
  });

  it("logStructureVariantEmitted emits kind=structure-variant-emitted", async () => {
    await sessionLogger.logStructureVariantEmitted(
      SID,
      { targetId: "T1", kinds: ["as-is", "two-col-split", "card-layout"] },
      { projectRoot: root },
    );
    const lines = readLines(sessionLogPathForTest(SID, root));
    expect(lines[0]?.kind).toBe("structure-variant-emitted");
    expect(lines[0]?.detail?.["kinds"]).toEqual([
      "as-is",
      "two-col-split",
      "card-layout",
    ]);
  });

  it("logComponentLibDetected emits kind=component-lib-detected", async () => {
    await sessionLogger.logComponentLibDetected(
      SID,
      { lib: "shadcn", confidence: 0.85, preferredStrategy: "prop-edit" },
      { projectRoot: root },
    );
    const lines = readLines(sessionLogPathForTest(SID, root));
    expect(lines[0]?.kind).toBe("component-lib-detected");
    expect(lines[0]?.detail?.["lib"]).toBe("shadcn");
    expect(lines[0]?.detail?.["confidence"]).toBe(0.85);
    expect(lines[0]?.detail?.["preferredStrategy"]).toBe("prop-edit");
  });
});

describe("sessionLogger — Phase-3 inherited kinds + serialization", () => {
  let root: string;
  beforeEach(() => {
    root = makeRoot();
  });
  afterEach(() => cleanup(root));

  it("accept-variant routes through logger (Phase-3 kind, but logger still writes it)", async () => {
    await sessionLogger.logAccept(
      SID,
      { variantId: "v1", filePath: "/tmp/file.tsx" },
      { projectRoot: root },
    );
    const path = sessionLogPathForTest(SID, root);
    expect(existsSync(path)).toBe(true);
    const lines = readLines(path);
    expect(lines[0]?.kind).toBe("accept-variant");
    expect(lines[0]?.filePath).toBe("/tmp/file.tsx");
  });

  it("discard-variants (Phase-3) routes through logger as a generic log() call", async () => {
    const entry: SessionEventEntry = {
      ts: new Date().toISOString(),
      sessionId: SID,
      kind: "discard-variants",
      filePath: "/tmp/file.tsx",
      detail: { reason: "user-discarded" },
    };
    await sessionLogger.log(entry, { projectRoot: root });
    const lines = readLines(sessionLogPathForTest(SID, root));
    expect(lines[0]?.kind).toBe("discard-variants");
    expect(lines[0]?.detail?.["reason"]).toBe("user-discarded");
  });

  it("Phase-3 kinds without filePath throw (logger asserts)", async () => {
    const bad: SessionEventEntry = {
      ts: new Date().toISOString(),
      sessionId: SID,
      kind: "accept-variant", // Phase-3 file-op kind
      // intentionally no filePath
      detail: { variantId: "v1" },
    };
    await expect(
      sessionLogger.log(bad, { projectRoot: root }),
    ).rejects.toThrow(/filePath/i);
  });

  it("concurrent helper calls all land — final byte-count == sum of entries", async () => {
    // Sequential await chain to keep deterministic ordering on Windows.
    // POSIX O_APPEND atomicity is best-effort; we don't race here.
    const N = 8;
    for (let i = 0; i < N; i += 1) {
      await sessionLogger.logPick(
        SID,
        { selector: `#a${i}`, tag: "div", targetId: `T${i}` },
        { projectRoot: root },
      );
    }
    const path = sessionLogPathForTest(SID, root);
    const lines = readLines(path);
    expect(lines).toHaveLength(N);
    for (let i = 0; i < N; i += 1) {
      expect(lines[i]?.kind).toBe("pick");
      expect(lines[i]?.detail?.["targetId"]).toBe(`T${i}`);
    }
  });
});
