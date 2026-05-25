// Clean: secondary button variant
export function SecondaryButton({ label }: { label: string }) {
  return (
    <button className="inline-flex items-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-500">
      {label}
    </button>
  );
}

export function DestructiveButton({ label }: { label: string }) {
  return (
    <button className="inline-flex items-center rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500 focus:ring-2 focus:ring-red-600">
      {label}
    </button>
  );
}
