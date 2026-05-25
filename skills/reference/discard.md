---
description: Sub-prompt for discard events. Describes what happens when the user rejects all variants and wants the file restored to pre-wrap state. Read alongside `live.md` when a `cycling` event resolves with `decision: discard`.
license: MIT
---

# Discard

The user rejected all 3+ variants. Nothing about the proposal worked. The source file must come back to byte-equivalent pre-wrap state.

## What happens (design-level)

1. **Wrap markers removed.** Both `// wisp-variants-start` and `// wisp-variants-end` line markers are spliced out.

2. **Ephemeral style block removed.** The `<style data-wisp-css="<sessionId>">…</style>` element that held the 3 variants is removed entirely. The CSS never persisted to disk in a meaningful sense — it lived as wrap-marker payload only.

3. **Original lines restored.** The wrap step stored the pre-wrap byte range as base64 in `originalLines` on the WrapResult. Discard decodes that and splices it back in place of the entire wrap span (markers + style block + variant payload). Post-Squad-A fix, this restore is now **byte-equivalent** — the file's SHA256 matches the pre-wrap hash exactly.

4. **No undo-stack accept-record is written.** Discard is a no-op from the persisted-state perspective. The session log gets a single `{kind: "discard", variantsRejected: 3}` entry for telemetry, but no source-file change is committed and `wisp-design history --task <sessionId>` shows the discard as a terminal-and-empty branch.

5. **State machine returns to `IDLE`.** The bridge clears its session-scoped state for this element; the floating bar dismisses; next pick re-enters `PICKING`.

## What does NOT happen

- **No agent re-prompt.** Discard means "drop this attempt entirely". If the user wants another try, they re-pick and re-prompt. The variant generator never sees discard as feedback — that would teach the model the wrong lesson.
- **No partial accept.** There is no "accept v0's hierarchy + v1's typography". A discard rejects the whole proposal. Re-pick if you want to remix.

## After discard

The bridge sets state to `IDLE`. The next pick on the same element starts a fresh session. The previous variant attempt is searchable via `wisp-design history --task <sessionId>` but has no on-disk footprint outside the JSONL log.
