// Clean: form inputs with proper focus rings, accessible labels
export function TextInput({ id, label, placeholder }: { id: string; label: string; placeholder: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-slate-700">
        {label}
      </label>
      <input
        id={id}
        type="text"
        placeholder={placeholder}
        className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-1"
      />
    </div>
  );
}
