// Clean: data table
type Row = { id: string; name: string; status: string; amount: number };

export function DataTable({ rows }: { rows: Row[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="min-w-full divide-y divide-slate-200">
        <thead className="bg-slate-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Name</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
            <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">Amount</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {rows.map(row => (
            <tr key={row.id} className="hover:bg-slate-50">
              <td className="px-4 py-3 text-sm font-medium text-slate-900">{row.name}</td>
              <td className="px-4 py-3 text-sm text-slate-600">{row.status}</td>
              <td className="px-4 py-3 text-sm text-slate-900 text-right">${row.amount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
