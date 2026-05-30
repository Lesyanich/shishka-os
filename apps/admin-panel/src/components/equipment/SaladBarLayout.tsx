import { useState, useRef, useEffect } from 'react'
import { Check, ChevronDown, Loader2, Search, X } from 'lucide-react'
import type { SaladBarSlot, NomenclatureOption } from '../../hooks/useSaladBarLayout'

/* ─── Color map ─── */

const COLOR_MAP: Record<string, string> = {
  base: 'bg-emerald-900/40 text-emerald-300 border-emerald-700/50',
  vegetable: 'bg-orange-900/40 text-orange-300 border-orange-700/50',
  protein: 'bg-red-900/40 text-red-300 border-red-700/50',
  topping: 'bg-yellow-900/40 text-yellow-300 border-yellow-700/50',
  accent: 'bg-violet-900/40 text-violet-300 border-violet-700/50',
}

const EMPTY_COLOR = 'bg-slate-800/60 text-slate-400 border-slate-700/50'

function slotColor(group: string | null): string {
  if (!group) return EMPTY_COLOR
  return COLOR_MAP[group] ?? EMPTY_COLOR
}

/* ─── GN size → flex proportions ─── */

const GN_FLEX: Record<string, number> = {
  '1/1': 6,
  '1/2': 3,
  '1/3': 2,
  '1/6': 1.5,
  '1/9': 1,
}

function gnFlex(size: string): number {
  return GN_FLEX[size] ?? 1
}

/* ─── Ingredient Picker ─── */

function IngredientPicker({
  ingredients,
  currentId,
  onSelect,
  onClose,
}: {
  ingredients: NomenclatureOption[]
  currentId: string | null
  onSelect: (id: string | null) => void
  onClose: () => void
}) {
  const [search, setSearch] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const filtered = search
    ? ingredients.filter(
        (i) =>
          i.name.toLowerCase().includes(search.toLowerCase()) ||
          i.product_code.toLowerCase().includes(search.toLowerCase()),
      )
    : ingredients

  return (
    <div className="absolute left-0 top-full z-50 mt-1 w-72 rounded-lg border border-slate-700 bg-slate-900 shadow-xl">
      <div className="flex items-center gap-2 border-b border-slate-700 px-3 py-2">
        <Search className="h-3.5 w-3.5 text-slate-500" />
        <input
          ref={inputRef}
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search ingredients..."
          className="flex-1 bg-transparent text-xs text-slate-200 outline-none placeholder:text-slate-600"
        />
        <button onClick={onClose} className="text-slate-500 hover:text-slate-300">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="max-h-48 overflow-y-auto">
        {/* Clear option */}
        <button
          onClick={() => onSelect(null)}
          className={[
            'flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition hover:bg-slate-800',
            !currentId ? 'text-emerald-300' : 'text-slate-400',
          ].join(' ')}
        >
          {!currentId && <Check className="h-3 w-3" />}
          <span className={!currentId ? '' : 'ml-5'}>— Empty —</span>
        </button>

        {filtered.slice(0, 50).map((item) => (
          <button
            key={item.id}
            onClick={() => onSelect(item.id)}
            className={[
              'flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition hover:bg-slate-800',
              item.id === currentId ? 'text-emerald-300' : 'text-slate-200',
            ].join(' ')}
          >
            {item.id === currentId && <Check className="h-3 w-3" />}
            <span className={item.id === currentId ? '' : 'ml-5'}>
              <span className="font-mono text-[10px] text-slate-500">{item.product_code}</span>
              {' '}
              {item.name}
            </span>
          </button>
        ))}

        {filtered.length === 0 && (
          <p className="px-3 py-3 text-center text-xs text-slate-600">No matches</p>
        )}
      </div>
    </div>
  )
}

/* ─── Slot Card ─── */

function SlotCard({
  slot,
  ingredients,
  onUpdate,
}: {
  slot: SaladBarSlot
  ingredients: NomenclatureOption[]
  onUpdate: (slotId: string, ingredientId: string | null) => void
}) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Close picker on outside click
  useEffect(() => {
    if (!pickerOpen) return
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setPickerOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [pickerOpen])

  const hasIngredient = !!slot.ingredient_id
  const colorClass = hasIngredient ? slotColor(slot.color_group) : EMPTY_COLOR

  return (
    <div
      ref={containerRef}
      className="relative"
      style={{ flex: gnFlex(slot.gn_size) }}
    >
      <button
        onClick={() => setPickerOpen(!pickerOpen)}
        className={[
          'flex h-full w-full flex-col items-start gap-0.5 rounded-md border p-2 text-left transition-all',
          'hover:brightness-110 hover:ring-1 hover:ring-white/10',
          colorClass,
        ].join(' ')}
      >
        {/* Header: slot code + GN size */}
        <div className="flex w-full items-center justify-between">
          <span className="text-[10px] font-bold opacity-70">{slot.slot_code}</span>
          <span className="rounded bg-black/20 px-1 py-0.5 text-[9px] font-mono">
            GN {slot.gn_size}
          </span>
        </div>

        {/* Ingredient name */}
        <p className="mt-0.5 text-xs font-medium leading-tight">
          {slot.ingredient_name ?? 'Empty'}
        </p>

        {/* Prep method */}
        {slot.prep_method && (
          <p className="mt-auto text-[10px] opacity-60 leading-tight">{slot.prep_method}</p>
        )}

        {/* Expand hint */}
        <ChevronDown className="absolute bottom-1 right-1 h-3 w-3 opacity-30" />
      </button>

      {pickerOpen && (
        <IngredientPicker
          ingredients={ingredients}
          currentId={slot.ingredient_id}
          onSelect={(id) => {
            onUpdate(slot.id, id)
            setPickerOpen(false)
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  )
}

/* ─── Unit Visual ─── */

function UnitVisual({
  title,
  subtitle,
  slots,
  ingredients,
  onUpdate,
}: {
  title: string
  subtitle: string
  slots: SaladBarSlot[]
  ingredients: NomenclatureOption[]
  onUpdate: (slotId: string, ingredientId: string | null) => void
}) {
  const backRow = slots.filter((s) => s.row === 'back').sort((a, b) => a.position - b.position)
  const frontRow = slots.filter((s) => s.row === 'front').sort((a, b) => a.position - b.position)

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
        <p className="text-[10px] text-slate-500">{subtitle}</p>
      </div>

      {/* Work surface indicator */}
      <div className="mb-2 rounded bg-slate-800/50 px-3 py-1.5 text-center text-[10px] text-slate-500 border border-slate-700/30">
        WORK SURFACE (150 x 25 cm)
      </div>

      {/* Front row (shown first — top of salad bar from customer perspective) */}
      <div className="mb-2">
        <p className="mb-1 text-[9px] font-semibold uppercase tracking-wider text-slate-600">
          Front Row · 176mm depth
        </p>
        <div className="flex gap-1.5">
          {frontRow.map((slot) => (
            <SlotCard
              key={slot.id}
              slot={slot}
              ingredients={ingredients}
              onUpdate={onUpdate}
            />
          ))}
        </div>
      </div>

      {/* Back row */}
      <div>
        <p className="mb-1 text-[9px] font-semibold uppercase tracking-wider text-slate-600">
          Back Row · 325mm depth
        </p>
        <div className="flex gap-1.5">
          {backRow.map((slot) => (
            <SlotCard
              key={slot.id}
              slot={slot}
              ingredients={ingredients}
              onUpdate={onUpdate}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

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
  { name: 'Tabbouleh', base: '—', vegetables: 'B7, A3, B6', proteins: '—', toppings: 'A4, B3, B8', dressing: 'Sumac' },
  { name: 'Fattoush', base: 'A1 Crispy', vegetables: 'A3, A4, B1, B5, B6, B7', proteins: '—', toppings: '+ Crackers', dressing: 'Sumac' },
  { name: 'Beetroot Walnut', base: '—', vegetables: '—', proteins: 'A5 beet', toppings: 'B6 walnuts', dressing: 'Mayo' },
  { name: 'Smoked Salmon', base: 'A2 Superfood', vegetables: 'A3, B6', proteins: 'A2 trout, A3 eggs', toppings: '+ Avocado, Dill', dressing: 'Olive-Lemon' },
  { name: 'Chicken Mexican', base: 'A1 Crispy', vegetables: 'A3, B1, B2, B3, B4, B6, B7', proteins: 'A1 chicken', toppings: 'B1 beans', dressing: 'Olive-Lemon' },
  { name: 'Chicken Power', base: 'A2 Superfood', vegetables: 'A3, B1, B2, B4', proteins: 'A1 chicken, A3, A4', toppings: 'B2, B7, B8, B9', dressing: 'Tahini' },
  { name: 'Caesar', base: 'A2 Superfood', vegetables: 'A3', proteins: 'A1 chicken', toppings: 'B5 parmesan', dressing: 'Tahini' },
  { name: 'Greek', base: 'A1 Crispy', vegetables: 'A3, A4, B1, B6', proteins: '—', toppings: 'B4 feta', dressing: 'Olive-Lemon' },
  { name: 'Kale Avocado', base: 'A2 Superfood', vegetables: 'A3, B2', proteins: '—', toppings: 'A4 quinoa, + Avocado', dressing: 'Olive-Lemon' },
  { name: 'Shrimp', base: 'A1 Crispy', vegetables: 'A3, A4, B2, B6', proteins: '+ Shrimp', toppings: '—', dressing: 'Olive-Lemon' },
  { name: 'Harvest Root', base: 'A2 Superfood', vegetables: '—', proteins: 'A5 beet', toppings: 'B4 feta, B6 walnuts', dressing: 'Tahini' },
  { name: 'Thai Noodles', base: 'A1 Crispy', vegetables: 'B3, B4, B1, B6', proteins: 'A1 chicken', toppings: '+ Cashew, Sesame', dressing: 'Cashew Sauce' },
]

function CheatSheet() {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
      <h3 className="mb-3 text-sm font-semibold text-slate-100">Assembly Cheat Sheet</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-800 text-left text-[10px] uppercase tracking-wider text-slate-500">
              <th className="pb-2 pr-3 font-semibold">Salad</th>
              <th className="pb-2 pr-3 font-semibold">Base (U1)</th>
              <th className="pb-2 pr-3 font-semibold">Vegetables (U1)</th>
              <th className="pb-2 pr-3 font-semibold">Proteins (U2)</th>
              <th className="pb-2 pr-3 font-semibold">Toppings (U2)</th>
              <th className="pb-2 font-semibold">Dressing</th>
            </tr>
          </thead>
          <tbody>
            {SALAD_RECIPES.map((r) => (
              <tr key={r.name} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                <td className="py-2 pr-3 font-medium text-slate-200 whitespace-nowrap">{r.name}</td>
                <td className="py-2 pr-3 text-slate-400">{r.base}</td>
                <td className="py-2 pr-3 text-slate-400">{r.vegetables}</td>
                <td className="py-2 pr-3 text-slate-400">{r.proteins}</td>
                <td className="py-2 pr-3 text-slate-400">{r.toppings}</td>
                <td className="py-2 text-slate-400 whitespace-nowrap">{r.dressing}</td>
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
}: {
  unit1Slots: SaladBarSlot[]
  unit2Slots: SaladBarSlot[]
  ingredients: NomenclatureOption[]
  isLoading: boolean
  error: string | null
  onUpdateSlot: (slotId: string, ingredientId: string | null) => void
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
        <p className="mt-1 text-xs text-slate-600">Run migration 218 to seed slot data</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <ColorLegend />

      <div className="grid gap-5 xl:grid-cols-2">
        <UnitVisual
          title="Unit 1 — Bases + Vegetables"
          subtitle="Assembly start · 150 x 80 cm"
          slots={unit1Slots}
          ingredients={ingredients}
          onUpdate={onUpdateSlot}
        />
        <UnitVisual
          title="Unit 2 — Proteins + Toppings"
          subtitle="Accents + dressings · 150 x 80 cm"
          slots={unit2Slots}
          ingredients={ingredients}
          onUpdate={onUpdateSlot}
        />
      </div>

      <CheatSheet />
    </div>
  )
}
