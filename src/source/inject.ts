// wisp-design — Inject `<script src="…/live.js">` into the dev HTML entry
// (Phase 3). Implements `InjectModule` from src/contracts/source.ts.
//
// Flow:
//   safetyCheck → read → detectEol → canonicalize
//   → find anchor (head/body/eof) → splice marker-wrapped script tag
//   → re-apply EOL → atomicWrite → append undo entry.
//
// JSX/TSX is REFUSED for inject — `<script>` tags inside JSX are component
// children, not page-level resources. The bridge injects via the parent HTML
// or via a hook into the dev server's HTML template. accept the refuse with
// `suggestedFallback: "agent-driven"`.

import { promises as fs } from "node:fs";

import {
  type InjectMarker,
  InjectMarkerSchema,
  type InjectOptions,
  InjectOptionsSchema,
  type InjectResult,
  MARKER_SYNTAX,
  type RemoveResult,
  type SafetyResult,
  type SourceFileType,
  WISP_INJECT_DATA_ATTRIBUTE,
  WISP_INJECT_SCRIPT_ID,
} from "../contracts/source.js";
import {
  applyEol,
  atomicWrite,
  canonicalize,
  detectEol,
  expandReplaceRange,
  findMarkerBlock,
  parseMarkerBody,
  randomUUID,
  serializeMarkerBody,
  sha256First256Bytes,
  sha256Hex,
} from "./accept.js";
import { safetyCheck } from "./safety.js";
import { append as appendUndo } from "./undo-stack.js";

// ---------------------------------------------------------------------------
// Module options + projectRoot wiring
// ---------------------------------------------------------------------------

export interface InjectModuleOptions {
  projectRoot: string;
  sessionId?: string;
}

// ---------------------------------------------------------------------------
// injectLiveScript
// ---------------------------------------------------------------------------

export async function injectLiveScript(
  filePath: string,
  opts: InjectOptions,
  modOpts: InjectModuleOptions,
): Promise<InjectResult> {
  const parsedOpts = InjectOptionsSchema.parse(opts);

  const safety: SafetyResult = await safetyCheck(filePath, modOpts.projectRoot);
  if (!safety.ok) {
    await appendUndo(
      {
        ts: new Date().toISOString(),
        sessionId: modOpts.sessionId ?? "no-session",
        kind: "safety-refused",
        filePath,
        detail: {
          code: safety.error.code,
          message: safety.error.message,
          suggestedFallback: safety.error.suggestedFallback ?? null,
          operation: "inject-script",
        },
      },
      { projectRoot: modOpts.projectRoot },
    );
    throw new Error(
      `injectLiveScript: safety refused — ${safety.error.code}: ${safety.error.message}`,
    );
  }

  const { fileType } = safety;

  if (fileType === "tsx" || fileType === "jsx") {
    await appendUndo(
      {
        ts: new Date().toISOString(),
        sessionId: modOpts.sessionId ?? "no-session",
        kind: "safety-refused",
        filePath,
        detail: {
          code: "UNSUPPORTED_FILE_TYPE",
          message:
            "JSX/TSX is not supported for inject; inject the parent HTML instead.",
          suggestedFallback: "agent-driven",
          operation: "inject-script",
        },
      },
      { projectRoot: modOpts.projectRoot },
    );
    throw new Error(
      "injectLiveScript: JSX/TSX is not a script-host; inject the parent HTML entry instead.",
    );
  }

  if (fileType === "css") {
    throw new Error(
      "injectLiveScript: CSS cannot host a script tag (safetyCheck should have refused).",
    );
  }

  // Read + canonicalise.
  const original = await fs.readFile(filePath, { encoding: "utf8" });
  const beforeHash = sha256Hex(original);
  const eol = detectEol(original);
  const canonical = canonicalize(original);

  // Refuse if there's already a wisp-inject block in this file — the agent
  // should call removeLiveScript first. (Defensive; the bridge avoids this.)
  const existing = findMarkerBlock(canonical, fileType, "inject");
  if (existing !== null) {
    throw new Error(
      "injectLiveScript: an existing wisp-inject block was found; remove first.",
    );
  }

  // Build marker payload + script tag.
  const injectId = parsedOpts.injectId ?? randomUUID();
  const marker: InjectMarker = InjectMarkerSchema.parse({
    injectId,
    insertedAt: new Date().toISOString(),
    bridgeUrl: parsedOpts.bridgeUrl,
    token: parsedOpts.token,
    beforeHash: sha256First256Bytes(canonical),
    scriptSrc: parsedOpts.inline
      ? undefined
      : `${parsedOpts.bridgeUrl}/live.js?token=${encodeURIComponent(parsedOpts.token)}`,
    inline: parsedOpts.inline,
  });

  // Find insertion point.
  const { startOffset, endOffset, startLine, endLine } = chooseInsertionPoint(
    canonical,
    parsedOpts.preferredAnchor,
    fileType,
  );

  // EOF guard: when appending at end-of-file onto content that doesn't end with
  // a newline, the open-marker would otherwise glue onto the file's last line.
  // findMarkerBlock would then treat that line's start (offset 0 for a one-line
  // file) as the marker-line start and removal would slice away user content.
  // Prepend a `\n` so the marker block always begins on its own physical line.
  // `eofPrefixNl` is recorded in the marker so removeLiveScript can strip that
  // same `\n` and restore the no-trailing-newline original byte-for-byte.
  const atEof = startOffset === canonical.length;
  const needsLeadingNl =
    atEof && canonical.length > 0 && canonical[canonical.length - 1] !== "\n";

  const startBody = serializeMarkerBody("inject-start", {
    injectId: marker.injectId,
    insertedAt: marker.insertedAt,
    bridgeUrl: marker.bridgeUrl,
    token: marker.token,
    beforeHash: marker.beforeHash,
    inline: marker.inline,
    eofPrefixNl: needsLeadingNl,
  });
  const endBody = serializeMarkerBody("inject-end", {
    injectId: marker.injectId,
  });
  const syntax = MARKER_SYNTAX[fileType];

  const scriptTag = parsedOpts.inline
    ? `<script id="${WISP_INJECT_SCRIPT_ID}" ${WISP_INJECT_DATA_ATTRIBUTE}="${marker.injectId}">/* wisp-design live inline */</script>`
    : `<script id="${WISP_INJECT_SCRIPT_ID}" ${WISP_INJECT_DATA_ATTRIBUTE}="${marker.injectId}" src=${JSON.stringify(marker.scriptSrc ?? "")} async></script>`;

  const block =
    `${syntax.open(startBody)}\n` +
    `${scriptTag}\n` +
    `${syntax.close(endBody)}`;

  // Splice using expandReplaceRange (zero-width replace at startOffset, endOffset).
  const next =
    canonical.slice(0, startOffset) +
    (needsLeadingNl ? "\n" : "") +
    block +
    "\n" +
    canonical.slice(endOffset);

  const final = applyEol(next, eol);
  await atomicWrite(filePath, final);
  const afterHash = sha256Hex(final);

  await appendUndo(
    {
      ts: new Date().toISOString(),
      sessionId: modOpts.sessionId ?? "no-session",
      kind: "inject-script",
      filePath,
      beforeSha256: beforeHash,
      afterSha256: afterHash,
      detail: {
        injectId: marker.injectId,
        bridgeUrl: marker.bridgeUrl,
        inline: marker.inline,
        insertionLine: startLine,
      },
    },
    { projectRoot: modOpts.projectRoot },
  );

  return {
    injectId: marker.injectId,
    startLine,
    endLine,
    beforeHash,
    afterHash,
  };
}

// ---------------------------------------------------------------------------
// removeLiveScript
// ---------------------------------------------------------------------------

export async function removeLiveScript(
  filePath: string,
  modOpts: InjectModuleOptions,
): Promise<RemoveResult> {
  const safety: SafetyResult = await safetyCheck(filePath, modOpts.projectRoot);
  if (!safety.ok) {
    throw new Error(
      `removeLiveScript: safety refused — ${safety.error.code}: ${safety.error.message}`,
    );
  }
  const { fileType } = safety;

  const original = await fs.readFile(filePath, { encoding: "utf8" });
  const beforeHash = sha256Hex(original);
  const eol = detectEol(original);
  const canonical = canonicalize(original);

  const block = findMarkerBlock(canonical, fileType, "inject");
  if (block === null) {
    throw new Error(
      "removeLiveScript: no wisp-inject block found in this file.",
    );
  }

  // Pull the open marker payload to recover injectId + beforeHash.
  const startLine = canonical
    .split("\n")
    [block.startLine] as string | undefined;
  const payloadMatch = startLine
    ? MARKER_SYNTAX[fileType].pattern.exec(startLine)
    : null;
  const parsed: { payload: Record<string, string> } = payloadMatch
    ? parseMarkerBody(payloadMatch[1] ?? "")
    : { payload: {} };

  const injectId = parsed.payload.injectId ?? "";
  const expectedBeforeHash = parsed.payload.beforeHash ?? "";

  // EOF-anchor restore: if inject prepended a leading `\n` before the marker
  // block (because the original file had no trailing newline), consume that
  // same `\n` here so the no-trailing-newline original is restored exactly.
  const eofPrefixNl = parsed.payload.eofPrefixNl === "true";
  const removeBlock =
    eofPrefixNl &&
    block.startOffset > 0 &&
    canonical[block.startOffset - 1] === "\n"
      ? { ...block, startOffset: block.startOffset - 1 }
      : block;

  // Replace the marker block with nothing — also strip a trailing newline if
  // the splice would leave a double blank line.
  const next = expandReplaceRange(canonical, removeBlock, "", eol);
  // Collapse a double-newline left at the splice site.
  const collapsed = collapseDoubleBlank(next, removeBlock.startOffset);

  // Byte-equivalence check: hash the first 256 bytes of the restored content
  // and compare to the marker's `beforeHash`.
  const restoredHash = sha256First256Bytes(collapsed);
  const byteEquivalent =
    expectedBeforeHash !== "" && restoredHash === expectedBeforeHash;

  const final = applyEol(collapsed, eol);
  await atomicWrite(filePath, final);
  const afterHash = sha256Hex(final);

  await appendUndo(
    {
      ts: new Date().toISOString(),
      sessionId: modOpts.sessionId ?? "no-session",
      kind: "remove-script",
      filePath,
      beforeSha256: beforeHash,
      afterSha256: afterHash,
      detail: {
        injectId,
        restoredByteEquivalent: byteEquivalent,
        expectedBeforeHash,
        observedRestoredHash: restoredHash,
      },
    },
    { projectRoot: modOpts.projectRoot },
  );

  return {
    removed: true,
    injectId,
    restoredByteEquivalent: byteEquivalent,
  };
}

// ---------------------------------------------------------------------------
// Anchor selection
// ---------------------------------------------------------------------------

interface InsertionPoint {
  startOffset: number;
  endOffset: number; // == startOffset for zero-width insertion
  startLine: number;
  endLine: number;
}

function chooseInsertionPoint(
  canonical: string,
  _preferred: InjectOptions["preferredAnchor"],
  fileType: SourceFileType,
): InsertionPoint {
  // Strategy:
  //   1. Before `</head>` → preserve indentation of the closing tag.
  //   2. Before `</body>` (fallback).
  //   3. Append at end-of-file.
  //
  // Vue/Svelte: the `<template>` block is the host; the same `</head>`-like
  // anchors do not exist. We fall through to end-of-file for SFCs, which is
  // suboptimal but safe — the bridge owns SFC injection via dev-server hooks
  // for production use. Phase 3 covers the common HTML entry-point case.
  if (fileType === "html") {
    // Anchor at the START of the line holding the closing tag, NOT at the `<`
    // offset. Splicing mid-line would donate the tag's leading indentation to
    // the marker block; removal would then strip that indentation and push the
    // closing tag to column 0 permanently. Line-start anchoring keeps the
    // marker on its own clean lines and leaves the closing tag untouched.
    const idx = canonical.search(/<\/head\s*>/i);
    if (idx !== -1) {
      return offsetToInsertionPoint(canonical, lineStartOffset(canonical, idx));
    }
    const bodyIdx = canonical.search(/<\/body\s*>/i);
    if (bodyIdx !== -1) {
      return offsetToInsertionPoint(
        canonical,
        lineStartOffset(canonical, bodyIdx),
      );
    }
  }
  // EOF — append at end-of-file. The caller's splice prepends a leading `\n`
  // when the file doesn't already end with one, so the marker block always
  // starts on its own physical line (see the `needsLeadingNl` guard in
  // injectLiveScript). That keeps inject→remove byte-equivalent.
  const eof = canonical.length;
  return {
    startOffset: eof,
    endOffset: eof,
    startLine: lineOfOffset(canonical, eof),
    endLine: lineOfOffset(canonical, eof),
  };
}

function offsetToInsertionPoint(canonical: string, atOffset: number): InsertionPoint {
  // Insert before `atOffset`. Caller's splice formula handles this.
  return {
    startOffset: atOffset,
    endOffset: atOffset,
    startLine: lineOfOffset(canonical, atOffset),
    endLine: lineOfOffset(canonical, atOffset),
  };
}

function lineOfOffset(s: string, offset: number): number {
  let line = 0;
  for (let i = 0; i < offset && i < s.length; i += 1) {
    if (s[i] === "\n") line += 1;
  }
  return line;
}

function lineStartOffset(s: string, off: number): number {
  const nl = s.lastIndexOf("\n", off - 1);
  return nl === -1 ? 0 : nl + 1;
}

function collapseDoubleBlank(s: string, near: number): string {
  // If the splice point now has `\n\n\n`+, reduce to `\n\n`.
  // Bounded scan — only look at the 4 chars before/after `near`.
  const lo = Math.max(0, near - 2);
  const hi = Math.min(s.length, near + 2);
  const window = s.slice(lo, hi);
  if (!window.includes("\n\n\n")) return s;
  return s.slice(0, lo) + window.replace(/\n{3,}/g, "\n\n") + s.slice(hi);
}

// ---------------------------------------------------------------------------
// Module export
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// discoverInjectedFiles + refreshInjectToken — Phase 7.1
//
// At session start, scan the project root for files already carrying a
// `wisp-inject-start:` marker (re-attached from a previous session). The
// agent records them in `state.injectedFiles` so accept-splice can find
// the right source file later, and refreshes the token query-param in the
// existing <script> tag so the browser POSTs authenticate.
// ---------------------------------------------------------------------------

import { promises as fsp } from "node:fs";
import * as nodePath from "node:path";

const INJECT_SCAN_EXTENSIONS = new Set([
  ".html", ".htm",
  ".jsx", ".tsx", ".js", ".ts",
  ".vue", ".svelte", ".astro",
]);

const INJECT_SCAN_SKIP_DIRS = new Set([
  "node_modules", "dist", "build", ".git", ".next", ".nuxt",
  ".svelte-kit", ".astro", "out", "coverage", ".wisp", ".turbo",
  ".cache", ".vite",
]);

const INJECT_MARKER_RE = /<!--\s*wisp-inject-start:/;

interface DiscoverOptions {
  projectRoot: string;
  maxFiles?: number;
}

export async function discoverInjectedFiles(
  opts: DiscoverOptions,
): Promise<string[]> {
  const maxFiles = opts.maxFiles ?? 32;
  const found: string[] = [];
  const stack: string[] = [opts.projectRoot];
  // BFS depth-capped to keep startup cost bounded on large monorepos.
  let visited = 0;
  while (stack.length > 0 && found.length < maxFiles && visited < 5000) {
    const dir = stack.shift()!;
    visited += 1;
    let entries;
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const ent of entries) {
      if (ent.name.startsWith(".") && !INJECT_SCAN_SKIP_DIRS.has(ent.name)) {
        // Allow scan of dotfiles other than hardcoded skip-dirs, but most
        // dotfiles aren't source — keep behavior conservative.
        continue;
      }
      const abs = nodePath.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (INJECT_SCAN_SKIP_DIRS.has(ent.name)) continue;
        stack.push(abs);
        continue;
      }
      const ext = nodePath.extname(ent.name).toLowerCase();
      if (!INJECT_SCAN_EXTENSIONS.has(ext)) continue;
      // Read just the first ~32KB to find the marker (it lives in <head>).
      let text: string;
      try {
        const fh = await fsp.open(abs, "r");
        try {
          const buf = Buffer.alloc(32 * 1024);
          const { bytesRead } = await fh.read(buf, 0, buf.length, 0);
          text = buf.subarray(0, bytesRead).toString("utf8");
        } finally {
          await fh.close();
        }
      } catch {
        continue;
      }
      if (INJECT_MARKER_RE.test(text)) {
        found.push(abs);
      }
    }
  }
  return found;
}

interface RefreshOptions {
  bridgeUrl: string;
  token: string;
}

const SCRIPT_SRC_RE =
  /<script\s+id=["']wisp-design-live["'][^>]*\bsrc=["']([^"']+)["'][^>]*>/;
// `[^\s>]*` (zero-or-more, not one-or-more) so a previously-emptied token
// field — e.g. left over from a broken sed/test pipeline — still matches
// and can be repopulated by the next refresh.
const INJECT_START_TOKEN_RE = /(<!--\s*wisp-inject-start:[^>]*?\btoken=)([^\s>]*)/;

export async function refreshInjectToken(
  filePath: string,
  opts: RefreshOptions,
  ctx: { projectRoot: string },
): Promise<void> {
  void ctx; // currently unused but kept for symmetry
  let text: string;
  try {
    text = await fsp.readFile(filePath, "utf8");
  } catch {
    return;
  }
  // Rewrite the token in the <script src=…> AND in the <!-- wisp-inject-start … -->
  // marker. Both should always agree so the browser auto-init can match.
  let next = text;
  const scriptMatch = SCRIPT_SRC_RE.exec(next);
  if (scriptMatch && scriptMatch[1]) {
    const oldSrc = scriptMatch[1];
    let newSrc = oldSrc;
    try {
      const u = new URL(oldSrc);
      u.searchParams.set("token", opts.token);
      // Also rewrite origin so the script re-points at the new bridge port.
      const newBase = new URL(opts.bridgeUrl);
      u.protocol = newBase.protocol;
      u.host = newBase.host;
      newSrc = u.toString();
    } catch {
      newSrc = `${opts.bridgeUrl}/live.js?token=${encodeURIComponent(opts.token)}`;
    }
    next = next.replace(SCRIPT_SRC_RE, (full) =>
      full.replace(oldSrc, newSrc),
    );
  }
  next = next.replace(INJECT_START_TOKEN_RE, (_m, prefix) =>
    `${prefix}${opts.token}`,
  );
  if (next !== text) {
    await fsp.writeFile(filePath, next, "utf8");
  }
}

export const injectModule = { injectLiveScript, removeLiveScript, discoverInjectedFiles, refreshInjectToken };
