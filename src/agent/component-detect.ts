// wisp-design — Component-library detector (Phase 6, Improvement #11).
//
// Implements `ComponentDetectModule` from src/contracts/component.ts.
//
// Mechanism:
//   1. Read `<projectRoot>/package.json` (if present). For each ComponentLib,
//      compare against `COMPONENT_DETECTION_RULES[lib].packageJsonKeys` and
//      emit a `{lib, weight: COMPONENT_SIGNAL_WEIGHTS["package.json"]}` signal
//      per match.
//   2. Glob source files via `fs.readdir({ recursive: true })` (Node 20+).
//      Refuse-list filter mirrors Phase-3 `REFUSE_LIST` so the detector never
//      walks `node_modules/`, `dist/`, `.next/`, etc.
//   3. For each sampled file: read once, run `scoreImports` + filename-pattern
//      + className-pattern. Tally weights per (lib, file). CAP per-file at
//      `COMPONENT_DETECT_PER_FILE_WEIGHT_CAP`.
//   4. Average per-file caps across the sample for each lib. Pick the
//      `primaryLib = argmax`. If `max < COMPONENT_DETECT_CONFIDENCE_THRESHOLD`
//      → primaryLib = "vanilla".
//   5. Return ComponentDetectionResult with signals, confidence, strategy.
//
// Defensive posture: malformed package.json → empty signal set, never throws.
// Unreadable file → skipped silently. The detector is a HINT — the agent
// loop survives a `vanilla` verdict gracefully (Phase-3 css-override path).

import { promises as fs } from "node:fs";
import { extname, join, resolve, sep } from "node:path";

import {
  COMPONENT_DETECTION_RULES,
  COMPONENT_DETECT_CONFIDENCE_THRESHOLD,
  COMPONENT_DETECT_PER_FILE_WEIGHT_CAP,
  COMPONENT_DETECT_QUICK_SAMPLE_SIZE,
  COMPONENT_SIGNAL_WEIGHTS,
  type ComponentDetectionResult,
  type ComponentDetectOptions,
  type ComponentLib,
  type DetectionSignal,
  type EditStrategy,
} from "../contracts/component.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Hard cap on files scanned in deep mode — prevents runaway walks on huge
// monorepos. Tuned higher than QUICK_SAMPLE_SIZE so deep mode still gives
// the averaging a meaningful denominator.
const COMPONENT_DETECT_DEEP_FILE_CAP = 200;

// Per-file read size cap. Avoid sucking in giant generated files even if the
// refuse-list missed them (e.g. a hand-bundled vendor blob).
const COMPONENT_DETECT_MAX_READ_BYTES = 256 * 1024; // 256 KB

// Source file extensions we scan for imports / className patterns.
const SCANNABLE_EXTENSIONS: ReadonlySet<string> = new Set([
  ".tsx",
  ".jsx",
  ".ts",
  ".js",
  ".vue",
  ".svelte",
  ".astro",
  ".mts",
  ".cts",
]);

// Directories we skip during the walk. Mirrors src/contracts/source.ts
// REFUSE_LIST but kept local so this module has no Phase-3 runtime dep.
const REFUSED_DIRS: ReadonlySet<string> = new Set([
  "node_modules",
  "dist",
  "build",
  "out",
  ".next",
  ".nuxt",
  ".svelte-kit",
  "coverage",
  "__generated__",
  "target",
  ".git",
  ".turbo",
  ".cache",
  ".vercel",
  ".astro",
]);

// All declared component libs — derived once for the result aggregator.
const ALL_LIBS = Object.keys(COMPONENT_DETECTION_RULES) as ComponentLib[];

// ---------------------------------------------------------------------------
// Pure helpers — exported for tester direct use.
// ---------------------------------------------------------------------------

export function scorePackageJson(
  packageJson: {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  } | null | undefined,
): Array<{ lib: ComponentLib; weight: number; reason: string }> {
  if (packageJson === null || packageJson === undefined) return [];
  const allDeps = new Set<string>([
    ...Object.keys(packageJson.dependencies ?? {}),
    ...Object.keys(packageJson.devDependencies ?? {}),
  ]);
  const out: Array<{ lib: ComponentLib; weight: number; reason: string }> = [];
  for (const lib of ALL_LIBS) {
    const rule = COMPONENT_DETECTION_RULES[lib];
    for (const key of rule.packageJsonKeys) {
      // Substring match catches scoped subpackages (`@radix-ui/react-popover`
      // is matched by `@radix-ui/react-dialog`'s key only via exact match;
      // substring lets `@mui/material` match the `@mui/material-pigment-css`
      // family while keeping the contract table compact).
      for (const dep of allDeps) {
        if (dep === key || dep.includes(key)) {
          out.push({
            lib,
            weight: COMPONENT_SIGNAL_WEIGHTS["package.json"],
            reason: `dep ${dep} matches rule ${key}`,
          });
          break; // one match per key is enough
        }
      }
    }
  }
  return out;
}

export function scoreImports(
  content: string,
): Array<{ lib: ComponentLib; weight: number; reason: string }> {
  const out: Array<{ lib: ComponentLib; weight: number; reason: string }> = [];
  for (const lib of ALL_LIBS) {
    const rule = COMPONENT_DETECTION_RULES[lib];
    for (const pattern of rule.importPatterns) {
      // Use a fresh, non-global regex for a single hit-or-miss check. We
      // don't need the count — one match per pattern contributes one signal
      // for that (lib, file) pair. The per-file CAP handles the rest.
      const re = new RegExp(pattern.source, pattern.flags.replace("g", ""));
      const m = re.exec(content);
      if (m !== null) {
        out.push({
          lib,
          weight: COMPONENT_SIGNAL_WEIGHTS["import-scan"],
          reason: `import matched ${pattern.source}`,
        });
      }
    }
  }
  return out;
}

function scoreFilename(
  filePath: string,
): Array<{ lib: ComponentLib; weight: number; reason: string }> {
  const out: Array<{ lib: ComponentLib; weight: number; reason: string }> = [];
  // Normalise path separators so Windows + POSIX regexes both match.
  const normalised = filePath.split(sep).join("/");
  for (const lib of ALL_LIBS) {
    const rule = COMPONENT_DETECTION_RULES[lib];
    for (const pattern of rule.filenamePatterns) {
      const re = new RegExp(pattern.source, pattern.flags.replace("g", ""));
      if (re.test(normalised)) {
        out.push({
          lib,
          weight: COMPONENT_SIGNAL_WEIGHTS["filename-pattern"],
          reason: `filename matched ${pattern.source}`,
        });
      }
    }
  }
  return out;
}

function scoreClassName(
  content: string,
): Array<{ lib: ComponentLib; weight: number; reason: string }> {
  const out: Array<{ lib: ComponentLib; weight: number; reason: string }> = [];
  for (const lib of ALL_LIBS) {
    const rule = COMPONENT_DETECTION_RULES[lib];
    for (const pattern of rule.classNamePatterns) {
      const re = new RegExp(pattern.source, pattern.flags.replace("g", ""));
      if (re.test(content)) {
        out.push({
          lib,
          weight: COMPONENT_SIGNAL_WEIGHTS["className-pattern"],
          reason: `className matched ${pattern.source}`,
        });
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// File walker — recursive readdir with refuse-list filter.
// ---------------------------------------------------------------------------

async function readPackageJson(
  projectRoot: string,
): Promise<{ raw: unknown; deps: Set<string> } | null> {
  const pkgPath = join(projectRoot, "package.json");
  let raw: string;
  try {
    raw = await fs.readFile(pkgPath, "utf8");
  } catch {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== "object") return null;
  const pkg = parsed as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const deps = new Set<string>([
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.devDependencies ?? {}),
  ]);
  return { raw: parsed, deps };
}

async function discoverSourceFiles(
  projectRoot: string,
  cap: number,
): Promise<string[]> {
  // Node 20+ supports `withFileTypes` + `recursive: true` in `readdir`. We
  // implement our own iterative walk so we can short-circuit at `cap` and
  // honour `REFUSED_DIRS` mid-walk (recursive readdir would otherwise stream
  // the entire tree before our filter ran).
  const out: string[] = [];
  // Prefer to start from these common roots (most projects keep UI source
  // under one of them); fall back to projectRoot itself.
  const candidateRoots = ["src", "app", "components", "pages", "lib"];
  const seenRoots = new Set<string>();
  for (const candidate of candidateRoots) {
    const root = join(projectRoot, candidate);
    try {
      const stat = await fs.stat(root);
      if (stat.isDirectory()) seenRoots.add(root);
    } catch {
      // Missing dir — skip.
    }
  }
  if (seenRoots.size === 0) seenRoots.add(projectRoot);

  for (const root of seenRoots) {
    if (out.length >= cap) break;
    await walkDir(root, out, cap);
  }
  return out;
}

async function walkDir(
  dir: string,
  out: string[],
  cap: number,
): Promise<void> {
  if (out.length >= cap) return;
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (out.length >= cap) return;
    const name = entry.name;
    if (entry.isDirectory()) {
      if (REFUSED_DIRS.has(name)) continue;
      if (name.startsWith(".") && name !== "." && name !== "..") {
        // Hidden dirs (other than the REFUSED_DIRS already filtered) — skip.
        // This rules out .obsidian, .idea, etc. without an exhaustive list.
        continue;
      }
      await walkDir(join(dir, name), out, cap);
      continue;
    }
    if (!entry.isFile()) continue;
    const ext = extname(name).toLowerCase();
    if (!SCANNABLE_EXTENSIONS.has(ext)) continue;
    out.push(join(dir, name));
  }
}

async function readFileSafely(filePath: string): Promise<string | null> {
  try {
    // Stat first so we can skip large files cheaply. Reading then truncating
    // would still buffer the whole file.
    const stat = await fs.stat(filePath);
    if (stat.size > COMPONENT_DETECT_MAX_READ_BYTES) return null;
    return await fs.readFile(filePath, "utf8");
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Aggregation — cap-then-average.
// ---------------------------------------------------------------------------

interface PerFileScores {
  perLib: Map<ComponentLib, number>;
  signals: DetectionSignal[];
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function scoreFileContent(
  filePath: string,
  content: string,
): PerFileScores {
  const perLib = new Map<ComponentLib, number>();
  const signals: DetectionSignal[] = [];
  const addSignal = (
    source: DetectionSignal["source"],
    detail: string,
    lib: ComponentLib,
    weight: number,
  ): void => {
    signals.push({ source, detail, weight });
    perLib.set(lib, (perLib.get(lib) ?? 0) + weight);
  };

  for (const s of scoreImports(content)) {
    addSignal("import-scan", `${filePath}: ${s.reason}`, s.lib, s.weight);
  }
  for (const s of scoreFilename(filePath)) {
    addSignal("filename-pattern", s.reason, s.lib, s.weight);
  }
  for (const s of scoreClassName(content)) {
    addSignal("className-pattern", `${filePath}: ${s.reason}`, s.lib, s.weight);
  }

  // Apply per-file cap to each lib's accumulated weight.
  for (const [lib, weight] of perLib.entries()) {
    if (weight > COMPONENT_DETECT_PER_FILE_WEIGHT_CAP) {
      perLib.set(lib, COMPONENT_DETECT_PER_FILE_WEIGHT_CAP);
    }
  }
  return { perLib, signals };
}

// ---------------------------------------------------------------------------
// detect — main entry point.
// ---------------------------------------------------------------------------

export async function detect(
  opts: ComponentDetectOptions,
): Promise<ComponentDetectionResult> {
  const projectRoot = resolve(opts.projectRoot);
  const signals: DetectionSignal[] = [];

  // 1. package.json — once per detect call.
  const pkg = await readPackageJson(projectRoot);
  const pkgPerLib = new Map<ComponentLib, number>();
  if (pkg !== null) {
    const pkgInput = pkg.raw as Parameters<typeof scorePackageJson>[0];
    for (const s of scorePackageJson(pkgInput)) {
      signals.push({
        source: "package.json",
        detail: s.reason,
        weight: s.weight,
      });
      pkgPerLib.set(s.lib, (pkgPerLib.get(s.lib) ?? 0) + s.weight);
    }
    // The package.json "file" gets its own per-file cap.
    for (const [lib, weight] of pkgPerLib.entries()) {
      if (weight > COMPONENT_DETECT_PER_FILE_WEIGHT_CAP) {
        pkgPerLib.set(lib, COMPONENT_DETECT_PER_FILE_WEIGHT_CAP);
      }
    }
  }

  // 2. Discover sample files.
  const quick = opts.quick ?? false;
  const fileCap = quick ? COMPONENT_DETECT_QUICK_SAMPLE_SIZE : COMPONENT_DETECT_DEEP_FILE_CAP;
  let sampleFiles: string[];
  if (opts.sampleFiles !== undefined && opts.sampleFiles.length > 0) {
    sampleFiles = opts.sampleFiles.slice(0, fileCap);
  } else {
    sampleFiles = await discoverSourceFiles(projectRoot, fileCap);
  }

  // 3. Score each file. Aggregate per-file capped scores into a running sum
  //    per lib, then divide by the per-lib denominator (= count of files that
  //    yielded ≥1 signal for that lib) to get the average.
  //
  //    Note: averaging only over "files that signalled" prevents a project
  //    with 200 files where 10 are shadcn from getting confidence 10/200 =
  //    0.02 and being mis-classified as vanilla. The per-file CAP is the
  //    safeguard against single-file outliers.
  const sumPerLib = new Map<ComponentLib, number>();
  const fileCountPerLib = new Map<ComponentLib, number>();
  // Cap the visible-signal volume so the result payload stays compact even
  // on deep scans with hundreds of file-level hits.
  const MAX_VISIBLE_SIGNALS = 100;

  for (const filePath of sampleFiles) {
    const content = await readFileSafely(filePath);
    if (content === null) continue;
    const { perLib, signals: fileSignals } = scoreFileContent(filePath, content);
    for (const fs2 of fileSignals) {
      if (signals.length < MAX_VISIBLE_SIGNALS) signals.push(fs2);
    }
    for (const [lib, weight] of perLib.entries()) {
      sumPerLib.set(lib, (sumPerLib.get(lib) ?? 0) + weight);
      fileCountPerLib.set(lib, (fileCountPerLib.get(lib) ?? 0) + 1);
    }
  }

  // 4. Resolve per-lib confidence: average-of-signalling-source-files PLUS
  //    package.json score, clamped to [0,1].
  //
  //    Phase-6 used `(sourceSum + pkg) / (sourceCount + 1)` which DRAGGED
  //    confidence DOWN as additional source files signalled — exactly the
  //    opposite of the intended "more signal = more confidence". Concretely,
  //    a tailwind project with config + className files saw confidence
  //    (0.5+0.3+0.2)/3=0.333, falling below threshold despite three strong
  //    signals. The verifier flagged this as launch-blocker #16.
  //
  //    The new formula treats package.json as an additive standalone signal
  //    (an installed dep IS strong evidence on its own), while source-file
  //    signals contribute their averaged per-file score (averaging across
  //    signalling-files keeps the algorithm robust to repo size — a single
  //    matching file in a 500-file repo still shows up). The clamp prevents
  //    runaway saturation when both sides are strong.
  const finalConfidence = new Map<ComponentLib, number>();
  for (const lib of ALL_LIBS) {
    const sourceSum = sumPerLib.get(lib) ?? 0;
    const sourceCount = fileCountPerLib.get(lib) ?? 0;
    const pkgScore = pkgPerLib.get(lib) ?? 0;
    if (sourceCount === 0 && pkgScore === 0) {
      finalConfidence.set(lib, 0);
      continue;
    }
    const sourceAvg = sourceCount > 0 ? sourceSum / sourceCount : 0;
    finalConfidence.set(lib, clamp01(sourceAvg + pkgScore));
  }

  // 5. Pick primary.
  let primaryLib: ComponentLib = "vanilla";
  let maxScore = 0;
  for (const lib of ALL_LIBS) {
    if (lib === "vanilla") continue; // vanilla is the fallback, never the winner
    const s = finalConfidence.get(lib) ?? 0;
    if (s > maxScore) {
      maxScore = s;
      primaryLib = lib;
    }
  }
  if (maxScore < COMPONENT_DETECT_CONFIDENCE_THRESHOLD) {
    primaryLib = "vanilla";
  }

  const preferredStrategy = COMPONENT_DETECTION_RULES[primaryLib].preferredStrategy;
  const fallbackStrategies = buildFallbackChain(primaryLib, preferredStrategy);

  return {
    primaryLib,
    signals,
    confidence: clamp01(maxScore),
    preferredStrategy,
    fallbackStrategies,
    detectedAt: new Date().toISOString(),
  };
}

function buildFallbackChain(
  primaryLib: ComponentLib,
  preferred: EditStrategy,
): EditStrategy[] {
  // Documented in docs/component-detection.md §"Edit-strategy mapping".
  //   shadcn/tailwind  → [class-edit, css-override] (sans the preferred)
  //   radix/mui/chakra/ant → [css-override]
  //   vanilla          → []
  const chain: EditStrategy[] = [];
  if (primaryLib === "vanilla") return chain;
  if (preferred !== "class-edit") chain.push("class-edit");
  if (preferred !== "css-override") chain.push("css-override");
  // shadcn's chain is the canonical "class-edit, css-override" order.
  // radix/mui/chakra/ant get the same chain but class-edit rarely helps them
  // (they don't ship Tailwind classes). Listing it first matches the doc.
  if (primaryLib === "radix" || primaryLib === "mui" || primaryLib === "chakra" || primaryLib === "ant") {
    return chain.filter((s) => s === "css-override");
  }
  return chain;
}

// ---------------------------------------------------------------------------
// Module export — matches `ComponentDetectModule` in the contract.
// ---------------------------------------------------------------------------

export const componentDetectModule = {
  detect,
  scorePackageJson,
  scoreImports,
};
