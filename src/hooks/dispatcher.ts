// wisp-design hook dispatcher.
//
// Phase 5 contract: the "stop" hook runs the anti-slop linter against the
// pending git-diff CSS on every Claude turn. p99 < 100ms is a HARD budget.
// Other hooks (user-prompt-submit, post-tool-use, session-end) remain
// drain-and-exit-0 until their phase lands.
//
// Stop-hook flow (full spec in docs/verification-gate.md § "Stop-Hook
// integration"):
//
//   1. start = Date.now()
//   2. drain stdin (Claude Code's hook payload, JSON; transcript_path used
//      for future trajectory-learning hooks — Phase 6).
//   3. budget-checkpoint: if (Date.now() - start) > BUDGET - 50ms → exit 0.
//      Stdin drain itself can spike on huge transcripts.
//   4. read `git diff HEAD --name-only` (via node:child_process execFileSync,
//      no shell, args = ["diff", "HEAD", "--name-only"]). Cap at 50 files.
//   5. filter to UI-source extensions (.tsx, .jsx, .vue, .svelte, .css,
//      .html). If empty → exit 0.
//   6. budget-checkpoint again.
//   7. dynamic-import `../verify/anti-slop-linter.js` (cached after first
//      turn — Node module-cache makes this a no-op on subsequent turns).
//   8. for each changed file, read CSS-relevant lines from the diff hunk
//      (or the file head if hunk extraction is too expensive) and call
//      `runAntiSlop(css, ctx)` from src/verify/gate.ts.
//   9. aggregate hard-ban hits across files.
//  10. on hard-ban:
//        - if process.env.WISP_DESIGN_STRICT === "1":
//            stdout.write(JSON.stringify({
//              permissionDecision: "block",
//              message: "wisp-design anti-slop blocked: <rule citation>"
//            }))
//          (Claude Code reads this JSON and surfaces it as a block decision.)
//        - else: stderr.write("wisp-design anti-slop warn: <citation>\n")
//          (non-blocking; user sees a warning but the turn proceeds.)
//  11. ALWAYS exit 0 unless strict-block path was taken (also exit 0 there
//      — Claude Code reads the JSON, the exit code is unused for block
//      decisions).
//
// Budget instrumentation: every checkpoint compares Date.now() against the
// STOP_HOOK_HARD_LIMIT_MS ceiling. Once approaching the limit, we abort
// remaining checks and emit only what we've found so far.

import { execFileSync } from "node:child_process";
import { extname } from "node:path";

import {
  STOP_HOOK_HARD_LIMIT_MS,
  type AntiSlopViolation,
} from "../contracts/verify.js";

// UI file extensions the stop-hook lints. Mirror of the linter's set; kept
// here so the dispatcher's git-diff filter is independent of the dynamic
// import (which only happens after the filter narrows the work).
const STOP_HOOK_UI_EXTENSIONS: ReadonlySet<string> = new Set([
  ".tsx",
  ".jsx",
  ".ts",
  ".js",
  ".vue",
  ".svelte",
  ".astro",
  ".html",
  ".htm",
  ".css",
  ".scss",
  ".sass",
]);

// `git diff HEAD --name-only` capped at 50 entries. Empty array when git is
// absent or the cwd is not a repo. The execFileSync call uses the ARGV form
// (no shell) so path-injection is impossible.
function stopHookGitChangedFiles(): string[] {
  try {
    const raw = execFileSync("git", ["diff", "HEAD", "--name-only"], {
      cwd: process.cwd(),
      encoding: "utf8",
      // STOP_HOOK_HARD_LIMIT_MS is 100ms; we give git a quarter of the
      // budget. On a healthy repo this returns in 1-2ms.
      timeout: Math.max(20, Math.floor(STOP_HOOK_HARD_LIMIT_MS / 4)),
    });
    return raw
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l !== "")
      .filter((p) => STOP_HOOK_UI_EXTENSIONS.has(extname(p).toLowerCase()))
      .slice(0, 50);
  } catch {
    return [];
  }
}

// Safety margin reserved for the "after-the-checkpoint" tail work (write
// to stderr, exit). Keeps us under the budget even when work has just
// finished at the checkpoint.
const STOP_HOOK_TAIL_RESERVE_MS = 15;

async function drainStdin(): Promise<string> {
  if (process.stdin.isTTY) return "";
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

// Budget helper — true if the stop hook should bail out NOW to stay under
// the p99 ceiling. Phase-5 coder calls this between each expensive step
// (git diff, file read, lint).
function budgetExceeded(startedAt: number): boolean {
  return Date.now() - startedAt > STOP_HOOK_HARD_LIMIT_MS - STOP_HOOK_TAIL_RESERVE_MS;
}

// Stop-hook entry. Wrapped in try/catch so any thrown error degrades to
// "exit 0, no decision" rather than blocking the user.
async function runStopHook(): Promise<number> {
  const started = Date.now();
  try {
    // 1. Drain stdin (Claude's hook payload). We don't parse it in Phase 5;
    //    Phase 6's trajectory-learning hook will. Discard the payload.
    await drainStdin().catch(() => "");

    // 2. Budget-checkpoint after stdin drain. Huge transcripts can spike.
    if (budgetExceeded(started)) return 0;

    // 3. Read git-changed UI files (capped, filtered). execFileSync uses the
    //    ARGV form — never a shell string — so path injection is impossible.
    const changedFiles = stopHookGitChangedFiles();
    if (changedFiles.length === 0) return 0;
    if (budgetExceeded(started)) return 0;

    // 4. Dynamic-import the linter. Node's module-cache amortises this after
    //    the first turn — typical re-import is <1ms.
    const { runAntiSlopOnFiles, formatBlockMessage, formatWarnMessage } =
      await import("../verify/anti-slop-linter.js");

    const result = await runAntiSlopOnFiles(changedFiles, {
      mode: "stop-hook",
      projectRoot: process.cwd(),
      budgetStartedAt: started,
    });

    const hardBanHits: AntiSlopViolation[] =
      result.violations === undefined
        ? []
        : (result.violations as AntiSlopViolation[]).filter(
            (v) => v.severity === "fail",
          );

    if (hardBanHits.length === 0) return 0;

    // 5. Emit. Strict mode → permissionDecision JSON on stdout (Claude Code
    //    reads it and blocks the turn). Default → stderr warn, exit 0.
    if (process.env.WISP_DESIGN_STRICT === "1") {
      const payload = JSON.stringify({
        permissionDecision: "block",
        message: formatBlockMessage(hardBanHits),
      });
      process.stdout.write(`${payload}\n`);
      return 0;
    }
    process.stderr.write(`${formatWarnMessage(hardBanHits)}\n`);
    return 0;
  } catch {
    // Defensive — never block on internal error. The Phase-5 contract is
    // "Stop-hook is best-effort warn-only". Exit 0 keeps the user
    // un-blocked even if the linter throws.
    return 0;
  }
}

export async function runHook(name: string | undefined): Promise<number> {
  // Drain stdin upfront for hooks that don't need it. Leaving the pipe full
  // would block Claude Code's hook executor. The "stop" branch drains
  // internally so it can budget-checkpoint after the drain.
  switch (name) {
    case "stop":
      return runStopHook();
    case "user-prompt-submit":
    case "post-tool-use":
    case "session-end":
      await drainStdin().catch(() => "");
      return 0;
    default:
      await drainStdin().catch(() => "");
      // Unknown hook — exit 0 so we don't block the harness.
      return 0;
  }
}
