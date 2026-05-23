#!/usr/bin/env node

// src/contracts/session.ts
import { z as z2 } from "zod";

// src/contracts/source.ts
import { z } from "zod";
var SourceFileTypeSchema = z.enum([
  "tsx",
  "jsx",
  "html",
  "vue",
  "svelte",
  "css"
]);
var MarkerKindSchema = z.enum([
  "inject-start",
  "inject-end",
  "variants-start",
  "variants-end",
  "style-start",
  "style-end"
]);
var MarkerGroupSchema = z.enum(["inject", "variants", "style"]);
var InjectMarkerSchema = z.object({
  injectId: z.string().min(1),
  // ULID or UUID
  insertedAt: z.string(),
  // ISO timestamp
  bridgeUrl: z.string().url(),
  token: z.string().uuid(),
  // SHA256 hex of the original first 256 bytes of the file (before inject).
  // `removeLiveScript` recomputes the hash AFTER stripping the inject and
  // refuses if it doesn't match — protects against partial edits.
  beforeHash: z.string().regex(/^[0-9a-f]{64}$/i),
  scriptSrc: z.string().url().optional(),
  inline: z.boolean().default(false)
});
var VariantBlockMarkerSchema = z.object({
  sessionId: z.string().min(1),
  targetId: z.string().min(1),
  wrappedAt: z.string(),
  // ISO
  variantCount: z.number().int().min(1).max(8),
  originalLines: z.string()
  // base64 of the wrapped original snippet
});
var StyleBlockMarkerSchema = z.object({
  sessionId: z.string().min(1),
  targetId: z.string().min(1),
  // `@scope` selector base (without the `[data-wisp-variant="N"]` index).
  // Lets carbonize rewrite scope rules into permanent selectors targeting
  // the accepted variant's host.
  scopeBase: z.string().min(1)
});
var MarkerBlockSchema = z.object({
  startLine: z.number().int().min(0),
  endLine: z.number().int().min(0),
  startOffset: z.number().int().min(0),
  endOffset: z.number().int().min(0),
  group: MarkerGroupSchema,
  // Parsed `k=v` pairs from the OPEN marker. Decoded via `decodeURIComponent`.
  payload: z.record(z.string(), z.string())
});
var InjectOptionsSchema = z.object({
  bridgeUrl: z.string().url(),
  token: z.string().uuid(),
  // If true, the marker payload sets `inline=true` and the injected element
  // is `<script>…inline body…</script>`; otherwise it's
  // `<script src="${bridgeUrl}/live.js?token=${token}">`. Inline form is used
  // by tests; production always uses the src form.
  inline: z.boolean().default(false),
  // Where to splice the script tag. JSX/TSX: just inside `<head>` if present,
  // else at top of the file's first top-level JSX expression. HTML/Vue/Svelte:
  // before `</head>`. CSS: rejected by safetyCheck — CSS cannot host a script.
  preferredAnchor: z.enum(["before-head-close", "after-head-open", "auto"]).default("auto"),
  // Optional caller-supplied injectId; useful for tests that need determinism.
  injectId: z.string().min(1).optional()
});
var AcceptOperationSchema = z.object({
  filePath: z.string().min(1),
  sessionId: z.string().min(1),
  targetId: z.string().min(1),
  variantId: z.string().min(1),
  // The full variant CSS (the `@scope ([data-wisp-variant="N"]) { … }` body).
  // The agent supplies this; the engine does not re-fetch it.
  variantCss: z.string(),
  // CSS-var overrides accumulated from slider tuning. Keys must match the
  // `--name` form; values are baked literal into the carbonized output.
  paramOverrides: z.record(z.string(), z.string()).default({}),
  // If false: leave the `@scope` rule verbatim (debugging mode). Default true:
  // rewrite the rule into permanent selectors targeting the chosen variant's
  // host node.
  carbonize: z.boolean().default(true),
  // Optional override of the auto-detected EOL convention. Default = detect.
  eolConvention: z.enum(["\n", "\r\n", "\r"]).optional()
});
var DiscardOperationSchema = z.object({
  filePath: z.string().min(1),
  sessionId: z.string().min(1),
  targetId: z.string().min(1)
});
var SafetyErrorCodeSchema = z.enum([
  "PATH_OUTSIDE_ROOT",
  "REFUSE_LIST_MATCH",
  // dist/, .next/, node_modules/, etc.
  "GENERATED_MAGIC_COMMENT",
  // `@generated` in first 200 bytes
  "BINARY_FILE",
  // not utf-8 decodable
  "FILE_TOO_LARGE",
  // > MAX_SOURCE_FILE_BYTES
  "UNSUPPORTED_FILE_TYPE",
  // extension not in SUPPORTED_EXTENSIONS
  "READ_ONLY_FILE",
  // fs.access W_OK rejected
  "SYMLINK_ESCAPE"
  // realpath resolves outside projectRoot
]);
var UndoEntryKindSchema = z.enum([
  "inject-script",
  "remove-script",
  "wrap-variants",
  "discard-variants",
  "accept-variant",
  "param-change",
  "safety-refused"
]);
var UndoEntrySchema = z.object({
  ts: z.string(),
  // ISO timestamp
  sessionId: z.string().min(1),
  kind: UndoEntryKindSchema,
  filePath: z.string().min(1),
  detail: z.record(z.string(), z.unknown()).optional(),
  // Hex SHA256 of the file before / after the operation. `safety-refused`
  // entries omit both. `param-change` omits `afterHash` (the param change is
  // a runtime DOM update; no file mutation has happened yet).
  beforeSha256: z.string().regex(/^[0-9a-f]{64}$/i).optional(),
  afterSha256: z.string().regex(/^[0-9a-f]{64}$/i).optional()
});

// src/contracts/session.ts
var SessionEventKindSchema = z2.enum([
  // Inherit Phase-3 file-op kinds verbatim.
  ...UndoEntryKindSchema.options,
  // Phase-6 session-level kinds.
  "session-start",
  "session-end",
  "pick",
  "configure",
  "variants-emitted",
  "cycle-active-changed",
  "param-changed",
  "annotation-added",
  "verify-report",
  "policy-proposal-shown",
  "policy-proposal-accepted",
  "policy-proposal-declined",
  "morph-engaged",
  "structure-variant-emitted",
  "component-lib-detected"
]);
var SessionEventEntrySchema = z2.object({
  ts: z2.string(),
  // ISO timestamp
  sessionId: z2.string().min(1),
  kind: SessionEventKindSchema,
  filePath: z2.string().optional(),
  detail: z2.record(z2.string(), z2.unknown()).optional(),
  beforeSha256: z2.string().regex(/^[0-9a-f]{64}$/i).optional(),
  afterSha256: z2.string().regex(/^[0-9a-f]{64}$/i).optional()
});
var PolicyAxisSchema = z2.enum([
  "hierarchy",
  "layout",
  "typography",
  "color",
  "density"
]);
var PolicyProposalSchema = z2.object({
  axis: PolicyAxisSchema,
  observation: z2.string().min(1),
  // human-readable: "3 high-density variants accepted in a row"
  proposed: z2.string().min(1),
  // proposed change: "add density: 'generous' to .wisp/policy.md"
  evidence: z2.array(
    z2.object({
      ts: z2.string(),
      variantId: z2.string().min(1),
      primaryAxis: PolicyAxisSchema
    })
  ),
  triggerThreshold: z2.number().int().min(2).default(3)
});
var PolicyDocumentSchema = z2.object({
  axes: z2.record(PolicyAxisSchema, z2.string().min(1)).default({}),
  acceptedAt: z2.string(),
  source: z2.enum(["user-confirmed", "wisp-proposed-then-confirmed"])
});
var MORPH_T_MIN = 0;
var MORPH_T_MAX = 1;
var MorphVariableDiffSchema = z2.object({
  name: z2.string().regex(/^--[a-z][a-z0-9-]*$/i, "must be a CSS custom property"),
  valueA: z2.string(),
  valueB: z2.string(),
  interpolatable: z2.boolean(),
  unit: z2.string().optional()
});
var MorphSourceSchema = z2.object({
  variantIdA: z2.string().min(1),
  variantIdB: z2.string().min(1),
  // Auto-extracted diff of CSS-vars between A and B.
  variableDiff: z2.array(MorphVariableDiffSchema)
});
var MorphConfigSchema = z2.object({
  source: MorphSourceSchema,
  t: z2.number().min(MORPH_T_MIN).max(MORPH_T_MAX),
  interpolatedCss: z2.string()
});
var StructureVariantKindSchema = z2.enum([
  "as-is",
  // baseline = original JSX (always present so the user can revert without re-pick)
  "two-col-split",
  // 2-column layout
  "card-layout",
  // wrap children in card components
  "stacked-vertical",
  // simple vertical stack
  "horizontal-row",
  // row layout
  "hero-style",
  // hero treatment (large primary)
  "sidebar-left",
  "sidebar-right"
]);
var STRUCTURE_VARIANT_RATIONALE_MAX_LEN = 180;
var StructureVariantSpecSchema = z2.object({
  kind: StructureVariantKindSchema,
  rationale: z2.string().min(1).max(STRUCTURE_VARIANT_RATIONALE_MAX_LEN),
  // Full JSX subtree as a STRING — agent-emitted. Lives in a markdown-fenced
  // block during transport; the source-edit layer parses it as the raw
  // replacement payload.
  jsx: z2.string().min(1),
  // CSS to inject alongside (optional — purely structural variants may have
  // no CSS; tied to the JSX via the structure-variant-emitted log entry).
  css: z2.string().default("")
});

// src/source/structure-variant-mode.ts
var TEMPLATES = {
  "as-is": (originalJsx) => ({
    jsx: originalJsx,
    css: "",
    rationale: "Baseline \u2014 original markup unchanged for easy revert."
  }),
  "two-col-split": (originalJsx) => {
    const { left, right } = splitJsxIntoHalves(originalJsx);
    return {
      jsx: `<div className="grid grid-cols-2 gap-8">
  <div>
${indentLines(left, "    ")}
  </div>
  <div>
${indentLines(right, "    ")}
  </div>
</div>`,
      css: "",
      rationale: "Two-column split \u2014 relieves vertical density, useful when the original block has 2 sibling sections."
    };
  },
  "card-layout": (originalJsx) => {
    const { left: header, right: content } = splitJsxIntoHalves(originalJsx);
    const haveSplit = header.trim().length > 0 && content.trim().length > 0;
    const body = haveSplit ? `  <CardHeader>
${indentLines(header, "    ")}
  </CardHeader>
  <CardContent>
${indentLines(content, "    ")}
  </CardContent>` : `  <CardContent>
${indentLines(originalJsx, "    ")}
  </CardContent>`;
    return {
      jsx: `<Card className="p-6">
${body}
</Card>`,
      css: "",
      rationale: "Card wrap \u2014 groups content into a self-contained surface; assumes the project provides Card primitives (shadcn/Radix/MUI)."
    };
  },
  "stacked-vertical": (originalJsx) => ({
    jsx: `<div className="flex flex-col gap-6">
${indentLines(originalJsx, "  ")}
</div>`,
    css: "",
    rationale: "Vertical stack \u2014 explicit gap rhythm replaces ad-hoc margin stacking."
  }),
  "horizontal-row": (originalJsx) => ({
    jsx: `<div className="flex flex-row items-center gap-4">
${indentLines(originalJsx, "  ")}
</div>`,
    css: "",
    rationale: "Horizontal row \u2014 converts a vertical block into a single-row layout (good for header bars, action toolbars)."
  }),
  "hero-style": (originalJsx) => {
    const { left: primary, right: secondary } = splitJsxIntoHalves(originalJsx);
    const haveSplit = primary.trim().length > 0 && secondary.trim().length > 0;
    if (!haveSplit) {
      return {
        jsx: `<div className="flex flex-col gap-6">
  <h1 className="text-6xl font-bold tracking-tight">
${indentLines(originalJsx, "    ")}
  </h1>
</div>`,
        css: "",
        rationale: "Hero treatment \u2014 promotes the primary text node to a 6xl heading; collapse if no clear primary text exists."
      };
    }
    return {
      jsx: `<div className="flex flex-col gap-6">
  <h1 className="text-6xl font-bold tracking-tight">
${indentLines(primary, "    ")}
  </h1>
  <div className="text-lg text-muted-foreground">
${indentLines(secondary, "    ")}
  </div>
</div>`,
      css: "",
      rationale: "Hero treatment \u2014 promotes primary text to 6xl, secondary content reads as supporting paragraph."
    };
  },
  "sidebar-left": (originalJsx) => {
    const { left, right } = splitJsxIntoHalves(originalJsx);
    return {
      jsx: `<div className="grid grid-cols-[200px_1fr] gap-6">
  <aside>
${indentLines(left, "    ")}
  </aside>
  <main>
${indentLines(right, "    ")}
  </main>
</div>`,
      css: "",
      rationale: "Left sidebar \u2014 fixed 200px column for nav/aside content, primary column fills the rest."
    };
  },
  "sidebar-right": (originalJsx) => {
    const { left, right } = splitJsxIntoHalves(originalJsx);
    return {
      jsx: `<div className="grid grid-cols-[1fr_200px] gap-6">
  <main>
${indentLines(left, "    ")}
  </main>
  <aside>
${indentLines(right, "    ")}
  </aside>
</div>`,
      css: "",
      rationale: "Right sidebar \u2014 primary content first, 200px secondary column on the right for meta/related links."
    };
  }
};
async function generateStructureVariants(req) {
  const originalJsx = req.target.originalJsx ?? "";
  const variants = [];
  const seen = /* @__PURE__ */ new Set();
  const kinds = [];
  for (const k of req.requestedKinds) {
    if (seen.has(k)) continue;
    seen.add(k);
    kinds.push(k);
  }
  for (const kind of kinds) {
    const template = TEMPLATES[kind];
    let spec;
    try {
      spec = template(originalJsx);
    } catch (err) {
      spec = {
        jsx: originalJsx,
        css: "",
        rationale: `Template ${kind} failed (${err.message ?? "unknown"}); falling back to as-is.`
      };
    }
    const rationale = truncateRationale(spec.rationale);
    variants.push({
      kind,
      rationale,
      jsx: spec.jsx,
      css: spec.css
    });
  }
  return {
    variants,
    generatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
function splitJsxIntoHalves(jsx) {
  const input = jsx ?? "";
  if (input.length === 0) return { left: "", right: "" };
  const childrenStart = findChildrenStart(input);
  if (childrenStart === -1) {
    const mid = Math.floor(input.length / 2);
    return { left: input.slice(0, mid), right: input.slice(mid) };
  }
  const childrenEnd = findChildrenEnd(input);
  if (childrenEnd === -1 || childrenEnd <= childrenStart) {
    return { left: input, right: "" };
  }
  const splitOffset = findFirstChildEnd(input, childrenStart, childrenEnd);
  if (splitOffset === -1 || splitOffset >= childrenEnd) {
    return { left: input, right: "" };
  }
  const left = input.slice(0, splitOffset).trimEnd();
  const right = input.slice(splitOffset).trimStart();
  return { left, right };
}
function findChildrenStart(jsx) {
  let i = 0;
  while (i < jsx.length && /\s/.test(jsx[i])) i += 1;
  if (jsx[i] !== "<") return -1;
  let inQuote = null;
  i += 1;
  while (i < jsx.length) {
    const ch = jsx[i];
    if (inQuote !== null) {
      if (ch === "\\" && i + 1 < jsx.length) {
        i += 2;
        continue;
      }
      if (ch === inQuote) inQuote = null;
      i += 1;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inQuote = ch;
      i += 1;
      continue;
    }
    if (ch === ">") {
      if (jsx[i - 1] === "/") return -1;
      return i + 1;
    }
    i += 1;
  }
  return -1;
}
function findChildrenEnd(jsx) {
  const lastClose = jsx.lastIndexOf("</");
  if (lastClose === -1) return -1;
  return lastClose;
}
function findFirstChildEnd(jsx, start, end) {
  let depth = 0;
  let i = start;
  let firstChildOpenAt = -1;
  let inQuote = null;
  while (i < end) {
    const ch = jsx[i];
    if (inQuote !== null) {
      if (ch === "\\" && i + 1 < end) {
        i += 2;
        continue;
      }
      if (ch === inQuote) inQuote = null;
      i += 1;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inQuote = ch;
      i += 1;
      continue;
    }
    if (ch === "<") {
      const isClose = jsx[i + 1] === "/";
      if (isClose) {
        if (depth === 0) {
          if (firstChildOpenAt !== -1) {
            const gt2 = jsx.indexOf(">", i);
            if (gt2 === -1) return -1;
            return gt2 + 1;
          }
          return -1;
        }
        depth -= 1;
        const gt = jsx.indexOf(">", i);
        if (gt === -1) return -1;
        if (depth === 0 && firstChildOpenAt !== -1) {
          return gt + 1;
        }
        i = gt + 1;
        continue;
      }
      if (depth === 0) {
        if (firstChildOpenAt === -1) firstChildOpenAt = i;
      }
      const closeGt = findOpenTagEnd(jsx, i, end);
      if (closeGt === -1) return -1;
      const isSelfClosing = jsx[closeGt - 1] === "/";
      if (isSelfClosing) {
        if (depth === 0 && firstChildOpenAt === i) {
          return closeGt + 1;
        }
      } else {
        depth += 1;
      }
      i = closeGt + 1;
      continue;
    }
    i += 1;
  }
  return -1;
}
function findOpenTagEnd(jsx, openIdx, hardEnd) {
  let i = openIdx + 1;
  let inQuote = null;
  while (i < hardEnd) {
    const ch = jsx[i];
    if (inQuote !== null) {
      if (ch === "\\" && i + 1 < hardEnd) {
        i += 2;
        continue;
      }
      if (ch === inQuote) inQuote = null;
      i += 1;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inQuote = ch;
      i += 1;
      continue;
    }
    if (ch === ">") return i;
    i += 1;
  }
  return -1;
}
function indentLines(s, pad) {
  return s.split("\n").map((l) => l.length === 0 ? l : pad + l).join("\n");
}
function truncateRationale(s) {
  if (s.length <= STRUCTURE_VARIANT_RATIONALE_MAX_LEN) return s;
  return `${s.slice(0, STRUCTURE_VARIANT_RATIONALE_MAX_LEN - 1)}\u2026`;
}
var structureVariantMode = {
  generateStructureVariants,
  splitJsxIntoHalves
};
export {
  generateStructureVariants,
  splitJsxIntoHalves,
  structureVariantMode
};
//# sourceMappingURL=structure-variant-mode.js.map