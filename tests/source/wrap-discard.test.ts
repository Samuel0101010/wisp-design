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
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";

function sha256(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

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

  it("`.btn` with multi-class `className='btn primary'` DOES match (Phase 7.0 class-set verification)", async () => {
    // Phase 7.0 fix: locateTargetSpan now parses each candidate element's
    // class attribute into a Set and verifies the selector's classes are a
    // SUBSET. Multi-class declarations are first-class, finally. The old
    // [FINDING] note (anchor was literal `"btn"` with closing quote) is
    // resolved by the new class-set matching path.
    const file = join(root, "multi.tsx");
    writeFileSync(file, MULTI_CLASS, "utf8");
    const r = await wrapVariantBlock(
      file,
      { id: "x", selector: ".btn" },
      SESSION,
      3,
      { projectRoot: root },
    );
    expect(r.ok).toBe(true);
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

  it("JSX wrap → discard restores the file byte-for-byte (Phase 7.13)", async () => {
    // Phase-7.13 byte-equivalence lock. The wrap appends a single `\n` to
    // the marker block, and `findMarkerBlock`'s endOffset accounts for it,
    // so splicing back `originalSnippet` reproduces pre-wrap content
    // exactly. The previous `[QUIRK]` assertion documented a non-existent
    // drift — that conditional is replaced with a strict equality lock.
    const file = join(root, "page.tsx");
    writeFileSync(file, PAGE_TSX, "utf8");
    const original = readFileSync(file, "utf8");
    const originalHash = sha256(original);

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
    expect(d.restoredByteEquivalent).toBe(true);

    const restored = readFileSync(file, "utf8");
    expect(restored).toBe(original);
    expect(sha256(restored)).toBe(originalHash);
  });

  it("HTML wrap → discard restores the file byte-for-byte (sha256 lock)", async () => {
    // Same byte-equivalence guarantee but on HTML (different marker syntax
    // — `<!-- … -->` instead of `{/* … */}`). Pins that the marker-finder
    // returns the same boundary semantics for HTML as for JSX.
    const file = join(root, "page.html");
    writeFileSync(file, HTML_PAGE, "utf8");
    const original = readFileSync(file, "utf8");
    const originalHash = sha256(original);

    const w = await wrapVariantBlock(
      file,
      { id: "cta", selector: "#cta" },
      SESSION,
      3,
      { projectRoot: root },
    );
    expect(w.ok).toBe(true);

    const d = await discardVariantBlock(file, SESSION, "cta", {
      projectRoot: root,
    });
    expect(d.discarded).toBe(true);
    expect(d.restoredByteEquivalent).toBe(true);

    const restored = readFileSync(file, "utf8");
    expect(sha256(restored)).toBe(originalHash);
    expect(restored).toBe(original);
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

describe("wrapVariantBlock — dynamic className JSX-expression fallback", () => {
  let root: string;
  beforeEach(() => {
    root = makeRoot();
  });
  afterEach(() => cleanup(root));

  it("`className={cn(...)}` → DYNAMIC_CLASSNAME error with agent-driven fallback", async () => {
    const file = join(root, "dyn.tsx");
    writeFileSync(
      file,
      `export default function P({ primary }: { primary: boolean }) {
  return (
    <button className={cn("btn", primary && "primary")}>Click</button>
  );
}
`,
      "utf8",
    );
    const r = await wrapVariantBlock(
      file,
      { id: "btn", selector: ".btn" },
      SESSION,
      3,
      { projectRoot: root },
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("dynamic_classname");
    expect(r.code).toBe("DYNAMIC_CLASSNAME");
    expect(r.suggestedFallback).toBe("agent-driven");
    expect(r.message).toMatch(/className=\{\.\.\.\} JSX expression at line \d+/);
    expect(r.message).toMatch(/agent-driven mode/);
  });

  it("static `class='btn primary'` still matches (control: non-JSX double-quoted)", async () => {
    const file = join(root, "static-html-style.tsx");
    writeFileSync(
      file,
      `export default function P() {
  return (
    <button class="btn primary">Click</button>
  );
}
`,
      "utf8",
    );
    const r = await wrapVariantBlock(
      file,
      { id: "btn", selector: ".btn" },
      SESSION,
      3,
      { projectRoot: root },
    );
    expect(r.ok).toBe(true);
  });

  it("static `className='btn primary'` still matches (control: JSX double-quoted)", async () => {
    const file = join(root, "static-jsx.tsx");
    writeFileSync(file, MULTI_CLASS, "utf8");
    const r = await wrapVariantBlock(
      file,
      { id: "btn", selector: ".btn" },
      SESSION,
      3,
      { projectRoot: root },
    );
    expect(r.ok).toBe(true);
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
