// Clean: responsive grid layout
export function FeatureGrid({ features }: { features: Array<{ name: string; desc: string }> }) {
  return (
    <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 xl:grid-cols-4">
      {features.map((feat, i) => (
        <div key={i} className="flex flex-col gap-3">
          <div className="h-10 w-10 rounded-lg bg-slate-100 flex items-center justify-center">
            <span className="text-slate-600 text-sm font-semibold">{i + 1}</span>
          </div>
          <h3 className="text-sm font-semibold text-slate-900">{feat.name}</h3>
          <p className="text-sm text-slate-500 leading-relaxed">{feat.desc}</p>
        </div>
      ))}
    </div>
  );
}
