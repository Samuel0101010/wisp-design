// wisp-design — `init` command contracts (Phase 7).
//
// Pure-TS shapes shared between `src/agent/init.ts` (CLI runner), the
// brand-spec writer, and the doctor check that asserts `.wisp/brand-spec.json`
// shape after init.
//
// Contract surface:
//   1. InitCliFlagsSchema  — argv → typed flags.
//   2. BrandSpecSchema     — 9-section open-design-style brand spec the
//      runner writes to `.wisp/brand-spec.json`.
//   3. BRAND_SPEC_DEFAULTS — sensible defaults used by --non-interactive.
//
// The 4 Narrative Questions (role / distance / temperature / capacity) are
// NOT modelled here — they're prose prompts the runner emits to stdout and
// feeds into the BrandSpec.voice + audience fields. Their canonical text
// lives in `skills/methodology/narrative-questions.md`.

import { z } from "zod";

// ---------------------------------------------------------------------------
// CLI flags
// ---------------------------------------------------------------------------

export const InitStyleSchema = z.enum(["minimalist", "expressive", "dense"]);
export type InitStyle = z.infer<typeof InitStyleSchema>;

// OKLch literal — loosely validated. Accepts forms like:
//   oklch(0.62 0.21 256)
//   oklch(62% 0.21 256 / 1)
// Tight CSS-parse lives in carbonize.ts; we keep this lenient so the wizard
// can accept user input that's "close enough" without round-trip parsing.
const OkLchPattern = /^oklch\(\s*[0-9.%]+\s+[0-9.]+\s+[0-9.]+(\s*\/\s*[0-9.%]+)?\s*\)$/i;

export const InitCliFlagsSchema = z.object({
  nonInteractive: z.boolean().default(false),
  brandName: z.string().min(1).optional(),
  primaryColor: z
    .string()
    .regex(OkLchPattern, "primary-color must be an oklch() literal")
    .optional(),
  style: InitStyleSchema.default("minimalist"),
});
export type InitCliFlags = z.infer<typeof InitCliFlagsSchema>;

// ---------------------------------------------------------------------------
// BrandSpec — 9-section schema. Mirrors open-design's brand-spec shape but
// kept compact (~70 lines) so the wizard can prompt for each field in a
// single TTY round. Full reference: research/repos/open-design.md.
// ---------------------------------------------------------------------------

export const BrandVoiceSchema = z.object({
  tone: z.string().min(1), // e.g. "warm-precise", "playful-honest"
  person: z.enum(["first", "second", "third"]),
  register: z.enum(["formal", "casual", "technical"]),
});
export type BrandVoice = z.infer<typeof BrandVoiceSchema>;

export const BrandSurfaceSchema = z.enum([
  "marketing-site",
  "app",
  "docs",
  "dashboard",
  "mobile",
  "email",
]);
export type BrandSurface = z.infer<typeof BrandSurfaceSchema>;

export const BrandColorsSchema = z.object({
  primary: z.string().regex(OkLchPattern),
  neutral: z.string().regex(OkLchPattern),
  accent: z.string().regex(OkLchPattern).optional(),
});
export type BrandColors = z.infer<typeof BrandColorsSchema>;

export const BrandTypographySchema = z.object({
  // Two-font system per open-design preset: display + body. shorthand strings
  // (e.g. "Inter", "system-ui") rather than full CSS stacks — carbonize
  // resolves to full stacks at write time.
  display: z.string().min(1),
  body: z.string().min(1),
});
export type BrandTypography = z.infer<typeof BrandTypographySchema>;

export const BrandDensitySchema = z.enum(["compact", "comfortable", "generous"]);
export type BrandDensity = z.infer<typeof BrandDensitySchema>;

export const BrandMotionSchema = z.enum(["restrained", "expressive", "none"]);
export type BrandMotion = z.infer<typeof BrandMotionSchema>;

export const BrandAccessibilitySchema = z.object({
  // Target WCAG conformance level. `AA` is the wisp-design default.
  wcag: z.enum(["AA", "AAA"]).default("AA"),
  reducedMotionDefault: z.boolean().default(true),
});
export type BrandAccessibility = z.infer<typeof BrandAccessibilitySchema>;

export const BrandSpecSchema = z.object({
  name: z.string().min(1),
  voice: BrandVoiceSchema,
  // Free-form 1-3 sentence audience description, captured from
  // Narrative-Question #1 ("who is this for?").
  audience: z.string().min(1),
  surfaces: z.array(BrandSurfaceSchema).min(1),
  brand: BrandColorsSchema,
  typography: BrandTypographySchema,
  density: BrandDensitySchema,
  motion: BrandMotionSchema,
  accessibility: BrandAccessibilitySchema,
});
export type BrandSpec = z.infer<typeof BrandSpecSchema>;

// ---------------------------------------------------------------------------
// Defaults for --non-interactive. Use the "minimalist" preset that pairs
// safely with most existing dev-server stacks. Carbonize-friendly: the
// values here round-trip through the verify-gate's anti-slop linter without
// triggering hard-bans.
// ---------------------------------------------------------------------------

export const BRAND_SPEC_DEFAULTS = {
  minimalist: {
    voice: {
      tone: "calm-direct",
      person: "second" as const,
      register: "casual" as const,
    },
    style: {
      primary: "oklch(0.62 0.21 256)", // a neutral indigo
      neutral: "oklch(0.96 0.005 256)",
      typography: { display: "Inter", body: "Inter" },
      density: "comfortable" as const,
      motion: "restrained" as const,
    },
  },
  expressive: {
    voice: {
      tone: "warm-curious",
      person: "second" as const,
      register: "casual" as const,
    },
    style: {
      primary: "oklch(0.66 0.24 35)",
      neutral: "oklch(0.94 0.01 35)",
      typography: { display: "Fraunces", body: "Inter" },
      density: "generous" as const,
      motion: "expressive" as const,
    },
  },
  dense: {
    voice: {
      tone: "precise-technical",
      person: "third" as const,
      register: "technical" as const,
    },
    style: {
      primary: "oklch(0.58 0.16 200)",
      neutral: "oklch(0.92 0.005 200)",
      typography: { display: "IBM Plex Sans", body: "IBM Plex Sans" },
      density: "compact" as const,
      motion: "restrained" as const,
    },
  },
} as const;

// ---------------------------------------------------------------------------
// Runner module interface — what `src/agent/init.ts` exposes.
// ---------------------------------------------------------------------------

export interface InitModule {
  runInit(args: string[]): Promise<number>;
}
