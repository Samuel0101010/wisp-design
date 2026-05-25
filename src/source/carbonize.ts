// wisp-design — Carbonize: bake an @scope variant into permanent selectors.
//
// Input  : `@scope ([data-wisp-variant="N"]) { :scope { --x:16px } .child { padding: var(--x) } }`
// Output : `<scopeSelector> .child { padding: 16px; }`
//
// Steps: strip comments → parse outer @scope → collect :scope vars → merge
// with paramOverrides → bake var() refs → rewrite selectors (`:scope` and
// bare selectors gain scopeSelector prefix) → preserve @media/@supports →
// drop consumed `:scope` decl block. Throws on malformed CSS (we control
// what reaches carbonize).

import type { CarbonizeOptions } from "../contracts/source.js";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function carbonize(css: string, opts: CarbonizeOptions): string {
  const stripped = stripComments(css);
  const trimmed = stripped.trim();
  if (trimmed === "") return "";

  const root = parseRule(trimmed, 0);
  if (root === null) {
    throw new Error("carbonize: empty input after comment-strip");
  }

  // The outermost rule MUST be `@scope ( … )`. Anything else is malformed.
  if (!root.rule.selector.startsWith("@scope")) {
    throw new Error(
      `carbonize: expected @scope rule, got "${root.rule.selector.slice(0, 40)}"`,
    );
  }

  // Pre-scan `:scope { … }` declarations to seed the var map.
  const scopeVars = collectScopeVars(root.rule);
  const merged: Record<string, string> = { ...scopeVars, ...opts.paramOverrides };

  // Emit rules from root body. The `:scope` block has dual purpose:
  // (a) CSS variable bindings (`:scope { --x: 16px }`) → consumed into
  //     the var map and substituted into descendant declarations.
  // (b) Real style declarations (`:scope { padding: 2em }`) → emitted
  //     against the scope-selector so they actually apply to the picked
  //     element. Without this, a variant like `:scope { padding: 2em }`
  //     would carbonize to an EMPTY style block — bug found Phase 7.7.
  const lines: string[] = [];
  for (const child of root.rule.children) {
    if (child.kind === "rule") {
      if (child.selector === ":scope") {
        // Emit non-var declarations against the scope selector.
        const nonVarDecls: string[] = [];
        for (const decl of child.children) {
          if (decl.kind !== "decl") continue;
          const clean = decl.text.replace(/;\s*$/, "").trim();
          if (clean === "") continue;
          const idx = clean.indexOf(":");
          if (idx === -1) continue;
          const prop = clean.slice(0, idx).trim();
          if (prop.startsWith("--")) continue; // already in merged map
          const baked = bakeDeclaration(decl.text, merged);
          if (baked !== null) nonVarDecls.push(`  ${baked};`);
        }
        if (nonVarDecls.length > 0) {
          lines.push(`${opts.scopeSelector} {`);
          for (const d of nonVarDecls) lines.push(d);
          lines.push(`}`);
        }
        continue;
      }
      emitRule(child, opts.scopeSelector, merged, lines, 0);
    } else {
      // Stray declarations directly inside `@scope` body (not inside `:scope`).
      // Emit as a fallback rule against the scopeSelector itself.
      // This path is rare; we keep it so malformed inputs degrade gracefully.
      lines.push(`${opts.scopeSelector} { ${child.text} }`);
    }
  }

  return lines.join("\n") + (lines.length > 0 ? "\n" : "");
}

// ---------------------------------------------------------------------------
// Tokeniser / parser — recursive descent over `selector { body }` blocks.
// ---------------------------------------------------------------------------

interface Rule {
  selector: string; // raw selector text (group preserved, e.g. ".a, .b")
  children: ChildNode[];
  isAtMedia: boolean; // @media / @supports — preserve wrapper on emit
}

type ChildNode =
  | { kind: "rule"; selector: string; children: ChildNode[]; isAtMedia: boolean }
  | { kind: "decl"; text: string }; // `property: value;` (semi included if present)

function stripComments(input: string): string {
  // Quote-aware /* … */ removal. CSS allows `"…/* not a comment */…"`.
  let out = "";
  let i = 0;
  let quote: '"' | "'" | null = null;
  while (i < input.length) {
    const ch = input[i] as string;
    if (quote !== null) {
      out += ch;
      if (ch === "\\" && i + 1 < input.length) { out += input[i + 1] as string; i += 2; continue; }
      if (ch === quote) quote = null;
      i += 1; continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; out += ch; i += 1; continue; }
    if (ch === "/" && input[i + 1] === "*") {
      const end = input.indexOf("*/", i + 2);
      if (end === -1) return out; // unterminated — bail
      i = end + 2; continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

interface ParsedRule {
  rule: Rule;
  end: number; // index just past the closing `}`
}

// Parse a single rule starting at `from` (skipping leading whitespace).
// Returns null if no rule found (end of input).
function parseRule(input: string, from: number): ParsedRule | null {
  let i = skipWs(input, from);
  if (i >= input.length) return null;

  // Selector runs until the first un-quoted `{` at depth 0.
  const selStart = i;
  let quote: '"' | "'" | null = null;
  let parenDepth = 0;
  while (i < input.length) {
    const ch = input[i] as string;
    if (quote !== null) {
      if (ch === "\\" && i + 1 < input.length) { i += 2; continue; }
      if (ch === quote) quote = null;
      i += 1; continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; i += 1; continue; }
    if (ch === "(") { parenDepth += 1; i += 1; continue; }
    if (ch === ")") { parenDepth = Math.max(0, parenDepth - 1); i += 1; continue; }
    if (ch === "{" && parenDepth === 0) break;
    if (ch === ";" && parenDepth === 0) {
      const sel = input.slice(selStart, i).trim();
      if (sel === "") return parseRule(input, i + 1);
      return { rule: { selector: sel, children: [], isAtMedia: false }, end: i + 1 };
    }
    i += 1;
  }
  if (i >= input.length) {
    // Selector with no body — malformed.
    throw new Error(
      `carbonize: unterminated rule starting at offset ${selStart} (expected "{")`,
    );
  }

  const selector = input.slice(selStart, i).trim();
  const isAtMedia =
    selector.startsWith("@media") || selector.startsWith("@supports");

  // Consume the opening `{`, parse body, expect closing `}`.
  i += 1; // past `{`
  const children: ChildNode[] = [];
  while (true) {
    i = skipWs(input, i);
    if (i >= input.length) {
      throw new Error("carbonize: unterminated block (missing `}`)");
    }
    if ((input[i] as string) === "}") {
      i += 1;
      break;
    }
    // Lookahead: nested rule (has un-quoted `{` before the next un-quoted `;`)?
    if (looksLikeRule(input, i)) {
      const nested = parseRule(input, i);
      if (nested === null) break;
      children.push({
        kind: "rule",
        selector: nested.rule.selector,
        children: nested.rule.children,
        isAtMedia: nested.rule.isAtMedia,
      });
      i = nested.end;
    } else {
      // Declaration: read until next un-quoted `;` or `}`.
      const declStart = i;
      let q: '"' | "'" | null = null;
      while (i < input.length) {
        const ch = input[i] as string;
        if (q !== null) {
          if (ch === "\\" && i + 1 < input.length) { i += 2; continue; }
          if (ch === q) q = null;
          i += 1; continue;
        }
        if (ch === '"' || ch === "'") { q = ch; i += 1; continue; }
        if (ch === ";") { i += 1; break; }
        if (ch === "}") break;
        i += 1;
      }
      const declText = input.slice(declStart, i).trim();
      if (declText !== "") children.push({ kind: "decl", text: declText });
    }
  }

  return {
    rule: { selector, children, isAtMedia },
    end: i,
  };
}

function looksLikeRule(input: string, from: number): boolean {
  // Return true iff between `from` and the next un-quoted `;` or `}` at
  // depth-0 there is an un-quoted `{`. Otherwise it's a declaration.
  let i = from;
  let q: '"' | "'" | null = null;
  let parenDepth = 0;
  while (i < input.length) {
    const ch = input[i] as string;
    if (q !== null) {
      if (ch === "\\" && i + 1 < input.length) { i += 2; continue; }
      if (ch === q) q = null;
      i += 1; continue;
    }
    if (ch === '"' || ch === "'") { q = ch; i += 1; continue; }
    if (ch === "(") { parenDepth += 1; i += 1; continue; }
    if (ch === ")") { parenDepth = Math.max(0, parenDepth - 1); i += 1; continue; }
    if (parenDepth === 0) {
      if (ch === "{") return true;
      if (ch === ";" || ch === "}") return false;
    }
    i += 1;
  }
  return false;
}

function skipWs(input: string, from: number): number {
  let i = from;
  while (i < input.length) {
    const ch = input[i] as string;
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") { i += 1; continue; }
    break;
  }
  return i;
}

// ---------------------------------------------------------------------------
// :scope var collection
// ---------------------------------------------------------------------------

function collectScopeVars(rootRule: Rule): Record<string, string> {
  const out: Record<string, string> = {};
  for (const child of rootRule.children) {
    if (child.kind !== "rule") continue;
    if (child.selector !== ":scope") continue;
    for (const decl of child.children) {
      if (decl.kind !== "decl") continue;
      const idx = decl.text.indexOf(":");
      if (idx === -1) continue;
      const name = decl.text.slice(0, idx).trim();
      const value = decl.text.slice(idx + 1).trim().replace(/;$/, "").trim();
      if (name.startsWith("--")) out[name] = value;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// var(--x[, fallback]) substitution
// ---------------------------------------------------------------------------

function bakeVars(value: string, vars: Record<string, string>): string {
  // Scan for `var(` and recursively substitute. Handles nested var() inside
  // calc() naturally because we just splice the resolved string in-place and
  // let the outer wrapper (calc, etc.) re-parse on each pass.
  let out = "";
  let i = 0;
  while (i < value.length) {
    if (value.startsWith("var(", i)) {
      // Find matching `)`.
      let depth = 1;
      let j = i + 4;
      while (j < value.length && depth > 0) {
        const ch = value[j] as string;
        if (ch === "(") depth += 1;
        else if (ch === ")") depth -= 1;
        if (depth === 0) break;
        j += 1;
      }
      if (depth !== 0) {
        // Unterminated var() — keep literal.
        out += value.slice(i);
        return out;
      }
      const inner = value.slice(i + 4, j);
      // Split on first `,` outside any nested parens.
      const commaIdx = findTopLevelComma(inner);
      const rawName = (commaIdx === -1 ? inner : inner.slice(0, commaIdx)).trim();
      const fallback = commaIdx === -1 ? "" : inner.slice(commaIdx + 1).trim();
      if (rawName in vars) {
        out += bakeVars(vars[rawName] as string, vars);
      } else if (fallback !== "") {
        out += bakeVars(fallback, vars);
      } else {
        out += value.slice(i, j + 1); // keep `var(--x)` literal
      }
      i = j + 1;
      continue;
    }
    out += value[i] as string;
    i += 1;
  }
  return out;
}

function findTopLevelComma(s: string): number {
  let depth = 0;
  let q: '"' | "'" | null = null;
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i] as string;
    if (q !== null) {
      if (ch === "\\" && i + 1 < s.length) { i += 1; continue; }
      if (ch === q) q = null;
      continue;
    }
    if (ch === '"' || ch === "'") { q = ch; continue; }
    if (ch === "(") depth += 1;
    else if (ch === ")") depth -= 1;
    else if (ch === "," && depth === 0) return i;
  }
  return -1;
}

// ---------------------------------------------------------------------------
// Selector rewrite + rule emission
// ---------------------------------------------------------------------------

function rewriteSelector(selector: string, scopeSelector: string): string {
  const groups: string[] = [];
  let depth = 0;
  let q: '"' | "'" | null = null;
  let start = 0;
  for (let i = 0; i < selector.length; i += 1) {
    const ch = selector[i] as string;
    if (q !== null) {
      if (ch === "\\" && i + 1 < selector.length) { i += 1; continue; }
      if (ch === q) q = null;
      continue;
    }
    if (ch === '"' || ch === "'") { q = ch; continue; }
    if (ch === "(" || ch === "[") depth += 1;
    else if (ch === ")" || ch === "]") depth -= 1;
    else if (ch === "," && depth === 0) {
      groups.push(selector.slice(start, i).trim());
      start = i + 1;
    }
  }
  groups.push(selector.slice(start).trim());
  return groups
    .map((g) => rewriteSingleSelector(g, scopeSelector))
    .filter((g) => g !== "")
    .join(", ");
}

function rewriteSingleSelector(sel: string, scopeSelector: string): string {
  if (sel === "") return "";
  if (sel === ":scope") return scopeSelector;
  // Phase 7.11 — strip redundant picked-tag prefix.
  // Variants are authored against the live preview where `:scope` is the
  // variant-wrapper div and `:scope > <picked-tag>` is the picked element.
  // After carbonize, `:scope` becomes the picked-element selector, so a
  // naive rewrite of `:scope > article` produces `article.x > article` —
  // looking for a non-existent nested article. Detect when the first
  // descendant token matches the picked element's tag and strip it.
  const pickedTag = extractTagFromScopeSelector(scopeSelector);
  if (pickedTag !== null) {
    const re = new RegExp(`^:scope\\s*>\\s*${pickedTag}(?![\\w-])`, "i");
    const m = sel.match(re);
    if (m !== null) {
      return `${scopeSelector}${sel.slice(m[0].length)}`;
    }
  }
  // `:scope .child` → `<scope> .child`; `:scope.foo` → `<scope>.foo` (glued).
  if (sel.startsWith(":scope")) return `${scopeSelector}${sel.slice(":scope".length)}`;
  // Phase 7.14 — bare-picked-tag prefix without `:scope`.
  // The variant-render @scope is rooted at the variant-wrapper-div, whose
  // direct child IS the picked element. Authors who write `article > ...`
  // (thinking of the picked article as `:scope`) work in live preview
  // because the descendant combinator after @scope walks into the article.
  // But carbonize was naively prepending `${scopeSelector} ${sel}` here,
  // which produced `article.x article > ...` — a non-existent nested article.
  // Detect when the selector STARTS with the picked tag immediately followed
  // by a combinator (space, `>`, `+`, `~`), a pseudo-class/element prefix
  // (`:` covers both `:hover` and `::first-letter`), a comma group separator,
  // or end-of-selector — that's the "I-meant-the-picked-element" shape — and
  // replace the tag with the scope.
  // Compound shapes like `article.foo`, `article#id`, `article[attr]` are
  // NOT stripped (the trailing `.`/`#`/`[` is not in the allowed follow-set),
  // so they fall through to the safe prepend path and remain matchable as a
  // stricter descendant inside the picked element's subtree.
  if (pickedTag !== null) {
    const re = new RegExp(`^${pickedTag}(?=\\s|[>+~,:]|$)`, "i");
    const m = sel.match(re);
    if (m !== null) {
      const rest = sel.slice(m[0].length);
      if (rest === "") return scopeSelector;
      return `${scopeSelector}${rest}`;
    }
  }
  return `${scopeSelector} ${sel}`;
}

function extractTagFromScopeSelector(scopeSelector: string): string | null {
  // Parse the leading tag of the first compound selector. Handles:
  //   "article.bg-white.border" → "article"
  //   "div#main"                → "div"
  //   "button[type='submit']"   → "button"
  //   ".class-only"             → null (no tag)
  //   "h3 > span"               → "h3"
  const trimmed = scopeSelector.trim();
  const m = trimmed.match(/^([a-zA-Z][a-zA-Z0-9-]*)/);
  return m !== null ? (m[1] as string).toLowerCase() : null;
}

function emitRule(
  rule: ChildNode & { kind: "rule" },
  scopeSelector: string,
  vars: Record<string, string>,
  out: string[],
  depth: number,
): void {
  if (rule.isAtMedia) {
    // Preserve the @media/@supports wrapper; recurse into its body. Selectors
    // *inside* still get rewritten relative to the scopeSelector.
    const innerLines: string[] = [];
    for (const child of rule.children) {
      if (child.kind === "rule") {
        emitRule(child, scopeSelector, vars, innerLines, depth + 1);
      } else {
        // Bare declarations inside @media body — emit against scopeSelector.
        innerLines.push(`${scopeSelector} { ${child.text}; }`);
      }
    }
    const pad = "  ".repeat(depth);
    out.push(`${pad}${rule.selector} {`);
    for (const line of innerLines) out.push(`${pad}  ${line}`);
    out.push(`${pad}}`);
    return;
  }

  // Plain selector rule.
  const newSel = rewriteSelector(rule.selector, scopeSelector);
  if (newSel === "") return;

  const decls: string[] = [];
  for (const child of rule.children) {
    if (child.kind === "decl") {
      const baked = bakeDeclaration(child.text, vars);
      if (baked !== null) decls.push(`  ${baked};`);
    } else {
      // Nested rule (CSS nesting). Re-emit relative to combined selector.
      // For Phase 3 we don't support nesting deep; emit a flat fallback by
      // prefixing the parent selector. Edge-case, kept simple.
      const combined = `${newSel} ${child.selector}`;
      const fake: ChildNode & { kind: "rule" } = {
        kind: "rule",
        selector: combined,
        children: child.children,
        isAtMedia: child.isAtMedia,
      };
      emitRule(fake, "", vars, out, depth);
    }
  }

  if (decls.length === 0) return;
  const pad = "  ".repeat(depth);
  out.push(`${pad}${newSel} {`);
  for (const d of decls) out.push(`${pad}${d}`);
  out.push(`${pad}}`);
}

function bakeDeclaration(
  text: string,
  vars: Record<string, string>,
): string | null {
  // text is like `padding: var(--pad)` or `color: red` — strip trailing `;`.
  const clean = text.replace(/;\s*$/, "").trim();
  if (clean === "") return null;
  const idx = clean.indexOf(":");
  if (idx === -1) return null;
  const prop = clean.slice(0, idx).trim();
  const value = clean.slice(idx + 1).trim();
  const baked = bakeVars(value, vars);
  return `${prop}: ${baked}`;
}

// ---------------------------------------------------------------------------
// CarbonizeModule export
// ---------------------------------------------------------------------------

export const carbonizeModule = { carbonize };
