// wisp-design — `wisp-design init` runner (Phase 7).
//
// SKELETON. Coder fills the TODOs marked below.
//
// Lifecycle:
//   1. parseFlags + InitCliFlagsSchema.parse — exit 2 on bad input.
//   2. If `.wisp/brand-spec.json` exists → print path + "already initialized"
//      → exit 0. (idempotent re-runs are no-ops; users use `init --force`
//      to overwrite, but --force is post-1.0.)
//   3. detect = await detectComponentLibrary({projectRoot: cwd, quick: true}).
//      Hint surfaces the detected stack in the welcome banner.
//   4. branch:
//      • --non-interactive: build BrandSpec from flags + style defaults +
//        detected stack. No prompts.
//      • TTY: print welcome banner with detected stack → run the 4 Narrative
//        Questions wizard → fold answers into BrandSpec.
//   5. Write .wisp/brand-spec.json (BrandSpecSchema.parse before write —
//      malformed spec never lands on disk).
//   6. Write .wisp/policy.md skeleton (frontmatter only — Phase 6 policy
//      module appends axes lazily).
//   7. Ensure .wisp/sessions/ dir exists (mkdir -p).
//   8. Print success banner + next-step hint ("wisp-design live").
//
// Exit codes (match _helpers.EXIT_*):
//   0  success (incl. "already initialized")
//   1  IO error (couldn't write file)
//   2  bad flags / interactive prompt aborted

import { mkdir, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import {
  BRAND_SPEC_DEFAULTS,
  BrandSpecSchema,
  InitCliFlagsSchema,
  type BrandSpec,
  type InitCliFlags,
} from "../contracts/init.js";
import { detect as detectComponentLibrary } from "./component-detect.js";
import {
  EXIT_ARG,
  EXIT_IO,
  EXIT_OK,
  flagAsBoolean,
  flagAsString,
  parseFlags,
  writeError,
} from "./_helpers.js";

// ---------------------------------------------------------------------------
// Distance / Temperature / Capacity → BrandSpec field mappings
// ---------------------------------------------------------------------------

/**
 * Narrative Question 2 (Distance) answers → voice.register.
 * The methodology file uses: intimate / conversational / formal.
 * BrandVoiceSchema register enum: formal | casual | technical.
 */
function mapDistance(answer: string): "formal" | "casual" | "technical" {
  const a = answer.toLowerCase().trim();
  if (a.includes("formal") || a.includes("institutional")) return "formal";
  if (a.includes("technical") || a.includes("tech")) return "technical";
  // intimate, conversational, peer, professional → casual
  return "casual";
}

/**
 * Narrative Question 4 (Capacity) answers → density.
 * Methodology: focused / distracted / urgent / exploratory.
 * BrandDensitySchema: compact | comfortable | generous.
 */
function mapCapacity(answer: string): "compact" | "comfortable" | "generous" {
  const a = answer.toLowerCase().trim();
  if (a.includes("focused") || a.includes("urgent") || a.includes("compact")) {
    return "compact";
  }
  if (a.includes("exploratory") || a.includes("generous")) return "generous";
  return "comfortable";
}

// ---------------------------------------------------------------------------
// Flag mapping
// ---------------------------------------------------------------------------

function mapFlags(args: string[]): { ok: true; flags: InitCliFlags } | { ok: false; message: string } {
  const parsed = parseFlags(args);
  const raw: Record<string, unknown> = {
    nonInteractive:
      flagAsBoolean(parsed, "non-interactive", false) ||
      flagAsBoolean(parsed, "nonInteractive", false),
    brandName: flagAsString(parsed, "brand-name") ?? flagAsString(parsed, "brandName"),
    primaryColor:
      flagAsString(parsed, "primary-color") ?? flagAsString(parsed, "primaryColor"),
    style: flagAsString(parsed, "style"),
  };
  for (const k of Object.keys(raw)) {
    if (raw[k] === undefined) delete raw[k];
  }
  const checked = InitCliFlagsSchema.safeParse(raw);
  if (!checked.success) {
    return {
      ok: false,
      message: checked.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; "),
    };
  }
  return { ok: true, flags: checked.data };
}

// ---------------------------------------------------------------------------
// Idempotency check
// ---------------------------------------------------------------------------

async function brandSpecExists(projectRoot: string): Promise<string | null> {
  const path = resolve(projectRoot, ".wisp/brand-spec.json");
  try {
    const s = await stat(path);
    if (s.isFile()) return path;
    return null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Build a default BrandSpec from flags + style preset + detected stack. Used
// by --non-interactive AND as the seed for the interactive wizard.
// ---------------------------------------------------------------------------

function buildDefaultSpec(
  flags: InitCliFlags,
  detectedLib: string,
): BrandSpec {
  const preset = BRAND_SPEC_DEFAULTS[flags.style];
  void detectedLib; // TODO(coder): once we have detected-lib-specific surface
  //                                hints, fold them into `surfaces` below.
  const spec: BrandSpec = {
    name: flags.brandName ?? "wisp-app",
    voice: { ...preset.voice },
    audience: "Developers building UI in this project.",
    surfaces: ["app"],
    brand: {
      primary: flags.primaryColor ?? preset.style.primary,
      neutral: preset.style.neutral,
    },
    typography: { ...preset.style.typography },
    density: preset.style.density,
    motion: preset.style.motion,
    accessibility: { wcag: "AA", reducedMotionDefault: true },
  };
  return spec;
}

// ---------------------------------------------------------------------------
// Interactive wizard — prompts the 4 Narrative Questions on stdin.
// ---------------------------------------------------------------------------

async function runInteractiveWizard(
  seed: BrandSpec,
  detectedLib: string,
): Promise<BrandSpec> {
  // Lazy-import readline so the module is tree-shakeable and never opens
  // a readline interface in tests that import init.ts without calling the wizard.
  const { createInterface } = await import("node:readline/promises");
  const { stdin: input, stdout: output } = process;

  process.stdout.write(
    `\nwisp-design init — detected: ${detectedLib}\n` +
      `Answer 4 quick questions so variants are grounded, not generic.\n` +
      `Press Enter to keep the [default] shown in brackets.\n\n`,
  );

  const rl = createInterface({ input, output });

  try {
    // Q1 — Role (→ audience)
    // Canonical wording: "Who is this for? Answer in one persona, named."
    process.stdout.write(
      `Q1 Role — Who is this for? Answer in one persona, named.\n` +
        `  e.g. "Maya, 26, ML researcher who lives in Jupyter and treats SaaS as friction."\n`,
    );
    const roleAnswer = await rl.question(`  Role [${seed.audience}]: `);
    const audience = roleAnswer.trim() !== "" ? roleAnswer.trim() : seed.audience;

    // Q2 — Distance (→ voice.register)
    // Canonical wording: "How intimate is the relationship?
    //   intimate / conversational / formal."
    process.stdout.write(
      `\nQ2 Distance — How intimate is the relationship?\n` +
        `  intimate = daily-driver tool  |  conversational = weekly consult  |  formal = first-touch page\n`,
    );
    const distanceAnswer = await rl.question(
      `  Distance (intimate / conversational / formal) [conversational]: `,
    );
    const register = mapDistance(
      distanceAnswer.trim() !== "" ? distanceAnswer : "conversational",
    );

    // Q3 — Temperature (→ voice.tone)
    // Canonical wording: "What is the emotional register?
    //   warm | cool | neutral. Optionally: excited | calm | authoritative."
    process.stdout.write(
      `\nQ3 Temperature — What is the emotional register?\n` +
        `  warm | cool | neutral — or extend: excited | calm | authoritative | gentle | sad\n`,
    );
    const tempAnswer = await rl.question(`  Temperature [${seed.voice.tone}]: `);
    const tone = tempAnswer.trim() !== "" ? tempAnswer.trim() : seed.voice.tone;

    // Q4 — Capacity (→ density)
    // Canonical wording: "What is the user's mental state when they land?
    //   focused / distracted / urgent / exploratory."
    process.stdout.write(
      `\nQ4 Capacity — What is the user's mental state when they land?\n` +
        `  focused = in flow  |  distracted = tab tournament  |  urgent = 30 s max  |  exploratory = browsing\n`,
    );
    const capacityAnswer = await rl.question(
      `  Capacity (focused / distracted / urgent / exploratory) [distracted]: `,
    );
    const density = mapCapacity(
      capacityAnswer.trim() !== "" ? capacityAnswer : "distracted",
    );

    // Optional follow-ups: brand name + primary color.
    // Blank answer = keep seed value.
    process.stdout.write(`\n`);
    const nameAnswer = await rl.question(`  Brand name [${seed.name}]: `);
    const name = nameAnswer.trim() !== "" ? nameAnswer.trim() : seed.name;

    const colorAnswer = await rl.question(
      `  Primary color (oklch(…)) [${seed.brand.primary}]: `,
    );
    const primary =
      colorAnswer.trim() !== "" ? colorAnswer.trim() : seed.brand.primary;

    return {
      ...seed,
      name,
      audience,
      voice: { ...seed.voice, tone, register },
      density,
      brand: { ...seed.brand, primary },
    };
  } finally {
    rl.close();
  }
}

// ---------------------------------------------------------------------------
// Writers
// ---------------------------------------------------------------------------

async function writeBrandSpec(projectRoot: string, spec: BrandSpec): Promise<string> {
  const validated = BrandSpecSchema.parse(spec);
  const path = resolve(projectRoot, ".wisp/brand-spec.json");
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(validated, null, 2)}\n`, { encoding: "utf8" });
  return path;
}

async function writePolicySkeleton(projectRoot: string): Promise<string> {
  const path = resolve(projectRoot, ".wisp/policy.md");
  // Frontmatter shape verified against src/agent/policy.ts > parsePolicyMarkdown().
  // The parser expects:
  //   ---
  //   axes:        ← sets inAxes=true; no inline value consumed
  //   ---
  // Empty axes block = no axis entries yet. Phase 6 applyProposal appends
  // indented `  axis: value` lines below `axes:` when a proposal is accepted.
  // `axes: {}` is also accepted (the `{}` is ignored; only indented lines below
  // `axes:` are parsed as axis entries).
  const body =
    `---\naxes: {}\n---\n\n# wisp-design policy\n\n` +
    `Decisions accumulated during live-mode sessions; edit to lock a preference.\n` +
    `Axis values are appended by \`wisp-design policy --apply\` after\n` +
    `the agent observes 3 consecutive decisions on the same axis.\n`;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, body, { encoding: "utf8" });
  return path;
}

async function ensureSessionsDir(projectRoot: string): Promise<string> {
  const path = resolve(projectRoot, ".wisp/sessions");
  await mkdir(path, { recursive: true });
  return path;
}

// ---------------------------------------------------------------------------
// runInit
// ---------------------------------------------------------------------------

export async function runInit(args: string[]): Promise<number> {
  const parsed = mapFlags(args);
  if (!parsed.ok) {
    writeError({ code: "BAD_FLAG", message: parsed.message });
    return EXIT_ARG;
  }
  const flags = parsed.flags;
  const cwd = process.cwd();

  // (2) Idempotency.
  const existingPath = await brandSpecExists(cwd);
  if (existingPath !== null) {
    process.stdout.write(
      `wisp-design init: already initialized at ${existingPath}\n`,
    );
    return EXIT_OK;
  }

  // (3) Detect stack. Don't fatal on detect error — fall through with "vanilla".
  let detectedLib = "vanilla";
  try {
    const result = await detectComponentLibrary({ projectRoot: cwd, quick: true });
    detectedLib = result.primaryLib;
  } catch {
    // ignore — defaults are fine.
  }

  // (4) Build spec.
  const seed = buildDefaultSpec(flags, detectedLib);
  let finalSpec: BrandSpec;
  if (flags.nonInteractive || !process.stdin.isTTY) {
    finalSpec = seed;
  } else {
    try {
      finalSpec = await runInteractiveWizard(seed, detectedLib);
    } catch (err) {
      writeError({
        code: "WIZARD_ABORTED",
        message: (err as Error).message,
      });
      return EXIT_ARG;
    }
  }

  // (5) Write spec + policy + sessions dir. Any failure → exit 1 with the
  //     specific path that broke.
  let specPath: string;
  let policyPath: string;
  let sessionsPath: string;
  try {
    specPath = await writeBrandSpec(cwd, finalSpec);
    policyPath = await writePolicySkeleton(cwd);
    sessionsPath = await ensureSessionsDir(cwd);
  } catch (err) {
    writeError({
      code: "WRITE_FAILED",
      message: (err as Error).message,
    });
    return EXIT_IO;
  }

  // (8) Success banner.
  process.stdout.write(
    [
      `wisp-design init: OK`,
      `  brand-spec: ${specPath}`,
      `  policy:     ${policyPath}`,
      `  sessions:   ${sessionsPath}`,
      `  detected:   ${detectedLib}`,
      ``,
      `Next: run \`wisp-design live --target http://localhost:3000\` to start the live loop.`,
      ``,
    ].join("\n"),
  );
  return EXIT_OK;
}
