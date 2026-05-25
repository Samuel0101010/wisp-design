# Section 4: CLI Surface Smoke Test

| Command | Exit | Notes | Status |
|---|---|---|---|
| doctor | 0 | 14 checks: 12 OK, 1 WARN (policy.md), 1 OK-lazy | PASS |
| audit --help | 0 | No --help flag; falls to "nothing to check" | PASS |
| audit --mode fast | 0 | "nothing to check" (no changed files) | PASS |
| audit --mode warn | 2 | BAD_FLAG: warn is not a valid mode enum | WARN |
| history --help | 1 | SESSION_NOT_FOUND; --help not recognized | WARN |
| history --list | 0 | "No sessions found" | PASS |
| init --help | 2 | "not yet implemented (Phase 4)" | NOTE |
| live --help | 2 | "not yet implemented (Phase 1-4)" | NOTE |
| sync --help | 2 | BAD_FLAG: --from required; --help not recognized | WARN |
| tokens --help | 2 | "not yet implemented (Phase 4)" | NOTE |
| tokens extract --help | 2 | "not yet implemented (Phase 4)" | NOTE |
