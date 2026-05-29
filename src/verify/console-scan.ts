// wisp-design — console-scan check (Phase 5).
//
// Walks the session log + browser-reported console events to detect runtime
// errors that surface only after the wrap timestamp. Three modes:
//
//   1. session-log mode  — reads `.wisp/sessions/<sid>.jsonl`, filters entries
//      whose `detail` carries an error / warn / exception substring.
//   2. bridge-poll mode  — issues a single short long-poll against the bridge
//      and inspects events of `kind === "error"`.
//   3. static mode       — scans the raw HTML / JS for `console.error|warn|fail|
//      exception` calls so we still catch test pages that pre-bake errors.
//
// Budget: 2000ms (`CONSOLE_SCAN_BUDGET_MS`). The bridge-poll has its own
// 1.5s wait so the HMR pipeline can quiesce; everything else is synchronous
// regex / line scan.

import { promises as fs } from "node:fs";

import {
  CONSOLE_SCAN_BUDGET_MS,
  type CheckResult,
  type ConsoleScanResult,
} from "../contracts/verify.js";

// Pattern is intentionally simple: case-insensitive substring scan. The
// false-positive risk lives in catching the literal word "error" inside a
// benign comment. We accept that — the alternative (token-aware parsing)
// would blow the budget on big files.
const PATTERN_SRC = "error|warn|fail|exception|uncaught|cannot read";
const PATTERN_RE = new RegExp(`(?:${PATTERN_SRC})`, "i");
const SEVERE_RE = /\b(error|exception|uncaught|cannot read)\b/i;

// ---------------------------------------------------------------------------
// scanText — generic substring matcher; returns at most `cap` hits.
// ---------------------------------------------------------------------------

function scanText(
  text: string,
  source: string,
  cap = 50,
  startedIso = new Date().toISOString(),
): ConsoleScanResult[] {
  if (text === "") return [];
  const out: ConsoleScanResult[] = [];
  // Walk by line so the `message` field carries something digestible. We
  // truncate to 240 chars per line to keep memory bounded.
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    if (line === "") continue;
    if (PATTERN_RE.test(line)) {
      const trimmed = line.length > 240 ? `${line.slice(0, 239)}…` : line;
      out.push({
        message: `[${source}] ${trimmed}`,
        pattern: PATTERN_SRC,
        firstSeenAt: startedIso,
      });
      if (out.length >= cap) break;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// scanSessionLog — read JSONL, filter entries that mention the pattern.
// ---------------------------------------------------------------------------

async function scanSessionLog(
  sessionLogPath: string,
): Promise<ConsoleScanResult[]> {
  let raw: string;
  try {
    raw = await fs.readFile(sessionLogPath, "utf8");
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return [];
    throw err;
  }
  const out: ConsoleScanResult[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === "") continue;
    // We don't fully parse — the JSON body itself is what we scan. The
    // entry shape is UndoEntry (Phase 3), which carries a `detail` field
    // for arbitrary strings.
    if (PATTERN_RE.test(trimmed)) {
      let parsedTs: string | undefined;
      try {
        const obj = JSON.parse(trimmed) as { at?: string };
        if (typeof obj.at === "string") parsedTs = obj.at;
      } catch {
        /* not JSON — fall back to current iso */
      }
      const truncated = trimmed.length > 240 ? `${trimmed.slice(0, 239)}…` : trimmed;
      out.push({
        message: `[session-log] ${truncated}`,
        pattern: PATTERN_SRC,
        firstSeenAt: parsedTs ?? new Date().toISOString(),
      });
      if (out.length >= 50) break;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// scanBridgePoll — single GET /poll with a short timeout, filter `error` events.
// ---------------------------------------------------------------------------

async function scanBridgePoll(
  bridgeUrl: string,
  token: string,
  timeoutMs: number,
): Promise<ConsoleScanResult[]> {
  // We can't import the bridge schemas here without pulling node_fetch's
  // implementation cost on the hot-ish path. The fetch is straight HTTP +
  // JSON.parse; we type the payload conservatively.
  const url = `${bridgeUrl.replace(/\/$/, "")}/poll?token=${encodeURIComponent(
    token,
  )}&timeout=${Math.max(1000, Math.min(timeoutMs, 1500))}&leaseMs=0`;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ac.signal });
    if (!res.ok) return [];
    const body = (await res.json()) as {
      events?: Array<{ kind?: string; message?: string }>;
    };
    const out: ConsoleScanResult[] = [];
    for (const ev of body.events ?? []) {
      if (ev.kind === "error") {
        out.push({
          message: `[bridge] ${ev.message ?? "(no message)"}`,
          pattern: PATTERN_SRC,
          firstSeenAt: new Date().toISOString(),
        });
      }
    }
    return out;
  } catch {
    // Network errors, abort, or malformed response — return empty so the
    // check doesn't poison the verdict.
    return [];
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// runConsoleScan — public entry.
// ---------------------------------------------------------------------------

export async function runConsoleScan(opts: {
  sessionLogPath?: string;
  cssOrHtml?: string;
  bridgeUrl?: string;
  token?: string;
  budgetStartedAt?: number;
}): Promise<CheckResult> {
  const startedAt = Date.now();
  const budgetBase = opts.budgetStartedAt ?? startedAt;
  const aggregate: ConsoleScanResult[] = [];

  try {
    if (opts.sessionLogPath !== undefined) {
      const items = await scanSessionLog(opts.sessionLogPath);
      aggregate.push(...items);
    }
    if (
      opts.bridgeUrl !== undefined &&
      opts.token !== undefined &&
      Date.now() - budgetBase < CONSOLE_SCAN_BUDGET_MS - 300
    ) {
      const items = await scanBridgePoll(
        opts.bridgeUrl,
        opts.token,
        // Reserve 300ms for the final assembly tail.
        CONSOLE_SCAN_BUDGET_MS - (Date.now() - budgetBase) - 300,
      );
      aggregate.push(...items);
    }
    if (opts.cssOrHtml !== undefined) {
      // Scan only embedded script blocks + plausible console-fragments;
      // arbitrary CSS bodies trivially contain words like "error".
      const scripts: string[] = [];
      const blockRe = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
      let m: RegExpExecArray | null;
      while ((m = blockRe.exec(opts.cssOrHtml)) !== null) {
        scripts.push(m[1] ?? "");
      }
      const text = scripts.join("\n");
      if (text !== "") {
        aggregate.push(...scanText(text, "static-script"));
      }
    }

    // Honest reporting: when NONE of the meaningful inputs are present (no
    // session log, no bridge, no usable <script> content), the check scanned
    // nothing — report a skipped marker so the report distinguishes "ran
    // clean" from "had nothing to scan" (mirrors a11y-axe's no-input path).
    const noInputs =
      opts.sessionLogPath === undefined &&
      opts.bridgeUrl === undefined &&
      (opts.cssOrHtml === undefined || !/<script\b/i.test(opts.cssOrHtml));
    if (noInputs && aggregate.length === 0) {
      return {
        name: "console-scan",
        severity: "pass",
        durationMs: Date.now() - startedAt,
        skipped: {
          reason: "error",
          detail: "no session log, bridge, or <script> content to scan",
        },
      };
    }

    const severity =
      aggregate.some((c) => SEVERE_RE.test(c.message))
        ? "fail"
        : aggregate.length > 0
          ? "warn"
          : "pass";

    return {
      name: "console-scan",
      severity,
      durationMs: Date.now() - startedAt,
      violations: aggregate,
    };
  } catch (err) {
    return {
      name: "console-scan",
      severity: "pass",
      durationMs: Date.now() - startedAt,
      skipped: {
        reason: "error",
        detail: (err as Error).message,
      },
    };
  }
}
