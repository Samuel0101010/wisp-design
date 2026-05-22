---
description: Live-Frontend-Design Toolkit. Click element → 3 distincte Varianten in echtem HMR → a11y-gated Accept → fs.writeFileSync. Subcommands: live, init, audit, history, tokens, sync.
argument-hint: "<subcommand> [args] — z.B. live | init | audit | history | tokens extract | sync --from <path>"
allowed-tools: Read, Write, Edit, Bash(node *), Bash(npm *), Bash(npx *), Glob, Grep
---

# /wisp-design

Top-level dispatcher für den `wisp-design` Live-Loop. Routet anhand `$ARGUMENTS` zu einem der Subcommands. Die ausführliche Logik pro Subcommand wird in folgenden Phasen implementiert — dieses File ist der einheitliche Eingangspunkt.

## Subcommands

| Befehl | Phase | Zweck |
|---|---|---|
| `live` | 1-4 | Boot Bridge (auto-port, token), inject `<script>`, starte Long-Poll-Loop. "open localhost:PORT" |
| `init` | 4 | Projekt-Setup: Stack-Scan, `.wisp/brand-spec.json`, Design-Tokens extrahieren, 4 Narrative Questions stellen |
| `audit` | 5 | Pre-Commit-Gate: Anti-Slop-Linter + a11y-axe-delta auf geänderten Files |
| `history [--task <id>]` | 6 | Session-Viewer: rendert `.wisp/sessions/<id>.jsonl` als interaktive Tabelle |
| `tokens extract` | 4 | Sample `getComputedStyle` über laufende App, cluster, schreibe `.wisp/design-tokens.json` |
| `sync --from <vault-path>` | 4 | Synct Pattern-Docs aus externem Vault in `skills/data/patterns/` |
| `doctor [--fix]` | 0 | Verifiziert Manifest, Hooks, Build. Soll OK zurückgeben. |

## Steps

1. **Parse `$ARGUMENTS`**: First token ist Subcommand, Rest sind Args. Wenn leer → zeige Hilfe inkl. obiger Tabelle.

2. **Route**:
   - `live` → `node "${CLAUDE_PLUGIN_ROOT}/dist/index.js" live <args>` (boots bridge in background, prints port + token URL)
   - `init` → `node "${CLAUDE_PLUGIN_ROOT}/dist/index.js" init <args>` (interaktiver Wizard mit 4 Narrative Questions)
   - `audit` → `node "${CLAUDE_PLUGIN_ROOT}/dist/index.js" audit <args>`
   - `history` → `node "${CLAUDE_PLUGIN_ROOT}/dist/index.js" history <args>`
   - `tokens` → `node "${CLAUDE_PLUGIN_ROOT}/dist/index.js" tokens <args>`
   - `sync` → `node "${CLAUDE_PLUGIN_ROOT}/dist/index.js" sync <args>`
   - `doctor` → `node "${CLAUDE_PLUGIN_ROOT}/dist/index.js" doctor <args>`
   - sonst → fehler + Hilfe.

3. **Print result** inline. Bei `live` zusätzlich den Pick-Hotkey-Hint ausgeben.

## Notes

- In Phase 0 ist nur `doctor` fully wired — alle anderen Subcommands liefern Stubs mit "not yet implemented in this phase" zurück.
- `live` lädt das Browser-Runtime `live.js` per `<script src=…>`-Injection. Reversibel via `live --stop`.
- Hot-Path Budget: variant-arrival p95 ≤ 3s. Verification-Gate läuft parallel, nicht sequenziell.
- Bei `--strict` blockt der Stop-Hook bei a11y-AA-Fail. Default ist `warn`.
