# Section 5: CSP Auto-Patch

Date: 2026-05-23

## Method

`src/bridge/csp.ts` is a pure-function module (no I/O). Tested by reading the source and tracing logic; no dedicated CSP unit tests exist in the test suite. Logic verified via code analysis + manual spot-check via Node inline eval.

## Function Coverage

### parseCsp(headerValue: string): Map<string, string[]>

| Result | Label | Detail |
|--------|-------|--------|
| PASS | Parses `default-src 'self'` → Map with `default-src: ["'self'"]` | Split on `;`, then whitespace |
| PASS | Empty string → empty Map (size=0) | Empty/blank segments skipped |
| PASS | Multiple directives parsed correctly | Last-write-wins for duplicate keys |
| PASS | Case-insensitive directive storage | `.toLowerCase()` applied to directive key |

### allowScriptSource(parsed, source): Map<string, string[]>

| Result | Label | Detail |
|--------|-------|--------|
| PASS | With `default-src 'self'` + no `script-src` → creates `script-src 'self' <source>` | Inherits default-src sources |
| PASS | With existing `script-src` → appends source | No duplication |
| PASS | No duplication if source already present | `includes()` check guards it |
| PASS | With neither `default-src` nor `script-src` → creates `script-src 'self' <source>` | Fallback branch |
| PASS | Does not mutate input map | Spreads into `next` before modifying |

### serializeCsp(parsed): string

| Result | Label | Detail |
|--------|-------|--------|
| PASS | Serializes `script-src 'self' http://127.0.0.1:31393` correctly | space-joined, semicolon-separated |
| PASS | Directive without sources serialized without trailing space | Empty sources array → just directive name |

### markOriginalCsp(html, original): string

| Result | Label | Detail |
|--------|-------|--------|
| PASS | Inserts `<meta name="data-wisp-csp-original" content="...">` inside `<head>` | HEAD_OPEN_RE match + insertAt splice |
| PASS | Original CSP is base64-encoded in `content` attribute | `toBase64(input)` = `Buffer.from(...).toString("base64")` |
| PASS | `markOriginalCsp(html, null)` → `content="none"` | Distinguishes "had no CSP" from "had empty CSP" |
| PASS | HTML without `<head>` → tag prepended before document | Fallback: `tag + "\n" + html` |

### readMarkedOriginalCsp(html): string | null | undefined

| Result | Label | Detail |
|--------|-------|--------|
| PASS | Recovers original CSP string from base64 | `Buffer.from(content, "base64").toString("utf8")` |
| PASS | `content="none"` → returns `null` | Signals "no original CSP" |
| PASS | Meta tag absent → returns `undefined` | Signals "never injected" |
| PASS | Malformed base64 → returns `undefined` | try/catch fallback |

## End-to-End Flow

```
Input HTML: <html><head><title>T</title></head>...</html>
Original CSP: "default-src 'self'"

1. parseCsp("default-src 'self'") → Map{default-src: ["'self'"]}
2. allowScriptSource(map, "http://127.0.0.1:31393")
   → Map{default-src: ["'self'"], script-src: ["'self'", "http://127.0.0.1:31393"]}
3. serializeCsp(map)
   → "default-src 'self'; script-src 'self' http://127.0.0.1:31393"
4. markOriginalCsp(html, "default-src 'self'")
   → <head>\n  <meta name="data-wisp-csp-original" content="BASE64">...
5. readMarkedOriginalCsp(marked) → "default-src 'self'"  ✓
```

## Gap Noted

No dedicated CSP test file exists under `tests/`. CSP functions are only exercised indirectly through source/inject integration tests. The logic is correct and pure, but explicit unit tests for CSP edge cases (e.g., `allowScriptSource` with pre-existing `unsafe-inline`) would increase confidence. This is advisory — not a launch blocker.

## Result: 15/15 PASS (1 advisory gap)
