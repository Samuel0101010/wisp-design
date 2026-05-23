#!/usr/bin/env node

// src/agent/component-detect.ts
import { promises as fs } from "fs";
import { extname, join, resolve, sep } from "path";

// src/contracts/component.ts
import { z } from "zod";
var ComponentLibSchema = z.enum([
  "shadcn",
  "radix",
  "mui",
  "chakra",
  "ant",
  "tailwind",
  "vanilla"
]);
var EditStrategySchema = z.enum([
  "prop-edit",
  "class-edit",
  "css-override",
  "structural-edit"
]);
var DetectionSourceSchema = z.enum([
  "package.json",
  // dep / devDep key match
  "import-scan",
  // matched RegExp against source content
  "filename-pattern",
  // matched RegExp against file path
  "className-pattern"
  // matched RegExp against className= attribute
]);
var DetectionSignalSchema = z.object({
  source: DetectionSourceSchema,
  detail: z.string().min(1),
  weight: z.number().min(0).max(1)
});
var ComponentDetectionResultSchema = z.object({
  primaryLib: ComponentLibSchema,
  signals: z.array(DetectionSignalSchema),
  confidence: z.number().min(0).max(1),
  detectedVersion: z.string().optional(),
  preferredStrategy: EditStrategySchema,
  fallbackStrategies: z.array(EditStrategySchema),
  detectedAt: z.string()
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
var COMPONENT_DETECT_CONFIDENCE_THRESHOLD = 0.6;
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
      const stat = await fs.stat(root);
      if (stat.isDirectory()) seenRoots.add(root);
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
    const stat = await fs.stat(filePath);
    if (stat.size > COMPONENT_DETECT_MAX_READ_BYTES) return null;
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
    let total = sourceSum;
    let denom = sourceCount;
    if (pkgScore > 0) {
      total += pkgScore;
      denom += 1;
    }
    if (denom === 0) {
      finalConfidence.set(lib, 0);
      continue;
    }
    finalConfidence.set(lib, clamp01(total / denom));
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
var componentDetectModule = {
  detect,
  scorePackageJson,
  scoreImports
};
export {
  componentDetectModule,
  detect,
  scoreImports,
  scorePackageJson
};
//# sourceMappingURL=component-detect.js.map