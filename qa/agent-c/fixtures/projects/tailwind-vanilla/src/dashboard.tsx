export function Dashboard() {
  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <h1 className="text-2xl font-bold text-slate-900 mb-6">Dashboard</h1>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
        <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
          <p className="text-sm text-slate-500">Revenue</p>
          <p className="text-3xl font-bold text-slate-900 mt-1">$12,345</p>
          <span className="inline-block mt-2 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
            +12%
          </span>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
          <p className="text-sm text-slate-500">Active Users</p>
          <p className="text-3xl font-bold text-slate-900 mt-1">1,123</p>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm flex items-center justify-center">
          <div className="h-8 w-8 rounded-full border-2 border-slate-300 border-t-slate-700 animate-spin" />
        </div>
      </div>
    </div>
  )
}
