// Clean: card with normal box-shadow, no glassmorphism
export function Card({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      <p className="mt-2 text-sm text-slate-600">{body}</p>
    </div>
  );
}

export function CardGrid({ cards }: { cards: Array<{ title: string; body: string }> }) {
  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {cards.map((card, i) => (
        <Card key={i} {...card} />
      ))}
    </div>
  );
}
