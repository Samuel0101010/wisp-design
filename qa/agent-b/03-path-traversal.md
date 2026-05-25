# Section 3: Path Traversal Guard

Date: 2026-05-23

## Method

`tests/bridge/auth.test.ts` (guardPath unit tests) + `tests/bridge/path-traversal.test.ts` (edge cases) + `tests/bridge/server-smoke.test.ts` (`/source` integration tests) via vitest.

## Five-Rule Guard Coverage

| Rule | Description | Tested Payloads | Result |
|------|-------------|-----------------|--------|
| Rule 1 | Absolute paths rejected | `/etc/passwd`, `C:\foo`, `C:\Windows\...` | PASS — PATH_TRAVERSAL |
| Rule 2 | `..` segments rejected | `../escape`, `foo/../../escape`, `../../../../etc/passwd` | PASS — PATH_TRAVERSAL |
| Rule 3 | Resolved path must be descendant of projectRoot | path that normalizes but escapes | PASS — PATH_TRAVERSAL |
| Rule 4 | Symlink escape: realpath check | symlink → outside root | PASS — PATH_TRAVERSAL |
| Rule 5 | Hard-deny: .git, node_modules, .wisp/sessions, .env* | see table below | PASS — FORBIDDEN |

## Hard-Deny Test Payloads

| Payload | Expected Code | Result |
|---------|---------------|--------|
| `../../../../etc/passwd` | 403 PATH_TRAVERSAL | PASS |
| `..\..\..\windows\system32\drivers\etc\hosts` | 403 PATH_TRAVERSAL | PASS |
| `/etc/passwd` | 403 PATH_TRAVERSAL | PASS |
| `C:\Windows\System32\...` | 403 PATH_TRAVERSAL | PASS |
| `.env` | 403 FORBIDDEN | PASS |
| `.env.local` | 403 FORBIDDEN | PASS |
| `.env.production` | 403 FORBIDDEN | PASS |
| `.git/config` | 403 FORBIDDEN | PASS |
| `node_modules/foo/bar.js` | 403 FORBIDDEN | PASS |
| `.wisp/sessions/abc.jsonl` | 403 FORBIDDEN | PASS |
| `~/.ssh/id_rsa` | graceful handling | PASS — treated as relative path, resolves inside root as literal `~` dir (ENOENT → 404) |

## Normalisation Edge Cases (from path-traversal.test.ts)

| Result | Label | Detail |
|--------|-------|--------|
| PASS | Mixed separators `foo/bar\baz` → ok | normalize handles both |
| PASS | Trailing slash `src/foo/` → ok | resolves correctly |
| PASS | Doubled slashes `src//foo` → ok | normalize deduplicates |
| PASS | `.` segments `src/./foo` → ok | normalized to clean path |
| PASS | Unicode filename `srcüü/fooß` → ok | no path confusion |
| PASS | Long path (500 chars) → ok | no crash |
| PASS | `..` mid-path normalizing to clean inner path → ok | `foo/bar/../baz` = `foo/baz` inside root |
| PASS | `.git/` as mid-segment → FORBIDDEN | segment-match, not top-level only |
| PASS | `node_modules/` as mid-segment → FORBIDDEN | same |
| PASS | `.env` in subdir → FORBIDDEN | basename match fires |
| PASS | Filename containing 'env' (non-.env*) → ok | no false positive |

## Valid Path

| Result | Label | Detail |
|--------|-------|--------|
| PASS | `src/index.ts` → 200 + file body | reads "export const x = 1;" |
| PASS | Non-existent path → ok guard, then 404 from fs | ENOENT handled in handleSource |

## Symlink Test (Windows Note)

Symlink test ran successfully on this Windows 11 system (dev mode enabled). Symlink pointing outside root correctly returns `PATH_TRAVERSAL`.

## Notes

- `~/.ssh/id_rsa` is a relative path on Windows — the `~` is treated as a literal directory name. `isAbsolute("~/.ssh/id_rsa")` returns false, no `..` segments, resolves to `<root>\~\.ssh\id_rsa`. ENOENT → 404. This is correct behavior; `~` is a shell expansion, not a path-level construct.
- 21/21 path-traversal checks passed across unit + integration + edge cases.
