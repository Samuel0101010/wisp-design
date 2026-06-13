#!/usr/bin/env node

// src/agent/init.ts
import { mkdir, stat, writeFile } from "fs/promises";
import { dirname as dirname3, resolve as resolve4 } from "path";

// src/contracts/init.ts
import { z } from "zod";
var InitStyleSchema = z.enum(["minimalist", "expressive", "dense"]);
var OkLchPattern = /^oklch\(\s*[0-9.%]+\s+[0-9.]+\s+[0-9.]+(\s*\/\s*[0-9.%]+)?\s*\)$/i;
var InitCliFlagsSchema = z.object({
  nonInteractive: z.boolean().default(false),
  brandName: z.string().min(1).optional(),
  primaryColor: z.string().regex(OkLchPattern, "primary-color must be an oklch() literal").optional(),
  style: InitStyleSchema.default("minimalist")
});
var BrandVoiceSchema = z.object({
  tone: z.string().min(1),
  // e.g. "warm-precise", "playful-honest"
  person: z.enum(["first", "second", "third"]),
  register: z.enum(["formal", "casual", "technical"])
});
var BrandSurfaceSchema = z.enum([
  "marketing-site",
  "app",
  "docs",
  "dashboard",
  "mobile",
  "email"
]);
var BrandColorsSchema = z.object({
  primary: z.string().regex(OkLchPattern),
  neutral: z.string().regex(OkLchPattern),
  accent: z.string().regex(OkLchPattern).optional()
});
var BrandTypographySchema = z.object({
  // Two-font system per open-design preset: display + body. shorthand strings
  // (e.g. "Inter", "system-ui") rather than full CSS stacks — carbonize
  // resolves to full stacks at write time.
  display: z.string().min(1),
  body: z.string().min(1)
});
var BrandDensitySchema = z.enum(["compact", "comfortable", "generous"]);
var BrandMotionSchema = z.enum(["restrained", "expressive", "none"]);
var BrandAccessibilitySchema = z.object({
  // Target WCAG conformance level. `AA` is the wisp-design default.
  wcag: z.enum(["AA", "AAA"]).default("AA"),
  reducedMotionDefault: z.boolean().default(true)
});
var BrandSpecSchema = z.object({
  name: z.string().min(1),
  voice: BrandVoiceSchema,
  // Free-form 1-3 sentence audience description, captured from
  // Narrative-Question #1 ("who is this for?").
  audience: z.string().min(1),
  surfaces: z.array(BrandSurfaceSchema).min(1),
  brand: BrandColorsSchema,
  typography: BrandTypographySchema,
  density: BrandDensitySchema,
  motion: BrandMotionSchema,
  accessibility: BrandAccessibilitySchema
});
var BRAND_SPEC_DEFAULTS = {
  minimalist: {
    voice: {
      tone: "calm-direct",
      person: "second",
      register: "casual"
    },
    style: {
      primary: "oklch(0.62 0.21 256)",
      // a neutral indigo
      neutral: "oklch(0.96 0.005 256)",
      typography: { display: "Inter", body: "Inter" },
      density: "comfortable",
      motion: "restrained"
    }
  },
  expressive: {
    voice: {
      tone: "warm-curious",
      person: "second",
      register: "casual"
    },
    style: {
      primary: "oklch(0.66 0.24 35)",
      neutral: "oklch(0.94 0.01 35)",
      typography: { display: "Fraunces", body: "Inter" },
      density: "generous",
      motion: "expressive"
    }
  },
  dense: {
    voice: {
      tone: "precise-technical",
      person: "third",
      register: "technical"
    },
    style: {
      primary: "oklch(0.58 0.16 200)",
      neutral: "oklch(0.92 0.005 200)",
      typography: { display: "IBM Plex Sans", body: "IBM Plex Sans" },
      density: "compact",
      motion: "restrained"
    }
  }
};

// src/agent/component-detect.ts
import { promises as fs } from "fs";
import { extname, join, resolve, sep } from "path";

// src/contracts/component.ts
import { z as z2 } from "zod";
var ComponentLibSchema = z2.enum([
  "shadcn",
  "radix",
  "mui",
  "chakra",
  "ant",
  "tailwind",
  "vanilla"
]);
var EditStrategySchema = z2.enum([
  "prop-edit",
  "class-edit",
  "css-override",
  "structural-edit"
]);
var DetectionSourceSchema = z2.enum([
  "package.json",
  // dep / devDep key match
  "import-scan",
  // matched RegExp against source content
  "filename-pattern",
  // matched RegExp against file path
  "className-pattern"
  // matched RegExp against className= attribute
]);
var DetectionSignalSchema = z2.object({
  source: DetectionSourceSchema,
  detail: z2.string().min(1),
  weight: z2.number().min(0).max(1)
});
var ComponentDetectionResultSchema = z2.object({
  primaryLib: ComponentLibSchema,
  signals: z2.array(DetectionSignalSchema),
  confidence: z2.number().min(0).max(1),
  detectedVersion: z2.string().optional(),
  preferredStrategy: EditStrategySchema,
  fallbackStrategies: z2.array(EditStrategySchema),
  detectedAt: z2.string()
  // ISO
});
var COMPONENT_DETECTION_RULES = {
  shadcn: {
    // shadcn is copy-pasted, NOT installed as a dep. So no direct
    // package.json key — we recognise it via import path convention.
    packageJsonKeys: ["@shadcn/ui"],
    // listed for completeness; rarely present
    importPatterns: [
      /from\s+["']@\/components\/ui\/(button|card|dialog|input|select|tabs|sheet|toast)["']/
    ],
    filenamePatterns: [
      /components\/ui\/(button|card|dialog|input|select|tabs|sheet|toast)\.tsx$/
    ],
    classNamePatterns: [/cn\s*\(/],
    // shadcn convention: cn utility wraps className
    preferredStrategy: "prop-edit"
  },
  radix: {
    packageJsonKeys: [
      "@radix-ui/react-dialog",
      "@radix-ui/react-popover",
      "@radix-ui/react-tooltip",
      "@radix-ui/react-dropdown-menu",
      "@radix-ui/react-select"
    ],
    importPatterns: [/from\s+["']@radix-ui\//],
    filenamePatterns: [],
    classNamePatterns: [],
    preferredStrategy: "prop-edit"
  },
  mui: {
    packageJsonKeys: [
      "@mui/material",
      "@mui/core",
      "@mui/joy",
      "@mui/base"
    ],
    importPatterns: [/from\s+["']@mui\//],
    filenamePatterns: [],
    classNamePatterns: [],
    preferredStrategy: "prop-edit"
  },
  chakra: {
    packageJsonKeys: ["@chakra-ui/react"],
    importPatterns: [/from\s+["']@chakra-ui\//],
    filenamePatterns: [],
    classNamePatterns: [],
    preferredStrategy: "prop-edit"
  },
  ant: {
    packageJsonKeys: ["antd"],
    importPatterns: [/from\s+["']antd\//],
    filenamePatterns: [],
    classNamePatterns: [],
    preferredStrategy: "prop-edit"
  },
  tailwind: {
    packageJsonKeys: ["tailwindcss"],
    importPatterns: [],
    filenamePatterns: [/tailwind\.config\.(js|ts|cjs|mjs)$/],
    classNamePatterns: [
      /className\s*=\s*["'`][^"'`]*\b(bg-|text-|p-|m-|flex|grid|gap-|space-)/
    ],
    preferredStrategy: "class-edit"
  },
  vanilla: {
    // Empty signal set; vanilla is the FALLBACK verdict when no other lib
    // crosses `COMPONENT_DETECT_CONFIDENCE_THRESHOLD`. Listed in the rule
    // map so the type system enforces exhaustiveness.
    packageJsonKeys: [],
    importPatterns: [],
    filenamePatterns: [],
    classNamePatterns: [],
    preferredStrategy: "css-override"
  }
};
var COMPONENT_SIGNAL_WEIGHTS = {
  "package.json": 0.5,
  "import-scan": 0.4,
  "filename-pattern": 0.3,
  "className-pattern": 0.2
};
var COMPONENT_DETECT_QUICK_SAMPLE_SIZE = 10;
var COMPONENT_DETECT_CONFIDENCE_THRESHOLD = 0.45;
var COMPONENT_DETECT_PER_FILE_WEIGHT_CAP = 1;

// src/agent/component-detect.ts
var COMPONENT_DETECT_DEEP_FILE_CAP = 200;
var COMPONENT_DETECT_MAX_READ_BYTES = 256 * 1024;
var SCANNABLE_EXTENSIONS = /* @__PURE__ */ new Set([
  ".tsx",
  ".jsx",
  ".ts",
  ".js",
  ".vue",
  ".svelte",
  ".astro",
  ".mts",
  ".cts"
]);
var REFUSED_DIRS = /* @__PURE__ */ new Set([
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
  ".astro"
]);
var ALL_LIBS = Object.keys(COMPONENT_DETECTION_RULES);
function scorePackageJson(packageJson) {
  if (packageJson === null || packageJson === void 0) return [];
  const allDeps = /* @__PURE__ */ new Set([
    ...Object.keys(packageJson.dependencies ?? {}),
    ...Object.keys(packageJson.devDependencies ?? {})
  ]);
  const out = [];
  for (const lib of ALL_LIBS) {
    const rule = COMPONENT_DETECTION_RULES[lib];
    for (const key of rule.packageJsonKeys) {
      for (const dep of allDeps) {
        if (dep === key || dep.includes(key)) {
          out.push({
            lib,
            weight: COMPONENT_SIGNAL_WEIGHTS["package.json"],
            reason: `dep ${dep} matches rule ${key}`
          });
          break;
        }
      }
    }
  }
  return out;
}
function scoreImports(content) {
  const out = [];
  for (const lib of ALL_LIBS) {
    const rule = COMPONENT_DETECTION_RULES[lib];
    for (const pattern of rule.importPatterns) {
      const re = new RegExp(pattern.source, pattern.flags.replace("g", ""));
      const m = re.exec(content);
      if (m !== null) {
        out.push({
          lib,
          weight: COMPONENT_SIGNAL_WEIGHTS["import-scan"],
          reason: `import matched ${pattern.source}`
        });
      }
    }
  }
  return out;
}
function scoreFilename(filePath) {
  const out = [];
  const normalised = filePath.split(sep).join("/");
  for (const lib of ALL_LIBS) {
    const rule = COMPONENT_DETECTION_RULES[lib];
    for (const pattern of rule.filenamePatterns) {
      const re = new RegExp(pattern.source, pattern.flags.replace("g", ""));
      if (re.test(normalised)) {
        out.push({
          lib,
          weight: COMPONENT_SIGNAL_WEIGHTS["filename-pattern"],
          reason: `filename matched ${pattern.source}`
        });
      }
    }
  }
  return out;
}
function scoreClassName(content) {
  const out = [];
  for (const lib of ALL_LIBS) {
    const rule = COMPONENT_DETECTION_RULES[lib];
    for (const pattern of rule.classNamePatterns) {
      const re = new RegExp(pattern.source, pattern.flags.replace("g", ""));
      if (re.test(content)) {
        out.push({
          lib,
          weight: COMPONENT_SIGNAL_WEIGHTS["className-pattern"],
          reason: `className matched ${pattern.source}`
        });
      }
    }
  }
  return out;
}
async function readPackageJson(projectRoot) {
  const pkgPath = join(projectRoot, "package.json");
  let raw;
  try {
    raw = await fs.readFile(pkgPath, "utf8");
  } catch {
    return null;
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== "object") return null;
  const pkg = parsed;
  const deps = /* @__PURE__ */ new Set([
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.devDependencies ?? {})
  ]);
  return { raw: parsed, deps };
}
async function discoverSourceFiles(projectRoot, cap) {
  const out = [];
  const candidateRoots = ["src", "app", "components", "pages", "lib"];
  const seenRoots = /* @__PURE__ */ new Set();
  for (const candidate of candidateRoots) {
    const root = join(projectRoot, candidate);
    try {
      const stat2 = await fs.stat(root);
      if (stat2.isDirectory()) seenRoots.add(root);
    } catch {
    }
  }
  if (seenRoots.size === 0) seenRoots.add(projectRoot);
  for (const root of seenRoots) {
    if (out.length >= cap) break;
    await walkDir(root, out, cap);
  }
  return out;
}
async function walkDir(dir, out, cap) {
  if (out.length >= cap) return;
  let entries;
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
async function readFileSafely(filePath) {
  try {
    const stat2 = await fs.stat(filePath);
    if (stat2.size > COMPONENT_DETECT_MAX_READ_BYTES) return null;
    return await fs.readFile(filePath, "utf8");
  } catch {
    return null;
  }
}
function clamp01(n) {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}
function scoreFileContent(filePath, content) {
  const perLib = /* @__PURE__ */ new Map();
  const signals = [];
  const addSignal = (source, detail, lib, weight) => {
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
  for (const [lib, weight] of perLib.entries()) {
    if (weight > COMPONENT_DETECT_PER_FILE_WEIGHT_CAP) {
      perLib.set(lib, COMPONENT_DETECT_PER_FILE_WEIGHT_CAP);
    }
  }
  return { perLib, signals };
}
async function detect(opts) {
  const projectRoot = resolve(opts.projectRoot);
  const signals = [];
  const pkg = await readPackageJson(projectRoot);
  const pkgPerLib = /* @__PURE__ */ new Map();
  if (pkg !== null) {
    const pkgInput = pkg.raw;
    for (const s of scorePackageJson(pkgInput)) {
      signals.push({
        source: "package.json",
        detail: s.reason,
        weight: s.weight
      });
      pkgPerLib.set(s.lib, (pkgPerLib.get(s.lib) ?? 0) + s.weight);
    }
    for (const [lib, weight] of pkgPerLib.entries()) {
      if (weight > COMPONENT_DETECT_PER_FILE_WEIGHT_CAP) {
        pkgPerLib.set(lib, COMPONENT_DETECT_PER_FILE_WEIGHT_CAP);
      }
    }
  }
  const quick = opts.quick ?? false;
  const fileCap = quick ? COMPONENT_DETECT_QUICK_SAMPLE_SIZE : COMPONENT_DETECT_DEEP_FILE_CAP;
  let sampleFiles;
  if (opts.sampleFiles !== void 0 && opts.sampleFiles.length > 0) {
    sampleFiles = opts.sampleFiles.slice(0, fileCap);
  } else {
    sampleFiles = await discoverSourceFiles(projectRoot, fileCap);
  }
  const sumPerLib = /* @__PURE__ */ new Map();
  const fileCountPerLib = /* @__PURE__ */ new Map();
  const MAX_VISIBLE_SIGNALS = 100;
  for (const filePath of sampleFiles) {
    const content = await readFileSafely(filePath);
    if (content === null) continue;
    const { perLib, signals: fileSignals } = scoreFileContent(filePath, content);
    for (const fs22 of fileSignals) {
      if (signals.length < MAX_VISIBLE_SIGNALS) signals.push(fs22);
    }
    for (const [lib, weight] of perLib.entries()) {
      sumPerLib.set(lib, (sumPerLib.get(lib) ?? 0) + weight);
      fileCountPerLib.set(lib, (fileCountPerLib.get(lib) ?? 0) + 1);
    }
  }
  const finalConfidence = /* @__PURE__ */ new Map();
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
  let primaryLib = "vanilla";
  let maxScore = 0;
  for (const lib of ALL_LIBS) {
    if (lib === "vanilla") continue;
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
    detectedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
function buildFallbackChain(primaryLib, preferred) {
  const chain = [];
  if (primaryLib === "vanilla") return chain;
  if (preferred !== "class-edit") chain.push("class-edit");
  if (preferred !== "css-override") chain.push("css-override");
  if (primaryLib === "radix" || primaryLib === "mui" || primaryLib === "chakra" || primaryLib === "ant") {
    return chain.filter((s) => s === "css-override");
  }
  return chain;
}

// src/session/logger.ts
import { promises as fs3 } from "fs";
import { dirname as dirname2, join as join3 } from "path";

// src/source/undo-stack.ts
import { promises as fs2 } from "fs";
import { dirname, isAbsolute, join as join2, resolve as resolve2, sep as sep2 } from "path";

// src/contracts/source.ts
import { z as z3 } from "zod";
var SourceFileTypeSchema = z3.enum([
  "tsx",
  "jsx",
  "html",
  "vue",
  "svelte",
  "css"
]);
var MarkerKindSchema = z3.enum([
  "inject-start",
  "inject-end",
  "variants-start",
  "variants-end",
  "style-start",
  "style-end"
]);
var MarkerGroupSchema = z3.enum(["inject", "variants", "style"]);
var InjectMarkerSchema = z3.object({
  injectId: z3.string().min(1),
  // ULID or UUID
  insertedAt: z3.string(),
  // ISO timestamp
  bridgeUrl: z3.string().url(),
  token: z3.string().uuid(),
  // SHA256 hex of the original first 256 bytes of the file (before inject).
  // `removeLiveScript` recomputes the hash AFTER stripping the inject and
  // refuses if it doesn't match — protects against partial edits.
  beforeHash: z3.string().regex(/^[0-9a-f]{64}$/i),
  scriptSrc: z3.string().url().optional(),
  inline: z3.boolean().default(false)
});
var VariantBlockMarkerSchema = z3.object({
  sessionId: z3.string().min(1),
  targetId: z3.string().min(1),
  wrappedAt: z3.string(),
  // ISO
  variantCount: z3.number().int().min(1).max(8),
  originalLines: z3.string()
  // base64 of the wrapped original snippet
});
var StyleBlockMarkerSchema = z3.object({
  sessionId: z3.string().min(1),
  targetId: z3.string().min(1),
  // `@scope` selector base (without the `[data-wisp-variant="N"]` index).
  // Lets carbonize rewrite scope rules into permanent selectors targeting
  // the accepted variant's host.
  scopeBase: z3.string().min(1)
});
var MarkerBlockSchema = z3.object({
  startLine: z3.number().int().min(0),
  endLine: z3.number().int().min(0),
  startOffset: z3.number().int().min(0),
  endOffset: z3.number().int().min(0),
  group: MarkerGroupSchema,
  // Parsed `k=v` pairs from the OPEN marker. Decoded via `decodeURIComponent`.
  payload: z3.record(z3.string(), z3.string())
});
var InjectOptionsSchema = z3.object({
  bridgeUrl: z3.string().url(),
  token: z3.string().uuid(),
  // If true, the marker payload sets `inline=true` and the injected element
  // is `<script>…inline body…</script>`; otherwise it's
  // `<script src="${bridgeUrl}/live.js?token=${token}">`. Inline form is used
  // by tests; production always uses the src form.
  inline: z3.boolean().default(false),
  // Where to splice the script tag. JSX/TSX: just inside `<head>` if present,
  // else at top of the file's first top-level JSX expression. HTML/Vue/Svelte:
  // before `</head>`. CSS: rejected by safetyCheck — CSS cannot host a script.
  preferredAnchor: z3.enum(["before-head-close", "after-head-open", "auto"]).default("auto"),
  // Optional caller-supplied injectId; useful for tests that need determinism.
  injectId: z3.string().min(1).optional()
});
var AcceptOperationSchema = z3.object({
  filePath: z3.string().min(1),
  sessionId: z3.string().min(1),
  targetId: z3.string().min(1),
  variantId: z3.string().min(1),
  // The full variant CSS (the `@scope ([data-wisp-variant="N"]) { … }` body).
  // The agent supplies this; the engine does not re-fetch it.
  variantCss: z3.string(),
  // CSS-var overrides accumulated from slider tuning. Keys must match the
  // `--name` form; values are baked literal into the carbonized output.
  paramOverrides: z3.record(z3.string(), z3.string()).default({}),
  // If false: leave the `@scope` rule verbatim (debugging mode). Default true:
  // rewrite the rule into permanent selectors targeting the chosen variant's
  // host node.
  carbonize: z3.boolean().default(true),
  // Optional override of the auto-detected EOL convention. Default = detect.
  eolConvention: z3.enum(["\n", "\r\n", "\r"]).optional()
});
var DiscardOperationSchema = z3.object({
  filePath: z3.string().min(1),
  sessionId: z3.string().min(1),
  targetId: z3.string().min(1)
});
var SafetyErrorCodeSchema = z3.enum([
  "PATH_OUTSIDE_ROOT",
  "REFUSE_LIST_MATCH",
  // dist/, .next/, node_modules/, etc.
  "GENERATED_MAGIC_COMMENT",
  // `@generated` in first 200 bytes
  "BINARY_FILE",
  // not utf-8 decodable
  "FILE_TOO_LARGE",
  // > MAX_SOURCE_FILE_BYTES
  "UNSUPPORTED_FILE_TYPE",
  // extension not in SUPPORTED_EXTENSIONS
  "READ_ONLY_FILE",
  // fs.access W_OK rejected
  "SYMLINK_ESCAPE"
  // realpath resolves outside projectRoot
]);
var UndoEntryKindSchema = z3.enum([
  "inject-script",
  "remove-script",
  "wrap-variants",
  "discard-variants",
  "accept-variant",
  "param-change",
  "safety-refused"
]);
var UndoEntrySchema = z3.object({
  ts: z3.string(),
  // ISO timestamp
  sessionId: z3.string().min(1),
  kind: UndoEntryKindSchema,
  filePath: z3.string().min(1),
  detail: z3.record(z3.string(), z3.unknown()).optional(),
  // Hex SHA256 of the file before / after the operation. `safety-refused`
  // entries omit both. `param-change` omits `afterHash` (the param change is
  // a runtime DOM update; no file mutation has happened yet).
  beforeSha256: z3.string().regex(/^[0-9a-f]{64}$/i).optional(),
  afterSha256: z3.string().regex(/^[0-9a-f]{64}$/i).optional()
});

// src/source/undo-stack.ts
var DEFAULT_PROJECT_ROOT = process.cwd();

// src/contracts/session.ts
import { z as z4 } from "zod";
var SessionEventKindSchema = z4.enum([
  // Inherit Phase-3 file-op kinds verbatim.
  ...UndoEntryKindSchema.options,
  // Phase-6 session-level kinds.
  "session-start",
  "session-end",
  "pick",
  "configure",
  "variants-emitted",
  "cycle-active-changed",
  "param-changed",
  "annotation-added",
  "verify-report",
  "policy-proposal-shown",
  "policy-proposal-accepted",
  "policy-proposal-declined",
  "morph-engaged",
  "structure-variant-emitted",
  "component-lib-detected"
]);
var SessionEventEntrySchema = z4.object({
  ts: z4.string(),
  // ISO timestamp
  sessionId: z4.string().min(1),
  kind: SessionEventKindSchema,
  filePath: z4.string().optional(),
  detail: z4.record(z4.string(), z4.unknown()).optional(),
  beforeSha256: z4.string().regex(/^[0-9a-f]{64}$/i).optional(),
  afterSha256: z4.string().regex(/^[0-9a-f]{64}$/i).optional()
});
var PolicyAxisSchema = z4.enum([
  "hierarchy",
  "layout",
  "typography",
  "color",
  "density"
]);
var PolicyProposalSchema = z4.object({
  axis: PolicyAxisSchema,
  observation: z4.string().min(1),
  // human-readable: "3 high-density variants accepted in a row"
  proposed: z4.string().min(1),
  // proposed change: "add density: 'generous' to .wisp/policy.md"
  evidence: z4.array(
    z4.object({
      ts: z4.string(),
      variantId: z4.string().min(1),
      primaryAxis: PolicyAxisSchema
    })
  ),
  triggerThreshold: z4.number().int().min(2).default(3)
});
var PolicyDocumentSchema = z4.object({
  axes: z4.record(PolicyAxisSchema, z4.string().min(1)).default({}),
  acceptedAt: z4.string(),
  source: z4.enum(["user-confirmed", "wisp-proposed-then-confirmed"])
});
var MORPH_T_MIN = 0;
var MORPH_T_MAX = 1;
var MorphVariableDiffSchema = z4.object({
  name: z4.string().regex(/^--[a-z][a-z0-9-]*$/i, "must be a CSS custom property"),
  valueA: z4.string(),
  valueB: z4.string(),
  interpolatable: z4.boolean(),
  unit: z4.string().optional()
});
var MorphSourceSchema = z4.object({
  variantIdA: z4.string().min(1),
  variantIdB: z4.string().min(1),
  // Auto-extracted diff of CSS-vars between A and B.
  variableDiff: z4.array(MorphVariableDiffSchema)
});
var MorphConfigSchema = z4.object({
  source: MorphSourceSchema,
  t: z4.number().min(MORPH_T_MIN).max(MORPH_T_MAX),
  interpolatedCss: z4.string()
});
var StructureVariantKindSchema = z4.enum([
  "as-is",
  // baseline = original JSX (always present so the user can revert without re-pick)
  "two-col-split",
  // 2-column layout
  "card-layout",
  // wrap children in card components
  "stacked-vertical",
  // simple vertical stack
  "horizontal-row",
  // row layout
  "hero-style",
  // hero treatment (large primary)
  "sidebar-left",
  "sidebar-right"
]);
var STRUCTURE_VARIANT_RATIONALE_MAX_LEN = 180;
var StructureVariantSpecSchema = z4.object({
  kind: StructureVariantKindSchema,
  rationale: z4.string().min(1).max(STRUCTURE_VARIANT_RATIONALE_MAX_LEN),
  // Full JSX subtree as a STRING — agent-emitted. Lives in a markdown-fenced
  // block during transport; the source-edit layer parses it as the raw
  // replacement payload.
  jsx: z4.string().min(1),
  // CSS to inject alongside (optional — purely structural variants may have
  // no CSS; tied to the JSX via the structure-variant-emitted log entry).
  css: z4.string().default("")
});

// src/session/logger.ts
var gitignoreEnsuredFor = null;
async function ensureWispGitignored(projectRoot) {
  if (gitignoreEnsuredFor === projectRoot) return;
  gitignoreEnsuredFor = projectRoot;
  const giPath = join3(projectRoot, ".gitignore");
  try {
    const text = await fs3.readFile(giPath, "utf8").catch(() => "");
    const covered = text.split(/\r?\n/).map((l) => l.trim()).some((l) => l === ".wisp" || l === ".wisp/" || l === "/.wisp" || l === "/.wisp/");
    if (covered) return;
    const nl = text.length === 0 || text.endsWith("\n") ? "" : "\n";
    await fs3.appendFile(giPath, `${nl}# wisp-design session logs (auto-added \u2014 prevents dev-server reload loops)
.wisp
`, "utf8");
  } catch {
  }
}

// src/agent/_helpers.ts
import { readFile } from "fs/promises";
import { resolve as resolve3 } from "path";

// src/contracts/bridge.ts
import { z as z5 } from "zod";
var PortLockSchema = z5.object({
  port: z5.number().int().min(31337).max(31400),
  token: z5.string().uuid(),
  pid: z5.number().int().positive(),
  startedAt: z5.string().datetime(),
  projectRoot: z5.string().min(1)
});
var ElementRectSchema = z5.object({
  x: z5.number(),
  y: z5.number(),
  w: z5.number().nonnegative(),
  h: z5.number().nonnegative()
});
var ElementTargetSchema = z5.object({
  selector: z5.string().min(1),
  rect: ElementRectSchema,
  tag: z5.string().min(1)
});
var sessionId = z5.string().min(1);
var AnnotationKindSchema = z5.enum([
  "padding",
  "color",
  "size",
  "content",
  "other"
]);
var StructuredAnnotationSchema = z5.object({
  kind: AnnotationKindSchema,
  note: z5.string().min(1).max(2e3)
});
var VariantSchema = z5.object({
  id: z5.string().min(1),
  css: z5.string(),
  rationale: z5.string().min(1).max(280)
});
var PickEventSchema = z5.object({
  kind: z5.literal("pick"),
  target: ElementTargetSchema,
  sessionId
});
var ConfigureEventSchema = z5.object({
  kind: z5.literal("configure"),
  target: ElementTargetSchema,
  freeText: z5.string().min(1).max(4e3),
  sessionId
});
var GeneratingEventSchema = z5.object({
  kind: z5.literal("generating"),
  target: ElementTargetSchema,
  // Phase 7.17 — may be empty when `codeSnippet` carries the whole intent
  // (snippet-only generate). The UI enforces text-or-snippet; a zod .refine
  // is not possible here (discriminatedUnion requires plain ZodObject).
  freeText: z5.string().max(4e3),
  // Phase 7.17 — pasted design-reference code from the snippet popup. The
  // agent ports it to the project's stack; it never reaches the DOM raw.
  codeSnippet: z5.string().min(1).max(2e4).optional(),
  variantCount: z5.number().int().min(1).max(8),
  // Phase 7.15 — deviation tells the agent how far variants should drift
  // from the original design. 1 = subtle (typography weight, light spacing
  // tweaks), 3 = balanced (mix of axes, the previous default behavior),
  // 5 = radical (reimagined layout/structure/color, may break conventions).
  // Optional so older clients / scripted POSTs keep working at the default.
  deviation: z5.number().int().min(1).max(5).optional(),
  sessionId
});
var CyclingEventSchema = z5.object({
  kind: z5.literal("cycling"),
  target: ElementTargetSchema,
  variants: z5.array(VariantSchema).min(1).max(8),
  activeIndex: z5.number().int().nonnegative(),
  sessionId
});
var ParameterChangeEventSchema = z5.object({
  kind: z5.literal("parameter-change"),
  target: ElementTargetSchema,
  varName: z5.string().min(1),
  value: z5.string(),
  sessionId
});
var AcceptEventSchema = z5.object({
  kind: z5.literal("accept"),
  target: ElementTargetSchema,
  variantId: z5.string().min(1),
  sessionId,
  // Phase 7.8 — Browser includes the accepted variant's CSS so the in-process
  // accept handler can splice it into source without regenerating from a stub.
  // Optional for back-compat: older browsers / tests omit this and the handler
  // falls back to stub regeneration.
  variantCss: z5.string().optional(),
  rationale: z5.string().optional()
});
var DiscardEventSchema = z5.object({
  kind: z5.literal("discard"),
  target: ElementTargetSchema,
  sessionId
});
var AnnotationEventSchema = z5.object({
  kind: z5.literal("annotation"),
  target: ElementTargetSchema,
  annotation: StructuredAnnotationSchema,
  sessionId
});
var ErrorEventSchema = z5.object({
  kind: z5.literal("error"),
  message: z5.string().min(1),
  code: z5.string().optional(),
  sessionId: sessionId.optional()
});
var HeartbeatEventSchema = z5.object({
  kind: z5.literal("heartbeat"),
  at: z5.string().datetime()
});
var BridgeEventSchema = z5.discriminatedUnion("kind", [
  PickEventSchema,
  ConfigureEventSchema,
  GeneratingEventSchema,
  CyclingEventSchema,
  ParameterChangeEventSchema,
  AcceptEventSchema,
  DiscardEventSchema,
  AnnotationEventSchema,
  ErrorEventSchema,
  HeartbeatEventSchema
]);
var LONG_POLL_CAP_MS = 27e4;
var LONG_POLL_MIN_TIMEOUT_MS = 1e3;
var LongPollRequestSchema = z5.object({
  token: z5.string().uuid(),
  timeout: z5.number().int().min(LONG_POLL_MIN_TIMEOUT_MS).optional(),
  leaseMs: z5.number().int().min(1e3).optional(),
  cursor: z5.string().optional()
}).refine(
  (v) => v.timeout === void 0 || v.timeout <= LONG_POLL_CAP_MS,
  {
    message: `timeout must be <= ${LONG_POLL_CAP_MS}ms (Node fetch header cap is 300_000ms)`,
    path: ["timeout"]
  }
);
var LongPollResponseSchema = z5.object({
  events: z5.array(BridgeEventSchema),
  cursor: z5.string(),
  // Server-wall-clock at which it sliced the response. Lets the agent measure
  // drift against its own local clock when budgeting the next slice.
  slicedAt: z5.number().int().nonnegative()
});
var BridgeHttpErrorSchema = z5.object({
  error: z5.object({
    code: z5.string().min(1),
    message: z5.string().min(1),
    detail: z5.unknown().optional()
  })
});
var BridgeStatusSchema = z5.object({
  port: z5.number().int().positive(),
  startedAt: z5.string().datetime(),
  uptimeMs: z5.number().int().nonnegative(),
  sessionId: z5.string().min(1),
  pendingEvents: z5.number().int().nonnegative(),
  connectedSseClients: z5.number().int().nonnegative(),
  projectRoot: z5.string().min(1)
});
var BridgeHealthSchema = z5.object({
  ok: z5.literal(true),
  version: z5.string().min(1)
});

// src/agent/_helpers.ts
function parseFlags(args) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < args.length; i += 1) {
    const token = args[i];
    if (!token.startsWith("--")) {
      positional.push(token);
      continue;
    }
    const key = token.slice(2);
    if (key.startsWith("no-")) {
      flags[key.slice(3)] = false;
      continue;
    }
    const next = args[i + 1];
    if (next === void 0 || next.startsWith("--")) {
      flags[key] = true;
      continue;
    }
    flags[key] = next;
    i += 1;
  }
  return { flags, positional };
}
function flagAsString(parsed, key) {
  const v = parsed.flags[key];
  if (typeof v === "string") return v;
  return void 0;
}
function flagAsBoolean(parsed, key, defaultValue) {
  const v = parsed.flags[key];
  if (typeof v === "boolean") return v;
  return defaultValue;
}
function writeError(err) {
  process.stderr.write(`${JSON.stringify({ error: err })}
`);
}
var EXIT_OK = 0;
var EXIT_IO = 1;
var EXIT_ARG = 2;

// src/agent/init.ts
function mapDistance(answer) {
  const a = answer.toLowerCase().trim();
  if (a.includes("formal") || a.includes("institutional")) return "formal";
  if (a.includes("technical") || a.includes("tech")) return "technical";
  return "casual";
}
function mapCapacity(answer) {
  const a = answer.toLowerCase().trim();
  if (a.includes("focused") || a.includes("urgent") || a.includes("compact")) {
    return "compact";
  }
  if (a.includes("exploratory") || a.includes("generous")) return "generous";
  return "comfortable";
}
function mapFlags(args) {
  const parsed = parseFlags(args);
  const raw = {
    nonInteractive: flagAsBoolean(parsed, "non-interactive", false) || flagAsBoolean(parsed, "nonInteractive", false),
    brandName: flagAsString(parsed, "brand-name") ?? flagAsString(parsed, "brandName"),
    primaryColor: flagAsString(parsed, "primary-color") ?? flagAsString(parsed, "primaryColor"),
    style: flagAsString(parsed, "style")
  };
  for (const k of Object.keys(raw)) {
    if (raw[k] === void 0) delete raw[k];
  }
  const checked = InitCliFlagsSchema.safeParse(raw);
  if (!checked.success) {
    return {
      ok: false,
      message: checked.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")
    };
  }
  return { ok: true, flags: checked.data };
}
async function brandSpecExists(projectRoot) {
  const path = resolve4(projectRoot, ".wisp/brand-spec.json");
  try {
    const s = await stat(path);
    if (s.isFile()) return path;
    return null;
  } catch {
    return null;
  }
}
function buildDefaultSpec(flags, detectedLib) {
  const preset = BRAND_SPEC_DEFAULTS[flags.style];
  void detectedLib;
  const spec = {
    name: flags.brandName ?? "wisp-app",
    voice: { ...preset.voice },
    audience: "Developers building UI in this project.",
    surfaces: ["app"],
    brand: {
      primary: flags.primaryColor ?? preset.style.primary,
      neutral: preset.style.neutral
    },
    typography: { ...preset.style.typography },
    density: preset.style.density,
    motion: preset.style.motion,
    accessibility: { wcag: "AA", reducedMotionDefault: true }
  };
  return spec;
}
async function runInteractiveWizard(seed, detectedLib) {
  const { createInterface } = await import("readline/promises");
  const { stdin: input, stdout: output } = process;
  process.stdout.write(
    `
wisp-design init \u2014 detected: ${detectedLib}
Answer 4 quick questions so variants are grounded, not generic.
Press Enter to keep the [default] shown in brackets.

`
  );
  const rl = createInterface({ input, output });
  try {
    process.stdout.write(
      `Q1 Role \u2014 Who is this for? Answer in one persona, named.
  e.g. "Maya, 26, ML researcher who lives in Jupyter and treats SaaS as friction."
`
    );
    const roleAnswer = await rl.question(`  Role [${seed.audience}]: `);
    const audience = roleAnswer.trim() !== "" ? roleAnswer.trim() : seed.audience;
    process.stdout.write(
      `
Q2 Distance \u2014 How intimate is the relationship?
  intimate = daily-driver tool  |  conversational = weekly consult  |  formal = first-touch page
`
    );
    const distanceAnswer = await rl.question(
      `  Distance (intimate / conversational / formal) [conversational]: `
    );
    const register = mapDistance(
      distanceAnswer.trim() !== "" ? distanceAnswer : "conversational"
    );
    process.stdout.write(
      `
Q3 Temperature \u2014 What is the emotional register?
  warm | cool | neutral \u2014 or extend: excited | calm | authoritative | gentle | sad
`
    );
    const tempAnswer = await rl.question(`  Temperature [${seed.voice.tone}]: `);
    const tone = tempAnswer.trim() !== "" ? tempAnswer.trim() : seed.voice.tone;
    process.stdout.write(
      `
Q4 Capacity \u2014 What is the user's mental state when they land?
  focused = in flow  |  distracted = tab tournament  |  urgent = 30 s max  |  exploratory = browsing
`
    );
    const capacityAnswer = await rl.question(
      `  Capacity (focused / distracted / urgent / exploratory) [distracted]: `
    );
    const density = mapCapacity(
      capacityAnswer.trim() !== "" ? capacityAnswer : "distracted"
    );
    process.stdout.write(`
`);
    const nameAnswer = await rl.question(`  Brand name [${seed.name}]: `);
    const name = nameAnswer.trim() !== "" ? nameAnswer.trim() : seed.name;
    const colorAnswer = await rl.question(
      `  Primary color (oklch(\u2026)) [${seed.brand.primary}]: `
    );
    const primary = colorAnswer.trim() !== "" ? colorAnswer.trim() : seed.brand.primary;
    return {
      ...seed,
      name,
      audience,
      voice: { ...seed.voice, tone, register },
      density,
      brand: { ...seed.brand, primary }
    };
  } finally {
    rl.close();
  }
}
async function writeBrandSpec(projectRoot, spec) {
  const validated = BrandSpecSchema.parse(spec);
  const path = resolve4(projectRoot, ".wisp/brand-spec.json");
  await mkdir(dirname3(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(validated, null, 2)}
`, { encoding: "utf8" });
  return path;
}
async function writePolicySkeleton(projectRoot) {
  const path = resolve4(projectRoot, ".wisp/policy.md");
  const body = `---
axes: {}
---

# wisp-design policy

Decisions accumulated during live-mode sessions; edit to lock a preference.
Axis values are appended by \`wisp-design policy --apply\` after
the agent observes 3 consecutive decisions on the same axis.
`;
  await mkdir(dirname3(path), { recursive: true });
  await writeFile(path, body, { encoding: "utf8" });
  return path;
}
async function ensureSessionsDir(projectRoot) {
  const path = resolve4(projectRoot, ".wisp/sessions");
  await mkdir(path, { recursive: true });
  await ensureWispGitignored(projectRoot);
  return path;
}
async function runInit(args) {
  const parsed = mapFlags(args);
  if (!parsed.ok) {
    writeError({ code: "BAD_FLAG", message: parsed.message });
    return EXIT_ARG;
  }
  const flags = parsed.flags;
  const cwd = process.cwd();
  const existingPath = await brandSpecExists(cwd);
  if (existingPath !== null) {
    process.stdout.write(
      `wisp-design init: already initialized at ${existingPath}
`
    );
    return EXIT_OK;
  }
  let detectedLib = "vanilla";
  try {
    const result = await detect({ projectRoot: cwd, quick: true });
    detectedLib = result.primaryLib;
  } catch {
  }
  const seed = buildDefaultSpec(flags, detectedLib);
  let finalSpec;
  if (flags.nonInteractive || !process.stdin.isTTY) {
    finalSpec = seed;
  } else {
    try {
      finalSpec = await runInteractiveWizard(seed, detectedLib);
    } catch (err) {
      writeError({
        code: "WIZARD_ABORTED",
        message: err.message
      });
      return EXIT_ARG;
    }
  }
  let specPath;
  let policyPath;
  let sessionsPath;
  try {
    specPath = await writeBrandSpec(cwd, finalSpec);
    policyPath = await writePolicySkeleton(cwd);
    sessionsPath = await ensureSessionsDir(cwd);
  } catch (err) {
    writeError({
      code: "WRITE_FAILED",
      message: err.message
    });
    return EXIT_IO;
  }
  process.stdout.write(
    [
      `wisp-design init: OK`,
      `  brand-spec: ${specPath}`,
      `  policy:     ${policyPath}`,
      `  sessions:   ${sessionsPath}`,
      `  detected:   ${detectedLib}`,
      ``,
      `Next: run \`wisp-design live --target http://localhost:3000\` to start the live loop.`,
      ``
    ].join("\n")
  );
  return EXIT_OK;
}
export {
  runInit
};
//# sourceMappingURL=init.js.map