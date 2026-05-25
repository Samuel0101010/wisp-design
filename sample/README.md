# wisp-design sample · QA-sweep playground

Three deliberate components designed to exercise every verification check.

## Files

| File | Purpose |
|---|---|
| `index.html` | All-in-one demo page. Serve via `npx serve sample` or `python -m http.server 5173 -d sample`. Loads Tailwind via CDN — no install needed. |
| `styles.css` | Extra CSS file with deliberate slop in raw CSS (gradient-text, glassmorphism, side-stripe) so the linter's CSS-property regexes get exercised. |
| `components/PricingCard.tsx` | Clean standalone TSX. `wisp-design audit` should produce ZERO hits. |
| `components/AiHero.tsx` | Deliberate-slop standalone TSX. `wisp-design audit` should produce MULTIPLE hits (purple-blue-gradient, gradient-text, glassmorphism-default, hero-metric-template). |

## Three sections in index.html

| `data-sample` | What it tests |
|---|---|
| `clean` | Linter + a11y baseline — should fire nothing. |
| `slop` | Anti-slop hard-bans: gradient-text, glassmorphism-default, hero-metric-template, purple-blue-gradient. |
| `a11y-fail` | axe-core: color-contrast (#b8b8b8 on white ~2.1:1), image-alt (missing alt), button-name (icon-only). |

## Audit checks

```bash
# From the wisp-design repo root:
node dist/index.js audit sample/components/PricingCard.tsx --format json
node dist/index.js audit sample/components/AiHero.tsx       --format json
node dist/index.js audit sample/index.html sample/styles.css --format markdown
```

## Live demo (once `wisp-design live` is wired)

```bash
# Term 1 — static server
npx serve sample -l 5173

# Term 2 — wisp-design live attached to that target
node dist/index.js live --target http://127.0.0.1:5173 --inject sample/index.html
```
