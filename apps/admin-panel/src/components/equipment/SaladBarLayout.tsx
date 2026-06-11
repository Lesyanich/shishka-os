import { Loader2 } from 'lucide-react'
import type { SaladBarSlot, NomenclatureOption } from '../../hooks/useSaladBarLayout'
import { SaladBarEditorUnit } from './SaladBarEditor'
import type { GnSize } from './saladBarGrid'

type MutResult = { ok: boolean; error?: string }

/* ─── Color Legend ─── */

function ColorLegend() {
  const items = [
    { label: 'Bases', color: 'bg-emerald-400' },
    { label: 'Vegetables', color: 'bg-orange-400' },
    { label: 'Proteins', color: 'bg-red-400' },
    { label: 'Toppings', color: 'bg-yellow-400' },
    { label: 'Accents', color: 'bg-violet-400' },
    { label: 'Empty', color: 'bg-slate-500' },
  ]

  return (
    <div className="flex flex-wrap gap-3">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-1.5">
          <span className={`h-2.5 w-2.5 rounded-sm ${item.color}`} />
          <span className="text-[10px] text-slate-400">{item.label}</span>
        </div>
      ))}
    </div>
  )
}

/* ─── Assembly Cheat Sheet ─── */

interface SaladRecipe {
  name: string
  base: string
  vegetables: string
  proteins: string
  toppings: string
  dressing: string
}

const SALAD_RECIPES: SaladRecipe[] = [
  { name: 'Tabbouleh', base: '—', vegetables: 'Parsley, Tomato, Onion', proteins: '—', toppings: 'Cucumber, Cabbage', dressing: 'Sumac' },
  { name: 'Fattoush', base: 'Crispy', vegetables: 'Tomato, Cucumber, Pepper, Radish', proteins: '—', toppings: '+ Crackers', dressing: 'Sumac' },
  { name: 'Beetroot Walnut', base: '—', vegetables: '—', proteins: 'Beetroot', toppings: 'Walnuts', dressing: 'Mayo' },
  { name: 'Smoked Salmon', base: 'Superfood', vegetables: 'Tomato, Onion', proteins: 'Trout, Eggs', toppings: '+ Avocado, Dill', dressing: 'Olive-Lemon' },
  { name: 'Chicken Mexican', base: 'Crispy', vegetables: 'Tomato, Pepper, Corn, Cabbage', proteins: 'Chicken', toppings: 'Beans', dressing: 'Olive-Lemon' },
  { name: 'Chicken Power', base: 'Superfood', vegetables: 'Tomato, Beans, Edamame', proteins: 'Chicken, Eggs', toppings: 'Seeds, Almond', dressing: 'Tahini' },
  { name: 'Caesar', base: 'Superfood', vegetables: 'Tomato', proteins: 'Chicken', toppings: 'Parmesan', dressing: 'Tahini' },
  { name: 'Greek', base: 'Crispy', vegetables: 'Tomato, Cucumber, Pepper, Onion', proteins: '—', toppings: 'Feta', dressing: 'Olive-Lemon' },
  { name: 'Kale Avocado', base: 'Superfood', vegetables: 'Tomato, Corn', proteins: '—', toppings: 'Quinoa, + Avocado', dressing: 'Olive-Lemon' },
  { name: 'Shrimp', base: 'Crispy', vegetables: 'Tomato, Cucumber, Onion', proteins: '+ Shrimp', toppings: '—', dressing: 'Olive-Lemon' },
  { name: 'Harvest Root', base: 'Superfood', vegetables: '—', proteins: 'Beetroot', toppings: 'Feta, Walnuts', dressing: 'Tahini' },
  { name: 'Thai Noodles', base: 'Crispy', vegetables: 'Cabbage, Carrot, Pepper', proteins: 'Chicken', toppings: '+ Cashew, Sesame', dressing: 'Cashew Sauce' },
]

function CheatSheet() {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-3">
      <h3 className="mb-2 text-sm font-semibold text-slate-100">Assembly Cheat Sheet</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="border-b border-slate-800 text-left text-[9px] uppercase tracking-wider text-slate-500">
              <th className="pb-1.5 pr-3 font-semibold">Salad</th>
              <th className="pb-1.5 pr-3 font-semibold">Base</th>
              <th className="pb-1.5 pr-3 font-semibold">Vegetables</th>
              <th className="pb-1.5 pr-3 font-semibold">Proteins</th>
              <th className="pb-1.5 pr-3 font-semibold">Toppings</th>
              <th className="pb-1.5 font-semibold">Dressing</th>
            </tr>
          </thead>
          <tbody>
            {SALAD_RECIPES.map((r) => (
              <tr key={r.name} className="border-b border-slate-800/30 hover:bg-slate-800/20">
                <td className="py-1.5 pr-3 font-medium text-slate-200 whitespace-nowrap">{r.name}</td>
                <td className="py-1.5 pr-3 text-slate-400">{r.base}</td>
                <td className="py-1.5 pr-3 text-slate-400">{r.vegetables}</td>
                <td className="py-1.5 pr-3 text-slate-400">{r.proteins}</td>
                <td className="py-1.5 pr-3 text-slate-400">{r.toppings}</td>
                <td className="py-1.5 text-slate-400 whitespace-nowrap">{r.dressing}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ─── Main Export ─── */

export function SaladBarLayout({
  unit1Slots,
  unit2Slots,
  ingredients,
  isLoading,
  error,
  onUpdateSlot,
  onMoveSlot,
  onAddSlot,
  onRemoveSlot,
  onResetUnit,
}: {
  unit1Slots: SaladBarSlot[]
  unit2Slots: SaladBarSlot[]
  ingredients: NomenclatureOption[]
  isLoading: boolean
  error: string | null
  onUpdateSlot: (slotId: string, ingredientId: string | null) => void
  onMoveSlot: (slotId: string, xMm: number, yMm: number, rotation: number) => Promise<MutResult>
  onAddSlot: (unitNumber: 1 | 2, gnSize: GnSize, xMm: number, yMm: number, rotation: number) => Promise<MutResult>
  onRemoveSlot: (slotId: string) => Promise<MutResult>
  onResetUnit: (unitNumber: 1 | 2) => void
}) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-emerald-500" />
        <span className="ml-2 text-xs text-slate-500">Loading layout...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-900/50 bg-red-950/30 p-6 text-center">
        <p className="text-sm text-red-400">Failed to load salad bar layout</p>
        <p className="mt-1 text-xs text-red-500/70">{error}</p>
      </div>
    )
  }

  if (unit1Slots.length === 0 && unit2Slots.length === 0) {
    return (
      <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-6 text-center">
        <p className="text-sm text-slate-400">No salad bar slots configured</p>
        <p className="mt-1 text-xs text-slate-600">Use “Reset” to load the factory layout</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <ColorLegend />

      <SaladBarEditorUnit
        title="Unit 1 — Bases + Vegetables"
        subtitle="Assembly start · 150 × 80 cm"
        slots={unit1Slots}
        ingredients={ingredients}
        onMove={onMoveSlot}
        onAdd={(gn, x, y, rot) => onAddSlot(1, gn, x, y, rot)}
        onRemove={onRemoveSlot}
        onAssign={onUpdateSlot}
        onReset={() => onResetUnit(1)}
      />
      <SaladBarEditorUnit
        title="Unit 2 — Proteins + Toppings"
        subtitle="Accents + dressings · 150 × 80 cm"
        slots={unit2Slots}
        ingredients={ingredients}
        onMove={onMoveSlot}
        onAdd={(gn, x, y, rot) => onAddSlot(2, gn, x, y, rot)}
        onRemove={onRemoveSlot}
        onAssign={onUpdateSlot}
        onReset={() => onResetUnit(2)}
      />

      <CheatSheet />
    </div>
  )
}
