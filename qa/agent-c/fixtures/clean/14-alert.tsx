// Clean: alert / notification component
type Variant = 'info' | 'warning' | 'error' | 'success';

const VARIANT_CLASSES: Record<Variant, string> = {
  info: 'bg-blue-50 border-blue-200 text-blue-800',
  warning: 'bg-amber-50 border-amber-200 text-amber-800',
  error: 'bg-red-50 border-red-200 text-red-800',
  success: 'bg-emerald-50 border-emerald-200 text-emerald-800',
};

export function Alert({ variant, message }: { variant: Variant; message: string }) {
  return (
    <div role="alert" className={`rounded-md border px-4 py-3 text-sm ${VARIANT_CLASSES[variant]}`}>
      {message}
    </div>
  );
}
