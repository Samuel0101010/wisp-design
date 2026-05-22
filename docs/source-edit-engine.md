# Source-Edit Engine — Phase 3

The Phase-3 engine reads, mutates, and writes actual project source files for
three operations: **inject** the `<script src="…/live.js">` tag into the dev
HTML entry; **wrap** a target node in variant brackets so HMR renders all N
variants at once; **accept** (splice the chosen variant back in, carbonize the
`@scope` rule into permanent selectors, bake CSS-var overrides) or **discard**
(restore the wrapped original byte-for-byte).

Every path is mediated by `safetyCheck`. No module trusts a `filePath`
argument — defense in depth, mirror of `bridge/auth.ts` `guardPath`.

## Architecture

```
caller (Phase-4 agent loop)
  │
  ▼
safetyCheck(filePath, projectRoot)
  │   ├── PATH_OUTSIDE_ROOT / REFUSE_LIST_MATCH / GENERATED_MAGIC_COMMENT
  │   │   / BINARY_FILE / FILE_TOO_LARGE / UNSUPPORTED_FILE_TYPE
  │   │   / READ_ONLY_FILE / SYMLINK_ESCAPE   → fail → suggestedFallback
  │   └── ok → { filePath, fileType, eolConvention }
  │
  ▼  route by fileType → pick MARKER_SYNTAX[fileType]
  ┌───────────────────────────────────────────────────────────────┐
  │ inject:   findMarkerBlock("inject")? remove first.            │
  │ wrap:     splice into source, write originalBase64 payload.   │
  │ accept:   findMarkerBlock("variants") + extractVariant(id)    │
  │           → carbonize → expandReplaceRange → atomic write.    │
  │ discard:  findMarkerBlock("variants") → restore base64 → write.│
  └───────────────────────────────────────────────────────────────┘
  │
  ▼
atomic write (write to <file>.wisp-tmp then rename)
  │
  ▼
undo-stack.append({ kind, ts, filePath, beforeSha256, afterSha256, detail })
```

## Marker syntax

Every wisp marker is a single comment line of the shape

    wisp-<kind>:<key>=<val> <key2>=<val2> …

`<kind>` is one of `inject-start`, `inject-end`, `variants-start`,
`variants-end`, `style-start`, `style-end`. Values containing whitespace,
`=`, or `"` are `encodeURIComponent`-escaped at write time and
`decodeURIComponent`-restored at parse time.

| File type             | Open / close delimiter            | Example                                                              |
| --------------------- | --------------------------------- | -------------------------------------------------------------------- |
| `.tsx`, `.jsx`        | `{/* … */}` (JSX expression)      | `{/* wisp-variants-start:sessionId=abc targetId=t1 variantCount=3 */}` |
| `.html`, `.htm`       | `<!-- … -->`                      | `<!-- wisp-inject-start:injectId=01H… bridgeUrl=http%3A%2F%2Fl…  -->`  |
| `.vue`                | `<!-- … -->` (in `<template>`)    | `<!-- wisp-variants-start:sessionId=abc targetId=t1 variantCount=3 -->` |
| `.svelte`             | `<!-- … -->`                      | `<!-- wisp-style-start:sessionId=abc scopeBase=%5Bdata-wisp-target%3D%22t1%22%5D --> ` |
| `.css`                | `/* … */`                         | `/* wisp-variants-start:sessionId=abc targetId=t1 variantCount=3 */`   |

The colon after `<kind>` is the key disambiguator — generic mentions of
"wisp" in user code won't false-match. Marker kinds are listed in
`MarkerKindSchema`; the file-type → syntax table lives in `MARKER_SYNTAX`.

### Marker groups

`findMarkerBlock` operates on **groups**, not individual open/close kinds:

| Group      | Open               | Close            | Owner |
| ---------- | ------------------ | ---------------- | ----- |
| `inject`   | `inject-start`     | `inject-end`     | inject.ts |
| `variants` | `variants-start`   | `variants-end`   | wrap.ts / accept.ts |
| `style`    | `style-start`      | `style-end`      | wrap.ts / carbonize.ts |

## Byte-equivalence contract

For inject + remove, and wrap + discard, the contract is:

    sha256(read(file) before op) === sha256(read(file) after inverse op)

The unit-test layer (`tests/source/`) enforces this on a representative
fixture per supported file type. **Phase 5 verification-gate** relies on
this: a discarded variant must leave zero residue, otherwise diffs we ship
to the user contain dead markers.

`InjectMarker.beforeHash` stores the SHA256 of the first 256 bytes of the
pre-inject file; `removeLiveScript` recomputes after the removal and
refuses to proceed if it doesn't match. The 256-byte prefix is enough to
catch corrupted state without forcing a whole-file hash for every removal.

`VariantBlockMarker.originalLines` stores the base64 of the wrapped
original snippet. `discardVariantBlock` decodes it, byte-equivalent-restores
the wrapped region, and emits a `restoredByteEquivalent: true` flag for the
caller to assert.

## EOL handling

```
read file as utf8                   (BOM stripped if present)
  │
  ▼
eol = detectEol(content)            (first \n / \r\n / \r occurrence wins)
  │
  ▼
canonical = content.replace(/\r\n|\r/g, "\n")   (internal manipulation only)
  │
  ▼
operate on `canonical`              (findMarkerBlock, splice, carbonize, …)
  │
  ▼
output = result.replace(/\n/g, eol) (re-apply at write boundary)
  │
  ▼
atomic write (<file>.wisp-tmp → rename)
```

Files with no newline at all default to `\n`. Mixed EOLs in the input are
accepted but the splice region always emits the file's dominant convention
to avoid sprinkling stray CRs into the user's diff. The `eolConvention`
field on `AcceptOperation` is an opt-in override for tests; default = detect.

## findMarkerBlock — algorithm

State machine over the canonical (`\n`-normalised) buffer.

```
state: SEARCHING | INSIDE
acc:   { openLine?: number, openOffset?: number, openPayload?: Record<string,string> }

for each line in content:
  match = MARKER_SYNTAX[fileType].pattern.exec(line)
  if not match: continue
  body = match[1]
  parsed = parseMarkerBody(body)
  if parsed.kind === null: continue       # not a wisp marker

  groupOfKind = parsed.kind.split("-")[0]  # "inject" | "variants" | "style"
  if groupOfKind !== group: continue       # wrong group

  if state === SEARCHING:
    if parsed.kind.endsWith("-start"):
      if filter.sessionId and payload.sessionId !== filter.sessionId: continue
      if filter.targetId and payload.targetId !== filter.targetId: continue
      acc = { openLine, openOffset, openPayload }
      state = INSIDE
  else:  # INSIDE
    if parsed.kind.endsWith("-end"):
      return MarkerBlock {
        startLine: acc.openLine,
        endLine: lineIndex,
        startOffset: acc.openOffset,
        endOffset: offsetOfNextLineStart(lineIndex),
        group,
        payload: acc.openPayload,
      }

return null
```

Notes:

- `endOffset` is the offset of the **first character of the line after the
  close marker** — i.e. exclusive end. Splicing `content.slice(0, startOffset) +
  replacement + content.slice(endOffset)` produces a well-formed result.
- The state machine ignores nested unrelated groups. e.g. a `style-start`
  inside a `variants-start … variants-end` block does not affect the
  variants-group search.
- Filters apply **only to the open marker's payload**. The close marker
  carries the same `sessionId` / `targetId` but the parser doesn't re-verify;
  if a hand-edit breaks pairing, `parseMarkerBody` and Phase-5 audit catch it.

## extractVariant — algorithm

Variant CSS lives inside the `style-start`/`style-end` block as a sequence of
`@scope ([data-wisp-variant="N"]) { … }` rules. `extractVariant(content,
block, variantId)` walks the bytes between the block's `startOffset` +
length-of-open-marker and `endOffset` − length-of-close-marker, looking for
the matching `@scope` rule.

Edge cases the parser handles explicitly:

1. **Nested `{}` in CSS values** — e.g. `grid-template-areas: "a b" "c d"`
   contains no braces, but `clip-path: path(M0 0 L0 1)` has parens that mimic
   structure. The walker is brace-aware; it counts `{` / `}` only outside
   `"`/`'` quoted strings and `/* … */` comments.
2. **`@media` queries inside `@scope`** — `@scope (X) { @media (max-width: 768px) { … } }`.
   Brace counting handles this naturally; the outer scope's closing `}`
   matches the outer `{`.
3. **`:scope` selector** — preserved verbatim in the extracted output. The
   carbonize step is where `:scope` gets rewritten to `scopeSelector`.

The variant id is matched by the `data-wisp-variant="N"` attribute selector
inside the `@scope` parens, NOT by index — the agent may emit out-of-order
variants and the slider state machine indexes by `Variant.id`.

`extractVariant` returns `{ css, cssVars }`:

- `css` = the body of the `@scope` rule (everything between the `{` after
  the parens and the matching closing `}`).
- `cssVars` = the initial values of each `--*` custom property declared on
  `:scope { … }` inside that body. Used by `carbonize` to bake parameter
  values; matches what the slider UI was displaying when the user accepted.

## expandReplaceRange — algorithm

```
expandReplaceRange(content, block, replacement, eol):
  // content is already canonical \n. replacement is also canonical.
  out = content.slice(0, block.startOffset)
      + replacement.replace(/\n/g, eol)
      + content.slice(block.endOffset)
  // Re-apply EOL on caller's request — caller already canonicalised the rest
  // of the buffer; here we only re-EOL the replacement region.
  // If the original content was canonical-\n the rest of the file is fine;
  // the writer at the boundary applies the file's dominant EOL once.
  return out
```

The indentation of the replaced block is **not** auto-preserved by
`expandReplaceRange`. Carbonize emits CSS at column 0 (the embedded `<style>`
block is its own indentation context); JSX-side replacements (rare in Phase 3
— only for the `style-start`/`style-end` brackets) carry indentation as
literal whitespace in the `replacement` string. Phase 6 may add a smart-indent
mode behind a flag.

Trailing-newline handling: if the original `endOffset` pointed at the start of
a non-empty line, the replacement does **not** auto-append `\n`. The caller
chooses. Carbonize-emitted CSS always ends with a `\n`.

## carbonize — algorithm

```
carbonize(css, { paramOverrides, scopeSelector }):
  // 1. Parse the @scope rule and its body.
  // 2. Collect :scope { --x: 16px; --y: red; } declarations.
  //    Merge with paramOverrides — overrides win on key collision.
  // 3. Walk the rule body. For each declaration of the form
  //      property: var(--x);    →    property: <baked-value>;
  //      property: var(--x, fallback);    →    property: <baked-value>;
  //      property: calc(var(--x) * 2);    →    property: calc(<baked-value> * 2);
  //    var() calls without a baked override are left as-is.
  // 4. Rewrite selectors:
  //      :scope { … }     →    <scopeSelector> { … }
  //      :scope .child    →    <scopeSelector> .child
  //      .child           →    <scopeSelector> .child
  //    The whole `@scope ([data-wisp-variant="N"])` wrapper is stripped.
  // 5. Drop the now-empty `:scope { --x: 16px; --y: red; }` block if all its
  //    declarations were CSS-vars consumed by step 3.
```

Worked example:

Input:

```css
@scope ([data-wisp-variant="1"]) {
  :scope {
    --pad: 16px;
    --color: red;
  }
  .child {
    padding: var(--pad);
    color: var(--color);
  }
}
```

with `paramOverrides = { "--pad": "20px" }` and
`scopeSelector = '[data-wisp-target="t1"]'`, the output is:

```css
[data-wisp-target="t1"] .child {
  padding: 20px;
  color: red;
}
```

CSS vars not referenced in the body (dead declarations) are dropped. Param
overrides on dead vars are also dropped — they cannot affect rendering. The
order of emitted rules matches the input order.

## refuse-list — rationale per pattern

| Pattern                                                                                | Why we refuse                                                                                              |
| -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `node_modules`                                                                         | Vendor dir, will be overwritten on `npm install`.                                                          |
| `dist`, `build`, `out`, `target`                                                       | Build output, regenerated from source.                                                                     |
| `.next`, `.nuxt`, `.svelte-kit`                                                        | Framework build caches.                                                                                    |
| `coverage`                                                                             | Test artefacts, never the truth.                                                                            |
| `__generated__`                                                                        | Convention for codegen output (graphql-codegen, etc.).                                                      |
| `.generated.<ext>` basename                                                            | Same as above, single-file form.                                                                            |
| `.git/`                                                                                | Repo internals; editing here corrupts history.                                                              |
| `@generated` in first 200 bytes                                                        | Magic comment used by Facebook/Meta codegen, Prettier in tool-output mode, proto generators, and more.       |

Refuse-list is enforced by `safetyCheck` before any read; the engine never
even opens these files. If the agent insists, the suggested fallback is
`agent-driven` — the LLM can use the native `Edit` tool with a freeform diff,
but the deterministic source-edit engine refuses.

## Refuse-behaviour

When `safetyCheck` returns a `SafetyError`, the caller (Phase-4 agent loop)
reads `suggestedFallback`:

| Fallback        | Behaviour                                                                                                |
| --------------- | -------------------------------------------------------------------------------------------------------- |
| `agent-driven`  | Hand the freeText + context off to the LLM and let it use the native `Edit` tool (no `fs.writeFileSync`). |
| `manual`        | Surface a notice in the floating bar; no automation.                                                      |
| `skip`          | Silent no-op (e.g. an accept against a refused file becomes a discard).                                  |

The undo log records every refusal as a `safety-refused` entry — useful for
session replay (Phase 6) to explain "why didn't this edit land".

## File-type detection

Extension-first; magic-comment-second is **not** used for type detection (it
*is* used for `GENERATED_MAGIC_COMMENT` refuse). The table is closed (see
`SUPPORTED_EXTENSIONS`):

| Extension          | Type     | Marker delimiter        |
| ------------------ | -------- | ----------------------- |
| `.tsx`             | `tsx`    | `{/* … */}`             |
| `.jsx`             | `jsx`    | `{/* … */}`             |
| `.html`, `.htm`    | `html`   | `<!-- … -->`            |
| `.vue`             | `vue`    | `<!-- … -->`            |
| `.svelte`          | `svelte` | `<!-- … -->`            |
| `.css`             | `css`    | `/* … */`               |

`.vue` and `.svelte` always pick the HTML-comment marker because variant
brackets live in the `<template>` block, never inside the `<script>` block.
Files mixing JSX inside Vue SFCs (rare; only via `vue-jsx` plugin) are out of
scope for Phase 3 — `safetyCheck` resolves them as `vue` and the wrap will
splice into the `<template>`, which is the correct behaviour.

CSS files can be wrapped (so users can vary a stylesheet) but **cannot be
injected** — `injectLiveScript` against a `.css` file returns
`UNSUPPORTED_FILE_TYPE` with `suggestedFallback: "manual"`. The bridge does
the inject into the HTML entry, not into stylesheets.

## Undo log — JSONL format

One JSON object per line at `.wisp/sessions/<sessionId>.jsonl`. The file is
append-only within a session, never rewritten mid-session, and rotated to
`<sessionId>.<n>.jsonl` once it exceeds `MAX_UNDO_LOG_BYTES` (10 MB).

```jsonl
{"ts":"2026-05-22T10:14:03.221Z","sessionId":"S1","kind":"inject-script","filePath":"index.html","beforeSha256":"a3f1…","afterSha256":"4d77…","detail":{"injectId":"01HF…","bridgeUrl":"http://localhost:31338"}}
{"ts":"2026-05-22T10:14:11.882Z","sessionId":"S1","kind":"wrap-variants","filePath":"src/Hero.tsx","beforeSha256":"4d77…","afterSha256":"9ee2…","detail":{"targetId":"t1","variantCount":3}}
{"ts":"2026-05-22T10:14:28.402Z","sessionId":"S1","kind":"param-change","filePath":"src/Hero.tsx","detail":{"targetId":"t1","varName":"--pad","value":"20px"}}
{"ts":"2026-05-22T10:14:35.111Z","sessionId":"S1","kind":"accept-variant","filePath":"src/Hero.tsx","beforeSha256":"9ee2…","afterSha256":"b201…","detail":{"targetId":"t1","variantId":"v2","paramOverrides":{"--pad":"20px"}}}
{"ts":"2026-05-22T10:14:40.011Z","sessionId":"S1","kind":"safety-refused","filePath":"dist/app.js","detail":{"code":"REFUSE_LIST_MATCH","suggestedFallback":"agent-driven"}}
{"ts":"2026-05-22T10:14:55.223Z","sessionId":"S1","kind":"discard-variants","filePath":"src/Card.tsx","beforeSha256":"b201…","afterSha256":"9ee2…","detail":{"targetId":"t2"}}
{"ts":"2026-05-22T10:15:02.117Z","sessionId":"S1","kind":"remove-script","filePath":"index.html","beforeSha256":"…","afterSha256":"a3f1…","detail":{"injectId":"01HF…","restoredByteEquivalent":true}}
```

`param-change` entries deliberately omit `beforeSha256`/`afterSha256` — they
record runtime DOM slider activity, not file mutations. Phase 6 replay uses
them to scrub the slider state at any point in the session.

`safety-refused` entries omit hashes; nothing changed on disk.

## Boundary: safety vs accept

`safetyCheck` is responsible for **whether the engine touches the file at
all** — path, type, size, permissions, refuse-list, magic-comment, symlink.
It does **not** look at content beyond the first 200 bytes (the magic-comment
scan).

`acceptVariant` is responsible for **what to write** — marker parsing,
variant extraction, carbonize, splice, EOL re-application, atomic write,
undo-log append. It assumes the file passed safety; it does not re-resolve
paths or re-check size.

This separation lets Phase 5 verification-gate call `safetyCheck` ahead of
its own pre/post snapshot reads without paying for a full engine pass, and
lets the agent loop short-circuit at the safety layer (returning
`suggestedFallback` to the LLM) without ever instantiating the accept module.

## Atomic write protocol

```
write(filePath, newContent, eol):
  tmp = `${filePath}.wisp-tmp`
  fs.writeFile(tmp, newContent.replace(/\n/g, eol), { encoding: "utf8" })
  fs.rename(tmp, filePath)
```

Rename is atomic on POSIX and Windows (same volume). The `.wisp-tmp` suffix
is on the refuse-list pattern set Phase 5 verification scans for —
finding one means a previous run crashed mid-write; the cleanup is a Phase 6
session-start chore.

## Open questions deferred to later phases

- **Structure-variant mode** (CLAUDE.md Phase 6, Improvement #6) — JSX-subtree
  variants instead of CSS-only. Requires a new marker kind (`structure-start`)
  and a JSX AST round-trip; not in Phase 3 scope.
- **Multi-variant per file** — multiple `variants-start`/`variants-end`
  blocks in one file. The `findMarkerBlock` filter (`sessionId` + `targetId`)
  already supports this; tests will pin the behaviour but the agent loop
  doesn't yet emit overlapping wraps.
- **Morph-mode interpolation** (Improvement #3) — slider between two accepted
  variants. Phase 6 owns this; Phase 3 just keeps the carbonize output
  predictable enough that morph can compute its own keyframe deltas.
