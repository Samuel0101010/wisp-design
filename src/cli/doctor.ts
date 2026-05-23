// wisp-design doctor — verifies that the plugin scaffolding is wired correctly.
//
// Phase 0 contract: exits 0 when manifest, hooks, command, license, and dist/ bundle
// all exist and parse. Detects the common schema gotchas documented in the global
// CLAUDE.md (plugin.json.repository must be string, marketplace.json plugins[].source
// must be object, hooks.json needs three-layer matcher envelope).

import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

export type CheckStatus = "ok" | "warn" | "fail";

export interface DoctorCheck {
  label: string;
  status: CheckStatus;
  detail?: string;
}

export interface DoctorResult {
  checks: DoctorCheck[];
  exitCode: number;
}

export interface DoctorOptions {
  cwd: string;
  fix: boolean;
}

function ok(label: string, detail?: string): DoctorCheck {
  return detail !== undefined ? { label, status: "ok", detail } : { label, status: "ok" };
}

function warn(label: string, detail: string): DoctorCheck {
  return { label, status: "warn", detail };
}

function fail(label: string, detail: string): DoctorCheck {
  return { label, status: "fail", detail };
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8")) as unknown;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function checkPluginJson(cwd: string): DoctorCheck {
  const path = resolve(cwd, ".claude-plugin/plugin.json");
  if (!existsSync(path)) return fail(".claude-plugin/plugin.json", "missing");
  try {
    const data = readJson(path);
    if (!isPlainObject(data)) return fail(".claude-plugin/plugin.json", "not a JSON object");
    if (typeof data.name !== "string") return fail(".claude-plugin/plugin.json", "name missing");
    if (typeof data.version !== "string") return fail(".claude-plugin/plugin.json", "version missing");
    if (data.repository !== undefined && typeof data.repository !== "string") {
      return fail(
        ".claude-plugin/plugin.json",
        "repository must be a STRING (npm-style { type, url } breaks /plugin install)",
      );
    }
    return ok(".claude-plugin/plugin.json", `${data.name as string} v${data.version as string}`);
  } catch (err) {
    return fail(".claude-plugin/plugin.json", `parse error — ${(err as Error).message}`);
  }
}

function checkMarketplaceJson(cwd: string): DoctorCheck {
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
        "plugins[0].source must be an OBJECT { source: 'github', repo: '…' }, not a string",
      );
    }
    return ok(".claude-plugin/marketplace.json", `${plugins.length} plugin(s)`);
  } catch (err) {
    return fail(".claude-plugin/marketplace.json", `parse error — ${(err as Error).message}`);
  }
}

function checkHooksJson(cwd: string): DoctorCheck {
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
          `hooks.${event} must be an ARRAY of matcher envelopes (Layer 2)`,
        );
      }
      for (const envelope of arr) {
        if (!isPlainObject(envelope) || !Array.isArray(envelope.hooks)) {
          return fail(
            "hooks/hooks.json",
            `hooks.${event}[].hooks must be an array of { type, command } (Layer 3)`,
          );
        }
      }
    }
    return ok("hooks/hooks.json", `${events.length} event(s): ${events.join(", ")}`);
  } catch (err) {
    return fail("hooks/hooks.json", `parse error — ${(err as Error).message}`);
  }
}

function checkCommand(cwd: string): DoctorCheck {
  const path = resolve(cwd, "commands/wisp-design.md");
  if (!existsSync(path)) return fail("commands/wisp-design.md", "missing");
  const content = readFileSync(path, "utf8");
  if (!content.startsWith("---")) {
    return warn("commands/wisp-design.md", "no frontmatter — Claude Code may treat as plain MD");
  }
  return ok("commands/wisp-design.md");
}

function checkLicense(cwd: string): DoctorCheck {
  const path = resolve(cwd, "LICENSE");
  if (!existsSync(path)) return fail("LICENSE", "missing");
  const content = readFileSync(path, "utf8");
  if (!/MIT License/i.test(content)) {
    return warn("LICENSE", "not MIT — wisp-design ships MIT (Stagewise's AGPL is the anti-pattern)");
  }
  return ok("LICENSE", "MIT");
}

function checkDist(cwd: string): DoctorCheck {
  const path = resolve(cwd, "dist/index.js");
  if (!existsSync(path)) {
    return fail("dist/index.js", "missing — run `npm run build` and commit dist/ (plugin clones have no build step)");
  }
  const size = statSync(path).size;
  return ok("dist/index.js", `${(size / 1024).toFixed(1)} kB`);
}

function checkSkillsLayout(cwd: string): DoctorCheck {
  // Phase 4 — `skills/` may be partially populated while content-curator's
  // commit is still landing. Missing slices are WARN (not FAIL) so a Phase 0
  // checkout doesn't trip the gate.
  const root = resolve(cwd, "skills");
  if (!existsSync(root)) {
    return warn("skills/", "missing — Phase 4 corpus not yet committed");
  }
  const expectedDirs = [
    "wisp-design",
    "reference",
    "policy",
    "methodology",
    "data",
  ];
  const missing: string[] = [];
  for (const d of expectedDirs) {
    if (!existsSync(resolve(root, d))) missing.push(d);
  }
  if (missing.length > 0) {
    return warn("skills/", `missing sub-dirs: ${missing.join(", ")}`);
  }
  return ok("skills/", `${expectedDirs.length} sub-dirs present`);
}

function checkSkillManifest(cwd: string): DoctorCheck {
  const path = resolve(cwd, "skills/wisp-design/SKILL.md");
  if (!existsSync(path)) {
    return warn(
      "skills/wisp-design/SKILL.md",
      "missing — Phase 4 auto-trigger skill not yet committed",
    );
  }
  return ok("skills/wisp-design/SKILL.md");
}

// Phase 6 — `.wisp/policy.md` is the home of the in-session policy-proposal
// flow (Improvement #5). WARN when missing — a fresh project has none yet,
// but `init`/runtime proposal acceptance creates it. Not a FAIL because most
// sessions never need a policy document.
function checkPolicyDoc(cwd: string): DoctorCheck {
  const path = resolve(cwd, ".wisp/policy.md");
  if (!existsSync(path)) {
    return warn(".wisp/policy.md", "not present — no project-wide design tendencies recorded yet");
  }
  return ok(".wisp/policy.md");
}

// Phase 6 — `.wisp/sessions/` is populated lazily on first `wisp-design live`
// session. Missing is OK (no sessions run yet); present is OK (at least one
// session logged). Reported either way for transparency, never FAIL.
function checkSessionsDir(cwd: string): DoctorCheck {
  const path = resolve(cwd, ".wisp/sessions");
  if (!existsSync(path)) {
    return ok(".wisp/sessions/", "not present (populated lazily on first session)");
  }
  return ok(".wisp/sessions/", "present");
}

function checkNodeVersion(): DoctorCheck {
  const major = Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10);
  if (Number.isNaN(major) || major < 20) {
    return fail("node version", `>=20 required, found ${process.versions.node}`);
  }
  return ok("node version", `v${process.versions.node}`);
}

// Phase 5 verify-gate deps. axe-core is a regular dependency (a11y check is
// always available); playwright + pixelmatch are optionalDependencies and
// degrade gracefully when missing — we WARN rather than FAIL.
function checkVerifyDep(
  cwd: string,
  pkg: string,
  optional: boolean,
): DoctorCheck {
  const path = resolve(cwd, "node_modules", pkg, "package.json");
  if (existsSync(path)) {
    try {
      const meta = readJson(path);
      const v = isPlainObject(meta) && typeof meta.version === "string" ? meta.version : "?";
      return ok(`node_modules/${pkg}`, `v${v}`);
    } catch {
      return ok(`node_modules/${pkg}`, "installed");
    }
  }
  if (optional) {
    const label = pkg === "playwright" ? "multi-viewport screenshots disabled" : "reduced-motion pixel-diff disabled";
    return warn(`node_modules/${pkg}`, `optional dep missing — ${label}`);
  }
  return fail(`node_modules/${pkg}`, "missing (required for Phase 5 a11y-axe check)");
}

export async function runDoctor(opts: DoctorOptions): Promise<DoctorResult> {
  // `fix` is reserved for future autocorrect actions (e.g. rebuild dist, regenerate manifest);
  // Phase 0 ships read-only checks. Reference it so the param doesn't trip noUnusedParameters.
  void opts.fix;
  const checks: DoctorCheck[] = [
    checkNodeVersion(),
    checkPluginJson(opts.cwd),
    checkMarketplaceJson(opts.cwd),
    checkHooksJson(opts.cwd),
    checkCommand(opts.cwd),
    checkLicense(opts.cwd),
    checkDist(opts.cwd),
    checkSkillsLayout(opts.cwd),
    checkSkillManifest(opts.cwd),
    // Phase 5 verify-gate deps.
    checkVerifyDep(opts.cwd, "axe-core", false),
    checkVerifyDep(opts.cwd, "playwright", true),
    checkVerifyDep(opts.cwd, "pixelmatch", true),
    // Phase 6 session-replay + policy-proposal.
    checkPolicyDoc(opts.cwd),
    checkSessionsDir(opts.cwd),
  ];
  const hasFail = checks.some((c) => c.status === "fail");
  return { checks, exitCode: hasFail ? 1 : 0 };
}
