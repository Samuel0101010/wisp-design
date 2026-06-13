// wisp-design — Session logger (Phase 6).
//
// Higher-level wrapper around the JSONL append-only file at
// `<projectRoot>/.wisp/sessions/<sessionId>.jsonl`. Delegates the actual
// append to `src/source/undo-stack.ts` (single writer for the file → no
// concurrent-append races, single rotation policy).
//
// Phase-3 file-op kinds (inject-script, accept-variant, …) are also written
// via undo-stack from the Phase-3 modules; this logger adds the Phase-6
// session-level kinds (session-start, pick, configure, variants-emitted, …).
// Both share the same JSONL file; the replay-builder folds the union.
//
// Invariants:
//   1. Validate every entry via SessionEventEntrySchema BEFORE writing —
//      malformed input never lands on disk.
//   2. Convenience helpers (logVariantsEmitted, logAccept, …) are thin
//      shorthands. Each emits exactly one `log()` call.
//   3. No retries, no buffering — `fs.appendFile` is the unit of durability.

import { promises as fs } from "node:fs";
import { dirname, join } from "node:path";

import { append as undoAppend } from "../source/undo-stack.js";
import {
  type SessionEventEntry,
  SessionEventEntrySchema,
  type SessionLoggerEndOptions,
  type SessionLoggerModule,
  type SessionLoggerOptions,
  type SessionLoggerStartOptions,
} from "../contracts/session.js";
import { sessionLogPathForTest as sessionLogPath } from "../source/undo-stack.js";

// ---------------------------------------------------------------------------
// Reload-Guard (Phase 7.16): `.wisp/` MUST be gitignored in the host project.
// Tailwind v4's automatic content detection scans every non-gitignored file —
// including our session JSONLs. Each log append then invalidates the host's
// CSS module graph and Vite fires a FULL PAGE RELOAD ~60ms after every
// Generate click, killing the browser's `generating` state before any
// cycling event can arrive (root-caused 2026-06-12: marker probes + CDP
// navigation initiator + mtime forensics). Appending `.wisp` to .gitignore
// breaks that chain for Vite+Tailwind v4 and keeps session logs out of the
// user's repo as a bonus. Best-effort and idempotent — a read-only FS must
// never block logging. NOTE: a running dev server reads .gitignore at boot,
// so the user may need one dev-server restart after the first append.
// ---------------------------------------------------------------------------

let gitignoreEnsuredFor: string | null = null;

export async function ensureWispGitignored(projectRoot: string): Promise<void> {
  if (gitignoreEnsuredFor === projectRoot) return;
  gitignoreEnsuredFor = projectRoot;
  const giPath = join(projectRoot, ".gitignore");
  try {
    const text = await fs.readFile(giPath, "utf8").catch(() => "");
    const covered = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .some((l) => l === ".wisp" || l === ".wisp/" || l === "/.wisp" || l === "/.wisp/");
    if (covered) return;
    const nl = text.length === 0 || text.endsWith("\n") ? "" : "\n";
    await fs.appendFile(giPath, `${nl}# wisp-design session logs (auto-added — prevents dev-server reload loops)\n.wisp\n`, "utf8");
  } catch {
    /* best-effort */
  }
}

// Test-only: reset the per-process memo so unit tests can exercise the guard
// against multiple temp projectRoots within one process.
export function resetGitignoreGuardForTest(): void {
  gitignoreEnsuredFor = null;
}

// ---------------------------------------------------------------------------
// Core append — schema-validate, then delegate to undo-stack so all writes
// to `<sessionId>.jsonl` go through one code path (atomic O_APPEND, rotation).
// ---------------------------------------------------------------------------

async function appendEntry(
  entry: SessionEventEntry,
  projectRoot: string,
): Promise<void> {
  const parsed = SessionEventEntrySchema.parse(entry);
  // Reload-Guard BEFORE the first byte lands in .wisp/ (see header above).
  await ensureWispGitignored(projectRoot);
  // undo-stack's `append` accepts UndoEntry; the SessionEventEntry schema is
  // a SUPER-set (it inherits UndoEntryKindSchema.options). The undo-stack
  // validator re-parses against UndoEntrySchema, which only knows Phase-3
  // kinds — so we route Phase-6-only kinds via a direct write that mirrors
  // the same atomic-append + rotation behaviour.
  //
  // Strategy:
  //   • If `kind` is in the Phase-3 UndoEntryKind subset, delegate to
  //     undoAppend (which path-validates + rotates + appends).
  //   • Else, perform the same low-level append ourselves — schema is
  //     already validated, sessionId is trustworthy (asserted below).
  if (isUndoKind(parsed.kind)) {
    // undoAppend's UndoEntrySchema requires a filePath; Phase-3 kinds always
    // have one. SessionEventEntrySchema marks it optional — assert here.
    if (parsed.filePath === undefined) {
      throw new Error(
        `session-logger: kind "${parsed.kind}" is a Phase-3 file-op and ` +
          `requires filePath; entry omitted it.`,
      );
    }
    await undoAppend(
      {
        ts: parsed.ts,
        sessionId: parsed.sessionId,
        kind: parsed.kind as
          | "inject-script"
          | "remove-script"
          | "wrap-variants"
          | "discard-variants"
          | "accept-variant"
          | "param-change"
          | "safety-refused",
        filePath: parsed.filePath,
        detail: parsed.detail,
        beforeSha256: parsed.beforeSha256,
        afterSha256: parsed.afterSha256,
      },
      { projectRoot },
    );
    return;
  }
  // Phase-6-only kind. Same atomic append as undo-stack.
  const path = sessionLogPath(parsed.sessionId, projectRoot);
  await fs.mkdir(dirname(path), { recursive: true });
  const line = JSON.stringify(parsed) + "\n";
  await fs.appendFile(path, line, { encoding: "utf8" });
}

const UNDO_KINDS: ReadonlySet<string> = new Set([
  "inject-script",
  "remove-script",
  "wrap-variants",
  "discard-variants",
  "accept-variant",
  "param-change",
  "safety-refused",
]);

function isUndoKind(kind: string): boolean {
  return UNDO_KINDS.has(kind);
}

function nowIso(): string {
  return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

async function start(
  sessionId: string,
  opts: SessionLoggerStartOptions,
): Promise<void> {
  await appendEntry(
    {
      ts: nowIso(),
      sessionId,
      kind: "session-start",
      detail: { meta: opts.meta ?? { projectRoot: opts.projectRoot } },
    },
    opts.projectRoot,
  );
}

async function log(
  entry: SessionEventEntry,
  opts: SessionLoggerOptions,
): Promise<void> {
  await appendEntry(entry, opts.projectRoot);
}

async function end(
  sessionId: string,
  opts: SessionLoggerEndOptions,
): Promise<void> {
  await appendEntry(
    {
      ts: nowIso(),
      sessionId,
      kind: "session-end",
      detail: {},
    },
    opts.projectRoot,
  );
}

// ---------------------------------------------------------------------------
// Convenience helpers — each produces exactly one log() entry.
// ---------------------------------------------------------------------------

async function logVariantsEmitted(
  sessionId: string,
  evt: {
    targetId: string;
    variants: Array<{ id: string; rationale: string; primaryAxis: string }>;
  },
  opts: SessionLoggerOptions,
): Promise<void> {
  await appendEntry(
    {
      ts: nowIso(),
      sessionId,
      kind: "variants-emitted",
      detail: {
        targetId: evt.targetId,
        variants: evt.variants,
      },
    },
    opts.projectRoot,
  );
}

async function logAccept(
  sessionId: string,
  evt: { variantId: string; filePath: string; targetId?: string; beforeSha256?: string; afterSha256?: string },
  opts: SessionLoggerOptions,
): Promise<void> {
  await appendEntry(
    {
      ts: nowIso(),
      sessionId,
      kind: "accept-variant",
      filePath: evt.filePath,
      ...(evt.beforeSha256 !== undefined ? { beforeSha256: evt.beforeSha256 } : {}),
      ...(evt.afterSha256 !== undefined ? { afterSha256: evt.afterSha256 } : {}),
      detail: {
        variantId: evt.variantId,
        ...(evt.targetId !== undefined ? { targetId: evt.targetId } : {}),
      },
    },
    opts.projectRoot,
  );
}

async function logVerifyReport(
  sessionId: string,
  evt: { verdict: string; hardBanCount: number; a11yFailCount: number },
  opts: SessionLoggerOptions,
): Promise<void> {
  await appendEntry(
    {
      ts: nowIso(),
      sessionId,
      kind: "verify-report",
      detail: {
        verdict: evt.verdict,
        hardBanCount: evt.hardBanCount,
        a11yFailCount: evt.a11yFailCount,
      },
    },
    opts.projectRoot,
  );
}

async function logPick(
  sessionId: string,
  evt: { selector: string; tag: string; targetId: string },
  opts: SessionLoggerOptions,
): Promise<void> {
  await appendEntry(
    {
      ts: nowIso(),
      sessionId,
      kind: "pick",
      detail: { selector: evt.selector, tag: evt.tag, targetId: evt.targetId },
    },
    opts.projectRoot,
  );
}

async function logConfigure(
  sessionId: string,
  evt: {
    targetId: string;
    freeText: string;
    codeSnippet?: string;
    variantCount?: number;
    deviation?: number;
  },
  opts: SessionLoggerOptions,
): Promise<void> {
  await appendEntry(
    {
      ts: nowIso(),
      sessionId,
      kind: "configure",
      detail: {
        targetId: evt.targetId,
        freeText: evt.freeText,
        // Phase 7.17 — full snippet kept for session replay (.wisp/ is
        // gitignored; size is bounded by CODE_SNIPPET_MAX_LEN).
        ...(evt.codeSnippet !== undefined ? { codeSnippet: evt.codeSnippet } : {}),
        // Phase 7.18 — variantCount + deviation logged so an external agent
        // can recover the FULL request even when its notification stream
        // truncated the event (root cause of "asked for 1, got 3").
        ...(evt.variantCount !== undefined ? { variantCount: evt.variantCount } : {}),
        ...(evt.deviation !== undefined ? { deviation: evt.deviation } : {}),
      },
    },
    opts.projectRoot,
  );
}

async function logCycleActiveChanged(
  sessionId: string,
  evt: { fromIndex: number; toIndex: number },
  opts: SessionLoggerOptions,
): Promise<void> {
  await appendEntry(
    {
      ts: nowIso(),
      sessionId,
      kind: "cycle-active-changed",
      detail: { fromIndex: evt.fromIndex, toIndex: evt.toIndex },
    },
    opts.projectRoot,
  );
}

async function logParamChanged(
  sessionId: string,
  evt: { varName: string; from: string; to: string },
  opts: SessionLoggerOptions,
): Promise<void> {
  await appendEntry(
    {
      ts: nowIso(),
      sessionId,
      kind: "param-changed",
      detail: { varName: evt.varName, from: evt.from, to: evt.to },
    },
    opts.projectRoot,
  );
}

async function logAnnotationAdded(
  sessionId: string,
  evt: { targetId: string; annotationKind: string; note: string },
  opts: SessionLoggerOptions,
): Promise<void> {
  await appendEntry(
    {
      ts: nowIso(),
      sessionId,
      kind: "annotation-added",
      detail: {
        targetId: evt.targetId,
        annotationKind: evt.annotationKind,
        note: evt.note,
      },
    },
    opts.projectRoot,
  );
}

async function logPolicyProposalShown(
  sessionId: string,
  evt: { axis: string; observation: string; proposed: string; triggerThreshold: number },
  opts: SessionLoggerOptions,
): Promise<void> {
  await appendEntry(
    {
      ts: nowIso(),
      sessionId,
      kind: "policy-proposal-shown",
      detail: {
        axis: evt.axis,
        observation: evt.observation,
        proposed: evt.proposed,
        triggerThreshold: evt.triggerThreshold,
      },
    },
    opts.projectRoot,
  );
}

async function logPolicyProposalAccepted(
  sessionId: string,
  evt: { axis: string },
  opts: SessionLoggerOptions,
): Promise<void> {
  await appendEntry(
    {
      ts: nowIso(),
      sessionId,
      kind: "policy-proposal-accepted",
      detail: { axis: evt.axis },
    },
    opts.projectRoot,
  );
}

async function logPolicyProposalDeclined(
  sessionId: string,
  evt: { axis: string },
  opts: SessionLoggerOptions,
): Promise<void> {
  await appendEntry(
    {
      ts: nowIso(),
      sessionId,
      kind: "policy-proposal-declined",
      detail: { axis: evt.axis },
    },
    opts.projectRoot,
  );
}

async function logMorphEngaged(
  sessionId: string,
  evt: { variantIdA: string; variantIdB: string; t: number },
  opts: SessionLoggerOptions,
): Promise<void> {
  await appendEntry(
    {
      ts: nowIso(),
      sessionId,
      kind: "morph-engaged",
      detail: { variantIdA: evt.variantIdA, variantIdB: evt.variantIdB, t: evt.t },
    },
    opts.projectRoot,
  );
}

async function logStructureVariantEmitted(
  sessionId: string,
  evt: { targetId: string; kinds: string[] },
  opts: SessionLoggerOptions,
): Promise<void> {
  await appendEntry(
    {
      ts: nowIso(),
      sessionId,
      kind: "structure-variant-emitted",
      detail: { targetId: evt.targetId, kinds: evt.kinds },
    },
    opts.projectRoot,
  );
}

async function logComponentLibDetected(
  sessionId: string,
  evt: { lib: string; confidence: number; preferredStrategy?: string },
  opts: SessionLoggerOptions,
): Promise<void> {
  await appendEntry(
    {
      ts: nowIso(),
      sessionId,
      kind: "component-lib-detected",
      detail: {
        lib: evt.lib,
        confidence: evt.confidence,
        ...(evt.preferredStrategy !== undefined
          ? { preferredStrategy: evt.preferredStrategy }
          : {}),
      },
    },
    opts.projectRoot,
  );
}

// ---------------------------------------------------------------------------
// Module export — matches `SessionLoggerModule` in the contract. The contract
// signature for `log()` is `(entry)` only; we expose a 2-arg variant + a
// helper bag for the agent-loop. Both call appendEntry under the hood.
// ---------------------------------------------------------------------------

export const sessionLogger: SessionLoggerModule & {
  log(entry: SessionEventEntry, opts: SessionLoggerOptions): Promise<void>;
  logPick: typeof logPick;
  logConfigure: typeof logConfigure;
  logCycleActiveChanged: typeof logCycleActiveChanged;
  logParamChanged: typeof logParamChanged;
  logAnnotationAdded: typeof logAnnotationAdded;
  logPolicyProposalShown: typeof logPolicyProposalShown;
  logPolicyProposalAccepted: typeof logPolicyProposalAccepted;
  logPolicyProposalDeclined: typeof logPolicyProposalDeclined;
  logMorphEngaged: typeof logMorphEngaged;
  logStructureVariantEmitted: typeof logStructureVariantEmitted;
  logComponentLibDetected: typeof logComponentLibDetected;
} = {
  start,
  // Contract: log(entry). The agent-loop calls log(entry, opts) — accept both.
  // `as never` reconciles the contract's 1-arg shape with the 2-arg call site;
  // the runtime check below picks the projectRoot.
  log: (async (
    entryOrEntry: SessionEventEntry,
    maybeOpts?: SessionLoggerOptions,
  ): Promise<void> => {
    if (maybeOpts === undefined) {
      // Contract-pure call: derive projectRoot from cwd. Used in tests that
      // set process.cwd() to a temp dir.
      await appendEntry(entryOrEntry, process.cwd());
      return;
    }
    await appendEntry(entryOrEntry, maybeOpts.projectRoot);
  }) as SessionLoggerModule["log"],
  end,
  logVariantsEmitted,
  logAccept,
  logVerifyReport,
  logPick,
  logConfigure,
  logCycleActiveChanged,
  logParamChanged,
  logAnnotationAdded,
  logPolicyProposalShown,
  logPolicyProposalAccepted,
  logPolicyProposalDeclined,
  logMorphEngaged,
  logStructureVariantEmitted,
  logComponentLibDetected,
};

export {
  appendEntry as _appendEntryForTest,
};
