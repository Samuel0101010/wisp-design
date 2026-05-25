// wisp-design — Variant catalog (Phase 7.7)
//
// Deterministic, NON-LLM variant generation that actually reflects what the
// user wrote. Replaces the previous stub which ignored freeText entirely.
//
// Pipeline:
//   freeText + targetTag → classifyIntent() → catalog lookup → variants[]
//
// Each (intent, tag-class) cell of the catalog yields 3-8 visually distinct
// variants tailored to the picked element type. A user picking the pricing
// CARD (article) and writing "spacious" gets PADDING / GAP / BORDER variants
// — not typography variants. A user picking an h3 and writing "bolder" gets
// font-weight variants. Pick a button + "rounder" → border-radius variants.
//
// All CSS uses `!important` on the live-preview side so it beats Tailwind /
// shadcn class-level specificity. The carbonized accept-output drops the
// `!important` naturally because the source-splice uses the actual class
// chain as the selector (higher specificity than utility classes alone).

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface Variant {
  css: string;
  rationale: string;
}

export interface VariantContext {
  freeText: string;
  targetTag: string;
  maxVariants: number;
}

export function generateVariantsFromIntent(ctx: VariantContext): Variant[] {
  const intent = classifyIntent(ctx.freeText);
  const tagClass = classifyTag(ctx.targetTag);
  const catalog = CATALOG[intent][tagClass] ?? CATALOG[intent].default ?? CATALOG.default.default;
  const count = clamp(ctx.maxVariants, 1, catalog.length);
  return catalog.slice(0, count);
}

// ---------------------------------------------------------------------------
// Intent classification
// ---------------------------------------------------------------------------

export type Intent =
  | "default"
  | "weight-heavier"
  | "weight-lighter"
  | "size-bigger"
  | "size-smaller"
  | "rounded"
  | "squared"
  | "spacious"
  | "compact"
  | "contrast"
  | "accent"
  | "muted"
  | "ghost"
  | "elevated"
  | "flat"
  | "modern"
  | "premium";

// Order matters: first regex hit wins. Most specific first.
const INTENT_RULES: ReadonlyArray<[RegExp, Intent]> = [
  // Vibes (high-level — checked first so "modern button" → modern, not button)
  [/\b(premium|luxury|elegant|refined|sophisticated|upscale|expensive)\b/i, "premium"],
  [/\b(modern|sleek|cutting[\s-]?edge|fresh|contemporary|new)\b/i, "modern"],
  // Visual chrome
  [/\b(ghost|outlined?|transparent|see[\s-]?through|hollow|borderless)\b/i, "ghost"],
  [/\b(elev|elevation|shadowy?|lift|lifted|float|floating|raise|raised|hover|deep|drop[\s-]?shadow)\b/i, "elevated"],
  [/\b(flat|minimal|minimalist|clean|simple|plain|stripped)\b/i, "flat"],
  // Shape
  [/\b(round|rounded|circle|circular|pill[\s-]?shaped|pill|soft[\s-]?corners?|curved|softer)\b/i, "rounded"],
  [/\b(square|squarer|squared|sharp|sharper|crisp|harsh|edgy|edged|angular)\b/i, "squared"],
  // Color
  [/\b(contrast|high[\s-]?contrast|stark|legible|punchy|punch|stronger[\s-]?color|darker[\s-]?text|maximum)\b/i, "contrast"],
  [/\b(accent|brand|colorful|colour[a-z]*|primary[\s-]?color)\b/i, "accent"],
  [/\b(mute|muted|quiet|subtle|gentle|faded|gray|grey|desaturated|softer[\s-]?color)\b/i, "muted"],
  // Spacing
  [/\b(spac|spacious|breath|breathing|airy|loose|generous|roomy|open|wider|broader|padded)\b/i, "spacious"],
  [/\b(compact|tight|tighter|dense|crammed|cramped|condensed|squeeze|squeezed|narrow|narrower)\b/i, "compact"],
  // Weight  (typography emphasis)
  [/\b(bold|bolder|heavy|heavier|thicker|stronger|strong|emphasi[sz]ed?)\b/i, "weight-heavier"],
  [/\b(light|lighter|thin|thinner|delicate|softer[\s-]?text|softer)\b/i, "weight-lighter"],
  // Size  (broad — applies to text font-size OR container padding depending on tag)
  [/\b(big|bigger|large|larger|huge|enormous|grand|increase|increased)\b/i, "size-bigger"],
  [/\b(small|smaller|tiny|tinier|petite|mini|reduce|reduced|shrink|shrunk)\b/i, "size-smaller"],
];

export function classifyIntent(freeText: string): Intent {
  const text = (freeText || "").trim();
  if (text.length === 0) return "default";
  for (const [re, intent] of INTENT_RULES) {
    if (re.test(text)) return intent;
  }
  return "default";
}

// ---------------------------------------------------------------------------
// Tag classification
// ---------------------------------------------------------------------------

export type TagClass = "text" | "button" | "input" | "image" | "container" | "default";

const TEXT_TAGS = new Set([
  "h1", "h2", "h3", "h4", "h5", "h6",
  "p", "span", "a", "label", "em", "strong", "small", "sub", "sup",
  "blockquote", "code", "pre", "li",
]);
const CONTAINER_TAGS = new Set([
  "div", "section", "article", "aside", "header", "footer", "nav", "main",
  "form", "ul", "ol", "figure", "fieldset",
]);

export function classifyTag(tag: string): TagClass {
  const t = (tag || "").toLowerCase();
  if (t === "") return "default";
  if (t === "button") return "button";
  if (t === "input" || t === "textarea" || t === "select") return "input";
  if (t === "img" || t === "picture" || t === "video" || t === "svg") return "image";
  if (TEXT_TAGS.has(t)) return "text";
  if (CONTAINER_TAGS.has(t)) return "container";
  return "default";
}

// ---------------------------------------------------------------------------
// Catalog — Intent × TagClass → ordered variant array
// First variant is ALWAYS the identity baseline so users can compare against
// the original. Subsequent variants are visually distinct gradations.
// ---------------------------------------------------------------------------

const BASELINE: Variant = {
  css: "/* identity — baseline */",
  rationale: "Baseline: no changes applied — compare other variants against this.",
};

// Container-focused variants (article, div, section, etc) — affect chrome.
const CONTAINER_VARIANTS: Record<Intent, Variant[]> = {
  default: [
    BASELINE,
    {
      css: `:scope { padding: 2em !important; }`,
      rationale: "More padding: generous internal whitespace improves readability and feels less cramped.",
    },
    {
      css: `:scope { border-radius: 16px !important; box-shadow: 0 6px 20px -4px rgba(0,0,0,0.10) !important; }`,
      rationale: "Soft + elevated: rounder corners + a subtle drop shadow signals importance without shouting.",
    },
  ],
  spacious: [
    BASELINE,
    {
      css: `:scope { padding: 2em !important; gap: 1em !important; }`,
      rationale: "Generous padding: doubles internal spacing — feels premium and unhurried.",
    },
    {
      css: `:scope { padding: 3em !important; gap: 1.5em !important; }`,
      rationale: "Maximum breathing room: even more space for content to settle.",
    },
  ],
  compact: [
    BASELINE,
    {
      css: `:scope { padding: 0.75em !important; gap: 0.25em !important; }`,
      rationale: "Compact: tighter internal spacing — suits dense info or small cards.",
    },
    {
      css: `:scope { padding: 0.5em !important; gap: 0 !important; }`,
      rationale: "Ultra-tight: minimal padding, edge-to-edge content.",
    },
  ],
  rounded: [
    BASELINE,
    {
      css: `:scope { border-radius: 16px !important; }`,
      rationale: "Soft corners: rounded 16px feels friendly and modern.",
    },
    {
      css: `:scope { border-radius: 24px !important; overflow: hidden !important; }`,
      rationale: "Pillowy: 24px radius with clipped content for a fully soft feel.",
    },
  ],
  squared: [
    BASELINE,
    {
      css: `:scope { border-radius: 0 !important; }`,
      rationale: "Sharp corners: removes the radius — more architectural, editorial.",
    },
    {
      css: `:scope { border-radius: 0 !important; border: 2px solid currentColor !important; }`,
      rationale: "Sharp + bordered: hard edges with a 2px outline for a wireframe look.",
    },
  ],
  elevated: [
    BASELINE,
    {
      css: `:scope { box-shadow: 0 8px 24px -4px rgba(0,0,0,0.12), 0 2px 8px -2px rgba(0,0,0,0.08) !important; }`,
      rationale: "Soft elevation: layered shadows signal the card is liftable.",
    },
    {
      css: `:scope { box-shadow: 0 20px 48px -8px rgba(0,0,0,0.18), 0 6px 16px -2px rgba(0,0,0,0.10) !important; transform: translateY(-2px) !important; }`,
      rationale: "Floating: deeper shadow + 2px translateY makes the card feel detached from the page.",
    },
  ],
  flat: [
    BASELINE,
    {
      css: `:scope { box-shadow: none !important; border: 1px solid rgb(229,229,229) !important; }`,
      rationale: "Flat: drops all shadows for a sharp 1px hairline border.",
    },
    {
      css: `:scope { box-shadow: none !important; border: 0 !important; background: transparent !important; }`,
      rationale: "Truly flat: no border, no shadow, no background — pure content.",
    },
  ],
  ghost: [
    BASELINE,
    {
      css: `:scope { background: transparent !important; border: 1px dashed currentColor !important; }`,
      rationale: "Ghost outline: dashed border + transparent fill signals secondary state.",
    },
    {
      css: `:scope { background: transparent !important; opacity: 0.7 !important; border: 1px solid currentColor !important; }`,
      rationale: "Faded ghost: 70% opacity for a clearly deprioritised look.",
    },
  ],
  contrast: [
    BASELINE,
    {
      css: `:scope { background: #000 !important; color: #fff !important; }`,
      rationale: "Inverted: black background + white text for maximum visual punch.",
    },
    {
      css: `:scope { background: #fafafa !important; color: #000 !important; border: 2px solid #000 !important; }`,
      rationale: "Bordered + bold: 2px black border on near-white for editorial clarity.",
    },
  ],
  accent: [
    BASELINE,
    {
      css: `:scope { border: 2px solid var(--color-accent, oklch(55% 0.2 260)) !important; }`,
      rationale: "Accent border: 2px brand-accent outline draws the eye.",
    },
    {
      css: `:scope { background: var(--color-accent, oklch(55% 0.2 260)) !important; color: white !important; }`,
      rationale: "Accent fill: full accent background with white text — highest-emphasis card.",
    },
  ],
  muted: [
    BASELINE,
    {
      css: `:scope { background: rgb(245,245,245) !important; }`,
      rationale: "Muted backdrop: pale gray background recedes into the page.",
    },
    {
      css: `:scope { background: rgb(250,250,250) !important; box-shadow: none !important; opacity: 0.92 !important; }`,
      rationale: "Whisper-quiet: very pale, no shadow, slight transparency.",
    },
  ],
  modern: [
    BASELINE,
    {
      css: `:scope { border-radius: 12px !important; padding: 1.5em !important; box-shadow: 0 4px 14px -4px rgba(0,0,0,0.08) !important; }`,
      rationale: "Modern: 12px radius + soft shadow + 1.5em padding — current design-system feel.",
    },
    {
      css: `:scope { border-radius: 14px !important; padding: 2em !important; background: white !important; box-shadow: 0 8px 28px -6px rgba(0,0,0,0.12) !important; border: 1px solid rgb(245,245,245) !important; }`,
      rationale: "Premium modern: layered shadow + thin border + generous padding.",
    },
  ],
  premium: [
    BASELINE,
    {
      css: `:scope { padding: 2.5em !important; border-radius: 4px !important; box-shadow: 0 1px 2px rgba(0,0,0,0.06) !important; border: 1px solid rgb(229,229,229) !important; }`,
      rationale: "Editorial: more padding + minimal radius + 1px line — restrained, expensive.",
    },
    {
      css: `:scope { padding: 3em !important; border-radius: 0 !important; border-top: 4px solid currentColor !important; }`,
      rationale: "Top-rule: bold horizontal accent line + generous padding — magazine cover energy.",
    },
  ],
  "weight-heavier": [
    BASELINE,
    {
      css: `:scope, :scope :is(h1,h2,h3,h4,h5,h6,p,span,a,button) { font-weight: 700 !important; }`,
      rationale: "Heavier text: bumps font-weight on all text inside to 700.",
    },
    {
      css: `:scope, :scope :is(h1,h2,h3,h4,h5,h6,p,span,a,button) { font-weight: 800 !important; letter-spacing: -0.01em !important; }`,
      rationale: "Display-heavy: weight 800 + tighter letter-spacing for a confident voice.",
    },
  ],
  "weight-lighter": [
    BASELINE,
    {
      css: `:scope, :scope :is(h1,h2,h3,h4,h5,h6,p,span,a,button) { font-weight: 300 !important; }`,
      rationale: "Lighter text: bumps all text to weight 300 for a delicate, airy feel.",
    },
    {
      css: `:scope, :scope :is(h1,h2,h3,h4,h5,h6,p,span,a,button) { font-weight: 200 !important; letter-spacing: 0.02em !important; }`,
      rationale: "Whisper: weight 200 + wider tracking — elegant, restrained.",
    },
  ],
  "size-bigger": [
    BASELINE,
    {
      css: `:scope { padding: 2em !important; }`,
      rationale: "Bigger card: doubles padding for a larger overall footprint.",
    },
    {
      css: `:scope { padding: 2.5em !important; transform: scale(1.05) !important; transform-origin: top left !important; }`,
      rationale: "Hero-sized: 2.5em padding + 5% scale-up for a hero presence.",
    },
  ],
  "size-smaller": [
    BASELINE,
    {
      css: `:scope { padding: 0.75em !important; }`,
      rationale: "Compact card: half the padding — sits quieter in a list.",
    },
    {
      css: `:scope { padding: 0.5em !important; transform: scale(0.95) !important; transform-origin: top left !important; }`,
      rationale: "Mini card: tight padding + 5% scale-down — chip-like.",
    },
  ],
};

// Text-focused variants (h1-h6, p, span, a, label) — affect typography.
const TEXT_VARIANTS: Record<Intent, Variant[]> = {
  default: [
    BASELINE,
    {
      css: `:scope, :scope * { font-weight: 700 !important; }`,
      rationale: "Bolder: weight 700 for stronger hierarchy.",
    },
    {
      css: `:scope, :scope * { font-weight: 300 !important; letter-spacing: 0.01em !important; }`,
      rationale: "Lighter: weight 300 + wider tracking — recedes elegantly.",
    },
  ],
  "weight-heavier": [
    BASELINE,
    {
      css: `:scope, :scope * { font-weight: 600 !important; }`,
      rationale: "Semi-bold: weight 600 — substantial without shouting.",
    },
    {
      css: `:scope, :scope * { font-weight: 800 !important; letter-spacing: -0.02em !important; }`,
      rationale: "Display heavy: weight 800 + tight tracking.",
    },
  ],
  "weight-lighter": [
    BASELINE,
    {
      css: `:scope, :scope * { font-weight: 300 !important; }`,
      rationale: "Light: weight 300 reads as delicate.",
    },
    {
      css: `:scope, :scope * { font-weight: 200 !important; letter-spacing: 0.02em !important; }`,
      rationale: "Hairline: weight 200 + wider tracking — minimalist.",
    },
  ],
  "size-bigger": [
    BASELINE,
    {
      css: `:scope, :scope * { font-size: calc(1em * 1.15) !important; }`,
      rationale: "Larger: 15% bigger font-size for stronger presence.",
    },
    {
      css: `:scope, :scope * { font-size: calc(1em * 1.30) !important; letter-spacing: -0.01em !important; }`,
      rationale: "Display: 30% bigger + tighter tracking — hero treatment.",
    },
  ],
  "size-smaller": [
    BASELINE,
    {
      css: `:scope, :scope * { font-size: calc(1em * 0.85) !important; }`,
      rationale: "Smaller: 15% reduction — secondary text feel.",
    },
    {
      css: `:scope, :scope * { font-size: calc(1em * 0.75) !important; letter-spacing: 0.02em !important; }`,
      rationale: "Caption: 25% smaller + wider tracking — caption / legal text size.",
    },
  ],
  spacious: [
    BASELINE,
    {
      css: `:scope, :scope * { line-height: 1.6 !important; letter-spacing: 0.01em !important; }`,
      rationale: "Open reading: 1.6 line-height + slight tracking — easier to scan.",
    },
    {
      css: `:scope, :scope * { line-height: 1.8 !important; letter-spacing: 0.03em !important; word-spacing: 0.1em !important; }`,
      rationale: "Long-form: 1.8 line-height + wider tracking — magazine reading feel.",
    },
  ],
  compact: [
    BASELINE,
    {
      css: `:scope, :scope * { line-height: 1.25 !important; }`,
      rationale: "Tight: 1.25 line-height — denser block of type.",
    },
    {
      css: `:scope, :scope * { line-height: 1.1 !important; letter-spacing: -0.01em !important; }`,
      rationale: "Ultra-tight: 1.1 line-height + tighter tracking — micro-typography.",
    },
  ],
  contrast: [
    BASELINE,
    {
      css: `:scope, :scope * { color: #000 !important; font-weight: 600 !important; }`,
      rationale: "Maximum contrast: pure-black + semi-bold for highest readability.",
    },
    {
      css: `:scope, :scope * { color: #fff !important; background: #000 !important; padding: 0.5em !important; }`,
      rationale: "Inverted: white text on black — strongest visual impact.",
    },
  ],
  accent: [
    BASELINE,
    {
      css: `:scope, :scope * { color: var(--color-accent, oklch(55% 0.2 260)) !important; }`,
      rationale: "Accent colored: brand color text.",
    },
    {
      css: `:scope, :scope * { color: var(--color-accent, oklch(55% 0.2 260)) !important; font-weight: 700 !important; }`,
      rationale: "Accent + bold: brand color + weight 700 for emphasis.",
    },
  ],
  muted: [
    BASELINE,
    {
      css: `:scope, :scope * { color: rgb(115,115,115) !important; }`,
      rationale: "Muted: mid-gray text — recedes from primary content.",
    },
    {
      css: `:scope, :scope * { color: rgb(163,163,163) !important; font-weight: 400 !important; }`,
      rationale: "Soft-mute: paler gray + normal weight.",
    },
  ],
  rounded: [
    BASELINE,
    {
      css: `:scope { padding: 0.4em 0.8em !important; border-radius: 6px !important; background: rgba(0,0,0,0.04) !important; }`,
      rationale: "Pill text: rounded background bubble around the text.",
    },
    {
      css: `:scope { padding: 0.5em 1em !important; border-radius: 9999px !important; background: rgba(0,0,0,0.06) !important; }`,
      rationale: "Full pill: rounded-full bubble for a tag-style treatment.",
    },
  ],
  squared: [
    BASELINE,
    {
      css: `:scope, :scope * { letter-spacing: 0.05em !important; text-transform: uppercase !important; font-weight: 500 !important; }`,
      rationale: "Editorial caps: wide-tracked uppercase — architectural.",
    },
    {
      css: `:scope, :scope * { letter-spacing: 0.1em !important; text-transform: uppercase !important; font-weight: 600 !important; }`,
      rationale: "Tracked caps: extra-wide uppercase for fashion/editorial vibe.",
    },
  ],
  elevated: [
    BASELINE,
    {
      css: `:scope, :scope * { text-shadow: 0 1px 2px rgba(0,0,0,0.10) !important; }`,
      rationale: "Subtle drop-shadow: 1px text shadow lifts the type off the page.",
    },
    {
      css: `:scope, :scope * { text-shadow: 0 2px 8px rgba(0,0,0,0.15) !important; }`,
      rationale: "Floating type: deeper text shadow for a clear lift.",
    },
  ],
  flat: [
    BASELINE,
    {
      css: `:scope, :scope * { text-shadow: none !important; }`,
      rationale: "Flat: strips any text-shadow.",
    },
    {
      css: `:scope, :scope * { text-shadow: none !important; font-weight: 400 !important; letter-spacing: 0 !important; }`,
      rationale: "Stripped: normal weight, no shadow, default tracking.",
    },
  ],
  ghost: [
    BASELINE,
    {
      css: `:scope, :scope * { opacity: 0.55 !important; }`,
      rationale: "Ghost: 55% opacity — clearly secondary.",
    },
    {
      css: `:scope, :scope * { opacity: 0.4 !important; }`,
      rationale: "Faded ghost: 40% opacity — very deprioritised.",
    },
  ],
  modern: [
    BASELINE,
    {
      css: `:scope, :scope * { font-weight: 600 !important; letter-spacing: -0.01em !important; }`,
      rationale: "Modern semibold: weight 600 + slight negative tracking — current design language.",
    },
    {
      css: `:scope, :scope * { font-weight: 700 !important; letter-spacing: -0.02em !important; line-height: 1.1 !important; }`,
      rationale: "Hero modern: heavy + tight tracking + tight leading — display type.",
    },
  ],
  premium: [
    BASELINE,
    {
      css: `:scope, :scope * { font-weight: 400 !important; letter-spacing: 0.02em !important; line-height: 1.4 !important; }`,
      rationale: "Editorial: regular weight + slight extra tracking — refined typography.",
    },
    {
      css: `:scope, :scope * { font-weight: 300 !important; letter-spacing: 0.04em !important; line-height: 1.5 !important; }`,
      rationale: "Luxury: light weight + wider tracking — fashion/luxury voice.",
    },
  ],
};

// Button-focused variants — affect padding, radius, fill, and weight together.
const BUTTON_VARIANTS: Record<Intent, Variant[]> = {
  default: [
    BASELINE,
    {
      css: `:scope { padding: 0.75em 1.5em !important; border-radius: 8px !important; }`,
      rationale: "Comfortable: more padding + standard 8px radius.",
    },
    {
      css: `:scope { padding: 0.5em 1.25em !important; border-radius: 9999px !important; }`,
      rationale: "Pill button: pill-shape with relaxed padding.",
    },
  ],
  rounded: [
    BASELINE,
    {
      css: `:scope { border-radius: 12px !important; }`,
      rationale: "Soft button: 12px corners.",
    },
    {
      css: `:scope { border-radius: 9999px !important; padding-inline: 1.5em !important; }`,
      rationale: "Pill: fully rounded with wider horizontal padding.",
    },
  ],
  squared: [
    BASELINE,
    {
      css: `:scope { border-radius: 0 !important; }`,
      rationale: "Sharp button: removes radius — architectural.",
    },
    {
      css: `:scope { border-radius: 2px !important; border: 2px solid currentColor !important; background: transparent !important; }`,
      rationale: "Wireframe outline: 2px radius, 2px border, transparent fill.",
    },
  ],
  ghost: [
    BASELINE,
    {
      css: `:scope { background: transparent !important; color: currentColor !important; border: 1px solid currentColor !important; }`,
      rationale: "Ghost outline: transparent fill with 1px border.",
    },
    {
      css: `:scope { background: transparent !important; text-decoration: underline !important; padding: 0 !important; border: 0 !important; }`,
      rationale: "Link button: text-only with underline — least emphasis.",
    },
  ],
  accent: [
    BASELINE,
    {
      css: `:scope { background: var(--color-accent, oklch(55% 0.2 260)) !important; color: white !important; border: 0 !important; }`,
      rationale: "Accent button: brand accent fill + white text.",
    },
    {
      css: `:scope { background: var(--color-accent, oklch(55% 0.2 260)) !important; color: white !important; border-radius: 9999px !important; padding: 0.7em 1.8em !important; }`,
      rationale: "Accent pill: brand color + pill shape + roomy padding.",
    },
  ],
  contrast: [
    BASELINE,
    {
      css: `:scope { background: #000 !important; color: #fff !important; font-weight: 600 !important; }`,
      rationale: "High contrast: black fill + white text + semibold.",
    },
    {
      css: `:scope { background: #000 !important; color: #fff !important; border: 2px solid #000 !important; font-weight: 700 !important; padding: 0.8em 1.6em !important; }`,
      rationale: "Hero CTA: bold black button with thicker padding.",
    },
  ],
  "size-bigger": [
    BASELINE,
    {
      css: `:scope { padding: 0.8em 1.8em !important; font-size: calc(1em * 1.1) !important; }`,
      rationale: "Bigger CTA: more padding + 10% bigger text.",
    },
    {
      css: `:scope { padding: 1em 2em !important; font-size: calc(1em * 1.25) !important; font-weight: 600 !important; }`,
      rationale: "Hero CTA: big padding + 25% bigger text + semibold.",
    },
  ],
  "size-smaller": [
    BASELINE,
    {
      css: `:scope { padding: 0.35em 0.75em !important; font-size: calc(1em * 0.875) !important; }`,
      rationale: "Smaller: tighter padding + 12.5% smaller text.",
    },
    {
      css: `:scope { padding: 0.25em 0.5em !important; font-size: calc(1em * 0.75) !important; }`,
      rationale: "Tag-sized: micro button for chip-style usage.",
    },
  ],
  "weight-heavier": [
    BASELINE,
    {
      css: `:scope { font-weight: 600 !important; }`,
      rationale: "Semibold label: weight 600.",
    },
    {
      css: `:scope { font-weight: 700 !important; letter-spacing: 0.02em !important; }`,
      rationale: "Bold tracked: weight 700 + slight tracking — confident CTA.",
    },
  ],
  "weight-lighter": [
    BASELINE,
    {
      css: `:scope { font-weight: 400 !important; }`,
      rationale: "Regular weight: drops emphasis to 400.",
    },
    {
      css: `:scope { font-weight: 300 !important; letter-spacing: 0.02em !important; }`,
      rationale: "Light label: weight 300 — text-link feel.",
    },
  ],
  elevated: [
    BASELINE,
    {
      css: `:scope { box-shadow: 0 4px 14px -4px rgba(0,0,0,0.20) !important; }`,
      rationale: "Lifted: soft drop shadow on the button.",
    },
    {
      css: `:scope { box-shadow: 0 8px 20px -4px rgba(0,0,0,0.25) !important; transform: translateY(-1px) !important; }`,
      rationale: "Hovering: deeper shadow + 1px lift — feels clickable.",
    },
  ],
  flat: [
    BASELINE,
    {
      css: `:scope { box-shadow: none !important; border: 0 !important; }`,
      rationale: "Flat: no shadow, no border.",
    },
    {
      css: `:scope { box-shadow: none !important; border: 0 !important; background: transparent !important; color: currentColor !important; padding: 0.5em !important; }`,
      rationale: "Plain text button: stripped to text-only.",
    },
  ],
  spacious: [
    BASELINE,
    {
      css: `:scope { padding: 0.9em 1.8em !important; }`,
      rationale: "Roomy: extra padding all around.",
    },
    {
      css: `:scope { padding: 1.1em 2.4em !important; letter-spacing: 0.04em !important; }`,
      rationale: "Spacious + tracked: extra padding + open tracking — confident.",
    },
  ],
  compact: [
    BASELINE,
    {
      css: `:scope { padding: 0.35em 0.75em !important; }`,
      rationale: "Compact: tighter padding for dense layouts.",
    },
    {
      css: `:scope { padding: 0.25em 0.5em !important; font-size: calc(1em * 0.9) !important; }`,
      rationale: "Mini button: very tight + slightly smaller text.",
    },
  ],
  muted: [
    BASELINE,
    {
      css: `:scope { background: rgb(245,245,245) !important; color: rgb(64,64,64) !important; }`,
      rationale: "Quiet button: pale gray fill + dark-gray text.",
    },
    {
      css: `:scope { background: rgb(250,250,250) !important; color: rgb(115,115,115) !important; border: 1px solid rgb(229,229,229) !important; }`,
      rationale: "Ghost-quiet: very pale + thin border + muted text.",
    },
  ],
  modern: [
    BASELINE,
    {
      css: `:scope { border-radius: 10px !important; padding: 0.7em 1.4em !important; font-weight: 500 !important; }`,
      rationale: "Modern button: 10px radius + medium weight.",
    },
    {
      css: `:scope { border-radius: 12px !important; padding: 0.8em 1.6em !important; font-weight: 500 !important; box-shadow: 0 2px 4px rgba(0,0,0,0.06) !important; }`,
      rationale: "Modern + shadow: subtle shadow + soft corners + medium weight.",
    },
  ],
  premium: [
    BASELINE,
    {
      css: `:scope { border-radius: 2px !important; padding: 0.8em 2em !important; letter-spacing: 0.08em !important; text-transform: uppercase !important; font-weight: 500 !important; }`,
      rationale: "Editorial CTA: sharp corners + tracked uppercase — luxury fashion CTA.",
    },
    {
      css: `:scope { background: #000 !important; color: #fff !important; border-radius: 0 !important; padding: 1em 2.4em !important; letter-spacing: 0.1em !important; text-transform: uppercase !important; font-weight: 500 !important; }`,
      rationale: "Hero editorial: black + sharp + extra-tracked uppercase — high-end retail.",
    },
  ],
};

// Image-focused variants — affect radius, border, shadow, opacity.
const IMAGE_VARIANTS: Record<Intent, Variant[]> = {
  default: [
    BASELINE,
    {
      css: `:scope { border-radius: 12px !important; }`,
      rationale: "Rounded: 12px radius softens the edges.",
    },
    {
      css: `:scope { border-radius: 9999px !important; aspect-ratio: 1 !important; object-fit: cover !important; }`,
      rationale: "Circular: full-round avatar treatment.",
    },
  ],
  rounded: [
    BASELINE,
    {
      css: `:scope { border-radius: 12px !important; }`,
      rationale: "Soft 12px corners.",
    },
    {
      css: `:scope { border-radius: 9999px !important; aspect-ratio: 1 !important; object-fit: cover !important; }`,
      rationale: "Avatar circle.",
    },
  ],
  squared: [
    BASELINE,
    {
      css: `:scope { border-radius: 0 !important; }`,
      rationale: "Sharp: no radius.",
    },
    {
      css: `:scope { border-radius: 0 !important; border: 2px solid currentColor !important; }`,
      rationale: "Bordered: 2px frame + sharp corners.",
    },
  ],
  elevated: [
    BASELINE,
    {
      css: `:scope { box-shadow: 0 8px 24px -4px rgba(0,0,0,0.18) !important; border-radius: 8px !important; }`,
      rationale: "Lifted: drop shadow + soft corners.",
    },
    {
      css: `:scope { box-shadow: 0 20px 48px -8px rgba(0,0,0,0.25) !important; border-radius: 12px !important; transform: translateY(-2px) !important; }`,
      rationale: "Floating: deeper shadow + 2px lift.",
    },
  ],
  muted: [
    BASELINE,
    {
      css: `:scope { opacity: 0.85 !important; filter: saturate(0.8) !important; }`,
      rationale: "Soft: 85% opacity + 80% saturation.",
    },
    {
      css: `:scope { opacity: 0.7 !important; filter: grayscale(1) !important; }`,
      rationale: "Grayscale: fully desaturated + 70% opacity.",
    },
  ],
  contrast: [
    BASELINE,
    {
      css: `:scope { filter: contrast(1.2) saturate(1.1) !important; }`,
      rationale: "Punchy: 120% contrast + slightly bumped saturation.",
    },
    {
      css: `:scope { filter: contrast(1.4) saturate(1.2) !important; }`,
      rationale: "Vivid: 140% contrast + 120% saturation.",
    },
  ],
  // Reasonable fallbacks for other intents on images.
  spacious: [
    BASELINE,
    { css: `:scope { padding: 1em !important; background: white !important; box-shadow: 0 2px 8px rgba(0,0,0,0.08) !important; }`, rationale: "Polaroid: 1em white padding + soft shadow — photo print look." },
    { css: `:scope { padding: 1.5em !important; background: white !important; box-shadow: 0 6px 16px rgba(0,0,0,0.12) !important; }`, rationale: "Wide polaroid: more padding for a magazine-print feel." },
  ],
  compact: [
    BASELINE,
    { css: `:scope { padding: 0 !important; margin: 0 !important; }`, rationale: "Edge-to-edge: removes all surrounding space." },
    { css: `:scope { padding: 0 !important; margin: 0 !important; border-radius: 4px !important; }`, rationale: "Edge + slight curve: 4px radius keeps it crisp." },
  ],
  ghost: [
    BASELINE,
    { css: `:scope { opacity: 0.5 !important; }`, rationale: "Translucent: 50% opacity." },
    { css: `:scope { opacity: 0.3 !important; filter: grayscale(0.5) !important; }`, rationale: "Faded grayscale: 30% opacity + partial desaturation." },
  ],
  flat: [
    BASELINE,
    { css: `:scope { box-shadow: none !important; border: 0 !important; }`, rationale: "Flat: removes shadows and borders." },
    { css: `:scope { box-shadow: none !important; border: 0 !important; border-radius: 0 !important; }`, rationale: "Edge-flat: also drops the radius." },
  ],
  accent: [
    BASELINE,
    { css: `:scope { border: 3px solid var(--color-accent, oklch(55% 0.2 260)) !important; }`, rationale: "Accent frame: 3px brand-accent border." },
    { css: `:scope { box-shadow: 0 0 0 4px var(--color-accent, oklch(55% 0.2 260)) !important; }`, rationale: "Accent halo: 4px brand-accent ring around the image." },
  ],
  "weight-heavier": [
    BASELINE,
    { css: `:scope { filter: contrast(1.15) !important; }`, rationale: "Punchier: 15% more contrast — heavier visual weight." },
    { css: `:scope { filter: contrast(1.25) saturate(1.1) !important; }`, rationale: "Strong: 25% more contrast + bumped saturation." },
  ],
  "weight-lighter": [
    BASELINE,
    { css: `:scope { filter: contrast(0.9) brightness(1.05) !important; }`, rationale: "Soft: reduced contrast + slight brightness lift." },
    { css: `:scope { filter: contrast(0.8) brightness(1.1) saturate(0.9) !important; }`, rationale: "Hazy: faded vibe — less contrast, more brightness, less saturation." },
  ],
  "size-bigger": [
    BASELINE,
    { css: `:scope { transform: scale(1.1) !important; transform-origin: center !important; }`, rationale: "10% larger via transform." },
    { css: `:scope { transform: scale(1.25) !important; transform-origin: center !important; }`, rationale: "25% larger via transform." },
  ],
  "size-smaller": [
    BASELINE,
    { css: `:scope { transform: scale(0.9) !important; transform-origin: center !important; }`, rationale: "10% smaller via transform." },
    { css: `:scope { transform: scale(0.75) !important; transform-origin: center !important; }`, rationale: "25% smaller via transform." },
  ],
  modern: [
    BASELINE,
    { css: `:scope { border-radius: 10px !important; box-shadow: 0 4px 12px rgba(0,0,0,0.08) !important; }`, rationale: "Modern image: 10px radius + soft shadow." },
    { css: `:scope { border-radius: 16px !important; box-shadow: 0 8px 24px rgba(0,0,0,0.12) !important; }`, rationale: "Premium modern: bigger radius + deeper shadow." },
  ],
  premium: [
    BASELINE,
    { css: `:scope { border-radius: 0 !important; box-shadow: 0 2px 4px rgba(0,0,0,0.06) !important; }`, rationale: "Editorial: sharp corners + minimal shadow." },
    { css: `:scope { border-radius: 0 !important; box-shadow: none !important; outline: 1px solid currentColor !important; outline-offset: 8px !important; }`, rationale: "Framed: 1px outline offset 8px — luxury gallery frame." },
  ],
};

// Input-focused variants — affect padding, border, radius, focus styles.
const INPUT_VARIANTS: Record<Intent, Variant[]> = {
  default: [
    BASELINE,
    { css: `:scope { padding: 0.6em 0.9em !important; border-radius: 8px !important; border: 1px solid rgb(212,212,212) !important; }`, rationale: "Comfortable: more padding + 8px radius + neutral border." },
    { css: `:scope { padding: 0.5em 0.75em !important; border: 0 !important; border-bottom: 2px solid currentColor !important; border-radius: 0 !important; background: transparent !important; }`, rationale: "Underline only: borderless except 2px underline — minimal." },
  ],
  rounded: [
    BASELINE,
    { css: `:scope { border-radius: 9999px !important; padding-inline: 1em !important; }`, rationale: "Pill input." },
    { css: `:scope { border-radius: 12px !important; padding: 0.7em 1em !important; }`, rationale: "Soft 12px corners + roomy padding." },
  ],
  squared: [
    BASELINE,
    { css: `:scope { border-radius: 0 !important; }`, rationale: "Sharp: no radius." },
    { css: `:scope { border-radius: 0 !important; border: 2px solid currentColor !important; }`, rationale: "Wireframe: sharp + 2px border." },
  ],
  ghost: [
    BASELINE,
    { css: `:scope { background: transparent !important; border: 1px dashed currentColor !important; }`, rationale: "Ghost: transparent + dashed border." },
    { css: `:scope { background: transparent !important; border: 0 !important; border-bottom: 1px dashed currentColor !important; border-radius: 0 !important; }`, rationale: "Ghost underline only." },
  ],
  accent: [
    BASELINE,
    { css: `:scope { border: 2px solid var(--color-accent, oklch(55% 0.2 260)) !important; }`, rationale: "Accent border on the field." },
    { css: `:scope:focus { box-shadow: 0 0 0 3px var(--color-accent, oklch(55% 0.2 260)) !important; }`, rationale: "Accent focus ring: 3px brand-color halo on focus." },
  ],
  "size-bigger": [
    BASELINE,
    { css: `:scope { padding: 0.8em 1em !important; font-size: 1.05em !important; }`, rationale: "Larger input: more padding + 5% bigger text." },
    { css: `:scope { padding: 1em 1.25em !important; font-size: 1.15em !important; }`, rationale: "XL input: very roomy + 15% bigger text." },
  ],
  "size-smaller": [
    BASELINE,
    { css: `:scope { padding: 0.35em 0.6em !important; font-size: 0.9em !important; }`, rationale: "Smaller: tighter padding + smaller text." },
    { css: `:scope { padding: 0.25em 0.5em !important; font-size: 0.85em !important; }`, rationale: "Compact: very tight." },
  ],
  spacious: [
    BASELINE,
    { css: `:scope { padding: 0.8em 1.2em !important; }`, rationale: "Roomy input." },
    { css: `:scope { padding: 1em 1.4em !important; }`, rationale: "Very roomy." },
  ],
  compact: [
    BASELINE,
    { css: `:scope { padding: 0.35em 0.5em !important; }`, rationale: "Tight input." },
    { css: `:scope { padding: 0.2em 0.4em !important; }`, rationale: "Mini input." },
  ],
  contrast: [
    BASELINE,
    { css: `:scope { border: 2px solid currentColor !important; }`, rationale: "Strong 2px border." },
    { css: `:scope { background: #000 !important; color: #fff !important; border: 0 !important; }`, rationale: "Inverted: black bg + white text." },
  ],
  muted: [
    BASELINE,
    { css: `:scope { background: rgb(245,245,245) !important; border: 0 !important; }`, rationale: "Pale fill, no border." },
    { css: `:scope { background: rgb(250,250,250) !important; border: 1px solid rgb(229,229,229) !important; color: rgb(64,64,64) !important; }`, rationale: "Very quiet input." },
  ],
  elevated: [
    BASELINE,
    { css: `:scope { box-shadow: 0 2px 8px rgba(0,0,0,0.06) !important; }`, rationale: "Subtle lift." },
    { css: `:scope { box-shadow: 0 4px 14px rgba(0,0,0,0.10) !important; transform: translateY(-1px) !important; }`, rationale: "Hovering input." },
  ],
  flat: [
    BASELINE,
    { css: `:scope { box-shadow: none !important; border: 0 !important; border-bottom: 1px solid currentColor !important; border-radius: 0 !important; background: transparent !important; }`, rationale: "Underline only — minimal." },
    { css: `:scope { box-shadow: none !important; border: 0 !important; background: rgb(245,245,245) !important; }`, rationale: "Filled-flat: pale fill, no border." },
  ],
  "weight-heavier": [
    BASELINE,
    { css: `:scope { font-weight: 500 !important; }`, rationale: "Medium-weight input text." },
    { css: `:scope { font-weight: 600 !important; }`, rationale: "Semibold input text." },
  ],
  "weight-lighter": [
    BASELINE,
    { css: `:scope { font-weight: 300 !important; }`, rationale: "Light-weight input text." },
    { css: `:scope { font-weight: 200 !important; }`, rationale: "Hairline input text." },
  ],
  modern: [
    BASELINE,
    { css: `:scope { padding: 0.7em 1em !important; border-radius: 10px !important; border: 1px solid rgb(229,229,229) !important; }`, rationale: "Modern field: 10px radius + roomy padding." },
    { css: `:scope { padding: 0.8em 1.2em !important; border-radius: 12px !important; border: 1px solid rgb(229,229,229) !important; background: white !important; }`, rationale: "Premium modern field." },
  ],
  premium: [
    BASELINE,
    { css: `:scope { border-radius: 0 !important; border: 0 !important; border-bottom: 1px solid currentColor !important; padding-block: 0.5em !important; background: transparent !important; letter-spacing: 0.02em !important; }`, rationale: "Editorial input: underline only + slight tracking." },
    { css: `:scope { border-radius: 0 !important; border: 0 !important; border-bottom: 2px solid currentColor !important; padding-block: 0.6em !important; background: transparent !important; letter-spacing: 0.04em !important; font-weight: 300 !important; }`, rationale: "Couture field: 2px underline + light + tracked." },
  ],
};

// Default fallback for "other" tags or when a specific intent has no
// tag-class-specific entry.
const DEFAULT_VARIANTS: Record<Intent, Variant[]> = CONTAINER_VARIANTS;

// Top-level catalog — Intent → TagClass → variants
const CATALOG: Record<
  Intent,
  Partial<Record<TagClass, Variant[]>> & { default: Variant[] }
> = (() => {
  const intents: Intent[] = [
    "default",
    "weight-heavier",
    "weight-lighter",
    "size-bigger",
    "size-smaller",
    "rounded",
    "squared",
    "spacious",
    "compact",
    "contrast",
    "accent",
    "muted",
    "ghost",
    "elevated",
    "flat",
    "modern",
    "premium",
  ];
  const out: Record<
    Intent,
    Partial<Record<TagClass, Variant[]>> & { default: Variant[] }
  > = {} as never;
  for (const intent of intents) {
    out[intent] = {
      container: CONTAINER_VARIANTS[intent] ?? CONTAINER_VARIANTS.default,
      text: TEXT_VARIANTS[intent] ?? TEXT_VARIANTS.default,
      button: BUTTON_VARIANTS[intent] ?? BUTTON_VARIANTS.default,
      input: INPUT_VARIANTS[intent] ?? INPUT_VARIANTS.default,
      image: IMAGE_VARIANTS[intent] ?? IMAGE_VARIANTS.default,
      default: DEFAULT_VARIANTS[intent] ?? DEFAULT_VARIANTS.default,
    };
  }
  return out;
})();

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, Math.floor(n)));
}
