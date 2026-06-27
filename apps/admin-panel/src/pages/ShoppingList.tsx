import { useState } from 'react'
import { ShoppingCart, CheckCircle2, Wallet, Sparkles, RefreshCw, PackageX, Truck } from 'lucide-react'
import { useShoppingList, type POGroupingResult } from '../hooks/useShoppingList'
import { usePurchaseOrders } from '../hooks/usePurchaseOrders'
import { AddItemRow } from '../components/shopping-list/AddItemRow'
import { ShoppingListTable } from '../components/shopping-list/ShoppingListTable'
import { ShoppingListPOPreview } from '../components/procurement/ShoppingListPOPreview'
import { toCreatePOPayload } from '../lib/reorderGrouping'
import type { ShoppingStatus } from '../types/shopping'

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: typeof ShoppingCart
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

const FILTERS: { key: ShoppingStatus | 'all'; label: string }[] = [
  { key: 'needed', label: 'To buy' },
  { key: 'bought', label: 'Bought' },
  { key: 'all', label: 'All' },
]

export function ShoppingList() {
  const {
    items,
    isLoading,
    error,
    statusFilter,
    setStatusFilter,
    addItem,
    updateItem,
    removeItem,
    seedFromMenu,
    seedFromLowStock,
    isSeeding,
    buildPOGroups,
    markOrdered,
  } = useShoppingList()
  const { createPO } = usePurchaseOrders()

  const [seedMsg, setSeedMsg] = useState<string | null>(null)
  const [poPreview, setPoPreview] = useState<POGroupingResult | null>(null)
  const [isCreatingPOs, setIsCreatingPOs] = useState(false)

  const needed = items.filter((i) => i.status === 'needed')
  const bought = items.filter((i) => i.status === 'bought')
  const estTotal = needed.reduce((sum, i) => sum + (i.est_price ?? 0), 0)

  const visible =
    statusFilter === 'all' ? items : items.filter((i) => i.status === statusFilter)

  const handleSeed = async () => {
    setSeedMsg(null)
    const res = await seedFromMenu('makro')
    if (!res.ok) {
      setSeedMsg(`Ошибка: ${res.error ?? 'не удалось'}`)
      return
    }
    setSeedMsg(
      res.inserted && res.inserted > 0
        ? `Добавлено ${res.inserted} ингредиентов из меню (Makro).`
        : 'Новых ингредиентов нет — список уже актуален.',
    )
  }

  const handleSeedLow = async () => {
    setSeedMsg(null)
    const res = await seedFromLowStock('makro')
    if (!res.ok) {
      setSeedMsg(`Ошибка: ${res.error ?? 'не удалось'}`)
      return
    }
    setSeedMsg(
      res.inserted && res.inserted > 0
        ? `Добавлено ${res.inserted} позиций ниже par.`
        : 'Ничего ниже par — запас в норме.',
    )
  }

  const handleOpenPOs = async () => {
    setSeedMsg(null)
    const groups = await buildPOGroups()
    setPoPreview(groups)
  }

  const handleConfirmPOs = async () => {
    if (!poPreview) return
    setIsCreatingPOs(true)
    const created: string[] = []
    const orderedNomIds: string[] = []
    for (const group of poPreview.groups) {
      const res = await createPO(toCreatePOPayload(group, { notes: 'From shopping list' }))
      if (res.ok) {
        if (res.po_number) created.push(res.po_number)
        for (const l of group.lines) orderedNomIds.push(l.nomenclature_id)
      }
    }
    // Mark every needed line whose product was ordered.
    const orderedItemIds = needed
      .filter((i) => i.nomenclature_id && orderedNomIds.includes(i.nomenclature_id))
      .map((i) => i.id)
    await markOrdered(orderedItemIds)
    setIsCreatingPOs(false)
    setPoPreview(null)
    setSeedMsg(
      created.length > 0
        ? `Создано ${created.length} черновиков PO: ${created.join(', ')}.`
        : 'Не удалось создать PO — проверьте поставщиков.',
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-slate-100">Shopping List</h1>
          <p className="text-xs text-slate-500">
            Список закупок по магазинам · ссылки на товар · отмечай купленное
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <button
            onClick={handleSeed}
            disabled={isSeeding}
            className="flex items-center gap-1.5 rounded bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-slate-700 disabled:opacity-50"
          >
            {isSeeding ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 text-amber-400" />}
            Seed from menu
          </button>
          <button
            onClick={handleSeedLow}
            disabled={isSeeding}
            className="flex items-center gap-1.5 rounded bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-slate-700 disabled:opacity-50"
          >
            <PackageX className="h-3.5 w-3.5 text-rose-400" />
            Seed from low stock
          </button>
          <button
            onClick={handleOpenPOs}
            disabled={needed.length === 0}
            className="flex items-center gap-1.5 rounded bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-40"
          >
            <Truck className="h-3.5 w-3.5" />
            Create POs
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <StatCard icon={ShoppingCart} label="To buy" value={needed.length} color="text-emerald-400" />
        <StatCard icon={CheckCircle2} label="Bought" value={bought.length} color="text-sky-400" />
        <StatCard
          icon={Wallet}
          label="Est. total (to buy)"
          value={`฿${estTotal.toLocaleString('en-US', { maximumFractionDigits: 0 })}`}
          color="text-amber-400"
        />
      </div>

      {seedMsg && <p className="text-[11px] text-slate-400">{seedMsg}</p>}

      <AddItemRow onAdd={addItem} />

      <div className="flex items-center gap-1">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setStatusFilter(f.key)}
            className={[
              'rounded px-2.5 py-1 text-[11px] font-medium transition',
              statusFilter === f.key
                ? 'bg-emerald-500/15 text-emerald-300'
                : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200',
            ].join(' ')}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && (
        <p className="rounded border border-rose-900/50 bg-rose-950/30 px-3 py-2 text-xs text-rose-300">
          {error}
        </p>
      )}

      {isLoading ? (
        <p className="text-sm text-slate-500">Загрузка…</p>
      ) : (
        <ShoppingListTable items={visible} onUpdate={updateItem} onRemove={removeItem} />
      )}

      {poPreview && (
        <ShoppingListPOPreview
          result={poPreview}
          isBusy={isCreatingPOs}
          onConfirm={handleConfirmPOs}
          onClose={() => setPoPreview(null)}
        />
      )}
    </div>
  )
}
