# QA Agent-C: Component Detection Findings

## Test 5: Library Detection (6 project types)

**COMPONENT_DETECT_CONFIDENCE_THRESHOLD = 0.6**

| Project | Desired | Got | Confidence | Status | Finding |
|---------|---------|-----|------------|--------|---------|
| shadcn | shadcn | radix | 0.700 | DESIGN FINDING | collision with radix |
| radix-only | radix | radix | 0.700 | PASS | correct |
| mui | mui | vanilla | 0.425 | DESIGN FINDING | below threshold (0.425 < 0.6) |
| chakra | chakra | vanilla | 0.425 | DESIGN FINDING | below threshold (0.425 < 0.6) |
| antd | ant | vanilla | 0.433 | DESIGN FINDING | below threshold (0.433 < 0.6) |
| tailwind-vanilla | tailwind | vanilla | 0.275 | DESIGN FINDING | below threshold (0.275 < 0.6) |

## Design Findings

### Finding 1: Confidence Threshold Too High for Small Projects

**Severity: LAUNCH BLOCKER (mui, chakra, ant, tailwind with real projects fail)**

The averaging formula: `confidence = sum(per-file-capped-weights) / count(files-with-signal)`

With 1 package.json + 1-3 source files:
- pkg: weight=0.5 (1 file), source: weight=0.4 (1-3 files)
- average = (0.5 + 0.4×N) / (1+N) which converges to 0.4, never reaching 0.6

Required fix options:
1. Lower threshold from 0.6 to 0.45 (catches all cases with ≥1 dep + ≥1 import)
2. Make package.json a non-averaging "anchor" signal: if any pkg.json key matches, start confidence at 0.5 and only average source files on top
3. Use `max` instead of `average`: take the highest per-file score

### Finding 2: shadcn/radix Collision

**Severity: WARN (both get prop-edit strategy, so the edit path is the same)**

shadcn uses `@radix-ui/*` primitives, so the package.json signals fire for radix.
The detector needs the source import path `@/components/ui/` to outscore radix,
but that requires the components/ui/ directory to be scanned AND multiple files.

With 1 components/ui/ file: shadcn signals = import(0.4) + filename(0.3) + className(0.2) = capped 1.0
vs radix package.json: 3 deps × 0.5 = 1.5 → capped at 1.0
Net effect: both score 1.0 per their "file", averaging produces same confidence.
Tiebreaker goes to whichever lib appears first in ALL_LIBS iteration.

Required fix: boost shadcn filename pattern weight, or add an explicit "shadcn wins when components/ui/ exists" rule.

## Signal Detail

### shadcn (got: radix, conf=0.700)

| Source | Weight | Detail |
|--------|--------|--------|
| package.json | 0.5 | dep @radix-ui/react-dialog matches rule @radix-ui/react-dialog |
| package.json | 0.5 | dep @radix-ui/react-popover matches rule @radix-ui/react-popover |
| package.json | 0.5 | dep tailwindcss matches rule tailwindcss |
| import-scan | 0.4 | C:\Users\samue\github ideas\ruflo\wisp-design\qa\agent-c\fixtures\proj |
| filename-pattern | 0.3 | filename matched components\/ui\/(button|card|dialog|input|select|tabs |
| className-pattern | 0.2 | C:\Users\samue\github ideas\ruflo\wisp-design\qa\agent-c\fixtures\proj |

### radix-only (got: radix, conf=0.700)

| Source | Weight | Detail |
|--------|--------|--------|
| package.json | 0.5 | dep @radix-ui/react-dialog matches rule @radix-ui/react-dialog |
| package.json | 0.5 | dep @radix-ui/react-popover matches rule @radix-ui/react-popover |
| package.json | 0.5 | dep @radix-ui/react-tooltip matches rule @radix-ui/react-tooltip |
| package.json | 0.5 | dep @radix-ui/react-dropdown-menu matches rule @radix-ui/react-dropdow |
| import-scan | 0.4 | C:\Users\samue\github ideas\ruflo\wisp-design\qa\agent-c\fixtures\proj |
| className-pattern | 0.2 | C:\Users\samue\github ideas\ruflo\wisp-design\qa\agent-c\fixtures\proj |

### mui (got: vanilla, conf=0.425)

| Source | Weight | Detail |
|--------|--------|--------|
| package.json | 0.5 | dep @mui/material matches rule @mui/material |
| import-scan | 0.4 | C:\Users\samue\github ideas\ruflo\wisp-design\qa\agent-c\fixtures\proj |
| import-scan | 0.4 | C:\Users\samue\github ideas\ruflo\wisp-design\qa\agent-c\fixtures\proj |
| import-scan | 0.4 | C:\Users\samue\github ideas\ruflo\wisp-design\qa\agent-c\fixtures\proj |

### chakra (got: vanilla, conf=0.425)

| Source | Weight | Detail |
|--------|--------|--------|
| package.json | 0.5 | dep @chakra-ui/react matches rule @chakra-ui/react |
| import-scan | 0.4 | C:\Users\samue\github ideas\ruflo\wisp-design\qa\agent-c\fixtures\proj |
| import-scan | 0.4 | C:\Users\samue\github ideas\ruflo\wisp-design\qa\agent-c\fixtures\proj |
| import-scan | 0.4 | C:\Users\samue\github ideas\ruflo\wisp-design\qa\agent-c\fixtures\proj |

### antd (got: vanilla, conf=0.433)

| Source | Weight | Detail |
|--------|--------|--------|
| package.json | 0.5 | dep antd matches rule antd |
| import-scan | 0.4 | C:\Users\samue\github ideas\ruflo\wisp-design\qa\agent-c\fixtures\proj |
| import-scan | 0.4 | C:\Users\samue\github ideas\ruflo\wisp-design\qa\agent-c\fixtures\proj |

### tailwind-vanilla (got: vanilla, conf=0.275)

| Source | Weight | Detail |
|--------|--------|--------|
| package.json | 0.5 | dep tailwindcss matches rule tailwindcss |
| className-pattern | 0.2 | C:\Users\samue\github ideas\ruflo\wisp-design\qa\agent-c\fixtures\proj |
| className-pattern | 0.2 | C:\Users\samue\github ideas\ruflo\wisp-design\qa\agent-c\fixtures\proj |
| className-pattern | 0.2 | C:\Users\samue\github ideas\ruflo\wisp-design\qa\agent-c\fixtures\proj |


## Summary

| Project | Correctly Detected? | Root Cause |
|---------|--------------------|-|
| shadcn | NO — gets radix | @radix-ui/* deps dominate; shadcn collision |
| radix-only | YES | 4 dep keys → high pkg.json score |
| mui | NO — gets vanilla | confidence 0.42 < threshold 0.6 |
| chakra | NO — gets vanilla | confidence 0.42 < threshold 0.6 |
| antd | NO — gets vanilla | confidence 0.43 < threshold 0.6 |
| tailwind-vanilla | NO — gets vanilla | confidence 0.27 < threshold 0.6 |

**Launch status: LAUNCH BLOCKER — 4 of 6 libraries undetectable in practice.**
Recommended fix: lower threshold to 0.45 OR make package.json an anchor (not averaged).
