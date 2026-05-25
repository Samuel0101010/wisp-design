// Clean: typography system with multiple weights (not single-weight)
export function TypographyDemo() {
  return (
    <article className="prose max-w-prose">
      <h1 className="text-3xl font-bold text-slate-900">Page Heading</h1>
      <h2 className="text-2xl font-semibold text-slate-800">Section Heading</h2>
      <h3 className="text-xl font-medium text-slate-700">Subsection</h3>
      <p className="text-base font-normal text-slate-600 leading-relaxed">
        Body text with normal weight and comfortable line-height. No em-dashes
        used as UI punctuation here.
      </p>
      <label className="text-sm font-medium text-slate-700">Form label</label>
    </article>
  );
}
