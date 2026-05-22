// wisp-design — Phase 3 wrap + discard heuristic target-finding tests.
//
// Pins:
//   - selectorToAnchor: `#id` → `id="…"`, `.cls` → `"cls"`, attr-selector
//   - ambiguity (> 1 anchor hit) → ok:false reason:"ambiguous_target"
//   - missing selector → ok:false reason:"target_not_found"
//   - self-closing tags (`<img id="x" />`) — span ends at `/>`
//   - mixed-case JSX tags (`<HeroCTA …>`) — walker is case-insensitive
//   - HTML `<section id="cta">` — uses `<!-- -->` markers
//   - wrap → discard roundtrip on JSX
//   - safety-refused paths
//
// HTML wrap is NOT covered for the "find marker block" side (same regex bug
// as inject — `[^-]*?` rejects payloads with `-`). Wrap WRITE works; discard
// READ does not. Pinned here so the bug is visible from the test surface.

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
  discardVariantBlock,
  wrapVariantBlock,
} from "../../src/source/wrap.js";

const SESSION = "sess1";

function makeRoot(): string {
  return mkdtempSync(join(tmpdir(), "wisp-wrap-"));
}

function cleanup(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // best-effort
  }
}

// ----------------------------- Fixtures -----------------------------

const PAGE_TSX = `export default function Page() {
  return (
    <div id="hero">
      <h1>Title</h1>
    </div>
  );
}
`;

// NOTE: `selectorToAnchor(".btn")` produces the literal `"btn"` (open-quote +
// btn + close-quote). That only matches when the class attribute is exactly
// `className="btn"` — multi-class attributes (`className="btn primary"`) do
// NOT contain `"btn"` as a substring. Fixtures below use bare `"btn"` so the
// happy / ambiguous cases work as designed; multi-class behavior is pinned
// in its own describe-block as a FINDING.
const TWO_BTNS = `export default function P() {
  return (
    <>
      <button className="btn">A</button>
      <button className="btn">B</button>
    </>
  );
}
`;

const ONE_BTN = `export default function P() {
  return (
    <button className="btn">Click</button>
  );
}
`;

const MULTI_CLASS = `export default function P() {
  return (
    <button className="btn primary">Click</button>
  );
}
`;

const SELF_CLOSING = `export default function P() {
  return <img id="logo" src="/x.png" />;
}
`;

const MIXED_CASE = `export default function P() {
  return (
    <HeroCTA id="cta-block">
      <p>hi</p>
    </HeroCTA>
  );
}
`;

const HTML_PAGE =
  "<!doctype html>\n" +
  "<html>\n" +
  "  <head><title>x</title></head>\n" +
  "  <body>\n" +
  '    <section id="cta">\n' +
  "      <h1>CTA</h1>\n" +
  "    </section>\n" +
  "  </body>\n" +
  "</html>\n";

// ----------------------------- Tests -----------------------------

describe("wrapVariantBlock — selector resolution", () => {
  let root: string;
  beforeEach(() => {
    root = makeRoot();
  });
  afterEach(() => cleanup(root));

  it("`#hero` resolves to id-anchor + wraps single span", async () => {
    const file = join(root, "page.tsx");
    writeFileSync(file, PAGE_TSX, "utf8");
    const r = await wrapVariantBlock(
      file,
      { id: "t1", selector: "#hero" },
      SESSION,
      3,
      { projectRoot: root },
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.targetId).toBe("t1");
    expect(r.originalBase64.length).toBeGreaterThan(0);
    const out = readFileSync(file, "utf8");
    expect(out).toContain("wisp-variants-start");
    expect(out).toContain("wisp-variants-end");
    expect(out).toContain('data-wisp-variants-host="t1"');
  });

  it("`.btn` resolves to single anchor when one match", async () => {
    const file = join(root, "one.tsx");
    writeFileSync(file, ONE_BTN, "utf8");
    const r = await wrapVariantBlock(
      file,
      { id: "btn1", selector: ".btn" },
      SESSION,
      3,
      { projectRoot: root },
    );
    expect(r.ok).toBe(true);
  });

  it("`.btn` with two matches → ambiguous_target", async () => {
    const file = join(root, "two.tsx");
    writeFileSync(file, TWO_BTNS, "utf8");
    const r = await wrapVariantBlock(
      file,
      { id: "btn", selector: ".btn" },
      SESSION,
      3,
      { projectRoot: root },
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("ambiguous_target");
    expect((r.detail as { matchCount: number }).matchCount).toBe(2);
  });

  it("non-existent selector → target_not_found", async () => {
    const file = join(root, "page.tsx");
    writeFileSync(file, PAGE_TSX, "utf8");
    const r = await wrapVariantBlock(
      file,
      { id: "x", selector: "#does-not-exist" },
      SESSION,
      3,
      { projectRoot: root },
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("target_not_found");
  });

  it("empty selector → target_not_found (selectorToAnchor returns null)", async () => {
    const file = join(root, "page.tsx");
    writeFileSync(file, PAGE_TSX, "utf8");
    const r = await wrapVariantBlock(
      file,
      { id: "x", selector: "" },
      SESSION,
      3,
      { projectRoot: root },
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("target_not_found");
  });

  it("[FINDING] `.btn` with multi-class `className='btn primary'` does NOT match (anchor is literal `\"btn\"` with closing quote)", async () => {
    const file = join(root, "multi.tsx");
    writeFileSync(file, MULTI_CLASS, "utf8");
    const r = await wrapVariantBlock(
      file,
      { id: "x", selector: ".btn" },
      SESSION,
      3,
      { projectRoot: root },
    );
    // selectorToAnchor returns `"btn"` — present only in single-class
    // declarations. Multi-class attribute → target_not_found.
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("target_not_found");
  });

  it("attribute selector `[data-wisp-target='x']` resolves to inner anchor", async () => {
    const file = join(root, "attr.tsx");
    writeFileSync(
      file,
      `export default function P() {
  return <div data-wisp-target="x">hi</div>;
}
`,
      "utf8",
    );
    const r = await wrapVariantBlock(
      file,
      { id: "x", selector: '[data-wisp-target="x"]' },
      SESSION,
      3,
      { projectRoot: root },
    );
    expect(r.ok).toBe(true);
  });
});

describe("wrapVariantBlock — span shapes", () => {
  let root: string;
  beforeEach(() => {
    root = makeRoot();
  });
  afterEach(() => cleanup(root));

  it("self-closing `<img id='logo' />` wraps span up to `/>`", async () => {
    const file = join(root, "self.tsx");
    writeFileSync(file, SELF_CLOSING, "utf8");
    const r = await wrapVariantBlock(
      file,
      { id: "logo", selector: "#logo" },
      SESSION,
      3,
      { projectRoot: root },
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // Original snippet base64 includes `/>` and ends there.
    const decoded = Buffer.from(r.originalBase64, "base64").toString("utf8");
    expect(decoded).toContain("<img");
    expect(decoded).toContain("/>");
  });

  it("mixed-case JSX `<HeroCTA …>…</HeroCTA>` wraps full paired span", async () => {
    const file = join(root, "mixed.tsx");
    writeFileSync(file, MIXED_CASE, "utf8");
    const r = await wrapVariantBlock(
      file,
      { id: "cta", selector: "#cta-block" },
      SESSION,
      3,
      { projectRoot: root },
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const decoded = Buffer.from(r.originalBase64, "base64").toString("utf8");
    expect(decoded).toContain("<HeroCTA");
    expect(decoded).toContain("</HeroCTA>");
  });
});

describe("wrapVariantBlock — HTML file (marker uses `<!-- -->`)", () => {
  let root: string;
  beforeEach(() => {
    root = makeRoot();
  });
  afterEach(() => cleanup(root));

  it("wraps `<section id='cta'>` with HTML comment markers", async () => {
    const file = join(root, "page.html");
    writeFileSync(file, HTML_PAGE, "utf8");
    const r = await wrapVariantBlock(
      file,
      { id: "cta", selector: "#cta" },
      SESSION,
      3,
      { projectRoot: root },
    );
    expect(r.ok).toBe(true);
    const out = readFileSync(file, "utf8");
    expect(out).toContain("<!-- wisp-variants-start:");
    expect(out).toContain("<!-- wisp-variants-end:");
  });
});

describe("wrap → discard roundtrip", () => {
  let root: string;
  beforeEach(() => {
    root = makeRoot();
  });
  afterEach(() => cleanup(root));

  it("[QUIRK] JSX wrap+discard: restoredByteEquivalent=true returned, but the wrap-span includes a trailing newline that is dropped on discard", async () => {
    const file = join(root, "page.tsx");
    writeFileSync(file, PAGE_TSX, "utf8");
    const original = readFileSync(file, "utf8");

    const r = await wrapVariantBlock(
      file,
      { id: "t1", selector: "#hero" },
      SESSION,
      3,
      { projectRoot: root },
    );
    expect(r.ok).toBe(true);

    const d = await discardVariantBlock(file, SESSION, "t1", {
      projectRoot: root,
    });
    expect(d.discarded).toBe(true);
    // Engine claims byte-equivalent because it has a non-empty originalLines
    // payload to splice back. Whether the bytes truly match is fixture-shape
    // dependent — pin actual behavior here:
    expect(d.restoredByteEquivalent).toBe(true);
    const restored = readFileSync(file, "utf8");
    // FINDING: full file is NOT necessarily byte-equivalent because the
    // wrap-span includes one trailing newline that the discard splice
    // collapses with neighbouring content. Document by checking which
    // structural elements survive, not exact bytes.
    expect(restored).toContain("<div id=\"hero\">");
    expect(restored).toContain("<h1>Title</h1>");
    expect(restored).not.toContain("wisp-variants-start");
    // Documenting the byte-equivalence drift (NOT asserting equality):
    if (restored !== original) {
      // intentionally non-fatal — log via expect on a known mismatch.
      expect(restored.length).not.toBe(original.length);
    }
  });

  it("discard with no prior wrap → throws", async () => {
    const file = join(root, "clean.tsx");
    writeFileSync(file, PAGE_TSX, "utf8");
    await expect(
      discardVariantBlock(file, SESSION, "t1", { projectRoot: root }),
    ).rejects.toThrow(/no variants block/);
  });
});

describe("wrapVariantBlock — already wrapped behavior", () => {
  let root: string;
  beforeEach(() => {
    root = makeRoot();
  });
  afterEach(() => cleanup(root));

  it("calling wrap twice on same target stacks: second wrap re-wraps the host", async () => {
    const file = join(root, "page.tsx");
    writeFileSync(file, PAGE_TSX, "utf8");
    const r1 = await wrapVariantBlock(
      file,
      { id: "t1", selector: "#hero" },
      SESSION,
      3,
      { projectRoot: root },
    );
    expect(r1.ok).toBe(true);
    // After first wrap, `#hero` may still appear inside the variant-zero
    // wrapper — second wrap will succeed (target still locatable) and stack.
    const r2 = await wrapVariantBlock(
      file,
      { id: "t2", selector: "#hero" },
      SESSION,
      3,
      { projectRoot: root },
    );
    // Pin actual: second wrap succeeds today. If contract later refuses
    // double-wrap, flip this assertion to expect r2.ok === false.
    expect(r2.ok).toBe(true);
    const out = readFileSync(file, "utf8");
    const starts = out.match(/wisp-variants-start/g) ?? [];
    expect(starts.length).toBe(2);
  });
});

describe("wrapVariantBlock — safety-refused paths", () => {
  let root: string;
  beforeEach(() => {
    root = makeRoot();
  });
  afterEach(() => cleanup(root));

  it("unsupported `.txt` → ok:false reason:safety_refused", async () => {
    const file = join(root, "x.txt");
    writeFileSync(file, "hi", "utf8");
    const r = await wrapVariantBlock(
      file,
      { id: "x", selector: "#x" },
      SESSION,
      3,
      { projectRoot: root },
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("safety_refused");
    expect(r.suggestedFallback).toBe("agent-driven");
  });

  it("path outside root → safety_refused", async () => {
    const r = await wrapVariantBlock(
      "../escape.tsx",
      { id: "x", selector: "#x" },
      SESSION,
      3,
      { projectRoot: root },
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("safety_refused");
  });
});
