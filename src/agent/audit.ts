// wisp-design — `wisp-design audit` CLI runner (Phase 5).
//
// Surface:
//   wisp-design audit                       # mode=fast (anti-slop only)
//   wisp-design audit --mode full           # all 6 checks, warn-only
//   wisp-design audit --mode strict         # all 6, hard-block on fail
//   wisp-design audit --screenshot          # forces multi-viewport mode
//   wisp-design audit --format json|text|markdown
//   wisp-design audit --fail-on-warn        # CI knob — exit 1 on warn
//   wisp-design audit path/to/*.tsx         # explicit paths; else git diff

import { execFileSync } from "node:child_process";
import { promises as fs } from "node:fs";
import { extname, resolve } from "node:path";

import {
  AuditOptionsSchema,
  type CheckResult,
  type VerifyContext,
  type VerifyMode,
  type VerifyReport,
} from "../contracts/verify.js";
import {
  EXIT_ARG,
  EXIT_IO,
  EXIT_OK,
  flagAsBoolean,
  flagAsString,
  parseFlags,
  writeError,
} from "./_helpers.js";

// Exit code reserved for "gate orchestrator threw something genuinely
// unexpected". Kept separate from EXIT_IO so the CLI can distinguish a
// missing-file error from a bug in the orchestrator.
const EXIT_GATE = 3;

// UI extensions audit considers — must match anti-slop-linter's set.
const UI_EXTENSIONS: ReadonlySet<string> = new Set([
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

// ---------------------------------------------------------------------------
// Mode translation. The user-facing labels (`fast`/`full`/`strict`) live in
// AuditOptionsSchema; the internal VerifyMode union has finer-grained
// `live-with-screenshot`.
// ---------------------------------------------------------------------------

function modeFor(opts: {
  mode: "fast" | "full" | "strict";
  screenshotEnabled: boolean;
}): VerifyMode {
  if (opts.mode === "strict") return "audit-strict";
  if (opts.mode === "full") {
    return opts.screenshotEnabled ? "live-with-screenshot" : "audit";
  }
  return "stop-hook";
}

// ---------------------------------------------------------------------------
// `git diff HEAD --name-only` — returns relative paths; cap at 50.
// ENOENT (no git) or non-repo → empty list.
// ---------------------------------------------------------------------------

function gitChangedFiles(cwd: string, cap = 50): string[] {
  try {
    const raw = execFileSync("git", ["diff", "HEAD", "--name-only"], {
      cwd,
      encoding: "utf8",
      timeout: 3_000,
    });
    const lines = raw
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l !== "");
    return lines.slice(0, cap);
  } catch {
    return [];
  }
}

function filterUiFiles(files: string[]): string[] {
  return files.filter((f) => UI_EXTENSIONS.has(extname(f).toLowerCase()));
}

// ---------------------------------------------------------------------------
// Output formatters.
// ---------------------------------------------------------------------------

function renderText(reports: VerifyReport[]): string {
  if (reports.length === 0) return "wisp-design audit: nothing to check.\n";
  const lines: string[] = [];
  for (const r of reports) {
    lines.push(`mode=${r.mode}  verdict=${r.verdict}  blocked=${r.blocked}`);
    lines.push(
      `  checks: ${r.checks.length}   hard-bans: ${r.hardBanCount}   a11y-fails: ${r.a11yFailCount}   warns: ${r.warningCount}`,
    );
    lines.push(
      `  timing: ${r.timing.totalMs}ms / ${r.timing.budgetMs}ms${r.timing.budgetExceeded ? "  (over-budget)" : ""}`,
    );
    for (const c of r.checks) {
      const skip = c.skipped !== undefined ? `  [skipped: ${c.skipped.reason}]` : "";
      const violations = c.violations?.length ?? 0;
      lines.push(`    • ${c.name}: ${c.severity}   ${c.durationMs}ms${skip}   violations=${violations}`);
      if (c.violations !== undefined) {
        for (const v of c.violations.slice(0, 3)) {
          const messageField =
            "message" in v && typeof (v as { message?: unknown }).message === "string"
              ? (v as { message: string }).message
              : "";
          const ruleField =
            "ruleId" in v && typeof (v as { ruleId?: unknown }).ruleId === "string"
              ? (v as { ruleId: string }).ruleId
              : c.name;
          lines.push(`        - ${ruleField}: ${messageField}`);
        }
        if (c.violations.length > 3) {
          lines.push(`        - …and ${c.violations.length - 3} more.`);
        }
      }
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

function renderMarkdown(reports: VerifyReport[]): string {
  if (reports.length === 0) return "_wisp-design audit: nothing to check._\n";
  const lines: string[] = [
    "## wisp-design audit",
    "",
    "| mode | verdict | blocked | hard-bans | a11y-fails | warns | timing |",
    "|---|---|---|---|---|---|---|",
  ];
  for (const r of reports) {
    lines.push(
      `| ${r.mode} | ${r.verdict} | ${r.blocked} | ${r.hardBanCount} | ${r.a11yFailCount} | ${r.warningCount} | ${r.timing.totalMs}ms / ${r.timing.budgetMs}ms |`,
    );
  }
  lines.push("");
  for (const r of reports) {
    lines.push(`### ${r.mode}`);
    for (const c of r.checks) {
      const skip = c.skipped !== undefined ? ` *(skipped: ${c.skipped.reason})*` : "";
      lines.push(`- **${c.name}** — ${c.severity}, ${c.durationMs}ms${skip}`);
      if (c.violations !== undefined && c.violations.length > 0) {
        for (const v of c.violations.slice(0, 5)) {
          const messageField =
            "message" in v && typeof (v as { message?: unknown }).message === "string"
              ? (v as { message: string }).message
              : "";
          lines.push(`  - ${messageField}`);
        }
      }
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

function renderJson(reports: VerifyReport[]): string {
  return `${JSON.stringify(reports, null, 2)}\n`;
}

// ---------------------------------------------------------------------------
// runAudit — main entry. Returns an exit code.
// ---------------------------------------------------------------------------

export async function runAudit(args: string[]): Promise<number> {
  const parsed = parseFlags(args);

  // ── Parse + validate flags ─────────────────────────────────────────────
  const rawMode = flagAsString(parsed, "mode") ?? "fast";
  const rawFormat = flagAsString(parsed, "format") ?? "text";
  const screenshotEnabled = flagAsBoolean(parsed, "screenshot", false);
  const failOnWarn = flagAsBoolean(parsed, "fail-on-warn", false);

  const parseResult = AuditOptionsSchema.safeParse({
    mode: rawMode,
    outputFormat: rawFormat,
    screenshotEnabled,
    failOnWarn,
    paths: parsed.positional,
  });
  if (!parseResult.success) {
    writeError({
      code: "BAD_FLAG",
      message: `audit: ${parseResult.error.issues
        .map((i) => `${i.path.join(".") || "<root>"}: ${i.message}`)
        .join("; ")}`,
    });
    return EXIT_ARG;
  }
  const opts = parseResult.data;

  // ── Resolve file list ──────────────────────────────────────────────────
  const projectRoot = process.cwd();
  let files: string[];
  if (opts.paths.length > 0) {
    files = opts.paths.map((p) => resolve(projectRoot, p));
  } else {
    files = filterUiFiles(gitChangedFiles(projectRoot)).map((p) =>
      resolve(projectRoot, p),
    );
  }

  if (files.length === 0) {
    // Render an empty report so JSON consumers get a parseable response.
    const out =
      opts.outputFormat === "json"
        ? renderJson([])
        : opts.outputFormat === "markdown"
          ? renderMarkdown([])
          : renderText([]);
    process.stdout.write(out);
    return EXIT_OK;
  }

  // ── Run the gate per file ──────────────────────────────────────────────
  const mode = modeFor({
    mode: opts.mode,
    screenshotEnabled: opts.screenshotEnabled,
  });

  let gate: typeof import("../verify/gate.js");
  try {
    gate = (await import("../verify/gate.js")) as typeof import("../verify/gate.js");
  } catch (err) {
    writeError({
      code: "GATE_LOAD_FAILED",
      message: `audit: failed to load verify-gate module: ${(err as Error).message}`,
    });
    return EXIT_GATE;
  }

  const reports: VerifyReport[] = [];
  for (const filePath of files) {
    let content = "";
    try {
      content = await fs.readFile(filePath, "utf8");
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "EISDIR") {
        writeError({
          code: "EISDIR",
          message:
            `audit: '${filePath}' is a directory — audit takes file paths only. ` +
            `Pass explicit files (e.g. 'audit src/*.tsx') or run without args to fall back to changed-files mode.`,
        });
      } else if (code !== "ENOENT" && code !== "ENOTDIR") {
        writeError({
          code: "READ_FAILED",
          message: `audit: failed to read ${filePath}: ${(err as Error).message}`,
        });
        // Skip and continue — one unreadable file shouldn't abort the run.
      }
      continue;
    }

    const ctx: VerifyContext = {
      mode,
      filePath,
      projectRoot,
      afterContent: content,
      cssToCheck: content,
      diffSummary: { added: 0, removed: 0, files: [filePath] },
    };
    try {
      const report = await gate.run(ctx);
      reports.push(report);
    } catch (err) {
      writeError({
        code: "GATE_THREW",
        message: `audit: gate.run threw on ${filePath}: ${(err as Error).message}`,
      });
      return EXIT_GATE;
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────
  const rendered =
    opts.outputFormat === "json"
      ? renderJson(reports)
      : opts.outputFormat === "markdown"
        ? renderMarkdown(reports)
        : renderText(reports);
  process.stdout.write(rendered);

  // ── Exit code ──────────────────────────────────────────────────────────
  const anyBlocked = reports.some((r) => r.blocked);
  if (anyBlocked) return 1;
  if (opts.failOnWarn) {
    const anyWarn = reports.some((r) => r.verdict === "warn" || r.verdict === "fail");
    if (anyWarn) return 1;
  }
  // Strict mode without explicit block (e.g. all passed) — still exit 0.
  // Standard non-strict warns are informational; exit 0.
  void EXIT_IO; // keep import referenced for future error paths
  return EXIT_OK;
}

// Type-only export for the audit-runner reference in CLI dispatcher.
type _AuditCheckTuple = readonly [VerifyMode, CheckResult];
void (null as unknown as _AuditCheckTuple);
