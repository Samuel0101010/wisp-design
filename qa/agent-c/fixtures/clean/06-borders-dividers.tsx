// Clean: borders and dividers, no decorative side-stripe
export function Divider() {
  return <hr className="border-t border-slate-200 my-4" />;
}

export function BorderedSection({ children }: { children: React.ReactNode }) {
  return (
    <div className="border border-slate-200 rounded-lg p-4">
      {children}
    </div>
  );
}

export function InlineLabel({ text }: { text: string }) {
  return (
    <span className="border-l-4 border-slate-400 pl-3 text-slate-700 font-medium">
      {text}
    </span>
  );
}
