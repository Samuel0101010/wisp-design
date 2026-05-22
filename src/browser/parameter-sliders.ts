// wisp-design — Parameter sliders (Phase 2).
//
// Zero-roundtrip CSS-var tuning. Variants embed inline directives like:
//   /* @param: kind=range min=0 max=24 step=2 label="padding" */ --wisp-pad: 12px;
// `extractParameterBindings` parses them; `mountParameterSliders` renders
// the appropriate controls and writes new values directly onto the active
// @scope root via `scopeRoot.style.setProperty`. State machine receives a
// `cycle-param-change` event so session-replay can reproduce it.
//
// Validation funnels through `SanitizeModule.trustedCssVar`. Malformed
// inputs are dropped silently with a `console.warn`.

import { WISP_UI_DATA_ATTRIBUTE } from "./constants.js";
import type {
  ExtractParameterBindings,
  ParameterBinding,
  ParameterKind,
  SanitizeModule,
} from "../contracts/browser.js";

// ---------------------------------------------------------------------------
// Inline-directive parser.
//
// Grammar (single line, single property):
//   "/* @param: " key=value (" " key=value)* " */" --varname: value;
// Keys: kind, min, max, step, label, options, toggleOnValue, toggleOffValue
// String values may be quoted ("…") to include spaces or commas.
// Numbers parsed via parseFloat.
// ---------------------------------------------------------------------------

const DIRECTIVE_RE =
  /\/\*\s*@param:\s*([^*]+?)\s*\*\/\s*(--[A-Za-z][\w-]*)\s*:/g;
const VAR_NAME_RE = /^--[a-z][a-z0-9-]*$/i;

interface ParsedDirective {
  kind?: string;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
  options?: string[];
  toggleOnValue?: string;
  toggleOffValue?: string;
}

function parseKvBlock(block: string): ParsedDirective {
  const out: ParsedDirective = {};
  // key=value tokens; value either quoted or non-whitespace.
  const tokenRe = /(\w+)\s*=\s*(?:"([^"]*)"|(\S+))/g;
  let match: RegExpExecArray | null;
  while ((match = tokenRe.exec(block)) !== null) {
    const [, key, quoted, bare] = match;
    if (!key) continue;
    const raw = quoted !== undefined ? quoted : (bare ?? "");
    switch (key) {
      case "kind":
        out.kind = raw;
        break;
      case "min":
      case "max":
      case "step": {
        const n = parseFloat(raw);
        if (Number.isFinite(n)) out[key] = n;
        break;
      }
      case "label":
        out.label = raw;
        break;
      case "options": {
        // Comma-separated list. Allow quoted entries.
        const items = raw
          .split(",")
          .map((s) => s.trim().replace(/^"|"$/g, ""))
          .filter((s) => s.length > 0);
        if (items.length > 0) out.options = items;
        break;
      }
      case "toggleOnValue":
        out.toggleOnValue = raw;
        break;
      case "toggleOffValue":
        out.toggleOffValue = raw;
        break;
      default:
        // unknown key — ignore
        break;
    }
  }
  return out;
}

function isValidKind(s: string | undefined): s is ParameterKind {
  return s === "range" || s === "steps" || s === "toggle" || s === "color";
}

export const extractParameterBindings: ExtractParameterBindings = (cssText) => {
  const bindings: ParameterBinding[] = [];
  // Reset regex state for new input.
  DIRECTIVE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = DIRECTIVE_RE.exec(cssText)) !== null) {
    const [, block, varName] = m;
    if (!block || !varName) continue;
    if (!VAR_NAME_RE.test(varName)) continue;

    const parsed = parseKvBlock(block);
    if (!isValidKind(parsed.kind)) continue;
    const label = parsed.label && parsed.label.length > 0
      ? parsed.label.slice(0, 60)
      : varName.replace(/^--/, "");

    const base: ParameterBinding = {
      varName,
      kind: parsed.kind,
      label,
    };

    if (parsed.kind === "range") {
      if (parsed.min === undefined || parsed.max === undefined) continue;
      base.min = parsed.min;
      base.max = parsed.max;
      if (parsed.step !== undefined && parsed.step > 0) base.step = parsed.step;
    } else if (parsed.kind === "steps") {
      if (!parsed.options || parsed.options.length < 2) continue;
      base.options = parsed.options;
    } else if (parsed.kind === "toggle") {
      if (
        parsed.toggleOnValue === undefined ||
        parsed.toggleOffValue === undefined
      ) {
        continue;
      }
      base.toggleOnValue = parsed.toggleOnValue;
      base.toggleOffValue = parsed.toggleOffValue;
    }
    // color: no extra fields required.

    bindings.push(base);
  }
  return bindings;
};

// ---------------------------------------------------------------------------
// mountParameterSliders — DOM builder. Returns a teardown.
// ---------------------------------------------------------------------------

export interface MountParameterSlidersOptions {
  container: HTMLElement;
  bindings: ParameterBinding[];
  initialValues: Record<string, string>;
  sanitize: SanitizeModule;
  scopeRoot: HTMLElement | null;
  onChange: (varName: string, value: string) => void;
}

function child(
  parent: Element,
  tag: keyof HTMLElementTagNameMap,
  attrs?: Record<string, string>,
): HTMLElement {
  const node = document.createElement(tag);
  node.setAttribute(WISP_UI_DATA_ATTRIBUTE, "param");
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (k === WISP_UI_DATA_ATTRIBUTE) continue;
      node.setAttribute(k, v);
    }
  }
  parent.appendChild(node);
  return node;
}

function applyToScope(
  scopeRoot: HTMLElement | null,
  sanitize: SanitizeModule,
  varName: string,
  value: string,
): string | null {
  const check = sanitize.trustedCssVar(varName, value);
  if (!check.ok) {
    if (typeof console !== "undefined") {
      console.warn("[wisp-design] rejected CSS var write", check.reason);
    }
    return null;
  }
  if (scopeRoot !== null) {
    scopeRoot.style.setProperty(check.varName, check.value);
  }
  return check.value;
}

export function mountParameterSliders(
  opts: MountParameterSlidersOptions,
): () => void {
  const { container, bindings, initialValues, sanitize, scopeRoot } = opts;
  // Clear any prior content; we own this slot.
  while (container.firstChild) container.removeChild(container.firstChild);

  const listeners: Array<() => void> = [];

  for (const b of bindings) {
    const row = child(container, "div", { [WISP_UI_DATA_ATTRIBUTE]: "param-row" });
    const label = child(row, "label", { [WISP_UI_DATA_ATTRIBUTE]: "meta" });
    label.textContent = b.label;

    const initial = initialValues[b.varName] ?? "";
    let valueLabel: HTMLElement | null = null;

    if (b.kind === "range" && b.min !== undefined && b.max !== undefined) {
      const input = child(row, "input") as HTMLInputElement;
      input.type = "range";
      input.min = String(b.min);
      input.max = String(b.max);
      if (b.step !== undefined) input.step = String(b.step);
      // Initial: strip non-numeric suffix (px, rem) for the slider position;
      // we re-attach the suffix on write.
      const unit = unitOf(initial);
      const initNum = numberOf(initial);
      if (initNum !== null) input.value = String(initNum);
      valueLabel = child(row, "span", { [WISP_UI_DATA_ATTRIBUTE]: "meta" });
      valueLabel.textContent = initial;

      const handler = (): void => {
        const next = `${input.value}${unit}`;
        const applied = applyToScope(scopeRoot, sanitize, b.varName, next);
        if (applied !== null) {
          if (valueLabel) valueLabel.textContent = applied;
          opts.onChange(b.varName, applied);
        }
      };
      input.addEventListener("input", handler);
      listeners.push(() => input.removeEventListener("input", handler));
    } else if (b.kind === "color") {
      const input = child(row, "input") as HTMLInputElement;
      input.type = "color";
      if (/^#[0-9a-f]{6}$/i.test(initial)) input.value = initial;
      const handler = (): void => {
        const applied = applyToScope(scopeRoot, sanitize, b.varName, input.value);
        if (applied !== null) opts.onChange(b.varName, applied);
      };
      input.addEventListener("input", handler);
      listeners.push(() => input.removeEventListener("input", handler));
    } else if (b.kind === "toggle" && b.toggleOnValue !== undefined && b.toggleOffValue !== undefined) {
      const input = child(row, "input") as HTMLInputElement;
      input.type = "checkbox";
      input.checked = initial === b.toggleOnValue;
      const handler = (): void => {
        const next = input.checked
          ? (b.toggleOnValue as string)
          : (b.toggleOffValue as string);
        const applied = applyToScope(scopeRoot, sanitize, b.varName, next);
        if (applied !== null) opts.onChange(b.varName, applied);
      };
      input.addEventListener("change", handler);
      listeners.push(() => input.removeEventListener("change", handler));
    } else if (b.kind === "steps" && b.options !== undefined) {
      const sel = child(row, "select") as HTMLSelectElement;
      for (const o of b.options) {
        const opt = document.createElement("option");
        opt.value = o;
        opt.textContent = o;
        if (o === initial) opt.selected = true;
        sel.appendChild(opt);
      }
      const handler = (): void => {
        const applied = applyToScope(scopeRoot, sanitize, b.varName, sel.value);
        if (applied !== null) opts.onChange(b.varName, applied);
      };
      sel.addEventListener("change", handler);
      listeners.push(() => sel.removeEventListener("change", handler));
    }
  }

  return (): void => {
    for (const off of listeners) off();
    while (container.firstChild) container.removeChild(container.firstChild);
  };
}

// ---------------------------------------------------------------------------
// number / unit helpers — separate the CSS value's numeric component from its
// unit so a slider can move just the number.
// ---------------------------------------------------------------------------

function numberOf(value: string): number | null {
  const m = /^(-?\d+(?:\.\d+)?)/.exec(value.trim());
  if (!m || !m[1]) return null;
  const n = parseFloat(m[1]);
  return Number.isFinite(n) ? n : null;
}

function unitOf(value: string): string {
  const m = /^-?\d+(?:\.\d+)?(.*)$/.exec(value.trim());
  return m && m[1] ? m[1] : "";
}
