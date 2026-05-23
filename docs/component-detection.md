# Component-Library Detection

**Phase 6 — Improvement #11.** Detect the project's UI component library
and pick the appropriate edit strategy (prop-edit vs class-edit vs
css-override vs structural-edit) before generating variants.

## Why

Impeccable always edits CSS. If the project uses shadcn / Radix / MUI, the
right move is usually to change a prop (`<Button variant="ghost"
size="sm">`) instead of overriding the library's CSS. Prop edits compose
correctly under future theme changes; CSS overrides become orphaned
specificity bombs.

wisp-design detects the lib up front, so the variant-generation prompt can
say "prefer prop edits for shadcn buttons" and the source-edit engine
routes accordingly.

## Detection sources (4)

Each weighted to reflect signal strength:

| Source | Weight | Rationale |
|---|---|---|
| `package.json` key match | 0.5 | The dep is literally installed; strongest single signal. |
| Import scan (regex) | 0.4 | Matched usage in source. Slightly weaker than dep — the dep might be a transitive leftover. |
| Filename pattern (regex) | 0.3 | E.g. `tailwind.config.ts` is canonical. Weaker because filenames are project conventions. |
| className pattern (regex) | 0.2 | Utility-class shape is the weakest signal — can be hand-rolled or copy-pasted. |

The aggregation per `(lib, file)` is **capped at 1.0** (`COMPONENT_DETECT_PER_FILE_WEIGHT_CAP`),
THEN averaged across the sampled files. This prevents one shadcn-heavy file
from dragging the verdict on an otherwise mixed codebase.

Final confidence is `min(1, mean(per-file caps))` for each lib; the lib
with the highest confidence becomes `primaryLib`.

## Detection rules

The authoritative table lives in `COMPONENT_DETECTION_RULES`
(`src/contracts/component.ts`). Summary:

| Lib | package.json | Import | Filename | ClassName | Strategy |
|---|---|---|---|---|---|
| shadcn | `@shadcn/ui` (rare) | `from "@/components/ui/<primitive>"` | `components/ui/<primitive>.tsx` | `cn(` utility | prop-edit |
| radix | `@radix-ui/react-*` | `from "@radix-ui/..."` | — | — | prop-edit |
| mui | `@mui/material`, `@mui/core`, `@mui/joy`, `@mui/base` | `from "@mui/..."` | — | — | prop-edit |
| chakra | `@chakra-ui/react` | `from "@chakra-ui/..."` | — | — | prop-edit |
| ant | `antd` | `from "antd/..."` | — | — | prop-edit |
| tailwind | `tailwindcss` | — | `tailwind.config.*` | `bg-/text-/p-/m-/flex/grid/gap-/space-` patterns | class-edit |
| vanilla | — | — | — | — | css-override (fallback) |

## Quick vs deep scan

| Mode | When | Files scanned |
|---|---|---|
| `quick: true` | Before each variant generation (hot-path). | top-10 most-recently-modified source files (or explicit `sampleFiles`) + `package.json`. Must complete <50ms on medium projects. |
| `quick: false` | `wisp-design init`, the first-time setup wizard. | every source file not on the Phase-3 refuse-list (`node_modules/`, `dist/`, `.next/`, etc.). |

The refuse-list filter is shared with Phase 3 — the detector calls into
`safetyCheck` paths to stay consistent.

## Confidence threshold

`COMPONENT_DETECT_CONFIDENCE_THRESHOLD = 0.6`. Below this, the detector
returns `primaryLib = vanilla` and the agent falls back to `css-override`
even if some signals matched another lib.

Tuned via research/competitive-landscape.md § Improvement #11 — captures
shadcn projects with ≥2 imports + `cn` utility, while filtering projects
that merely have `@radix-ui` as a transitive dependency without using it.

## Edit-strategy mapping

```
primaryLib         → preferredStrategy   fallbackStrategies (in order)
─────────────────────────────────────────────────────────────────────
shadcn             → prop-edit           [class-edit, css-override]
radix              → prop-edit           [css-override]
mui                → prop-edit           [css-override]
chakra             → prop-edit           [css-override]
ant                → prop-edit           [css-override]
tailwind           → class-edit          [css-override]
vanilla            → css-override        []
--structural flag  → structural-edit     [css-override]
```

The agent loop tries the preferred strategy first. If the source-edit layer
returns a refuse-result (e.g. shadcn primitive has been hand-customised and
prop change wouldn't compose), it falls through to the next strategy.
Phase-3 `safety.ts` is the gate that distinguishes "prop-edit possible"
from "must fall back".

## Limitations (documented honestly)

- **Custom design systems** that don't match any of the 7 patterns get
  `vanilla` verdict. The agent falls back to css-override; the user can
  override via `.wisp/policy.md` (`componentLib: custom-foo`) if a future
  release adds a custom-lib hook.
- **Hybrid projects** are not first-class. A project that uses shadcn AND
  Tailwind utility classes will report shadcn (because the import-scan
  weight wins). Tailwind's class-edit fallback is still available via the
  fallback chain.
- **CSS-in-JS libraries** (styled-components, emotion, vanilla-extract,
  stitches) are NOT detected in Phase 6. The detector returns `vanilla`
  for these and the css-override path still works — just sub-optimally.
- **Monorepo subtrees** with different stacks per workspace are not
  isolated. The detector reads `package.json` at `projectRoot`; users with
  per-workspace stacks should run `wisp-design` from inside the workspace
  they're editing, not the repo root.

## CLI surface

Component detection is INTERNAL — there's no top-level `wisp-design detect`
command. Detection runs automatically:

1. `wisp-design init` runs `detect({ quick: false })` and writes the result
   into `.wisp/brand-spec.json` (under a `componentLib` key).
2. Before each variant generation, the agent loop runs
   `detect({ quick: true })` and passes the verdict in
   `VariantGenerationRequest.componentLib`.

The `wisp-design doctor` check verifies `.wisp/policy.md` and `.wisp/sessions/`
exist (Phase 6). It does not (yet) verify a component-detection cache file —
detection is cheap enough to re-run per session.
