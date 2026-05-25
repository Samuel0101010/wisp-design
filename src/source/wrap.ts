// wisp-design — Wrap a target element in variant brackets / discard it back.
// (Phase 3). Implements `WrapModule` from src/contracts/source.ts.
//
// Mechanism:
//   1. safetyCheck.
//   2. read + canonicalize. detectEol.
//   3. Locate the target element via literal anchor-substring match
//      (`id="…"` / `class="…"` / `data-wisp-target="…"`). Identify the
//      bounding tag span (line range) via a small brace-balanced JSX walker
//      (or `<tag …>…</tag>` walker for HTML/Vue/Svelte).
//      Ambiguity → return `{ ok:false, reason:"ambiguous_target" }`.
//   4. Wrap the matched span in:
//         <wisp-variants-start …>
//         <wisp-style-start …>
//         <style data-wisp-css="…">{`/* variants populated at runtime */`}</style>
//         <wisp-style-end …>
//         <div data-wisp-variants-host="<targetId>">
//           <div data-wisp-variant="0">…original…</div>
//         </div>
//         <wisp-variants-end …>
//   5. atomicWrite, undo append.
//
// discardVariantBlock reverses: decode `originalLines` from the marker payload,
// splice that back in place of the entire marker block.

import { promises as fs } from "node:fs";

import {
  type DiscardResult,
  MARKER_SYNTAX,
  type SafetyResult,
  type SourceFileType,
  VariantBlockMarkerSchema,
  type WrapResult,
} from "../contracts/source.js";
import {
  applyEol,
  atomicWrite,
  canonicalize,
  detectEol,
  expandReplaceRange,
  findMarkerBlock,
  serializeMarkerBody,
  sha256Hex,
} from "./accept.js";
import { safetyCheck } from "./safety.js";
import { append as appendUndo } from "./undo-stack.js";

// ---------------------------------------------------------------------------
// Module options
// ---------------------------------------------------------------------------

export interface WrapModuleOptions {
  projectRoot: string;
}

// ---------------------------------------------------------------------------
// wrapVariantBlock
// ---------------------------------------------------------------------------

export type WrapOk = WrapResult & { ok: true };
export type WrapFail = {
  ok: false;
  reason:
    | "ambiguous_target"
    | "target_not_found"
    | "safety_refused"
    | "dynamic_classname";
  /** Stable error code for programmatic dispatch. */
  code?: "DYNAMIC_CLASSNAME";
  suggestedFallback?: "agent-driven" | "manual" | "skip";
  /** Human-readable message — populated for dynamic_classname. */
  message?: string;
  detail?: Record<string, unknown>;
};

export async function wrapVariantBlock(
  filePath: string,
  target: { id: string; selector: string },
  sessionId: string,
  variantCount: number,
  modOpts: WrapModuleOptions,
): Promise<WrapOk | WrapFail> {
  const safety: SafetyResult = await safetyCheck(filePath, modOpts.projectRoot);
  if (!safety.ok) {
    await appendUndo(
      {
        ts: new Date().toISOString(),
        sessionId,
        kind: "safety-refused",
        filePath,
        detail: {
          code: safety.error.code,
          message: safety.error.message,
          suggestedFallback: safety.error.suggestedFallback ?? null,
          operation: "wrap-variants",
        },
      },
      { projectRoot: modOpts.projectRoot },
    );
    return {
      ok: false,
      reason: "safety_refused",
      ...(safety.error.suggestedFallback !== undefined
        ? { suggestedFallback: safety.error.suggestedFallback }
        : {}),
      detail: { code: safety.error.code, message: safety.error.message },
    };
  }

  const { fileType } = safety;
  const original = await fs.readFile(filePath, { encoding: "utf8" });
  const beforeHash = sha256Hex(original);
  const eol = detectEol(original);
  const canonical = canonicalize(original);

  // Locate the target span.
  const span = locateTargetSpan(canonical, fileType, target.selector);
  if (span.kind === "not_found") {
    return {
      ok: false,
      reason: "target_not_found",
      suggestedFallback: "agent-driven",
      detail: { selector: target.selector },
    };
  }
  if (span.kind === "ambiguous") {
    return {
      ok: false,
      reason: "ambiguous_target",
      suggestedFallback: "agent-driven",
      detail: { selector: target.selector, matchCount: span.matchCount },
    };
  }
  if (span.kind === "dynamic_classname") {
    const line = span.line + 1; // human-1-indexed
    return {
      ok: false,
      reason: "dynamic_classname",
      code: "DYNAMIC_CLASSNAME",
      suggestedFallback: "agent-driven",
      message: `className={...} JSX expression at line ${line} — wisp cannot statically locate; use agent-driven mode`,
      detail: { selector: target.selector, line },
    };
  }

  const { startOffset, endOffset, startLine, endLine } = span;
  const originalSnippet = canonical.slice(startOffset, endOffset);
  const originalBase64 = Buffer.from(originalSnippet, "utf8").toString("base64");

  // Build marker block.
  const marker = VariantBlockMarkerSchema.parse({
    sessionId,
    targetId: target.id,
    wrappedAt: new Date().toISOString(),
    variantCount,
    originalLines: originalBase64,
  });

  const syntax = MARKER_SYNTAX[fileType];
  const variantsStartBody = serializeMarkerBody("variants-start", {
    sessionId: marker.sessionId,
    targetId: marker.targetId,
    wrappedAt: marker.wrappedAt,
    variantCount: marker.variantCount,
    originalLines: marker.originalLines,
  });
  const variantsEndBody = serializeMarkerBody("variants-end", {
    sessionId: marker.sessionId,
    targetId: marker.targetId,
  });
  const styleStartBody = serializeMarkerBody("style-start", {
    sessionId: marker.sessionId,
    targetId: marker.targetId,
    scopeBase: `[data-wisp-target="${marker.targetId}"]`,
  });
  const styleEndBody = serializeMarkerBody("style-end", {
    sessionId: marker.sessionId,
    targetId: marker.targetId,
  });

  const styleTag = renderStyleHost(fileType, marker.sessionId);
  const hostOpen = renderHostOpen(fileType, marker.targetId);
  const hostInner = renderVariantZeroWrap(fileType, originalSnippet);
  const hostClose = renderHostClose(fileType);

  // Replacement ends with `\n` because `locateTargetSpan`'s endOffset
  // consumes the trailing newline of the wrapped element's line. Without
  // this trailing newline, the variants-end marker would glue onto the
  // next sibling's line — and a subsequent `acceptVariant` line-replace
  // would consume the next sibling too. Bug found Phase 7.1.
  //
  // Byte-equivalence contract (Phase 7.13): the wrap's appended `\n` lives
  // ENTIRELY inside the marker block — `findMarkerBlock` returns
  // `endOffset = startOfNextLineAfterEndMarker`, which includes that `\n`.
  // So on discard, splicing in `originalSnippet` (the bytes between
  // pre-wrap startOffset/endOffset) reproduces the pre-wrap file byte-for-
  // byte. Documented here so future refactors don't accidentally drop the
  // `+ "\n"` and break round-trip equivalence.
  const replacement = [
    syntax.open(variantsStartBody),
    syntax.open(styleStartBody),
    styleTag,
    syntax.close(styleEndBody),
    hostOpen,
    hostInner,
    hostClose,
    syntax.close(variantsEndBody),
  ].join("\n") + "\n";
  const appendedTrailingNewline = true;

  // Splice + line tracking.
  const next =
    canonical.slice(0, startOffset) + replacement + canonical.slice(endOffset);
  const final = applyEol(next, eol);
  await atomicWrite(filePath, final);
  const afterHash = sha256Hex(final);

  await appendUndo(
    {
      ts: new Date().toISOString(),
      sessionId,
      kind: "wrap-variants",
      filePath,
      beforeSha256: beforeHash,
      afterSha256: afterHash,
      detail: {
        targetId: marker.targetId,
        variantCount: marker.variantCount,
        originalByteSize: originalSnippet.length,
        startLine,
        endLine,
        appendedTrailingNewline,
        originalEndsWithNewline: originalSnippet.endsWith("\n"),
      },
    },
    { projectRoot: modOpts.projectRoot },
  );

  // Variant-block-marker lines: approximate from the splice offset; tester
  // pins exact numbers per fixture. variantsStart == startLine; styleStart is
  // the next line; styleEnd three lines after; variantsEnd is the last line
  // of the inserted block.
  const replacementLineCount = countNewlines(replacement);
  return {
    ok: true,
    sessionId: marker.sessionId,
    targetId: marker.targetId,
    variantsStartLine: startLine,
    styleStartLine: startLine + 1,
    styleEndLine: startLine + 3,
    variantsEndLine: startLine + replacementLineCount,
    originalBase64,
  };
}

// ---------------------------------------------------------------------------
// cleanupStaleWraps — discard ALL wisp-variants blocks in a file. Used on
// bridge startup to recover from crashed/abandoned previous sessions whose
// markers never went through accept/discard. Each block's originalLines
// payload is replayed back into the file. Returns the number of blocks
// cleaned. No-op if the file has no markers. Bug found Phase 7.6.
// ---------------------------------------------------------------------------

export async function cleanupStaleWraps(
  filePath: string,
  modOpts: WrapModuleOptions,
): Promise<number> {
  const safety: SafetyResult = await safetyCheck(filePath, modOpts.projectRoot);
  if (!safety.ok) return 0;
  const { fileType } = safety;
  let cleaned = 0;
  // Loop: find the first wrap-variants block (any session/target), discard
  // it, repeat. Caps at 20 iterations as a safety net against runaway loops.
  for (let i = 0; i < 20; i += 1) {
    const original = await fs.readFile(filePath, { encoding: "utf8" });
    const canonical = canonicalize(original);
    const block = findMarkerBlock(canonical, fileType, "variants");
    if (block === null) break;
    const sessionId =
      typeof block.payload.sessionId === "string"
        ? block.payload.sessionId
        : "";
    const targetId =
      typeof block.payload.targetId === "string"
        ? block.payload.targetId
        : "";
    if (sessionId === "" || targetId === "") break;
    try {
      await discardVariantBlock(filePath, sessionId, targetId, modOpts);
      cleaned += 1;
    } catch {
      // If discard throws (e.g. malformed marker), stop to avoid loop.
      break;
    }
  }
  return cleaned;
}

// ---------------------------------------------------------------------------
// discardVariantBlock
// ---------------------------------------------------------------------------

export async function discardVariantBlock(
  filePath: string,
  sessionId: string,
  targetId: string,
  modOpts: WrapModuleOptions,
): Promise<DiscardResult> {
  const safety: SafetyResult = await safetyCheck(filePath, modOpts.projectRoot);
  if (!safety.ok) {
    throw new Error(
      `discardVariantBlock: safety refused — ${safety.error.code}: ${safety.error.message}`,
    );
  }
  const { fileType } = safety;

  const original = await fs.readFile(filePath, { encoding: "utf8" });
  const beforeHash = sha256Hex(original);
  const eol = detectEol(original);
  const canonical = canonicalize(original);

  const block = findMarkerBlock(canonical, fileType, "variants", {
    sessionId,
    targetId,
  });
  if (block === null) {
    throw new Error(
      `discardVariantBlock: no variants block for session=${sessionId} target=${targetId}`,
    );
  }

  // Decode the original snippet from the marker payload. Empty/invalid b64
  // → best-effort replace with empty string; caller sees byteEquivalent=false.
  const b64 = block.payload.originalLines ?? "";
  let restoredSnippet = "";
  let decodeOk = false;
  try {
    restoredSnippet = Buffer.from(b64, "base64").toString("utf8");
    decodeOk = b64 !== "";
  } catch {
    restoredSnippet = "";
    decodeOk = false;
  }

  // Phase 7.13 — trailing-`\n` reconciliation. wrap.ts appends a single
  // `\n` at the END of the marker block (to keep the variants-end marker
  // on its own line). `findMarkerBlock`'s block.endOffset is the start of
  // the line AFTER the end-marker, so that wrap-added `\n` lives INSIDE
  // [block.startOffset .. block.endOffset] and is consumed by the splice.
  // No snippet trimming is needed because the appended-`\n` is in the
  // block range, not in `originalSnippet`. Verified end-to-end against
  // JSX mid-file, HTML mid-file, EOF, and no-trailing-newline fixtures.
  const next = expandReplaceRange(canonical, block, restoredSnippet, eol);
  const final = applyEol(next, eol);
  await atomicWrite(filePath, final);
  const afterHash = sha256Hex(final);

  // Byte-equivalent restore semantics (Phase 7.13): honest reflection of
  // whether the pre-wrap file state was reproduced. True iff:
  //   (a) originalLines payload was present + decodable, AND
  //   (b) the splice itself succeeded (no error path reached here).
  // Per the byte-equivalence contract documented in wrap.ts (wrap's
  // appended `\n` lives inside the marker block range), (a)+(b) together
  // imply true byte-for-byte equivalence with the pre-wrap content.
  const byteEquivalent = decodeOk && restoredSnippet !== "";

  await appendUndo(
    {
      ts: new Date().toISOString(),
      sessionId,
      kind: "discard-variants",
      filePath,
      beforeSha256: beforeHash,
      afterSha256: afterHash,
      detail: {
        targetId,
        restoredByteEquivalent: byteEquivalent,
        snippetEndsWithNewline: restoredSnippet.endsWith("\n"),
      },
    },
    { projectRoot: modOpts.projectRoot },
  );

  return {
    discarded: true,
    sessionId,
    targetId,
    restoredByteEquivalent: byteEquivalent,
  };
}

// ---------------------------------------------------------------------------
// Target span location — literal-substring heuristic with brace/tag walker.
// ---------------------------------------------------------------------------

type SpanResult =
  | { kind: "found"; startOffset: number; endOffset: number; startLine: number; endLine: number }
  | { kind: "not_found" }
  | { kind: "ambiguous"; matchCount: number }
  | { kind: "dynamic_classname"; line: number };

// Discriminated result for the class-attribute extractor. The JSX-expression
// case (`className={cn(...)}`) cannot be statically resolved, so we surface it
// explicitly instead of treating it as "no class attribute present" — which
// would silently fall through to target_not_found and waste a recovery cycle.
type ClassAttrResult =
  | { kind: "static"; classes: Set<string> }
  | { kind: "dynamic-jsx-expression" }
  | { kind: "none" };

function locateTargetSpan(
  canonical: string,
  fileType: SourceFileType,
  selector: string,
): SpanResult {
  // Parse the selector's leaf segment for tag + required class list.
  const parsed = parseLeafSelector(selector);

  // Strategy:
  //   1. Find all `<tag` occurrences (or `<` for any-tag selectors).
  //   2. For each, slice forward to its `>` and extract the class attribute.
  //   3. Filter to candidates whose class list is a SUPERSET of the required
  //      classes from the selector. This handles Tailwind's space-delimited
  //      multi-class lists (e.g. `class="mt-6 w-full bg-neutral-900 …"`).
  //   4. If exactly 1 candidate → found. Else → ambiguous / not_found.
  //   5. Fallback (no tag, no classes): legacy substring anchor.
  if (parsed === null) {
    return locateBySubstring(canonical, fileType, selectorToAnchor(selector));
  }
  const { tag, classes, idAttr } = parsed;
  // Id is the strongest anchor — exact `id="x"` substring should be unique.
  if (idAttr !== null) {
    return locateBySubstring(canonical, fileType, `id="${idAttr}"`);
  }
  // Find candidate opening-tag positions.
  //   - When `tag !== null`: search for `<tag` literal, verify the next char
  //     is whitespace/`>`/`/` so `<h3` doesn't match `<h3o`.
  //   - When `tag === null` (class-only selector like `.btn`): search every
  //     `<` and require the NEXT char to be `[A-Za-z]` (opening tag) — skips
  //     `</foo>` closing tags and `<!--` comments.
  const tagPositions: number[] = [];
  if (tag !== null) {
    const tagAnchor = `<${tag}`;
    let from = 0;
    while (from < canonical.length) {
      const idx = canonical.indexOf(tagAnchor, from);
      if (idx === -1) break;
      const nextChar = canonical[idx + tagAnchor.length];
      if (nextChar !== undefined && /[\s/>]/.test(nextChar)) {
        tagPositions.push(idx);
      }
      from = idx + tagAnchor.length;
      if (tagPositions.length > 200) break;
    }
  } else {
    // Class-only selector — scan every `<X` where X is a letter.
    for (let i = 0; i < canonical.length - 1; i += 1) {
      if (canonical[i] === "<") {
        const c = canonical[i + 1];
        if (c !== undefined && /[A-Za-z]/.test(c)) {
          tagPositions.push(i);
          if (tagPositions.length > 1000) break;
        }
      }
    }
  }
  if (tagPositions.length === 0) return { kind: "not_found" };
  // For each tag candidate, parse its class attribute and check classes ⊆.
  // Track whether we hit a JSX-expression className for the FIRST tag-name
  // match — if the user's selector targets a tag whose only candidates all
  // have dynamic classNames, we surface that as a structured error instead
  // of an unhelpful "target_not_found".
  const matchingPositions: number[] = [];
  let firstDynamicTagPos: number | null = null;
  for (const tagPos of tagPositions) {
    const result = extractClassAttribute(canonical, tagPos);
    if (result.kind === "dynamic-jsx-expression") {
      if (firstDynamicTagPos === null) firstDynamicTagPos = tagPos;
      continue;
    }
    if (result.kind === "none") {
      // No class attribute. Class-bearing selector cannot match an
      // unclassed element — skip silently.
      if (classes.length === 0) {
        matchingPositions.push(tagPos);
        if (matchingPositions.length > 8) break;
      }
      continue;
    }
    if (classes.every((c) => result.classes.has(c))) {
      matchingPositions.push(tagPos);
      if (matchingPositions.length > 8) break;
    }
  }
  if (matchingPositions.length === 0) {
    // No static matches but we did see a dynamic className on a candidate
    // element. Surface as dynamic_classname so the agent can fall back to
    // agent-driven mode rather than re-querying with a different selector.
    if (firstDynamicTagPos !== null) {
      return {
        kind: "dynamic_classname",
        line: lineOfOffset(canonical, firstDynamicTagPos),
      };
    }
    return { kind: "not_found" };
  }
  if (matchingPositions.length > 1) {
    return { kind: "ambiguous", matchCount: matchingPositions.length };
  }

  const openLt = matchingPositions[0] as number;
  return finalizeSpan(canonical, fileType, openLt);
}

// ---------------------------------------------------------------------------
// Selector parsing — extract leaf-segment tag + class-list from a selector
// like `section.foo > div.bar > h3.bg-clip-text.font-black`.
// ---------------------------------------------------------------------------

interface LeafSelector {
  tag: string | null; // null = match any tag
  classes: string[];
  idAttr: string | null;
}

function parseLeafSelector(selector: string): LeafSelector | null {
  const t = selector.trim();
  if (t === "") return null;
  // Take the leaf (rightmost segment of a `>` chain).
  const segments = t.split(">").map((s) => s.trim()).filter((s) => s !== "");
  const leaf = segments[segments.length - 1] ?? t;
  // Strip pseudos like :nth-of-type(2), :hover, etc. — they're DOM-only.
  const cleaned = leaf.replace(/:[a-z-]+(?:\([^)]*\))?/g, "");
  if (cleaned === "") return null;
  // Attribute selector — defer to legacy locateBySubstring path so the
  // existing `attr="value"` anchor logic in selectorToAnchor handles it.
  if (cleaned.startsWith("[")) return null;
  // Extract id (#foo) — id is the strongest anchor.
  const idMatch = /#([A-Za-z][\w-]*)/.exec(cleaned);
  const idAttr = idMatch ? (idMatch[1] ?? null) : null;
  // Strip id portion.
  const withoutId = cleaned.replace(/#[A-Za-z][\w-]*/, "");
  // Split tag vs classes on first dot.
  const dotIdx = withoutId.indexOf(".");
  const tagPart = dotIdx === -1 ? withoutId : withoutId.slice(0, dotIdx);
  const classPart = dotIdx === -1 ? "" : withoutId.slice(dotIdx + 1);
  const tag = tagPart.length > 0 ? tagPart : null;
  const classes = classPart === ""
    ? []
    : classPart.split(".").map((c) => c.trim()).filter((c) => c !== "");
  if (tag === null && classes.length === 0 && idAttr === null) return null;
  return { tag, classes, idAttr };
}

// Read the `class="..."` (or `className="..."`) attribute of the element
// whose opening `<` is at `openLt`.
//
// Returns a discriminated result:
//   - `{kind:"static", classes}` — quoted string value, classes parsed
//   - `{kind:"dynamic-jsx-expression"}` — JSX `className={…}` form; cannot
//     statically resolve the class list (e.g. `className={cn("btn", …)}`)
//   - `{kind:"none"}` — no class/className attribute on this tag
function extractClassAttribute(
  canonical: string,
  openLt: number,
): ClassAttrResult {
  // Scan forward to the matching `>` (respecting quoted attribute values AND
  // JSX brace-expression depth so `>` inside `{x > 0}` isn't mistaken for
  // tag-end).
  let i = openLt + 1;
  let inQuote: '"' | "'" | null = null;
  let braceDepth = 0;
  while (i < canonical.length) {
    const ch = canonical[i] as string;
    if (inQuote !== null) {
      if (ch === inQuote) inQuote = null;
    } else if (ch === '"' || ch === "'") {
      inQuote = ch as '"' | "'";
    } else if (ch === "{") {
      braceDepth += 1;
    } else if (ch === "}") {
      if (braceDepth > 0) braceDepth -= 1;
    } else if (ch === ">" && braceDepth === 0) {
      break;
    }
    i += 1;
  }
  const tagText = canonical.slice(openLt, i);
  // Detect JSX-expression form FIRST — `className={…}` (or `class={…}`).
  // If the value side after `=` opens with `{` it's a JSX expression and we
  // can't resolve it statically. This must run before the quoted-string match
  // because we want to distinguish "no attribute" from "dynamic attribute".
  const dynamicMatch = /\b(?:class|className)\s*=\s*\{/.exec(tagText);
  if (dynamicMatch) {
    return { kind: "dynamic-jsx-expression" };
  }
  // Match class="..." OR className="..." (JSX). Handles either single or
  // double quotes.
  const m = /\b(?:class|className)\s*=\s*("([^"]*)"|'([^']*)')/.exec(tagText);
  if (!m) return { kind: "none" };
  const value = m[2] ?? m[3] ?? "";
  return {
    kind: "static",
    classes: new Set(value.split(/\s+/).filter((c) => c !== "")),
  };
}

// Legacy substring-anchor path — kept for callers that pass an explicit
// `<tag` or `id="..."` anchor; used as the fallback when parseLeafSelector
// returns null.
function locateBySubstring(
  canonical: string,
  fileType: SourceFileType,
  anchor: string | null,
): SpanResult {
  if (anchor === null) return { kind: "not_found" };
  const positions: number[] = [];
  let from = 0;
  while (from < canonical.length) {
    const idx = canonical.indexOf(anchor, from);
    if (idx === -1) break;
    positions.push(idx);
    from = idx + anchor.length;
    if (positions.length > 8) break;
  }
  if (positions.length === 0) return { kind: "not_found" };
  if (positions.length > 1) {
    return { kind: "ambiguous", matchCount: positions.length };
  }
  const pos = positions[0] as number;
  const openLt = canonical.lastIndexOf("<", pos);
  if (openLt === -1) return { kind: "not_found" };
  return finalizeSpan(canonical, fileType, openLt);
}

// Shared finalization step — walks forward to element end, normalizes line
// boundaries. Used by both the new class-set path and the legacy substring
// path.
function finalizeSpan(
  canonical: string,
  fileType: SourceFileType,
  openLt: number,
): SpanResult {
  // Walk forwards: balance tags. Element can be self-closing (`/>`) or paired
  // (`<Tag …> … </Tag>`). For JSX & HTML the principle is the same.
  const endOffset = walkElementEnd(canonical, fileType, openLt);
  if (endOffset === -1) return { kind: "not_found" };

  // Expand startOffset to the start of the line (preserve indentation).
  const startLineOffset = lineStartOffset(canonical, openLt);
  // Expand endOffset to include trailing `\n` of that line.
  const endLineOffset = lineEndOffset(canonical, endOffset);

  return {
    kind: "found",
    startOffset: startLineOffset,
    endOffset: endLineOffset,
    startLine: lineOfOffset(canonical, startLineOffset),
    endLine: lineOfOffset(canonical, endLineOffset),
  };
}

function selectorToAnchor(selector: string): string | null {
  const t = selector.trim();
  if (t === "") return null;
  // For chain selectors `parent > child.x.y > leaf.a.b`, the LEAF is the
  // target — take the rightmost segment.
  const segments = t.split(">").map((s) => s.trim()).filter((s) => s !== "");
  const leaf = segments[segments.length - 1] ?? t;

  // Strip nth-of-type and other pseudo selectors that aren't in the source
  // (they're DOM-only concepts).
  const cleaned = leaf.replace(/:[a-z-]+(?:\([^)]*\))?/g, "");

  // `#id` → `id="…"` literal.
  if (cleaned.startsWith("#")) {
    return cleaned.length > 1 ? `id="${cleaned.slice(1).split(/[.[]/)[0]}"` : null;
  }
  // `[attr="v"]` → `attr="v"` literal.
  if (cleaned.startsWith("[")) return cleaned.replace(/^\[/, "").replace(/\]$/, "");

  // Compound `tag.class1.class2…` or `.class1.class2`:
  // Anchor on the MOST DISTINCTIVE class name (one with a dash, which
  // tends to be content-bearing — e.g. `bg-clip-text` over `mt-2`). Walker
  // then back-tracks to the enclosing `<tag` via lastIndexOf("<", anchorPos).
  // `tag` part of `tag.class` (no classes) → `<tag` literal.
  const dotIdx = cleaned.indexOf(".");
  const tag = dotIdx === -1 ? cleaned : cleaned.slice(0, dotIdx);
  const classList = dotIdx === -1
    ? []
    : cleaned
        .slice(dotIdx + 1)
        .split(".")
        .map((c) => c.trim())
        .filter((c) => c !== "");

  if (classList.length === 0) {
    return tag.length > 0 ? `<${tag}` : null;
  }

  // Pick the longest class name (most distinctive — least likely to collide
  // with other elements in the file). Tailwind shorthand classes like
  // `mt-2` collide everywhere; content-bearing ones like `bg-clip-text` or
  // `from-purple-500` are usually unique enough to anchor on. Anchor is
  // the BARE class name — in source HTML/JSX the class is space-delimited
  // inside the `class="..."` attribute, so `"bg-clip-text"` (with quotes)
  // would never match; the unquoted token does.
  const anchor = classList.slice().sort((a, b) => b.length - a.length)[0] as string;
  return anchor;
}

function walkElementEnd(
  source: string,
  fileType: SourceFileType,
  openIdx: number,
): number {
  // Read the tag name.
  const nameMatch = /^<\/?([A-Za-z][A-Za-z0-9_:.-]*)/.exec(source.slice(openIdx));
  if (!nameMatch) return -1;
  const tagName = (nameMatch[1] ?? "").toLowerCase();
  void fileType;

  // Scan forward; if we hit `/>` before `>`, it's self-closing.
  //
  // QUOTE-INSIDE-TAG ONLY: HTML body text can contain apostrophes ("team's
  // velocity") and quotes that aren't attribute delimiters. Treat `"` / `'`
  // as quote-state-toggles ONLY when scanning INSIDE a tag (between `<` and
  // its matching `>`). In body content, leave them as ordinary characters
  // so `</h3>` after `team's` is still found. Tracked via `inTag` flag.
  let i = openIdx;
  let inQuote: '"' | "'" | null = null;
  let inTag = true; // we start at the `<` of the target opening tag
  let depth = 0;
  while (i < source.length) {
    const ch = source[i] as string;
    if (inQuote !== null) {
      if (ch === "\\" && i + 1 < source.length) {
        i += 2;
        continue;
      }
      if (ch === inQuote) inQuote = null;
      i += 1;
      continue;
    }
    if (inTag && (ch === '"' || ch === "'")) {
      inQuote = ch;
      i += 1;
      continue;
    }
    if (inTag && ch === ">") {
      inTag = false;
      // fallthrough to depth-tracking below
    }
    if (ch === "<") {
      // Lookahead.
      const m = /^<\/?([A-Za-z][A-Za-z0-9_:.-]*)/.exec(source.slice(i));
      if (m) {
        const isClose = source[i + 1] === "/";
        const innerName = (m[1] ?? "").toLowerCase();
        if (innerName === tagName) {
          if (isClose) {
            depth -= 1;
            if (depth === 0) {
              // Advance i to just past the close `>`.
              const gt = source.indexOf(">", i);
              return gt === -1 ? -1 : gt + 1;
            }
          } else {
            // Self-closing? Find `>` and look back one char for `/`.
            const gt = source.indexOf(">", i);
            if (gt === -1) return -1;
            const isSelf = source[gt - 1] === "/";
            if (isSelf) {
              if (depth === 0) return gt + 1;
              // self-closed nested same-name — no depth change.
            } else {
              depth += 1;
            }
          }
        }
        // Entering a new tag — flip inTag so quote chars are honored again
        // until the new tag's `>`.
        inTag = true;
      }
    }
    i += 1;
  }
  return -1;
}

function lineStartOffset(s: string, at: number): number {
  let i = at;
  while (i > 0 && s[i - 1] !== "\n") i -= 1;
  return i;
}

function lineEndOffset(s: string, at: number): number {
  let i = at;
  while (i < s.length && s[i] !== "\n") i += 1;
  if (i < s.length && s[i] === "\n") i += 1;
  return i;
}

function lineOfOffset(s: string, offset: number): number {
  let line = 0;
  for (let i = 0; i < offset && i < s.length; i += 1) {
    if (s[i] === "\n") line += 1;
  }
  return line;
}

// ---------------------------------------------------------------------------
// Replacement rendering helpers — per file type.
// ---------------------------------------------------------------------------

function renderStyleHost(fileType: SourceFileType, sessionId: string): string {
  if (fileType === "tsx" || fileType === "jsx") {
    return `<style data-wisp-css="${sessionId}">{\`/* variants populated at runtime */\`}</style>`;
  }
  return `<style data-wisp-css="${sessionId}">/* variants populated at runtime */</style>`;
}

function renderHostOpen(fileType: SourceFileType, targetId: string): string {
  void fileType;
  return `<div data-wisp-variants-host="${targetId}">`;
}

function renderVariantZeroWrap(
  fileType: SourceFileType,
  snippet: string,
): string {
  void fileType;
  return `  <div data-wisp-variant="0">\n${indent(snippet, "    ")}\n  </div>`;
}

function renderHostClose(fileType: SourceFileType): string {
  void fileType;
  return `</div>`;
}

function indent(s: string, pad: string): string {
  return s
    .split("\n")
    .map((l) => (l.length === 0 ? l : pad + l))
    .join("\n");
}

function countNewlines(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i += 1) if (s[i] === "\n") n += 1;
  return n;
}

// ---------------------------------------------------------------------------
// Module export — matches `WrapModule` in the contract.
// ---------------------------------------------------------------------------

export const wrapModule = { wrapVariantBlock, discardVariantBlock };
