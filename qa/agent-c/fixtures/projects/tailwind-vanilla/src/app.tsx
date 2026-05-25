export function App() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <h1 className="text-xl font-semibold text-slate-900 mb-4">Sign In</h1>
        <div className="flex flex-col gap-4">
          <input
            type="email"
            placeholder="Email"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
          />
          <input
            type="password"
            placeholder="Password"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
          />
          <button className="bg-slate-900 text-white rounded-md py-2 text-sm font-medium hover:bg-slate-700">
            Sign In
          </button>
        </div>
      </div>
    </div>
  )
}
