// Clean: status badges
type Status = 'active' | 'inactive' | 'pending';

const STATUS_CLASSES: Record<Status, string> = {
  active: 'bg-emerald-100 text-emerald-800',
  inactive: 'bg-slate-100 text-slate-600',
  pending: 'bg-amber-100 text-amber-800',
};

export function Badge({ status }: { status: Status }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_CLASSES[status]}`}>
      {status}
    </span>
  );
}
