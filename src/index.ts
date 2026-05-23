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
      "  wisp-design doctor [--fix]                Verify manifest, hooks, build (Phase 0 gate)",
      "  wisp-design live [--port N]               Boot bridge + inject script. (Phase 1+, stub)",
      "  wisp-design init                          Project setup wizard. (Phase 4, stub)",
      "  wisp-design poll-once [--timeout N]       Fetch one batch of bridge events. (Phase 4)",
      "  wisp-design post-event --kind K --payload <json>  Push event to bridge. (Phase 4)",
      "  wisp-design skills <index|search> [args]  Index/query skills corpus. (Phase 4)",
      "  wisp-design sync --from <vault-path>      Sync vault pattern-docs into skills/. (Phase 4)",
      "  wisp-design audit [paths...] [--mode fast|full|strict] [--screenshot] [--format text|json|markdown] [--fail-on-warn]",
      "                                            Verification-Gate (anti-slop + a11y-axe + console + tab-order + reduced-motion [+ multi-viewport]). (Phase 5)",
      "  wisp-design history [--task ID]           Replay a session log. (Phase 6, stub)",
      "  wisp-design tokens extract                Sample computed styles → design-tokens.json. (Phase 4, stub)",
      "  wisp-design verify-spec <spec>            Test a verify-spec against the workspace. (Phase 5, stub)",
      "  wisp-design hook <name>                   Internal hook entry (called by hooks/hooks.json)",
      "  wisp-design --version                     Print version",
      "  wisp-design --help                        Print this help",
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
  if (cmd === "history") return notImplemented("history", "6");
  if (cmd === "tokens") return notImplemented("tokens", "4");
  if (cmd === "verify-spec") return notImplemented("verify-spec", "5");

  // Phase 4 — agent-loop CLI primitives. The implementations live in
  // src/agent/*.ts (coder-owned, parallel commit). We resolve them at
  // runtime via a string-variable import so TypeScript does NOT try to
  // verify the path at compile time. The contract surface lives in
  // src/contracts/agent.ts; when coder's commit lands, the runtime
  // import succeeds and the CLI wires up automatically.
  const lazyLoad = async (
    rel: string,
  ): Promise<Record<string, unknown> | null> => {
    // Indirect through a variable so tsc/TS-bundler resolution does not
    // statically require the target module to exist.
    const spec = rel;
    try {
      return (await import(spec)) as Record<string, unknown>;
    } catch {
      return null;
    }
  };
  const callRunner = async (
    mod: Record<string, unknown> | null,
    fn: string,
    args: string[],
    phaseName: string,
  ): Promise<number> => {
    if (mod === null) return notImplemented(phaseName, "4");
    const runner = mod[fn];
    if (typeof runner !== "function") return notImplemented(phaseName, "4");
    return (runner as (a: string[]) => Promise<number>)(args);
  };

  if (cmd === "poll-once") {
    const mod = await lazyLoad("./agent/poll-loop.js");
    return callRunner(mod, "runPollOnce", rest, "poll-once");
  }
  if (cmd === "post-event") {
    const mod = await lazyLoad("./agent/poll-loop.js");
    return callRunner(mod, "runPostEvent", rest, "post-event");
  }
  if (cmd === "skills") {
    const mod = await lazyLoad("./agent/skills-index.js");
    return callRunner(mod, "runSkills", rest, "skills");
  }
  if (cmd === "sync") {
    const mod = await lazyLoad("./agent/sync.js");
    return callRunner(mod, "runSync", rest, "sync");
  }
  // Phase 5 — verification-gate CLI primitive. Same lazy-load pattern as
  // Phase 4 to keep tsc happy while coder's `src/agent/audit.ts` lands in
  // parallel. Contract surface lives in `src/contracts/verify.ts` (`RunAudit`).
  if (cmd === "audit") {
    const mod = await lazyLoad("./agent/audit.js");
    if (mod === null) return notImplemented("audit", "5");
    const runner = mod["runAudit"];
    if (typeof runner !== "function") return notImplemented("audit", "5");
    return (runner as (a: string[]) => Promise<number>)(rest);
  }

  process.stderr.write(`wisp-design: unknown command "${cmd}". Try --help.\n`);
  return 1;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    process.stderr.write(`wisp-design: fatal — ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
