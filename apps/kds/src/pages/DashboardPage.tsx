import { useCook } from '../contexts/CookContext'

export function DashboardPage() {
  const { cook } = useCook()

  return (
    <div className="flex h-dvh flex-col items-center justify-center text-slate-500">
      <p className="text-lg">Dashboard — {cook?.name}</p>
      <p className="text-sm">Tasks will appear here</p>
    </div>
  )
}
