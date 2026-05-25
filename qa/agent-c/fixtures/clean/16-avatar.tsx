// Clean: avatar — uses real image or initials, no blob illustrations
export function Avatar({ src, name, size = 'md' }: { src?: string; name: string; size?: 'sm' | 'md' | 'lg' }) {
  const sizeClass = { sm: 'h-8 w-8 text-xs', md: 'h-10 w-10 text-sm', lg: 'h-12 w-12 text-base' }[size];
  const initials = name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  if (src) {
    return <img src={src} alt={name} className={`${sizeClass} rounded-full object-cover`} />;
  }
  return (
    <div className={`${sizeClass} rounded-full bg-slate-200 flex items-center justify-center font-semibold text-slate-600`}>
      {initials}
    </div>
  );
}
