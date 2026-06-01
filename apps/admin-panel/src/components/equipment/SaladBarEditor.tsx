import { useEffect, useRef, useState } from 'react'
import { Check, RotateCcw, RotateCw, Search, X } from 'lucide-react'
import type { SaladBarSlot, NomenclatureOption } from '../../hooks/useSaladBarLayout'
import {
  GN_REAL,
  GN_MM,
  HOLE_W_MM,
  HOLE_H_MM,
  PAN_TYPES,
  canPlaceFree,
  footprintMM,
  snapX,
  snapY,
  type FreePan,
  type GnSize,
} from './saladBarGrid'

/* ─── Colors ─── */

export const COLOR_MAP: Record<string, string> = {
  base: 'bg-emerald-900/60 text-emerald-100 border-emerald-500/50',
  vegetable: 'bg-orange-900/60 text-orange-100 border-orange-500/50',
  protein: 'bg-red-900/60 text-red-100 border-red-500/50',
  topping: 'bg-yellow-900/60 text-yellow-100 border-yellow-500/50',
  accent: 'bg-violet-900/60 text-violet-100 border-violet-500/50',
}
const EMPTY_COLOR = 'bg-slate-800/80 text-slate-400 border-slate-600/50'

function slotColor(group: string | null, hasContent: boolean): string {
  if (!hasContent) return EMPTY_COLOR
  return (group && COLOR_MAP[group]) || 'bg-slate-700/80 text-slate-200 border-slate-500/50'
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

/* ─── Pan face ─── */

function PanFace({ slot }: { slot: SaladBarSlot }) {
  const hasContent = !!slot.ingredient_id || !!slot.display_name
  const label = slot.display_name ?? slot.ingredient_name ?? 'Empty'
  return (
    <div
      className={[
        'flex h-full w-full flex-col overflow-hidden rounded-md border p-1 text-left',
        slotColor(slot.color_group, hasContent),
      ].join(' ')}
    >
      <div className="flex w-full items-center gap-1">
        <span className="ml-auto shrink-0 rounded bg-black/25 px-1 text-[8px] font-mono opacity-70">{slot.gn_size}</span>
      </div>
      <p className="mt-0.5 w-full truncate text-[11px] font-semibold leading-tight">{label}</p>
    </div>
  )
}

/* ─── Drag state ─── */

type DragState = {
  kind: 'move' | 'new'
  slotId?: string
  gnSize: GnSize
  rotation: number
  grabXmm: number // pointer offset from pan top-left, in mm
  grabYmm: number
  pointerX: number
  pointerY: number
  rectW: number // viewport px size (for ghost)
  rectH: number
  moved: boolean
  startX: number
  startY: number
  target: { x: number; y: number; valid: boolean } | null
}

const MOVE_THRESHOLD = 4

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
  onMove: (slotId: string, xMm: number, yMm: number, rotation: number) => Promise<{ ok: boolean; error?: string }>
  onAdd: (gnSize: GnSize, xMm: number, yMm: number, rotation: number) => Promise<{ ok: boolean; error?: string }>
  onRemove: (slotId: string) => Promise<{ ok: boolean; error?: string }>
  onAssign: (slotId: string, ingredientId: string | null) => void
  onReset: () => void
}) {
  const boardRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<DragState | null>(null)
  const [pickerSlotId, setPickerSlotId] = useState<string | null>(null)
  const [localSlots, setLocalSlots] = useState<SaladBarSlot[]>(slots)
  useEffect(() => {
    if (!drag) setLocalSlots(slots)
  }, [slots, drag])

  const filled = localSlots.filter((s) => s.ingredient_id || s.display_name).length
  const asFree = (sl: SaladBarSlot[]): FreePan[] =>
    sl.map((s) => ({ id: s.id, gn_size: s.gn_size, x_mm: s.x_mm, y_mm: s.y_mm, rotation: s.rotation }))

  function rect() {
    return boardRef.current?.getBoundingClientRect()
  }

  /* Compute snapped, clamped, validated target for the current pointer. */
  function computeTarget(d: DragState, clientX: number, clientY: number) {
    const r = rect()
    if (!r) return null
    const mmPerPxX = HOLE_W_MM / r.width
    const mmPerPxY = HOLE_H_MM / r.height
    const f = footprintMM(d.gnSize, d.rotation)
    let x = snapX((clientX - r.left) * mmPerPxX - d.grabXmm)
    let y = snapY((clientY - r.top) * mmPerPxY - d.grabYmm)
    x = Math.max(0, Math.min(x, HOLE_W_MM - f.w))
    y = Math.max(0, Math.min(y, HOLE_H_MM - f.h))
    const valid = canPlaceFree(asFree(localSlots), x, y, f.w, f.h, d.slotId)
    return { x, y, valid }
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!drag) return
    e.preventDefault()
    const moved =
      drag.moved || Math.abs(e.clientX - drag.startX) > MOVE_THRESHOLD || Math.abs(e.clientY - drag.startY) > MOVE_THRESHOLD
    const r = rect()
    setDrag({
      ...drag,
      pointerX: e.clientX,
      pointerY: e.clientY,
      moved,
      target: computeTarget(drag, e.clientX, e.clientY),
      rectW: r?.width ?? drag.rectW,
      rectH: r?.height ?? drag.rectH,
    })
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

    if (d.kind === 'move' && !d.moved && d.slotId) {
      setPickerSlotId(d.slotId) // click → assign ingredient
      return
    }
    if (!d.target || !d.target.valid) return

    if (d.kind === 'move' && d.slotId) {
      const { x, y } = d.target
      setLocalSlots((prev) =>
        prev.map((s) => (s.id === d.slotId ? { ...s, x_mm: x, y_mm: y, rotation: d.rotation } : s)),
      )
      const res = await onMove(d.slotId, x, y, d.rotation)
      if (!res.ok) setLocalSlots(slots)
    } else if (d.kind === 'new') {
      await onAdd(d.gnSize, d.target.x, d.target.y, d.rotation)
    }
  }

  function startMove(e: React.PointerEvent, slot: SaladBarSlot) {
    if (pickerSlotId) return
    e.preventDefault()
    const r = rect()
    const panRect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const mmPerPxX = r ? HOLE_W_MM / r.width : 1
    const mmPerPxY = r ? HOLE_H_MM / r.height : 1
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    setDrag({
      kind: 'move',
      slotId: slot.id,
      gnSize: slot.gn_size as GnSize,
      rotation: slot.rotation,
      grabXmm: (e.clientX - panRect.left) * mmPerPxX,
      grabYmm: (e.clientY - panRect.top) * mmPerPxY,
      pointerX: e.clientX,
      pointerY: e.clientY,
      rectW: r?.width ?? 0,
      rectH: r?.height ?? 0,
      moved: false,
      startX: e.clientX,
      startY: e.clientY,
      target: null,
    })
  }

  function startNew(e: React.PointerEvent, gnSize: GnSize) {
    e.preventDefault()
    const r = rect()
    const f = GN_REAL[gnSize]
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    setDrag({
      kind: 'new',
      gnSize,
      rotation: 0,
      grabXmm: f.w / 2, // grab from the pan's center
      grabYmm: f.h / 2,
      pointerX: e.clientX,
      pointerY: e.clientY,
      rectW: r?.width ?? 0,
      rectH: r?.height ?? 0,
      moved: true,
      startX: e.clientX,
      startY: e.clientY,
      target: null,
    })
  }

  // 'R' rotates the pan currently being dragged.
  useEffect(() => {
    if (!drag) return
    function onKey(ev: KeyboardEvent) {
      if (ev.key !== 'r' && ev.key !== 'R') return
      setDrag((d) => {
        if (!d) return d
        const rot = d.rotation === 0 ? 90 : 0
        const t = d.target ? computeTarget({ ...d, rotation: rot }, d.pointerX, d.pointerY) : null
        return { ...d, rotation: rot, target: t }
      })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag])

  // Rotate a placed pan in-place (button). Keeps top-left; rejects if it won't fit.
  async function rotatePan(slot: SaladBarSlot) {
    const rot = slot.rotation === 0 ? 90 : 0
    const f = footprintMM(slot.gn_size, rot)
    const x = Math.max(0, Math.min(slot.x_mm, HOLE_W_MM - f.w))
    const y = Math.max(0, Math.min(slot.y_mm, HOLE_H_MM - f.h))
    if (!canPlaceFree(asFree(localSlots), x, y, f.w, f.h, slot.id)) return // no room to rotate
    setLocalSlots((prev) => prev.map((s) => (s.id === slot.id ? { ...s, x_mm: x, y_mm: y, rotation: rot } : s)))
    const res = await onMove(slot.id, x, y, rot)
    if (!res.ok) setLocalSlots(slots)
  }

  const pct = (mm: number, total: number) => `${(mm / total) * 100}%`

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
          const f = GN_REAL[gn]
          return (
            <button
              key={gn}
              onPointerDown={(e) => startNew(e, gn)}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              style={{ touchAction: 'none', width: Math.max(f.w * 0.07, 18), height: Math.max(f.h * 0.07, 14) }}
              className="flex cursor-grab items-center justify-center rounded border border-slate-600 bg-slate-800/80 text-[9px] font-mono text-slate-300 transition hover:border-slate-400 hover:bg-slate-700 active:cursor-grabbing"
              title={`GN ${gn} — ${GN_MM[gn]} mm`}
            >
              {gn}
            </button>
          )
        })}
        <span className="ml-1 text-[8px] text-slate-600">тащи в дыру · «R» при перетаскивании — поворот · ⟳ на ячейке</span>
      </div>

      {/* Board */}
      <div
        ref={boardRef}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        className="relative mx-auto w-full select-none rounded border border-slate-700/60 bg-slate-950/40"
        style={{
          maxWidth: 1040,
          aspectRatio: `${HOLE_W_MM} / ${HOLE_H_MM}`,
          touchAction: 'none',
          backgroundImage:
            'linear-gradient(to right, rgba(148,163,184,0.10) 1px, transparent 1px), linear-gradient(to bottom, rgba(148,163,184,0.10) 1px, transparent 1px)',
          backgroundSize: `${(88 / HOLE_W_MM) * 100}% ${(54 / HOLE_H_MM) * 100}%`,
        }}
      >
        {/* placed pans */}
        {localSlots.map((slot) => {
          const f = footprintMM(slot.gn_size, slot.rotation)
          const isDragging = drag?.kind === 'move' && drag.slotId === slot.id && drag.moved
          return (
            <div
              key={slot.id}
              className="group absolute p-px"
              style={{
                left: pct(slot.x_mm, HOLE_W_MM),
                top: pct(slot.y_mm, HOLE_H_MM),
                width: pct(f.w, HOLE_W_MM),
                height: pct(f.h, HOLE_H_MM),
                touchAction: 'none',
                opacity: isDragging ? 0.3 : 1,
                cursor: 'grab',
                zIndex: pickerSlotId === slot.id ? 40 : 10,
              }}
              onPointerDown={(e) => startMove(e, slot)}
            >
              <PanFace slot={slot} />
              {/* rotate */}
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation()
                  rotatePan(slot)
                }}
                className="absolute -left-1.5 -top-1.5 z-20 flex h-4 w-4 items-center justify-center rounded-full border border-slate-600 bg-slate-900 text-slate-400 opacity-60 transition hover:text-sky-300 hover:opacity-100"
                title="Rotate 90°"
              >
                <RotateCw className="h-2.5 w-2.5" />
              </button>
              {/* delete */}
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation()
                  onRemove(slot.id)
                }}
                className="absolute -right-1.5 -top-1.5 z-20 flex h-4 w-4 items-center justify-center rounded-full border border-slate-600 bg-slate-900 text-slate-400 opacity-60 transition hover:text-red-300 hover:opacity-100"
                title="Remove pan"
              >
                <X className="h-2.5 w-2.5" />
              </button>
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
        {drag?.target && drag.moved && (() => {
          const f = footprintMM(drag.gnSize, drag.rotation)
          return (
            <div
              className={[
                'pointer-events-none absolute z-30 rounded-md border-2',
                drag.target.valid ? 'border-emerald-400 bg-emerald-400/15' : 'border-red-500 bg-red-500/15',
              ].join(' ')}
              style={{
                left: pct(drag.target.x, HOLE_W_MM),
                top: pct(drag.target.y, HOLE_H_MM),
                width: pct(f.w, HOLE_W_MM),
                height: pct(f.h, HOLE_H_MM),
              }}
            />
          )
        })()}
      </div>

      {/* floating ghost */}
      {drag?.moved && drag.rectW > 0 && (() => {
        const f = footprintMM(drag.gnSize, drag.rotation)
        const wPx = (f.w / HOLE_W_MM) * drag.rectW
        const hPx = (f.h / HOLE_H_MM) * drag.rectH
        return (
          <div
            className="pointer-events-none fixed z-[60] flex items-center justify-center rounded-md border-2 border-white/50 bg-slate-700/80 text-[9px] font-mono text-slate-100 shadow-2xl"
            style={{
              left: drag.pointerX - (drag.grabXmm / HOLE_W_MM) * drag.rectW,
              top: drag.pointerY - (drag.grabYmm / HOLE_H_MM) * drag.rectH,
              width: wPx,
              height: hPx,
            }}
          >
            {drag.gnSize}
          </div>
        )
      })()}

      {/* legend */}
      <div className="mt-1.5 flex items-center justify-between text-[8px] text-slate-600">
        <span>← guest side · перетаскивай · клик — ингредиент · ⟳ поворот · ✕ удалить</span>
        <span>back ↑ · front ↓</span>
      </div>
    </div>
  )
}
