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
      "  wisp-design live [--target URL] [--port N] [--inject PATH] [--strict] [--verify-mode MODE] [--max-variants N] [--quiet]",
      "                                            Boot bridge + (optionally) inject live.js + run agent-loop. (Phase 7)",
      "  wisp-design init [--non-interactive] [--brand-name S] [--primary-color OKLCH] [--style minimalist|expressive|dense]",
      "                                            Project setup wizard. (Phase 7)",
      "  wisp-design poll-once [--timeout N]       Fetch one batch of bridge events. (Phase 4)",
      "  wisp-design post-event --kind K --payload <json>  Push event to bridge. (Phase 4)",
      "  wisp-design skills <index|search> [args]  Index/query skills corpus. (Phase 4)",
      "  wisp-design sync --from <vault-path>      Sync vault pattern-docs into skills/. (Phase 4)",
      "  wisp-design audit [paths...] [--mode fast|full|strict] [--screenshot] [--format text|json|markdown] [--fail-on-warn]",
      "                                            Verification-Gate (anti-slop + a11y-axe + console + tab-order + reduced-motion [+ multi-viewport]). (Phase 5)",
      "  wisp-design history [--task ID] [--list] [--replay] [--format text|json|markdown]",
      "                                            Replay a session log. (Phase 6)",
      "  wisp-design morph --variant-a ID --variant-b ID --t 0..1",
      "                                            Print interpolated CSS for morph-mode slider. (Phase 6, internal)",
      "  wisp-design policy [--propose] [--apply <axis>=<value>]",
      "                                            Propose/apply policy axis to .wisp/policy.md. (Phase 6)",
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
    } catch (err) {
      // Only genuine module-absence maps to "not yet implemented". A real
      // failure inside a shipped module (ReferenceError, bad transitive
      // import, top-level schema build error, …) must NOT be masked as a
      // missing feature — rethrow it so main().catch() surfaces the actual
      // message with a non-zero exit.
      const code = (err as NodeJS.ErrnoException)?.code;
      const msg = err instanceof Error ? err.message : "";
      const isAbsent =
        code === "ERR_MODULE_NOT_FOUND" ||
        code === "ENOENT" ||
        /Cannot find module/i.test(msg);
      if (isAbsent) return null;
      throw err;
    }
  };
  const callRunner = async (
    mod: Record<string, unknown> | null,
    fn: string,
    args: string[],
    phaseName: string,
    phase: string = "4",
  ): Promise<number> => {
    if (mod === null) return notImplemented(phaseName, phase);
    const runner = mod[fn];
    if (typeof runner !== "function") return notImplemented(phaseName, phase);
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
  // Phase 6 — session-replay, morph-mode, policy-proposal CLI primitives.
  // Same lazy-load pattern as Phase 4/5. Contract surface lives in
  // `src/contracts/session.ts` (`RunHistory`, `RunMorph`, `RunPolicy`).
  if (cmd === "history") {
    const mod = await lazyLoad("./agent/history.js");
    return callRunner(mod, "runHistory", rest, "history", "6");
  }
  if (cmd === "morph") {
    const mod = await lazyLoad("./agent/morph.js");
    return callRunner(mod, "runMorph", rest, "morph", "6");
  }
  if (cmd === "policy") {
    const mod = await lazyLoad("./agent/policy.js");
    return callRunner(mod, "runPolicy", rest, "policy", "6");
  }
  // Phase 7 — `live` and `init`. Same lazy-load pattern. Contract surface
  // lives in `src/contracts/live.ts` and `src/contracts/init.ts`.
  if (cmd === "live") {
    const mod = await lazyLoad("./agent/live.js");
    return callRunner(mod, "runLive", rest, "live", "7");
  }
  if (cmd === "init") {
    const mod = await lazyLoad("./agent/init.js");
    return callRunner(mod, "runInit", rest, "init", "7");
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
