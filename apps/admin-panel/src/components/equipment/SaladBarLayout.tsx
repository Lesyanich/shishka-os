import { useState, useRef, useEffect } from 'react'
import { Check, Loader2, Search, X } from 'lucide-react'
import type { SaladBarSlot, NomenclatureOption } from '../../hooks/useSaladBarLayout'

/* ─── Color map ─── */

const COLOR_MAP: Record<string, string> = {
  base: 'bg-emerald-900/50 text-emerald-200 border-emerald-600/40',
  vegetable: 'bg-orange-900/50 text-orange-200 border-orange-600/40',
  protein: 'bg-red-900/50 text-red-200 border-red-600/40',
  topping: 'bg-yellow-900/50 text-yellow-200 border-yellow-600/40',
  accent: 'bg-violet-900/50 text-violet-200 border-violet-600/40',
}

const EMPTY_COLOR = 'bg-slate-800/60 text-slate-400 border-slate-700/40'

function slotColor(group: string | null): string {
  if (!group) return EMPTY_COLOR
  return COLOR_MAP[group] ?? EMPTY_COLOR
}

/* ─── GN real dimensions (mm) ─── */
// Well depth = 530mm (one GN 1/1 lengthwise front→back)
// GN 1/1 spans FULL depth (530mm), width along bar = 325mm
const GN_WIDTH_MM: Record<string, number> = {
  '1/1': 325,
  '1/2': 265,
  '1/3': 176,
  '1/6': 162,
  '1/9': 108,
}

const GN_FULL_DEPTH_SIZES = new Set(['1/1'])

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
  cellNumber,
}: {
  slot: SaladBarSlot
  ingredients: NomenclatureOption[]
  onUpdate: (slotId: string, ingredientId: string | null) => void
  cellNumber: number
}) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

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
  const label = slot.display_name ?? slot.ingredient_name ?? 'Empty'

  return (
    <div ref={containerRef} className="relative h-full min-w-0">
      <button
        onClick={() => setPickerOpen(!pickerOpen)}
        className={[
          'flex h-full w-full flex-col overflow-hidden rounded border p-1.5 text-left transition-all',
          'hover:brightness-125 hover:ring-1 hover:ring-white/20',
          colorClass,
        ].join(' ')}
      >
        {/* Header row */}
        <div className="flex w-full items-center gap-1 min-w-0">
          <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-white/20 text-[8px] font-bold leading-none">
            {cellNumber}
          </span>
          <span className="truncate text-[9px] font-semibold opacity-60">{slot.slot_code}</span>
          <span className="ml-auto shrink-0 text-[8px] font-mono opacity-50">
            {slot.gn_size}
          </span>
        </div>

        {/* Name */}
        <p className="mt-0.5 w-full truncate text-[11px] font-semibold leading-tight">{label}</p>

        {/* Prep — only if enough space (back row / full-depth) */}
        {slot.prep_method && (
          <p className="mt-auto w-full truncate text-[8px] opacity-50 leading-tight">
            {slot.prep_method}
          </p>
        )}
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

/* ─── Slot Row ─── */

function SlotRow({
  slots,
  ingredients,
  onUpdate,
  numbering,
  height,
}: {
  slots: SaladBarSlot[]
  ingredients: NomenclatureOption[]
  onUpdate: (slotId: string, ingredientId: string | null) => void
  numbering: Map<string, number>
  height: number
}) {
  // Total mm for this row
  const totalMm = slots.reduce((s, sl) => s + (GN_WIDTH_MM[sl.gn_size] ?? 108), 0)

  return (
    <div className="flex gap-0.5" style={{ height: `${height}px` }}>
      {slots.map((slot) => {
        const widthMm = GN_WIDTH_MM[slot.gn_size] ?? 108
        return (
          <div
            key={slot.id}
            className="min-w-0"
            style={{ flex: `${widthMm} ${widthMm} 0%` }}
          >
            <SlotCard
              slot={slot}
              ingredients={ingredients}
              onUpdate={onUpdate}
              cellNumber={numbering.get(slot.id) ?? 0}
            />
          </div>
        )
      })}
      {/* Show unused space as dashed placeholder if row is short */}
      {totalMm < 1100 && (
        <div
          className="rounded border border-dashed border-slate-700/30 flex items-center justify-center"
          style={{ flex: `${1134 - totalMm} 0 0%`, opacity: 0.3 }}
        >
          <span className="text-[8px] text-slate-600">{1134 - totalMm}mm</span>
        </div>
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
  const fullDepthSlots = slots
    .filter((s) => GN_FULL_DEPTH_SIZES.has(s.gn_size))
    .sort((a, b) => a.position - b.position)
  const backRow = slots
    .filter((s) => s.row === 'back' && !GN_FULL_DEPTH_SIZES.has(s.gn_size))
    .sort((a, b) => a.position - b.position)
  const frontRow = slots
    .filter((s) => s.row === 'front')
    .sort((a, b) => a.position - b.position)

  // Sequential numbering: back (incl full-depth) L→R, then front L→R
  const numbering = new Map<string, number>()
  let n = 1
  for (const s of [...fullDepthSlots, ...backRow]) numbering.set(s.id, n++)
  for (const s of frontRow) numbering.set(s.id, n++)

  const fullDepthTotalMm = fullDepthSlots.reduce((s, sl) => s + (GN_WIDTH_MM[sl.gn_size] ?? 108), 0)
  const frontTotalMm = frontRow.reduce((s, sl) => s + (GN_WIDTH_MM[sl.gn_size] ?? 108), 0)
  const barTotalMm = fullDepthTotalMm + frontTotalMm

  const FRONT_H = 56
  const BACK_H = 100

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-3">
      {/* Header */}
      <div className="mb-2 flex items-baseline justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
          <p className="text-[10px] text-slate-500">{subtitle}</p>
        </div>
        <span className="text-[9px] font-mono text-slate-600">~{barTotalMm}mm</span>
      </div>

      {/* Work surface */}
      <div className="mb-1.5 rounded bg-slate-800/40 px-2 py-1 text-center text-[9px] text-slate-600 border border-slate-700/20">
        WORK SURFACE · 150 × 25 cm
      </div>

      {/* Layout */}
      <div className="flex gap-0.5">
        {/* Full-depth column (GN 1/1) */}
        {fullDepthSlots.length > 0 && (
          <div
            className="flex flex-col gap-0.5 shrink-0"
            style={{ flex: `${fullDepthTotalMm} 0 0%` }}
          >
            {fullDepthSlots.map((slot) => (
              <div key={slot.id} style={{ height: `${FRONT_H + BACK_H + 2}px` }}>
                <SlotCard
                  slot={slot}
                  ingredients={ingredients}
                  onUpdate={onUpdate}
                  cellNumber={numbering.get(slot.id) ?? 0}
                />
              </div>
            ))}
          </div>
        )}

        {/* Front + Back rows stacked */}
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <SlotRow
            slots={frontRow}
            ingredients={ingredients}
            onUpdate={onUpdate}
            numbering={numbering}
            height={FRONT_H}
          />
          <SlotRow
            slots={backRow}
            ingredients={ingredients}
            onUpdate={onUpdate}
            numbering={numbering}
            height={BACK_H}
          />
        </div>
      </div>

      {/* Dimension labels */}
      <div className="mt-1 flex items-center gap-2 text-[8px] text-slate-600">
        {fullDepthTotalMm > 0 && <span>Full depth 530mm</span>}
        <span>Front {frontRow.length} slots · 176mm</span>
        <span className="opacity-50">|</span>
        <span>Back {backRow.length + fullDepthSlots.length} slots · 325mm</span>
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
    <div className="space-y-4">
      <ColorLegend />

      <UnitVisual
        title="Unit 1 — Bases + Vegetables"
        subtitle="Assembly start · 150 × 80 cm"
        slots={unit1Slots}
        ingredients={ingredients}
        onUpdate={onUpdateSlot}
      />
      <UnitVisual
        title="Unit 2 — Proteins + Toppings"
        subtitle="Accents + dressings · 150 × 80 cm"
        slots={unit2Slots}
        ingredients={ingredients}
        onUpdate={onUpdateSlot}
      />

      <CheatSheet />
    </div>
  )
}
