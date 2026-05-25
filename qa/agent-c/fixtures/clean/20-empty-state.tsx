// Clean: empty state with inline SVG icon (not external illustration service)
export function EmptyState({ title, description, action }: {
  title: string;
  description: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <svg
        className="h-12 w-12 text-slate-300 mb-4"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        aria-hidden="true"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 13h6m-3-3v6m5.25 5H6.75A2.25 2.25 0 014.5 18.75V6.75A2.25 2.25 0 016.75 4.5h7.5a2.25 2.25 0 012.25 2.25v12A2.25 2.25 0 0118.75 21z" />
      </svg>
      <h3 className="text-sm font-semibold text-slate-900 mb-1">{title}</h3>
      <p className="text-sm text-slate-500 max-w-xs">{description}</p>
      {action && (
        <button
          onClick={action.onClick}
          className="mt-4 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
