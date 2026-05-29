// wisp-design — `wisp-design history` CLI runner (Phase 6).
//
// Surface:
//   wisp-design history                       # most recent session, text format
//   wisp-design history --task <sessionId>    # specific session
//   wisp-design history --list                # all sessions, newest first
//   wisp-design history --replay              # step-through (Phase 7+, stub)
//   wisp-design history --format text|json|markdown
//
// Exit codes:
//   0 — ok
//   1 — session not found / IO error
//   2 — bad flag
//   3 — internal/IO error after parsing

import {
  type SessionReplayTimeline,
} from "../contracts/session.js";
import {
  findMostRecentSessionId,
  sessionReplay,
} from "../session/replay.js";
import {
  EXIT_ARG,
  EXIT_IO,
  EXIT_OK,
  flagAsBoolean,
  flagAsString,
  parseFlags,
  writeError,
  writeJsonResult,
} from "./_helpers.js";

const EXIT_NOT_FOUND = 1;
const EXIT_INTERNAL = 3;

type Format = "text" | "json" | "markdown";

function parseFormat(raw: string | undefined): Format | null {
  if (raw === undefined) return "text";
  if (raw === "text" || raw === "json" || raw === "markdown") return raw;
  return null;
}

// A `--task` id is appended to `.wisp/sessions/<id>.jsonl`. Reject path
// separators / dot-segments so a traversal id (e.g. `../../secret`) can't
// escape the sessions dir and read an arbitrary file. Mirrors the guard in
// src/session/replay.ts:sessionLogPath. See .fix-specs/session.md #1.
function isSafeTaskId(id: string): boolean {
  return (
    id.length > 0 &&
    !id.includes("/") &&
    !id.includes("\\") &&
    id !== "." &&
    id !== ".."
  );
}

// ---------------------------------------------------------------------------
// Render — text / json / markdown.
// ---------------------------------------------------------------------------

function formatShortTs(ts: string): string {
  // Display hh:mm:ss in UTC for stable formatting across host locales.
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  const ss = String(d.getUTCSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function formatDateTs(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${formatShortTs(ts)}`;
}

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function renderText(timeline: SessionReplayTimeline): string {
  const lines: string[] = [];
  const endLabel =
    timeline.endedAt !== undefined ? formatShortTs(timeline.endedAt) : "—";
  lines.push(
    `Session ${timeline.sessionId} (${formatDateTs(timeline.startedAt)} → ${endLabel}, ${timeline.entriesCount} entries)`,
  );
  lines.push("");

  // Merged timeline — combine slices in chronological order.
  type Row = { ts: string; line: string };
  const rows: Row[] = [];
  for (const p of timeline.picks) {
    rows.push({ ts: p.ts, line: `pick      ${p.tag} ${p.selector ? `(${p.selector})` : ""}` });
  }
  for (const v of timeline.variantGenerations) {
    const summary =
      v.rationales.length > 0
        ? ` — ${v.rationales.map((r) => r.split(/[—:.]/)[0]?.trim() ?? r).filter(Boolean).join(" / ")}`
        : "";
    rows.push({
      ts: v.ts,
      line: `variants-emitted (${v.variantCount})${summary}`,
    });
  }
  for (const a of timeline.accepts) {
    rows.push({ ts: a.ts, line: `accept-variant  ${a.variantId} → ${a.filePath || "?"}` });
  }
  for (const d of timeline.discards) {
    rows.push({ ts: d.ts, line: `discard-variants — ${d.reason || "(no reason)"}` });
  }
  for (const v of timeline.verifyReports) {
    rows.push({
      ts: v.ts,
      line: `verify-report   verdict=${v.verdict} hardBans=${v.hardBanCount} a11yFails=${v.a11yFailCount}`,
    });
  }
  for (const p of timeline.policyProposals) {
    rows.push({
      ts: p.ts,
      line: `policy-proposal axis=${p.axis} outcome=${p.outcome}`,
    });
  }
  for (const c of timeline.componentLibDetections) {
    rows.push({
      ts: c.ts,
      line: `component-lib   lib=${c.lib} confidence=${c.confidence.toFixed(2)}`,
    });
  }
  rows.sort((a, b) => a.ts.localeCompare(b.ts));
  for (const r of rows) {
    lines.push(`${formatShortTs(r.ts)}  ${r.line}`);
  }

  lines.push("");
  lines.push("Aggregates:");
  lines.push(`  Total variants generated: ${timeline.totalVariantsGenerated}`);
  lines.push(
    `  Accept rate: ${pct(timeline.acceptRate)} (${timeline.accepts.length}/${timeline.totalVariantsGenerated})`,
  );
  const histo = Object.entries(timeline.primaryAxisHistogram).sort(
    (a, b) => b[1] - a[1],
  );
  if (histo.length === 0) {
    lines.push(`  Primary-axis histogram: (no accepts)`);
  } else {
    lines.push(
      `  Primary-axis histogram: ${histo.map(([k, v]) => `${k}=${v}`).join(", ")}`,
    );
  }
  return lines.join("\n") + "\n";
}

function renderMarkdown(timeline: SessionReplayTimeline): string {
  const lines: string[] = [];
  const endLabel =
    timeline.endedAt !== undefined ? formatShortTs(timeline.endedAt) : "—";
  lines.push(`# Session \`${timeline.sessionId}\``);
  lines.push("");
  lines.push(
    `**${formatDateTs(timeline.startedAt)} → ${endLabel}** · ${timeline.entriesCount} entries`,
  );
  lines.push("");
  lines.push("## Timeline");
  lines.push("");
  lines.push("| Time | Kind | Detail |");
  lines.push("|---|---|---|");

  type Row = { ts: string; kind: string; detail: string };
  const rows: Row[] = [];
  for (const p of timeline.picks) {
    rows.push({
      ts: p.ts,
      kind: "pick",
      detail: `\`${p.tag}\` ${p.selector ? `(${p.selector})` : ""}`,
    });
  }
  for (const v of timeline.variantGenerations) {
    rows.push({
      ts: v.ts,
      kind: "variants-emitted",
      detail: `${v.variantCount} variants${v.rationales.length > 0 ? ` — ${v.rationales.join(" · ")}` : ""}`,
    });
  }
  for (const a of timeline.accepts) {
    rows.push({
      ts: a.ts,
      kind: "accept-variant",
      detail: `\`${a.variantId}\` → \`${a.filePath || "?"}\``,
    });
  }
  for (const d of timeline.discards) {
    rows.push({ ts: d.ts, kind: "discard-variants", detail: d.reason });
  }
  for (const v of timeline.verifyReports) {
    rows.push({
      ts: v.ts,
      kind: "verify-report",
      detail: `verdict=${v.verdict}, hardBans=${v.hardBanCount}, a11yFails=${v.a11yFailCount}`,
    });
  }
  for (const p of timeline.policyProposals) {
    rows.push({
      ts: p.ts,
      kind: "policy-proposal",
      detail: `axis=${p.axis}, outcome=${p.outcome}`,
    });
  }
  for (const c of timeline.componentLibDetections) {
    rows.push({
      ts: c.ts,
      kind: "component-lib-detected",
      detail: `lib=${c.lib}, confidence=${c.confidence.toFixed(2)}`,
    });
  }
  rows.sort((a, b) => a.ts.localeCompare(b.ts));
  for (const r of rows) {
    lines.push(`| ${formatShortTs(r.ts)} | ${r.kind} | ${r.detail} |`);
  }

  lines.push("");
  lines.push("## Aggregates");
  lines.push("");
  lines.push("| Metric | Value |");
  lines.push("|---|---|");
  lines.push(
    `| Total variants generated | ${timeline.totalVariantsGenerated} |`,
  );
  lines.push(
    `| Accept rate | ${pct(timeline.acceptRate)} (${timeline.accepts.length}/${timeline.totalVariantsGenerated}) |`,
  );
  const histo = Object.entries(timeline.primaryAxisHistogram).sort(
    (a, b) => b[1] - a[1],
  );
  for (const [k, v] of histo) {
    lines.push(`| primaryAxis: ${k} | ${v} |`);
  }
  return lines.join("\n") + "\n";
}

// ---------------------------------------------------------------------------
// List rendering
// ---------------------------------------------------------------------------

interface SessionRow {
  sessionId: string;
  startedAt: string;
  endedAt?: string;
  entriesCount: number;
}

function renderListText(sessions: SessionRow[]): string {
  if (sessions.length === 0) {
    return "No sessions found in .wisp/sessions/.\n";
  }
  const lines: string[] = [];
  lines.push("Sessions (newest first):");
  lines.push("");
  for (const s of sessions) {
    const end = s.endedAt !== undefined ? formatDateTs(s.endedAt) : "(open)";
    lines.push(
      `  ${s.sessionId}  ${formatDateTs(s.startedAt)} → ${end}  (${s.entriesCount} entries)`,
    );
  }
  return lines.join("\n") + "\n";
}

function renderListMarkdown(sessions: SessionRow[]): string {
  if (sessions.length === 0) {
    return "No sessions found in `.wisp/sessions/`.\n";
  }
  const lines: string[] = [];
  lines.push("# Sessions");
  lines.push("");
  lines.push("| Session | Started | Ended | Entries |");
  lines.push("|---|---|---|---|");
  for (const s of sessions) {
    const end = s.endedAt !== undefined ? formatDateTs(s.endedAt) : "(open)";
    lines.push(
      `| \`${s.sessionId}\` | ${formatDateTs(s.startedAt)} | ${end} | ${s.entriesCount} |`,
    );
  }
  return lines.join("\n") + "\n";
}

// ---------------------------------------------------------------------------
// CLI entry — runHistory.
// ---------------------------------------------------------------------------

export async function runHistory(args: string[]): Promise<number> {
  const parsed = parseFlags(args);
  const formatRaw = flagAsString(parsed, "format");
  const format = parseFormat(formatRaw);
  if (format === null) {
    writeError({
      code: "BAD_FLAG",
      message: `history: --format must be one of text|json|markdown, got "${formatRaw}"`,
    });
    return EXIT_ARG;
  }
  const list = flagAsBoolean(parsed, "list", false);
  const replay = flagAsBoolean(parsed, "replay", false);
  const taskId = flagAsString(parsed, "task");

  const projectRoot = process.cwd();

  // --list path.
  if (list) {
    try {
      const sessions = await sessionReplay.listSessions({ projectRoot });
      if (format === "json") {
        writeJsonResult(sessions);
      } else if (format === "markdown") {
        process.stdout.write(renderListMarkdown(sessions));
      } else {
        process.stdout.write(renderListText(sessions));
      }
      return EXIT_OK;
    } catch (err) {
      writeError({
        code: "HISTORY_LIST_FAILED",
        message: (err as Error).message,
      });
      return EXIT_INTERNAL;
    }
  }

  // --replay path. Phase-7+ feature; stub here.
  if (replay) {
    writeError({
      code: "NOT_IMPLEMENTED",
      message:
        "history --replay: re-executing the timeline against the bridge is a Phase-7+ feature; not implemented yet.",
    });
    return EXIT_INTERNAL;
  }

  // Single-session render path.
  let sessionId: string | null;
  if (taskId !== undefined && taskId !== "") {
    if (!isSafeTaskId(taskId)) {
      writeError({
        code: "BAD_TASK_ID",
        message: `history: --task id must not contain path separators or dot-segments, got "${taskId}"`,
      });
      return EXIT_ARG;
    }
    sessionId = taskId;
  } else {
    try {
      sessionId = await findMostRecentSessionId(projectRoot);
    } catch (err) {
      writeError({
        code: "HISTORY_LIST_FAILED",
        message: (err as Error).message,
      });
      return EXIT_INTERNAL;
    }
  }
  if (sessionId === null) {
    writeError({
      code: "SESSION_NOT_FOUND",
      message:
        "history: no sessions found in .wisp/sessions/. Run `wisp-design live` to start one.",
    });
    return EXIT_NOT_FOUND;
  }

  let timeline: SessionReplayTimeline;
  try {
    timeline = await sessionReplay.buildTimeline(sessionId, { projectRoot });
  } catch (err) {
    writeError({
      code: "HISTORY_BUILD_FAILED",
      message: (err as Error).message,
    });
    return EXIT_INTERNAL;
  }

  // If buildTimeline returned an empty timeline AND the user specified a
  // sessionId that doesn't exist on disk, treat that as "not found".
  if (timeline.entriesCount === 0 && taskId !== undefined && taskId !== "") {
    writeError({
      code: "SESSION_NOT_FOUND",
      message: `history: session "${sessionId}" has no entries (or file missing).`,
    });
    return EXIT_NOT_FOUND;
  }

  if (format === "json") {
    writeJsonResult(timeline);
  } else if (format === "markdown") {
    process.stdout.write(renderMarkdown(timeline));
  } else {
    process.stdout.write(renderText(timeline));
  }
  // EXIT_IO is reserved by convention for bridge-side problems; history is
  // disk-only, so we map runtime failures to EXIT_INTERNAL (3) instead.
  void EXIT_IO;
  return EXIT_OK;
}
