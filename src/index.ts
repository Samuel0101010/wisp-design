// wisp-design — CLI entry point.
//
// Phase 0 scope: dispatcher, doctor (real), hook stubs (non-blocking),
// other subcommands are wired as "not yet implemented" placeholders.
// Subsequent phases (1–6) replace each stub with the actual implementation.

import { readFileSync } from "node:fs";
import { runDoctor } from "./cli/doctor.js";
import { runHook } from "./hooks/dispatcher.js";

const argv = process.argv.slice(2);
const [cmd, ...rest] = argv;

function version(): string {
  try {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
      version?: string;
    };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

function printHelp(): void {
  process.stdout.write(
    [
      `wisp-design v${version()}`,
      "",
      "Live-Frontend-Design für Claude Code. Click element → 3 distincte Varianten",
      "in echtem HMR → a11y-gated Accept → fs.writeFileSync. Verification-Gate vor",
      "jedem Accept.",
      "",
      "Usage:",
      "  wisp-design doctor [--fix]        Verify manifest, hooks, build (Phase 0 gate)",
      "  wisp-design live [--port N]       Boot bridge + inject script. (Phase 1+, stub)",
      "  wisp-design init                  Project setup wizard. (Phase 4, stub)",
      "  wisp-design audit [--strict]      Pre-commit a11y + anti-slop linter. (Phase 5, stub)",
      "  wisp-design history [--task ID]   Replay a session log. (Phase 6, stub)",
      "  wisp-design tokens extract        Sample computed styles → design-tokens.json. (Phase 4, stub)",
      "  wisp-design sync --from <path>    Sync vault pattern-docs into skills/. (Phase 4, stub)",
      "  wisp-design verify-spec <spec>    Test a verify-spec against the workspace. (Phase 5, stub)",
      "  wisp-design hook <name>           Internal hook entry (called by hooks/hooks.json)",
      "  wisp-design --version             Print version",
      "  wisp-design --help                Print this help",
      "",
      "Hook subcommands (internal):",
      "  user-prompt-submit  Inject 4 Narrative Questions on UI-page intent (Phase 4)",
      "  post-tool-use       Trigger HMR-wait + console-scan after UI source edit (Phase 5)",
      "  stop                Verification-Gate (a11y + screenshot + anti-slop)   (Phase 5)",
      "  session-end         Flush session-log + render replay summary           (Phase 6)",
      "",
    ].join("\n"),
  );
}

function notImplemented(name: string, phase: string): number {
  process.stderr.write(
    `wisp-design ${name}: not yet implemented (planned for Phase ${phase}). ` +
      `See CLAUDE.md > Build-Roadmap > Phase ${phase}.\n`,
  );
  return 2;
}

async function main(): Promise<number> {
  if (cmd === "--version" || cmd === "-v") {
    process.stdout.write(`${version()}\n`);
    return 0;
  }

  if (cmd === undefined || cmd === "--help" || cmd === "-h" || cmd === "help") {
    printHelp();
    return 0;
  }

  if (cmd === "doctor") {
    const fix = rest.includes("--fix");
    const out = await runDoctor({ cwd: process.cwd(), fix });
    for (const c of out.checks) {
      const mark = c.status === "ok" ? "✓" : c.status === "warn" ? "!" : "✗";
      process.stdout.write(
        `  ${mark} ${c.label}${c.detail !== undefined ? ` — ${c.detail}` : ""}\n`,
      );
    }
    process.stdout.write(
      `\n${out.exitCode === 0 ? "wisp-design doctor: OK" : "wisp-design doctor: FAIL"}\n`,
    );
    return out.exitCode;
  }

  if (cmd === "hook") {
    return runHook(rest[0]);
  }

  if (cmd === "live") return notImplemented("live", "1-4");
  if (cmd === "init") return notImplemented("init", "4");
  if (cmd === "audit") return notImplemented("audit", "5");
  if (cmd === "history") return notImplemented("history", "6");
  if (cmd === "tokens") return notImplemented("tokens", "4");
  if (cmd === "sync") return notImplemented("sync", "4");
  if (cmd === "verify-spec") return notImplemented("verify-spec", "5");

  process.stderr.write(`wisp-design: unknown command "${cmd}". Try --help.\n`);
  return 1;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    process.stderr.write(`wisp-design: fatal — ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
