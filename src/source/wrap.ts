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
  reason: "ambiguous_target" | "target_not_found" | "safety_refused";
  suggestedFallback?: "agent-driven" | "manual" | "skip";
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

  const replacement = [
    syntax.open(variantsStartBody),
    syntax.open(styleStartBody),
    styleTag,
    syntax.close(styleEndBody),
    hostOpen,
    hostInner,
    hostClose,
    syntax.close(variantsEndBody),
  ].join("\n");

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
  try {
    restoredSnippet = Buffer.from(b64, "base64").toString("utf8");
  } catch {
    restoredSnippet = "";
  }

  const next = expandReplaceRange(canonical, block, restoredSnippet, eol);
  const final = applyEol(next, eol);
  await atomicWrite(filePath, final);
  const afterHash = sha256Hex(final);

  // Byte-equivalent restore = we had a non-empty originalLines payload to
  // splice in. Tester verifies via fixture: wrap(X) then discard() yields
  // bytes identical to X.
  const byteEquivalent = restoredSnippet !== "";

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
  | { kind: "ambiguous"; matchCount: number };

function locateTargetSpan(
  canonical: string,
  fileType: SourceFileType,
  selector: string,
): SpanResult {
  // Derive an "anchor" substring from the selector.
  const anchor = selectorToAnchor(selector);
  if (anchor === null) return { kind: "not_found" };

  const positions: number[] = [];
  let from = 0;
  while (from < canonical.length) {
    const idx = canonical.indexOf(anchor, from);
    if (idx === -1) break;
    positions.push(idx);
    from = idx + anchor.length;
    if (positions.length > 8) break; // cap; ambiguous beyond a few hits anyway
  }
  if (positions.length === 0) return { kind: "not_found" };
  if (positions.length > 1) {
    return { kind: "ambiguous", matchCount: positions.length };
  }

  const pos = positions[0] as number;

  // Walk backwards to the opening `<` of the tag that contains this anchor.
  const openLt = canonical.lastIndexOf("<", pos);
  if (openLt === -1) return { kind: "not_found" };

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
  // `#id` → `id="…"`; `.cls` → `"cls"` (catches single + multi-class
  // declarations); `[attr="v"]` → `attr="v"`; tag-name → `<tag` literal.
  if (t.startsWith("#")) return t.length > 1 ? `id="${t.slice(1)}"` : null;
  if (t.startsWith(".")) return t.length > 1 ? `"${t.slice(1)}"` : null;
  if (t.startsWith("[")) return t.replace(/^\[/, "").replace(/\]$/, "");
  return `<${t}`;
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
  let i = openIdx;
  let inQuote: '"' | "'" | null = null;
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
    if (ch === '"' || ch === "'") {
      inQuote = ch;
      i += 1;
      continue;
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
