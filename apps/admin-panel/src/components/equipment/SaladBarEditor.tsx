import { useEffect, useRef, useState } from 'react'
import { Check, RotateCcw, Search, X } from 'lucide-react'
import type { SaladBarSlot, NomenclatureOption } from '../../hooks/useSaladBarLayout'
import {
  GRID_COLS,
  GRID_ROWS,
  GN_DIMS,
  GN_MM,
  HOLE_W_MM,
  HOLE_H_MM,
  PAN_TYPES,
  buildOccupancy,
  canPlace,
  dimsOf,
  type GnSize,
} from './saladBarGrid'

/* ─── Colors ─── */

export const COLOR_MAP: Record<string, string> = {
  base: 'bg-emerald-900/50 text-emerald-100 border-emerald-500/50',
  vegetable: 'bg-orange-900/50 text-orange-100 border-orange-500/50',
  protein: 'bg-red-900/50 text-red-100 border-red-500/50',
  topping: 'bg-yellow-900/50 text-yellow-100 border-yellow-500/50',
  accent: 'bg-violet-900/50 text-violet-100 border-violet-500/50',
}
const EMPTY_COLOR = 'bg-slate-800/70 text-slate-400 border-slate-600/40'

function slotColor(group: string | null, hasContent: boolean): string {
  if (!hasContent) return EMPTY_COLOR
  return (group && COLOR_MAP[group]) || 'bg-slate-700/70 text-slate-200 border-slate-500/50'
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
    <div className="absolute left-0 top-full z-50 mt-1 w-64 rounded-lg border border-slate-700 bg-slate-900 shadow-xl">
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
              <span className="font-mono text-[10px] text-slate-500">{item.product_code}</span> {item.name}
            </span>
          </button>
        ))}
        {filtered.length === 0 && <p className="px-3 py-3 text-center text-xs text-slate-600">No matches</p>}
      </div>
    </div>
  )
}

/* ─── Pan face (content shown inside a placed cell or ghost) ─── */

function PanFace({ slot, dragging }: { slot: SaladBarSlot; dragging?: boolean }) {
  const hasContent = !!slot.ingredient_id || !!slot.display_name
  const label = slot.display_name ?? slot.ingredient_name ?? 'Empty'
  const tall = GN_DIMS[(slot.gn_size as GnSize)]?.h >= 6
  return (
    <div
      className={[
        'flex h-full w-full flex-col overflow-hidden rounded-md border p-1.5 text-left',
        slotColor(slot.color_group, hasContent),
        dragging ? 'opacity-90 shadow-2xl ring-2 ring-white/40' : '',
      ].join(' ')}
    >
      <div className="flex w-full items-center gap-1">
        <span className="truncate text-[8px] font-semibold opacity-50">{slot.slot_code}</span>
        <span className="ml-auto shrink-0 rounded bg-black/20 px-1 text-[8px] font-mono opacity-70">{slot.gn_size}</span>
      </div>
      <p className="mt-0.5 w-full truncate text-[11px] font-semibold leading-tight">{label}</p>
      {tall && slot.prep_method && (
        <p className="mt-auto w-full truncate text-[8px] opacity-50 leading-tight">{slot.prep_method}</p>
      )}
    </div>
  )
}

/* ─── Drag state ─── */

type DragState = {
  kind: 'move' | 'new'
  slotId?: string
  gnSize: GnSize
  w: number
  h: number
  grabDX: number
  grabDY: number
  pointerX: number
  pointerY: number
  cellW: number
  cellH: number
  moved: boolean
  startX: number
  startY: number
  target: { col: number; row: number; valid: boolean } | null
}

const MOVE_THRESHOLD = 4 // px before a press becomes a drag (vs a click)

/* ─── Editor Unit ─── */

export function SaladBarEditorUnit({
  title,
  subtitle,
  slots,
  ingredients,
  onMove,
  onAdd,
  onRemove,
  onAssign,
  onReset,
}: {
  title: string
  subtitle: string
  slots: SaladBarSlot[]
  ingredients: NomenclatureOption[]
  onMove: (slotId: string, col: number, row: number) => Promise<{ ok: boolean; error?: string }>
  onAdd: (gnSize: GnSize, col: number, row: number) => Promise<{ ok: boolean; error?: string }>
  onRemove: (slotId: string) => Promise<{ ok: boolean; error?: string }>
  onAssign: (slotId: string, ingredientId: string | null) => void
  onReset: () => void
}) {
  const boardRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<DragState | null>(null)
  const [pickerSlotId, setPickerSlotId] = useState<string | null>(null)
  // Local mirror so moves feel instant and prop refetches don't fight an active drag.
  const [localSlots, setLocalSlots] = useState<SaladBarSlot[]>(slots)
  useEffect(() => {
    if (!drag) setLocalSlots(slots)
  }, [slots, drag])

  const filled = localSlots.filter((s) => s.ingredient_id || s.display_name).length

  /* Compute the snapped target (col,row,valid) for the current pointer position. */
  function computeTarget(d: DragState, clientX: number, clientY: number) {
    const board = boardRef.current
    if (!board) return null
    const rect = board.getBoundingClientRect()
    const cellW = rect.width / GRID_COLS
    const cellH = rect.height / GRID_ROWS
    const topLeftX = clientX - d.grabDX - rect.left
    const topLeftY = clientY - d.grabDY - rect.top
    let col = Math.round(topLeftX / cellW)
    let row = Math.round(topLeftY / cellH)
    col = Math.max(0, Math.min(col, GRID_COLS - d.w))
    row = Math.max(0, Math.min(row, GRID_ROWS - d.h))
    const occ = buildOccupancy(localSlots, d.slotId)
    return { col, row, valid: canPlace(occ, col, row, d.w, d.h) }
  }

  function cellSizes() {
    const rect = boardRef.current?.getBoundingClientRect()
    return {
      cellW: rect ? rect.width / GRID_COLS : 40,
      cellH: rect ? rect.height / GRID_ROWS : 40,
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!drag) return
    e.preventDefault()
    const moved =
      drag.moved || Math.abs(e.clientX - drag.startX) > MOVE_THRESHOLD || Math.abs(e.clientY - drag.startY) > MOVE_THRESHOLD
    const target = computeTarget(drag, e.clientX, e.clientY)
    setDrag({ ...drag, pointerX: e.clientX, pointerY: e.clientY, moved, target, ...cellSizes() })
  }

  async function onPointerUp(e: React.PointerEvent) {
    if (!drag) return
    try {
      ;(e.target as Element).releasePointerCapture?.(e.pointerId)
    } catch {
      /* ignore */
    }
    const d = drag
    setDrag(null)

    // A press with (almost) no movement on an existing pan = click → open picker.
    if (d.kind === 'move' && !d.moved && d.slotId) {
      setPickerSlotId(d.slotId)
      return
    }
    if (!d.target || !d.target.valid) return // rejected drop

    if (d.kind === 'move' && d.slotId) {
      const { col, row } = d.target
      setLocalSlots((prev) =>
        prev.map((s) => (s.id === d.slotId ? { ...s, grid_col: col, grid_row: row } : s)),
      )
      const res = await onMove(d.slotId, col, row)
      if (!res.ok) setLocalSlots(slots) // revert
    } else if (d.kind === 'new') {
      await onAdd(d.gnSize, d.target.col, d.target.row)
    }
  }

  function startMove(e: React.PointerEvent, slot: SaladBarSlot) {
    if (pickerSlotId) return
    e.preventDefault()
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const { w, h } = dimsOf(slot.gn_size)
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    setDrag({
      kind: 'move',
      slotId: slot.id,
      gnSize: slot.gn_size as GnSize,
      w,
      h,
      grabDX: e.clientX - rect.left,
      grabDY: e.clientY - rect.top,
      pointerX: e.clientX,
      pointerY: e.clientY,
      ...cellSizes(),
      moved: false,
      startX: e.clientX,
      startY: e.clientY,
      target: null,
    })
  }

  function startNew(e: React.PointerEvent, gnSize: GnSize) {
    e.preventDefault()
    const { w, h } = GN_DIMS[gnSize]
    const { cellW, cellH } = cellSizes()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    setDrag({
      kind: 'new',
      gnSize,
      w,
      h,
      grabDX: (w * cellW) / 2,
      grabDY: (h * cellH) / 2,
      pointerX: e.clientX,
      pointerY: e.clientY,
      cellW,
      cellH,
      moved: true,
      startX: e.clientX,
      startY: e.clientY,
      target: null,
    })
  }

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-3">
      {/* Header */}
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
          <p className="text-[10px] text-slate-500">{subtitle}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[9px] font-mono text-slate-600">
            {HOLE_W_MM} × {HOLE_H_MM} mm · {filled}/{localSlots.length} filled
          </span>
          <button
            onClick={onReset}
            className="flex items-center gap-1 rounded border border-slate-700 px-2 py-1 text-[10px] text-slate-400 transition hover:bg-slate-800 hover:text-slate-200"
            title="Restore the factory layout for this unit"
          >
            <RotateCcw className="h-3 w-3" /> Reset
          </button>
        </div>
      </div>

      {/* Palette */}
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <span className="text-[9px] uppercase tracking-wide text-slate-500">Drag in:</span>
        {PAN_TYPES.map((gn) => {
          const d = GN_DIMS[gn]
          return (
            <button
              key={gn}
              onPointerDown={(e) => startNew(e, gn)}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              style={{ touchAction: 'none', width: d.w * 10, height: d.h * 5 + 14 }}
              className="flex cursor-grab flex-col items-center justify-center rounded border border-slate-600 bg-slate-800/80 text-[9px] font-mono text-slate-300 transition hover:border-slate-400 hover:bg-slate-700 active:cursor-grabbing"
              title={`GN ${gn} — ${GN_MM[gn]} mm`}
            >
              {gn}
            </button>
          )
        })}
        <span className="ml-1 text-[8px] text-slate-600">1/2 &amp; 1/4 leave gaps (don&apos;t tile the 176mm grid)</span>
      </div>

      {/* Board */}
      <div
        ref={boardRef}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        className="relative mx-auto grid w-full select-none"
        style={{
          maxWidth: 1040,
          aspectRatio: `${HOLE_W_MM} / ${HOLE_H_MM}`,
          gridTemplateColumns: `repeat(${GRID_COLS}, 1fr)`,
          gridTemplateRows: `repeat(${GRID_ROWS}, 1fr)`,
          touchAction: 'none',
        }}
      >
        {/* lattice background */}
        {Array.from({ length: GRID_COLS * GRID_ROWS }).map((_, i) => (
          <div key={i} className="border border-slate-800/40" />
        ))}

        {/* placed pans */}
        {localSlots.map((slot) => {
          const { w, h } = dimsOf(slot.gn_size)
          const isDragging = drag?.kind === 'move' && drag.slotId === slot.id && drag.moved
          return (
            <div
              key={slot.id}
              className="group relative z-10 p-px"
              style={{
                gridColumn: `${slot.grid_col + 1} / span ${w}`,
                gridRow: `${slot.grid_row + 1} / span ${h}`,
                touchAction: 'none',
                opacity: isDragging ? 0.3 : 1,
                cursor: 'grab',
              }}
              onPointerDown={(e) => startMove(e, slot)}
            >
              <PanFace slot={slot} />
              {/* delete */}
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation()
                  onRemove(slot.id)
                }}
                className="absolute -right-1 -top-1 z-20 hidden h-4 w-4 items-center justify-center rounded-full border border-slate-600 bg-slate-900 text-slate-400 hover:text-red-300 group-hover:flex"
                title="Remove pan"
              >
                <X className="h-2.5 w-2.5" />
              </button>
              {/* ingredient picker */}
              {pickerSlotId === slot.id && (
                <IngredientPicker
                  ingredients={ingredients}
                  currentId={slot.ingredient_id}
                  onSelect={(id) => {
                    onAssign(slot.id, id)
                    setPickerSlotId(null)
                  }}
                  onClose={() => setPickerSlotId(null)}
                />
              )}
            </div>
          )
        })}

        {/* snap preview */}
        {drag?.target && drag.moved && (
          <div
            className={[
              'pointer-events-none absolute z-30 rounded-md border-2',
              drag.target.valid ? 'border-emerald-400 bg-emerald-400/15' : 'border-red-500 bg-red-500/15',
            ].join(' ')}
            style={{
              left: `${(drag.target.col / GRID_COLS) * 100}%`,
              top: `${(drag.target.row / GRID_ROWS) * 100}%`,
              width: `${(drag.w / GRID_COLS) * 100}%`,
              height: `${(drag.h / GRID_ROWS) * 100}%`,
            }}
          />
        )}
      </div>

      {/* floating ghost */}
      {drag?.moved && drag.cellW > 0 && (
        <div
          className="pointer-events-none fixed z-[60] rounded-md border-2 border-white/50 bg-slate-700/80 text-[9px] font-mono text-slate-100 shadow-2xl"
          style={{
            left: drag.pointerX - drag.grabDX,
            top: drag.pointerY - drag.grabDY,
            width: drag.w * drag.cellW,
            height: drag.h * drag.cellH,
          }}
        >
          <div className="flex h-full w-full items-center justify-center">{drag.gnSize}</div>
        </div>
      )}

      {/* row legend */}
      <div className="mt-1.5 flex items-center justify-between text-[8px] text-slate-600">
        <span>← guest side · drag to arrange · click a pan to assign ingredient</span>
        <span>back ↑ · front ↓</span>
      </div>
    </div>
  )
}
