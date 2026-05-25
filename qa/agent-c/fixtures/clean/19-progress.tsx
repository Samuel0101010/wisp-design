// Clean: progress bar, teal brand colour (not Tailwind default blue)
export function Progress({ value, max = 100, label }: { value: number; max?: number; label: string }) {
  const pct = Math.round((value / max) * 100);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-between text-sm">
        <span className="font-medium text-slate-700">{label}</span>
        <span className="text-slate-500">{pct}%</span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-label={label}
        className="h-2 w-full rounded-full bg-slate-200 overflow-hidden"
      >
        <div
          className="h-full bg-teal-600 rounded-full transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
