// wisp-design — Phase 4 skill-corpus smoke tests.
//
// Pins the structure + key content markers of the curated skill files so a
// stray refactor doesn't quietly delete a load-bearing line. Use fs reads
// + grep-style asserts; no real parser needed.

import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const SKILLS = resolve(process.cwd(), "skills");

function read(rel: string): string {
  return readFileSync(resolve(SKILLS, rel), "utf8");
}

describe("SKILL.md frontmatter and triggering", () => {
  it("skills/wisp-design/SKILL.md exists and starts with frontmatter", () => {
    const p = resolve(SKILLS, "wisp-design/SKILL.md");
    expect(existsSync(p)).toBe(true);
    const text = readFileSync(p, "utf8");
    expect(text.startsWith("---")).toBe(true);
    // Frontmatter description must mention the keyword that drives auto-trigger.
    expect(text).toMatch(/description:\s*[^\n]*wisp-design/i);
  });
});

describe("reference/live.md — 5 axes", () => {
  it("contains all 5 axes (hierarchy / layout / typography / color / density)", () => {
    const text = read("reference/live.md");
    expect(text).toMatch(/hierarchy/i);
    expect(text).toMatch(/layout/i);
    expect(text).toMatch(/typography/i);
    expect(text).toMatch(/color/i);
    expect(text).toMatch(/density/i);
  });
});

describe("policy/anti-slop.md — hard-bans", () => {
  it("contains the canonical Vault hard-bans", () => {
    const text = read("policy/anti-slop.md");
    // Each ban name (lowercase substring check — content may vary).
    expect(text).toMatch(/em.?dash/i);
    expect(text).toMatch(/gradient[\s\S]{0,80}text/i);
    expect(text).toMatch(/glassmorphism/i);
    expect(text).toMatch(/hero[\s\S]{0,40}metric/i);
    expect(text).toMatch(/side.?stripe/i);
    expect(text).toMatch(/purple.{0,10}blue/i);
    expect(text).toMatch(/AI illustration|generic[\s\S]{0,40}AI/i);
  });
});

describe("methodology files — narrative-questions / junior-designer / brand-asset", () => {
  it("narrative-questions.md mentions all 4 questions (role / distance / temperature / capacity)", () => {
    const text = read("methodology/narrative-questions.md");
    expect(text).toMatch(/role/i);
    expect(text).toMatch(/distance/i);
    expect(text).toMatch(/temperature/i);
    expect(text).toMatch(/capacity/i);
  });

  it("junior-designer-flow.md mentions all 4 phases (Stub / Checkpoint / Fill / Verify)", () => {
    const text = read("methodology/junior-designer-flow.md");
    expect(text).toMatch(/stub/i);
    expect(text).toMatch(/checkpoint/i);
    expect(text).toMatch(/fill/i);
    expect(text).toMatch(/verify/i);
  });

  it("brand-asset-5-10-2-8.md mentions all 4 time budgets", () => {
    const text = read("methodology/brand-asset-5-10-2-8.md");
    expect(text).toMatch(/5 ?min/i);
    expect(text).toMatch(/10 ?min/i);
    expect(text).toMatch(/2 ?hour/i);
    expect(text).toMatch(/8 ?week/i);
  });
});

describe("data/anchors — INDEX and 13 cards", () => {
  it("anchors/00-INDEX.md exists and references 13+ anchors", () => {
    const text = read("data/anchors/00-INDEX.md");
    // Count rows in the markdown table that start with a backtick — each
    // anchor row is `\`name\` | source | one-liner | file`.
    const tableRows = (text.match(/^\| `[a-z-]+`/gm) ?? []).length;
    expect(tableRows).toBeGreaterThanOrEqual(13);
  });

  it("all 13 anchor files exist", () => {
    const required = [
      "linear",
      "stripe",
      "anthropic",
      "aceternity",
      "apple",
      "open-design-editorial",
      "open-design-modern-minimal",
      "open-design-tech-utility",
      "open-design-brutalist",
      "open-design-soft-warm",
      "vault-restrained-cool",
      "vault-committed-indigo",
      "vault-drenched-warm",
    ];
    for (const name of required) {
      const p = resolve(SKILLS, "data/anchors", `${name}.md`);
      expect(existsSync(p), `missing anchor file: ${name}.md`).toBe(true);
    }
  });

  it("each anchor card carries name + oneLiner + license frontmatter", () => {
    const required = [
      "linear",
      "stripe",
      "anthropic",
      "aceternity",
      "apple",
      "open-design-editorial",
      "open-design-modern-minimal",
      "open-design-tech-utility",
      "open-design-brutalist",
      "open-design-soft-warm",
      "vault-restrained-cool",
      "vault-committed-indigo",
      "vault-drenched-warm",
    ];
    for (const name of required) {
      const text = read(`data/anchors/${name}.md`);
      expect(text.startsWith("---"), `${name}.md missing frontmatter`).toBe(
        true,
      );
      expect(text).toMatch(/name:\s*\S/i);
      expect(text).toMatch(/oneLiner:\s*\S/i);
      expect(text).toMatch(/license:\s*MIT/i);
    }
  });
});

describe("data/directions — INDEX and README", () => {
  it("directions/00-INDEX.md exists with 20+ direction rows", () => {
    const text = read("data/directions/00-INDEX.md");
    const tableRows = (text.match(/^\| `[a-z][a-z0-9-]+`/gm) ?? []).length;
    expect(tableRows).toBeGreaterThanOrEqual(20);
  });

  it("directions/README.md cites huashu-design + MIT", () => {
    const text = read("data/directions/README.md");
    expect(text).toMatch(/huashu-design/i);
    expect(text).toMatch(/MIT/);
  });
});

describe("data/corpus — INDEX, README, sample CSV", () => {
  it("corpus/00-INDEX.md exists", () => {
    expect(existsSync(resolve(SKILLS, "data/corpus/00-INDEX.md"))).toBe(true);
  });

  it("corpus/README.md cites ui-ux-pro-max + MIT", () => {
    const text = read("data/corpus/README.md");
    expect(text).toMatch(/ui-ux-pro-max/i);
    expect(text).toMatch(/MIT/);
  });

  it("sample-style-modern-minimal.csv has header + ≥ 20 data rows", () => {
    const text = read("data/corpus/sample-style-modern-minimal.csv");
    // Strip comment lines (starts with `#`) before counting rows.
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    const nonComment = lines.filter((l) => !l.trimStart().startsWith("#"));
    // First non-comment line is the header; remaining are data rows.
    expect(nonComment.length).toBeGreaterThan(20);
    // Header row must include all six fields.
    expect(nonComment[0]).toBe(
      "target_type,style,prompt,css_template,checklist,css_vars",
    );
  });
});

describe("reference/* — sub-prompt files", () => {
  it("5 reference sub-files exist (polish / bolder / quieter / colorize / layout)", () => {
    for (const name of ["polish", "bolder", "quieter", "colorize", "layout"]) {
      const p = resolve(SKILLS, "reference", `${name}.md`);
      expect(existsSync(p), `missing ref file: ${name}.md`).toBe(true);
    }
  });
});
