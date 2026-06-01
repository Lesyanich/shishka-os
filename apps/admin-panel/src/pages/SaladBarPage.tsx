import { Grid3X3, CheckCircle2, CircleDashed } from 'lucide-react'
import { useSaladBarLayout } from '../hooks/useSaladBarLayout'
import { SaladBarLayout } from '../components/equipment/SaladBarLayout'

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: typeof Grid3X3
  label: string
  value: number | string
  color: string
}) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/50 px-4 py-3">
      <div className="flex items-center gap-2">
        <Icon className={`h-4 w-4 ${color}`} />
        <span className="text-[10px] uppercase tracking-wide text-slate-500">{label}</span>
      </div>
      <p className="mt-1 text-lg font-semibold tabular-nums text-slate-100">{value}</p>
    </div>
  )
}

export function SaladBarPage() {
  const {
    unit1Slots,
    unit2Slots,
    ingredients,
    isLoading,
    error,
    updateSlot,
    moveSlot,
    addSlot,
    removeSlot,
    resetToFactory,
  } = useSaladBarLayout()

  const totalSlots = unit1Slots.length + unit2Slots.length
  const assignedSlots = [...unit1Slots, ...unit2Slots].filter((s) => s.ingredient_id).length
  const emptySlots = totalSlots - assignedSlots

  const handleUpdateSlot = async (slotId: string, ingredientId: string | null) => {
    await updateSlot(slotId, { ingredient_id: ingredientId })
  }

  const handleResetUnit = (unitNumber: 1 | 2) => {
    if (window.confirm(`Reset Unit ${unitNumber} to the factory layout? Current arrangement will be replaced.`)) {
      resetToFactory(unitNumber)
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-bold text-slate-100">Salad Bar Layout</h1>
        <p className="text-xs text-slate-500">
          Перетаскивай ячейки, чтобы разложить как удобно · клик по ячейке — назначить ингредиент · 2 units
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <StatCard
          icon={Grid3X3}
          label="Total Slots"
          value={totalSlots}
          color="text-emerald-400"
        />
        <StatCard
          icon={CheckCircle2}
          label="Assigned"
          value={assignedSlots}
          color="text-sky-400"
        />
        <StatCard
          icon={CircleDashed}
          label="Empty"
          value={emptySlots}
          color={emptySlots > 0 ? 'text-amber-400' : 'text-slate-500'}
        />
      </div>

      <SaladBarLayout
        unit1Slots={unit1Slots}
        unit2Slots={unit2Slots}
        ingredients={ingredients}
        isLoading={isLoading}
        error={error}
        onUpdateSlot={handleUpdateSlot}
        onMoveSlot={moveSlot}
        onAddSlot={(unitNumber, gnSize, col, row) => addSlot({ unitNumber, gnSize, gridCol: col, gridRow: row })}
        onRemoveSlot={removeSlot}
        onResetUnit={handleResetUnit}
      />
    </div>
  )
}
