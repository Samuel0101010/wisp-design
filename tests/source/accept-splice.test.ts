// wisp-design — Phase 3 accept + findMarkerBlock + extractVariant + expandReplaceRange tests.
//
// Strategy:
//   - Build fixtures by calling `wrapVariantBlock` (JSX path is sound) to
//     produce a marker block, then SED in a real `@scope ([data-wisp-variant="N"])`
//     into the runtime style host.
//   - Exercise findMarkerBlock / extractVariant / expandReplaceRange directly.
//   - Run acceptVariant end-to-end and assert the file post-condition.
//
// HTML accept is documented but skipped (same `[^-]*?` marker-regex bug as
// inject — findMarkerBlock can't locate the wrap on .html files).

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  acceptVariant,
  extractVariant,
  findMarkerBlock,
} from "../../src/source/accept.js";
import { expandReplaceRange } from "../../src/source/_helpers.js";
import { wrapVariantBlock } from "../../src/source/wrap.js";

const SESSION = "sess1";

function makeRoot(): string {
  return mkdtempSync(join(tmpdir(), "wisp-accept-"));
}

function cleanup(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // best-effort
  }
}

const PAGE_TSX = `export default function P() {
  return (
    <div id="hero"><h1>Hi</h1></div>
  );
}
`;

// Splice a real variant CSS into the runtime style host produced by wrap.
function injectVariantCss(content: string, variantsCss: string): string {
  return content.replace(
    '<style data-wisp-css="sess1">{`/* variants populated at runtime */`}</style>',
    `<style data-wisp-css="sess1">{\`\n${variantsCss}\n\`}</style>`,
  );
}

async function prepareWrapped(
  root: string,
  variantsCss: string,
  fileName = "page.tsx",
): Promise<{ file: string; content: string }> {
  const file = join(root, fileName);
  writeFileSync(file, PAGE_TSX, "utf8");
  const w = await wrapVariantBlock(
    file,
    { id: "t1", selector: "#hero" },
    SESSION,
    3,
    { projectRoot: root },
  );
  if (!w.ok) throw new Error("setup: wrap failed");
  const before = readFileSync(file, "utf8");
  const after = injectVariantCss(before, variantsCss);
  writeFileSync(file, after, "utf8");
  return { file, content: after };
}

// ----------------------------- findMarkerBlock -----------------------------

describe("findMarkerBlock", () => {
  let root: string;
  beforeEach(() => {
    root = makeRoot();
  });
  afterEach(() => cleanup(root));

  it("locates the variants block by sessionId + targetId", async () => {
    const { content } = await prepareWrapped(root, "/* empty */");
    const block = findMarkerBlock(content, "tsx", "variants", {
      sessionId: SESSION,
      targetId: "t1",
    });
    expect(block).not.toBeNull();
    if (!block) return;
    expect(block.group).toBe("variants");
    expect(block.payload.sessionId).toBe(SESSION);
    expect(block.payload.targetId).toBe("t1");
    expect(block.endOffset).toBeGreaterThan(block.startOffset);
  });

  it("returns null when no marker block exists for the given filter", async () => {
    const { content } = await prepareWrapped(root, "/* empty */");
    const block = findMarkerBlock(content, "tsx", "variants", {
      sessionId: "other-sess",
      targetId: "t1",
    });
    expect(block).toBeNull();
  });

  it("returns null on plain content with no markers", () => {
    const block = findMarkerBlock("export const x = 1;\n", "tsx", "variants");
    expect(block).toBeNull();
  });

  it("group filter works: variants block not returned when looking for inject", async () => {
    const { content } = await prepareWrapped(root, "/* empty */");
    const block = findMarkerBlock(content, "tsx", "inject");
    expect(block).toBeNull();
  });
});

// ----------------------------- extractVariant -----------------------------

describe("extractVariant", () => {
  let root: string;
  beforeEach(() => {
    root = makeRoot();
  });
  afterEach(() => cleanup(root));

  it("extracts variant CSS body + :scope vars from JSX template-literal style host", async () => {
    const vcss =
      '@scope ([data-wisp-variant="1"]) {\n' +
      "  :scope { --pad: 24px; }\n" +
      "  .inner { padding: var(--pad); color: red; }\n" +
      "}";
    const { content } = await prepareWrapped(root, vcss);
    const block = findMarkerBlock(content, "tsx", "variants", {
      sessionId: SESSION,
      targetId: "t1",
    });
    expect(block).not.toBeNull();
    if (!block) return;
    const v = extractVariant(content, block, "1");
    expect(v).not.toBeNull();
    if (!v) return;
    expect(v.css).toContain(".inner");
    expect(v.css).toContain("padding: var(--pad)");
    expect(v.cssVars).toEqual({ "--pad": "24px" });
  });

  it("returns null when requested variantId is absent", async () => {
    const vcss =
      '@scope ([data-wisp-variant="0"]) { .inner { color: blue; } }';
    const { content } = await prepareWrapped(root, vcss);
    const block = findMarkerBlock(content, "tsx", "variants", {
      sessionId: SESSION,
      targetId: "t1",
    });
    if (!block) throw new Error("setup");
    const v = extractVariant(content, block, "99");
    expect(v).toBeNull();
  });

  it("parses @media nested inside @scope correctly", async () => {
    const vcss =
      '@scope ([data-wisp-variant="2"]) {\n' +
      "  @media (min-width: 768px) { .x { display: grid; } }\n" +
      "}";
    const { content } = await prepareWrapped(root, vcss);
    const block = findMarkerBlock(content, "tsx", "variants", {
      sessionId: SESSION,
      targetId: "t1",
    });
    if (!block) throw new Error("setup");
    const v = extractVariant(content, block, "2");
    expect(v).not.toBeNull();
    if (!v) return;
    expect(v.css).toContain("@media");
    expect(v.css).toContain("display: grid");
  });

  it("single-quoted variant selector also matches", async () => {
    const vcss =
      "@scope ([data-wisp-variant='3']) { .inner { color: green; } }";
    const { content } = await prepareWrapped(root, vcss);
    const block = findMarkerBlock(content, "tsx", "variants", {
      sessionId: SESSION,
      targetId: "t1",
    });
    if (!block) throw new Error("setup");
    const v = extractVariant(content, block, "3");
    expect(v).not.toBeNull();
    if (!v) return;
    expect(v.css).toContain(".inner");
  });
});

// ----------------------------- expandReplaceRange -----------------------------

describe("expandReplaceRange", () => {
  it("replaces the exact byte range of the marker block with the replacement", () => {
    const content = "AAA\nBBB\nCCC\n";
    const block = {
      startLine: 1,
      endLine: 1,
      startOffset: 4, // "B"
      endOffset: 8, // after "BBB\n"
      group: "variants" as const,
      payload: {},
    };
    const out = expandReplaceRange(content, block, "ZZ\n", "\n");
    expect(out).toBe("AAA\nZZ\nCCC\n");
  });

  it("handles empty replacement", () => {
    const content = "AAA\nBBB\nCCC\n";
    const block = {
      startLine: 1,
      endLine: 1,
      startOffset: 4,
      endOffset: 8,
      group: "variants" as const,
      payload: {},
    };
    const out = expandReplaceRange(content, block, "", "\n");
    expect(out).toBe("AAA\nCCC\n");
  });
});

// ----------------------------- acceptVariant end-to-end -----------------------------

describe("acceptVariant — end-to-end", () => {
  let root: string;
  beforeEach(() => {
    root = makeRoot();
  });
  afterEach(() => cleanup(root));

  it("accepts variant 1: writes permanent <style> + restores original snippet, markers gone", async () => {
    const vcss =
      '@scope ([data-wisp-variant="1"]) {\n' +
      "  :scope { --pad: 24px; }\n" +
      "  .inner { padding: var(--pad); color: red; }\n" +
      "}";
    const { file } = await prepareWrapped(root, vcss);

    const res = await acceptVariant(
      {
        filePath: file,
        sessionId: SESSION,
        targetId: "t1",
        variantId: "1",
        variantCss: "",
        paramOverrides: {},
        carbonize: true,
      },
      { projectRoot: root },
    );

    expect(res.variantId).toBe("1");
    expect(res.emittedCss).toContain("padding: 24px");
    // Phase 7.1: scopeSelector is now the targetId DIRECTLY (it IS the
    // element's CSS selector — built by picker.buildSelector), not a
    // synthesised `[data-wisp-target="…"]` attribute that was never written
    // onto the DOM. carbonize emits `<scope> <descendant>` for the inner
    // selector, so `.inner` becomes `t1 .inner`.
    expect(res.emittedCss).toContain("t1 .inner");

    const out = readFileSync(file, "utf8");
    // Permanent style block landed.
    expect(out).toContain('data-wisp-permanent="sess1"');
    // Markers consumed.
    expect(out).not.toContain("wisp-variants-start");
    expect(out).not.toContain("wisp-variants-end");
    // Original snippet restored (id="hero").
    expect(out).toContain('id="hero"');

    // Post-accept: re-running findMarkerBlock for variants returns null.
    const block2 = findMarkerBlock(out, "tsx", "variants", {
      sessionId: SESSION,
      targetId: "t1",
    });
    expect(block2).toBeNull();
  });

  it("applies paramOverrides — `--pad` baked from 24px to 32px", async () => {
    const vcss =
      '@scope ([data-wisp-variant="1"]) {\n' +
      "  :scope { --pad: 24px; }\n" +
      "  .inner { padding: var(--pad); }\n" +
      "}";
    const { file } = await prepareWrapped(root, vcss);
    const res = await acceptVariant(
      {
        filePath: file,
        sessionId: SESSION,
        targetId: "t1",
        variantId: "1",
        variantCss: "",
        paramOverrides: { "--pad": "32px" },
        carbonize: true,
      },
      { projectRoot: root },
    );
    expect(res.emittedCss).toContain("padding: 32px");
    expect(res.emittedCss).not.toContain("var(--pad)");
  });

  it("falls back to op.variantCss when extractVariant returns null", async () => {
    // Wrap with EMPTY style host (no @scope inside) — extractVariant returns
    // null, acceptVariant should use parsed.variantCss instead.
    const { file } = await prepareWrapped(root, "/* nothing here */");
    const fallbackCss = "  .injected { color: lime; }";
    const res = await acceptVariant(
      {
        filePath: file,
        sessionId: SESSION,
        targetId: "t1",
        variantId: "1",
        variantCss: fallbackCss,
        paramOverrides: {},
        carbonize: true,
      },
      { projectRoot: root },
    );
    expect(res.emittedCss).toContain(".injected");
    expect(res.emittedCss).toContain("color: lime");
  });

  it("produces JSX with no leftover wisp markers and balanced braces", async () => {
    const vcss =
      '@scope ([data-wisp-variant="1"]) {\n' +
      "  .inner { color: red; }\n" +
      "}";
    const { file } = await prepareWrapped(root, vcss);
    await acceptVariant(
      {
        filePath: file,
        sessionId: SESSION,
        targetId: "t1",
        variantId: "1",
        variantCss: "",
        paramOverrides: {},
        carbonize: true,
      },
      { projectRoot: root },
    );
    const out = readFileSync(file, "utf8");
    // No leftover wrap/inject markers (the permanent landing uses
    // `data-wisp-permanent` / `data-wisp-target` attributes — that's fine).
    expect(out).not.toContain("wisp-variants-start");
    expect(out).not.toContain("wisp-variants-end");
    expect(out).not.toContain("wisp-style-start");
    expect(out).not.toContain("wisp-style-end");
    // Smoke check: balanced JSX template `{` and `}`.
    const opens = (out.match(/\{/g) ?? []).length;
    const closes = (out.match(/\}/g) ?? []).length;
    expect(opens).toBe(closes);
  });

  it("throws when no variants block matches the session/target", async () => {
    const file = join(root, "no-wrap.tsx");
    writeFileSync(file, PAGE_TSX, "utf8");
    await expect(
      acceptVariant(
        {
          filePath: file,
          sessionId: SESSION,
          targetId: "t1",
          variantId: "1",
          variantCss: "  .x { color: red; }",
          paramOverrides: {},
          carbonize: true,
        },
        { projectRoot: root },
      ),
    ).rejects.toThrow(/no variants block/);
  });

  it("throws when produced CSS body would be empty (both extract null and fallback empty)", async () => {
    const { file } = await prepareWrapped(root, "/* nothing */");
    await expect(
      acceptVariant(
        {
          filePath: file,
          sessionId: SESSION,
          targetId: "t1",
          variantId: "1",
          variantCss: "   ",
          paramOverrides: {},
          carbonize: true,
        },
        { projectRoot: root },
      ),
    ).rejects.toThrow(/empty CSS/);
  });

  it("carbonize=false bakes nothing; emittedCss equals variant body", async () => {
    const vcss =
      '@scope ([data-wisp-variant="1"]) {\n' +
      "  .inner { color: red; }\n" +
      "}";
    const { file } = await prepareWrapped(root, vcss);
    const res = await acceptVariant(
      {
        filePath: file,
        sessionId: SESSION,
        targetId: "t1",
        variantId: "1",
        variantCss: "",
        paramOverrides: {},
        carbonize: false,
      },
      { projectRoot: root },
    );
    // carbonize=false ⇒ emittedCss is the raw variant body (no scope prefix).
    expect(res.emittedCss).toContain(".inner");
    expect(res.emittedCss).not.toContain('[data-wisp-target="t1"]');
  });
});
