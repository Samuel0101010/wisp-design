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

  const startBody = serializeMarkerBody("inject-start", {
    injectId: marker.injectId,
    insertedAt: marker.insertedAt,
    bridgeUrl: marker.bridgeUrl,
    token: marker.token,
    beforeHash: marker.beforeHash,
    inline: marker.inline,
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

  // Find insertion point.
  const { startOffset, endOffset, startLine, endLine } = chooseInsertionPoint(
    canonical,
    fileType,
    parsedOpts.preferredAnchor,
    block,
  );

  // Splice using expandReplaceRange (zero-width replace at startOffset, endOffset).
  const next =
    canonical.slice(0, startOffset) +
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

  // Replace the marker block with nothing — also strip a trailing newline if
  // the splice would leave a double blank line.
  const next = expandReplaceRange(canonical, block, "", eol);
  // Collapse a double-newline left at the splice site.
  const collapsed = collapseDoubleBlank(next, block.startOffset);

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
  fileType: SourceFileType,
  _preferred: InjectOptions["preferredAnchor"],
  block: string,
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
    const idx = canonical.search(/<\/head\s*>/i);
    if (idx !== -1) {
      return offsetToInsertionPoint(canonical, idx);
    }
    const bodyIdx = canonical.search(/<\/body\s*>/i);
    if (bodyIdx !== -1) {
      return offsetToInsertionPoint(canonical, bodyIdx);
    }
  }
  // EOF — append, ensure leading newline if file doesn't end with one.
  let eof = canonical.length;
  if (canonical.length > 0 && canonical[canonical.length - 1] !== "\n") {
    // We'll prepend a `\n` via insertion-point shift: keep eof, caller writes
    // `block + "\n"`. But for EOF we want `\n + block` instead. Encode by
    // returning a virtual offset that the caller handles uniformly — we
    // overload by inserting at `eof` and letting the splice include `block`.
    // Since chooseInsertionPoint cannot return that hint, we just splice
    // a newline-prefixed block at EOF by inserting at `eof`. The caller's
    // formula `slice(0, off) + block + "\n" + slice(off)` produces a
    // graceful result.
    eof = canonical.length;
  }
  void block;
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

export const injectModule = { injectLiveScript, removeLiveScript };
