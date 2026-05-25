// Clean: standard primary button, no slop patterns
export function PrimaryButton({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center justify-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2"
    >
      {children}
    </button>
  );
}
