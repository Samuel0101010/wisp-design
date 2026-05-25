// Clean: tabs component
export function Tabs({ tabs, active, onChange }: {
  tabs: string[];
  active: string;
  onChange: (tab: string) => void;
}) {
  return (
    <div className="border-b border-slate-200">
      <nav className="-mb-px flex gap-6">
        {tabs.map(tab => (
          <button
            key={tab}
            onClick={() => onChange(tab)}
            className={`py-3 text-sm font-medium border-b-2 transition-colors ${
              tab === active
                ? 'border-slate-900 text-slate-900'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            {tab}
          </button>
        ))}
      </nav>
    </div>
  );
}
