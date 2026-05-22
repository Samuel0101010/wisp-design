// wisp-design — Phase 4 anti-slop canary.
//
// The anti-slop hard-bans ARE the USP. Their accidental removal would silently
// destroy wisp-design's differentiator vs Impeccable/Stagewise/Onlook. This
// canary fails loudly if any hard-ban phrase or the 5-Dim Self-Critique is
// dropped from skills/policy/anti-slop.md.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const policyText = readFileSync(
  resolve(process.cwd(), "skills/policy/anti-slop.md"),
  "utf8",
);

describe("anti-slop canary — hard-ban phrases", () => {
  it("em-dash UI ban is documented", () => {
    expect(policyText.toLowerCase()).toMatch(/em.?dash/);
  });

  it("gradient-on-text ban is documented", () => {
    // Either of the phrasings is acceptable; both must mention `text` near `gradient`.
    expect(policyText.toLowerCase()).toMatch(/gradient[\s\S]{0,80}(text|headline)/);
  });

  it("default-glassmorphism ban is documented", () => {
    expect(policyText.toLowerCase()).toMatch(
      /glassmorphism[\s\S]{0,120}(default|without|rationale|justification)/,
    );
  });

  it("hero-metric template ban is documented", () => {
    expect(policyText.toLowerCase()).toMatch(/hero[\s\S]{0,40}metric/);
  });

  it("side-stripe decoration ban is documented", () => {
    expect(policyText.toLowerCase()).toMatch(/side.?stripe/);
  });

  it("purple-blue gradient ban is documented", () => {
    expect(policyText.toLowerCase()).toMatch(/purple.{0,10}blue/);
  });

  it("generic AI illustrations ban is documented", () => {
    expect(policyText.toLowerCase()).toMatch(/ai illustration|generic[\s\S]{0,40}ai/);
  });
});

describe("anti-slop canary — 5-Dim Self-Critique", () => {
  it("all 5 critique dimensions are listed (hierarchy / color / typography / spacing / polish)", () => {
    const lc = policyText.toLowerCase();
    expect(lc).toMatch(/hierarchy/);
    expect(lc).toMatch(/color/);
    expect(lc).toMatch(/typography/);
    expect(lc).toMatch(/spacing/);
    expect(lc).toMatch(/polish/);
    // The rubric is presented as a table — a row per dimension should exist.
    const rubricRows = (policyText.match(/^\| \*\*(Hierarchy|Color|Typography|Spacing|Polish)\*\*/gm) ?? [])
      .length;
    expect(rubricRows).toBe(5);
  });
});
