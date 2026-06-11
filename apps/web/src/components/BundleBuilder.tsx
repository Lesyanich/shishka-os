import { useState } from 'react'
import { Check, Minus, Plus, X } from 'lucide-react'
import type { MenuDish } from '../hooks/usePublicMenu.ts'
import type { BundleChildLine } from '../state/cart.tsx'
import {
  buildChildren,
  previewPrice,
  previewSavings,
  totalQty,
  type Selection,
} from '../lib/bundle.ts'

const baht = (n: number) => `฿${Number(n).toLocaleString()}`

interface Props {
  bundleDish: MenuDish
  manakishCount: number
  sauceCount: number
  /** This bundle size's discount %, e.g. 15 for −15%. */
  discountPct: number
  manakishPool: MenuDish[]
  saucePool: MenuDish[]
  onClose: () => void
  onConfirm: (children: BundleChildLine[], price: number) => void
}

/** Stepper row: a dish with a quantity +/- control. */
function PickRow({
  dish,
  qty,
  canAdd,
  onInc,
  onDec,
}: {
  dish: MenuDish
  qty: number
  canAdd: boolean
  onInc: () => void
  onDec: () => void
}) {
  return (
    <li className="flex items-center gap-3 rounded-lg bg-surface-2 p-2.5">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-cream">{dish.name}</p>
        <p className="font-mono text-xs text-amber-watch">{baht(dish.price ?? 0)}</p>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label={`Remove one ${dish.name}`}
          onClick={onDec}
          disabled={qty <= 0}
          className="rounded-full bg-surface-3 p-1.5 text-cream disabled:opacity-30"
        >
          <Minus size={14} />
        </button>
        <span className="w-5 text-center font-mono text-cream">{qty}</span>
        <button
          type="button"
          aria-label={`Add one ${dish.name}`}
          onClick={onInc}
          disabled={!canAdd}
          className="rounded-full bg-forest-soft p-1.5 text-surface-1 disabled:opacity-30"
        >
          <Plus size={14} />
        </button>
      </div>
    </li>
  )
}

export default function BundleBuilder({
  bundleDish,
  manakishCount,
  sauceCount,
  discountPct,
  manakishPool,
  saucePool,
  onClose,
  onConfirm,
}: Props) {
  const [manakishSel, setManakishSel] = useState<Selection>({})
  const [sauceSel, setSauceSel] = useState<Selection>({})

  const manakishChosen = totalQty(manakishSel)
  const sauceChosen = totalQty(sauceSel)
  const manakishFull = manakishChosen >= manakishCount
  const sauceFull = sauceChosen >= sauceCount
  const complete = manakishChosen === manakishCount && sauceChosen === sauceCount

  const price = previewPrice(manakishSel, manakishPool, discountPct)
  const savings = previewSavings(manakishSel, manakishPool, discountPct)

  const bump = (
    setter: typeof setManakishSel,
    id: string,
    delta: number,
  ) =>
    setter((prev) => {
      const next = Math.max(0, (prev[id] ?? 0) + delta)
      const rest = { ...prev }
      delete rest[id]
      return next === 0 ? rest : { ...rest, [id]: next }
    })

  const confirm = () => {
    onConfirm(buildChildren(manakishSel, sauceSel, manakishPool, saucePool), price)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-surface-1">
      {/* Header */}
      <header className="flex items-center gap-3 border-b border-white/5 px-4 py-3">
        <button type="button" aria-label="Close" onClick={onClose} className="text-cream/70">
          <X size={22} />
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-display text-lg text-cream">{bundleDish.name}</h2>
          <p className="text-xs text-cream/50">
            Pick {manakishCount} manakish + {sauceCount} sauce{sauceCount > 1 ? 's' : ''}
          </p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 pb-40 pt-4">
        {/* Manakish */}
        <section className="mb-6">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="font-display text-base text-cream/90">Manakish</h3>
            <span
              className={`font-mono text-sm ${complete || !manakishFull ? 'text-cream/60' : 'text-forest-soft'}`}
            >
              {manakishChosen} of {manakishCount}
            </span>
          </div>
          <ul className="space-y-2">
            {manakishPool.map((d) => (
              <PickRow
                key={d.id}
                dish={d}
                qty={manakishSel[d.id] ?? 0}
                canAdd={!manakishFull}
                onInc={() => bump(setManakishSel, d.id, +1)}
                onDec={() => bump(setManakishSel, d.id, -1)}
              />
            ))}
          </ul>
        </section>

        {/* Sauce */}
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="font-display text-base text-cream/90">Sauce (free)</h3>
            <span className="font-mono text-sm text-cream/60">
              {sauceChosen} of {sauceCount}
            </span>
          </div>
          <ul className="space-y-2">
            {saucePool.map((d) => (
              <PickRow
                key={d.id}
                dish={d}
                qty={sauceSel[d.id] ?? 0}
                canAdd={!sauceFull}
                onInc={() => bump(setSauceSel, d.id, +1)}
                onDec={() => bump(setSauceSel, d.id, -1)}
              />
            ))}
          </ul>
        </section>
      </div>

      {/* Footer / confirm */}
      <div className="fixed inset-x-0 bottom-0 border-t border-white/5 bg-surface-1/95 p-4 backdrop-blur">
        <div className="mb-2 flex items-baseline justify-between">
          <span className="font-mono text-lg text-amber-watch">{price > 0 ? baht(price) : '—'}</span>
          {savings > 0 && (
            <span className="text-sm text-forest-soft">save {baht(savings)} vs à la carte</span>
          )}
        </div>
        <button
          type="button"
          onClick={confirm}
          disabled={!complete}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-forest-soft py-3.5 font-medium text-surface-1 disabled:opacity-40"
        >
          <Check size={18} />
          {complete
            ? `Add bundle · ${baht(price)}`
            : `Pick ${manakishCount - manakishChosen} more manakish${
                sauceChosen < sauceCount ? ` + ${sauceCount - sauceChosen} sauce` : ''
              }`}
        </button>
      </div>
    </div>
  )
}
