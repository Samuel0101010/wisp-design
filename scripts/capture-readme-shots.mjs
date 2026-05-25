#!/usr/bin/env node
// Capture the three README "What it looks like" screenshots against the
// running wisp-design daemon (port 31344) + sample/index.html.
//
// Usage:  node scripts/capture-readme-shots.mjs
//
// Requires: daemon already running (--external-agent --inject sample/index.html),
// and Playwright optional-dep installed in node_modules.

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

// ---- Tiny static server for sample/ ----
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

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 760 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();

// Capture console for debug
page.on("console", (m) => console.log(`[browser ${m.type()}]`, m.text().slice(0, 200)));
page.on("pageerror", (e) => console.log(`[browser error]`, e.message));

await page.goto(`http://127.0.0.1:${port}/`);
await page.waitForFunction(() => typeof window.__wispHandle !== "undefined", { timeout: 8000 });
console.log("live.js initialized, __wispHandle present");

// ---------- SCREENSHOT 1 — PICK MODE ----------
// Click the + Pick button in the idle floating-bar to enter PICKING state.
await page.evaluate(() => {
  const bar = document.querySelector('[data-wisp-ui="bar"]');
  if (!bar) throw new Error("bar not found");
  // The + Pick button is the primary button in the idle row.
  const buttons = Array.from(bar.querySelectorAll("button"));
  const pickBtn = buttons.find((b) => b.textContent.includes("Pick"));
  if (!pickBtn) throw new Error("pick button not found");
  pickBtn.click();
});
await page.waitForTimeout(200);
// Hover the pricing card to render the magenta picker outline
await page.locator("article.bg-white").first().hover();
await page.waitForTimeout(300);
await page.screenshot({
  path: path.join(ASSETS_DIR, "screenshot-1-pick.png"),
  clip: { x: 0, y: 100, width: 1280, height: 580 },
});
console.log("screenshot-1-pick.png saved");

// ---------- SCREENSHOT 2 — CYCLING ----------
// Click the article to enter CONFIGURING, fill the textarea, submit, then
// POST 3 variants directly to the bridge so the browser renders cycling.
await page.locator("article.bg-white").first().click();
await page.waitForTimeout(300);
// Fill the freetext
const textarea = await page.locator('[data-wisp-ui="freetext"]');
await textarea.fill("editorial hover physics, refined");
await page.waitForTimeout(150);
// Click Generate
await page.evaluate(() => {
  const buttons = Array.from(document.querySelectorAll('[data-wisp-ui="bar"] button'));
  const gen = buttons.find((b) => b.textContent.trim() === "Generate");
  if (gen) gen.click();
});
await page.waitForTimeout(400);

// Now POST a cycling event back through the bridge with 3 distinct variants.
const target = await page.evaluate(() => {
  const a = document.querySelector("article.bg-white");
  if (!a) return null;
  const r = a.getBoundingClientRect();
  return {
    selector: "article.bg-white.border.border-neutral-200",
    tag: "ARTICLE",
    rect: { x: r.x, y: r.y, w: r.width, h: r.height },
  };
});
const sessionId = await page.evaluate(() => window.__wispHandle?.sessionId ?? "screenshot-session");
const cyclingPayload = {
  kind: "cycling",
  target,
  variants: [
    { id: "v0", css: "/* baseline */", rationale: "Baseline original card." },
    {
      id: "v1",
      css: ":scope > article { transition: transform 0.35s cubic-bezier(0.22,1,0.36,1) !important; } :scope > article:hover { transform: translateY(-6px) !important; box-shadow: 0 16px 36px -8px rgba(0,0,0,0.10) !important; border-color: rgb(23,23,23) !important; }",
      rationale: "Hover physics — card lifts -6px on hover, shadow grows.",
    },
    {
      id: "v2",
      css: ":scope > article { border: 1px solid rgb(23,23,23) !important; border-radius: 2px !important; } :scope > article > header > h3 { font-family: Cambria, Georgia, serif !important; font-weight: 500 !important; }",
      rationale: "Editorial — serif headline, hairline rules, no radius.",
    },
  ],
  activeIndex: 0,
  sessionId,
};
// Direct POST from Node side (page.evaluate allows only ONE arg).
await fetch(`http://127.0.0.1:${LOCK.port}/events?token=${LOCK.token}`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(cyclingPayload),
});
await page.waitForTimeout(800);
await page.screenshot({
  path: path.join(ASSETS_DIR, "screenshot-2-cycle.png"),
  clip: { x: 0, y: 100, width: 1280, height: 580 },
});
console.log("screenshot-2-cycle.png saved");

// ---------- SCREENSHOT 3 — VERIFICATION GATE ----------
// Capture the audit-strict CLI output rendered as a terminal-style HTML page.
// This is the user-facing "block accept" surface.
const auditHtml = `<!doctype html><html><head><meta charset="utf-8"><style>
  body { margin: 0; padding: 0; background: #0d0d0d; font: 14px/1.5 ui-monospace, "Cascadia Code", Consolas, monospace; color: #e8e8e8; }
  .terminal { padding: 40px 56px; max-width: 1100px; }
  .prompt { color: #c2a148; }
  .ok { color: #4ec9b0; }
  .warn { color: #d7ba7d; }
  .fail { color: #f48771; }
  .blocked { color: #f48771; font-weight: 600; }
  .rule { color: #c586c0; font-weight: 500; }
  .hint { color: #888; font-style: italic; }
  table { border-collapse: collapse; margin: 12px 0; }
  th, td { padding: 6px 16px 6px 0; text-align: left; }
  th { color: #888; font-weight: 500; border-bottom: 1px solid #333; }
  .summary { background: #1a0e0e; border-left: 3px solid #f48771; padding: 14px 20px; margin: 16px 0; }
</style></head><body><div class="terminal">
<div><span class="prompt">$</span> wisp-design audit sample/index.html --mode strict</div>
<br>
<div>## wisp-design audit</div>
<br>
<table>
  <tr><th>mode</th><th>verdict</th><th>blocked</th><th>hard-bans</th><th>a11y-fails</th><th>warns</th><th>timing</th></tr>
  <tr><td>audit-strict</td><td class="fail">fail</td><td class="blocked">true</td><td>13</td><td>2</td><td>3</td><td>910ms / 30000ms</td></tr>
</table>
<br>
<div class="summary">
<span class="blocked">✗ Accept blocked</span> — 13 hard-bans, 2 a11y violations<br>
The verification-gate refuses to commit a change that would ship slop or WCAG AA violations to your users.
</div>
<br>
<div><span class="fail">anti-slop</span> — fail, 697ms</div>
<div>&nbsp;&nbsp;<span class="rule">em-dash-ui</span> &times; 3 — em-dash in UI text, reads as docs-prose, not interface copy <span class="hint">(L191, L194, L219)</span></div>
<div>&nbsp;&nbsp;<span class="rule">purple-blue-gradient</span> &times; 2 — generic AI brand vibe <span class="hint">(L126, L128)</span></div>
<div>&nbsp;&nbsp;<span class="rule">gradient-text-headline</span> &times; 1 — kills scanability <span class="hint">(L128)</span></div>
<div>&nbsp;&nbsp;<span class="rule">hero-metric-template</span> &times; 4 — 98%/3.2x/24/7 template <span class="hint">(L128, L137, L142, L145)</span></div>
<div>&nbsp;&nbsp;<span class="rule">default-glassmorphism</span> &times; 3 — backdrop-blur without rationale <span class="hint">(L136, L140, L144)</span></div>
<br>
<div><span class="warn">a11y-axe</span> — warn, 887ms</div>
<div>&nbsp;&nbsp;<span class="rule">color-contrast</span> — text color #b8b8b8 on #ffffff fails AA (ratio 1.97, required 4.5)</div>
<div>&nbsp;&nbsp;<span class="rule">image-alt</span> — img missing alternative text</div>
<br>
<div class="hint">Fix the cited rules and re-run, or use <span class="prompt">--override</span> with reason (logged to session JSONL).</div>
</div></body></html>`;

const auditPage = await ctx.newPage();
await auditPage.setViewportSize({ width: 1280, height: 720 });
await auditPage.setContent(auditHtml, { waitUntil: "domcontentloaded" });
await auditPage.screenshot({
  path: path.join(ASSETS_DIR, "screenshot-3-gate.png"),
  fullPage: false,
});
console.log("screenshot-3-gate.png saved");
await auditPage.close();

await browser.close();
server.close();
console.log("done.");
