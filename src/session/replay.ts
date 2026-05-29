// wisp-design — Session replay builder (Phase 6).
//
// Reads `<projectRoot>/.wisp/sessions/<sessionId>.jsonl` and folds it into a
// `SessionReplayTimeline`. Pure-ish — only I/O is reading the JSONL file +
// listing the sessions directory.
//
// Invariants:
//   1. Idempotent fold — re-reading the same file produces a byte-equivalent
//      timeline.
//   2. Malformed JSONL lines warn-skip; never throw.
//   3. `primaryAxisHistogram` counts ACCEPTED variants, not generated ones.
//      The accept's variantId is joined against the FIRST PRECEDING
//      `variants-emitted` entry to recover its primaryAxis.

import { promises as fs } from "node:fs";
import { dirname, join, resolve } from "node:path";

import {
  type SessionEventEntry,
  SessionEventEntrySchema,
  type SessionReplayModule,
  type SessionReplayTimeline,
} from "../contracts/session.js";

const SESSIONS_DIR = join(".wisp", "sessions");

function sessionsDir(projectRoot: string): string {
  return join(resolve(projectRoot), SESSIONS_DIR);
}

function sessionLogPath(projectRoot: string, sessionId: string): string {
  // Defensive: sessionId is appended directly to the sessions dir, so a value
  // containing path separators or `.`/`..` segments would escape
  // `.wisp/sessions/` and read an arbitrary `<x>.jsonl` on disk. The sibling
  // WRITER (src/source/undo-stack.ts) rejects exactly this; the reader must
  // too, or the writer's guard is defeated. See .fix-specs/session.md #1.
  if (
    sessionId.length === 0 ||
    sessionId.includes("/") ||
    sessionId.includes("\\") ||
    sessionId === "." ||
    sessionId === ".."
  ) {
    throw new Error(`session-replay: invalid sessionId "${sessionId}"`);
  }
  return join(sessionsDir(projectRoot), `${sessionId}.jsonl`);
}

// ---------------------------------------------------------------------------
// Read + parse a JSONL file → SessionEventEntry[]. Bad lines warned + skipped.
// ---------------------------------------------------------------------------

async function readEntries(path: string): Promise<SessionEventEntry[]> {
  let raw: string;
  try {
    raw = await fs.readFile(path, "utf8");
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return [];
    throw err;
  }
  const out: SessionEventEntry[] = [];
  const lines = raw.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line === undefined || line === "") continue;
    let obj: unknown;
    try {
      obj = JSON.parse(line);
    } catch {
      process.stderr.write(
        `[wisp-design] session-replay: skipping malformed JSON on line ${i + 1} of ${path}\n`,
      );
      continue;
    }
    const parsed = SessionEventEntrySchema.safeParse(obj);
    if (!parsed.success) {
      process.stderr.write(
        `[wisp-design] session-replay: skipping schema-invalid entry on line ${i + 1} of ${path}\n`,
      );
      continue;
    }
    out.push(parsed.data);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Build a primaryAxis lookup table — variantId → primaryAxis. Reads
// `variants-emitted` entries IN ORDER; the first occurrence of any given
// variantId wins (the fold is left-to-right idempotent).
// ---------------------------------------------------------------------------

function buildVariantAxisLookup(entries: SessionEventEntry[]): Map<string, string> {
  const lookup = new Map<string, string>();
  for (const entry of entries) {
    if (entry.kind !== "variants-emitted") continue;
    const variants = entry.detail?.["variants"];
    if (!Array.isArray(variants)) continue;
    for (const v of variants) {
      if (typeof v !== "object" || v === null) continue;
      const candidate = v as Record<string, unknown>;
      const id = candidate["id"];
      const axis = candidate["primaryAxis"];
      if (typeof id === "string" && typeof axis === "string" && !lookup.has(id)) {
        lookup.set(id, axis);
      }
    }
  }
  return lookup;
}

// ---------------------------------------------------------------------------
// Build a per-axis outcome map for the policy-proposal fold. The latest
// outcome for a given axis wins. `policy-proposal-shown` without a matching
// later `-accepted` / `-declined` defaults to "shown-only".
// ---------------------------------------------------------------------------

interface PolicyFoldRow {
  ts: string;
  axis: string;
  proposed: string;
  outcome: "accepted" | "declined" | "shown-only";
}

function foldPolicy(entries: SessionEventEntry[]): PolicyFoldRow[] {
  // axis → row. Rows mutate when a -accepted/-declined arrives after a -shown.
  const rows = new Map<string, PolicyFoldRow>();
  for (const entry of entries) {
    const axis = typeof entry.detail?.["axis"] === "string"
      ? (entry.detail["axis"] as string)
      : "";
    if (axis === "") continue;
    if (entry.kind === "policy-proposal-shown") {
      const proposed = typeof entry.detail?.["proposed"] === "string"
        ? (entry.detail["proposed"] as string)
        : "";
      rows.set(axis, {
        ts: entry.ts,
        axis,
        proposed,
        outcome: "shown-only",
      });
    } else if (entry.kind === "policy-proposal-accepted") {
      const existing = rows.get(axis);
      if (existing !== undefined) {
        existing.outcome = "accepted";
        existing.ts = entry.ts;
      } else {
        rows.set(axis, { ts: entry.ts, axis, proposed: "", outcome: "accepted" });
      }
    } else if (entry.kind === "policy-proposal-declined") {
      const existing = rows.get(axis);
      if (existing !== undefined) {
        existing.outcome = "declined";
        existing.ts = entry.ts;
      } else {
        rows.set(axis, { ts: entry.ts, axis, proposed: "", outcome: "declined" });
      }
    }
  }
  return [...rows.values()];
}

// ---------------------------------------------------------------------------
// Empty timeline factory — keeps invariants consistent (acceptRate is 0 not
// NaN when there are no variants).
// ---------------------------------------------------------------------------

function emptyTimeline(sessionId: string): SessionReplayTimeline {
  return {
    sessionId,
    startedAt: new Date(0).toISOString(),
    entriesCount: 0,
    picks: [],
    variantGenerations: [],
    accepts: [],
    discards: [],
    policyProposals: [],
    verifyReports: [],
    componentLibDetections: [],
    totalVariantsGenerated: 0,
    acceptRate: 0,
    primaryAxisHistogram: {},
  };
}

// ---------------------------------------------------------------------------
// buildTimeline
// ---------------------------------------------------------------------------

async function buildTimeline(
  sessionId: string,
  opts: { projectRoot: string },
): Promise<SessionReplayTimeline> {
  const path = sessionLogPath(opts.projectRoot, sessionId);
  const entries = await readEntries(path);
  if (entries.length === 0) {
    return emptyTimeline(sessionId);
  }
  const axisLookup = buildVariantAxisLookup(entries);

  const timeline = emptyTimeline(sessionId);
  timeline.entriesCount = entries.length;
  // startedAt = first entry's ts; overwritten if `session-start` is present.
  timeline.startedAt = entries[0]?.ts ?? timeline.startedAt;
  // endedAt = last entry's ts unless session-end provides one explicitly.
  let endedAt: string | undefined;

  for (const entry of entries) {
    if (entry.kind === "session-start") {
      timeline.startedAt = entry.ts;
      continue;
    }
    if (entry.kind === "session-end") {
      endedAt = entry.ts;
      continue;
    }
    if (entry.kind === "pick") {
      const selector = stringDetail(entry, "selector");
      const tag = stringDetail(entry, "tag");
      timeline.picks.push({ ts: entry.ts, selector, tag });
      continue;
    }
    if (entry.kind === "variants-emitted") {
      const targetId = stringDetail(entry, "targetId");
      const variants = arrayDetail(entry, "variants");
      const variantCount = variants.length;
      const rationales: string[] = [];
      for (const v of variants) {
        if (typeof v !== "object" || v === null) continue;
        const rationale = (v as Record<string, unknown>)["rationale"];
        if (typeof rationale === "string") rationales.push(rationale);
      }
      timeline.variantGenerations.push({
        ts: entry.ts,
        targetId,
        variantCount,
        rationales,
      });
      timeline.totalVariantsGenerated += variantCount;
      continue;
    }
    if (entry.kind === "accept-variant") {
      const variantId = stringDetail(entry, "variantId");
      const filePath = entry.filePath ?? "";
      timeline.accepts.push({ ts: entry.ts, variantId, filePath });
      // Axis histogram — count this accept under its variant's primaryAxis.
      const axis = axisLookup.get(variantId);
      if (axis !== undefined) {
        timeline.primaryAxisHistogram[axis] =
          (timeline.primaryAxisHistogram[axis] ?? 0) + 1;
      }
      continue;
    }
    if (entry.kind === "discard-variants") {
      const reason = stringDetail(entry, "reason");
      timeline.discards.push({ ts: entry.ts, reason });
      continue;
    }
    if (entry.kind === "verify-report") {
      const verdictRaw = stringDetail(entry, "verdict");
      const verdict =
        verdictRaw === "pass" || verdictRaw === "warn" || verdictRaw === "fail"
          ? verdictRaw
          : "warn";
      const hardBanCount = numberDetail(entry, "hardBanCount");
      const a11yFailCount = numberDetail(entry, "a11yFailCount");
      timeline.verifyReports.push({
        ts: entry.ts,
        verdict,
        hardBanCount,
        a11yFailCount,
      });
      continue;
    }
    if (entry.kind === "component-lib-detected") {
      const lib = stringDetail(entry, "lib");
      const confidence = numberDetail(entry, "confidence");
      timeline.componentLibDetections.push({ ts: entry.ts, lib, confidence });
      continue;
    }
    // policy-proposal-* are folded in a second pass to apply latest-wins
    // semantics correctly without buffering inside the main loop.
  }

  if (endedAt !== undefined) {
    timeline.endedAt = endedAt;
  } else {
    // Fall back to last entry's ts when there's no explicit session-end.
    const last = entries[entries.length - 1];
    if (last !== undefined) timeline.endedAt = last.ts;
  }

  // Policy fold — separate pass.
  const policyRows = foldPolicy(entries);
  timeline.policyProposals = policyRows.map((r) => ({
    ts: r.ts,
    axis: r.axis,
    proposed: r.proposed,
    outcome: r.outcome,
  }));

  // acceptRate — guard division by zero (timeline-empty case → 0, not NaN).
  timeline.acceptRate =
    timeline.totalVariantsGenerated > 0
      ? timeline.accepts.length / timeline.totalVariantsGenerated
      : 0;

  return timeline;
}

// ---------------------------------------------------------------------------
// Helpers for safe detail access — detail is `Record<string, unknown>`. We
// read with narrow type guards and fall back to defaults so a missing field
// never crashes the fold.
// ---------------------------------------------------------------------------

function stringDetail(entry: SessionEventEntry, key: string): string {
  const v = entry.detail?.[key];
  return typeof v === "string" ? v : "";
}

function numberDetail(entry: SessionEventEntry, key: string): number {
  const v = entry.detail?.[key];
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function arrayDetail(entry: SessionEventEntry, key: string): unknown[] {
  const v = entry.detail?.[key];
  return Array.isArray(v) ? v : [];
}

// ---------------------------------------------------------------------------
// listSessions — scan `.wisp/sessions/*.jsonl` (skip `.rotated`). Returns
// the first-line / last-line summary for each.
// ---------------------------------------------------------------------------

interface SessionSummary {
  sessionId: string;
  startedAt: string;
  endedAt?: string;
  entriesCount: number;
  mtimeMs: number;
}

async function listSessions(opts: { projectRoot: string }): Promise<
  Array<{ sessionId: string; startedAt: string; endedAt?: string; entriesCount: number }>
> {
  const dir = sessionsDir(opts.projectRoot);
  let dirents;
  try {
    dirents = await fs.readdir(dir, { withFileTypes: true });
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return [];
    throw err;
  }
  const out: SessionSummary[] = [];
  for (const entry of dirents) {
    if (!entry.isFile()) continue;
    const name = entry.name;
    if (!name.endsWith(".jsonl")) continue;
    // Skip rotated archives like `<sessionId>.jsonl.<ts>.rotated` (those
    // don't end with .jsonl).
    const sessionId = name.slice(0, -".jsonl".length);
    if (sessionId === "") continue;
    const abs = join(dir, name);
    let mtimeMs = 0;
    try {
      const st = await fs.stat(abs);
      mtimeMs = st.mtimeMs;
    } catch {
      continue;
    }
    const entries = await readEntries(abs);
    if (entries.length === 0) continue;
    const first = entries[0];
    const last = entries[entries.length - 1];
    if (first === undefined) continue;
    const summary: SessionSummary = {
      sessionId,
      startedAt: first.ts,
      entriesCount: entries.length,
      mtimeMs,
    };
    if (last !== undefined && last.kind === "session-end") {
      summary.endedAt = last.ts;
    }
    out.push(summary);
  }
  // Newest-first by mtime.
  out.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return out.map(({ sessionId, startedAt, endedAt, entriesCount }) => ({
    sessionId,
    startedAt,
    ...(endedAt !== undefined ? { endedAt } : {}),
    entriesCount,
  }));
}

// ---------------------------------------------------------------------------
// findMostRecentSession — used by `wisp-design history` when no --task is given.
// ---------------------------------------------------------------------------

export async function findMostRecentSessionId(
  projectRoot: string,
): Promise<string | null> {
  const sessions = await listSessions({ projectRoot });
  if (sessions.length === 0) return null;
  return sessions[0]?.sessionId ?? null;
}

// Internal export for the history CLI — reads raw entries for a session.
export async function readSessionEntries(
  projectRoot: string,
  sessionId: string,
): Promise<SessionEventEntry[]> {
  return readEntries(sessionLogPath(projectRoot, sessionId));
}

// Internal — make dirname() warning go away.
void dirname;

// ---------------------------------------------------------------------------
// Module export
// ---------------------------------------------------------------------------

export const sessionReplay: SessionReplayModule = {
  buildTimeline,
  listSessions,
};
