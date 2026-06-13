#!/usr/bin/env node

// src/agent/sync.ts
import { createHash } from "crypto";
import { promises as fs2 } from "fs";
import { dirname, join as join2, relative as relative2, resolve as resolve3, sep as sep2 } from "path";

// src/contracts/agent.ts
import { z } from "zod";
var POLL_LOOP_DEFAULT_TIMEOUT_MS = 27e4;
var POLL_LOOP_DEFAULT_LEASE_MS = 3e4;
var POLL_LOOP_MIN_TIMEOUT_MS = 1e3;
var DEFAULT_SKILLS_NAMESPACE = "wisp-design";
var VARIANT_AXES = [
  "hierarchy",
  // size/weight relationships, primary action prominence
  "layout",
  // arrangement, density grid, spacing, alignment
  "typography",
  // family pairing, scale, leading
  "color",
  // accent role, semantic colour, surface treatment
  "density"
  // padding/margin scale, breathing room, information density
];
var VariantAxisSchema = z.enum(VARIANT_AXES);
var PollTransportSchema = z.enum(["sse", "long-poll"]);
var PollOnceOptionsSchema = z.object({
  bridgeUrl: z.string().url(),
  token: z.string().uuid(),
  timeoutMs: z.number().int().min(POLL_LOOP_MIN_TIMEOUT_MS).max(POLL_LOOP_DEFAULT_TIMEOUT_MS).default(POLL_LOOP_DEFAULT_TIMEOUT_MS),
  leaseMs: z.number().int().min(1e3).default(POLL_LOOP_DEFAULT_LEASE_MS),
  cursor: z.string().optional(),
  transport: PollTransportSchema.default("long-poll")
});
var VoiceDistanceSchema = z.enum([
  "intimate",
  "conversational",
  "formal"
]);
var VoiceTemperatureSchema = z.enum(["warm", "cool", "neutral"]);
var VisualDirectionSchema = z.enum([
  "editorial",
  "modern-minimal",
  "tech-utility",
  "brutalist",
  "soft-warm"
]);
var ALLOWED_VARIANT_ANCHORS = [
  "linear",
  "stripe",
  "anthropic",
  "aceternity",
  "apple",
  "vercel",
  "raycast",
  "notion",
  "github",
  "tailwind-ui",
  "shadcn-default",
  "shadcn-soft",
  "shadcn-bold"
];
var VariantAnchorSchema = z.enum(ALLOWED_VARIANT_ANCHORS);
var PaletteModeSchema = z.enum(["oklch", "hsl", "hex"]);
var BrandSpecSchema = z.object({
  name: z.string().min(1),
  oneLiner: z.string().min(1).max(280),
  audience: z.array(z.string().min(1)).default([]),
  voice: z.object({
    tone: z.string().min(1),
    distance: VoiceDistanceSchema,
    temperature: VoiceTemperatureSchema
  }).optional(),
  visualDirection: VisualDirectionSchema.optional(),
  variantAnchor: VariantAnchorSchema.optional(),
  palette: z.object({
    mode: PaletteModeSchema,
    // Keys are role tokens (`bg`, `fg`, `accent`, `muted`, …); values are
    // literal strings in the declared `mode`. The variant prompt prefers
    // these over sampled colors when both are present.
    values: z.record(z.string().min(1), z.string().min(1))
  }).optional(),
  typeScale: z.object({
    baseSize: z.number().positive(),
    step: z.number().positive().default(1.333)
  }).optional(),
  motion: z.object({
    // Common keys: `--ease-smooth`, `--ease-sharp`, `--ease-spring`, `--ease-power`.
    // Free-form so brand-asset-extract can store proprietary easings.
    tokens: z.record(z.string().min(1), z.string().min(1))
  }).optional(),
  brandAssets: z.object({
    logo: z.string().min(1).optional(),
    wordmark: z.string().min(1).optional()
  }).optional()
});
var DesignTokensSchema = z.object({
  extractedAt: z.string(),
  spacing: z.array(z.number().nonnegative()).default([]),
  radii: z.array(z.number().nonnegative()).default([]),
  fontSizes: z.array(z.number().positive()).default([]),
  fontWeights: z.array(z.number().int().positive()).default([]),
  colors: z.array(z.string().min(1)).default([]),
  fontFamilies: z.array(z.string().min(1)).default([]),
  zIndex: z.array(z.number().int()).default([])
});
var ComponentLibSchema = z.enum([
  "shadcn",
  "radix",
  "mui",
  "tailwind",
  "vanilla"
]);
var SkillsIndexOptionsSchema = z.object({
  skillsRoot: z.string().min(1),
  namespace: z.string().min(1).default(DEFAULT_SKILLS_NAMESPACE)
});
var SkillsIndexResultSchema = z.object({
  indexedFiles: z.number().int().nonnegative(),
  // Counts per sub-namespace (`anchors`, `directions`, `corpus`, `patterns`,
  // `policy`, `methodology`, `reference`). Lets `doctor` warn when a slice
  // is missing.
  byNamespace: z.record(z.string(), z.number().int().nonnegative()),
  durationMs: z.number().nonnegative(),
  // The AgentDB controller key the corpus was indexed under. Searches MUST
  // pass the same key to retrieve consistent results.
  agentDbController: z.string().min(1)
});
var SkillsSearchOptionsSchema = z.object({
  topK: z.number().int().min(1).max(50).default(8),
  namespace: z.string().min(1).default(DEFAULT_SKILLS_NAMESPACE)
});
var SkillsSearchResultSchema = z.object({
  filePath: z.string().min(1),
  score: z.number(),
  snippet: z.string(),
  namespace: z.string().min(1)
});
var SyncSourceSchema = z.object({
  fromPath: z.string().min(1),
  patterns: z.array(z.string().min(1)).default(["**/*.md"]),
  // Destination is fixed; the schema literal lets the doctor check that
  // `wisp-design sync` is correctly wired without re-reading config.
  destination: z.literal("skills/data/patterns/"),
  attribution: z.object({
    owner: z.string().min(1),
    license: z.string().min(1)
  }).optional()
});

// src/agent/_helpers.ts
import { readFile } from "fs/promises";
import { resolve } from "path";

// src/contracts/bridge.ts
import { z as z2 } from "zod";
var PortLockSchema = z2.object({
  port: z2.number().int().min(31337).max(31400),
  token: z2.string().uuid(),
  pid: z2.number().int().positive(),
  startedAt: z2.string().datetime(),
  projectRoot: z2.string().min(1)
});
var ElementRectSchema = z2.object({
  x: z2.number(),
  y: z2.number(),
  w: z2.number().nonnegative(),
  h: z2.number().nonnegative()
});
var ElementTargetSchema = z2.object({
  selector: z2.string().min(1),
  rect: ElementRectSchema,
  tag: z2.string().min(1)
});
var sessionId = z2.string().min(1);
var AnnotationKindSchema = z2.enum([
  "padding",
  "color",
  "size",
  "content",
  "other"
]);
var StructuredAnnotationSchema = z2.object({
  kind: AnnotationKindSchema,
  note: z2.string().min(1).max(2e3)
});
var VariantSchema = z2.object({
  id: z2.string().min(1),
  css: z2.string(),
  rationale: z2.string().min(1).max(280)
});
var PickEventSchema = z2.object({
  kind: z2.literal("pick"),
  target: ElementTargetSchema,
  sessionId
});
var ConfigureEventSchema = z2.object({
  kind: z2.literal("configure"),
  target: ElementTargetSchema,
  freeText: z2.string().min(1).max(4e3),
  sessionId
});
var GeneratingEventSchema = z2.object({
  kind: z2.literal("generating"),
  target: ElementTargetSchema,
  // Phase 7.17 — may be empty when `codeSnippet` carries the whole intent
  // (snippet-only generate). The UI enforces text-or-snippet; a zod .refine
  // is not possible here (discriminatedUnion requires plain ZodObject).
  freeText: z2.string().max(4e3),
  // Phase 7.17 — pasted design-reference code from the snippet popup. The
  // agent ports it to the project's stack; it never reaches the DOM raw.
  codeSnippet: z2.string().min(1).max(2e4).optional(),
  variantCount: z2.number().int().min(1).max(8),
  // Phase 7.15 — deviation tells the agent how far variants should drift
  // from the original design. 1 = subtle (typography weight, light spacing
  // tweaks), 3 = balanced (mix of axes, the previous default behavior),
  // 5 = radical (reimagined layout/structure/color, may break conventions).
  // Optional so older clients / scripted POSTs keep working at the default.
  deviation: z2.number().int().min(1).max(5).optional(),
  sessionId
});
var CyclingEventSchema = z2.object({
  kind: z2.literal("cycling"),
  target: ElementTargetSchema,
  variants: z2.array(VariantSchema).min(1).max(8),
  activeIndex: z2.number().int().nonnegative(),
  sessionId
});
var ParameterChangeEventSchema = z2.object({
  kind: z2.literal("parameter-change"),
  target: ElementTargetSchema,
  varName: z2.string().min(1),
  value: z2.string(),
  sessionId
});
var AcceptEventSchema = z2.object({
  kind: z2.literal("accept"),
  target: ElementTargetSchema,
  variantId: z2.string().min(1),
  sessionId,
  // Phase 7.8 — Browser includes the accepted variant's CSS so the in-process
  // accept handler can splice it into source without regenerating from a stub.
  // Optional for back-compat: older browsers / tests omit this and the handler
  // falls back to stub regeneration.
  variantCss: z2.string().optional(),
  rationale: z2.string().optional()
});
var DiscardEventSchema = z2.object({
  kind: z2.literal("discard"),
  target: ElementTargetSchema,
  sessionId
});
var AnnotationEventSchema = z2.object({
  kind: z2.literal("annotation"),
  target: ElementTargetSchema,
  annotation: StructuredAnnotationSchema,
  sessionId
});
var ErrorEventSchema = z2.object({
  kind: z2.literal("error"),
  message: z2.string().min(1),
  code: z2.string().optional(),
  sessionId: sessionId.optional()
});
var HeartbeatEventSchema = z2.object({
  kind: z2.literal("heartbeat"),
  at: z2.string().datetime()
});
var BridgeEventSchema = z2.discriminatedUnion("kind", [
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
var LongPollRequestSchema = z2.object({
  token: z2.string().uuid(),
  timeout: z2.number().int().min(LONG_POLL_MIN_TIMEOUT_MS).optional(),
  leaseMs: z2.number().int().min(1e3).optional(),
  cursor: z2.string().optional()
}).refine(
  (v) => v.timeout === void 0 || v.timeout <= LONG_POLL_CAP_MS,
  {
    message: `timeout must be <= ${LONG_POLL_CAP_MS}ms (Node fetch header cap is 300_000ms)`,
    path: ["timeout"]
  }
);
var LongPollResponseSchema = z2.object({
  events: z2.array(BridgeEventSchema),
  cursor: z2.string(),
  // Server-wall-clock at which it sliced the response. Lets the agent measure
  // drift against its own local clock when budgeting the next slice.
  slicedAt: z2.number().int().nonnegative()
});
var BridgeHttpErrorSchema = z2.object({
  error: z2.object({
    code: z2.string().min(1),
    message: z2.string().min(1),
    detail: z2.unknown().optional()
  })
});
var BridgeStatusSchema = z2.object({
  port: z2.number().int().positive(),
  startedAt: z2.string().datetime(),
  uptimeMs: z2.number().int().nonnegative(),
  sessionId: z2.string().min(1),
  pendingEvents: z2.number().int().nonnegative(),
  connectedSseClients: z2.number().int().nonnegative(),
  projectRoot: z2.string().min(1)
});
var BridgeHealthSchema = z2.object({
  ok: z2.literal(true),
  version: z2.string().min(1)
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
function writeJsonResult(obj) {
  process.stdout.write(`${JSON.stringify(obj, null, 2)}
`);
}
function writeError(err) {
  process.stderr.write(`${JSON.stringify({ error: err })}
`);
}
var EXIT_OK = 0;
var EXIT_IO = 1;
var EXIT_ARG = 2;

// src/agent/skills-index.ts
import { promises as fs } from "fs";
import { join, relative, resolve as resolve2, sep } from "path";
var AGENT_DB_CONTROLLER_STUB = "phase-4-stub";
var INDEXABLE_EXTENSIONS = /* @__PURE__ */ new Set([".md", ".csv"]);
var KNOWN_SUB_NAMESPACES = [
  "anchors",
  "directions",
  "corpus",
  "patterns",
  "policy",
  "methodology",
  "reference"
];
async function walkDir(root) {
  const out = [];
  let entries;
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch (err) {
    const code = err.code;
    if (code === "ENOENT" || code === "ENOTDIR") return out;
    throw err;
  }
  for (const entry of entries) {
    const full = join(root, entry.name);
    if (entry.isDirectory()) {
      if (entry.name.startsWith(".")) continue;
      const nested = await walkDir(full);
      out.push(...nested);
      continue;
    }
    if (entry.isFile()) {
      out.push(full);
    }
  }
  return out;
}
function deriveSubNamespace(skillsRoot, absPath) {
  const rel = relative(skillsRoot, absPath).split(sep);
  if (rel.length >= 2 && rel[0] === "data") {
    return rel[1];
  }
  if (rel.length >= 1) {
    return rel[0];
  }
  return "uncategorized";
}
async function indexSkills(opts) {
  const parsed = SkillsIndexOptionsSchema.parse(opts);
  const start = Date.now();
  const skillsRoot = resolve2(parsed.skillsRoot);
  const allFiles = await walkDir(skillsRoot);
  const indexable = allFiles.filter((p) => {
    for (const ext of INDEXABLE_EXTENSIONS) {
      if (p.toLowerCase().endsWith(ext)) return true;
    }
    return false;
  });
  const byNamespace = {};
  for (const ns of KNOWN_SUB_NAMESPACES) byNamespace[ns] = 0;
  for (const file of indexable) {
    const sub = deriveSubNamespace(skillsRoot, file);
    byNamespace[sub] = (byNamespace[sub] ?? 0) + 1;
  }
  void parsed.namespace;
  return {
    indexedFiles: indexable.length,
    byNamespace,
    durationMs: Date.now() - start,
    agentDbController: AGENT_DB_CONTROLLER_STUB
  };
}

// src/agent/sync.ts
var PATTERNS_DESTINATION = "skills/data/patterns";
function globToRegExp(pattern) {
  const normalised = pattern.replace(/\\/g, "/");
  let re = "^";
  for (let i = 0; i < normalised.length; i += 1) {
    const ch = normalised[i];
    if (ch === "*") {
      if (normalised[i + 1] === "*") {
        re += ".*";
        i += 1;
        if (normalised[i + 1] === "/") {
          i += 1;
        }
      } else {
        re += "[^/]*";
      }
      continue;
    }
    if (ch === "?") {
      re += "[^/]";
      continue;
    }
    if (/[.+^${}()|[\]\\]/.test(ch)) {
      re += `\\${ch}`;
    } else {
      re += ch;
    }
  }
  re += "$";
  return new RegExp(re);
}
function matchesAnyPattern(relPath, patterns) {
  const portable = relPath.split(sep2).join("/");
  for (const p of patterns) {
    if (globToRegExp(p).test(portable)) return true;
  }
  return false;
}
async function walkSource(root) {
  const out = [];
  await walkInto(root, root, out);
  return out;
}
async function walkInto(root, dir, out) {
  let entries;
  try {
    entries = await fs2.readdir(dir, { withFileTypes: true });
  } catch (err) {
    const code = err.code;
    if (code === "ENOENT" || code === "ENOTDIR") return;
    throw err;
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const abs = join2(dir, entry.name);
    if (entry.isDirectory()) {
      await walkInto(root, abs, out);
      continue;
    }
    if (entry.isFile()) {
      out.push({ abs, rel: relative2(root, abs) });
    }
  }
}
function sha256Hex(buf) {
  const h = createHash("sha256");
  h.update(typeof buf === "string" ? Buffer.from(buf, "utf8") : buf);
  return h.digest("hex");
}
function hasFrontmatter(content) {
  return content.startsWith("---\n") || content.startsWith("---\r\n");
}
function buildAttributionFrontmatter(owner, license) {
  const escape = (s) => s.replace(/"/g, '\\"');
  return [
    "---",
    "attribution:",
    `  owner: "${escape(owner)}"`,
    `  license: "${escape(license)}"`,
    "---",
    ""
  ].join("\n");
}
async function syncFromVault(source, opts) {
  const parsed = SyncSourceSchema.parse(source);
  const projectRoot = resolve3(opts.projectRoot);
  const sourceAbs = resolve3(parsed.fromPath);
  let stat;
  try {
    stat = await fs2.stat(sourceAbs);
  } catch (err) {
    const code = err.code;
    if (code === "ENOENT" || code === "ENOTDIR") {
      throw new Error(`sync: source path does not exist: ${sourceAbs}`);
    }
    throw err;
  }
  if (!stat.isDirectory()) {
    throw new Error(`sync: source path is not a directory: ${sourceAbs}`);
  }
  const destRoot = join2(projectRoot, PATTERNS_DESTINATION);
  await fs2.mkdir(destRoot, { recursive: true });
  const walked = await walkSource(sourceAbs);
  const matched = walked.filter((w) => matchesAnyPattern(w.rel, parsed.patterns));
  const copiedFiles = [];
  let skippedCount = 0;
  for (const file of matched) {
    const destAbs = join2(destRoot, file.rel);
    await fs2.mkdir(dirname(destAbs), { recursive: true });
    const srcBytes = await fs2.readFile(file.abs);
    let outBytes = srcBytes;
    if (parsed.attribution !== void 0 && file.abs.toLowerCase().endsWith(".md")) {
      const text = srcBytes.toString("utf8");
      if (!hasFrontmatter(text)) {
        const fm = buildAttributionFrontmatter(
          parsed.attribution.owner,
          parsed.attribution.license
        );
        outBytes = Buffer.from(fm + text, "utf8");
      }
    }
    try {
      const existing = await fs2.readFile(destAbs);
      if (sha256Hex(existing) === sha256Hex(outBytes)) {
        skippedCount += 1;
        continue;
      }
    } catch (err) {
      const code = err.code;
      if (code !== "ENOENT" && code !== "ENOTDIR") throw err;
    }
    await fs2.writeFile(destAbs, outBytes);
    copiedFiles.push(destAbs);
  }
  let indexedInAgentDb = false;
  if (opts.index !== false) {
    const skillsRoot = join2(projectRoot, "skills");
    try {
      await indexSkills({ skillsRoot, namespace: "wisp-design" });
      indexedInAgentDb = false;
    } catch (err) {
      void err;
    }
  }
  return {
    copiedCount: copiedFiles.length,
    skippedCount,
    files: copiedFiles,
    indexedInAgentDb
  };
}
async function runSync(args) {
  const parsed = parseFlags(args);
  const from = flagAsString(parsed, "from");
  if (from === void 0 || from === "") {
    writeError({
      code: "BAD_FLAG",
      message: "sync: --from <vault-path> is required"
    });
    return EXIT_ARG;
  }
  const noIndexFlag = parsed.flags["no-index"];
  const shouldIndex = !(noIndexFlag === true || noIndexFlag === "true");
  const attributionOwner = flagAsString(parsed, "attribution-owner");
  const attributionLicense = flagAsString(parsed, "attribution-license");
  let attribution;
  if (attributionOwner !== void 0 || attributionLicense !== void 0) {
    if (attributionOwner === void 0 || attributionLicense === void 0) {
      writeError({
        code: "BAD_FLAG",
        message: "sync: --attribution-owner and --attribution-license must be provided together"
      });
      return EXIT_ARG;
    }
    attribution = { owner: attributionOwner, license: attributionLicense };
  }
  const source = {
    fromPath: from,
    patterns: ["**/*.md"],
    destination: "skills/data/patterns/",
    ...attribution !== void 0 ? { attribution } : {}
  };
  try {
    const result = await syncFromVault(source, {
      projectRoot: process.cwd(),
      index: shouldIndex
    });
    writeJsonResult(result);
    return EXIT_OK;
  } catch (err) {
    writeError({
      code: "SYNC_FAILED",
      message: err.message
    });
    return EXIT_IO;
  }
}
export {
  runSync,
  syncFromVault
};
//# sourceMappingURL=sync.js.map