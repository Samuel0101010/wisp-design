// Clean: modal dialog pattern
export function Modal({ open, onClose, title, children }: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50">
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="rounded-md p-1 text-slate-400 hover:text-slate-600 focus:outline-none focus:ring-2 focus:ring-slate-500"
          >
            X
          </button>
        </div>
        <div className="text-sm text-slate-600">{children}</div>
      </div>
    </div>
  );
}
