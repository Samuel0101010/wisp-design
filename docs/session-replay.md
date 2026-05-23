# Session Replay

**Phase 6 — Improvement #2 + #5.** Append-only per-session JSONL log at
`<projectRoot>/.wisp/sessions/<sessionId>.jsonl`, plus the in-session
policy-proposal flow that surfaces when N consecutive accepts share an axis.

## Why

Impeccable has no undo and no replay — once a variant is accepted, the
decision is irretrievable. wisp-design records every state-machine event
(pick, configure, variant emission, cycle, accept, discard, verify report,
policy proposal) as one JSONL line. The replay viewer reconstructs the
session as a timeline so the user can revisit decisions, copy a rejected
variant's rationale, or surface drift ("the last 5 accepts all increased
density — should that become a policy?").

This is the foundation that Improvement #2 (per-session undo-stack) and #5
(in-session policy proposal) both build on.

## File location

```
<projectRoot>/.wisp/sessions/<sessionId>.jsonl              # active
<projectRoot>/.wisp/sessions/<sessionId>.jsonl.<ts>.rotated # past, after 10 MB
```

`.wisp/` MUST be in `.gitignore` (Phase 0 setup). The log contains user
freeText + selectors and is **local only**.

## JSONL format

One JSON object per line, validated by `SessionEventEntrySchema`. The shape
is the union of Phase-3 `UndoEntryKind` (file-op kinds) and Phase-6
session-level kinds.

### Phase-3 inherited kinds (file ops)

`inject-script`, `remove-script`, `wrap-variants`, `discard-variants`,
`accept-variant`, `param-change`, `safety-refused`. These carry
`beforeSha256` / `afterSha256` because they mutate real files.

### Phase-6 session-level kinds

```jsonl
{"ts":"2026-05-22T11:14:00.123Z","sessionId":"s_a1b2","kind":"session-start","detail":{"meta":{"projectRoot":"/p","brandSpec":"<spec-id>"}}}
{"ts":"2026-05-22T11:14:03.450Z","sessionId":"s_a1b2","kind":"pick","detail":{"selector":"main > section.hero","tag":"section","targetId":"t_001"}}
{"ts":"2026-05-22T11:14:08.110Z","sessionId":"s_a1b2","kind":"configure","detail":{"targetId":"t_001","freeText":"more breathing room"}}
{"ts":"2026-05-22T11:14:14.020Z","sessionId":"s_a1b2","kind":"variants-emitted","detail":{"targetId":"t_001","variants":[{"id":"v0","rationale":"More vertical breathing — doubles section padding","primaryAxis":"density"},{"id":"v1","rationale":"Editorial column — narrower max-width, larger heading","primaryAxis":"layout"},{"id":"v2","rationale":"Calmer typography — reduced weight, increased leading","primaryAxis":"typography"}]}}
{"ts":"2026-05-22T11:14:31.880Z","sessionId":"s_a1b2","kind":"cycle-active-changed","detail":{"fromIndex":0,"toIndex":1}}
{"ts":"2026-05-22T11:14:42.005Z","sessionId":"s_a1b2","kind":"param-changed","detail":{"varName":"--wisp-pad","from":"12px","to":"20px"}}
{"ts":"2026-05-22T11:14:50.200Z","sessionId":"s_a1b2","kind":"annotation-added","detail":{"targetId":"t_001","kind":"padding","note":"feel the air"}}
{"ts":"2026-05-22T11:14:52.310Z","sessionId":"s_a1b2","kind":"verify-report","detail":{"verdict":"warn","hardBanCount":0,"a11yFailCount":1}}
{"ts":"2026-05-22T11:14:53.005Z","sessionId":"s_a1b2","kind":"accept-variant","filePath":"src/Home.tsx","beforeSha256":"<hex>","afterSha256":"<hex>","detail":{"variantId":"v1","targetId":"t_001"}}
{"ts":"2026-05-22T11:14:53.110Z","sessionId":"s_a1b2","kind":"policy-proposal-shown","detail":{"axis":"density","observation":"3 high-density variants accepted in a row","proposed":"add density: 'generous' to .wisp/policy.md","triggerThreshold":3}}
{"ts":"2026-05-22T11:14:55.870Z","sessionId":"s_a1b2","kind":"policy-proposal-accepted","detail":{"axis":"density"}}
{"ts":"2026-05-22T11:14:58.000Z","sessionId":"s_a1b2","kind":"morph-engaged","detail":{"variantIdA":"v0","variantIdB":"v1","t":0.4}}
{"ts":"2026-05-22T11:15:02.430Z","sessionId":"s_a1b2","kind":"structure-variant-emitted","detail":{"targetId":"t_001","kinds":["two-col-split","card-layout","hero-style"]}}
{"ts":"2026-05-22T11:15:03.118Z","sessionId":"s_a1b2","kind":"component-lib-detected","detail":{"lib":"shadcn","confidence":0.82,"preferredStrategy":"prop-edit"}}
{"ts":"2026-05-22T11:16:00.000Z","sessionId":"s_a1b2","kind":"session-end","detail":{"reason":"user-closed-bar"}}
```

The JSONL writer is `src/session/logger.ts` (Phase 6, coder-foundation).
Phase-3 file-op entries are still written via `src/source/undo-stack.ts`;
both layers append to the same file.

## Timeline reconstruction

`SessionReplayModule.buildTimeline(sessionId, { projectRoot })`:

1. Read `<projectRoot>/.wisp/sessions/<sessionId>.jsonl` (UTF-8).
2. Split by `\n`. Skip empty lines.
3. For each line: `JSON.parse` → `SessionEventEntrySchema.safeParse`. On
   parse failure, write a one-line warning to stderr and skip — partial log
   corruption MUST NOT break replay (mirrors `undo-stack.read` invariant).
4. Initialise `SessionReplayTimeline` with empty arrays + zero counters.
5. Fold each valid entry into the matching slice:
   - `session-start` → set `startedAt`.
   - `session-end` → set `endedAt`.
   - `pick` → push to `picks`.
   - `variants-emitted` → push to `variantGenerations`; increment
     `totalVariantsGenerated` by the rendered count.
   - `accept-variant` → push to `accepts`; increment per-axis counter in
     `primaryAxisHistogram` if the matching variant's primaryAxis is
     recoverable from a prior `variants-emitted` entry (forward-look join).
   - `discard-variants` → push to `discards`.
   - `policy-proposal-shown` / `-accepted` / `-declined` → fold into one
     entry with `outcome` set per the latest matching axis.
   - `verify-report` → push to `verifyReports`.
   - `component-lib-detected` → push to `componentLibDetections`.
6. After the fold: `acceptRate = accepts.length / Math.max(1, totalVariantsGenerated)`.

The fold is **idempotent**: re-reading the same file produces a
byte-equivalent `SessionReplayTimeline`. The `Map`-based axis lookup is
ordered by file position — the first matching `variants-emitted` wins for a
given `variantId`.

## History viewer

```
wisp-design history                       # most recent session
wisp-design history --task <sessionId>    # specific session
wisp-design history --list                # all sessions, newest first
wisp-design history --replay              # step through entries with a pager
wisp-design history --format text|json|markdown   # output format (default text)
```

The viewer is `src/agent/history.ts` (coder-foundation, Phase 6). The CLI is
lazy-loaded from `src/index.ts` via `await import("./agent/history.js")` —
same dynamic-import pattern as Phase-4 commands so the typecheck stays
clean while coder's implementation lands in parallel.

## Privacy

- Logs MAY contain user freeText, component selectors, and short variant
  rationales authored by the LLM. They MUST NOT contain credentials, file
  contents beyond filename + hash, or screenshot bytes.
- `.wisp/` is local-only. No network sync. No telemetry.
- `wisp-design history --format json` is the only programmatic export path;
  the user controls whether to share it.

## Rotation

The Phase-3 `undo-stack.rotateIfTooLarge` rotates at `MAX_UNDO_LOG_BYTES =
10 MB`. The Phase-6 logger uses the SAME rotation — both call into the same
`<sessionId>.jsonl` and the same rotator. Rotation renames to
`<sessionId>.jsonl.<ts>.rotated`; the active file is reopened on next append.

The replay-builder reads ONLY the active file by default. `--include-rotated`
appends the rotated files in chronological order (rotated files sorted by
their embedded ISO timestamp). The builder does NOT de-duplicate entries
across files — rotation guarantees disjoint line sets.

## Policy-proposal integration

`PolicyProposalModule.analyzeRecentDecisions(entries, opts?)` is the
detector. It scans entries newest-first looking for `accept-variant` lines.
For each accept, it joins forward to the nearest preceding
`variants-emitted` entry to recover the variant's `primaryAxis`. When N
consecutive accepts share an axis (default
`POLICY_PROPOSAL_DEFAULT_THRESHOLD = 3`, override via `--threshold`), it
emits a `PolicyProposal`.

The agent loop:

1. After each accept, calls `analyzeRecentDecisions`.
2. If `null` → no-op.
3. Else → posts a `policy-proposal-shown` log entry AND surfaces the
   proposal in the floating bar.
4. User accepts → logger writes `policy-proposal-accepted`;
   `PolicyProposalModule.applyProposal` writes to `.wisp/policy.md`.
5. User declines → logger writes `policy-proposal-declined`. The same axis
   is NOT re-triggered in the same session (the analyzer reads
   `-declined` entries and excludes the matching axis).

`.wisp/policy.md` shape (yaml frontmatter + free-form body):

```markdown
---
acceptedAt: 2026-05-22T11:14:55.870Z
source: wisp-proposed-then-confirmed
axes:
  density: generous
  hierarchy: bold-primary
---

## How this project tends

- **Density** is `generous` — increased section padding, generous gaps.
- **Hierarchy** uses `bold-primary` — primary action stands out via weight.

(Free-form rationale and counter-examples below.)
```

The frontmatter is the machine-readable shape; the body below is for human
reference. `applyProposal` rewrites ONLY the matching axis line and the
`acceptedAt` timestamp; the body survives.

## CLI surface summary

| Command | Action |
|---|---|
| `wisp-design history` | Render most recent session as text timeline. |
| `wisp-design history --task <id>` | Specific session. |
| `wisp-design history --list` | List all sessions, newest first. |
| `wisp-design history --replay` | Step through entries via pager. |
| `wisp-design history --format json` | Programmatic export (machine-readable). |
| `wisp-design policy --propose` | Analyze recent decisions; print proposal or `no proposal`. |
| `wisp-design policy --apply <axis>=<value>` | Write to `.wisp/policy.md`. |
| `wisp-design morph --variant-a <id> --variant-b <id> --t <0..1>` | Print interpolated CSS to stdout. Browser uses this internally. |
