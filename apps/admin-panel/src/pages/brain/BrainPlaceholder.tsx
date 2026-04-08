import type { LucideIcon } from 'lucide-react'

interface BrainPlaceholderProps {
  icon: LucideIcon
  title: string
  phase: string
  description: string
}

export function BrainPlaceholder({ icon: Icon, title, phase, description }: BrainPlaceholderProps) {
  return (
    <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-slate-800 bg-slate-950/50 p-8">
      <div className="max-w-md text-center">
        <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-slate-900 text-slate-500">
          <Icon className="h-6 w-6" />
        </span>
        <h2 className="text-sm font-semibold text-slate-200">{title}</h2>
        <p className="mt-1 text-[11px] uppercase tracking-wider text-fuchsia-400">{phase}</p>
        <p className="mt-3 text-xs text-slate-500">{description}</p>
      </div>
    </div>
  )
}
