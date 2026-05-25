// wisp-design — Tool panels (Phase 7.2)
//
// Compact idle-bar tools: each rendered as a 32x32 icon button in the bar
// that toggles a panel below. Panels are mutually exclusive — opening one
// closes any other open panel. All tools are in-browser (no agent / bridge
// round-trip) so they're available instantly even when offline.
//
// Tools shipped:
//   🎨 tokens   — distinct on-page colors, fonts, spacings
//   🔍 audit    — live anti-slop signal scan of the current DOM
//   ⚙ settings — variant-count default, reduced-motion echo
//   ⓘ about    — version, bridge status, quick keyboard reference

import { WISP_UI_DATA_ATTRIBUTE } from "./constants.js";
import { readVariantCount, writeVariantCount } from "./persisted-settings.js";

const W = WISP_UI_DATA_ATTRIBUTE;

// ---------------------------------------------------------------------------
// Panel styles — injected once.
// ---------------------------------------------------------------------------

const PANEL_STYLES =
  `[${W}="tool-row"]{display:flex;gap:6px;margin-top:8px;align-items:center}` +
  `[${W}="tool-row"] [${W}="spacer"]{flex:1}` +
  `[${W}="tool-btn"]{` +
    `background:#fff;border:1px solid rgb(229,229,229);border-radius:8px;` +
    `width:32px;height:32px;padding:0;cursor:pointer;` +
    `display:inline-flex;align-items:center;justify-content:center;` +
    `transition:background 0.1s ease,border-color 0.1s ease;` +
    `color:rgb(64,64,64);` +
  `}` +
  `[${W}="tool-btn"]:hover{background:rgb(245,245,245);color:rgb(23,23,23)}` +
  `[${W}="tool-btn"][aria-expanded="true"]{` +
    `background:rgb(23,23,23);color:#fff;border-color:rgb(23,23,23);` +
  `}` +
  `[${W}="tool-btn"]:focus-visible{outline:2px solid rgb(23,23,23);outline-offset:2px}` +
  `[${W}="tool-btn"] svg{width:16px;height:16px;stroke-width:1.5;` +
    `stroke:currentColor;fill:none;stroke-linecap:round;stroke-linejoin:round;` +
  `}` +
  `[${W}="tool-panel"]{` +
    `margin-top:10px;padding-top:10px;` +
    `border-top:1px solid rgb(229,229,229);` +
    `animation:wisp-tool-fade 180ms ease;` +
  `}` +
  `@keyframes wisp-tool-fade{from{opacity:0;transform:translateY(-2px)}to{opacity:1;transform:none}}` +
  `[${W}="tool-panel-title"]{` +
    `font-size:11px;text-transform:uppercase;letter-spacing:0.06em;` +
    `color:rgb(115,115,115);margin-bottom:6px;display:flex;align-items:center;justify-content:space-between;` +
  `}` +
  `[${W}="tool-panel-close"]{` +
    `background:transparent;border:none;cursor:pointer;color:rgb(115,115,115);` +
    `padding:0;font-size:12px;line-height:1;` +
  `}` +
  `[${W}="tool-panel-close"]:hover{color:rgb(23,23,23)}` +
  // Token swatch grid
  `[${W}="token-section"]{margin-bottom:10px}` +
  `[${W}="token-section-label"]{font-size:11px;color:rgb(115,115,115);margin-bottom:4px}` +
  `[${W}="token-swatches"]{display:flex;flex-wrap:wrap;gap:4px}` +
  `[${W}="swatch"]{` +
    `width:18px;height:18px;border-radius:4px;` +
    `border:1px solid rgba(0,0,0,0.08);cursor:default;flex-shrink:0;` +
  `}` +
  `[${W}="token-chip"]{` +
    `font-size:11px;background:rgb(245,245,245);border-radius:4px;` +
    `padding:2px 6px;color:rgb(64,64,64);font-variant-numeric:tabular-nums;` +
  `}` +
  // Audit panel
  `[${W}="audit-summary"]{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px}` +
  `[${W}="audit-pill"]{` +
    `font-size:11px;border-radius:9999px;padding:2px 8px;font-weight:500;` +
  `}` +
  `[${W}="audit-pill"][data-severity="ok"]{background:rgb(220,252,231);color:rgb(22,101,52)}` +
  `[${W}="audit-pill"][data-severity="warn"]{background:rgb(254,243,199);color:rgb(120,53,15)}` +
  `[${W}="audit-pill"][data-severity="fail"]{background:rgb(254,226,226);color:rgb(127,29,29)}` +
  `[${W}="audit-list"]{display:flex;flex-direction:column;gap:6px;max-height:200px;overflow-y:auto}` +
  `[${W}="audit-item"]{font-size:12px;color:rgb(64,64,64);line-height:1.4}` +
  `[${W}="audit-item-rule"]{font-weight:500;color:rgb(23,23,23);margin-right:4px}` +
  // Settings panel
  `[${W}="setting-row"]{display:flex;align-items:center;gap:8px;margin-bottom:8px}` +
  `[${W}="setting-row"]:last-child{margin-bottom:0}` +
  `[${W}="setting-label"]{font-size:12px;color:rgb(64,64,64);flex:1}` +
  `[${W}="setting-value"]{font-size:11px;color:rgb(115,115,115)}` +
  // About panel
  `[${W}="about-kvp"]{display:flex;justify-content:space-between;font-size:12px;` +
    `padding:4px 0;border-bottom:1px solid rgb(245,245,245);` +
  `}` +
  `[${W}="about-kvp"]:last-child{border-bottom:none}` +
  `[${W}="about-key"]{color:rgb(115,115,115)}` +
  `[${W}="about-value"]{color:rgb(23,23,23);font-variant-numeric:tabular-nums}` +
  // Keyboard hint table inside about
  `[${W}="kbd"]{` +
    `font-family:ui-monospace,"SF Mono",Menlo,monospace;font-size:10px;` +
    `background:rgb(245,245,245);border-radius:3px;padding:1px 4px;` +
    `border:1px solid rgb(229,229,229);` +
  `}`;

const STYLES_ATTR = "tool-panel-styles";

function injectToolStylesOnce(): void {
  if (typeof document === "undefined") return;
  if (document.querySelector(`style[${W}="${STYLES_ATTR}"]`) !== null) return;
  const style = document.createElement("style");
  style.setAttribute(W, STYLES_ATTR);
  style.textContent = PANEL_STYLES;
  document.head.appendChild(style);
}

// ---------------------------------------------------------------------------
// SVG icon snippets (16x16, strokeWidth: 1.5 — set via tool-btn CSS).
// Inline so the bundle has no external assets.
// ---------------------------------------------------------------------------

const ICON_SVG: Record<ToolId, string> = {
  tokens:
    // palette
    `<svg viewBox="0 0 24 24"><path d="M12 3a9 9 0 0 0 0 18 1.5 1.5 0 0 0 1.06-2.56l-.94-.94a1.5 1.5 0 0 1 1.06-2.56h2.32a3.5 3.5 0 0 0 0-7 9 9 0 0 0-3.5-5z"/><circle cx="7.5" cy="10.5" r="1"/><circle cx="12" cy="7.5" r="1"/><circle cx="16.5" cy="10.5" r="1"/></svg>`,
  audit:
    // shield-check
    `<svg viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>`,
  recent:
    // clock
    `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
  settings:
    // sliders
    `<svg viewBox="0 0 24 24"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/><circle cx="9" cy="6" r="2" fill="currentColor"/><circle cx="15" cy="12" r="2" fill="currentColor"/><circle cx="7" cy="18" r="2" fill="currentColor"/></svg>`,
  about:
    // info
    `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
};

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

export type ToolId = "tokens" | "audit" | "recent" | "settings" | "about";

const TOOL_LABELS: Record<ToolId, string> = {
  tokens: "Design tokens",
  audit: "Anti-slop audit",
  recent: "Recent changes",
  settings: "Settings",
  about: "About wisp-design",
};

export interface ToolPanelOptions {
  /** Where to mount the tool row (typically inside the idle bar content). */
  container: HTMLElement;
  /** Bridge URL — used for the About panel only. */
  bridgeUrl?: string;
  /** Token — never displayed; only used for the bridge-status fetch. */
  token?: string;
  /** Variant-count default — Settings panel reads/writes this. */
  initialVariantCount?: number;
  /** Notified when Settings changes variant-count. */
  onVariantCountChange?: (count: number) => void;
}

export interface ToolPanelHandle {
  close(): void;
  refresh(): void;
}

export function mountToolPanels(opts: ToolPanelOptions): ToolPanelHandle {
  injectToolStylesOnce();
  const container = opts.container;

  const toolRow = document.createElement("div");
  toolRow.setAttribute(W, "tool-row");
  const spacer = document.createElement("div");
  spacer.setAttribute(W, "spacer");
  toolRow.appendChild(spacer);

  let panelRoot: HTMLDivElement | null = null;
  let currentTool: ToolId | null = null;
  // Prefer the localStorage-persisted value; fall back to opts.initialVariantCount
  // (which is the boot-time default sourced from the floating-bar wiring) or 3.
  // The select-onChange below writes back to storage so the choice survives
  // page reload (Phase 7.13).
  let variantCount = clampVariantCount(readVariantCount(opts.initialVariantCount ?? 3));

  const close = (): void => {
    currentTool = null;
    if (panelRoot !== null && panelRoot.parentNode) {
      panelRoot.parentNode.removeChild(panelRoot);
    }
    panelRoot = null;
    for (const btn of toolRow.querySelectorAll(`[${W}="tool-btn"]`)) {
      btn.setAttribute("aria-expanded", "false");
    }
  };

  const open = (id: ToolId, btnEl: HTMLButtonElement): void => {
    if (currentTool === id) {
      close();
      return;
    }
    close();
    currentTool = id;
    btnEl.setAttribute("aria-expanded", "true");
    panelRoot = document.createElement("div");
    panelRoot.setAttribute(W, "tool-panel");

    const title = document.createElement("div");
    title.setAttribute(W, "tool-panel-title");
    const titleText = document.createElement("span");
    titleText.textContent = TOOL_LABELS[id];
    title.appendChild(titleText);
    const closeBtn = document.createElement("button");
    closeBtn.setAttribute(W, "tool-panel-close");
    closeBtn.setAttribute("type", "button");
    closeBtn.setAttribute("aria-label", "Close panel");
    closeBtn.textContent = "✕";
    closeBtn.addEventListener("click", close);
    title.appendChild(closeBtn);
    panelRoot.appendChild(title);

    const body = document.createElement("div");
    panelRoot.appendChild(body);
    renderPanelBody(id, body);

    container.appendChild(panelRoot);
  };

  const renderPanelBody = (id: ToolId, body: HTMLElement): void => {
    if (id === "tokens") renderTokensPanel(body);
    else if (id === "audit") renderAuditPanel(body);
    else if (id === "recent") renderRecentPanel(body);
    else if (id === "settings") renderSettingsPanel(body);
    else if (id === "about") renderAboutPanel(body);
  };

  // ---- Tokens ----
  const renderTokensPanel = (body: HTMLElement): void => {
    const tokens = extractDesignTokens();
    const colorSec = document.createElement("div");
    colorSec.setAttribute(W, "token-section");
    appendSectionLabel(colorSec, `Colors (${tokens.colors.length})`);
    const swatches = document.createElement("div");
    swatches.setAttribute(W, "token-swatches");
    for (const c of tokens.colors.slice(0, 24)) {
      const sw = document.createElement("div");
      sw.setAttribute(W, "swatch");
      sw.style.background = c;
      sw.title = c;
      swatches.appendChild(sw);
    }
    colorSec.appendChild(swatches);
    body.appendChild(colorSec);

    const fontSec = document.createElement("div");
    fontSec.setAttribute(W, "token-section");
    appendSectionLabel(fontSec, `Fonts (${tokens.fonts.length})`);
    const chips = document.createElement("div");
    chips.setAttribute(W, "token-swatches");
    for (const f of tokens.fonts.slice(0, 8)) {
      const chip = document.createElement("span");
      chip.setAttribute(W, "token-chip");
      chip.textContent = shortFontFamily(f);
      chip.title = f;
      chips.appendChild(chip);
    }
    fontSec.appendChild(chips);
    body.appendChild(fontSec);

    const spaceSec = document.createElement("div");
    spaceSec.setAttribute(W, "token-section");
    appendSectionLabel(spaceSec, `Spacings (${tokens.spacings.length})`);
    const spaceChips = document.createElement("div");
    spaceChips.setAttribute(W, "token-swatches");
    for (const s of tokens.spacings.slice(0, 14)) {
      const chip = document.createElement("span");
      chip.setAttribute(W, "token-chip");
      chip.textContent = s;
      spaceChips.appendChild(chip);
    }
    spaceSec.appendChild(spaceChips);
    body.appendChild(spaceSec);
  };

  // ---- Audit ----
  const renderAuditPanel = (body: HTMLElement): void => {
    const findings = scanAntiSlop();
    const summary = document.createElement("div");
    summary.setAttribute(W, "audit-summary");
    const severity =
      findings.fail > 0 ? "fail" : findings.warn > 0 ? "warn" : "ok";
    const pill = document.createElement("span");
    pill.setAttribute(W, "audit-pill");
    pill.setAttribute("data-severity", severity);
    pill.textContent =
      severity === "ok"
        ? "0 issues"
        : `${findings.fail} hard · ${findings.warn} soft`;
    summary.appendChild(pill);
    const total = document.createElement("span");
    total.setAttribute(W, "audit-pill");
    total.setAttribute("data-severity", "ok");
    total.style.background = "rgb(243,244,246)";
    total.style.color = "rgb(64,64,64)";
    total.textContent = `${findings.items.length} matched`;
    summary.appendChild(total);
    body.appendChild(summary);

    if (findings.items.length === 0) {
      const ok = document.createElement("div");
      ok.setAttribute(W, "audit-item");
      ok.textContent = "Page passes the anti-slop quick-scan.";
      body.appendChild(ok);
      return;
    }
    const list = document.createElement("div");
    list.setAttribute(W, "audit-list");
    for (const v of findings.items.slice(0, 12)) {
      const item = document.createElement("div");
      item.setAttribute(W, "audit-item");
      const rule = document.createElement("span");
      rule.setAttribute(W, "audit-item-rule");
      rule.textContent = v.rule;
      item.appendChild(rule);
      item.appendChild(document.createTextNode(v.message));
      list.appendChild(item);
    }
    body.appendChild(list);
  };

  // ---- Recent ----
  const renderRecentPanel = (body: HTMLElement): void => {
    if (opts.bridgeUrl === undefined || opts.token === undefined) {
      const msg = document.createElement("div");
      msg.setAttribute(W, "audit-item");
      msg.textContent =
        "Bridge URL not provided — Recent panel needs the live bridge to read session history.";
      body.appendChild(msg);
      return;
    }
    const loading = document.createElement("div");
    loading.setAttribute(W, "audit-item");
    loading.textContent = "Loading recent changes…";
    body.appendChild(loading);

    const url = `${opts.bridgeUrl}/sessions?token=${encodeURIComponent(opts.token)}`;
    fetch(url, { credentials: "omit" })
      .then((r) => r.json())
      .then((data) => {
        loading.remove();
        const entries = Array.isArray(data?.entries) ? data.entries : [];
        if (entries.length === 0) {
          const empty = document.createElement("div");
          empty.setAttribute(W, "audit-item");
          empty.textContent = "No accepts logged yet. Pick an element, click a chip, hit Accept.";
          body.appendChild(empty);
          return;
        }
        const summary = document.createElement("div");
        summary.setAttribute(W, "audit-summary");
        const pill = document.createElement("span");
        pill.setAttribute(W, "audit-pill");
        pill.setAttribute("data-severity", "ok");
        pill.style.background = "rgb(243,244,246)";
        pill.style.color = "rgb(64,64,64)";
        pill.textContent = `${entries.length} entries`;
        summary.appendChild(pill);
        body.appendChild(summary);

        const list = document.createElement("div");
        list.setAttribute(W, "audit-list");
        for (const e of entries) {
          const item = document.createElement("div");
          item.setAttribute(W, "audit-item");
          const time = document.createElement("span");
          time.setAttribute(W, "audit-item-rule");
          time.textContent = shortTime(e.ts) + " · " + e.variantId;
          item.appendChild(time);
          item.appendChild(document.createTextNode(" "));
          const target = document.createElement("span");
          target.style.fontFamily = "ui-monospace,Menlo,monospace";
          target.style.fontSize = "11px";
          target.textContent = shortTarget(e.targetId);
          target.title = e.targetId;
          item.appendChild(target);
          if (e.filePath) {
            const file = document.createElement("div");
            file.style.fontSize = "11px";
            file.style.color = "rgb(115,115,115)";
            file.textContent = shortFilePath(e.filePath);
            file.title = e.filePath;
            item.appendChild(file);
          }
          list.appendChild(item);
        }
        body.appendChild(list);
      })
      .catch((err) => {
        loading.remove();
        const errMsg = document.createElement("div");
        errMsg.setAttribute(W, "audit-item");
        errMsg.textContent = `Failed to load recent changes: ${String(err.message ?? err)}`;
        body.appendChild(errMsg);
      });
  };

  // ---- Settings ----
  const renderSettingsPanel = (body: HTMLElement): void => {
    const row1 = document.createElement("div");
    row1.setAttribute(W, "setting-row");
    const label1 = document.createElement("label");
    label1.setAttribute(W, "setting-label");
    label1.textContent = "Default variant count";
    const select = document.createElement("select");
    for (const n of [1, 3, 5, 8]) {
      const opt = document.createElement("option");
      opt.value = String(n);
      opt.textContent = String(n);
      if (n === variantCount) opt.selected = true;
      select.appendChild(opt);
    }
    select.addEventListener("change", () => {
      const n = clampVariantCount(Number(select.value));
      variantCount = n;
      // Persist BEFORE notifying so any downstream reader that re-reads storage
      // sees the new value synchronously.
      writeVariantCount(n);
      opts.onVariantCountChange?.(n);
    });
    row1.appendChild(label1);
    row1.appendChild(select);
    body.appendChild(row1);

    const row2 = document.createElement("div");
    row2.setAttribute(W, "setting-row");
    const label2 = document.createElement("span");
    label2.setAttribute(W, "setting-label");
    label2.textContent = "Reduced motion";
    const value2 = document.createElement("span");
    value2.setAttribute(W, "setting-value");
    const reduced =
      typeof matchMedia !== "undefined" &&
      matchMedia("(prefers-reduced-motion: reduce)").matches;
    value2.textContent = reduced ? "respected (OS-level)" : "off";
    row2.appendChild(label2);
    row2.appendChild(value2);
    body.appendChild(row2);

    const row3 = document.createElement("div");
    row3.setAttribute(W, "setting-row");
    const label3 = document.createElement("span");
    label3.setAttribute(W, "setting-label");
    label3.textContent = "Bar position";
    const value3 = document.createElement("span");
    value3.setAttribute(W, "setting-value");
    value3.textContent = "bottom-right (fixed)";
    row3.appendChild(label3);
    row3.appendChild(value3);
    body.appendChild(row3);
  };

  // ---- About ----
  const renderAboutPanel = (body: HTMLElement): void => {
    const versionRow = makeKvp("Version", "0.1.0-prerelease");
    const bridgeRow = makeKvp("Bridge", opts.bridgeUrl ?? "—");
    const pageRow = makeKvp("Host page", shortHost(location.href));
    body.appendChild(versionRow);
    body.appendChild(bridgeRow);
    body.appendChild(pageRow);

    const kbHeader = document.createElement("div");
    kbHeader.setAttribute(W, "token-section-label");
    kbHeader.style.marginTop = "10px";
    kbHeader.textContent = "Keyboard";
    body.appendChild(kbHeader);

    const kbRows: Array<[string, string]> = [
      ["Cancel any state", "Esc"],
      ["Multi-select", "Ctrl/⌘-click"],
      ["Pick variant N", "1–8"],
      ["Cycle variants", "← / →"],
      ["Accept variant", "Enter"],
      ["Discard variants", "Backspace"],
    ];
    for (const [k, v] of kbRows) {
      const row = document.createElement("div");
      row.setAttribute(W, "about-kvp");
      const keySpan = document.createElement("span");
      keySpan.setAttribute(W, "about-key");
      keySpan.textContent = k;
      const valSpan = document.createElement("span");
      valSpan.setAttribute(W, "about-value");
      const kbd = document.createElement("span");
      kbd.setAttribute(W, "kbd");
      kbd.textContent = v;
      valSpan.appendChild(kbd);
      row.appendChild(keySpan);
      row.appendChild(valSpan);
      body.appendChild(row);
    }
  };

  // ---- Helpers ----
  const appendSectionLabel = (parent: HTMLElement, text: string): void => {
    const label = document.createElement("div");
    label.setAttribute(W, "token-section-label");
    label.textContent = text;
    parent.appendChild(label);
  };

  const makeKvp = (key: string, value: string): HTMLElement => {
    const row = document.createElement("div");
    row.setAttribute(W, "about-kvp");
    const k = document.createElement("span");
    k.setAttribute(W, "about-key");
    k.textContent = key;
    const v = document.createElement("span");
    v.setAttribute(W, "about-value");
    v.textContent = value;
    row.appendChild(k);
    row.appendChild(v);
    return row;
  };

  // Build the icon buttons.
  const TOOL_ORDER: ToolId[] = ["tokens", "audit", "recent", "settings", "about"];
  for (const id of TOOL_ORDER) {
    const btnEl = document.createElement("button");
    btnEl.setAttribute(W, "tool-btn");
    btnEl.setAttribute("type", "button");
    btnEl.setAttribute("aria-expanded", "false");
    btnEl.setAttribute("aria-label", TOOL_LABELS[id]);
    btnEl.title = TOOL_LABELS[id];
    btnEl.innerHTML = ICON_SVG[id];
    btnEl.addEventListener("click", () => open(id, btnEl));
    toolRow.appendChild(btnEl);
  }
  container.appendChild(toolRow);

  return {
    close,
    refresh(): void {
      if (currentTool === null || panelRoot === null) return;
      const body = panelRoot.querySelector("div:nth-child(2)") as HTMLElement | null;
      if (body !== null) {
        body.innerHTML = "";
        renderPanelBody(currentTool, body);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// extractDesignTokens — scan computed styles for distinct colors / fonts /
// spacings. Skips wisp's own elements (anything inside `[data-wisp-ui="bar"]`).
// ---------------------------------------------------------------------------

interface DesignTokens {
  colors: string[];
  fonts: string[];
  spacings: string[];
}

function extractDesignTokens(): DesignTokens {
  const colors = new Set<string>();
  const fonts = new Set<string>();
  const spacings = new Set<string>();
  const MAX_ELEMENTS = 600;

  const wispBar = document.querySelector(`[${W}="bar"]`);
  const all = document.body
    ? document.body.querySelectorAll("*")
    : ([] as unknown as NodeListOf<Element>);
  let n = 0;
  for (const el of Array.from(all)) {
    if (n >= MAX_ELEMENTS) break;
    if (wispBar && (el === wispBar || wispBar.contains(el))) continue;
    if (!(el instanceof HTMLElement)) continue;
    const cs = getComputedStyle(el);
    // Colors: text + background
    const col = cs.color;
    if (col && col !== "rgba(0, 0, 0, 0)" && col !== "rgb(0, 0, 0)") {
      colors.add(normalizeColor(col));
    }
    const bg = cs.backgroundColor;
    if (
      bg &&
      bg !== "rgba(0, 0, 0, 0)" &&
      bg !== "transparent"
    ) {
      colors.add(normalizeColor(bg));
    }
    // Fonts (first family token)
    const fam = cs.fontFamily;
    if (fam) fonts.add(fam);
    // Spacings: padding+margin in px
    for (const v of [cs.padding, cs.margin]) {
      if (!v) continue;
      for (const tok of v.split(/\s+/)) {
        if (/^[\d.]+px$/.test(tok) && tok !== "0px") {
          spacings.add(tok);
        }
      }
    }
    n += 1;
  }
  // Sort spacings numerically.
  const spacingList = [...spacings].sort((a, b) => {
    return parseFloat(a) - parseFloat(b);
  });
  return {
    colors: [...colors].sort(),
    fonts: [...fonts].sort(),
    spacings: spacingList,
  };
}

function normalizeColor(c: string): string {
  // Trim whitespace; keep `rgb(...)` / `rgba(...)` as-is so swatches render.
  return c.replace(/\s+/g, " ").trim();
}

function shortFontFamily(f: string): string {
  // "ui-sans-serif, system-ui, -apple-system, ..." → "ui-sans-serif"
  const first = f.split(",")[0]?.trim().replace(/^["']|["']$/g, "") ?? f;
  return first.length > 18 ? `${first.slice(0, 18)}…` : first;
}

function shortTime(iso: string): string {
  // Parse and format as HH:MM:SS. If the timestamp can't be parsed, return
  // the raw input (truncated). All sessions log in ISO-8601 UTC.
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso.slice(0, 8);
  const pad = (n: number): string => (n < 10 ? `0${n}` : String(n));
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function shortTarget(t: string): string {
  if (t.length <= 32) return t;
  // Keep the tag + first 2 classes + ellipsis.
  const m = /^([a-z0-9]+(?:\.[A-Za-z0-9_-]+){0,2})/.exec(t);
  return m ? `${m[1]}…` : `${t.slice(0, 30)}…`;
}

function shortFilePath(p: string): string {
  // Show last 2 path segments — enough to identify the file uniquely.
  const norm = p.replace(/\\/g, "/");
  const parts = norm.split("/").filter((s) => s.length > 0);
  return parts.slice(-2).join("/");
}

function shortHost(url: string): string {
  try {
    const u = new URL(url);
    return u.host;
  } catch {
    return url.slice(0, 40);
  }
}

// ---------------------------------------------------------------------------
// scanAntiSlop — DOM-level lite scan. Mirrors anti-slop-linter.ts rules but
// reads the live page so it works regardless of bundling. Fast: stops at
// ~MAX_ELEMENTS for large pages.
// ---------------------------------------------------------------------------

interface AntiSlopFinding {
  rule: string;
  severity: "fail" | "warn";
  message: string;
}

function scanAntiSlop(): {
  items: AntiSlopFinding[];
  fail: number;
  warn: number;
} {
  const items: AntiSlopFinding[] = [];
  const wispBar = document.querySelector(`[${W}="bar"]`);
  const all = document.body
    ? document.body.querySelectorAll("*")
    : ([] as unknown as NodeListOf<Element>);
  const MAX_ELEMENTS = 600;
  let count = 0;
  const seenRules = new Set<string>();
  const push = (rule: string, severity: "fail" | "warn", message: string): void => {
    if (seenRules.has(rule)) return;
    seenRules.add(rule);
    items.push({ rule, severity, message });
  };

  for (const el of Array.from(all)) {
    if (count >= MAX_ELEMENTS) break;
    if (wispBar && (el === wispBar || wispBar.contains(el))) continue;
    if (!(el instanceof HTMLElement)) continue;
    const cs = getComputedStyle(el);
    const cls = el.className && typeof el.className === "string" ? el.className : "";

    // Hard-ban: gradient-text-headline
    if (
      (el.tagName === "H1" || el.tagName === "H2" || el.tagName === "H3" || el.tagName === "BUTTON" || el.tagName === "A") &&
      cs.backgroundImage.includes("gradient") &&
      cs.backgroundClip === "text"
    ) {
      push(
        "gradient-text-headline",
        "fail",
        "Gradient text on headline — kills scanability and contrast.",
      );
    }
    // Hard-ban: glassmorphism (backdrop-blur)
    if (cs.backdropFilter && cs.backdropFilter !== "none") {
      push(
        "default-glassmorphism",
        "fail",
        "Glassmorphism without explicit rationale.",
      );
    }
    // Hard-ban: purple-blue-gradient
    if (
      /from-purple|to-blue|from-blue|to-purple/.test(cls) &&
      /gradient/.test(cls)
    ) {
      push(
        "purple-blue-gradient",
        "fail",
        "Purple-blue gradient — overused AI brand cliché.",
      );
    }
    // Hard-ban: hero-metric-template
    if (
      /^(\d{1,3}(\.\d+)?[kxKX%+]+|\d+[xX])$/.test(el.textContent?.trim() ?? "") &&
      parseFloat(cs.fontSize) >= 24
    ) {
      push(
        "hero-metric-template",
        "fail",
        "Big-metric hero (98%/3.2x/24/7) — overused AI hero template.",
      );
    }
    // Soft-warn: side-stripe (1-3px left/right border)
    const bl = parseFloat(cs.borderLeftWidth);
    if (bl >= 1 && bl <= 3 && cs.borderLeftStyle === "solid" && cs.borderRightWidth === "0px") {
      push(
        "side-stripe",
        "warn",
        "Side-stripe (1-3px solid left border) — common AI affectation.",
      );
    }
    count += 1;
  }

  const fail = items.filter((i) => i.severity === "fail").length;
  const warn = items.filter((i) => i.severity === "warn").length;
  return { items, fail, warn };
}

function clampVariantCount(n: number): 1 | 3 | 5 | 8 {
  if (n <= 1) return 1;
  if (n <= 3) return 3;
  if (n <= 5) return 5;
  return 8;
}

// ---------------------------------------------------------------------------
// Module export
// ---------------------------------------------------------------------------

export const toolPanelsModule = { mountToolPanels };
