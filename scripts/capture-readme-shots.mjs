#!/usr/bin/env node
// Capture the three README "What it looks like" screenshots.
//
// Strategy:
//  1) PICK    — position cursor on the Article's empty header area so the picker
//               outlines the WHOLE article (not a child <li>), then hover-pause.
//  2) CYCLE   — POST a cycling event with 3 variants where each is VISIBLY
//               DIFFERENT at rest (no hover-only variants). Force active=2 so
//               the card shows the second variant's resting-state styling.
//  3) GATE    — terminal-style HTML rendered with brand gold (#c2a148) on a
//               soft dark (#171717) panel, not harsh pure-black.

import { chromium } from "playwright";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SAMPLE_DIR = path.join(ROOT, "sample");
const ASSETS_DIR = path.join(ROOT, "docs/assets");
const LOCK = JSON.parse(fs.readFileSync(path.join(ROOT, ".wisp/live/port.lock"), "utf8"));

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

// ---- Static server for sample/ ----
const server = http.createServer((req, res) => {
  let url = (req.url ?? "/").split("?")[0];
  if (url === "/") url = "/index.html";
  const f = path.join(SAMPLE_DIR, url);
  if (!f.startsWith(SAMPLE_DIR)) { res.writeHead(403); res.end(); return; }
  fs.readFile(f, (err, data) => {
    if (err) { res.writeHead(404); res.end(`not found: ${url}`); return; }
    const ext = path.extname(f);
    res.writeHead(200, { "Content-Type": MIME[ext] ?? "text/plain" });
    res.end(data);
  });
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;
console.log(`static server: http://127.0.0.1:${port}`);

const VIEW = { width: 1440, height: 900 };
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 2 });
const page = await ctx.newPage();

page.on("console", (m) => { if (m.type() === "error") console.log("[browser err]", m.text().slice(0, 200)); });

await page.goto(`http://127.0.0.1:${port}/`);
await page.waitForFunction(() => typeof window.__wispHandle !== "undefined", { timeout: 8000 });
console.log("live.js initialized");

// Hide the slop + a11y-fail sections so they don't bleed into the screenshot.
// The README screenshots only need the clean baseline card + the overlay UI;
// the other sections are there for the audit-strict gate demo (covered by
// shot 3) and would just add visual noise to shots 1 + 2.
await page.evaluate(() => {
  for (const sel of ['[data-sample="slop"]', '[data-sample="a11y-fail"]']) {
    const el = document.querySelector(sel);
    if (el) { el.style.visibility = "hidden"; el.style.pointerEvents = "none"; }
  }
});
await page.waitForTimeout(120);

// Common: locate the article's bounding box so we can position cursor in
// the "safe zone" (right edge padding where no LI/H3/p children sit).
const articleBox = await page.locator("article.bg-white").first().boundingBox();
console.log(`article: ${JSON.stringify(articleBox)}`);

// ============================================================================
// SCREENSHOT 1 — PICK MODE
// ============================================================================
//
// Click + Pick. Then move the cursor onto the article's PADDING area (top-right
// corner inside the card, where no children live) so the picker resolves to
// <article>, not a <li> / <h3> / <button>.
await page.evaluate(() => {
  const buttons = Array.from(document.querySelectorAll('[data-wisp-ui="bar"] button'));
  const pick = buttons.find((b) => b.textContent.includes("Pick"));
  pick && pick.click();
});
await page.waitForTimeout(200);

// Cursor INSIDE the article but in its top padding (~12px from top, near
// right edge) where no <header>/<p>/<ul>/<button> child lives.
const padX = articleBox.x + articleBox.width - 20;
const padY = articleBox.y + 12;
await page.mouse.move(padX, padY, { steps: 6 });
await page.waitForTimeout(400);

// Crop tight: article + a bit of margin + floating-bar area
const crop1 = {
  x: Math.max(0, articleBox.x - 40),
  y: Math.max(0, articleBox.y - 40),
  width: Math.min(VIEW.width, articleBox.width + 400),
  height: Math.min(VIEW.height, articleBox.height + 360),
};
await page.screenshot({
  path: path.join(ASSETS_DIR, "screenshot-1-pick.png"),
  clip: crop1,
});
console.log("screenshot-1-pick.png saved");

// Cancel pick mode (Esc) before next shot
await page.keyboard.press("Escape");
await page.waitForTimeout(200);

// ============================================================================
// SCREENSHOT 2 — CYCLING (active variant 2, "Editorial")
// ============================================================================
//
// Drive: + Pick → click article → fill textarea → Generate → POST cycling
// with variants whose v2 has REST-STATE visual changes (serif headline,
// hairline rule, no radius). Then setActive(2) so the rendered card shows v2.

await page.evaluate(() => {
  const buttons = Array.from(document.querySelectorAll('[data-wisp-ui="bar"] button'));
  const pick = buttons.find((b) => b.textContent.includes("Pick"));
  pick && pick.click();
});
await page.waitForTimeout(200);

// Click the article DIRECTLY at the top-right padding zone (same coord as shot 1)
// so the pick lands on <article> not a child. Use mouse.click to be sure.
await page.mouse.click(padX, padY);
await page.waitForTimeout(400);

// Fill freetext
await page.locator('[data-wisp-ui="freetext"]').fill("show me 3 directions");
await page.waitForTimeout(150);

// Click Generate
await page.evaluate(() => {
  const buttons = Array.from(document.querySelectorAll('[data-wisp-ui="bar"] button'));
  const gen = buttons.find((b) => b.textContent.trim() === "Generate");
  gen && gen.click();
});
await page.waitForTimeout(400);

// Build the cycling payload — three REST-STATE-distinct variants
const sessionId = await page.evaluate(() => window.__wispHandle?.sessionId ?? "shot-session");
const target = {
  selector: "article.bg-white.border.border-neutral-200",
  tag: "ARTICLE",
  rect: { x: articleBox.x, y: articleBox.y, w: articleBox.width, h: articleBox.height },
};

const cyclingPayload = {
  kind: "cycling",
  target,
  variants: [
    { id: "v0", css: "/* baseline */", rationale: "Baseline original card." },
    {
      id: "v1",
      // Density-loose: more padding, larger price, looser line-height
      css: ":scope > article { padding: 2.5em 2em !important; } :scope > article > p:nth-of-type(1) > span:first-child { font-size: 2.5rem !important; letter-spacing: -0.03em !important; } :scope > article > ul > li { padding-block: 4px !important; line-height: 1.7 !important; }",
      rationale: "Density-loose: bigger price, generous breathing room.",
    },
    {
      id: "v2",
      // Editorial: serif headline, hairline border, sharp corners, ivory ground
      css: ":scope > article { background-color: rgb(253, 252, 248) !important; border: 1px solid rgb(26, 24, 22) !important; border-radius: 2px !important; padding: 2em 1.75em !important; box-shadow: none !important; } :scope > article > header > h3 { font-family: Cambria, Georgia, 'Times New Roman', serif !important; font-weight: 500 !important; font-size: 1.5rem !important; letter-spacing: -0.018em !important; color: rgb(26, 24, 22) !important; } :scope > article > p:nth-of-type(1) > span:first-child { font-family: Cambria, Georgia, serif !important; font-weight: 400 !important; } :scope > article > button { background-color: rgb(26, 24, 22) !important; border-radius: 2px !important; font-size: 11px !important; letter-spacing: 0.18em !important; text-transform: uppercase !important; }",
      rationale: "Editorial: serif headline, hairline rule, no radius, ivory ground.",
    },
  ],
  activeIndex: 2, // <-- force v2 (editorial) to be the visible card
  sessionId,
};

await fetch(`http://127.0.0.1:${LOCK.port}/events?token=${LOCK.token}`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(cyclingPayload),
});
// Wait for SSE → state-machine → variant-render mount
await page.waitForTimeout(900);

// variant-render always boots at activeIndex=0 regardless of the cycling-event
// payload's activeIndex. Press "3" (1-indexed → variant 2 = Editorial) so the
// rendered card visibly shows v2's resting-state styling (serif headline,
// hairline rule, no radius, ivory ground).
await page.keyboard.press("3");
await page.waitForTimeout(350);

// Find the new article position (may have moved into a wrapper)
const newArticleBox = await page.evaluate(() => {
  const wrappers = document.querySelectorAll('[data-wisp-variant]');
  if (wrappers.length === 0) return null;
  // Visible (non-hidden) variant wrapper
  for (const w of wrappers) {
    if (!w.hasAttribute("hidden") && w.offsetParent !== null) {
      const r = w.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    }
  }
  return null;
});
console.log(`cycling article: ${JSON.stringify(newArticleBox)}`);

// Compose a tight crop that captures the article + variant cards stack
const cycleBarBox = await page.locator('[data-wisp-ui="bar"]').boundingBox();
const crop2 = newArticleBox && cycleBarBox ? {
  x: Math.max(0, Math.min(newArticleBox.x, cycleBarBox.x) - 30),
  y: Math.max(0, newArticleBox.y - 40),
  width: Math.min(VIEW.width, Math.max(newArticleBox.x + newArticleBox.width, cycleBarBox.x + cycleBarBox.width) - Math.min(newArticleBox.x, cycleBarBox.x) + 60),
  height: Math.min(VIEW.height, Math.max(newArticleBox.y + newArticleBox.height, cycleBarBox.y + cycleBarBox.height) - newArticleBox.y + 80),
} : { x: 0, y: 100, width: VIEW.width, height: 700 };
await page.screenshot({
  path: path.join(ASSETS_DIR, "screenshot-2-cycle.png"),
  clip: crop2,
});
console.log("screenshot-2-cycle.png saved");

// ============================================================================
// SCREENSHOT 3 — AUDIT-STRICT GATE (soft-terminal, brand-aligned)
// ============================================================================
//
// Render a terminal panel with the brand palette: gold #c2a148 prompt,
// soft #171717 ground (not pure #000), tight typography.
const auditHtml = `<!doctype html><html><head><meta charset="utf-8"><style>
  :root {
    --bg: #f5f4ef;
    --panel: #171717;
    --ink: #ededed;
    --muted: #999;
    --gold: #c2a148;
    --ok: #4ec9b0;
    --warn: #d7ba7d;
    --fail: #f48771;
    --rule: #d9a8ff;
  }
  body { margin: 0; padding: 60px 80px; background: var(--bg);
         font: 14px/1.6 ui-monospace, "Cascadia Code", Consolas, monospace; }
  .panel { background: var(--panel); color: var(--ink);
           border-radius: 12px; padding: 32px 44px;
           box-shadow: 0 24px 60px -20px rgba(23,23,23,0.18),
                       0 4px 12px -4px rgba(23,23,23,0.10);
           max-width: 1100px; margin: 0 auto; }
  .prompt { color: var(--gold); }
  .head { font-size: 18px; color: var(--gold); letter-spacing: 0.02em;
          margin: 18px 0 6px; font-weight: 500; }
  .fail { color: var(--fail); }
  .warn { color: var(--warn); }
  .ok { color: var(--ok); }
  .muted { color: var(--muted); }
  .rule { color: var(--rule); font-weight: 500; }
  .blocked { color: var(--fail); font-weight: 600; }
  table { border-collapse: collapse; margin: 14px 0 18px; }
  th, td { padding: 4px 22px 4px 0; text-align: left; font-weight: normal; }
  th { color: var(--muted); border-bottom: 1px solid #2a2a2a; font-size: 12px;
       text-transform: uppercase; letter-spacing: 0.08em; }
  .citation { color: var(--ink); padding-left: 22px; }
  .hint { background: rgba(244,135,113,0.08); border-left: 2px solid var(--fail);
          padding: 12px 16px; margin: 14px 0; color: var(--ink); }
  .footer-hint { color: var(--muted); font-style: italic; margin-top: 24px;
                 padding-top: 14px; border-top: 1px solid #2a2a2a; }
</style></head><body><div class="panel">
<div><span class="prompt">$</span> wisp-design audit sample/index.html --mode strict</div>
<div class="head">## wisp-design audit</div>
<table>
  <tr><th>mode</th><th>verdict</th><th>blocked</th><th>hard-bans</th><th>a11y-fails</th><th>warns</th><th>timing</th></tr>
  <tr><td>audit-strict</td><td class="fail">fail</td><td class="blocked">true</td><td>13</td><td>2</td><td>3</td><td>910ms</td></tr>
</table>
<div class="hint">
<span class="blocked">✗ Accept blocked</span> — 13 hard-bans, 2 a11y violations.<br>
The verification-gate refuses to commit a change that would ship slop or WCAG&nbsp;AA violations to your users.
</div>
<div class="head">anti-slop &middot; <span class="fail">fail</span> &middot; 697ms</div>
<div class="citation"><span class="rule">em-dash-ui</span> &times; 3 &nbsp; em-dash inside UI text reads as docs-prose, not interface copy &nbsp;<span class="muted">L191, L194, L219</span></div>
<div class="citation"><span class="rule">purple-blue-gradient</span> &times; 2 &nbsp; generic AI brand vibe &nbsp;<span class="muted">L126, L128</span></div>
<div class="citation"><span class="rule">gradient-text-headline</span> &times; 1 &nbsp; bg-clip-text on the headline kills scanability &nbsp;<span class="muted">L128</span></div>
<div class="citation"><span class="rule">hero-metric-template</span> &times; 4 &nbsp; 98% / 3.2x / 24/7 template &nbsp;<span class="muted">L128, L137, L142, L145</span></div>
<div class="citation"><span class="rule">default-glassmorphism</span> &times; 3 &nbsp; backdrop-blur on the hero, no rationale &nbsp;<span class="muted">L136, L140, L144</span></div>
<div class="head">a11y-axe &middot; <span class="warn">warn</span> &middot; 887ms</div>
<div class="citation"><span class="rule">color-contrast</span> &nbsp; text #b8b8b8 on #ffffff fails AA (ratio 1.97, required 4.5)</div>
<div class="citation"><span class="rule">image-alt</span> &nbsp; img missing alternative text</div>
<div class="footer-hint">Fix the cited rules and re-run &nbsp;&middot;&nbsp; or commit with <span class="prompt">--override &lt;reason&gt;</span> &nbsp;(logged to session JSONL)</div>
</div></body></html>`;

const gatePage = await ctx.newPage();
await gatePage.setViewportSize({ width: 1400, height: 1050 });
await gatePage.setContent(auditHtml, { waitUntil: "domcontentloaded" });
// Auto-trim crop to the panel
const panelBox = await gatePage.locator(".panel").boundingBox();
await gatePage.screenshot({
  path: path.join(ASSETS_DIR, "screenshot-3-gate.png"),
  clip: {
    x: Math.max(0, panelBox.x - 40),
    y: Math.max(0, panelBox.y - 40),
    width: panelBox.width + 80,
    height: panelBox.height + 80,
  },
});
console.log("screenshot-3-gate.png saved");
await gatePage.close();

await browser.close();
server.close();
console.log("done.");
