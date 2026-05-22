// wisp-design — Phase 3 undo-stack JSONL append/read/rotate tests.
//
// JSONL append-only at `<projectRoot>/.wisp/sessions/<sessionId>.jsonl`.
// One entry per line; rotation renames to `<sid>.jsonl.<ts>.rotated`.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  append,
  read,
  rotateIfTooLarge,
  sessionLogPathForTest,
} from "../../src/source/undo-stack.js";
import type { UndoEntry } from "../../src/contracts/source.js";

const SID = "test-session";

function makeRoot(): string {
  return mkdtempSync(join(tmpdir(), "wisp-undo-"));
}

function cleanup(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // best-effort
  }
}

function makeEntry(overrides: Partial<UndoEntry> = {}): UndoEntry {
  const base: UndoEntry = {
    ts: new Date().toISOString(),
    sessionId: SID,
    kind: "wrap-variants",
    filePath: "/tmp/x.tsx",
  };
  return { ...base, ...overrides };
}

describe("undo-stack — append + read", () => {
  let root: string;
  beforeEach(() => {
    root = makeRoot();
  });
  afterEach(() => cleanup(root));

  it("first append creates `.wisp/sessions/<sid>.jsonl`", async () => {
    const path = sessionLogPathForTest(SID, root);
    expect(existsSync(path)).toBe(false);
    await append(makeEntry(), { projectRoot: root });
    expect(existsSync(path)).toBe(true);
  });

  it("each append adds exactly one line ending in `\\n`", async () => {
    const path = sessionLogPathForTest(SID, root);
    await append(makeEntry(), { projectRoot: root });
    await append(makeEntry({ kind: "accept-variant" }), { projectRoot: root });
    const raw = readFileSync(path, "utf8");
    expect(raw.endsWith("\n")).toBe(true);
    // Trailing newline → final split slot is "". Two real entries → length 3.
    const parts = raw.split("\n");
    expect(parts.length).toBe(3);
    expect(parts[2]).toBe("");
  });

  it("schema-invalid entry rejected at append (throws)", async () => {
    const bad = { foo: "bar" } as unknown as UndoEntry;
    await expect(append(bad, { projectRoot: root })).rejects.toThrow();
  });

  it("read returns parsed entries in append order", async () => {
    const e1 = makeEntry({ kind: "wrap-variants" });
    const e2 = makeEntry({ kind: "accept-variant" });
    await append(e1, { projectRoot: root });
    await append(e2, { projectRoot: root });
    const entries = await read(SID, { projectRoot: root });
    expect(entries.length).toBe(2);
    expect(entries[0]?.kind).toBe("wrap-variants");
    expect(entries[1]?.kind).toBe("accept-variant");
  });

  it("read on non-existent session → empty array (no throw)", async () => {
    const entries = await read("never-existed", { projectRoot: root });
    expect(entries).toEqual([]);
  });

  it("read skips malformed JSON lines, warns to stderr", async () => {
    const path = sessionLogPathForTest(SID, root);
    await append(makeEntry(), { projectRoot: root });
    // Manually corrupt — append a non-JSON line in the middle.
    writeFileSync(path, readFileSync(path, "utf8") + "this is not json\n", {
      encoding: "utf8",
    });
    await append(makeEntry({ kind: "remove-script" }), { projectRoot: root });
    const entries = await read(SID, { projectRoot: root });
    // 2 valid entries; malformed line skipped.
    expect(entries.length).toBe(2);
  });

  it("read skips schema-invalid entries too", async () => {
    const path = sessionLogPathForTest(SID, root);
    await append(makeEntry(), { projectRoot: root });
    // Inject valid JSON that doesn't match UndoEntrySchema.
    writeFileSync(
      path,
      readFileSync(path, "utf8") + JSON.stringify({ foo: "bar" }) + "\n",
      { encoding: "utf8" },
    );
    const entries = await read(SID, { projectRoot: root });
    expect(entries.length).toBe(1);
  });

  it("sessionId with path-separator → rejected at append", async () => {
    const bad = makeEntry({ sessionId: "../escape" });
    await expect(append(bad, { projectRoot: root })).rejects.toThrow();
  });
});

describe("undo-stack — rotation", () => {
  let root: string;
  beforeEach(() => {
    root = makeRoot();
  });
  afterEach(() => cleanup(root));

  it("rotateIfTooLarge with smallMax rotates file to .<ts>.rotated, new file empty", async () => {
    const path = sessionLogPathForTest(SID, root);
    await append(makeEntry(), { projectRoot: root });
    // Force rotation by passing a tiny maxBytes that current size exceeds.
    await rotateIfTooLarge(SID, 1, { projectRoot: root });
    // Original active file should be gone; a rotated file must exist alongside.
    expect(existsSync(path)).toBe(false);
    const dir = join(root, ".wisp", "sessions");
    const siblings = readdirSync(dir).filter((n) => n.endsWith(".rotated"));
    expect(siblings.length).toBeGreaterThan(0);
  });

  it("after rotation: next append creates a fresh active file (only rotated history is preserved)", async () => {
    const path = sessionLogPathForTest(SID, root);
    await append(makeEntry({ kind: "wrap-variants" }), { projectRoot: root });
    await rotateIfTooLarge(SID, 1, { projectRoot: root });
    expect(existsSync(path)).toBe(false);
    // Next append is automatic rotation-aware (append internally rotates too,
    // but here we just verify the post-rotation write path).
    await append(makeEntry({ kind: "accept-variant" }), { projectRoot: root });
    expect(existsSync(path)).toBe(true);
    const entries = await read(SID, { projectRoot: root });
    expect(entries.length).toBe(1);
    expect(entries[0]?.kind).toBe("accept-variant");
  });

  it("rotation skipped when file is under maxBytes", async () => {
    const path = sessionLogPathForTest(SID, root);
    await append(makeEntry(), { projectRoot: root });
    const before = readFileSync(path, "utf8");
    await rotateIfTooLarge(SID, 10 * 1024 * 1024, { projectRoot: root });
    expect(existsSync(path)).toBe(true);
    expect(readFileSync(path, "utf8")).toBe(before);
  });

  it("rotateIfTooLarge on non-existent session → no-op", async () => {
    await expect(
      rotateIfTooLarge("never", 1, { projectRoot: root }),
    ).resolves.toBeUndefined();
  });

  it("automatic rotation inside append when maxBytes exceeded", async () => {
    // First append, then a second append with maxBytes=1 → triggers rotation
    // before write → second entry is the only entry in the new active file.
    await append(makeEntry({ kind: "wrap-variants" }), { projectRoot: root });
    await append(makeEntry({ kind: "accept-variant" }), {
      projectRoot: root,
      maxBytes: 1,
    });
    const entries = await read(SID, { projectRoot: root });
    expect(entries.length).toBe(1);
    expect(entries[0]?.kind).toBe("accept-variant");
  });
});
