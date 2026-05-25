export function TailwindNav({ links }: { links: Array<{ href: string; label: string }> }) {
  return (
    <nav className="flex items-center justify-between px-6 py-3 border-b border-slate-200 bg-white">
      <span className="text-base font-semibold text-slate-900">Acme</span>
      <ul className="flex items-center gap-6">
        {links.map(link => (
          <li key={link.href}>
            <a href={link.href} className="text-sm text-slate-600 hover:text-slate-900 font-medium">
              {link.label}
            </a>
          </li>
        ))}
      </ul>
      <a href="/login" className="rounded-md bg-slate-900 px-3 py-1.5 text-sm text-white font-medium hover:bg-slate-700">
        Sign in
      </a>
    </nav>
  )
}
