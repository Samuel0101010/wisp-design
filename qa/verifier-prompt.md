# Verifier Agent Prompt (ready to spawn after coders complete)

## Domain
End-to-end validation of the Phase 6.5 Bug-Fix Sprint outputs. Confirms that all 14 launch-blocker fixes actually work against the live `sample/` fixtures.

## File ownership
- **Read-only** on all `src/` (coders own it)
- May add/modify `tests/integration/phase-6.5-launch-readiness.test.ts`
- May write findings to `qa/verifier/`

## Test matrix

### Round 1: Full test suite + build
1. `npx tsc --noEmit` — must be clean
2. `npx vitest run` — must be 100% green (expected: 626 prior + ~30 new from 4 coders = ~656)
3. `npm run build` — must succeed
4. `node dist/index.js doctor` — must show 14/14 (or new count) checks pass

### Round 2: Anti-slop linter against sample fixtures (coder-1 verification)
```bash
node dist/index.js audit sample/components/AiHero.tsx --format json
# EXPECT: ≥4 hard-ban hits across rules:
#   - gradient-text-headline
#   - hero-metric-template
#   - default-glassmorphism
#   - purple-blue-gradient

node dist/index.js audit sample/components/PricingCard.tsx --format json
# EXPECT: 0 hard-ban hits (no regression)

node dist/index.js audit sample/index.html sample/styles.css --format json
# EXPECT: ≥4 hard-ban hits on HTML (Tailwind classes) + 2 on CSS (raw properties)
```

### Round 3: Verify-Gate silent-skip fix (coder-2 verification)
```bash
node dist/index.js audit sample/index.html --mode full --format json
# EXPECT:
#   - a11y-axe: either "pass" with NO violations OR "warn" with concrete violations (NOT "pass" with skipped:error)
#   - a11y-axe MUST catch the deliberate fixtures: color-contrast (#b8b8b8), image-alt (placeholder img), button-name (icon-only)
#   - multi-viewport: either "pass" (if Playwright installed) OR explicit "skipped: optional-dep-missing" (NOT silently passing on error)
#   - tab-order: each violation has NON-EMPTY message with concrete description

node dist/index.js audit sample/components/PricingCard.tsx --mode full --format json
# EXPECT: 0 a11y, 0 tab-order, 0 reduced-motion, 0 hard-ban
```

### Round 4: Stop-hook Windows timeout fix (coder-1 verification)
```bash
# Stage a slop file in git
echo "<div className=\"bg-gradient-to-r from-purple-500 to-blue-500 bg-clip-text text-transparent\">slop</div>" > qa/verifier/temp-slop.tsx
git add qa/verifier/temp-slop.tsx

# Trigger stop-hook
echo '{}' | node dist/index.js hook stop 2>&1

# EXPECT (default warn mode): stderr contains "wisp-design anti-slop warn" + rule citation
#   (i.e., it actually ran git diff and got the file — no silent skip from ETIMEDOUT)

WISP_DESIGN_STRICT=1 echo '{}' | node dist/index.js hook stop
# EXPECT (strict): stdout contains {"permissionDecision":"block","message":"..."}

git reset qa/verifier/temp-slop.tsx
rm qa/verifier/temp-slop.tsx
```

Time 20 runs back-to-back, compute p99. EXPECT: p99 < 200ms on Windows (relaxed budget), < 100ms on Linux/macOS.

### Round 5: `live` command boot (coder-3 verification)
```bash
# Boot in background
node dist/index.js live --non-interactive --port 0 --quiet &
LIVE_PID=$!
sleep 2

# Verify port.lock written
[ -f .wisp/live/port.lock ] || echo "FAIL: port.lock not written"

# Verify bridge responds on the discovered port
PORT=$(node -e "console.log(JSON.parse(require('fs').readFileSync('.wisp/live/port.lock','utf8')).port)")
curl -sf http://127.0.0.1:$PORT/health | grep '"ok":true' || echo "FAIL: /health"

# SIGTERM
kill -TERM $LIVE_PID
sleep 1

# Verify port.lock cleaned
[ ! -f .wisp/live/port.lock ] || echo "FAIL: port.lock not cleaned on SIGTERM"
```

### Round 6: `init` command (coder-4 verification)
```bash
# In a temp dir
cd /tmp/wisp-test-init  # mkdir if needed
node /path/to/wisp-design/dist/index.js init --non-interactive --brand-name "TestCo" --primary-color "oklch(60% 0.2 250)"

# Verify
[ -f .wisp/brand-spec.json ] || echo "FAIL: brand-spec not written"
[ -f .wisp/policy.md ] || echo "FAIL: policy.md not written"

# Validate brand-spec parses against BrandSpecSchema
node -e "import('zod').then(({z}) => /* parse */) /* validate */"

# Re-run idempotency
node /path/to/wisp-design/dist/index.js init --non-interactive
# EXPECT: stdout contains "already initialized" + exit 0
```

### Round 7: Chrome MCP live demo (lead orchestrates separately)
Verifier produces final report. Lead runs the actual Chrome MCP interaction.

## Output

Write `qa/verifier/SUMMARY.md` with:
- All 14 launch-blocker fixes verified ✓/✗
- Final test count (with delta)
- p99 timing on Stop-hook
- Any regression discovered

Verdict: GO / NO-GO for Phase 7 launch.

## Report back (under 500 words)
Tabular. Each round PASS/FAIL/PARTIAL. List any remaining blocker by # + description + suggested fix.
