// wisp-design — Structure-variant generator (Phase 6, Improvement #6).
//
// Generates JSX-subtree replacements (NOT CSS-only overrides) for one picked
// element. Where CSS variants tune the appearance of a fixed subtree, structure
// variants emit DIFFERENT subtrees: a two-column split, a card wrap, a hero
// promotion, etc. The agent loop routes here when the user passes
// `--structural` on the configure event.
//
// Splice convention:
//   The Phase-3 marker wrap (src/source/wrap.ts) brackets a block with
//   `wisp-variants-start/end` markers. For structural variants we use the
//   SAME marker shape but the cycled content is `<div data-wisp-variant="N">
//   <STRUCTURAL_JSX_HERE></div>` — i.e. the whole subtree is the variant
//   body, not just an `@scope` CSS block. The marker payload's `kind:
//   "structural"` field is what tells `accept.ts` to treat the splice as a
//   subtree replacement rather than a CSS @scope carbonize.
//
// Defensive posture:
//   - `splitJsxIntoHalves` is heuristic; documented limitations below.
//   - Unknown `kind` → fallthrough to `as-is`.
//   - Malformed `originalJsx` → never throws; returns a sentinel rationale.

import {
  type StructureVariantKind,
  type StructureVariantRequest,
  type StructureVariantResponse,
  type StructureVariantSpec,
  STRUCTURE_VARIANT_RATIONALE_MAX_LEN,
} from "../contracts/session.js";

// ---------------------------------------------------------------------------
// Top-level template router. One function per kind.
// ---------------------------------------------------------------------------

type TemplateFn = (originalJsx: string) => Pick<
  StructureVariantSpec,
  "jsx" | "css" | "rationale"
>;

const TEMPLATES: Readonly<Record<StructureVariantKind, TemplateFn>> = {
  "as-is": (originalJsx) => ({
    jsx: originalJsx,
    css: "",
    rationale: "Baseline — original markup unchanged for easy revert.",
  }),
  "two-col-split": (originalJsx) => {
    const { left, right } = splitJsxIntoHalves(originalJsx);
    return {
      jsx:
        `<div className="grid grid-cols-2 gap-8">\n` +
        `  <div>\n${indentLines(left, "    ")}\n  </div>\n` +
        `  <div>\n${indentLines(right, "    ")}\n  </div>\n` +
        `</div>`,
      css: "",
      rationale:
        "Two-column split — relieves vertical density, useful when the original block has 2 sibling sections.",
    };
  },
  "card-layout": (originalJsx) => {
    // Try to peel off a likely heading + the rest as content. Heuristic: first
    // text-bearing child becomes header, rest is content. If the split fails,
    // the whole thing falls under CardContent.
    const { left: header, right: content } = splitJsxIntoHalves(originalJsx);
    const haveSplit = header.trim().length > 0 && content.trim().length > 0;
    const body = haveSplit
      ? `  <CardHeader>\n${indentLines(header, "    ")}\n  </CardHeader>\n` +
        `  <CardContent>\n${indentLines(content, "    ")}\n  </CardContent>`
      : `  <CardContent>\n${indentLines(originalJsx, "    ")}\n  </CardContent>`;
    return {
      jsx: `<Card className="p-6">\n${body}\n</Card>`,
      css: "",
      rationale:
        "Card wrap — groups content into a self-contained surface; assumes the project provides Card primitives (shadcn/Radix/MUI).",
    };
  },
  "stacked-vertical": (originalJsx) => ({
    jsx:
      `<div className="flex flex-col gap-6">\n${indentLines(originalJsx, "  ")}\n</div>`,
    css: "",
    rationale:
      "Vertical stack — explicit gap rhythm replaces ad-hoc margin stacking.",
  }),
  "horizontal-row": (originalJsx) => ({
    jsx:
      `<div className="flex flex-row items-center gap-4">\n${indentLines(originalJsx, "  ")}\n</div>`,
    css: "",
    rationale:
      "Horizontal row — converts a vertical block into a single-row layout (good for header bars, action toolbars).",
  }),
  "hero-style": (originalJsx) => {
    const { left: primary, right: secondary } = splitJsxIntoHalves(originalJsx);
    const haveSplit = primary.trim().length > 0 && secondary.trim().length > 0;
    if (!haveSplit) {
      return {
        jsx:
          `<div className="flex flex-col gap-6">\n` +
          `  <h1 className="text-6xl font-bold tracking-tight">\n${indentLines(originalJsx, "    ")}\n  </h1>\n` +
          `</div>`,
        css: "",
        rationale:
          "Hero treatment — promotes the primary text node to a 6xl heading; collapse if no clear primary text exists.",
      };
    }
    return {
      jsx:
        `<div className="flex flex-col gap-6">\n` +
        `  <h1 className="text-6xl font-bold tracking-tight">\n${indentLines(primary, "    ")}\n  </h1>\n` +
        `  <div className="text-lg text-muted-foreground">\n${indentLines(secondary, "    ")}\n  </div>\n` +
        `</div>`,
      css: "",
      rationale:
        "Hero treatment — promotes primary text to 6xl, secondary content reads as supporting paragraph.",
    };
  },
  "sidebar-left": (originalJsx) => {
    const { left, right } = splitJsxIntoHalves(originalJsx);
    return {
      jsx:
        `<div className="grid grid-cols-[200px_1fr] gap-6">\n` +
        `  <aside>\n${indentLines(left, "    ")}\n  </aside>\n` +
        `  <main>\n${indentLines(right, "    ")}\n  </main>\n` +
        `</div>`,
      css: "",
      rationale:
        "Left sidebar — fixed 200px column for nav/aside content, primary column fills the rest.",
    };
  },
  "sidebar-right": (originalJsx) => {
    const { left, right } = splitJsxIntoHalves(originalJsx);
    return {
      jsx:
        `<div className="grid grid-cols-[1fr_200px] gap-6">\n` +
        `  <main>\n${indentLines(left, "    ")}\n  </main>\n` +
        `  <aside>\n${indentLines(right, "    ")}\n  </aside>\n` +
        `</div>`,
      css: "",
      rationale:
        "Right sidebar — primary content first, 200px secondary column on the right for meta/related links.",
    };
  },
};

// ---------------------------------------------------------------------------
// generateStructureVariants — main entry point.
// ---------------------------------------------------------------------------

export async function generateStructureVariants(
  req: StructureVariantRequest,
): Promise<StructureVariantResponse> {
  const originalJsx = req.target.originalJsx ?? "";
  const variants: StructureVariantSpec[] = [];

  // Deduplicate requested kinds — order preserved; first wins.
  const seen = new Set<StructureVariantKind>();
  const kinds: StructureVariantKind[] = [];
  for (const k of req.requestedKinds) {
    if (seen.has(k)) continue;
    seen.add(k);
    kinds.push(k);
  }

  for (const kind of kinds) {
    const template = TEMPLATES[kind];
    let spec: Pick<StructureVariantSpec, "jsx" | "css" | "rationale">;
    try {
      spec = template(originalJsx);
    } catch (err) {
      spec = {
        jsx: originalJsx,
        css: "",
        rationale: `Template ${kind} failed (${(err as Error).message ?? "unknown"}); falling back to as-is.`,
      };
    }
    const rationale = truncateRationale(spec.rationale);
    variants.push({
      kind,
      rationale,
      jsx: spec.jsx,
      css: spec.css,
    });
  }

  return {
    variants,
    generatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// splitJsxIntoHalves — heuristic JSX splitter.
//
// Walks the input and tries to find the first balanced top-level child
// element. Splits the source into:
//   left  = everything up to (and including) the first major child element
//   right = everything after it
//
// Documented limitations:
//   - Brittle on deeply-nested JSX where the first child is a wrapping
//     fragment / div containing the actual interesting children.
//   - Doesn't understand JSX expressions (`{condition && <X />}`); they may
//     end up entirely on the left side.
//   - String children, comments, and whitespace are NOT considered "major"
//     children — only opening `<` of a top-level tag counts.
//   - When no major child element is found, returns `{ left: input, right: "" }`.
// ---------------------------------------------------------------------------

export function splitJsxIntoHalves(jsx: string): {
  left: string;
  right: string;
} {
  const input = jsx ?? "";
  if (input.length === 0) return { left: "", right: "" };

  // Locate the outermost opening tag (the wrapping element). Skip past its
  // attributes and find the position where its children START.
  const childrenStart = findChildrenStart(input);
  if (childrenStart === -1) {
    // No wrapping element — split at half-string boundary as a last resort.
    const mid = Math.floor(input.length / 2);
    return { left: input.slice(0, mid), right: input.slice(mid) };
  }
  // Locate the outermost closing tag (the wrapping element's end).
  const childrenEnd = findChildrenEnd(input);
  if (childrenEnd === -1 || childrenEnd <= childrenStart) {
    return { left: input, right: "" };
  }

  // Walk the children region: find the END of the FIRST top-level child
  // element. Split point = right after that element ends.
  const splitOffset = findFirstChildEnd(input, childrenStart, childrenEnd);
  if (splitOffset === -1 || splitOffset >= childrenEnd) {
    return { left: input, right: "" };
  }

  // Both sides include the WRAPPER's open/close so each half is independently
  // valid JSX-ish. For the structural-variant templates that's fine because
  // each template wraps the halves in its own structural element.
  const left = input.slice(0, splitOffset).trimEnd();
  const right = input.slice(splitOffset).trimStart();
  return { left, right };
}

// Find the offset just AFTER the outermost wrapper element's opening tag.
function findChildrenStart(jsx: string): number {
  let i = 0;
  // Skip leading whitespace.
  while (i < jsx.length && /\s/.test(jsx[i] as string)) i += 1;
  if (jsx[i] !== "<") return -1;
  // Walk forward until we close the opening tag with `>`. Respect quoted
  // attribute values so `>` inside an attribute doesn't trip us.
  let inQuote: '"' | "'" | null = null;
  i += 1;
  while (i < jsx.length) {
    const ch = jsx[i] as string;
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
      // Self-closing? Look back one char.
      if (jsx[i - 1] === "/") return -1; // self-closing → no children
      return i + 1;
    }
    i += 1;
  }
  return -1;
}

// Find the offset of the wrapping element's closing `</Tag>` (start position).
function findChildrenEnd(jsx: string): number {
  // Scan from the end backwards for the last `</` then verify it's the
  // outermost close. For our purposes a simple "last `</`" is good enough —
  // we already know the wrapping element exists.
  const lastClose = jsx.lastIndexOf("</");
  if (lastClose === -1) return -1;
  return lastClose;
}

// Walk forward from `start` to `end`. Track tag depth. Return the offset just
// AFTER the first top-level child element's close. A "top-level child" is one
// whose open `<` sits at depth-0 within the wrapper's children region.
function findFirstChildEnd(jsx: string, start: number, end: number): number {
  let depth = 0;
  let i = start;
  let firstChildOpenAt = -1;
  let inQuote: '"' | "'" | null = null;
  while (i < end) {
    const ch = jsx[i] as string;
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
          // We've hit a closing tag at depth 0 — should not happen in a
          // well-formed wrapper, but bail out at the previous element's end.
          if (firstChildOpenAt !== -1) {
            // Find `>` for this close and return one past it as the split point.
            const gt = jsx.indexOf(">", i);
            if (gt === -1) return -1;
            return gt + 1;
          }
          return -1;
        }
        depth -= 1;
        // Find the close's `>`.
        const gt = jsx.indexOf(">", i);
        if (gt === -1) return -1;
        // If returning to depth 0, this is the end of the first child element.
        if (depth === 0 && firstChildOpenAt !== -1) {
          return gt + 1;
        }
        i = gt + 1;
        continue;
      }
      // Opening tag.
      if (depth === 0) {
        if (firstChildOpenAt === -1) firstChildOpenAt = i;
      }
      // Find `>` while respecting attribute quotes.
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

function findOpenTagEnd(jsx: string, openIdx: number, hardEnd: number): number {
  let i = openIdx + 1;
  let inQuote: '"' | "'" | null = null;
  while (i < hardEnd) {
    const ch = jsx[i] as string;
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

// ---------------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------------

function indentLines(s: string, pad: string): string {
  return s
    .split("\n")
    .map((l) => (l.length === 0 ? l : pad + l))
    .join("\n");
}

function truncateRationale(s: string): string {
  if (s.length <= STRUCTURE_VARIANT_RATIONALE_MAX_LEN) return s;
  return `${s.slice(0, STRUCTURE_VARIANT_RATIONALE_MAX_LEN - 1)}…`;
}

// ---------------------------------------------------------------------------
// Module export
// ---------------------------------------------------------------------------

export const structureVariantMode = {
  generateStructureVariants,
  splitJsxIntoHalves,
};
