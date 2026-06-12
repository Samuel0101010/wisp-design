---
description: Live-Frontend-Design Toolkit. Click element → 3 distincte Varianten in echtem HMR → a11y-gated Accept → fs.writeFileSync. Subcommands: live, init, audit, history, morph, policy, tokens, sync, skills, poll-once, post-event.
argument-hint: "<subcommand> [args] — z.B. live | init | audit | history | morph | policy | tokens extract | sync --from <path> | skills index | skills search <q>"
allowed-tools: Read, Write, Edit, Bash(node *), Bash(npm *), Bash(npx *), Glob, Grep
---

# /wisp-design

Top-level dispatcher für den `wisp-design` Live-Loop. Routet anhand `$ARGUMENTS` zu einem der Subcommands.

## Subcommands

| Befehl | Phase | Zweck |
|---|---|---|
| `live` | **7.8 ✓** | Boot Bridge in BACKGROUND, dann poll-loop in der aktiven Claude-Session. Du (Claude) bist der Variant-Generator. |
| `init` | 7 ✓ | Projekt-Setup: Stack-Scan, `.wisp/brand-spec.json`, Design-Tokens, 4 Narrative Questions |
| `poll-once [--timeout N] [--cursor C]` | 4 ✓ | One-shot fetch eines Bridge-Event-Batches (long-poll, ≤270s). Returns JSON. |
| `post-event --kind K --payload <json>` | 4 ✓ | Push event zurück an Bridge (z.B. cycling mit variants). Returns `{ ok, cursor }`. |
| `skills index|search <q>` | 4 ✓ | Re-index / query Skill-Korpus in AgentDB HNSW. |
| `sync --from <vault-path>` | 4 ✓ | Vault MD-files → `skills/data/patterns/`. |
| `audit [paths...] [--mode fast|full|strict]` | 5 ✓ | Verification-Gate (anti-slop + a11y + console + tab-order + reduced-motion). |
| `history [--task ID|--list|--replay]` | 6 ✓ | Session-Viewer für `.wisp/sessions/<id>.jsonl`. |
| `morph --variant-a A --variant-b B --t 0..1` | 6 ✓ | Interpolierte `@scope`-CSS für Morph-Slider. |
| `policy [--propose|--apply <axis>=<val>]` | 6 ✓ | `.wisp/policy.md` proposal-flow. |
| `doctor [--fix]` | 0 ✓ | Verifiziert Manifest, Hooks, Build. |

## ⚡ Wenn der User `/wisp-design live` aufruft

**Zwei Modi — interaktiver Default (du bist der Designer) zuerst, autonom als Opt-in:**

### Modus A — `--external-agent` (Opus 4.7 in active session, **Primary, Default**)

Die Bridge läuft als Daemon im Hintergrund und **du** (Opus 4.7 im aktiven Chat) bist der Variant-Generator. Jeder `generating`-Event aus dem Browser-Overlay landet als **automatische Chat-Notification** in deinem Turn — ohne dass der User tippen muss. Du designst die Varianten in dieser Session, POSTest sie zurück, Browser rendert. Kein Subprozess-Spawn, keine zusätzlichen $-Kosten, keine 10–60s Haiku-Latenz, volle Opus-Quality.

**CRITICAL:** Du MUSST sowohl den Daemon (Schritt A1) ALS AUCH den Monitor-Loop (Schritt A2) starten — beides in einem einzigen Turn, BEVOR du dem User antwortest. Wenn der Monitor nicht läuft, sieht der User nichts wenn er klickt. Tier-0-Safety-Net: der Daemon postet within 1s stub-Variants als loading-state — die werden von deinen echten Varianten überschrieben sobald du POSTest.

**Setup (3 Schritte, dann lebt es bis Session-Ende):**

**Schritt A1 — Daemon im Hintergrund** (via `Bash` mit `run_in_background: true`):

```
node "${CLAUDE_PLUGIN_ROOT}/dist/index.js" live --external-agent --quiet [user-args]
```

`--external-agent` impliziert `--agent-driven` aber **deaktiviert** den internen `claude -p` Spawn — generating-events bleiben in der Queue für SSE-Broadcast. Daemon handelt weiterhin `accept`/`discard`/`annotation`/source-splice in-process.

Nach ~1.5s `BashOutput` lesen → `{port, token, bridgeUrl, sessionId}` extrahieren.

**Schritt A2 — Monitor auf SSE** (via `Monitor`-Tool, persistent) — **MANDATORY, ohne läuft nichts**:

```bash
while true; do
  curl -sN "http://127.0.0.1:<port>/events?token=<token>" 2>&1 \
    | grep -E --line-buffered '"kind":"(generating|accept|discard|annotation|error)"'
  sleep 2
done
```

Mit `persistent: true`, `timeout_ms: 3600000`. Jeder user-driven Event (`generating` = neuer Auftrag, `accept`/`discard` = Entscheidung des Users, `annotation` = Notiz, `error` = Bridge-Fehler) wird zu **einer Chat-Notification** mit dem vollständigen Event-JSON im `<event>` Tag. `cycling`/`pick`/`parameter-change`/`heartbeat` werden ausgefiltert (Noise).

**Schritt A3 — User informieren + den Turn beenden**:

```
✓ wisp-design ready (external-agent + Monitor-SSE)
  URL: http://127.0.0.1:<port>
  Snippet for your <head>:
    <script id="wisp-design-live" src="http://127.0.0.1:<port>/live.js?token=<token>"></script>

  Pick any element, type your wish, click Generate.
  I (Opus 4.7) will design 3 distinct variants live in this chat.
  Stop: just say "stop wisp-design" — I'll kill the daemon + Monitor.
```

**Schritt A4 — Wenn eine Monitor-Notification ankommt** (Event-Loop, automatisch pro Notification):

Du bekommst eine Notification mit dem rohen `data: {...}` Line. Parse das JSON, lies `target.selector`, `target.tag`, `freeText`, `variantCount`, `sessionId`.

Generiere **`variantCount` DISTINCTE Varianten** (Default 3):
- Jede auf einer anderen primären Design-Achse: **hierarchy / layout / typography / color / density**. Drei Varianten derselben Achse = SLOP, verboten.
- **WICHTIG — Scope-Anatomie:** Der Scope-Root ist ein WRAPPER um den Klon des gepickten Elements (`variants-host > variant-host(scope-root) > klon`). Bare `:scope { display/flex/… }` stylt also den Wrapper, NICHT das Element! Das gepickte Element erreichst du mit `:scope > <tag>` (z. B. `:scope > div` bei einem DIV-Pick), dessen Kinder mit `:scope > <tag> > …`. Nur geerbte Properties (CSS-Vars, color, font-*) wirken auch über bare `:scope`. Immer `!important`, damit Tailwind-Utilities geschlagen werden.
- Tunable Properties als CSS-Vars (`--wisp-pad`, `--wisp-weight`) mit `/* @param: kind=range min=0 max=24 step=2 label="padding" */`.
- **Anti-Slop hard-bans** (nie generieren): purple-to-blue gradient, glassmorphism (backdrop-blur) ohne Begründung, hero-metric-template (98%/3.2x/24/7), gradient-text-headline, side-stripe (1-3px solid left border), default-tailwind-blue ohne brand-token, em-dash-UI.
- Jede Variant: 1-Satz `rationale` ≤180 chars, axis-attributed.
- v0 ist immer Baseline: `{"id":"v0","css":"/* baseline */","rationale":"Baseline — original."}`.

Schreibe das Payload nach `.wisp/cycling-<timestamp>.json`:

```json
{
  "kind": "cycling",
  "target": <event.target>,
  "targets": [<event.target>],
  "variants": [
    { "id": "v0", "css": "/* baseline */", "rationale": "Baseline." },
    { "id": "v1", "css": ":scope > h3 { font-weight: 700 !important; letter-spacing: -0.02em !important; }", "rationale": "Heavier headline + tighter tracking creates editorial hierarchy." },
    { "id": "v2", "css": ":scope > article { padding: 2em !important; } :scope > article > * + * { margin-top: 0.75em !important; }", "rationale": "Generous density — air between lines makes the card feel premium." }
  ],
  "activeIndex": 0,
  "sessionId": "<event.sessionId>"
}
```

**Pflichtfelder:** `targets` (Array!) ist das Feld, das der Browser-Renderer liest — `target` (Singular) zusätzlich für Daemon/Session-Log. `sessionId` = aus dem generating-Event. **Schnell antworten:** poste innerhalb weniger Sekunden — der Browser wartet im `generating`-State (Spinner); jede Minute Wartezeit ist tote UX. Bei neuen Varianten-Sets fürs SELBE Ziel: NEUE IDs vergeben (der Echo-Guard verwirft Sets mit identischen IDs).

POST zurück via Helper:
```
node "${CLAUDE_PLUGIN_ROOT}/scripts/post-cycling.mjs" .wisp/cycling-<ts>.json
```

Helper liest port.lock automatisch, POSTet, validiert Response. Browser SSE rendert die 3 Varianten sofort — der User kann ⌘+1/2/3 durchschalten, Slider tweaken, Accept klicken.

**Schritt A5 — Accept/Discard handhabt Daemon selbst.** Der Daemon hat den `--agent-driven` Code-Pfad: `accept` triggert `acceptVariant` mit dem `variantCss` aus dem Browser-Payload, source-splice + carbonize automatisch. Du musst auf SSE-Notifications für non-generating Events NICHT reagieren — die Monitor-Filter blendet die aus.

**Schritt A6 — Stop**: Wenn User "stop" sagt: 
1. `TaskStop bi8...` (oder welche Monitor-Task-ID) — killt Monitor
2. Background-Bash mit der Daemon-PID killen (lies aus port.lock)

---

### Modus B — `--agent-driven` (Headless Haiku-Daemon, Opt-in)

Nur wenn der User explizit "ich will Daemon-mode, kein interaktives Designen" sagt (oder wenn diese Session keinen Monitor starten kann):

```
node "${CLAUDE_PLUGIN_ROOT}/dist/index.js" live --agent-driven --quiet
```

Daemon spawnt für jeden `generating`-Event ein `claude -p --model haiku` (≈6k token cache, ≈$0.04/set, 10–60s Latenz). Du musst NICHT pollen — der Daemon arbeitet autonom. Nur Connection-Info ausgeben und Turn beenden. Quality-Tradeoff: Haiku < Opus-in-Chat.

---

### Variant-Generation Guidelines (für Modus A)

- **5 primäre Achsen**: hierarchy (size/weight), layout (block/flex/grid), typography (family/line-height/letter-spacing), color (token/accent/saturation), density (padding/gap/line-height).
- **Komponent-Lib-aware**: Wenn `event.target.selector` shadcn-Klassen enthält (`text-muted-foreground`, `bg-card`, etc.) — bevorzuge prop-edits-style CSS (border-radius, ring, shadow). Wenn raw Tailwind (`text-blue-500 px-4`) — direkte CSS-overrides okay.
- **Component-Type-aware** (wichtig!): 
  - `H1`-`H6`: typography axes (weight, tracking, line-height, letter-spacing)
  - `BUTTON`: padding, radius, weight, color
  - `ARTICLE` / `SECTION` / `DIV` (card-like): density, layout, shadow, border-radius
  - `INPUT`: border, padding, focus-ring
  - `IMG`: aspect-ratio, object-fit, border-radius, filter
- **Distinct rule**: Drei Varianten → drei verschiedene Achsen. Drei color-shifts derselben card = SLOP.
- **Brand-spec-aware**: Wenn `.wisp/brand-spec.json` existiert, lade es und referenziere Tokens. Wenn `.wisp/design-tokens.json` existiert, dito.

## Andere Subcommands

Wenn der User NICHT `live` aufruft, sondern z.B. `audit` oder `history`:

- `init` → `node "${CLAUDE_PLUGIN_ROOT}/dist/index.js" init <args>`
- `poll-once` / `post-event` → die jeweiligen Bash-Calls (one-shot)
- `skills <index|search>` → `node "${CLAUDE_PLUGIN_ROOT}/dist/index.js" skills <args>`
- `sync --from …` → `node "${CLAUDE_PLUGIN_ROOT}/dist/index.js" sync <args>`
- `audit [paths] [--mode]` → `node "${CLAUDE_PLUGIN_ROOT}/dist/index.js" audit <args>` (Verification-Gate)
- `history [--list|--task|--replay]` → `node "${CLAUDE_PLUGIN_ROOT}/dist/index.js" history <args>`
- `morph` (internal, Browser ruft selbst) — sollte selten Direct-User-Aufruf sein
- `policy [--propose|--apply]` → `node "${CLAUDE_PLUGIN_ROOT}/dist/index.js" policy <args>`
- `doctor [--fix]` → `node "${CLAUDE_PLUGIN_ROOT}/dist/index.js" doctor <args>`
- leer / `--help` → diese Tabelle ausgeben

## Notes

- Plugin-Schema: siehe `~/.claude/CLAUDE.md` Section "Claude Code plugin schema (verified end-to-end)".
- `dist/` ist im Repo committed; plugin-clone hat keinen build step.
- `--agent-driven` mode ist Phase 7.8 — vorher rannte ein in-process stub-catalog für variants.
- `sync` ist explicit-only (kein File-Watcher, kein Push).
- `audit --mode strict` exit-code 1 bei hard-ban hits. `--fail-on-warn` promoteet warn zu exit-1.
- Stop-hook läuft anti-slop on git-diff bei jedem Claude-Turn, p99 < 100ms. `WISP_DESIGN_STRICT=1` macht hard-block.
