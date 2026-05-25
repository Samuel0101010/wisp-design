// wisp-design — Phase 4 skills indexer + search tests.
//
// Mixes real-repo happy-path assertions (the curated skills/ tree is
// committed) with tmpDir fixtures for edge cases.

import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { indexSkills, runSkills, searchSkills } from "../../src/agent/skills-index.js";

const REPO_SKILLS = resolve(process.cwd(), "skills");

// Capture stdout/stderr writes during a runner call.
function captureStdio(): {
  stdout: string[];
  stderr: string[];
  restore: () => void;
} {
  const out: string[] = [];
  const err: string[] = [];
  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);
  process.stdout.write = ((chunk: string | Uint8Array) => {
    out.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
    return true;
  }) as typeof process.stdout.write;
  process.stderr.write = ((chunk: string | Uint8Array) => {
    err.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
    return true;
  }) as typeof process.stderr.write;
  return {
    stdout: out,
    stderr: err,
    restore: () => {
      process.stdout.write = origOut;
      process.stderr.write = origErr;
    },
  };
}

const tmpDirs: string[] = [];
function makeTmpSkillsRoot(): string {
  const d = mkdtempSync(join(tmpdir(), "wisp-skills-idx-"));
  tmpDirs.push(d);
  return d;
}

afterEach(() => {
  while (tmpDirs.length > 0) {
    const d = tmpDirs.pop();
    if (d !== undefined) {
      try {
        rmSync(d, { recursive: true, force: true });
      } catch {
        // best-effort
      }
    }
  }
});

describe("indexSkills — happy path on real repo", () => {
  it("indexes the committed skills/ tree with count > 0", async () => {
    const result = await indexSkills({
      skillsRoot: REPO_SKILLS,
      namespace: "wisp-design",
    });
    expect(result.indexedFiles).toBeGreaterThan(0);
    expect(typeof result.durationMs).toBe("number");
    expect(result.agentDbController).toBe("phase-4-stub");
  });

  it("byNamespace surfaces known sub-buckets (anchors/policy/methodology/reference)", async () => {
    const result = await indexSkills({
      skillsRoot: REPO_SKILLS,
      namespace: "wisp-design",
    });
    // anchors has 14 files (INDEX + 13 cards); policy has at least 1.
    expect(result.byNamespace["anchors"]).toBeGreaterThan(0);
    expect(result.byNamespace["policy"]).toBeGreaterThan(0);
    expect(result.byNamespace["methodology"]).toBeGreaterThan(0);
    expect(result.byNamespace["reference"]).toBeGreaterThan(0);
  });

  it("agentDbController is the Phase-4 stub key", async () => {
    const result = await indexSkills({
      skillsRoot: REPO_SKILLS,
      namespace: "wisp-design",
    });
    expect(result.agentDbController).toBe("phase-4-stub");
  });
});

describe("indexSkills — empty + filter behaviour", () => {
  it("empty tmpDir → 0 indexed files; byNamespace still has known keyset", async () => {
    const root = makeTmpSkillsRoot();
    const result = await indexSkills({
      skillsRoot: root,
      namespace: "wisp-design",
    });
    expect(result.indexedFiles).toBe(0);
    // The indexer always initialises the known sub-namespace bucket keys.
    expect(result.byNamespace["anchors"]).toBe(0);
    expect(result.byNamespace["policy"]).toBe(0);
  });

  it("indexer includes .md and .csv; skips other extensions", async () => {
    const root = makeTmpSkillsRoot();
    mkdirSync(join(root, "data", "anchors"), { recursive: true });
    writeFileSync(join(root, "data", "anchors", "a.md"), "# A\n", "utf8");
    writeFileSync(join(root, "data", "anchors", "b.csv"), "h1,h2\n1,2\n", "utf8");
    writeFileSync(join(root, "data", "anchors", "c.txt"), "skip me", "utf8");
    writeFileSync(join(root, "data", "anchors", "d.json"), "{}", "utf8");

    const result = await indexSkills({
      skillsRoot: root,
      namespace: "wisp-design",
    });
    expect(result.indexedFiles).toBe(2);
    expect(result.byNamespace["anchors"]).toBe(2);
  });

  it("hidden directories are skipped", async () => {
    const root = makeTmpSkillsRoot();
    mkdirSync(join(root, ".git", "objects"), { recursive: true });
    writeFileSync(join(root, ".git", "objects", "skip.md"), "# skip\n", "utf8");
    mkdirSync(join(root, "data", "anchors"), { recursive: true });
    writeFileSync(join(root, "data", "anchors", "keep.md"), "# keep\n", "utf8");

    const result = await indexSkills({
      skillsRoot: root,
      namespace: "wisp-design",
    });
    expect(result.indexedFiles).toBe(1);
  });
});

describe("searchSkills — relevance on real repo", () => {
  it("query 'linear' returns the linear anchor card", async () => {
    const results = await searchSkills("linear", { skillsRoot: REPO_SKILLS });
    expect(results.length).toBeGreaterThan(0);
    // The linear.md card has H1 "Anchor — Linear" + frontmatter name: linear
    // — it should be the top-ranked hit.
    expect(results[0]?.filePath).toMatch(/anchors\/linear\.md$/);
  });

  it("query 'anti-slop' returns the anti-slop policy", async () => {
    const results = await searchSkills("anti-slop", { skillsRoot: REPO_SKILLS });
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => /policy\/anti-slop\.md$/.test(r.filePath))).toBe(
      true,
    );
  });

  it("topK caps the result count", async () => {
    const results = await searchSkills("design", {
      skillsRoot: REPO_SKILLS,
      topK: 3,
    });
    expect(results.length).toBeLessThanOrEqual(3);
  });

  it("no-match query returns empty array", async () => {
    const results = await searchSkills(
      "zzzzzzzzz-no-such-token-anywhere-zzzzzzzzz",
      { skillsRoot: REPO_SKILLS },
    );
    expect(results).toEqual([]);
  });

  it("empty / whitespace-only query returns empty array", async () => {
    expect(await searchSkills("", { skillsRoot: REPO_SKILLS })).toEqual([]);
    expect(await searchSkills("   ", { skillsRoot: REPO_SKILLS })).toEqual([]);
  });

  it("single-char queries are filtered out (too short)", async () => {
    // tokens with length < 2 are dropped by the indexer — single-char must
    // therefore behave like an empty query.
    expect(await searchSkills("a", { skillsRoot: REPO_SKILLS })).toEqual([]);
  });

  it("results carry filePath / score / snippet / namespace fields", async () => {
    const results = await searchSkills("anchor", {
      skillsRoot: REPO_SKILLS,
      topK: 3,
    });
    expect(results.length).toBeGreaterThan(0);
    const hit = results[0];
    expect(hit).toBeDefined();
    if (hit !== undefined) {
      expect(typeof hit.filePath).toBe("string");
      expect(typeof hit.score).toBe("number");
      expect(typeof hit.snippet).toBe("string");
      expect(typeof hit.namespace).toBe("string");
    }
  });

  it("sqrt-length-norm: short anchor card outranks long doc on equal hit count", async () => {
    const root = makeTmpSkillsRoot();
    mkdirSync(join(root, "data", "anchors"), { recursive: true });
    // Both have exactly one hit on "needle"; the short doc is ~30 chars, the
    // long doc has the same hit padded by ~4 KB of unrelated text. Length-
    // norm should rank the short doc higher.
    writeFileSync(
      join(root, "data", "anchors", "short.md"),
      "# Title\nneedle here\n",
      "utf8",
    );
    const padding = "lorem ipsum dolor sit amet ".repeat(200);
    writeFileSync(
      join(root, "data", "anchors", "long.md"),
      `# Title\nneedle here\n${padding}`,
      "utf8",
    );
    const results = await searchSkills("needle", { skillsRoot: root });
    expect(results.length).toBe(2);
    expect(results[0]?.filePath).toMatch(/short\.md$/);
  });
});

describe("searchSkills — stopwords + stemming + field-boost", () => {
  it("stopword-only query returns empty results", async () => {
    // "the and for" are all stopwords → tokens list collapses to [] →
    // contract says return [] (same shape as an empty query).
    const results = await searchSkills("the and for", {
      skillsRoot: REPO_SKILLS,
    });
    expect(results).toEqual([]);
  });

  it("stem-truncation hits plural / inflection variants", async () => {
    const root = makeTmpSkillsRoot();
    mkdirSync(join(root, "data", "anchors"), { recursive: true });
    // File contains "dashboards" only. Query "dashboard" stems to
    // "dashbo" (6 chars), which is a substring of "dashboards" — hit.
    writeFileSync(
      join(root, "data", "anchors", "d.md"),
      "# Dash\nMultiple dashboards listed here.\n",
      "utf8",
    );
    const results = await searchSkills("dashboard", { skillsRoot: root });
    expect(results.length).toBe(1);
    expect(results[0]?.filePath).toMatch(/d\.md$/);
  });

  it("description-field hit outranks an equal body-only hit", async () => {
    const root = makeTmpSkillsRoot();
    mkdirSync(join(root, "data", "anchors"), { recursive: true });
    // File A: token only in YAML description.
    writeFileSync(
      join(root, "data", "anchors", "a.md"),
      "---\nname: a\ndescription: needle anchor card here\n---\n# A\nIrrelevant body.\n",
      "utf8",
    );
    // File B: token only in body, same byte-length ballpark so length-
    // norm doesn't dominate the test.
    writeFileSync(
      join(root, "data", "anchors", "b.md"),
      "---\nname: b\ndescription: unrelated description text here\n---\n# B\nneedle body.\n",
      "utf8",
    );
    const results = await searchSkills("needle", { skillsRoot: root });
    expect(results.length).toBe(2);
    // Description hit is weighted ×2 → A outranks B.
    expect(results[0]?.filePath).toMatch(/a\.md$/);
  });
});

describe("runSkills CLI", () => {
  it("`skills index` → exit 0 + valid JSON", async () => {
    const cap = captureStdio();
    let code = 99;
    try {
      code = await runSkills(["index", "--skills-root", REPO_SKILLS]);
    } finally {
      cap.restore();
    }
    expect(code).toBe(0);
    const parsed = JSON.parse(cap.stdout.join(""));
    expect(parsed.indexedFiles).toBeGreaterThan(0);
  });

  it("`skills search linear` → exit 0 + results", async () => {
    const cap = captureStdio();
    let code = 99;
    try {
      code = await runSkills([
        "search",
        "linear",
        "--skills-root",
        REPO_SKILLS,
      ]);
    } finally {
      cap.restore();
    }
    expect(code).toBe(0);
    const parsed = JSON.parse(cap.stdout.join(""));
    expect(parsed.query).toBe("linear");
    expect(Array.isArray(parsed.results)).toBe(true);
  });

  it("`skills search` (no query) → exit 2 BAD_FLAG", async () => {
    const cap = captureStdio();
    let code = 99;
    try {
      code = await runSkills(["search"]);
    } finally {
      cap.restore();
    }
    expect(code).toBe(2);
    expect(cap.stderr.join("")).toMatch(/BAD_FLAG|query/i);
  });

  it("`skills --help` → exit 0 + usage block", async () => {
    const cap = captureStdio();
    let code = 99;
    try {
      code = await runSkills(["--help"]);
    } finally {
      cap.restore();
    }
    expect(code).toBe(0);
    expect(cap.stdout.join("")).toMatch(/Usage:/);
  });

  it("`skills <unknown>` → exit 2 BAD_SUBCOMMAND", async () => {
    const cap = captureStdio();
    let code = 99;
    try {
      code = await runSkills(["nonsense-subcommand"]);
    } finally {
      cap.restore();
    }
    expect(code).toBe(2);
    expect(cap.stderr.join("")).toMatch(/BAD_SUBCOMMAND/);
  });
});
