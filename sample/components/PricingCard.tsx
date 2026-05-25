// Standalone TSX sample for the audit path (no dev-server needed).
// Mirrors sample/index.html's clean baseline. wisp-design audit should
// produce ZERO hard-ban hits on this file.

export interface PricingCardProps {
  name: string;
  description: string;
  priceMonthly: number;
  features: string[];
  ctaLabel: string;
  onSubscribe: () => void;
}

export function PricingCard({
  name,
  description,
  priceMonthly,
  features,
  ctaLabel,
  onSubscribe,
}: PricingCardProps): JSX.Element {
  return (
    <article className="max-w-sm rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
      <header className="space-y-1">
        <h3 className="text-base font-medium text-neutral-900">{name}</h3>
        <p className="text-sm text-neutral-600">{description}</p>
      </header>
      <p className="mt-4">
        <span className="text-3xl font-semibold text-neutral-900">
          ${priceMonthly}
        </span>
        <span className="text-sm text-neutral-500">/month</span>
      </p>
      <ul className="mt-4 space-y-2 text-sm text-neutral-700">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2">
            <span
              aria-hidden="true"
              className="mt-1 inline-block h-1.5 w-1.5 rounded-full bg-neutral-400"
            />
            {f}
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={onSubscribe}
        className="mt-6 w-full rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900"
      >
        {ctaLabel}
      </button>
    </article>
  );
}
