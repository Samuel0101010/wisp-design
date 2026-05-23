// wisp-design — Morph-mode (Phase 6, Improvement #3).
//
// Implements `MorphModeModule` + the CLI runner.
//
// Mechanism:
//   1. `buildSource(A, B)` walks both variants' `cssVars` records. For every
//      var name present in EITHER variant it emits a `MorphVariableDiff`
//      with `valueA`/`valueB` (missing side defaults to the present side
//      — a no-op for that var when t slides through). `interpolatable` is
//      true iff both values parse via `parseCssValue` AND share the same
//      unit AND the unit is in `MORPH_INTERPOLATABLE_UNITS`.
//   2. `interpolate(source, t)` clamps t to [0,1], then for each diff:
//      - interpolatable → `value = a + (b-a) * t`, re-emit `${value}${unit}`
//      - else            → snap at t<0.5 → valueA, else valueB
//      Builds a `:scope { --varA: …; --varB: …; }` block as `interpolatedCss`.
//      Pure — no DOM, no fetch, no I/O.
//   3. CLI runner reads variant A + B from `--variant-*-id` + `--variant-*-vars
//      <json>`, builds the morph source, interpolates at the supplied `--t`,
//      and prints either the CSS (text mode) or full MorphConfig (json mode).
//
// Defensive posture:
//   - Empty diff → empty interpolatedCss (no `:scope {}`); valid output.
//   - Malformed numeric value → falls back to snap behaviour.
//   - CLI parse errors exit with `EXIT_ARG` and a structured stderr message.

import {
  type MorphConfig,
  type MorphSource,
  type MorphVariableDiff,
  MORPH_INTERPOLATABLE_UNITS,
  MORPH_T_MAX,
  MORPH_T_MIN,
} from "../contracts/session.js";

import {
  EXIT_ARG,
  EXIT_IO,
  EXIT_OK,
  flagAsNumber,
  flagAsString,
  parseFlags,
  writeError,
  writeJsonResult,
} from "./_helpers.js";

// ---------------------------------------------------------------------------
// parseCssValue — split `<number><unit>` (or bare number) into a numeric +
// unit pair. Returns null when the input doesn't fit the simple value shape.
// ---------------------------------------------------------------------------

const CSS_VALUE_RE = /^(-?\d+(?:\.\d+)?)([a-z%]*)$/i;

export interface ParsedCssValue {
  numeric: number;
  unit: string; // "" for bare numbers
}

export function parseCssValue(s: string): ParsedCssValue | null {
  const trimmed = (s ?? "").trim();
  if (trimmed.length === 0) return null;
  const m = CSS_VALUE_RE.exec(trimmed);
  if (m === null) return null;
  const numeric = Number(m[1]);
  if (!Number.isFinite(numeric)) return null;
  return { numeric, unit: (m[2] ?? "").toLowerCase() };
}

const INTERPOLATABLE_UNIT_SET: ReadonlySet<string> = new Set(MORPH_INTERPOLATABLE_UNITS);

function unitIsInterpolatable(unit: string): boolean {
  // Bare numbers (no unit) ARE interpolatable per the contract docstring.
  if (unit === "") return true;
  return INTERPOLATABLE_UNIT_SET.has(unit);
}

// ---------------------------------------------------------------------------
// buildSource — extract per-var diffs.
// ---------------------------------------------------------------------------

export function buildSource(
  variantA: { id: string; cssVars: Record<string, string> },
  variantB: { id: string; cssVars: Record<string, string> },
): MorphSource {
  const allNames = new Set<string>([
    ...Object.keys(variantA.cssVars ?? {}),
    ...Object.keys(variantB.cssVars ?? {}),
  ]);
  // Sort the names so the output is deterministic — callers test via
  // byte-equivalence. Spec says implementations MUST be deterministic.
  const sortedNames = Array.from(allNames).sort();

  const variableDiff: MorphVariableDiff[] = [];
  for (const name of sortedNames) {
    const rawA = variantA.cssVars?.[name];
    const rawB = variantB.cssVars?.[name];
    const valueA = rawA ?? rawB ?? "";
    const valueB = rawB ?? rawA ?? "";
    const parsedA = parseCssValue(valueA);
    const parsedB = parseCssValue(valueB);
    let interpolatable = false;
    let unit: string | undefined;
    if (
      parsedA !== null &&
      parsedB !== null &&
      parsedA.unit === parsedB.unit &&
      unitIsInterpolatable(parsedA.unit)
    ) {
      interpolatable = true;
      unit = parsedA.unit;
    }
    const diff: MorphVariableDiff = { name, valueA, valueB, interpolatable };
    if (unit !== undefined) diff.unit = unit;
    variableDiff.push(diff);
  }

  return {
    variantIdA: variantA.id,
    variantIdB: variantB.id,
    variableDiff,
  };
}

// ---------------------------------------------------------------------------
// interpolate — apply t to every diff.
// ---------------------------------------------------------------------------

function clampT(t: number): number {
  if (!Number.isFinite(t)) return MORPH_T_MIN;
  if (t < MORPH_T_MIN) return MORPH_T_MIN;
  if (t > MORPH_T_MAX) return MORPH_T_MAX;
  return t;
}

function formatNumeric(n: number): string {
  // Avoid spurious trailing zeros / scientific notation in CSS output.
  if (Number.isInteger(n)) return String(n);
  // Round to 4 decimal places; sufficient for px/rem/% precision.
  return (Math.round(n * 10000) / 10000).toString();
}

export function interpolate(source: MorphSource, t: number): MorphConfig {
  const clampedT = clampT(t);
  const lines: string[] = [];
  for (const diff of source.variableDiff) {
    let value: string;
    if (diff.interpolatable) {
      const parsedA = parseCssValue(diff.valueA);
      const parsedB = parseCssValue(diff.valueB);
      if (parsedA === null || parsedB === null) {
        // Shouldn't happen — interpolatable=true implies both parsed. Defend
        // anyway: fall back to snap-at-0.5.
        value = clampedT < 0.5 ? diff.valueA : diff.valueB;
      } else {
        const numeric = parsedA.numeric + (parsedB.numeric - parsedA.numeric) * clampedT;
        const unit = diff.unit ?? parsedA.unit;
        value = `${formatNumeric(numeric)}${unit}`;
      }
    } else {
      value = clampedT < 0.5 ? diff.valueA : diff.valueB;
    }
    lines.push(`  ${diff.name}: ${value};`);
  }

  const interpolatedCss =
    lines.length === 0 ? "" : `:scope {\n${lines.join("\n")}\n}`;

  return {
    source,
    t: clampedT,
    interpolatedCss,
  };
}

// ---------------------------------------------------------------------------
// CLI runner — `wisp-design morph` shape.
//
// Flags:
//   --variant-a-id   <id>      (required)
//   --variant-a-vars <json>    (required) — JSON object of cssVars
//   --variant-b-id   <id>      (required)
//   --variant-b-vars <json>    (required)
//   --t              <0..1>    (required)
//   --format         text|json (default: text)
// ---------------------------------------------------------------------------

function parseVarsJson(raw: string | undefined, side: "a" | "b"): Record<string, string> | null {
  if (raw === undefined) {
    writeError({
      code: "MISSING_FLAG",
      message: `--variant-${side}-vars is required`,
    });
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    writeError({
      code: "BAD_JSON",
      message: `--variant-${side}-vars is not valid JSON: ${(err as Error).message}`,
    });
    return null;
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    writeError({
      code: "BAD_JSON",
      message: `--variant-${side}-vars must be a JSON object`,
    });
    return null;
  }
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof v !== "string") {
      writeError({
        code: "BAD_JSON",
        message: `--variant-${side}-vars value for "${k}" must be a string (got ${typeof v})`,
      });
      return null;
    }
    out[k] = v;
  }
  return out;
}

export async function runMorph(args: string[]): Promise<number> {
  const parsed = parseFlags(args);
  const idA = flagAsString(parsed, "variant-a-id");
  const idB = flagAsString(parsed, "variant-b-id");
  const tFlag = flagAsNumber(parsed, "t");
  const format = (flagAsString(parsed, "format") ?? "text").toLowerCase();

  if (idA === undefined || idB === undefined) {
    writeError({
      code: "MISSING_FLAG",
      message: "--variant-a-id and --variant-b-id are required",
    });
    return EXIT_ARG;
  }
  if (tFlag === undefined) {
    writeError({
      code: "MISSING_FLAG",
      message: "--t is required (numeric, 0..1)",
    });
    return EXIT_ARG;
  }

  const varsA = parseVarsJson(flagAsString(parsed, "variant-a-vars"), "a");
  if (varsA === null) return EXIT_ARG;
  const varsB = parseVarsJson(flagAsString(parsed, "variant-b-vars"), "b");
  if (varsB === null) return EXIT_ARG;

  let source: MorphSource;
  let config: MorphConfig;
  try {
    source = buildSource(
      { id: idA, cssVars: varsA },
      { id: idB, cssVars: varsB },
    );
    config = interpolate(source, tFlag);
  } catch (err) {
    writeError({
      code: "MORPH_FAILED",
      message: `morph computation failed: ${(err as Error).message ?? "unknown"}`,
    });
    return EXIT_IO;
  }

  if (format === "json") {
    writeJsonResult(config);
  } else {
    process.stdout.write(`${config.interpolatedCss}\n`);
  }
  return EXIT_OK;
}

// ---------------------------------------------------------------------------
// Module export — matches `MorphModeModule` in the contract.
// ---------------------------------------------------------------------------

export const morphModeModule = {
  buildSource,
  interpolate,
};
