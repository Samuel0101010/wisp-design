#!/usr/bin/env node

// src/agent/init.ts
import { mkdir, stat, writeFile } from "fs/promises";
import { dirname, resolve as resolve3 } from "path";

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
    for (const fs2 of fileSignals) {
      if (signals.length < MAX_VISIBLE_SIGNALS) signals.push(fs2);
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

// src/agent/_helpers.ts
import { readFile } from "fs/promises";
import { resolve as resolve2 } from "path";

// src/contracts/bridge.ts
import { z as z3 } from "zod";
var PortLockSchema = z3.object({
  port: z3.number().int().min(31337).max(31400),
  token: z3.string().uuid(),
  pid: z3.number().int().positive(),
  startedAt: z3.string().datetime(),
  projectRoot: z3.string().min(1)
});
var ElementRectSchema = z3.object({
  x: z3.number(),
  y: z3.number(),
  w: z3.number().nonnegative(),
  h: z3.number().nonnegative()
});
var ElementTargetSchema = z3.object({
  selector: z3.string().min(1),
  rect: ElementRectSchema,
  tag: z3.string().min(1)
});
var sessionId = z3.string().min(1);
var AnnotationKindSchema = z3.enum([
  "padding",
  "color",
  "size",
  "content",
  "other"
]);
var StructuredAnnotationSchema = z3.object({
  kind: AnnotationKindSchema,
  note: z3.string().min(1).max(2e3)
});
var VariantSchema = z3.object({
  id: z3.string().min(1),
  css: z3.string(),
  rationale: z3.string().min(1).max(280)
});
var PickEventSchema = z3.object({
  kind: z3.literal("pick"),
  target: ElementTargetSchema,
  sessionId
});
var ConfigureEventSchema = z3.object({
  kind: z3.literal("configure"),
  target: ElementTargetSchema,
  freeText: z3.string().min(1).max(4e3),
  sessionId
});
var GeneratingEventSchema = z3.object({
  kind: z3.literal("generating"),
  target: ElementTargetSchema,
  freeText: z3.string().min(1).max(4e3),
  variantCount: z3.number().int().min(1).max(8),
  sessionId
});
var CyclingEventSchema = z3.object({
  kind: z3.literal("cycling"),
  target: ElementTargetSchema,
  variants: z3.array(VariantSchema).min(1).max(8),
  activeIndex: z3.number().int().nonnegative(),
  sessionId
});
var ParameterChangeEventSchema = z3.object({
  kind: z3.literal("parameter-change"),
  target: ElementTargetSchema,
  varName: z3.string().min(1),
  value: z3.string(),
  sessionId
});
var AcceptEventSchema = z3.object({
  kind: z3.literal("accept"),
  target: ElementTargetSchema,
  variantId: z3.string().min(1),
  sessionId,
  // Phase 7.8 — Browser includes the accepted variant's CSS so the in-process
  // accept handler can splice it into source without regenerating from a stub.
  // Optional for back-compat: older browsers / tests omit this and the handler
  // falls back to stub regeneration.
  variantCss: z3.string().optional(),
  rationale: z3.string().optional()
});
var DiscardEventSchema = z3.object({
  kind: z3.literal("discard"),
  target: ElementTargetSchema,
  sessionId
});
var AnnotationEventSchema = z3.object({
  kind: z3.literal("annotation"),
  target: ElementTargetSchema,
  annotation: StructuredAnnotationSchema,
  sessionId
});
var ErrorEventSchema = z3.object({
  kind: z3.literal("error"),
  message: z3.string().min(1),
  code: z3.string().optional(),
  sessionId: sessionId.optional()
});
var HeartbeatEventSchema = z3.object({
  kind: z3.literal("heartbeat"),
  at: z3.string().datetime()
});
var BridgeEventSchema = z3.discriminatedUnion("kind", [
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
var LongPollRequestSchema = z3.object({
  token: z3.string().uuid(),
  timeout: z3.number().int().min(LONG_POLL_MIN_TIMEOUT_MS).optional(),
  leaseMs: z3.number().int().min(1e3).optional(),
  cursor: z3.string().optional()
}).refine(
  (v) => v.timeout === void 0 || v.timeout <= LONG_POLL_CAP_MS,
  {
    message: `timeout must be <= ${LONG_POLL_CAP_MS}ms (Node fetch header cap is 300_000ms)`,
    path: ["timeout"]
  }
);
var LongPollResponseSchema = z3.object({
  events: z3.array(BridgeEventSchema),
  cursor: z3.string(),
  // Server-wall-clock at which it sliced the response. Lets the agent measure
  // drift against its own local clock when budgeting the next slice.
  slicedAt: z3.number().int().nonnegative()
});
var BridgeHttpErrorSchema = z3.object({
  error: z3.object({
    code: z3.string().min(1),
    message: z3.string().min(1),
    detail: z3.unknown().optional()
  })
});
var BridgeStatusSchema = z3.object({
  port: z3.number().int().positive(),
  startedAt: z3.string().datetime(),
  uptimeMs: z3.number().int().nonnegative(),
  sessionId: z3.string().min(1),
  pendingEvents: z3.number().int().nonnegative(),
  connectedSseClients: z3.number().int().nonnegative(),
  projectRoot: z3.string().min(1)
});
var BridgeHealthSchema = z3.object({
  ok: z3.literal(true),
  version: z3.string().min(1)
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
  const path = resolve3(projectRoot, ".wisp/brand-spec.json");
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
  const path = resolve3(projectRoot, ".wisp/brand-spec.json");
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(validated, null, 2)}
`, { encoding: "utf8" });
  return path;
}
async function writePolicySkeleton(projectRoot) {
  const path = resolve3(projectRoot, ".wisp/policy.md");
  const body = `---
axes: {}
---

# wisp-design policy

Decisions accumulated during live-mode sessions; edit to lock a preference.
Axis values are appended by \`wisp-design policy --apply\` after
the agent observes 3 consecutive decisions on the same axis.
`;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, body, { encoding: "utf8" });
  return path;
}
async function ensureSessionsDir(projectRoot) {
  const path = resolve3(projectRoot, ".wisp/sessions");
  await mkdir(path, { recursive: true });
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