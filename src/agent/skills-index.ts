// wisp-design — Skill-corpus indexer (Phase 4).
//
// Implements SkillsIndexModule from src/contracts/agent.ts. Phase 4 ships an
// in-process index: enumerate skills/data/**/*.{md,csv}, count by
// sub-namespace, and provide a keyword-substring retrieval fallback. The
// AgentDB HNSW path is reserved for Phase 6+ — the runtime contract here
// stays stable so the swap is a single function-body edit.
//
// Design rationale (docs/agent-loop.md §6):
//   • The corpus is content (MIT-attributed CSVs + Samuels patterns +
//     anchors + directions); the variant prompt retrieves topK cards by
//     query. Phase 4 is fine with a linear scan — the corpus is < 100 docs.
//   • Sub-namespaces (`anchors`, `directions`, `corpus`, `patterns`,
//     `policy`, `methodology`, `reference`) drive doctor warnings + lets
//     the prompt filter "give me anchor cards only".
//   • All paths reported back are workspace-relative so the skill prompt
//     can `Read` them without further resolution.

import { promises as fs } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

import {
  DEFAULT_SKILLS_NAMESPACE,
  SkillsIndexOptionsSchema,
  SkillsSearchOptionsSchema,
  type SkillsIndexOptions,
  type SkillsIndexResult,
  type SkillsSearchOptions,
  type SkillsSearchResult,
} from "../contracts/agent.js";
import {
  EXIT_ARG,
  EXIT_IO,
  EXIT_OK,
  flagAsNumber,
  flagAsString,
  parseFlags,
  writeError,
  writeJsonResult,
} from "./_helpers.js";

// Phase-4 controller key. Phase 6+ swaps this for an actual AgentDB
// controller handle (`mcp__ruflo__agentdb_controllers` output).
const AGENT_DB_CONTROLLER_STUB = "phase-4-stub";

// File extensions the indexer recognises. Anything else is skipped.
const INDEXABLE_EXTENSIONS = new Set<string>([".md", ".csv"]);

// Sub-namespaces we expect under `skills/data/`. Doctor warns when a slice
// is missing; the agent prompt uses these to filter retrieval.
const KNOWN_SUB_NAMESPACES = [
  "anchors",
  "directions",
  "corpus",
  "patterns",
  "policy",
  "methodology",
  "reference",
] as const;

// ---------------------------------------------------------------------------
// Internal corpus model — populated on every `index()` call. Search uses the
// same shape so the linear scan stays fast for the < 100-doc corpus.
// ---------------------------------------------------------------------------

interface IndexedFile {
  // Workspace-relative path with forward slashes (skill prompts care about
  // portability between Windows author + POSIX consumers).
  filePath: string;
  // The sub-namespace bucket this file falls into. Derived from the first
  // segment after `skills/data/` (when present); falls back to the file's
  // immediate parent dir otherwise.
  subNamespace: string;
  // Top-of-file body for snippet rendering and keyword search. Cap at 4 KB
  // so a runaway CSV doesn't blow up the in-process index.
  preview: string;
  // H1 title if the file is markdown; first CSV header row otherwise; file
  // basename as last resort.
  title: string;
}

// ---------------------------------------------------------------------------
// Recursive file walker — node:fs/promises `readdir({ recursive: true })`
// exists in Node 20+, but returning Dirent entries with full paths is the
// safer choice (the recursive flag's API has rough edges around symlinks).
// ---------------------------------------------------------------------------

async function walkDir(root: string): Promise<string[]> {
  const out: string[] = [];
  let entries;
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return out;
    throw err;
  }
  for (const entry of entries) {
    const full = join(root, entry.name);
    if (entry.isDirectory()) {
      // Skip hidden directories — keeps `.git`, `.DS_Store` out of the
      // corpus without explicit exclusion lists.
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

// Convert any absolute or platform-relative path into a workspace-relative
// path with forward slashes. The skill prompt embeds these verbatim.
function toPortableRelative(root: string, absPath: string): string {
  const rel = relative(root, absPath);
  return rel.split(sep).join("/");
}

// Derive the sub-namespace bucket. `skills/data/anchors/linear.md` →
// `"anchors"`; `skills/policy/anti-slop.md` → `"policy"`. We deliberately
// inspect the segment AFTER `data/` first because that's where the bulk of
// the corpus lives (anchors/directions/corpus/patterns).
function deriveSubNamespace(skillsRoot: string, absPath: string): string {
  const rel = relative(skillsRoot, absPath).split(sep);
  if (rel.length >= 2 && rel[0] === "data") {
    return rel[1] as string;
  }
  if (rel.length >= 1) {
    return rel[0] as string;
  }
  return "uncategorized";
}

// Best-effort title extraction. Markdown H1 → CSV header → filename.
function extractTitle(filePath: string, body: string): string {
  // Strip a YAML frontmatter block so its `title:` doesn't masquerade as
  // a body H1 (and the H1 we want is right after the frontmatter).
  let stripped = body;
  if (body.startsWith("---")) {
    const end = body.indexOf("\n---", 3);
    if (end !== -1) stripped = body.slice(end + 4);
  }
  const h1 = stripped.match(/^\s*#\s+(.+)$/m);
  if (h1 && h1[1] !== undefined) return h1[1].trim();
  if (filePath.endsWith(".csv")) {
    const firstLine = body.split(/\r?\n/, 1)[0] ?? "";
    if (firstLine.trim() !== "") return firstLine.trim();
  }
  // Filename without extension as last resort.
  const base = filePath.split("/").pop() ?? filePath;
  return base.replace(/\.(md|csv)$/i, "");
}

// ---------------------------------------------------------------------------
// indexSkills — Phase 4 in-process enumeration. Returns counts by
// sub-namespace plus a stable controller key. The AgentDB store call is
// stubbed; switching to real persistence is a single function-body edit.
// ---------------------------------------------------------------------------

export async function indexSkills(
  opts: SkillsIndexOptions,
): Promise<SkillsIndexResult> {
  const parsed = SkillsIndexOptionsSchema.parse(opts);
  const start = Date.now();
  const skillsRoot = resolve(parsed.skillsRoot);

  const allFiles = await walkDir(skillsRoot);
  const indexable = allFiles.filter((p) => {
    for (const ext of INDEXABLE_EXTENSIONS) {
      if (p.toLowerCase().endsWith(ext)) return true;
    }
    return false;
  });

  // Per-sub-namespace counter. Initialise with the known buckets so the
  // result always carries the same keyset (doctor uses this to detect
  // missing slices).
  const byNamespace: Record<string, number> = {};
  for (const ns of KNOWN_SUB_NAMESPACES) byNamespace[ns] = 0;

  for (const file of indexable) {
    const sub = deriveSubNamespace(skillsRoot, file);
    byNamespace[sub] = (byNamespace[sub] ?? 0) + 1;
  }

  // TODO(phase-6): once AgentDB HNSW lands, build embeddings here and
  // store via `mcp__ruflo__agentdb_pattern-store`. The schema's
  // `agentDbController` field is the key that `searchSkills` then passes
  // back. For Phase 4 we keep this as a stub controller key so the
  // contract surface stays stable.
  void parsed.namespace;

  return {
    indexedFiles: indexable.length,
    byNamespace,
    durationMs: Date.now() - start,
    agentDbController: AGENT_DB_CONTROLLER_STUB,
  };
}

// ---------------------------------------------------------------------------
// searchSkills — Phase 4 in-process fallback. Tokenise the query, count
// case-insensitive substring hits per file, normalise by file size, return
// top-K. Phase 6+ swaps the body for AgentDB HNSW with the same signature.
// ---------------------------------------------------------------------------

export async function searchSkills(
  query: string,
  opts?: Partial<SkillsSearchOptions> & { skillsRoot?: string },
): Promise<SkillsSearchResult[]> {
  const parsed = SkillsSearchOptionsSchema.parse({
    topK: opts?.topK,
    namespace: opts?.namespace,
  });
  const skillsRoot = resolve(opts?.skillsRoot ?? "skills");
  const trimmedQuery = query.trim();
  if (trimmedQuery === "") return [];

  const tokens = trimmedQuery
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length >= 2);
  if (tokens.length === 0) return [];

  const allFiles = await walkDir(skillsRoot);
  const indexable = allFiles.filter((p) => {
    for (const ext of INDEXABLE_EXTENSIONS) {
      if (p.toLowerCase().endsWith(ext)) return true;
    }
    return false;
  });

  const scored: SkillsSearchResult[] = [];

  for (const file of indexable) {
    let body: string;
    try {
      body = await fs.readFile(file, "utf8");
    } catch {
      continue;
    }
    const sub = deriveSubNamespace(skillsRoot, file);
    // The contract lets callers filter by namespace; the namespace flag
    // refers to the AgentDB namespace (DEFAULT_SKILLS_NAMESPACE), not the
    // sub-bucket. Phase 4 ignores `parsed.namespace` because we only have
    // one namespace; Phase 6+ will route to AgentDB by namespace key.
    void parsed.namespace;

    // Lowercased buffer for scoring — preserve original for snippet.
    const lower = body.toLowerCase();
    let score = 0;
    for (const tok of tokens) {
      if (tok === "") continue;
      let idx = 0;
      let hits = 0;
      while (idx < lower.length) {
        const found = lower.indexOf(tok, idx);
        if (found === -1) break;
        hits += 1;
        idx = found + tok.length;
        if (hits > 100) break; // sanity cap per token
      }
      score += hits;
    }
    if (score === 0) continue;

    // Normalise by sqrt(length) — Lucene-like length-norm so a 200-line
    // doc with 1 hit doesn't outrank a 5-line anchor card with 1 hit.
    const normalized = score / Math.sqrt(Math.max(body.length, 1));

    const snippet = buildSnippet(body, tokens);
    const filePath = toPortableRelative(process.cwd(), file);

    scored.push({
      filePath,
      score: normalized,
      snippet,
      namespace: sub,
    });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, parsed.topK);
}

// Pull a ~240-char window around the first matching token. If no token
// matches (defensive — searchSkills filters score===0 already), return the
// file's leading 240 chars.
function buildSnippet(body: string, tokens: string[]): string {
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
  if (startIdx > 0) snippet = `…${snippet}`;
  if (endIdx < body.length) snippet = `${snippet}…`;
  return snippet;
}

// ---------------------------------------------------------------------------
// CLI runner. `wisp-design skills <index|search> [args]`
// ---------------------------------------------------------------------------

export async function runSkills(args: string[]): Promise<number> {
  const sub = args[0];
  const rest = args.slice(1);

  if (sub === undefined || sub === "--help" || sub === "-h") {
    process.stdout.write(
      [
        "Usage:",
        "  wisp-design skills index [--skills-root DIR] [--namespace NS]",
        "  wisp-design skills search <query…> [--top-k K] [--skills-root DIR]",
        "",
      ].join("\n"),
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
    message: `skills: unknown subcommand "${sub}". Try \`skills --help\`.`,
  });
  return EXIT_ARG;
}

async function runSkillsIndex(args: string[]): Promise<number> {
  const parsed = parseFlags(args);
  const skillsRoot = flagAsString(parsed, "skills-root") ?? "skills";
  const namespace =
    flagAsString(parsed, "namespace") ?? DEFAULT_SKILLS_NAMESPACE;

  try {
    const result = await indexSkills({ skillsRoot, namespace });
    writeJsonResult(result);
    return EXIT_OK;
  } catch (err) {
    writeError({
      code: "SKILLS_INDEX_FAILED",
      message: (err as Error).message,
    });
    return EXIT_IO;
  }
}

async function runSkillsSearch(args: string[]): Promise<number> {
  const parsed = parseFlags(args);
  const skillsRoot = flagAsString(parsed, "skills-root") ?? "skills";
  const topK = flagAsNumber(parsed, "top-k");
  // Positional args after subcommand = the query; join with spaces so users
  // don't have to remember to quote multi-word queries.
  const query = parsed.positional.join(" ");
  if (query.trim() === "") {
    writeError({
      code: "BAD_FLAG",
      message: "skills search: query is required",
    });
    return EXIT_ARG;
  }
  try {
    const results = await searchSkills(query, {
      topK,
      skillsRoot,
    });
    writeJsonResult({ query, results });
    return EXIT_OK;
  } catch (err) {
    writeError({
      code: "SKILLS_SEARCH_FAILED",
      message: (err as Error).message,
    });
    return EXIT_IO;
  }
}
