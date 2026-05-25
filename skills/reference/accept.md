---
description: Sub-prompt for accept events. Describes the source-edit flow at design level when the user accepts one of the live variants. Read alongside `live.md` when a `cycling` event resolves with `decision: accept`.
license: MIT
---

# Accept

The user picked one of the 3+ variants. The agent posts an `accept` event; the bridge carbonizes the ephemeral CSS into a permanent style block, removes the wrap markers, and the source file is now ready for commit.

## What happens (design-level)

1. **Variant CSS bakes into source.** The accepted variant's `@scope ([data-wisp-variant="N"])` block is rewritten into a `<style data-wisp-permanent="<sessionId>">` block, embedded directly in the source file at the wrap site.

2. **Selectors carbonize.** The cycling-time `:scope > <picked-tag>` selectors are rewritten to target the picked element by its actual className/id. The redundant tag-name prefix is stripped (Phase 7.11) — `:scope > button.primary-cta` becomes `.primary-cta`. The `@scope` wrapper drops its `[data-wisp-variant]` parameter; the resulting CSS is scope-free and lives next to the component.

3. **Wrap markers removed.** The `// wisp-variants-start` and `// wisp-variants-end` line markers come out. The file is now its pre-wrap structure plus the new permanent style block — diff-clean for review.

4. **Undo-stack logs the accept.** `.wisp/sessions/<sessionId>.jsonl` gets one append-only entry: `{kind: "accept", variantId, target, css, generatedAt}`. The `wisp-design history --task <sessionId>` command can replay every decision in order or roll back via `--replay` (Phase 7+).

5. **Carbonized parameter values bake.** Any `--wisp-pad: 16px` from the live preview is committed at its current slider value. The `@param` comments are stripped; only the resolved value survives.

## What does NOT happen

- **No second wrap if a permanent block already exists** for this element + session. Phase 7 will EXTEND the existing block; the current Phase-6 implementation appends a separate sibling block (acceptable for now — diff stays readable).
- **No formatting / no Prettier pass.** Surgical changes only. Adjacent code is untouched.
- **No git commit.** The user reviews the diff and commits manually. wisp-design never amends history.

## After accept

The bridge sets state to `IDLE`. The floating bar dismisses. Next pick re-enters `PICKING`.
