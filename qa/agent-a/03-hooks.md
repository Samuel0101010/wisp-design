# Section 3: Hook Dispatcher Testing

## 3a Smoke: PASS — exit 0, <200ms, no output (no staged files)

## 3b Slop detection: FAIL
Staged qa/agent-a/dummy.tsx with purple-blue-gradient hard-ban content.
Expected: stderr warning. Actual: no output, silent exit 0.
Root cause: stopHookGitChangedFiles() uses execFileSync timeout=25ms.
Windows git startup > 25ms -> ETIMEDOUT -> catch{} -> returns [] -> early return.
Anti-slop check never runs.

## 3c Strict mode: UNTESTABLE (blocked by 3b bug)

## 3d Timing (20 runs):
147, 150, 150, 158, 162, 163, 163, 163, 165, 165, 165, 165, 169, 173, 174, 175, 177, 181, 197, 262, 271 ms
p50=165ms p90=181ms p95=262ms p99=271ms — ALL exceed 100ms budget

## 3e Unknown hook: PASS — exit 0, no output
## 3f Other hooks (user-prompt-submit, post-tool-use, session-end): PASS — exit 0
