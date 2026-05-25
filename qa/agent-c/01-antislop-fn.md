# QA Agent-C: Anti-Slop Findings

## Test 1: Hard-Ban Detection (FN Rate)

14 slop fixtures, 2 per rule.

| Rule | Caught | Total | Rate | Status |
|------|--------|-------|------|--------|
| em-dash-ui | 2 | 2 | 2/2 (100%) | PASS |
| gradient-text-headline | 2 | 2 | 2/2 (100%) | PASS |
| default-glassmorphism | 2 | 2 | 2/2 (100%) | PASS |
| hero-metric-template | 2 | 2 | 2/2 (100%) | PASS |
| side-stripe-decoration | 2 | 2 | 2/2 (100%) | PASS |
| purple-blue-gradient | 2 | 2 | 2/2 (100%) | PASS |
| generic-ai-illustration | 2 | 2 | 2/2 (100%) | PASS |

**Overall FN rate:** 0/14 = 0.0%
**Target:** 0%
**Status:** PASS

All 14 slop fixtures caught.

## Test 2: FPR on 20 Clean Tailwind Fixtures

| Metric | Count | Rate | Target | Status |
|--------|-------|------|--------|--------|
| Hard-ban FPR | 0/20 | 0.0% | ≤5% | PASS |
| Soft-warn FPR | 1/20 | 5.0% | <20% (Phase-7) | PASS |

### Soft-Warn Over-Firing Detail

| Rule | Files Flagged | Rate |
|------|--------------|------|
| single-weight-typography | 1/20 | 5% |

### Notes
- `single-weight-typography` fires on TSX/CSS files that only declare one font-weight (expected on single-component fixtures)
- `round-number-whitespace` aggregator threshold (≥4 decls, ratio>0.7) suppresses most clean-file FPs
