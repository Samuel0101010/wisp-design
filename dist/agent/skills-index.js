#!/usr/bin/env node

// src/agent/skills-index.ts
import { promises as fs } from "fs";
import { join, relative, resolve as resolve2, sep } from "path";

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
function flagAsNumber(parsed, key) {
  const v = parsed.flags[key];
  if (typeof v !== "string") return void 0;
  const n = Number(v);
  if (!Number.isFinite(n)) return void 0;
  return n;
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
var AGENT_DB_CONTROLLER_STUB = "phase-4-stub";
var INDEXABLE_EXTENSIONS = /* @__PURE__ */ new Set([".md", ".csv"]);
var STOPWORDS = /* @__PURE__ */ new Set([
  // English
  "the",
  "and",
  "for",
  "with",
  "from",
  "into",
  "this",
  "that",
  "these",
  "those",
  "are",
  "was",
  "were",
  "but",
  "not",
  "you",
  "your",
  "our",
  "their",
  "what",
  "when",
  "where",
  "which",
  "who",
  "whom",
  "how",
  "why",
  "can",
  "will",
  "would",
  "could",
  "should",
  "have",
  "has",
  "had",
  "all",
  "any",
  "some",
  "more",
  "most",
  "much",
  "than",
  "then",
  "them",
  "they",
  // German
  "der",
  "die",
  "das",
  "den",
  "dem",
  "des",
  "ein",
  "eine",
  "einer",
  "eines",
  "einem",
  "und",
  "oder",
  "aber",
  "doch",
  "auch",
  "noch",
  "nur",
  "wie",
  "was",
  "wo",
  "wer",
  "wen",
  "wem",
  "wessen",
  "ist",
  "sind",
  "war",
  "waren",
  "mit",
  "von",
  "vom",
  "zur",
  "zum",
  "im",
  "am",
  "an",
  "auf",
  "aus",
  "bei",
  "nach",
  "vor",
  "ueber",
  "unter",
  "fuer",
  "gegen"
]);
var STEM_LEN = 6;
var FIELD_BOOST_DESCRIPTION = 2;
var FIELD_BOOST_TITLE = 2;
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
function toPortableRelative(root, absPath) {
  const rel = relative(root, absPath);
  return rel.split(sep).join("/");
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
function tokenize(input) {
  const lower = input.toLowerCase();
  const raw = lower.split(/[^a-z0-9\-]+/);
  const out = [];
  for (const t of raw) {
    if (t.length < 2) continue;
    if (STOPWORDS.has(t)) continue;
    out.push(t.length > STEM_LEN ? t.slice(0, STEM_LEN) : t);
  }
  return out;
}
function extractDescription(body) {
  if (!body.startsWith("---")) return "";
  const end = body.indexOf("\n---", 3);
  if (end === -1) return "";
  const fm = body.slice(0, end);
  const m = fm.match(/^description:\s*(.+)$/im);
  return m?.[1]?.trim() ?? "";
}
function extractTitle(filePath, body) {
  let stripped = body;
  if (body.startsWith("---")) {
    const end = body.indexOf("\n---", 3);
    if (end !== -1) stripped = body.slice(end + 4);
  }
  const h1 = stripped.match(/^\s*#\s+(.+)$/m);
  if (h1 && h1[1] !== void 0) return h1[1].trim();
  if (filePath.endsWith(".csv")) {
    const firstLine = body.split(/\r?\n/, 1)[0] ?? "";
    if (firstLine.trim() !== "") return firstLine.trim();
  }
  const base = filePath.split("/").pop() ?? filePath;
  return base.replace(/\.(md|csv)$/i, "");
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
async function searchSkills(query, opts) {
  const parsed = SkillsSearchOptionsSchema.parse({
    topK: opts?.topK,
    namespace: opts?.namespace
  });
  const skillsRoot = resolve2(opts?.skillsRoot ?? "skills");
  const trimmedQuery = query.trim();
  if (trimmedQuery === "") return [];
  const tokens = tokenize(trimmedQuery);
  if (tokens.length === 0) return [];
  const allFiles = await walkDir(skillsRoot);
  const indexable = allFiles.filter((p) => {
    for (const ext of INDEXABLE_EXTENSIONS) {
      if (p.toLowerCase().endsWith(ext)) return true;
    }
    return false;
  });
  const scored = [];
  for (const file of indexable) {
    let body;
    try {
      body = await fs.readFile(file, "utf8");
    } catch {
      continue;
    }
    const sub = deriveSubNamespace(skillsRoot, file);
    void parsed.namespace;
    const lower = body.toLowerCase();
    const descLower = extractDescription(body).toLowerCase();
    const titleLower = extractTitle(file, body).toLowerCase();
    let score = 0;
    for (const tok of tokens) {
      if (tok === "") continue;
      let idx = 0;
      let bodyHits = 0;
      while (idx < lower.length) {
        const found = lower.indexOf(tok, idx);
        if (found === -1) break;
        bodyHits += 1;
        idx = found + tok.length;
        if (bodyHits > 100) break;
      }
      const descHits = descLower === "" ? 0 : countOccurrences(descLower, tok);
      const titleHits = titleLower === "" ? 0 : countOccurrences(titleLower, tok);
      score += bodyHits + descHits * FIELD_BOOST_DESCRIPTION + titleHits * FIELD_BOOST_TITLE;
    }
    if (score === 0) continue;
    const normalized = score / Math.sqrt(Math.max(body.length, 1));
    const snippet = buildSnippet(body, tokens);
    const filePath = toPortableRelative(process.cwd(), file);
    scored.push({
      filePath,
      score: normalized,
      snippet,
      namespace: sub
    });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, parsed.topK);
}
function countOccurrences(haystack, needle) {
  if (needle === "") return 0;
  let idx = 0;
  let n = 0;
  while (idx < haystack.length) {
    const found = haystack.indexOf(needle, idx);
    if (found === -1) break;
    n += 1;
    idx = found + needle.length;
  }
  return n;
}
function buildSnippet(body, tokens) {
  const lower = body.toLowerCase();
  let bestIdx = -1;
  for (const tok of tokens) {
    const idx = lower.indexOf(tok);
    if (idx !== -1 && (bestIdx === -1 || idx < bestIdx)) {
      bestIdx = idx;
    }
  }
  const startIdx = bestIdx === -1 ? 0 : Math.max(0, bestIdx - 80);
  const endIdx = Math.min(body.length, startIdx + 240);
  let snippet = body.slice(startIdx, endIdx).replace(/\s+/g, " ").trim();
  if (startIdx > 0) snippet = `\u2026${snippet}`;
  if (endIdx < body.length) snippet = `${snippet}\u2026`;
  return snippet;
}
async function runSkills(args) {
  const sub = args[0];
  const rest = args.slice(1);
  if (sub === void 0 || sub === "--help" || sub === "-h") {
    process.stdout.write(
      [
        "Usage:",
        "  wisp-design skills index [--skills-root DIR] [--namespace NS]",
        "  wisp-design skills search <query\u2026> [--top-k K] [--skills-root DIR]",
        ""
      ].join("\n")
    );
    return EXIT_OK;
  }
  if (sub === "index") {
    return runSkillsIndex(rest);
  }
  if (sub === "search") {
    return runSkillsSearch(rest);
  }
  writeError({
    code: "BAD_SUBCOMMAND",
    message: `skills: unknown subcommand "${sub}". Try \`skills --help\`.`
  });
  return EXIT_ARG;
}
async function runSkillsIndex(args) {
  const parsed = parseFlags(args);
  const skillsRoot = flagAsString(parsed, "skills-root") ?? "skills";
  const namespace = flagAsString(parsed, "namespace") ?? DEFAULT_SKILLS_NAMESPACE;
  try {
    const result = await indexSkills({ skillsRoot, namespace });
    writeJsonResult(result);
    return EXIT_OK;
  } catch (err) {
    writeError({
      code: "SKILLS_INDEX_FAILED",
      message: err.message
    });
    return EXIT_IO;
  }
}
async function runSkillsSearch(args) {
  const parsed = parseFlags(args);
  const skillsRoot = flagAsString(parsed, "skills-root") ?? "skills";
  const topK = flagAsNumber(parsed, "top-k");
  const query = parsed.positional.join(" ");
  if (query.trim() === "") {
    writeError({
      code: "BAD_FLAG",
      message: "skills search: query is required"
    });
    return EXIT_ARG;
  }
  try {
    const results = await searchSkills(query, {
      topK,
      skillsRoot
    });
    writeJsonResult({ query, results });
    return EXIT_OK;
  } catch (err) {
    writeError({
      code: "SKILLS_SEARCH_FAILED",
      message: err.message
    });
    return EXIT_IO;
  }
}
export {
  indexSkills,
  runSkills,
  searchSkills
};
//# sourceMappingURL=skills-index.js.map