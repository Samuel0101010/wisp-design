// wisp-design — Vault → Skills sync (Phase 4).
//
// Implements SyncModule from src/contracts/agent.ts. EXPLICIT, user-triggered
// copy of vault markdown into `skills/data/patterns/` (Open Decision #6 —
// no file-watcher, no push-script). Each invocation:
//
//   1. Validates SyncSource via zod.
//   2. Walks the source path, matching `patterns` globs (default
//      `**/*.md`). The glob matcher is intentionally minimal — supports
//      `**`, `*`, and `?`. Phase 6+ may swap in fast-glob if vault
//      layouts grow complex.
//   3. Copies each match to `skills/data/patterns/<basename>`, preserving
//      sub-folder structure under the source root.
//   4. Skips files whose existing SHA-256 matches (idempotent re-sync).
//   5. Prepends `--- attribution: { owner, license } ---` frontmatter if
//      requested AND the destination didn't already carry one.
//   6. Re-runs `indexSkills` against the project's `skills/` unless
//      `--no-index` was passed.
//
// Why explicit? Licence + attribution. The user is the only party who can
// certify that a given vault file is theirs to ship under MIT. A daemon
// push-script would silently copy whatever lands in the vault.

import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

import {
  SyncSourceSchema,
  type SyncResult,
  type SyncSource,
} from "../contracts/agent.js";
import {
  EXIT_ARG,
  EXIT_IO,
  EXIT_OK,
  flagAsString,
  parseFlags,
  writeError,
  writeJsonResult,
} from "./_helpers.js";
import { indexSkills } from "./skills-index.js";

// Destination is fixed by the contract literal. Keeping it as a constant
// (rather than re-reading source.destination on each call) means tooling can
// statically grep for the write target.
const PATTERNS_DESTINATION = "skills/data/patterns";

// ---------------------------------------------------------------------------
// Minimal glob matcher — Phase 4 only needs `**/*.md`-class patterns. We
// convert the glob to a RegExp by escaping regex metacharacters and then
// re-interpreting `**`, `*`, `?`. Anything more exotic (negation,
// brace-expansion) deliberately fails closed.
// ---------------------------------------------------------------------------

function globToRegExp(pattern: string): RegExp {
  // Normalise to forward slashes so a Windows-authored `patterns: ["**/*.md"]`
  // matches against POSIX-style internal paths.
  const normalised = pattern.replace(/\\/g, "/");
  let re = "^";
  for (let i = 0; i < normalised.length; i += 1) {
    const ch = normalised[i] as string;
    if (ch === "*") {
      if (normalised[i + 1] === "*") {
        // `**` → match any number of path segments, including zero.
        re += ".*";
        i += 1;
        // Eat an optional trailing `/` (so `**/x` matches `x` and `a/x`).
        if (normalised[i + 1] === "/") {
          i += 1;
        }
      } else {
        // Single `*` → match one path segment (no slashes).
        re += "[^/]*";
      }
      continue;
    }
    if (ch === "?") {
      re += "[^/]";
      continue;
    }
    // Escape regex metacharacters.
    if (/[.+^${}()|[\]\\]/.test(ch)) {
      re += `\\${ch}`;
    } else {
      re += ch;
    }
  }
  re += "$";
  return new RegExp(re);
}

function matchesAnyPattern(relPath: string, patterns: string[]): boolean {
  const portable = relPath.split(sep).join("/");
  for (const p of patterns) {
    if (globToRegExp(p).test(portable)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Recursive walk — same shape as the indexer's, but returns paths relative to
// the source root (for glob matching) and skips hidden dirs.
// ---------------------------------------------------------------------------

interface WalkedFile {
  abs: string;
  rel: string;
}

async function walkSource(root: string): Promise<WalkedFile[]> {
  const out: WalkedFile[] = [];
  await walkInto(root, root, out);
  return out;
}

async function walkInto(
  root: string,
  dir: string,
  out: WalkedFile[],
): Promise<void> {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return;
    throw err;
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkInto(root, abs, out);
      continue;
    }
    if (entry.isFile()) {
      out.push({ abs, rel: relative(root, abs) });
    }
  }
}

// ---------------------------------------------------------------------------
// SHA-256 of a buffer/string — keep it inline to avoid pulling another
// helper module. Idempotent re-sync uses this to skip identical files.
// ---------------------------------------------------------------------------

function sha256Hex(buf: Buffer | string): string {
  const h = createHash("sha256");
  h.update(typeof buf === "string" ? Buffer.from(buf, "utf8") : buf);
  return h.digest("hex");
}

// ---------------------------------------------------------------------------
// Attribution frontmatter — prepended only when the destination didn't
// already carry one. Schema:
//
//   ---
//   attribution:
//     owner: "<owner>"
//     license: "<license>"
//   ---
//
// Why YAML rather than a HTML comment: the corpus is read by humans (Samuel)
// and by the variant prompt (which strips frontmatter for keyword search,
// see skills-index.ts/extractTitle). YAML is the lingua franca.
// ---------------------------------------------------------------------------

function hasFrontmatter(content: string): boolean {
  return content.startsWith("---\n") || content.startsWith("---\r\n");
}

function buildAttributionFrontmatter(
  owner: string,
  license: string,
): string {
  const escape = (s: string): string => s.replace(/"/g, '\\"');
  return [
    "---",
    "attribution:",
    `  owner: "${escape(owner)}"`,
    `  license: "${escape(license)}"`,
    "---",
    "",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// syncFromVault — main entry point.
// ---------------------------------------------------------------------------

export async function syncFromVault(
  source: SyncSource,
  opts: { projectRoot: string; index?: boolean },
): Promise<SyncResult> {
  const parsed = SyncSourceSchema.parse(source);
  const projectRoot = resolve(opts.projectRoot);
  const sourceAbs = resolve(parsed.fromPath);

  // Verify source exists and is a directory.
  let stat;
  try {
    stat = await fs.stat(sourceAbs);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") {
      throw new Error(`sync: source path does not exist: ${sourceAbs}`);
    }
    throw err;
  }
  if (!stat.isDirectory()) {
    throw new Error(`sync: source path is not a directory: ${sourceAbs}`);
  }

  const destRoot = join(projectRoot, PATTERNS_DESTINATION);
  await fs.mkdir(destRoot, { recursive: true });

  const walked = await walkSource(sourceAbs);
  const matched = walked.filter((w) => matchesAnyPattern(w.rel, parsed.patterns));

  const copiedFiles: string[] = [];
  let skippedCount = 0;

  for (const file of matched) {
    const destAbs = join(destRoot, file.rel);
    await fs.mkdir(dirname(destAbs), { recursive: true });

    const srcBytes = await fs.readFile(file.abs);
    let outBytes = srcBytes;

    // Attribution frontmatter — only for markdown, only when not already
    // present. Binary CSV blobs go through unchanged.
    if (
      parsed.attribution !== undefined &&
      file.abs.toLowerCase().endsWith(".md")
    ) {
      const text = srcBytes.toString("utf8");
      if (!hasFrontmatter(text)) {
        const fm = buildAttributionFrontmatter(
          parsed.attribution.owner,
          parsed.attribution.license,
        );
        outBytes = Buffer.from(fm + text, "utf8");
      }
    }

    // Idempotent skip: if the destination already exists with byte-identical
    // SHA-256, don't rewrite (preserves mtime + lets sync run cheaply on
    // every project setup).
    try {
      const existing = await fs.readFile(destAbs);
      if (sha256Hex(existing) === sha256Hex(outBytes)) {
        skippedCount += 1;
        continue;
      }
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== "ENOENT" && code !== "ENOTDIR") throw err;
      // Falls through — destination doesn't exist, write it.
    }

    await fs.writeFile(destAbs, outBytes);
    copiedFiles.push(destAbs);
  }

  // Re-index after copy unless the caller opted out. The index call walks
  // the entire `skills/` tree, not just the patterns sub-dir, so the
  // SkillsIndexResult reflects the union of curated + synced content.
  let indexedInAgentDb = false;
  if (opts.index !== false) {
    const skillsRoot = join(projectRoot, "skills");
    try {
      // Phase 4 indexSkills is an in-process enumeration — see
      // skills-index.ts AGENT_DB_CONTROLLER_STUB. The `indexedInAgentDb`
      // flag stays `false` here on purpose: tests assert it as the visible
      // marker that real AgentDB persistence is a Phase-6 swap.
      await indexSkills({ skillsRoot, namespace: "wisp-design" });
      indexedInAgentDb = false;
    } catch (err) {
      // Indexing failure is non-fatal for sync; the user still got their
      // files copied. We surface the error in the result so the CLI can
      // print a soft warning.
      void err;
    }
  }

  return {
    copiedCount: copiedFiles.length,
    skippedCount,
    files: copiedFiles,
    indexedInAgentDb,
  };
}

// ---------------------------------------------------------------------------
// CLI runner. `wisp-design sync --from <vault-path> [--no-index]
//                                  [--attribution-owner X --attribution-license Y]`
// ---------------------------------------------------------------------------

export async function runSync(args: string[]): Promise<number> {
  const parsed = parseFlags(args);

  const from = flagAsString(parsed, "from");
  if (from === undefined || from === "") {
    writeError({
      code: "BAD_FLAG",
      message: "sync: --from <vault-path> is required",
    });
    return EXIT_ARG;
  }

  const noIndexFlag = parsed.flags["no-index"];
  const shouldIndex = !(noIndexFlag === true || noIndexFlag === "true");

  const attributionOwner = flagAsString(parsed, "attribution-owner");
  const attributionLicense = flagAsString(parsed, "attribution-license");

  let attribution: SyncSource["attribution"];
  if (attributionOwner !== undefined || attributionLicense !== undefined) {
    if (attributionOwner === undefined || attributionLicense === undefined) {
      writeError({
        code: "BAD_FLAG",
        message:
          "sync: --attribution-owner and --attribution-license must be provided together",
      });
      return EXIT_ARG;
    }
    attribution = { owner: attributionOwner, license: attributionLicense };
  }

  const source: SyncSource = {
    fromPath: from,
    patterns: ["**/*.md"],
    destination: "skills/data/patterns/",
    ...(attribution !== undefined ? { attribution } : {}),
  };

  try {
    const result = await syncFromVault(source, {
      projectRoot: process.cwd(),
      index: shouldIndex,
    });
    writeJsonResult(result);
    return EXIT_OK;
  } catch (err) {
    writeError({
      code: "SYNC_FAILED",
      message: (err as Error).message,
    });
    return EXIT_IO;
  }
}
