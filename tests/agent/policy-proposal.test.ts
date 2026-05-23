// wisp-design — Phase 6 policy-proposal tests.
//
// Validates: analyzeRecentDecisions (consecutive-accepts trigger, declined-axes
// gate), applyProposal (frontmatter write + axis merge), runPolicy CLI.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { policyProposal, runPolicy } from "../../src/agent/policy.js";
import {
  POLICY_DOCUMENT_RELATIVE_PATH,
  type SessionEventEntry,
} from "../../src/contracts/session.js";

function makeRoot(): string {
  return mkdtempSync(join(tmpdir(), "wisp-policy-"));
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
): void {
  const dir = join(root, ".wisp", "sessions");
  mkdirSync(dir, { recursive: true });
  const lines = entries.map((e) => JSON.stringify(e)).join("\n") + "\n";
  writeFileSync(join(dir, `${sessionId}.jsonl`), lines, "utf8");
}

function captureStdio(): {
  stdout: string[];
  stderr: string[];
  restore: () => void;
} {
  const out: string[] = [];
  const err: string[] = [];
  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);
  process.stdout.write = ((chunk: string | Uint8Array) => {
    out.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
    return true;
  }) as typeof process.stdout.write;
  process.stderr.write = ((chunk: string | Uint8Array) => {
    err.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
    return true;
  }) as typeof process.stderr.write;
  return {
    stdout: out,
    stderr: err,
    restore: () => {
      process.stdout.write = origOut;
      process.stderr.write = origErr;
    },
  };
}

const SID = "sid-policy";
const ISO = (n: number): string =>
  new Date(Date.UTC(2026, 4, 22, 10, 0, n)).toISOString();

function variantsEmitted(
  ts: string,
  vs: Array<{ id: string; axis: string }>,
): Record<string, unknown> {
  return {
    ts,
    sessionId: SID,
    kind: "variants-emitted",
    detail: {
      targetId: "T",
      variants: vs.map((v) => ({
        id: v.id,
        rationale: "x",
        primaryAxis: v.axis,
      })),
    },
  };
}

function accept(ts: string, variantId: string): Record<string, unknown> {
  return {
    ts,
    sessionId: SID,
    kind: "accept-variant",
    filePath: "/tmp/x.tsx",
    detail: { variantId },
  };
}

describe("analyzeRecentDecisions", () => {
  it("returns null for an empty entries array", () => {
    const p = policyProposal.analyzeRecentDecisions([]);
    expect(p).toBeNull();
  });

  it("3 consecutive accepts of same primaryAxis → proposal fires (default threshold 3)", () => {
    const entries: SessionEventEntry[] = [
      variantsEmitted(ISO(0), [
        { id: "v1", axis: "density" },
        { id: "v2", axis: "density" },
        { id: "v3", axis: "density" },
      ]),
      accept(ISO(1), "v1"),
      accept(ISO(2), "v2"),
      accept(ISO(3), "v3"),
    ] as SessionEventEntry[];
    const p = policyProposal.analyzeRecentDecisions(entries);
    expect(p).not.toBeNull();
    expect(p?.axis).toBe("density");
    expect(p?.triggerThreshold).toBe(3);
    expect(p?.evidence).toHaveLength(3);
  });

  it("2 same-axis accepts then 1 different axis → no proposal (didn't reach 3)", () => {
    const entries: SessionEventEntry[] = [
      variantsEmitted(ISO(0), [
        { id: "v1", axis: "density" },
        { id: "v2", axis: "density" },
        { id: "v3", axis: "color" },
      ]),
      accept(ISO(1), "v1"),
      accept(ISO(2), "v2"),
      accept(ISO(3), "v3"),
    ] as SessionEventEntry[];
    const p = policyProposal.analyzeRecentDecisions(entries);
    expect(p).toBeNull();
  });

  it("4 accepts of same axis → proposal fires (>=3 threshold)", () => {
    const entries: SessionEventEntry[] = [
      variantsEmitted(ISO(0), [
        { id: "v1", axis: "hierarchy" },
        { id: "v2", axis: "hierarchy" },
        { id: "v3", axis: "hierarchy" },
        { id: "v4", axis: "hierarchy" },
      ]),
      accept(ISO(1), "v1"),
      accept(ISO(2), "v2"),
      accept(ISO(3), "v3"),
      accept(ISO(4), "v4"),
    ] as SessionEventEntry[];
    const p = policyProposal.analyzeRecentDecisions(entries);
    expect(p?.axis).toBe("hierarchy");
  });

  it("last accept on a different axis resets — pattern broken", () => {
    // 2 density accepts, then a color accept, then 2 more density accepts.
    // None of the runs reaches 3 consecutive same-axis accepts.
    const entries: SessionEventEntry[] = [
      variantsEmitted(ISO(0), [
        { id: "d1", axis: "density" },
        { id: "d2", axis: "density" },
        { id: "c1", axis: "color" },
        { id: "d3", axis: "density" },
        { id: "d4", axis: "density" },
      ]),
      accept(ISO(1), "d1"),
      accept(ISO(2), "d2"),
      accept(ISO(3), "c1"),
      accept(ISO(4), "d3"),
      accept(ISO(5), "d4"),
    ] as SessionEventEntry[];
    const p = policyProposal.analyzeRecentDecisions(entries);
    expect(p).toBeNull();
  });

  it("triggerThreshold override works (e.g. 2)", () => {
    const entries: SessionEventEntry[] = [
      variantsEmitted(ISO(0), [
        { id: "v1", axis: "typography" },
        { id: "v2", axis: "typography" },
      ]),
      accept(ISO(1), "v1"),
      accept(ISO(2), "v2"),
    ] as SessionEventEntry[];
    const p = policyProposal.analyzeRecentDecisions(entries, {
      triggerThreshold: 2,
    });
    expect(p?.axis).toBe("typography");
    expect(p?.triggerThreshold).toBe(2);
    expect(p?.evidence).toHaveLength(2);
  });

  it("evidence array carries matching entries with ts + variantId + primaryAxis", () => {
    const entries: SessionEventEntry[] = [
      variantsEmitted(ISO(0), [
        { id: "v1", axis: "color" },
        { id: "v2", axis: "color" },
        { id: "v3", axis: "color" },
      ]),
      accept(ISO(1), "v1"),
      accept(ISO(2), "v2"),
      accept(ISO(3), "v3"),
    ] as SessionEventEntry[];
    const p = policyProposal.analyzeRecentDecisions(entries);
    expect(p?.evidence.map((e) => e.variantId)).toEqual(["v1", "v2", "v3"]);
    expect(p?.evidence[0]?.primaryAxis).toBe("color");
    expect(p?.evidence[0]?.ts).toBe(ISO(1));
  });

  it("declined axis is excluded — no re-trigger same session", () => {
    const entries: SessionEventEntry[] = [
      variantsEmitted(ISO(0), [
        { id: "v1", axis: "density" },
        { id: "v2", axis: "density" },
        { id: "v3", axis: "density" },
      ]),
      accept(ISO(1), "v1"),
      accept(ISO(2), "v2"),
      accept(ISO(3), "v3"),
      {
        ts: ISO(4),
        sessionId: SID,
        kind: "policy-proposal-declined",
        detail: { axis: "density" },
      },
    ] as SessionEventEntry[];
    const p = policyProposal.analyzeRecentDecisions(entries);
    expect(p).toBeNull();
  });
});

describe("applyProposal", () => {
  let root: string;
  beforeEach(() => {
    root = makeRoot();
  });
  afterEach(() => cleanup(root));

  it("writes .wisp/policy.md with frontmatter (acceptedAt, source, axes)", async () => {
    const proposal = {
      axis: "density" as const,
      observation: "3 density accepts",
      proposed: "set density: 'generous' in .wisp/policy.md",
      evidence: [],
      triggerThreshold: 3,
    };
    const result = await policyProposal.applyProposal(proposal, {
      projectRoot: root,
    });
    expect(result.written).toBe(true);
    expect(result.policyPath).toMatch(/policy\.md$/);
    const content = readFileSync(
      join(root, POLICY_DOCUMENT_RELATIVE_PATH),
      "utf8",
    );
    expect(content).toMatch(/^---/);
    expect(content).toMatch(/acceptedAt:/);
    expect(content).toMatch(/source: wisp-proposed-then-confirmed/);
    expect(content).toMatch(/density: generous/);
  });

  it("merging a new axis preserves existing axes", async () => {
    // Seed with an existing color axis.
    mkdirSync(join(root, ".wisp"), { recursive: true });
    const seed = [
      "---",
      "acceptedAt: 2026-01-01T00:00:00.000Z",
      "source: user-confirmed",
      "axes:",
      "  color: muted-accent",
      "---",
      "",
      "body text",
      "",
    ].join("\n");
    writeFileSync(
      join(root, POLICY_DOCUMENT_RELATIVE_PATH),
      seed,
      "utf8",
    );

    const proposal = {
      axis: "density" as const,
      observation: "x",
      proposed: "set density: 'generous'",
      evidence: [],
      triggerThreshold: 3,
    };
    await policyProposal.applyProposal(proposal, { projectRoot: root });
    const content = readFileSync(
      join(root, POLICY_DOCUMENT_RELATIVE_PATH),
      "utf8",
    );
    expect(content).toMatch(/color: muted-accent/);
    expect(content).toMatch(/density: generous/);
  });

  it("returns { written: true, policyPath }", async () => {
    const r = await policyProposal.applyProposal(
      {
        axis: "layout" as const,
        observation: "x",
        proposed: "set layout: 'editorial-column'",
        evidence: [],
        triggerThreshold: 3,
      },
      { projectRoot: root },
    );
    expect(r.written).toBe(true);
    expect(existsSync(r.policyPath)).toBe(true);
  });
});

describe("runPolicy CLI", () => {
  let root: string;
  let cwdSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    root = makeRoot();
    cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(root);
  });
  afterEach(() => {
    cwdSpy.mockRestore();
    cleanup(root);
  });

  it("--propose with no sessions → null proposal, exit 0", async () => {
    const cap = captureStdio();
    try {
      const code = await runPolicy(["--propose"]);
      expect(code).toBe(0);
      const parsed = JSON.parse(cap.stdout.join("")) as { proposal: unknown };
      expect(parsed.proposal).toBeNull();
    } finally {
      cap.restore();
    }
  });

  it("--apply density=generous writes the policy", async () => {
    const cap = captureStdio();
    try {
      const code = await runPolicy(["--apply", "density=generous"]);
      expect(code).toBe(0);
      const parsed = JSON.parse(cap.stdout.join("")) as { written: boolean };
      expect(parsed.written).toBe(true);
      const content = readFileSync(
        join(root, POLICY_DOCUMENT_RELATIVE_PATH),
        "utf8",
      );
      expect(content).toMatch(/density: generous/);
    } finally {
      cap.restore();
    }
  });

  it("--show with no policy.md prints the empty-marker text", async () => {
    const cap = captureStdio();
    try {
      const code = await runPolicy(["--show"]);
      expect(code).toBe(0);
      const out = cap.stdout.join("");
      // Output documents the absence (current impl: 'No policy file at ...').
      expect(out).toMatch(/No policy file|empty/i);
    } finally {
      cap.restore();
    }
  });

  it("--show with policy.md prints its content", async () => {
    mkdirSync(join(root, ".wisp"), { recursive: true });
    writeFileSync(
      join(root, POLICY_DOCUMENT_RELATIVE_PATH),
      "---\nacceptedAt: 2026-01-01T00:00:00.000Z\nsource: user-confirmed\naxes:\n  color: muted-accent\n---\n\nhello\n",
      "utf8",
    );
    const cap = captureStdio();
    try {
      const code = await runPolicy(["--show"]);
      expect(code).toBe(0);
      const out = cap.stdout.join("");
      expect(out).toMatch(/color: muted-accent/);
    } finally {
      cap.restore();
    }
  });

  it("bad/no flag → exit 2 (EXIT_ARG)", async () => {
    const cap = captureStdio();
    try {
      const code = await runPolicy([]);
      expect(code).toBe(2);
      expect(cap.stderr.join("")).toMatch(/BAD_FLAG/);
    } finally {
      cap.restore();
    }
  });

  it("--apply with unknown axis → exit 2", async () => {
    const cap = captureStdio();
    try {
      const code = await runPolicy(["--apply", "garbage=stuff"]);
      expect(code).toBe(2);
      expect(cap.stderr.join("")).toMatch(/BAD_FLAG|unknown axis/i);
    } finally {
      cap.restore();
    }
  });

  it("--apply with malformed value (no '=') → exit 2", async () => {
    const cap = captureStdio();
    try {
      const code = await runPolicy(["--apply", "density"]);
      // When value lacks `=`, flag parsing treats `density` as the apply value
      // and shape check rejects.
      expect(code).toBe(2);
    } finally {
      cap.restore();
    }
  });
});
