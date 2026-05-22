// wisp-design — CSP helpers for source-inject (Phase 3 wires these into the
// HTML splice). Pure functions, no I/O. Reversible: `markOriginalCsp` records
// the pre-inject CSP so Phase 3 can restore on `live --stop`.

const HEAD_OPEN_RE = /<head(\s[^>]*)?>/i;

export function parseCsp(headerValue: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const raw of headerValue.split(";")) {
    const trimmed = raw.trim();
    if (trimmed.length === 0) continue;
    const parts = trimmed.split(/\s+/);
    const directive = parts[0];
    if (directive === undefined || directive.length === 0) continue;
    const sources = parts.slice(1);
    // Last-write-wins matches browser CSP merge semantics.
    out.set(directive.toLowerCase(), sources);
  }
  return out;
}

export function serializeCsp(parsed: Map<string, string[]>): string {
  const segments: string[] = [];
  for (const [directive, sources] of parsed) {
    if (sources.length === 0) {
      segments.push(directive);
    } else {
      segments.push(`${directive} ${sources.join(" ")}`);
    }
  }
  return segments.join("; ");
}

export function allowScriptSource(
  parsed: Map<string, string[]>,
  source: string,
): Map<string, string[]> {
  const next = new Map<string, string[]>();
  for (const [k, v] of parsed) next.set(k, [...v]);

  const existing = next.get("script-src");
  if (existing !== undefined) {
    if (!existing.includes(source)) existing.push(source);
    return next;
  }
  const defaultSrc = next.get("default-src");
  if (defaultSrc !== undefined) {
    const seeded = [...defaultSrc];
    if (!seeded.includes(source)) seeded.push(source);
    next.set("script-src", seeded);
    return next;
  }
  // No default-src, no script-src — create one that doesn't block the inject.
  next.set("script-src", ["'self'", source]);
  return next;
}

function toBase64(input: string): string {
  return Buffer.from(input, "utf8").toString("base64");
}

export function markOriginalCsp(html: string, original: string | null): string {
  const content = original === null ? "none" : toBase64(original);
  const tag = `<meta name="data-wisp-csp-original" content="${content}">`;
  const headMatch = HEAD_OPEN_RE.exec(html);
  if (headMatch === null) {
    // No <head> — prepend the tag so Phase 3's reverse can still find it.
    return `${tag}\n${html}`;
  }
  const insertAt = headMatch.index + headMatch[0].length;
  return `${html.slice(0, insertAt)}\n  ${tag}${html.slice(insertAt)}`;
}

export function readMarkedOriginalCsp(html: string): string | null | undefined {
  // Companion to `markOriginalCsp` — Phase 3 source/inject.ts uses it on
  // `--stop` to restore the original CSP. undefined = tag absent (never
  // injected); null = injected onto a page that had no CSP to begin with;
  // string = original header to restore.
  const re =
    /<meta\s+name=["']data-wisp-csp-original["']\s+content=["']([^"']*)["']\s*\/?>/i;
  const m = re.exec(html);
  if (m === null) return undefined;
  const content = m[1] ?? "";
  if (content === "none") return null;
  try {
    return Buffer.from(content, "base64").toString("utf8");
  } catch {
    return undefined;
  }
}
