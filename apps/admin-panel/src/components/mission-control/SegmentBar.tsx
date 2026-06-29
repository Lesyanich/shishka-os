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
    <div className="flex gap-1 rounded-xl border border-[var(--line)] bg-[var(--s-1)] p-1 w-fit">
      {SEGMENTS.map(({ key, label, icon: Icon }) => {
        const isActive = active === key
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            className={[
              'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition-colors',
              isActive ? 'bg-[var(--s-2)] text-cream shadow-sm' : 'text-cream/60 hover:text-cream',
            ].join(' ')}
          >
            <Icon size={13} />
            <span className="text-xs font-medium">{label}</span>
            <span
              className={[
                'rounded-md px-1.5 py-0.5 text-[10px] font-mono leading-none',
                isActive ? 'bg-forest-soft/15 text-mint-200' : 'bg-[var(--s-3)] text-cream/45',
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
