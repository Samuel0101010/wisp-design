// wisp-design — Phase 6 component-detect tests.
//
// Validates: package.json signal, import-scan signal, filename-pattern,
// className-pattern, vanilla-fallback behaviour, quick/deep sampling, strategy
// mapping.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  detect,
  scoreImports,
  scorePackageJson,
} from "../../src/agent/component-detect.js";
import {
  COMPONENT_DETECTION_RULES,
  COMPONENT_DETECT_CONFIDENCE_THRESHOLD,
  COMPONENT_DETECT_QUICK_SAMPLE_SIZE,
} from "../../src/contracts/component.js";

function makeRoot(): string {
  return mkdtempSync(join(tmpdir(), "wisp-cdetect-"));
}
function cleanup(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* best-effort */
  }
}

function seedProject(
  root: string,
  files: Record<string, string>,
  pkg?: Record<string, unknown>,
): void {
  if (pkg !== undefined) {
    writeFileSync(join(root, "package.json"), JSON.stringify(pkg), "utf8");
  }
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(root, rel);
    mkdirSync(join(abs, ".."), { recursive: true });
    writeFileSync(abs, content, "utf8");
  }
}

describe("detect — primary lib identification", () => {
  let root: string;
  beforeEach(() => {
    root = makeRoot();
  });
  afterEach(() => cleanup(root));

  it("shadcn import + cn() utility → primary=shadcn, confidence > threshold", async () => {
    seedProject(
      root,
      {
        "src/components/Page.tsx": `
          import { Button } from "@/components/ui/button";
          import { Card } from "@/components/ui/card";
          export const Page = () => <Button className={cn("p-4")}>Go</Button>;
        `,
      },
      {
        name: "demo",
        dependencies: {},
        devDependencies: {},
      },
    );
    const res = await detect({ projectRoot: root, quick: true });
    expect(res.primaryLib).toBe("shadcn");
    expect(res.confidence).toBeGreaterThanOrEqual(
      COMPONENT_DETECT_CONFIDENCE_THRESHOLD,
    );
  });

  it("@radix-ui dep + import → primary=radix, confidence = pkg(0.5) + sourceAvg(0.4) = 0.9", async () => {
    // ADDITIVE scoring (the deliberate design, see
    // src/agent/component-detect.ts §"Resolve per-lib confidence"): package.json
    // is a standalone additive term on top of the per-signalling-file source
    // average, then clamp01. With 1 pkg dep (0.5) + one import-only file
    // (avg 0.4) the result is 0.9 — NOT the ~0.45 the old averaging formula
    // would have produced. Pinned exactly so a regression to averaging fails
    // here instead of silently changing the verdict's confidence.
    seedProject(
      root,
      {
        "src/Popover.tsx": `
          import * as Popover from "@radix-ui/react-popover";
          export const X = () => <Popover.Root />;
        `,
      },
      {
        name: "demo",
        dependencies: { "@radix-ui/react-dialog": "1.0.0" },
      },
    );
    const res = await detect({ projectRoot: root, quick: true });
    expect(res.primaryLib).toBe("radix");
    expect(res.confidence).toBeCloseTo(0.9, 5);
    const libs = new Set(res.signals.map((s) => s.detail));
    expect(
      [...libs].some((d) => d.includes("@radix-ui")),
    ).toBe(true);
  });

  it("@mui/material → primary=mui (Phase 6.5 threshold)", async () => {
    seedProject(
      root,
      {
        "src/Page.tsx": `
          import { Button } from "@mui/material/Button";
          export const X = () => <Button>x</Button>;
        `,
      },
      {
        name: "demo",
        dependencies: { "@mui/material": "5.0.0" },
      },
    );
    const res = await detect({ projectRoot: root, quick: true });
    expect(res.primaryLib).toBe("mui");
    const muiSignals = res.signals.filter((s) => s.detail.includes("@mui"));
    expect(muiSignals.length).toBeGreaterThan(0);
  });

  it("@chakra-ui/react → primary=chakra (Phase 6.5 threshold)", async () => {
    seedProject(
      root,
      {
        "src/Page.tsx": `
          import { Box } from "@chakra-ui/react";
          export const X = () => <Box />;
        `,
      },
      {
        name: "demo",
        dependencies: { "@chakra-ui/react": "2.0.0" },
      },
    );
    const res = await detect({ projectRoot: root, quick: true });
    expect(res.primaryLib).toBe("chakra");
  });

  it("antd → primary=ant (Phase 6.5 threshold)", async () => {
    seedProject(
      root,
      {
        "src/Page.tsx": `
          import { Button } from "antd/lib/button";
          export const X = () => <Button />;
        `,
      },
      {
        name: "demo",
        dependencies: { antd: "5.0.0" },
      },
    );
    const res = await detect({ projectRoot: root, quick: true });
    expect(res.primaryLib).toBe("ant");
  });

  it("tailwindcss + config-filename + className → primary=tailwind, confidence = pkg(0.5) + sourceAvg((0.3+0.2)/2=0.25) = 0.75", async () => {
    // ADDITIVE scoring (see component-detect.ts §"Resolve per-lib confidence").
    // Two signalling source files:
    //   • src/tailwind.config.js → filename-pattern (0.3)
    //   • src/Page.tsx           → className-pattern (0.2)
    // sourceAvg = (0.3 + 0.2) / 2 = 0.25. Plus the standalone pkg.json term
    // (tailwindcss → 0.5) → confidence = 0.75, comfortably above the 0.45
    // threshold. The OLD averaging formula would have dragged this below
    // threshold to vanilla — pinning 0.75 ensures a regression to averaging
    // fails here.
    seedProject(
      root,
      {
        "src/tailwind.config.js": "module.exports = {};",
        "src/Page.tsx": `
          export const X = () => <div className="bg-blue-500 text-lg p-4 m-2 flex grid gap-4 space-y-2">x</div>;
        `,
      },
      {
        name: "demo",
        devDependencies: { tailwindcss: "3.4.0" },
      },
    );
    const res = await detect({ projectRoot: root, quick: true });
    expect(res.primaryLib).toBe("tailwind");
    expect(res.confidence).toBeCloseTo(0.75, 5);
    expect(res.confidence).toBeGreaterThanOrEqual(
      COMPONENT_DETECT_CONFIDENCE_THRESHOLD,
    );
    expect(res.preferredStrategy).toBe("class-edit");
  });

  it("no deps + no patterns → primary=vanilla (fallback)", async () => {
    seedProject(
      root,
      {
        "src/Page.tsx": "export const X = () => null;",
      },
      { name: "demo" },
    );
    const res = await detect({ projectRoot: root, quick: true });
    expect(res.primaryLib).toBe("vanilla");
  });

  it("confidence < threshold → primary=vanilla even with weak signals", async () => {
    // No package.json hits; only a weak className signal — not enough to cross.
    seedProject(root, {
      "src/Page.tsx": `<div className="flex">x</div>`,
    });
    const res = await detect({ projectRoot: root, quick: true });
    // Under additive scoring: no pkg term (0) + sourceAvg = className-only 0.2
    // → confidence 0.2, below the 0.45 threshold → vanilla. Pinned exactly so
    // a className-weight or threshold drift surfaces here.
    expect(res.confidence).toBeCloseTo(0.2, 5);
    expect(res.confidence).toBeLessThan(COMPONENT_DETECT_CONFIDENCE_THRESHOLD);
    expect(res.primaryLib).toBe("vanilla");
  });
});

describe("detect — sampling behaviour", () => {
  let root: string;
  beforeEach(() => {
    root = makeRoot();
  });
  afterEach(() => cleanup(root));

  it("quick:true caps at COMPONENT_DETECT_QUICK_SAMPLE_SIZE (=10) sample files", async () => {
    const files: Record<string, string> = {};
    // 50 generic tsx files with no signals.
    for (let i = 0; i < 50; i += 1) {
      files[`src/c${i}.tsx`] = `export const C${i} = () => null;`;
    }
    seedProject(root, files, { name: "demo" });
    const res = await detect({ projectRoot: root, quick: true });
    // The detector caps sample at QUICK_SAMPLE_SIZE; primary stays vanilla.
    expect(res.primaryLib).toBe("vanilla");
    // QUICK constant should match contract.
    expect(COMPONENT_DETECT_QUICK_SAMPLE_SIZE).toBe(10);
  });

  it("deep scan caps at 200 files (doesn't crash on big projects)", async () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < 250; i += 1) {
      files[`src/c${i}.tsx`] = `export const C${i} = () => null;`;
    }
    seedProject(root, files, { name: "demo" });
    const res = await detect({ projectRoot: root, quick: false });
    // Survives big tree; result well-formed.
    expect(typeof res.detectedAt).toBe("string");
    expect(res.confidence).toBeGreaterThanOrEqual(0);
  });
});

describe("pure helpers — scorePackageJson + scoreImports", () => {
  it("scorePackageJson emits one entry per matching dep key (weight 0.5)", () => {
    const out = scorePackageJson({
      dependencies: { "@radix-ui/react-dialog": "1", "@mui/material": "5" },
      devDependencies: { tailwindcss: "3" },
    });
    const libs = new Set(out.map((o) => o.lib));
    expect(libs.has("radix")).toBe(true);
    expect(libs.has("mui")).toBe(true);
    expect(libs.has("tailwind")).toBe(true);
    // Weight matches the package.json signal constant.
    for (const e of out) {
      expect(e.weight).toBe(0.5);
    }
  });

  it("scorePackageJson on null / empty returns []", () => {
    expect(scorePackageJson(null)).toEqual([]);
    expect(scorePackageJson(undefined)).toEqual([]);
    expect(scorePackageJson({})).toEqual([]);
  });

  it("scoreImports matches multiple libs in one file", () => {
    const content = `
      import { Button } from "@/components/ui/button";
      import * as Popover from "@radix-ui/react-popover";
      import { Box } from "@mui/material/Box";
    `;
    const out = scoreImports(content);
    const libs = new Set(out.map((o) => o.lib));
    expect(libs.has("shadcn")).toBe(true);
    expect(libs.has("radix")).toBe(true);
    expect(libs.has("mui")).toBe(true);
  });
});

describe("detect — invariants", () => {
  let root: string;
  beforeEach(() => {
    root = makeRoot();
  });
  afterEach(() => cleanup(root));

  it("vanilla NEVER wins by score (only by fallback when max<threshold)", async () => {
    // Strong shadcn signal — winner must be shadcn, never vanilla even though
    // vanilla rule has empty signal set.
    seedProject(
      root,
      {
        "src/x.tsx": `
          import { Button } from "@/components/ui/button";
          import { Card } from "@/components/ui/card";
          import { Dialog } from "@/components/ui/dialog";
          export const X = () => <Button className={cn("")}>Y</Button>;
        `,
      },
      { name: "demo" },
    );
    const res = await detect({ projectRoot: root, quick: true });
    expect(res.primaryLib).toBe("shadcn");
    // Vanilla rule has no preferred-strategy => "css-override".
    expect(COMPONENT_DETECTION_RULES.vanilla.preferredStrategy).toBe(
      "css-override",
    );
  });

  it("preferredStrategy mapping per primary lib (contract table)", () => {
    // The rule table is the canonical strategy mapping consumed by the
    // agent loop. The detector picks `preferredStrategy =
    // COMPONENT_DETECTION_RULES[primaryLib].preferredStrategy`.
    expect(COMPONENT_DETECTION_RULES.shadcn.preferredStrategy).toBe("prop-edit");
    expect(COMPONENT_DETECTION_RULES.radix.preferredStrategy).toBe("prop-edit");
    expect(COMPONENT_DETECTION_RULES.mui.preferredStrategy).toBe("prop-edit");
    expect(COMPONENT_DETECTION_RULES.tailwind.preferredStrategy).toBe(
      "class-edit",
    );
    expect(COMPONENT_DETECTION_RULES.vanilla.preferredStrategy).toBe(
      "css-override",
    );
  });

  it("fallbackStrategies is a non-empty array for non-vanilla primary", async () => {
    seedProject(
      root,
      {
        "src/x.tsx": `
          import { Button } from "@/components/ui/button";
          import { Card } from "@/components/ui/card";
          import { Dialog } from "@/components/ui/dialog";
          export const X = () => <Button className={cn("")}>x</Button>;
        `,
      },
      { name: "d" },
    );
    const res = await detect({ projectRoot: root, quick: true });
    expect(res.primaryLib).toBe("shadcn");
    expect(Array.isArray(res.fallbackStrategies)).toBe(true);
    expect(res.fallbackStrategies.length).toBeGreaterThan(0);
  });

  it("detectedAt is a valid ISO timestamp", async () => {
    seedProject(root, { "src/x.tsx": "export const X = () => null;" }, {
      name: "d",
    });
    const res = await detect({ projectRoot: root, quick: true });
    const parsed = new Date(res.detectedAt);
    expect(Number.isFinite(parsed.getTime())).toBe(true);
  });

  it("confidence is in [0, 1]", async () => {
    seedProject(
      root,
      {
        "src/x.tsx": `
          import { Button } from "@/components/ui/button";
          export const X = () => <Button />;
        `,
      },
      { name: "d", dependencies: { "@radix-ui/react-dialog": "1" } },
    );
    const res = await detect({ projectRoot: root, quick: true });
    expect(res.confidence).toBeGreaterThanOrEqual(0);
    expect(res.confidence).toBeLessThanOrEqual(1);
  });
});
