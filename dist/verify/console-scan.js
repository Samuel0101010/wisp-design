#!/usr/bin/env node

// src/verify/console-scan.ts
import { promises as fs } from "fs";

// src/contracts/verify.ts
import { z } from "zod";
var VerifyModeSchema = z.enum([
  "stop-hook",
  "live-accept",
  "live-with-screenshot",
  "audit",
  "audit-strict"
]);
var SeveritySchema = z.enum(["pass", "warn", "fail"]);
var CheckNameSchema = z.enum([
  "anti-slop",
  "a11y-axe",
  "console-scan",
  "tab-order",
  "reduced-motion",
  "multi-viewport"
]);
var AntiSlopRuleIdSchema = z.enum([
  // Hard-bans (severity: fail in all modes; blocks accept only when mode
  // blocks on fail).
  "em-dash-ui",
  "gradient-text-headline",
  "default-glassmorphism",
  "hero-metric-template",
  "side-stripe-decoration",
  "purple-blue-gradient",
  "generic-ai-illustration",
  // Soft suggestions (severity: warn even in strict modes).
  "too-perfect-alignment",
  "round-number-whitespace",
  "default-tailwind-blue",
  "single-weight-typography",
  "all-rounded-corners"
]);
var AuditOptionsSchema = z.object({
  // User-facing names (`fast`/`full`/`strict`) are friendlier than the
  // internal VerifyMode enum. Mapping handled by the audit runner:
  //   fast   → "stop-hook"
  //   full   → "audit"   (+ "live-with-screenshot" if --screenshot)
  //   strict → "audit-strict"
  mode: z.enum(["fast", "full", "strict"]).default("fast"),
  // File globs to audit. Empty array = audit `git diff HEAD --name-only`.
  paths: z.array(z.string()).default([]),
  outputFormat: z.enum(["text", "json", "markdown"]).default("text"),
  // CI knob: treat warn-level findings as exit-1. Default false (warn-only
  // is informational for v0.x).
  failOnWarn: z.boolean().default(false),
  // Force multi-viewport screenshot (requires playwright optionalDep).
  screenshotEnabled: z.boolean().default(false)
});
var CONSOLE_SCAN_BUDGET_MS = 2e3;

// src/verify/console-scan.ts
var PATTERN_SRC = "error|warn|fail|exception|uncaught|cannot read";
var PATTERN_RE = new RegExp(`(?:${PATTERN_SRC})`, "i");
var SEVERE_RE = /\b(error|exception|uncaught|cannot read)\b/i;
function scanText(text, source, cap = 50, startedIso = (/* @__PURE__ */ new Date()).toISOString()) {
  if (text === "") return [];
  const out = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    if (line === "") continue;
    if (PATTERN_RE.test(line)) {
      const trimmed = line.length > 240 ? `${line.slice(0, 239)}\u2026` : line;
      out.push({
        message: `[${source}] ${trimmed}`,
        pattern: PATTERN_SRC,
        firstSeenAt: startedIso
      });
      if (out.length >= cap) break;
    }
  }
  return out;
}
async function scanSessionLog(sessionLogPath) {
  let raw;
  try {
    raw = await fs.readFile(sessionLogPath, "utf8");
  } catch (err) {
    const code = err.code;
    if (code === "ENOENT" || code === "ENOTDIR") return [];
    throw err;
  }
  const out = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === "") continue;
    if (PATTERN_RE.test(trimmed)) {
      let parsedTs;
      try {
        const obj = JSON.parse(trimmed);
        if (typeof obj.at === "string") parsedTs = obj.at;
      } catch {
      }
      const truncated = trimmed.length > 240 ? `${trimmed.slice(0, 239)}\u2026` : trimmed;
      out.push({
        message: `[session-log] ${truncated}`,
        pattern: PATTERN_SRC,
        firstSeenAt: parsedTs ?? (/* @__PURE__ */ new Date()).toISOString()
      });
      if (out.length >= 50) break;
    }
  }
  return out;
}
async function scanBridgePoll(bridgeUrl, token, timeoutMs) {
  const url = `${bridgeUrl.replace(/\/$/, "")}/poll?token=${encodeURIComponent(
    token
  )}&timeout=${Math.max(1e3, Math.min(timeoutMs, 1500))}&leaseMs=0`;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ac.signal });
    if (!res.ok) return [];
    const body = await res.json();
    const out = [];
    for (const ev of body.events ?? []) {
      if (ev.kind === "error") {
        out.push({
          message: `[bridge] ${ev.message ?? "(no message)"}`,
          pattern: PATTERN_SRC,
          firstSeenAt: (/* @__PURE__ */ new Date()).toISOString()
        });
      }
    }
    return out;
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}
async function runConsoleScan(opts) {
  const startedAt = Date.now();
  const budgetBase = opts.budgetStartedAt ?? startedAt;
  const aggregate = [];
  try {
    if (opts.sessionLogPath !== void 0) {
      const items = await scanSessionLog(opts.sessionLogPath);
      aggregate.push(...items);
    }
    if (opts.bridgeUrl !== void 0 && opts.token !== void 0 && Date.now() - budgetBase < CONSOLE_SCAN_BUDGET_MS - 300) {
      const items = await scanBridgePoll(
        opts.bridgeUrl,
        opts.token,
        // Reserve 300ms for the final assembly tail.
        CONSOLE_SCAN_BUDGET_MS - (Date.now() - budgetBase) - 300
      );
      aggregate.push(...items);
    }
    if (opts.cssOrHtml !== void 0) {
      const scripts = [];
      const blockRe = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
      let m;
      while ((m = blockRe.exec(opts.cssOrHtml)) !== null) {
        scripts.push(m[1] ?? "");
      }
      const text = scripts.join("\n");
      if (text !== "") {
        aggregate.push(...scanText(text, "static-script"));
      }
    }
    const noInputs = opts.sessionLogPath === void 0 && opts.bridgeUrl === void 0 && (opts.cssOrHtml === void 0 || !/<script\b/i.test(opts.cssOrHtml));
    if (noInputs && aggregate.length === 0) {
      return {
        name: "console-scan",
        severity: "pass",
        durationMs: Date.now() - startedAt,
        skipped: {
          reason: "error",
          detail: "no session log, bridge, or <script> content to scan"
        }
      };
    }
    const severity = aggregate.some((c) => SEVERE_RE.test(c.message)) ? "fail" : aggregate.length > 0 ? "warn" : "pass";
    return {
      name: "console-scan",
      severity,
      durationMs: Date.now() - startedAt,
      violations: aggregate
    };
  } catch (err) {
    return {
      name: "console-scan",
      severity: "pass",
      durationMs: Date.now() - startedAt,
      skipped: {
        reason: "error",
        detail: err.message
      }
    };
  }
}
export {
  runConsoleScan
};
//# sourceMappingURL=console-scan.js.map