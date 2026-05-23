---
description: Live-Frontend-Design Toolkit. Click element → 3 distincte Varianten in echtem HMR → a11y-gated Accept → fs.writeFileSync. Subcommands: live, init, audit, history, tokens, sync, skills, poll-once, post-event.
argument-hint: "<subcommand> [args] — z.B. live | init | audit | history | tokens extract | sync --from <path> | skills index | skills search <q>"
allowed-tools: Read, Write, Edit, Bash(node *), Bash(npm *), Bash(npx *), Glob, Grep
---

# /wisp-design

Top-level dispatcher für den `wisp-design` Live-Loop. Routet anhand `$ARGUMENTS` zu einem der Subcommands. Die ausführliche Logik pro Subcommand wird in folgenden Phasen implementiert — dieses File ist der einheitliche Eingangspunkt.

## Subcommands

| Befehl | Phase | Zweck |
|---|---|---|
| `live` | 1-4 | Boot Bridge (auto-port, token), inject `<script>`, starte Long-Poll-Loop. "open localhost:PORT" |
| `init` | 4 | Projekt-Setup: Stack-Scan, `.wisp/brand-spec.json`, Design-Tokens extrahieren, 4 Narrative Questions stellen |
| `poll-once [--timeout N] [--cursor C]` | **4 ✓** | Fetch ein Batch Bridge-Events (long-poll, ≤270s slice). Returns JSON `PollOnceResult` auf stdout. |
| `post-event --kind K --payload <json>` | **4 ✓** | Push Event zurück an Bridge (`cycling`, `generating`, `error`, …). Returns `{ ok, cursor }`. |
| `skills index [--namespace N]` | **4 ✓** | Re-index `skills/data/*` in AgentDB HNSW unter Namespace `wisp-design`. |
| `skills search <query> [--top-k K] [--namespace N]` | **4 ✓** | Query indexierten Korpus, returns topK `SkillsSearchResult[]` als JSON. |
| `sync --from <vault-path> [--no-index]` | **4 ✓** | Copy vault MD-files in `skills/data/patterns/`, re-index. Explicit only — kein watcher. |
| `audit [paths...] [--mode fast\|full\|strict] [--screenshot] [--format text\|json\|markdown] [--fail-on-warn]` | **5 ✓** | Verification-Gate auf geänderten Files (oder explizit übergebenen paths). `fast` = anti-slop only (Stop-hook subset, <100ms). `full` = alle 6 checks (anti-slop + a11y-axe + console-scan + tab-order + reduced-motion + multi-viewport mit `--screenshot`). `strict` = hard-block on hard-bans / AA-fails. Default mode `fast`, default Strenge **warn** (siehe `docs/verification-gate.md`). |
| `history [--task <id>]` | 6 | Session-Viewer: rendert `.wisp/sessions/<id>.jsonl` als interaktive Tabelle |
| `tokens extract` | 4 | Sample `getComputedStyle` über laufende App, cluster, schreibe `.wisp/design-tokens.json` |
| `doctor [--fix]` | 0 ✓ | Verifiziert Manifest, Hooks, Build. Soll OK zurückgeben. |

## Skill Auto-Trigger

Wenn der User `/wisp-design live` aufruft, bootet der CLI die Bridge und gibt
`port` + `token` zurück. Die Claude-Code-Session lädt dann automatisch den
`wisp-design` Skill (`skills/wisp-design/SKILL.md`), der die Loop-Logik
encoded:

```
while bridge alive:
  result = Bash(wisp-design poll-once --timeout 270000 [--cursor C])
  for event in result.events:
    match event.kind:
      "configure"  → reason about design (use skills/reference/live.md),
                     post `cycling` via wisp-design post-event
      "accept"     → wisp-design accept --session SID --variant VID
      "discard"    → wisp-design discard --session SID --target TID
      "annotation" → log to .wisp/sessions/<id>.jsonl
      else         → ignore
  if result.shouldRetry: re-invoke poll-once with cursor=result.cursor
```

Der Skill ist auto-getriggert; der User muss ihn NICHT manuell laden. Phase 4
liefert das CLI + den Skill; die Reasoning-Schleife ist deklarativ.

## Steps

1. **Parse `$ARGUMENTS`**: First token ist Subcommand, Rest sind Args. Wenn leer → zeige Hilfe inkl. obiger Tabelle.

2. **Route**:
   - `live` → `node "${CLAUDE_PLUGIN_ROOT}/dist/index.js" live <args>` (boots bridge in background, prints port + token URL)
   - `init` → `node "${CLAUDE_PLUGIN_ROOT}/dist/index.js" init <args>` (interaktiver Wizard mit 4 Narrative Questions)
   - `poll-once` → `node "${CLAUDE_PLUGIN_ROOT}/dist/index.js" poll-once <args>` (one-shot, JSON-stdout)
   - `post-event` → `node "${CLAUDE_PLUGIN_ROOT}/dist/index.js" post-event <args>`
   - `skills` → `node "${CLAUDE_PLUGIN_ROOT}/dist/index.js" skills <args>` (subcommands: `index`, `search`)
   - `sync` → `node "${CLAUDE_PLUGIN_ROOT}/dist/index.js" sync <args>`
   - `audit` → `node "${CLAUDE_PLUGIN_ROOT}/dist/index.js" audit <args>`
   - `history` → `node "${CLAUDE_PLUGIN_ROOT}/dist/index.js" history <args>`
   - `tokens` → `node "${CLAUDE_PLUGIN_ROOT}/dist/index.js" tokens <args>`
   - `doctor` → `node "${CLAUDE_PLUGIN_ROOT}/dist/index.js" doctor <args>`
   - sonst → fehler + Hilfe.

3. **Print result** inline. Bei `live` zusätzlich den Pick-Hotkey-Hint ausgeben.

## Notes

- Phase 4 ✓: `poll-once`, `post-event`, `skills index`, `skills search`, `sync`. Siehe `docs/agent-loop.md` für die volle Architektur.
- Phase 5 ✓: `audit` mit 3 modes (`fast`/`full`/`strict`). Siehe `docs/verification-gate.md` für mode-hierarchy, per-check budgets, override-flow.
- `live` lädt das Browser-Runtime `live.js` per `<script src=…>`-Injection. Reversibel via `live --stop`.
- Hot-Path Budget: variant-arrival p95 ≤ 3s. Verification-Gate (Phase 5) läuft parallel zu LLM-Generate, nicht sequenziell.
- **Audit Modes & Strenge** (Lead-confirmed, research/synthesis.md Open Decision #7):
  - `--mode fast` (default): anti-slop only, warn-default. Mirror von Stop-hook.
  - `--mode full`: alle 6 checks, warn-default. `--screenshot` aktiviert multi-viewport (4 widths × 2 modes via Playwright optionalDep).
  - `--mode strict`: alle 6 checks, **hard-block** on hard-bans und AA-fails. Exit-Code 1 bei block.
  - `--fail-on-warn`: CI-knob — promoteet warn zu exit-1 in jedem mode.
- **Stop-hook**: läuft anti-slop on git diff bei jedem Claude turn, p99 < 100ms. Hard-ban hits zu stderr (warn). `WISP_DESIGN_STRICT=1` promoteet zu `permissionDecision: "block"`.
- `poll-once` ist eine **one-shot** Primitive — die while-Schleife lebt im Skill (`skills/wisp-design/SKILL.md`), NICHT in der CLI.
- `sync` ist explicit-only. Kein File-Watcher, kein Push-Script (Open Decision #6 in `research/synthesis.md`).
