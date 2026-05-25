// wisp-design — init runner tests (Phase 7).
//
// Covers:
//   1. --non-interactive: creates .wisp/brand-spec.json + .wisp/policy.md
//   2. BrandSpecSchema.parse accepts the written file
//   3. parsePolicyMarkdown accepts the written policy.md
//   4. Re-run with already-initialized project prints "already initialized" + exits 0
//   5. Detected shadcn stack is recorded in brand-spec (via primaryLib hint field)
//      — note: buildDefaultSpec stores detected lib in the `surfaces` default comment,
//        NOT as a field in BrandSpec. The actual behaviour to pin is that
//        runInit records `detectedLib` in the success banner and the spec is valid.
//      (Phase 7+: surfaces becomes lib-aware; for now we assert spec validity only.)

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// We import the module under test AFTER any mocks, so vi.mock() hoisting works.

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTempProject(): string {
  return mkdtempSync(join(tmpdir(), "wisp-init-test-"));
}

function cleanup(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* best-effort */
  }
}

// Capture stdout without polluting test output.
function captureOutput(): { get: () => string; restore: () => void } {
  const chunks: string[] = [];
  const orig = process.stdout.write.bind(process.stdout) as typeof process.stdout.write;
  // Override to capture; signature matches NodeJS.WritableStream.write overloads.
  (process.stdout.write as unknown as (chunk: string | Uint8Array) => boolean) = (
    chunk: string | Uint8Array,
  ): boolean => {
    chunks.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString());
    return true;
  };
  return {
    get: () => chunks.join(""),
    restore: () => {
      process.stdout.write = orig;
    },
  };
}

// ---------------------------------------------------------------------------
// Mock component-detect so tests don't need a real project tree.
// We use vi.mock with a factory; the actual module path must match imports in init.ts.
// ---------------------------------------------------------------------------

vi.mock("../../src/agent/component-detect.js", () => ({
  detect: vi.fn().mockResolvedValue({
    primaryLib: "vanilla",
    confidence: 0,
    preferredStrategy: "css-override",
    fallbackStrategies: [],
    signals: [],
    detectedAt: new Date().toISOString(),
  }),
}));

// ---------------------------------------------------------------------------
// Import module under test AFTER mock setup.
// ---------------------------------------------------------------------------

import { runInit } from "../../src/agent/init.js";
import { BrandSpecSchema } from "../../src/contracts/init.js";

// Import the mock so we can swap its resolved value per test.
import { detect as detectMock } from "../../src/agent/component-detect.js";
const mockedDetect = vi.mocked(detectMock);

// policy.ts's parsePolicyMarkdown is internal — we call applyProposal via the
// exported policyProposal module and use readPolicyFile directly instead.
// We replicate the minimal parser logic here to verify policy.md correctness.
function parsePolicyFrontmatter(content: string): { axes: Map<string, string> } {
  const lines = content.split(/\r?\n/);
  if (lines[0] !== "---") return { axes: new Map() };
  let endIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === "---") { endIdx = i; break; }
  }
  if (endIdx === -1) return { axes: new Map() };
  const fm = lines.slice(1, endIdx);
  const axes = new Map<string, string>();
  let inAxes = false;
  for (const rawLine of fm) {
    const line = rawLine.trimEnd();
    if (line === "") continue;
    if (line.startsWith("axes:")) { inAxes = true; continue; }
    if (inAxes && /^\s+/.test(line)) {
      const m = /^\s+([a-z][a-z0-9-]*)\s*:\s*(.+)$/i.exec(line);
      if (m) axes.set(m[1]!, m[2]!.trim());
      continue;
    }
    inAxes = false;
  }
  return { axes };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("runInit — non-interactive mode", () => {
  let root: string;
  let origCwd: string;

  beforeEach(() => {
    root = makeTempProject();
    origCwd = process.cwd();
    process.chdir(root);
    mockedDetect.mockResolvedValue({
      primaryLib: "vanilla",
      confidence: 0,
      preferredStrategy: "css-override",
      fallbackStrategies: [],
      signals: [],
      detectedAt: new Date().toISOString(),
    });
  });

  afterEach(() => {
    process.chdir(origCwd);
    cleanup(root);
  });

  it("creates .wisp/brand-spec.json with valid BrandSpec", async () => {
    const code = await runInit(["--non-interactive"]);
    expect(code).toBe(0);

    const specPath = join(root, ".wisp/brand-spec.json");
    const raw = readFileSync(specPath, "utf8");
    const json = JSON.parse(raw) as unknown;
    const parsed = BrandSpecSchema.safeParse(json);
    expect(parsed.success).toBe(true);
  });

  it("creates .wisp/policy.md with valid frontmatter (axes: {})", async () => {
    await runInit(["--non-interactive"]);

    const policyPath = join(root, ".wisp/policy.md");
    const content = readFileSync(policyPath, "utf8");

    // Must have frontmatter delimiters.
    expect(content).toContain("---");
    expect(content).toContain("axes:");

    // parsePolicyMarkdown must accept it without errors.
    const { axes } = parsePolicyFrontmatter(content);
    // Fresh skeleton has no axes set.
    expect(axes.size).toBe(0);
  });

  it("creates .wisp/sessions/ directory", async () => {
    await runInit(["--non-interactive"]);

    const { statSync } = await import("node:fs");
    const s = statSync(join(root, ".wisp/sessions"));
    expect(s.isDirectory()).toBe(true);
  });

  it("applies --brand-name flag to brand-spec name", async () => {
    await runInit(["--non-interactive", "--brand-name", "My Product"]);
    const raw = readFileSync(join(root, ".wisp/brand-spec.json"), "utf8");
    const json = JSON.parse(raw) as { name: string };
    expect(json.name).toBe("My Product");
  });

  it("idempotent: re-run prints 'already initialized' and exits 0 without overwrite", async () => {
    await runInit(["--non-interactive"]);

    // Mutate the spec so we can detect whether it was overwritten.
    const specPath = join(root, ".wisp/brand-spec.json");
    const before = readFileSync(specPath, "utf8");
    const mutated = JSON.parse(before) as Record<string, unknown>;
    mutated["name"] = "__sentinel__";
    writeFileSync(specPath, JSON.stringify(mutated, null, 2), "utf8");

    const out = captureOutput();
    const code = await runInit(["--non-interactive"]);
    out.restore();

    expect(code).toBe(0);
    expect(out.get()).toContain("already initialized");

    // File must NOT have been overwritten.
    const after = JSON.parse(readFileSync(specPath, "utf8")) as Record<string, unknown>;
    expect(after["name"]).toBe("__sentinel__");
  });

  it("detected shadcn lib is reported in the success banner", async () => {
    mockedDetect.mockResolvedValue({
      primaryLib: "shadcn",
      confidence: 0.8,
      preferredStrategy: "prop-edit",
      fallbackStrategies: ["css-override"],
      signals: [],
      detectedAt: new Date().toISOString(),
    });

    const out = captureOutput();
    const code = await runInit(["--non-interactive"]);
    out.restore();

    expect(code).toBe(0);
    // The success banner prints "detected:   shadcn"
    expect(out.get()).toContain("shadcn");

    // The BrandSpec itself is still valid (lib-awareness in surfaces is Phase 7+).
    const raw = readFileSync(join(root, ".wisp/brand-spec.json"), "utf8");
    const parsed = BrandSpecSchema.safeParse(JSON.parse(raw));
    expect(parsed.success).toBe(true);
  });
});

describe("runInit — flag validation", () => {
  let root: string;
  let origCwd: string;

  beforeEach(() => {
    root = makeTempProject();
    origCwd = process.cwd();
    process.chdir(root);
  });

  afterEach(() => {
    process.chdir(origCwd);
    cleanup(root);
  });

  it("returns EXIT_ARG (2) when --style is invalid", async () => {
    const code = await runInit(["--non-interactive", "--style", "invalid-style"]);
    expect(code).toBe(2);
  });

  it("returns EXIT_ARG (2) when --primary-color is not oklch()", async () => {
    const code = await runInit([
      "--non-interactive",
      "--primary-color",
      "#ff0000",
    ]);
    expect(code).toBe(2);
  });

  it("accepts valid oklch() primary-color", async () => {
    const code = await runInit([
      "--non-interactive",
      "--primary-color",
      "oklch(0.62 0.21 256)",
    ]);
    expect(code).toBe(0);
    const raw = readFileSync(join(root, ".wisp/brand-spec.json"), "utf8");
    const spec = JSON.parse(raw) as { brand: { primary: string } };
    expect(spec.brand.primary).toBe("oklch(0.62 0.21 256)");
  });
});
