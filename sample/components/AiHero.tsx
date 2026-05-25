// Deliberate-slop TSX sample for the audit path. wisp-design audit
// should produce MULTIPLE hard-ban hits on this file:
//   - purple-blue-gradient   (the headline + outer bg)
//   - gradient-text          (bg-clip-text on the headline)
//   - glassmorphism-default  (backdrop-blur-md on the metric cards)
//   - hero-metric-template   (3-up metric row with text-7xl + "98%" + label)

export function AiHero(): JSX.Element {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-neutral-200 bg-gradient-to-br from-purple-500/30 via-blue-500/20 to-purple-600/30 p-10 backdrop-blur-md">
      <p className="text-xs uppercase tracking-[0.2em] text-neutral-700">
        AI-powered platform
      </p>
      <h3 className="mt-2 text-7xl font-black leading-none tracking-tight bg-gradient-to-r from-purple-500 to-blue-500 bg-clip-text text-transparent">
        10x your team's velocity—instantly
      </h3>
      <p className="mt-6 max-w-prose text-base text-neutral-700">
        Seamlessly orchestrate—effortlessly. Our AI-native platform delivers
        unprecedented productivity gains across every workflow.
      </p>
      <div className="mt-8 grid grid-cols-3 gap-6">
        <div className="rounded-xl bg-white/30 p-4 backdrop-blur-md">
          <p className="text-4xl font-black text-neutral-900">98%</p>
          <p className="text-xs text-neutral-600">accuracy</p>
        </div>
        <div className="rounded-xl bg-white/30 p-4 backdrop-blur-md">
          <p className="text-4xl font-black text-neutral-900">3.2x</p>
          <p className="text-xs text-neutral-600">faster</p>
        </div>
        <div className="rounded-xl bg-white/30 p-4 backdrop-blur-md">
          <p className="text-4xl font-black text-neutral-900">24/7</p>
          <p className="text-xs text-neutral-600">always-on</p>
        </div>
      </div>
    </div>
  );
}
