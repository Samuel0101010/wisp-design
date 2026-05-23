// wisp-design — Phase 6 `wisp-design history` CLI tests.
//
// Validates: --list, --task, --replay, --format (text/json/markdown), exit codes.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runHistory } from "../../src/agent/history.js";
import type { SessionReplayTimeline } from "../../src/contracts/session.js";

function makeRoot(): string {
  return mkdtempSync(join(tmpdir(), "wisp-history-"));
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

const ISO0 = "2026-05-22T10:00:00.000Z";
const ISO1 = "2026-05-22T10:00:01.000Z";
const ISO2 = "2026-05-22T10:00:02.000Z";

describe("runHistory --list", () => {
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

  it("empty .wisp/ — prints 'No sessions found', exits 0", async () => {
    const cap = captureStdio();
    try {
      const code = await runHistory(["--list"]);
      expect(code).toBe(0);
      expect(cap.stdout.join("")).toMatch(/No sessions found/i);
    } finally {
      cap.restore();
    }
  });

  it("--list --format json empty → '[]'", async () => {
    const cap = captureStdio();
    try {
      const code = await runHistory(["--list", "--format", "json"]);
      expect(code).toBe(0);
      const parsed = JSON.parse(cap.stdout.join(""));
      expect(parsed).toEqual([]);
    } finally {
      cap.restore();
    }
  });

  it("--list --format json with sessions → array of summaries", async () => {
    writeJsonl(root, "sa", [
      { ts: ISO0, sessionId: "sa", kind: "session-start", detail: {} },
      { ts: ISO1, sessionId: "sa", kind: "session-end", detail: {} },
    ]);
    const cap = captureStdio();
    try {
      const code = await runHistory(["--list", "--format", "json"]);
      expect(code).toBe(0);
      const parsed = JSON.parse(cap.stdout.join("")) as Array<{
        sessionId: string;
        startedAt: string;
        endedAt?: string;
        entriesCount: number;
      }>;
      expect(parsed).toHaveLength(1);
      expect(parsed[0]?.sessionId).toBe("sa");
      expect(parsed[0]?.entriesCount).toBe(2);
      expect(parsed[0]?.endedAt).toBe(ISO1);
    } finally {
      cap.restore();
    }
  });

  it("--list --format markdown has table syntax", async () => {
    writeJsonl(root, "sa", [
      { ts: ISO0, sessionId: "sa", kind: "session-start", detail: {} },
    ]);
    const cap = captureStdio();
    try {
      const code = await runHistory(["--list", "--format", "markdown"]);
      expect(code).toBe(0);
      const out = cap.stdout.join("");
      expect(out).toMatch(/\|.*Session.*\|/);
      expect(out).toMatch(/\|---/);
    } finally {
      cap.restore();
    }
  });
});

describe("runHistory (default = most recent)", () => {
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

  it("no sessions → SESSION_NOT_FOUND, exit 1", async () => {
    const cap = captureStdio();
    try {
      const code = await runHistory([]);
      expect(code).toBe(1);
      const errText = cap.stderr.join("");
      expect(errText).toMatch(/SESSION_NOT_FOUND/);
    } finally {
      cap.restore();
    }
  });

  it("renders the most-recent session timeline as text", async () => {
    writeJsonl(root, "sa", [
      { ts: ISO0, sessionId: "sa", kind: "session-start", detail: {} },
      {
        ts: ISO1,
        sessionId: "sa",
        kind: "pick",
        detail: { selector: "#x", tag: "div", targetId: "T1" },
      },
      { ts: ISO2, sessionId: "sa", kind: "session-end", detail: {} },
    ]);
    const cap = captureStdio();
    try {
      const code = await runHistory([]);
      expect(code).toBe(0);
      const out = cap.stdout.join("");
      expect(out).toMatch(/Session sa/);
      expect(out).toMatch(/pick/);
    } finally {
      cap.restore();
    }
  });

  it("--task <sessionId> renders that specific timeline", async () => {
    writeJsonl(root, "alpha", [
      { ts: ISO0, sessionId: "alpha", kind: "session-start", detail: {} },
    ]);
    writeJsonl(root, "beta", [
      { ts: ISO1, sessionId: "beta", kind: "session-start", detail: {} },
    ]);
    const cap = captureStdio();
    try {
      const code = await runHistory(["--task", "alpha"]);
      expect(code).toBe(0);
      const out = cap.stdout.join("");
      expect(out).toMatch(/Session alpha/);
      expect(out).not.toMatch(/Session beta/);
    } finally {
      cap.restore();
    }
  });

  it("--task <bogus> → SESSION_NOT_FOUND, exit 1", async () => {
    const cap = captureStdio();
    try {
      const code = await runHistory(["--task", "bogus"]);
      expect(code).toBe(1);
      expect(cap.stderr.join("")).toMatch(/SESSION_NOT_FOUND/);
    } finally {
      cap.restore();
    }
  });

  it("--format json renders a parseable SessionReplayTimeline", async () => {
    writeJsonl(root, "sa", [
      { ts: ISO0, sessionId: "sa", kind: "session-start", detail: {} },
      {
        ts: ISO1,
        sessionId: "sa",
        kind: "variants-emitted",
        detail: {
          targetId: "T",
          variants: [
            { id: "v1", rationale: "r", primaryAxis: "color" },
          ],
        },
      },
    ]);
    const cap = captureStdio();
    try {
      const code = await runHistory(["--task", "sa", "--format", "json"]);
      expect(code).toBe(0);
      const parsed = JSON.parse(cap.stdout.join("")) as SessionReplayTimeline;
      expect(parsed.sessionId).toBe("sa");
      expect(parsed.variantGenerations).toHaveLength(1);
      expect(parsed.totalVariantsGenerated).toBe(1);
    } finally {
      cap.restore();
    }
  });

  it("--format markdown emits a markdown table", async () => {
    writeJsonl(root, "sa", [
      { ts: ISO0, sessionId: "sa", kind: "session-start", detail: {} },
      {
        ts: ISO1,
        sessionId: "sa",
        kind: "pick",
        detail: { selector: "#x", tag: "div", targetId: "T" },
      },
    ]);
    const cap = captureStdio();
    try {
      const code = await runHistory(["--task", "sa", "--format", "markdown"]);
      expect(code).toBe(0);
      const out = cap.stdout.join("");
      expect(out).toMatch(/^# Session/m);
      expect(out).toMatch(/\| Time \| Kind \| Detail \|/);
    } finally {
      cap.restore();
    }
  });
});

describe("runHistory — error paths", () => {
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

  it("--replay → NOT_IMPLEMENTED, exit non-zero", async () => {
    const cap = captureStdio();
    try {
      const code = await runHistory(["--replay"]);
      // Documented to return EXIT_INTERNAL (3) for the Phase-7 stub.
      expect(code).not.toBe(0);
      expect(cap.stderr.join("")).toMatch(/NOT_IMPLEMENTED/);
    } finally {
      cap.restore();
    }
  });

  it("bad --format value → exit 2 (EXIT_ARG)", async () => {
    const cap = captureStdio();
    try {
      const code = await runHistory(["--format", "garbage"]);
      expect(code).toBe(2);
      expect(cap.stderr.join("")).toMatch(/BAD_FLAG/);
    } finally {
      cap.restore();
    }
  });
});
