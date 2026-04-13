import type { EquipmentBooking } from '../../types/scheduling'

const CATEGORY_COLORS: Record<string, string> = {
  fish: 'bg-blue-500',
  meat: 'bg-red-500',
  poultry: 'bg-orange-500',
  dairy: 'bg-yellow-500',
  bakery: 'bg-amber-500',
  vegan: 'bg-green-500',
  neutral: 'bg-zinc-500',
}

interface EquipmentCapacityBarProps {
  bookings: EquipmentBooking[]
  equipmentName: string
  dayStartMs: number
}

export function EquipmentCapacityBar({ bookings, equipmentName, dayStartMs }: EquipmentCapacityBarProps) {
  const dayMs = 24 * 60 * 60_000
  const totalBooked = bookings.reduce((sum, b) => {
    const start = new Date(b.slot_start).getTime()
    const end = new Date(b.slot_end).getTime()
    return sum + (end - start)
  }, 0)
  const utilPct = Math.round((totalBooked / dayMs) * 100)

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs text-zinc-400">
        <span>{equipmentName}</span>
        <span>{utilPct}% utilized</span>
      </div>
      <div className="relative h-3 w-full rounded bg-zinc-800">
        {bookings.map((b) => {
          const startMs = new Date(b.slot_start).getTime()
          const endMs = new Date(b.slot_end).getTime()
          const leftPct = ((startMs - dayStartMs) / dayMs) * 100
          const widthPct = ((endMs - startMs) / dayMs) * 100
          const color = CATEGORY_COLORS[b.product_category ?? 'neutral'] ?? CATEGORY_COLORS.neutral

          return (
            <div
              key={b.id}
              className={`absolute top-0 h-full rounded ${color} opacity-70`}
              style={{ left: `${Math.max(0, leftPct)}%`, width: `${Math.max(0.2, widthPct)}%` }}
              title={`${b.product_category ?? 'neutral'}: ${new Date(b.slot_start).toLocaleTimeString()} - ${new Date(b.slot_end).toLocaleTimeString()}`}
            />
          )
        })}
      </div>
    </div>
  )
}
