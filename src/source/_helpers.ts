// wisp-design — Source-edit-engine shared helpers (Phase 3).
//
// EOL detection, canonicalisation, SHA hashing, marker serialise/parse,
// findMarkerBlock, expandReplaceRange, atomic write, file-type discovery.
// These are pulled out of accept.ts so inject.ts / wrap.ts / accept.ts each
// stay below the 500-line ceiling and the shared surface is auditable in one
// place.

import { promises as fs } from "node:fs";
import { createHash } from "node:crypto";
import { extname } from "node:path";

import {
  type EolConvention,
  type MarkerBlock,
  type MarkerBlockFilter,
  type MarkerGroup,
  type MarkerKind,
  MARKER_SYNTAX,
  type SourceFileType,
  SUPPORTED_EXTENSIONS,
} from "../contracts/source.js";

// ---------------------------------------------------------------------------
// EOL helpers
// ---------------------------------------------------------------------------

export function detectEol(content: string): EolConvention {
  // First newline run in the buffer wins. Files with no newline → "\n".
  for (let i = 0; i < content.length; i += 1) {
    const ch = content[i] as string;
    if (ch === "\n") return "\n";
    if (ch === "\r") {
      if (content[i + 1] === "\n") return "\r\n";
      return "\r";
    }
  }
  return "\n";
}

export function canonicalize(content: string): string {
  let s = content;
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  return s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

export function applyEol(content: string, eol: EolConvention): string {
  if (eol === "\n") return content;
  return content.replace(/\n/g, eol);
}

// ---------------------------------------------------------------------------
// SHA helpers
// ---------------------------------------------------------------------------

export function sha256Hex(s: string | Buffer): string {
  const h = createHash("sha256");
  h.update(typeof s === "string" ? Buffer.from(s, "utf8") : s);
  return h.digest("hex");
}

export function sha256First256Bytes(s: string): string {
  const buf = Buffer.from(s, "utf8");
  return sha256Hex(buf.slice(0, 256));
}

// ---------------------------------------------------------------------------
// Marker body serialise/parse — `wisp-<kind>:k=v k2=v2`
// ---------------------------------------------------------------------------

const MARKER_KIND_VALUES: ReadonlySet<MarkerKind> = new Set<MarkerKind>([
  "inject-start",
  "inject-end",
  "variants-start",
  "variants-end",
  "style-start",
  "style-end",
]);

export function serializeMarkerBody(
  kind: MarkerKind,
  payload: Record<string, string | number | boolean>,
): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(payload)) {
    const sv = typeof v === "boolean" ? (v ? "true" : "false") : String(v);
    parts.push(`${k}=${encodeURIComponent(sv)}`);
  }
  return `wisp-${kind}:${parts.join(" ")}`;
}

export function parseMarkerBody(
  body: string,
):
  | { kind: MarkerKind; payload: Record<string, string> }
  | { kind: null; payload: Record<string, string>; raw: string } {
  let s = body.trim();
  if (s.startsWith("wisp-")) s = s.slice("wisp-".length);
  const colonIdx = s.indexOf(":");
  if (colonIdx === -1) return { kind: null, payload: {}, raw: body };
  const kindRaw = s.slice(0, colonIdx).trim();
  const rest = s.slice(colonIdx + 1).trim();
  if (!MARKER_KIND_VALUES.has(kindRaw as MarkerKind)) {
    return { kind: null, payload: {}, raw: body };
  }
  const kind = kindRaw as MarkerKind;

  const payload: Record<string, string> = {};
  if (rest !== "") {
    const tokens = rest.split(/\s+/);
    for (const tok of tokens) {
      if (tok === "") continue;
      const eqIdx = tok.indexOf("=");
      if (eqIdx === -1) {
        payload[tok] = "";
        continue;
      }
      const k = tok.slice(0, eqIdx);
      const v = tok.slice(eqIdx + 1);
      try {
        payload[k] = decodeURIComponent(v);
      } catch {
        payload[k] = v;
      }
    }
  }
  return { kind, payload };
}

export function groupOfKind(kind: MarkerKind): MarkerGroup {
  if (kind === "inject-start" || kind === "inject-end") return "inject";
  if (kind === "variants-start" || kind === "variants-end") return "variants";
  return "style";
}

// ---------------------------------------------------------------------------
// findMarkerBlock — line-by-line scanner driven by MARKER_SYNTAX[fileType].
// ---------------------------------------------------------------------------

export function findMarkerBlock(
  content: string,
  fileType: SourceFileType,
  group: MarkerGroup,
  filter: MarkerBlockFilter = {},
): MarkerBlock | null {
  const pattern = new RegExp(MARKER_SYNTAX[fileType].pattern.source, "");
  const lines = content.split("\n");
  const lineOffsets: number[] = new Array(lines.length);
  let cursor = 0;
  for (let i = 0; i < lines.length; i += 1) {
    lineOffsets[i] = cursor;
    cursor += (lines[i] as string).length + 1;
  }

  let openLine = -1;
  let openOffset = -1;
  let openPayload: Record<string, string> = {};

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] as string;
    const m = pattern.exec(line);
    if (!m) continue;
    const bodyMatch = m[1];
    if (bodyMatch === undefined) continue;
    const parsed = parseMarkerBody(bodyMatch);
    if (parsed.kind === null) continue;
    if (groupOfKind(parsed.kind) !== group) continue;

    if (openLine === -1) {
      if (!parsed.kind.endsWith("-start")) continue;
      if (
        filter.sessionId !== undefined &&
        parsed.payload.sessionId !== filter.sessionId
      ) {
        continue;
      }
      if (
        filter.targetId !== undefined &&
        parsed.payload.targetId !== filter.targetId
      ) {
        continue;
      }
      openLine = i;
      openOffset = lineOffsets[i] as number;
      openPayload = parsed.payload;
    } else {
      if (!parsed.kind.endsWith("-end")) continue;
      const endLine = i;
      const nextStart =
        i + 1 < lines.length
          ? (lineOffsets[i + 1] as number)
          : content.length;
      return {
        startLine: openLine,
        endLine,
        startOffset: openOffset,
        endOffset: nextStart,
        group,
        payload: openPayload,
      };
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// expandReplaceRange — pure splice on canonical content.
// ---------------------------------------------------------------------------

export function expandReplaceRange(
  content: string,
  block: MarkerBlock,
  replacement: string,
  _eolConvention: EolConvention,
): string {
  return (
    content.slice(0, block.startOffset) +
    replacement +
    content.slice(block.endOffset)
  );
}

// ---------------------------------------------------------------------------
// Atomic write
// ---------------------------------------------------------------------------

export async function atomicWrite(
  filePath: string,
  content: string,
): Promise<void> {
  const tmp = `${filePath}.wisp-tmp`;
  await fs.writeFile(tmp, content, { encoding: "utf8" });
  await fs.rename(tmp, filePath);
}

// ---------------------------------------------------------------------------
// File-type discovery (extension-based).
// ---------------------------------------------------------------------------

export function fileTypeFromPath(filePath: string): SourceFileType | null {
  const ext = extname(filePath).toLowerCase();
  return SUPPORTED_EXTENSIONS[ext] ?? null;
}
