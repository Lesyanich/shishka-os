import { startTransition, useCallback, useEffect, useMemo, useOptimistic, useState } from 'react'
import { ChevronDown, ChevronRight, Loader2, Package, Plus, Save, Trash2, Upload, X } from 'lucide-react'
import {
  useSuppliers,
  WEEKDAYS,
  toggleDeliveryDay,
  type Supplier,
  type SupplierPatch,
  type SupplierProduct,
} from '../../hooks/useSuppliers'
import { useInlineUpdate } from '../../hooks/useInlineUpdate'
import { InlineEditCell } from '../menu/owner/InlineEditCell'
import { CatalogImportPanel } from './CatalogImportPanel'

function deliverySummary(s: Supplier): string {
  if (s.delivery_days.length === 0) return '—'
  const labels = s.delivery_days.map((code) => WEEKDAYS.find((w) => w.code === code)?.label ?? code)
  const win = s.delivery_window ? ` · ${s.delivery_window}` : ''
  return labels.join(' ') + win
}

/** Lazily loads the supplier_catalog rows for one supplier — the
 * "sells N products" panel — only when the card is expanded. */
function SupplierProductsPanel({
  supplierId,
  supplierName,
  fetchProducts,
  importOpen,
  onImportOpenChange,
}: {
  supplierId: string
  supplierName: string
  fetchProducts: (id: string) => Promise<SupplierProduct[]>
  /** Driven from the collapsed row's Import button so one click gets there. */
  importOpen: boolean
  onImportOpenChange: (next: boolean) => void
}) {
  const [rows, setRows] = useState<SupplierProduct[] | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  useEffect(() => {
    let alive = true
    fetchProducts(supplierId).then((r) => {
      if (alive) setRows(r)
    })
    return () => {
      alive = false
    }
  }, [supplierId, fetchProducts, reloadKey])

  const importer = (
    <CatalogImportPanel
      supplierId={supplierId}
      supplierName={supplierName}
      open={importOpen}
      onOpenChange={onImportOpenChange}
      onImported={() => setReloadKey((k) => k + 1)}
    />
  )

  if (rows === null) {
    return (
      <div className="flex items-center gap-2 py-2 text-[11px] text-cream/45">
        <Loader2 className="h-3 w-3 animate-spin" /> Loading catalog…
      </div>
    )
  }
  if (rows.length === 0) {
    return (
      <div className="space-y-2">
        <div className="text-[11px] text-cream/45">No catalogued products yet.</div>
        {importer}
      </div>
    )
  }
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[11px] font-medium text-cream/60">
          <Package className="h-3 w-3" /> Sells {rows.length} catalogued product
          {rows.length === 1 ? '' : 's'}
        </div>
        {importer}
      </div>
      <ul className="max-h-40 space-y-0.5 overflow-y-auto pr-1">
        {rows.slice(0, 50).map((p) => (
          <li key={p.id} className="flex items-center justify-between gap-2 text-[11px]">
            <span className="truncate text-cream/80">
              {p.product_name || p.original_name || '—'}
            </span>
            <span className="shrink-0 tabular-nums text-cream/60">
              {p.last_seen_price != null ? `฿${p.last_seen_price.toLocaleString()}` : '—'}
              {p.base_unit ? `/${p.base_unit}` : ''}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

const FIELD_LABEL = 'mb-0.5 block text-[10px] uppercase tracking-wide text-cream/45'

export function SupplierManager() {
  const {
    suppliers,
    isLoading,
    error,
    createSupplier,
    updateSupplier,
    removeSupplier,
    fetchSupplierProducts,
  } = useSuppliers()

  const inline = useInlineUpdate(updateSupplier)
  const [optimistic, setOptimistic] = useOptimistic(
    suppliers,
    (state, p: { id: string; patch: SupplierPatch }) =>
      state.map((s) => (s.id === p.id ? { ...s, ...p.patch } : s)),
  )

  const [search, setSearch] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  // Which supplier's import panel is open. Lives here, not inside the card, so
  // the collapsed row's Import button can expand the card AND open the panel in
  // one click — buried at the bottom of the expanded card, nobody found it.
  const [importForId, setImportForId] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [createErr, setCreateErr] = useState<string | null>(null)

  const commitPatch = useCallback(
    (id: string, patch: SupplierPatch) => {
      // useOptimistic must dispatch inside a transition (React 19) — otherwise
      // it throws and the error boundary bounces the user off the page.
      startTransition(async () => {
        setOptimistic({ id, patch })
        await inline.commit(id, patch)
      })
    },
    [inline, setOptimistic],
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return optimistic
    return optimistic.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.contact_person ?? '').toLowerCase().includes(q) ||
        (s.phone ?? '').toLowerCase().includes(q),
    )
  }, [optimistic, search])

  const handleCreate = useCallback(async () => {
    if (!newName.trim()) {
      setCreateErr('Supplier name is required')
      return
    }
    setCreating(true)
    setCreateErr(null)
    const res = await createSupplier(newName)
    setCreating(false)
    if (!res.ok) {
      setCreateErr(res.error ?? 'Failed to create supplier')
      return
    }
    setShowCreate(false)
    setNewName('')
    if (res.id) setExpandedId(res.id)
  }, [newName, createSupplier])

  const handleDelete = useCallback(
    async (s: Supplier) => {
      if (!window.confirm(`Remove supplier "${s.name}"? It will be hidden but kept for history.`))
        return
      await removeSupplier(s.id)
    },
    [removeSupplier],
  )

  return (
    <section className="rounded-xl border border-[var(--line)] bg-[var(--s-1)] shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-cream">Suppliers</h2>
          <p className="text-xs text-cream/45">
            Contacts, delivery days &amp; lead times — click any field to edit.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search suppliers…"
            className="h-8 w-44 rounded-md border border-[var(--line-strong)] bg-[var(--s-2)] px-2.5 text-xs text-cream outline-none focus:border-forest-soft"
          />
          <button
            type="button"
            onClick={() => {
              setShowCreate(true)
              setNewName('')
              setCreateErr(null)
            }}
            className="inline-flex h-8 items-center rounded-md border border-forest-soft/60 bg-forest-soft/10 px-3 text-[11px] font-medium text-mint-200 hover:bg-forest-soft/20"
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            Add Supplier
          </button>
        </div>
      </header>

      <div className="px-4 py-3">
        {error && (
          <div className="mb-3 rounded-md border border-brick-soft/30 bg-brick-soft/10 px-3 py-2 text-xs text-brick-bright">
            {error}
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-8 text-xs text-cream/45">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading suppliers…
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-8 text-center text-xs text-cream/45">
            {search
              ? 'No suppliers match your search.'
              : 'No suppliers yet. Add your first supplier.'}
          </div>
        ) : (
          <ul className="space-y-2">
            {filtered.map((s) => {
              const expanded = expandedId === s.id
              const failed = inline.isFailed(s.id)
              return (
                <li
                  key={s.id}
                  className={[
                    'rounded-lg border bg-[var(--s-1)] transition',
                    failed ? 'border-brick-soft/60' : 'border-[var(--line)]',
                  ].join(' ')}
                >
                  {/* Collapsed row */}
                  <div className="flex items-center gap-3 px-3 py-2.5">
                    <button
                      type="button"
                      onClick={() => setExpandedId(expanded ? null : s.id)}
                      className="text-cream/45 hover:text-cream/80"
                      aria-label={expanded ? 'Collapse' : 'Expand'}
                    >
                      {expanded ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </button>
                    <div className="min-w-0 flex-1">
                      <InlineEditCell<string | null>
                        value={s.name}
                        ariaLabel="Supplier name"
                        className="text-sm font-medium text-cream"
                        onCommit={(next) => {
                          if (next && next.trim()) void commitPatch(s.id, { name: next })
                        }}
                      />
                      {/* The meta line doubles as the expand target — the name
                          itself opens inline edit, so clicking a supplier used
                          to do nothing visible unless you hit the chevron. */}
                      <button
                        type="button"
                        onClick={() => setExpandedId(expanded ? null : s.id)}
                        className="mt-0.5 flex w-full flex-wrap items-center gap-x-3 gap-y-0.5 text-left text-[11px] text-cream/45 hover:text-cream/70"
                      >
                        {s.phone && <span>{s.phone}</span>}
                        <span>🚚 {deliverySummary(s)}</span>
                        {s.lead_time_days != null && <span>lead {s.lead_time_days}d</span>}
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setExpandedId(s.id)
                        setImportForId(s.id)
                      }}
                      className="inline-flex h-7 items-center rounded-md border border-forest-soft/60 bg-forest-soft/10 px-2.5 text-[11px] font-medium text-mint-200 hover:bg-forest-soft/20"
                    >
                      <Upload className="mr-1 h-3 w-3" />
                      Import
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(s)}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-[var(--line-strong)] text-cream/60 hover:border-brick-soft/50 hover:text-brick-bright"
                      aria-label="Remove supplier"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {/* Expanded detail */}
                  {expanded && (
                    <div className="space-y-3 border-t border-[var(--line)] px-4 py-3">
                      <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 sm:grid-cols-3">
                        <div>
                          <span className={FIELD_LABEL}>Contact person</span>
                          <InlineEditCell<string | null>
                            value={s.contact_person}
                            ariaLabel="Contact person"
                            placeholder="—"
                            className="text-xs text-cream"
                            onCommit={(next) => void commitPatch(s.id, { contact_person: next })}
                          />
                        </div>
                        <div>
                          <span className={FIELD_LABEL}>Phone</span>
                          <InlineEditCell<string | null>
                            value={s.phone}
                            ariaLabel="Phone"
                            placeholder="—"
                            className="text-xs text-cream"
                            onCommit={(next) => void commitPatch(s.id, { phone: next })}
                          />
                        </div>
                        <div>
                          <span className={FIELD_LABEL}>Delivery window</span>
                          <InlineEditCell<string | null>
                            value={s.delivery_window}
                            ariaLabel="Delivery window"
                            placeholder="e.g. 09:00-12:00"
                            className="text-xs text-cream"
                            onCommit={(next) => void commitPatch(s.id, { delivery_window: next })}
                          />
                        </div>
                        <div>
                          <span className={FIELD_LABEL}>Lead time (days)</span>
                          <InlineEditCell<number | null>
                            value={s.lead_time_days}
                            variant="number"
                            min={0}
                            ariaLabel="Lead time in days"
                            placeholder="—"
                            className="text-xs text-cream"
                            onCommit={(next) => void commitPatch(s.id, { lead_time_days: next })}
                          />
                        </div>
                        <div>
                          <span className={FIELD_LABEL}>Min order (฿)</span>
                          <InlineEditCell<number | null>
                            value={s.min_order_thb}
                            variant="number"
                            min={0}
                            ariaLabel="Minimum order in THB"
                            placeholder="—"
                            className="text-xs text-cream"
                            onCommit={(next) => void commitPatch(s.id, { min_order_thb: next })}
                          />
                        </div>
                        <div>
                          <span className={FIELD_LABEL}>Payment terms</span>
                          <InlineEditCell<string | null>
                            value={s.payment_terms}
                            ariaLabel="Payment terms"
                            placeholder="e.g. cash on delivery"
                            className="text-xs text-cream"
                            onCommit={(next) => void commitPatch(s.id, { payment_terms: next })}
                          />
                        </div>
                      </div>

                      <div>
                        <span className={FIELD_LABEL}>Delivery days</span>
                        <div className="flex flex-wrap gap-1">
                          {WEEKDAYS.map((w) => {
                            const on = s.delivery_days.includes(w.code)
                            return (
                              <button
                                key={w.code}
                                type="button"
                                onClick={() =>
                                  void commitPatch(s.id, {
                                    delivery_days: toggleDeliveryDay(s.delivery_days, w.code),
                                  })
                                }
                                className={[
                                  'rounded-md px-2 py-1 text-[11px] font-medium transition',
                                  on
                                    ? 'bg-forest-soft/20 text-mint-200 ring-1 ring-inset ring-forest-soft/40'
                                    : 'bg-[var(--s-2)] text-cream/45 hover:text-cream/80',
                                ].join(' ')}
                              >
                                {w.label}
                              </button>
                            )
                          })}
                        </div>
                      </div>

                      <div>
                        <span className={FIELD_LABEL}>Notes</span>
                        <InlineEditCell<string | null>
                          value={s.notes}
                          variant="textarea"
                          rows={2}
                          ariaLabel="Notes"
                          placeholder="Anything worth remembering about this supplier…"
                          className="block text-xs text-cream"
                          onCommit={(next) => void commitPatch(s.id, { notes: next })}
                        />
                      </div>

                      {s.contact_info && (
                        <div className="rounded-md border border-[var(--line)] bg-black/70 px-2.5 py-1.5">
                          <span className={FIELD_LABEL}>Legacy contact (read-only)</span>
                          <p className="whitespace-pre-wrap text-[11px] text-cream/60">
                            {s.contact_info}
                          </p>
                        </div>
                      )}

                      {inline.errorFor(s.id) && (
                        <p className="text-[11px] text-brick-bright">{inline.errorFor(s.id)}</p>
                      )}

                      <div className="border-t border-[var(--line)] pt-2">
                        <SupplierProductsPanel
                          supplierId={s.id}
                          supplierName={s.name}
                          fetchProducts={fetchSupplierProducts}
                          importOpen={importForId === s.id}
                          onImportOpenChange={(next) =>
                            setImportForId(next ? s.id : null)
                          }
                        />
                      </div>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* Create modal — name only; details edited inline after creation */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-[var(--line-strong)] bg-[var(--s-1)] shadow-2xl">
            <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-4">
              <h3 className="text-sm font-semibold text-cream">Add Supplier</h3>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="rounded-md p-1 text-cream/60 hover:bg-[var(--s-2)] hover:text-cream"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-4 px-5 py-4">
              {createErr && (
                <div className="rounded-md border border-brick-soft/30 bg-brick-soft/10 px-3 py-2 text-xs text-brick-bright">
                  {createErr}
                </div>
              )}
              <div>
                <label className="mb-1 block text-xs text-cream/60">Supplier Name</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handleCreate()
                  }}
                  placeholder="e.g. Makro, Sangdamrong, Local Farm"
                  className="h-9 w-full rounded-md border border-[var(--line-strong)] bg-[var(--s-2)] px-3 text-xs text-cream outline-none focus:border-forest-soft"
                  autoFocus
                />
                <p className="mt-1.5 text-[11px] text-cream/45">
                  Add contacts &amp; delivery details inline after creating.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-[var(--line)] px-5 py-3">
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="h-8 rounded-md border border-[var(--line-strong)] bg-[var(--s-2)] px-4 text-xs text-cream/80 hover:bg-[var(--s-3)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleCreate()}
                disabled={creating}
                className="inline-flex h-8 items-center rounded-md border border-forest-soft/60 bg-forest-soft/15 px-4 text-xs font-medium text-mint-200 hover:bg-forest-soft/25 disabled:opacity-50"
              >
                {creating ? (
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                ) : (
                  <Save className="mr-1 h-3 w-3" />
                )}
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
