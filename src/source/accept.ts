// wisp-design — Accept a chosen variant: parse marker block, extract CSS,
// carbonize, splice, write atomically (Phase 3).
//
// Shared helpers (detectEol / sha256 / serializeMarkerBody / parseMarkerBody
// / findMarkerBlock / expandReplaceRange / atomicWrite / fileTypeFromPath)
// live in `_helpers.ts` and are re-exported below for inject.ts and wrap.ts.

import { promises as fs } from "node:fs";
import { randomUUID } from "node:crypto";

import {
  type AcceptOperation,
  AcceptOperationSchema,
  type AcceptResult,
  type MarkerBlock,
  type SafetyResult,
  type SourceFileType,
} from "../contracts/source.js";
import { carbonize } from "./carbonize.js";
import { safetyCheck } from "./safety.js";
import { append as appendUndo } from "./undo-stack.js";
import {
  applyEol,
  atomicWrite,
  canonicalize,
  detectEol,
  expandReplaceRange,
  findMarkerBlock,
  parseMarkerBody,
  serializeMarkerBody,
  sha256First256Bytes,
  sha256Hex,
} from "./_helpers.js";

// ---------------------------------------------------------------------------
// extractVariant — walk the @scope rule inside the style-block.
// ---------------------------------------------------------------------------

export function extractVariant(
  content: string,
  block: MarkerBlock,
  variantId: string,
): { css: string; cssVars: Record<string, string> } | null {
  const inner = content.slice(block.startOffset, block.endOffset);
  const cssText = extractStyleBlockText(inner);
  if (cssText === null) return null;

  const variantNeedle = `[data-wisp-variant="${variantId}"]`;
  const variantNeedleSq = `[data-wisp-variant='${variantId}']`;
  let i = 0;
  while (i < cssText.length) {
    const idx = cssText.indexOf("@scope", i);
    if (idx === -1) break;
    const openParen = cssText.indexOf("(", idx);
    if (openParen === -1) break;
    const closeParen = matchParen(cssText, openParen);
    if (closeParen === -1) break;
    const inside = cssText.slice(openParen + 1, closeParen).trim();
    if (inside === variantNeedle || inside === variantNeedleSq) {
      const braceOpen = cssText.indexOf("{", closeParen);
      if (braceOpen === -1) return null;
      const braceClose = matchBrace(cssText, braceOpen);
      if (braceClose === -1) return null;
      const body = cssText.slice(braceOpen + 1, braceClose).trim();
      return { css: body, cssVars: extractScopeCssVars(body) };
    }
    i = closeParen + 1;
  }
  return null;
}

function extractStyleBlockText(inner: string): string | null {
  const openIdx = inner.indexOf("<style");
  if (openIdx === -1) return null;
  const openTagEnd = inner.indexOf(">", openIdx);
  if (openTagEnd === -1) return null;
  const closeIdx = inner.indexOf("</style>", openTagEnd);
  if (closeIdx === -1) return null;
  const raw = inner.slice(openTagEnd + 1, closeIdx);
  let s = raw.trim();
  // JSX form: `{` + template-literal + `}`.
  if (s.startsWith("{") && s.endsWith("}")) s = s.slice(1, -1).trim();
  if (s.startsWith("`") && s.endsWith("`")) s = s.slice(1, -1);
  return s;
}

function matchParen(s: string, openIdx: number): number {
  let depth = 0;
  let q: '"' | "'" | null = null;
  for (let i = openIdx; i < s.length; i += 1) {
    const ch = s[i] as string;
    if (q !== null) {
      if (ch === "\\" && i + 1 < s.length) { i += 1; continue; }
      if (ch === q) q = null;
      continue;
    }
    if (ch === '"' || ch === "'") { q = ch; continue; }
    if (ch === "(") depth += 1;
    else if (ch === ")") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function matchBrace(s: string, openIdx: number): number {
  let depth = 0;
  let q: '"' | "'" | null = null;
  for (let i = openIdx; i < s.length; i += 1) {
    const ch = s[i] as string;
    if (q !== null) {
      if (ch === "\\" && i + 1 < s.length) { i += 1; continue; }
      if (ch === q) q = null;
      continue;
    }
    if (ch === '"' || ch === "'") { q = ch; continue; }
    if (ch === "/" && s[i + 1] === "*") {
      const end = s.indexOf("*/", i + 2);
      if (end === -1) return -1;
      i = end + 1;
      continue;
    }
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function extractScopeCssVars(body: string): Record<string, string> {
  const idx = body.indexOf(":scope");
  if (idx === -1) return {};
  const braceOpen = body.indexOf("{", idx);
  if (braceOpen === -1) return {};
  const braceClose = matchBrace(body, braceOpen);
  if (braceClose === -1) return {};
  const decls = body.slice(braceOpen + 1, braceClose);
  const out: Record<string, string> = {};
  for (const rawLine of decls.split(";")) {
    const line = rawLine.trim();
    if (line === "") continue;
    const c = line.indexOf(":");
    if (c === -1) continue;
    const name = line.slice(0, c).trim();
    const value = line.slice(c + 1).trim();
    if (name.startsWith("--")) out[name] = value;
  }
  return out;
}

// ---------------------------------------------------------------------------
// acceptVariant
// ---------------------------------------------------------------------------

export interface AcceptModuleOptions {
  projectRoot: string;
}

export async function acceptVariant(
  op: AcceptOperation,
  modOpts: AcceptModuleOptions,
): Promise<AcceptResult> {
  const parsed = AcceptOperationSchema.parse(op);

  const safety: SafetyResult = await safetyCheck(
    parsed.filePath,
    modOpts.projectRoot,
  );
  if (!safety.ok) {
    await appendUndo(
      {
        ts: new Date().toISOString(),
        sessionId: parsed.sessionId,
        kind: "safety-refused",
        filePath: parsed.filePath,
        detail: {
          code: safety.error.code,
          suggestedFallback: safety.error.suggestedFallback ?? null,
          message: safety.error.message,
          operation: "accept-variant",
        },
      },
      { projectRoot: modOpts.projectRoot },
    );
    throw new Error(
      `acceptVariant: safety refused — ${safety.error.code}: ${safety.error.message}`,
    );
  }

  const { fileType } = safety;
  const original = await fs.readFile(parsed.filePath, { encoding: "utf8" });
  const beforeHash = sha256Hex(original);
  const eol = parsed.eolConvention ?? detectEol(original);
  const canonical = canonicalize(original);

  const block = findMarkerBlock(canonical, fileType, "variants", {
    sessionId: parsed.sessionId,
    targetId: parsed.targetId,
  });
  if (block === null) {
    throw new Error(
      `acceptVariant: no variants block for session=${parsed.sessionId} target=${parsed.targetId}`,
    );
  }

  const extracted = extractVariant(canonical, block, parsed.variantId);
  const variantCss = extracted?.css ?? parsed.variantCss;
  if (variantCss.trim() === "") {
    throw new Error(
      `acceptVariant: variantId=${parsed.variantId} produced empty CSS`,
    );
  }

  // The targetId IS the element's CSS selector (e.g.
  // `h3.font-medium.text-base.text-neutral-900`) — that's what
  // browser/picker.ts builds. Use it directly as the carbonize scope
  // selector so the permanent style actually matches the element. The
  // previous design synthesised a `[data-wisp-target="…"]` attribute
  // selector that was never written onto the DOM, so the CSS never
  // applied — bug found Phase 7.1. We still validate against safe
  // chars so a malicious caller cannot inject arbitrary CSS through
  // the selector string.
  const scopeSelector = sanitizeScopeSelector(parsed.targetId);
  const emittedCss = parsed.carbonize
    ? carbonize(
        `@scope ([data-wisp-variant="${parsed.variantId}"]) {\n${variantCss}\n}`,
        { paramOverrides: parsed.paramOverrides, scopeSelector },
      )
    : variantCss;

  const replacement = buildPermanentReplacement({
    fileType,
    sessionId: parsed.sessionId,
    targetId: parsed.targetId,
    emittedCss,
    originalLinesB64: block.payload.originalLines ?? "",
  });

  const next = expandReplaceRange(canonical, block, replacement, eol);
  const final = applyEol(next, eol);
  await atomicWrite(parsed.filePath, final);
  const afterHash = sha256Hex(final);

  await appendUndo(
    {
      ts: new Date().toISOString(),
      sessionId: parsed.sessionId,
      kind: "accept-variant",
      filePath: parsed.filePath,
      beforeSha256: beforeHash,
      afterSha256: afterHash,
      detail: {
        targetId: parsed.targetId,
        variantId: parsed.variantId,
        paramOverrides: parsed.paramOverrides,
        carbonized: parsed.carbonize,
        byteSize: Buffer.byteLength(final, "utf8"),
      },
    },
    { projectRoot: modOpts.projectRoot },
  );

  return {
    filePath: parsed.filePath,
    variantId: parsed.variantId,
    replacedStartLine: block.startLine,
    replacedEndLine: block.endLine,
    beforeHash,
    afterHash,
    emittedCss,
  };
}

// ---------------------------------------------------------------------------
// Replacement renderer — permanent <style> block + restored original snippet.
// ---------------------------------------------------------------------------

interface ReplacementInput {
  fileType: SourceFileType;
  sessionId: string;
  targetId: string;
  emittedCss: string;
  originalLinesB64: string;
}

function buildPermanentReplacement(input: ReplacementInput): string {
  let originalSnippet = "";
  if (input.originalLinesB64 !== "") {
    try {
      originalSnippet = Buffer.from(input.originalLinesB64, "base64").toString(
        "utf8",
      );
    } catch {
      originalSnippet = "";
    }
  }
  const cssBody = input.emittedCss.replace(/\n+$/, "");
  if (input.fileType === "tsx" || input.fileType === "jsx") {
    return [
      `<style data-wisp-permanent="${input.sessionId}">{\`${cssBody}\`}</style>`,
      originalSnippet,
    ]
      .filter((s) => s !== "")
      .join("\n");
  }
  if (input.fileType === "css") {
    return [cssBody, originalSnippet].filter((s) => s !== "").join("\n");
  }
  return [
    `<style data-wisp-permanent="${input.sessionId}">${cssBody}</style>`,
    originalSnippet,
  ]
    .filter((s) => s !== "")
    .join("\n");
}

// ---------------------------------------------------------------------------
// sanitizeScopeSelector — accept only characters that can legitimately
// appear in the kind of class-chain selectors picker.ts emits
// (`tag.class.class[.class]…` plus optional `#id` plus descendant combinator
// space). This is a defense-in-depth check: the targetId comes from the
// agent's poll-loop which itself validates browser events, so we never
// expect anything weird here — but rejecting unexpected chars protects the
// generated CSS file from injection if a future caller misuses the API.
// ---------------------------------------------------------------------------

function sanitizeScopeSelector(targetId: string): string {
  const t = targetId.trim();
  // Allow letters / digits / `-_.#:` / whitespace / brackets / quotes / `>` / `*` / `,`.
  // This covers tag, class, id, attribute, descendant, child, universal, group.
  // Reject `{` `}` `;` so a malicious targetId cannot break out of the CSS rule.
  if (!/^[A-Za-z0-9_\-\.#:\[\]"'\s>*,()=^$|~]+$/.test(t)) {
    throw new Error(
      `acceptVariant: targetId contains unsafe characters — ${JSON.stringify(t.slice(0, 40))}`,
    );
  }
  return t;
}

// ---------------------------------------------------------------------------
// Module export — matches AcceptModule in the contract.
// ---------------------------------------------------------------------------

export const acceptModule = {
  acceptVariant,
  findMarkerBlock,
  extractVariant,
  expandReplaceRange,
};

// ---------------------------------------------------------------------------
// Re-exports for inject.ts and wrap.ts (single import surface).
// ---------------------------------------------------------------------------

export {
  applyEol,
  atomicWrite,
  canonicalize,
  detectEol,
  expandReplaceRange,
  findMarkerBlock,
  parseMarkerBody,
  serializeMarkerBody,
  sha256First256Bytes,
  sha256Hex,
  randomUUID,
};
