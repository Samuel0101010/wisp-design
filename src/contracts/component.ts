// wisp-design — Component-library detection contracts (Phase 6, Improvement #11).
//
// Pure-TS shared type surface for `src/agent/component-detect.ts`. No runtime
// side effects; no `fs` / `path` imports — implementations consume these
// types and own the I/O.
//
// Relationship to `agent.ts`:
//   `agent.ts` exports a NARROW `ComponentLibSchema` (5 values: shadcn,
//   radix, mui, tailwind, vanilla) used in `VariantGenerationRequest` as the
//   agent-loop hint. This file exports the RICHER detection enum (7 values,
//   adds chakra + ant) used by the detector itself. The narrow enum is a
//   subset; the agent loop maps richer → narrower via `narrowComponentLib`
//   (implementation-side, not a contract concern).
//
// Three invariants downstream code MUST respect:
//   1. Confidence aggregation is bounded — `clamp(0, 1)`. The detector MUST
//      never return `confidence > 1` even when multiple high-weight signals
//      stack.
//   2. The signal weights are RULE-table-defined per (lib, source) pair. The
//      detector MUST NOT freelance weights; if a rule says weight=0.4 for
//      shadcn-import, every shadcn-import match contributes 0.4.
//   3. `quick:true` scans at most `COMPONENT_DETECT_QUICK_SAMPLE_SIZE` files
//      AND skips `node_modules/`, `dist/`, `.next/`, build outputs. The
//      detector MUST consult the same Phase-3 refuse-list filter.

import { z } from "zod";

// ---------------------------------------------------------------------------
// ComponentLib — richer detection enum than `agent.ts`. Both schemas coexist;
// the implementations bridge them by mapping chakra/ant → vanilla when handing
// off to the variant-generation request (no anchor in skills/data/anchors/
// for those two yet — coder/curator decision deferred to a later phase).
// ---------------------------------------------------------------------------

export const ComponentLibSchema = z.enum([
  "shadcn",
  "radix",
  "mui",
  "chakra",
  "ant",
  "tailwind",
  "vanilla",
]);
export type ComponentLib = z.infer<typeof ComponentLibSchema>;

// ---------------------------------------------------------------------------
// EditStrategy — how the source-edit engine should mutate this component.
//
// `prop-edit`       — for opinionated component libraries (shadcn, Radix,
//                     MUI, Chakra, Ant). Best path is to change the existing
//                     <Button variant="..." size="..." /> rather than over-
//                     ride the CSS, because the library's own theme system
//                     already exposes the knob.
// `class-edit`      — for Tailwind. Add/remove utility classes; the project
//                     already has a JIT pipeline that compiles them.
// `css-override`    — for vanilla CSS / unknown stacks. Phase-3 default —
//                     `<style data-wisp-css=…>` + `@scope` wrap.
// `structural-edit` — for `--structural` flag (Phase-6 Improvement #6).
//                     Replaces JSX subtree, not just attributes.
// ---------------------------------------------------------------------------

export const EditStrategySchema = z.enum([
  "prop-edit",
  "class-edit",
  "css-override",
  "structural-edit",
]);
export type EditStrategy = z.infer<typeof EditStrategySchema>;

// ---------------------------------------------------------------------------
// Detection signal sources — every signal carries its source, a free-form
// `detail` for diagnostics, and a `weight` ∈ [0,1]. Detector aggregates
// per-lib weights then clamps to [0,1].
// ---------------------------------------------------------------------------

export const DetectionSourceSchema = z.enum([
  "package.json", // dep / devDep key match
  "import-scan", // matched RegExp against source content
  "filename-pattern", // matched RegExp against file path
  "className-pattern", // matched RegExp against className= attribute
]);
export type DetectionSource = z.infer<typeof DetectionSourceSchema>;

export const DetectionSignalSchema = z.object({
  source: DetectionSourceSchema,
  detail: z.string().min(1),
  weight: z.number().min(0).max(1),
});
export type DetectionSignal = z.infer<typeof DetectionSignalSchema>;

// ---------------------------------------------------------------------------
// ComponentDetectionResult — what `detect()` returns.
//
// `primaryLib` is the lib with the highest aggregated weight. `signals`
// includes ALL contributing signals (not just for `primaryLib`) so the agent
// loop can warn when the project is a hybrid (e.g. shadcn + Tailwind is
// legitimate; MUI + Chakra is suspicious).
//
// `preferredStrategy` is the strategy bound to `primaryLib` in
// COMPONENT_DETECTION_RULES; `fallbackStrategies` is the ordered list the
// agent should try if the primary fails (e.g. shadcn's prop-edit fails when
// the user hand-edits the underlying primitive → fall back to class-edit).
// ---------------------------------------------------------------------------

export const ComponentDetectionResultSchema = z.object({
  primaryLib: ComponentLibSchema,
  signals: z.array(DetectionSignalSchema),
  confidence: z.number().min(0).max(1),
  detectedVersion: z.string().optional(),
  preferredStrategy: EditStrategySchema,
  fallbackStrategies: z.array(EditStrategySchema),
  detectedAt: z.string(), // ISO
});
export type ComponentDetectionResult = z.infer<
  typeof ComponentDetectionResultSchema
>;

// ---------------------------------------------------------------------------
// COMPONENT_DETECTION_RULES — the authoritative table.
//
// Per lib:
//   - `packageJsonKeys` — substring match against keys of `dependencies` /
//     `devDependencies`. Each match contributes weight 0.5 (strong signal:
//     the dep is literally installed).
//   - `importPatterns` — RegExp against source file content. Each match
//     contributes weight 0.4 (strong but not conclusive — could be lazy
//     migration). Shadcn's `@/components/ui/...` pattern is project-
//     conventional, not library-installed.
//   - `filenamePatterns` — RegExp against file path. Each match contributes
//     weight 0.3 (Tailwind's tailwind.config.* is the canonical anchor).
//   - `classNamePatterns` — RegExp against className attribute string. Each
//     match contributes weight 0.2 (weak signal — utility classes can be
//     hand-rolled).
//
// Weights are aggregated PER FILE, capped at 1.0 BEFORE summing across files,
// then averaged across the sampled set. This prevents a single
// shadcn-heavy file from dragging the verdict.
// ---------------------------------------------------------------------------

export interface ComponentDetectionRule {
  packageJsonKeys: string[];
  importPatterns: RegExp[];
  filenamePatterns: RegExp[];
  classNamePatterns: RegExp[];
  preferredStrategy: EditStrategy;
}

export const COMPONENT_DETECTION_RULES: Readonly<
  Record<ComponentLib, ComponentDetectionRule>
> = {
  shadcn: {
    // shadcn is copy-pasted, NOT installed as a dep. So no direct
    // package.json key — we recognise it via import path convention.
    packageJsonKeys: ["@shadcn/ui"], // listed for completeness; rarely present
    importPatterns: [
      /from\s+["']@\/components\/ui\/(button|card|dialog|input|select|tabs|sheet|toast)["']/,
    ],
    filenamePatterns: [
      /components\/ui\/(button|card|dialog|input|select|tabs|sheet|toast)\.tsx$/,
    ],
    classNamePatterns: [/cn\s*\(/], // shadcn convention: cn utility wraps className
    preferredStrategy: "prop-edit",
  },
  radix: {
    packageJsonKeys: [
      "@radix-ui/react-dialog",
      "@radix-ui/react-popover",
      "@radix-ui/react-tooltip",
      "@radix-ui/react-dropdown-menu",
      "@radix-ui/react-select",
    ],
    importPatterns: [/from\s+["']@radix-ui\//],
    filenamePatterns: [],
    classNamePatterns: [],
    preferredStrategy: "prop-edit",
  },
  mui: {
    packageJsonKeys: [
      "@mui/material",
      "@mui/core",
      "@mui/joy",
      "@mui/base",
    ],
    importPatterns: [/from\s+["']@mui\//],
    filenamePatterns: [],
    classNamePatterns: [],
    preferredStrategy: "prop-edit",
  },
  chakra: {
    packageJsonKeys: ["@chakra-ui/react"],
    importPatterns: [/from\s+["']@chakra-ui\//],
    filenamePatterns: [],
    classNamePatterns: [],
    preferredStrategy: "prop-edit",
  },
  ant: {
    packageJsonKeys: ["antd"],
    importPatterns: [/from\s+["']antd\//],
    filenamePatterns: [],
    classNamePatterns: [],
    preferredStrategy: "prop-edit",
  },
  tailwind: {
    packageJsonKeys: ["tailwindcss"],
    importPatterns: [],
    filenamePatterns: [/tailwind\.config\.(js|ts|cjs|mjs)$/],
    classNamePatterns: [
      /className\s*=\s*["'`][^"'`]*\b(bg-|text-|p-|m-|flex|grid|gap-|space-)/,
    ],
    preferredStrategy: "class-edit",
  },
  vanilla: {
    // Empty signal set; vanilla is the FALLBACK verdict when no other lib
    // crosses `COMPONENT_DETECT_CONFIDENCE_THRESHOLD`. Listed in the rule
    // map so the type system enforces exhaustiveness.
    packageJsonKeys: [],
    importPatterns: [],
    filenamePatterns: [],
    classNamePatterns: [],
    preferredStrategy: "css-override",
  },
};

// Signal weights, exported so tests + the detector reference the same table.
export const COMPONENT_SIGNAL_WEIGHTS: Readonly<
  Record<DetectionSource, number>
> = {
  "package.json": 0.5,
  "import-scan": 0.4,
  "filename-pattern": 0.3,
  "className-pattern": 0.2,
};

// ---------------------------------------------------------------------------
// Detection options & constants
// ---------------------------------------------------------------------------

export interface ComponentDetectOptions {
  projectRoot: string;
  // If supplied, the detector scans only these files; otherwise discovers
  // via Glob `**/*.{tsx,jsx,ts,js,svelte,vue}` (Phase-3 refuse-list filtered).
  sampleFiles?: string[];
  // `true` = quick scan: top-10 most-recently-modified files (or `sampleFiles`
  // if supplied) + package.json only. `false` = deep scan: every source file
  // not on the refuse-list.
  quick?: boolean;
}

export interface ComponentDetectModule {
  detect(opts: ComponentDetectOptions): Promise<ComponentDetectionResult>;

  // Pure helpers — easy to test in isolation.
  scorePackageJson(packageJson: {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  }): Array<{ lib: ComponentLib; weight: number; reason: string }>;

  scoreImports(
    content: string,
  ): Array<{ lib: ComponentLib; weight: number; reason: string }>;
}

// Top-N most-recently-modified files to scan when `quick:true`. Tuned for
// hot-path before each variant generation — must complete in <50ms on a
// medium project.
export const COMPONENT_DETECT_QUICK_SAMPLE_SIZE = 10;

// Below this aggregated confidence, the detector returns `primaryLib =
// vanilla` and the agent falls back to `css-override`. Tuned by
// research/competitive-landscape.md § Improvement #11 (Impeccable's edit-
// surface heuristic): 0.6 captures shadcn projects with ≥2 imports + the cn
// utility, while filtering out projects that merely have @radix-ui as a
// transitive dep.
export const COMPONENT_DETECT_CONFIDENCE_THRESHOLD = 0.6;

// Maximum aggregated weight per FILE before averaging across the sample.
// Caps single-file outliers (a file that imports 8 shadcn primitives would
// otherwise saturate the verdict). Pegged at 1.0 to keep confidence on
// the [0,1] scale.
export const COMPONENT_DETECT_PER_FILE_WEIGHT_CAP = 1.0;
