#!/usr/bin/env node

// src/index.ts
import { readFileSync as readFileSync2 } from "fs";

// src/cli/doctor.ts
import { existsSync, readFileSync, statSync } from "fs";
import { resolve } from "path";
function ok(label, detail) {
  return detail !== void 0 ? { label, status: "ok", detail } : { label, status: "ok" };
}
function warn(label, detail) {
  return { label, status: "warn", detail };
}
function fail(label, detail) {
  return { label, status: "fail", detail };
}
function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}
function isPlainObject(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function checkPluginJson(cwd) {
  const path = resolve(cwd, ".claude-plugin/plugin.json");
  if (!existsSync(path)) return fail(".claude-plugin/plugin.json", "missing");
  try {
    const data = readJson(path);
    if (!isPlainObject(data)) return fail(".claude-plugin/plugin.json", "not a JSON object");
    if (typeof data.name !== "string") return fail(".claude-plugin/plugin.json", "name missing");
    if (typeof data.version !== "string") return fail(".claude-plugin/plugin.json", "version missing");
    if (data.repository !== void 0 && typeof data.repository !== "string") {
      return fail(
        ".claude-plugin/plugin.json",
        "repository must be a STRING (npm-style { type, url } breaks /plugin install)"
      );
    }
    return ok(".claude-plugin/plugin.json", `${data.name} v${data.version}`);
  } catch (err) {
    return fail(".claude-plugin/plugin.json", `parse error \u2014 ${err.message}`);
  }
}
function checkMarketplaceJson(cwd) {
  const path = resolve(cwd, ".claude-plugin/marketplace.json");
  if (!existsSync(path)) return fail(".claude-plugin/marketplace.json", "missing");
  try {
    const data = readJson(path);
    if (!isPlainObject(data)) return fail(".claude-plugin/marketplace.json", "not a JSON object");
    const plugins = data.plugins;
    if (!Array.isArray(plugins) || plugins.length === 0) {
      return fail(".claude-plugin/marketplace.json", "plugins[] missing or empty");
    }
    const first = plugins[0];
    if (!isPlainObject(first)) return fail(".claude-plugin/marketplace.json", "plugins[0] not object");
    const source = first.source;
    if (!isPlainObject(source)) {
      return fail(
        ".claude-plugin/marketplace.json",
        "plugins[0].source must be an OBJECT { source: 'github', repo: '\u2026' }, not a string"
      );
    }
    return ok(".claude-plugin/marketplace.json", `${plugins.length} plugin(s)`);
  } catch (err) {
    return fail(".claude-plugin/marketplace.json", `parse error \u2014 ${err.message}`);
  }
}
function checkHooksJson(cwd) {
  const path = resolve(cwd, "hooks/hooks.json");
  if (!existsSync(path)) return fail("hooks/hooks.json", "missing");
  try {
    const data = readJson(path);
    if (!isPlainObject(data)) return fail("hooks/hooks.json", "not a JSON object");
    const hooks = data.hooks;
    if (!isPlainObject(hooks)) {
      return fail("hooks/hooks.json", "top-level `hooks` key missing (Layer 1)");
    }
    const events = Object.keys(hooks);
    if (events.length === 0) return fail("hooks/hooks.json", "no hook events defined");
    for (const event of events) {
      const arr = hooks[event];
      if (!Array.isArray(arr)) {
        return fail(
          "hooks/hooks.json",
          `hooks.${event} must be an ARRAY of matcher envelopes (Layer 2)`
        );
      }
      for (const envelope of arr) {
        if (!isPlainObject(envelope) || !Array.isArray(envelope.hooks)) {
          return fail(
            "hooks/hooks.json",
            `hooks.${event}[].hooks must be an array of { type, command } (Layer 3)`
          );
        }
      }
    }
    return ok("hooks/hooks.json", `${events.length} event(s): ${events.join(", ")}`);
  } catch (err) {
    return fail("hooks/hooks.json", `parse error \u2014 ${err.message}`);
  }
}
function checkCommand(cwd) {
  const path = resolve(cwd, "commands/wisp-design.md");
  if (!existsSync(path)) return fail("commands/wisp-design.md", "missing");
  const content = readFileSync(path, "utf8");
  if (!content.startsWith("---")) {
    return warn("commands/wisp-design.md", "no frontmatter \u2014 Claude Code may treat as plain MD");
  }
  return ok("commands/wisp-design.md");
}
function checkLicense(cwd) {
  const path = resolve(cwd, "LICENSE");
  if (!existsSync(path)) return fail("LICENSE", "missing");
  const content = readFileSync(path, "utf8");
  if (!/MIT License/i.test(content)) {
    return warn("LICENSE", "not MIT \u2014 wisp-design ships MIT (Stagewise's AGPL is the anti-pattern)");
  }
  return ok("LICENSE", "MIT");
}
function checkDist(cwd) {
  const path = resolve(cwd, "dist/index.js");
  if (!existsSync(path)) {
    return fail("dist/index.js", "missing \u2014 run `npm run build` and commit dist/ (plugin clones have no build step)");
  }
  const size = statSync(path).size;
  return ok("dist/index.js", `${(size / 1024).toFixed(1)} kB`);
}
function checkSkillsLayout(cwd) {
  const root = resolve(cwd, "skills");
  if (!existsSync(root)) {
    return warn("skills/", "missing \u2014 Phase 4 corpus not yet committed");
  }
  const expectedDirs = [
    "wisp-design",
    "reference",
    "policy",
    "methodology",
    "data"
  ];
  const missing = [];
  for (const d of expectedDirs) {
    if (!existsSync(resolve(root, d))) missing.push(d);
  }
  if (missing.length > 0) {
    return warn("skills/", `missing sub-dirs: ${missing.join(", ")}`);
  }
  return ok("skills/", `${expectedDirs.length} sub-dirs present`);
}
function checkSkillManifest(cwd) {
  const path = resolve(cwd, "skills/wisp-design/SKILL.md");
  if (!existsSync(path)) {
    return warn(
      "skills/wisp-design/SKILL.md",
      "missing \u2014 Phase 4 auto-trigger skill not yet committed"
    );
  }
  return ok("skills/wisp-design/SKILL.md");
}
function checkNodeVersion() {
  const major = Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10);
  if (Number.isNaN(major) || major < 20) {
    return fail("node version", `>=20 required, found ${process.versions.node}`);
  }
  return ok("node version", `v${process.versions.node}`);
}
async function runDoctor(opts) {
  void opts.fix;
  const checks = [
    checkNodeVersion(),
    checkPluginJson(opts.cwd),
    checkMarketplaceJson(opts.cwd),
    checkHooksJson(opts.cwd),
    checkCommand(opts.cwd),
    checkLicense(opts.cwd),
    checkDist(opts.cwd),
    checkSkillsLayout(opts.cwd),
    checkSkillManifest(opts.cwd)
  ];
  const hasFail = checks.some((c) => c.status === "fail");
  return { checks, exitCode: hasFail ? 1 : 0 };
}

// src/hooks/dispatcher.ts
async function drainStdin() {
  if (process.stdin.isTTY) return "";
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}
async function runHook(name) {
  await drainStdin().catch(() => "");
  switch (name) {
    case "user-prompt-submit":
    case "post-tool-use":
    case "stop":
    case "session-end":
      return 0;
    default:
      return 0;
  }
}

// src/index.ts
var argv = process.argv.slice(2);
var [cmd, ...rest] = argv;
function version() {
  try {
    const pkg = JSON.parse(readFileSync2(new URL("../package.json", import.meta.url), "utf8"));
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}
function printHelp() {
  process.stdout.write(
    [
      `wisp-design v${version()}`,
      "",
      "Live-Frontend-Design f\xFCr Claude Code. Click element \u2192 3 distincte Varianten",
      "in echtem HMR \u2192 a11y-gated Accept \u2192 fs.writeFileSync. Verification-Gate vor",
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
      "  wisp-design audit [--strict]              Pre-commit a11y + anti-slop linter. (Phase 5, stub)",
      "  wisp-design history [--task ID]           Replay a session log. (Phase 6, stub)",
      "  wisp-design tokens extract                Sample computed styles \u2192 design-tokens.json. (Phase 4, stub)",
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
      ""
    ].join("\n")
  );
}
function notImplemented(name, phase) {
  process.stderr.write(
    `wisp-design ${name}: not yet implemented (planned for Phase ${phase}). See CLAUDE.md > Build-Roadmap > Phase ${phase}.
`
  );
  return 2;
}
async function main() {
  if (cmd === "--version" || cmd === "-v") {
    process.stdout.write(`${version()}
`);
    return 0;
  }
  if (cmd === void 0 || cmd === "--help" || cmd === "-h" || cmd === "help") {
    printHelp();
    return 0;
  }
  if (cmd === "doctor") {
    const fix = rest.includes("--fix");
    const out = await runDoctor({ cwd: process.cwd(), fix });
    for (const c of out.checks) {
      const mark = c.status === "ok" ? "\u2713" : c.status === "warn" ? "!" : "\u2717";
      process.stdout.write(
        `  ${mark} ${c.label}${c.detail !== void 0 ? ` \u2014 ${c.detail}` : ""}
`
      );
    }
    process.stdout.write(
      `
${out.exitCode === 0 ? "wisp-design doctor: OK" : "wisp-design doctor: FAIL"}
`
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
  if (cmd === "verify-spec") return notImplemented("verify-spec", "5");
  const lazyLoad = async (rel) => {
    const spec = rel;
    try {
      return await import(spec);
    } catch {
      return null;
    }
  };
  const callRunner = async (mod, fn, args, phaseName) => {
    if (mod === null) return notImplemented(phaseName, "4");
    const runner = mod[fn];
    if (typeof runner !== "function") return notImplemented(phaseName, "4");
    return runner(args);
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
  process.stderr.write(`wisp-design: unknown command "${cmd}". Try --help.
`);
  return 1;
}
main().then((code) => process.exit(code)).catch((err) => {
  process.stderr.write(`wisp-design: fatal \u2014 ${err instanceof Error ? err.message : String(err)}
`);
  process.exit(1);
});
//# sourceMappingURL=index.js.map