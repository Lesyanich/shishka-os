import { Users, Cpu, UtensilsCrossed } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export type Segment = 'team' | 'tech' | 'kitchen'

interface SegmentBarProps {
  active: Segment
  onChange: (seg: Segment) => void
  counts: Record<Segment, number>
}

interface SegmentConfig {
  key: Segment
  label: string
  icon: LucideIcon
}

const SEGMENTS: SegmentConfig[] = [
  { key: 'team', label: 'Team', icon: Users },
  { key: 'tech', label: 'Tech', icon: Cpu },
  { key: 'kitchen', label: 'Kitchen', icon: UtensilsCrossed },
]

export function SegmentBar({ active, onChange, counts }: SegmentBarProps) {
  return (
    <div className="flex gap-1 rounded-xl border border-slate-800/50 bg-slate-900/50 p-1 w-fit">
      {SEGMENTS.map(({ key, label, icon: Icon }) => {
        const isActive = active === key
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            className={[
              'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition-colors',
              isActive
                ? 'bg-slate-800 text-slate-100 shadow-sm'
                : 'text-slate-400 hover:text-slate-200',
            ].join(' ')}
          >
            <Icon size={13} />
            <span className="text-xs font-medium">{label}</span>
            <span
              className={[
                'rounded-md px-1.5 py-0.5 text-[10px] font-mono leading-none',
                isActive
                  ? 'bg-emerald-500/15 text-emerald-400'
                  : 'bg-slate-700/50 text-slate-500',
              ].join(' ')}
            >
              {counts[key]}
            </span>
          </button>
        )
      })}
    </div>
  )
}
