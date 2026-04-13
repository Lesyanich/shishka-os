import { useParams } from 'react-router-dom'

export function TaskPage() {
  const { id } = useParams<{ id: string }>()

  return (
    <div className="flex h-dvh flex-col items-center justify-center text-slate-500">
      <p className="text-lg">Task Wizard</p>
      <p className="text-sm">Task: {id}</p>
    </div>
  )
}
