interface EquipmentLocationBadgeProps {
  zone: string | null
  wall: string | null
}

const ZONE_STYLES: Record<string, { dot: string; label: string }> = {
  Hot: { dot: 'bg-red-500', label: 'text-red-400' },
  Cold: { dot: 'bg-sky-500', label: 'text-sky-400' },
  Store: { dot: 'bg-slate-400', label: 'text-slate-400' },
}

export function EquipmentLocationBadge({ zone, wall }: EquipmentLocationBadgeProps) {
  if (!zone) return null

  const style = ZONE_STYLES[zone] ?? { dot: 'bg-slate-500', label: 'text-slate-400' }
  const display = wall ?? zone

  return (
    <span className={`inline-flex items-center gap-1 text-[10px] ${style.label}`}>
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${style.dot}`} />
      {display}
    </span>
  )
}
