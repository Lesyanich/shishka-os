import { useState, useEffect, useCallback, useRef } from 'react'
import {
  ChevronLeft, Send, XCircle, DollarSign, Phone, MessageCircle, Globe,
  ClipboardCopy, BarChart3, Plus, Camera, Check, ClipboardCheck,
} from 'lucide-react'
import { POTimeline } from './POTimeline'
import { POLineEditor } from './POLineEditor'
import { supabase } from '../../lib/supabase'
import { compressImage, uploadToStorage } from '../receipts/upload-helpers'
import { signReceiptUrls } from '../../lib/receiptUrls'
import type {
  PurchaseOrder, POLine, POStatus, POLinePatch, UpdatePOPatch, UpdatePOResult,
  Station, LinkedReceipt, ReceivedLineSummary,
} from '../../types/procurement'

/**
 * Statuses in which fn_update_po accepts edits — mirror of its own guard.
 * CEO ruling 2026-07-27: edits run until `received`, per spec §4.3/§6.2/§4.8.
 * A shipped order is exactly when a quantity correction or an unload
 * destination is learned, so `shipped` and `partially_received` are editable.
 * The RPC additionally refuses to drop a line's qty below what has already
 * been received, or to delete a line that has receiving activity.
 */
const EDITABLE: POStatus[] = ['draft', 'submitted', 'confirmed', 'shipped', 'partially_received']

const NEXT_ACTIONS: Partial<Record<POStatus, { label: string; next: POStatus }>> = {
  draft: { label: 'Submit to the other side', next: 'submitted' },
  submitted: { label: 'Confirm order', next: 'confirmed' },
  confirmed: { label: 'Mark as shipped', next: 'shipped' },
}

/**
 * The order as a message to a (Thai) supplier. This is the ONE place Thai
 * product names surface — the admin UI itself stays English (spec §6.4).
 */
export function buildCopyOrderText(order: PurchaseOrder, lines: POLine[]): string {
  const head = [`Order ${order.po_number} — Shishka`]
  if (order.expected_date) {
    const date = new Date(order.expected_date).toLocaleDateString('en-GB', {
      weekday: 'short', day: 'numeric', month: 'short',
    })
    head.push(`Delivery: ${date}${order.delivery_window ? `, ${order.delivery_window}` : ''}`)
  }
  const body = lines.map((l) => {
    const name = l.product_name_th ? `${l.product_name} (${l.product_name_th})` : l.product_name
    return `• ${name} — ${l.qty_ordered} ${l.unit || l.base_unit}`
  })
  const total = order.grand_total != null && order.grand_total > 0
    ? [`Total: ฿${order.grand_total.toLocaleString()}`]
    : []
  return [...head, ...body, ...total].join('\n')
}

interface CatalogOption {
  nomenclature_id: string
  display_name: string
  purchase_unit: string | null
  last_seen_price: number | null
}

interface Props {
  order: PurchaseOrder
  onBack: () => void
  fetchLines: (poId: string) => Promise<POLine[]>
  updateStatus: (poId: string, status: POStatus) => Promise<boolean>
  updatePO: (poId: string, patch: UpdatePOPatch) => Promise<UpdatePOResult>
  fetchLinkedReceipts: (poId: string) => Promise<LinkedReceipt[]>
  parseLinkedReceipt: (inboxId: string) => Promise<{ ok: boolean; error?: string }>
  attachReceipt: (poId: string, storagePath: string, uploadedBy: string) => Promise<string | null>
  fetchReceivedSummary: (poId: string) => Promise<ReceivedLineSummary[]>
  stations: Station[]
  /** Signed-in person's name — recorded as the receipt's uploader. */
  myName: string | null
  onReconcile?: (order: PurchaseOrder) => void
  onReceive?: (order: PurchaseOrder) => void
  onOpenSupplierCatalog?: (supplierId: string) => void
  onOpenSupplierCard?: (supplierId: string) => void
}

export function PODetail({
  order, onBack, fetchLines, updateStatus, updatePO,
  fetchLinkedReceipts, parseLinkedReceipt, attachReceipt, fetchReceivedSummary,
  stations, myName, onReconcile, onReceive, onOpenSupplierCatalog, onOpenSupplierCard,
}: Props) {
  const [lines, setLines] = useState<POLine[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isBusy, setIsBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  /** Receipt currently being read, so only its own button shows progress. */
  const [parsingId, setParsingId] = useState<string | null>(null)

  // `order` is the LIVE row (the page derives it from the orders list), so
  // totals are read straight off it — fn_update_po recomputes them and the
  // hook patches the row with what the RPC returned.
  const subtotal = order.subtotal ?? 0
  const grandTotal = order.grand_total ?? 0

  // Text fields need local state while typing, but the server still owns the
  // value: re-sync whenever the live row changes, so an edit made by the other
  // person (or our own saved patch) lands here instead of being shadowed by a
  // stale snapshot.
  const [deliveryFee, setDeliveryFee] = useState(String(order.delivery_fee ?? 0))
  const [expectedDate, setExpectedDate] = useState(order.expected_date ?? '')
  const [deliveryWindow, setDeliveryWindow] = useState(order.delivery_window ?? '')

  useEffect(() => setDeliveryFee(String(order.delivery_fee ?? 0)), [order.delivery_fee])
  useEffect(() => setExpectedDate(order.expected_date ?? ''), [order.expected_date])
  useEffect(() => setDeliveryWindow(order.delivery_window ?? ''), [order.delivery_window])

  const [receipts, setReceipts] = useState<LinkedReceipt[]>([])
  const [received, setReceived] = useState<ReceivedLineSummary[]>([])
  const [isPickerOpen, setPickerOpen] = useState(false)
  const [catalog, setCatalog] = useState<CatalogOption[]>([])
  const [pickerQuery, setPickerQuery] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const editable = EDITABLE.includes(order.status)
  const isDone = ['reconciled', 'cancelled'].includes(order.status)

  const reload = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!opts?.silent) setIsLoading(true)
      const data = await fetchLines(order.id)
      setLines(data)
      setIsLoading(false)
    },
    [order.id, fetchLines],
  )

  useEffect(() => {
    reload()
  }, [reload])

  useEffect(() => {
    fetchLinkedReceipts(order.id).then(setReceipts)
  }, [order.id, fetchLinkedReceipts])

  useEffect(() => {
    if (['partially_received', 'received', 'reconciled'].includes(order.status)) {
      fetchReceivedSummary(order.id).then(setReceived)
    }
  }, [order.id, order.status, fetchReceivedSummary])

  /** Every edit path funnels through here so errors surface in exactly one place. */
  const applyPatch = useCallback(
    async (patch: UpdatePOPatch, opts?: { reloadLines?: boolean }) => {
      setIsBusy(true)
      setError(null)
      const result = await updatePO(order.id, patch)
      setIsBusy(false)

      if (!result.ok) {
        setError(result.error ?? 'Update failed')
        return false
      }
      if (opts?.reloadLines) await reload({ silent: true })
      return true
    },
    [order.id, updatePO, reload],
  )

  const handleLinePatch = useCallback(
    async (patch: POLinePatch) => {
      // Optimistic: show the new value immediately, but keep the pre-edit rows
      // so a rejected patch can be put back. fn_update_po refuses edits once
      // the order moves past `confirmed`, and it rejects duplicates and qty<=0
      // — without this restore the screen would keep a value the DB never took,
      // and the totals beside it would contradict the lines.
      const before = lines
      setLines((prev) =>
        prev.map((l) => {
          if (l.id !== patch.id) return l
          const next = { ...l, ...patch } as POLine
          // total_expected is GENERATED in Postgres as qty * COALESCE(price,0);
          // mirroring it here is what lets us skip a refetch per keystroke.
          next.total_expected = next.qty_ordered * (next.unit_price_expected ?? 0)
          return next
        }),
      )
      // No reload: everything shown for this line is known locally, and the
      // totals block reads the order row the RPC already updated. Refetching
      // cost 4 extra queries (one of them the whole nomenclature table) on
      // every single stepper click.
      const ok = await applyPatch({ lines_upsert: [patch] })
      if (!ok) setLines(before)
    },
    [lines, applyPatch],
  )

  const handleLineRemove = useCallback(
    async (lineId: string) => {
      const before = lines
      setLines((prev) => prev.filter((l) => l.id !== lineId))
      // fn_update_po refuses to delete a line that has already been received,
      // and refuses to empty an order — so a rejection here is expected and the
      // row must come back.
      const ok = await applyPatch({ lines_delete: [lineId] })
      if (!ok) setLines(before)
    },
    [lines, applyPatch],
  )

  const openPicker = useCallback(async () => {
    setPickerOpen(true)
    if (catalog.length > 0) return
    const { data } = await supabase
      .from('v_order_builder')
      .select('nomenclature_id, display_name, purchase_unit, last_seen_price')
      .eq('supplier_id', order.supplier_id)
      .not('nomenclature_id', 'is', null)
      // Ordered and generous on purpose: the cap used to be 500 with no
      // ORDER BY, so for the one supplier with 673 catalog rows the search
      // silently hid ~173 of them, and WHICH ones changed between loads.
      .order('display_name')
      .limit(5000)
    setCatalog((data ?? []) as CatalogOption[])
  }, [catalog.length, order.supplier_id])

  const handleAddItem = useCallback(
    async (opt: CatalogOption) => {
      setPickerOpen(false)
      setPickerQuery('')
      await applyPatch(
        {
          lines_upsert: [{
            nomenclature_id: opt.nomenclature_id,
            qty_ordered: 1,
            unit: opt.purchase_unit ?? 'pcs',
            unit_price_expected: opt.last_seen_price,
          }],
        },
        { reloadLines: true },
      )
    },
    [applyPatch],
  )

  const handleStatusChange = useCallback(
    async (next: POStatus) => {
      setIsBusy(true)
      const ok = await updateStatus(order.id, next)
      setIsBusy(false)
      if (ok) onBack()
      else setError('Could not change the order status')
    },
    [order.id, updateStatus, onBack],
  )

  const handleCancel = useCallback(async () => {
    if (!confirm(`Cancel ${order.po_number}? This cannot be undone.`)) return
    await handleStatusChange('cancelled')
  }, [order.po_number, handleStatusChange])

  const handleCopyOrder = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(buildCopyOrderText(order, lines))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('Clipboard blocked by the browser — copy manually from the lines above')
    }
  }, [order, lines])

  /**
   * Linking a receipt to a PO takes it out of the standalone inbox, which is
   * also where the parse button lived — so the trigger has to exist here or an
   * attached receipt can never be read. Reading it is what fills the reconcile
   * screen (spec §4.6).
   */
  const handleParseReceipt = useCallback(
    async (inboxId: string) => {
      setParsingId(inboxId)
      setError(null)
      const result = await parseLinkedReceipt(inboxId)
      if (!result.ok) setError(result.error ?? 'Could not read the receipt')
      setReceipts(await fetchLinkedReceipts(order.id))
      setParsingId(null)
    },
    [parseLinkedReceipt, fetchLinkedReceipts, order.id],
  )

  const handleAttachReceipt = useCallback(
    async (file: File) => {
      setIsBusy(true)
      setError(null)
      try {
        const prepared = await compressImage(file)
        const uploaded = await uploadToStorage(prepared, 0)
        if ('error' in uploaded) {
          setError(uploaded.error)
          return
        }
        // Who UPLOADED, not who ordered — this feeds finance provenance.
        const failure = await attachReceipt(order.id, uploaded.path, myName ?? 'Admin')
        if (failure) {
          setError(failure)
          return
        }
        setReceipts(await fetchLinkedReceipts(order.id))
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Upload failed')
      } finally {
        setIsBusy(false)
      }
    },
    [order.id, myName, attachReceipt, fetchLinkedReceipts],
  )

  const openReceipt = useCallback(async (path: string) => {
    const signed = await signReceiptUrls([path])
    const url = signed[path]
    if (url) window.open(url, '_blank', 'noopener')
  }, [])

  const action = NEXT_ACTIONS[order.status]
  const takenIds = new Set(lines.map((l) => l.nomenclature_id))
  const pickerResults = catalog
    .filter((c) => !takenIds.has(c.nomenclature_id))
    .filter((c) => c.display_name?.toLowerCase().includes(pickerQuery.toLowerCase()))
    .slice(0, 30)

  const discrepancies = received.filter(
    (r) => r.qty_rejected > 0 || r.qty_received !== r.qty_expected,
  )

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          aria-label="Back to Order Desk"
          className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--s-2)] text-cream/60 transition hover:text-cream"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold text-cream">{order.po_number}</h2>
          <p className="flex flex-wrap items-center gap-1.5 text-xs text-cream/45">
            <button
              onClick={() => onOpenSupplierCard?.(order.supplier_id)}
              className="underline-offset-2 transition hover:text-cream hover:underline"
            >
              {order.supplier_name}
            </button>
            {order.author_name && (
              <span className="rounded-full bg-honey-300/15 px-2 py-0.5 text-[10px] font-semibold text-honey-300">
                by {order.author_name}
              </span>
            )}
          </p>
        </div>
        <span className="shrink-0 rounded-lg bg-[var(--s-3)] px-2 py-1 text-[11px] font-bold capitalize text-cream/75">
          {order.status.replace('_', ' ')}
        </span>
      </div>

      <POTimeline
        status={order.status}
        createdAt={order.created_at}
        authorName={order.author_name}
      />

      {/* Supplier quick links */}
      <div className="flex flex-wrap gap-2">
        {order.supplier_phone && (
          <a
            href={`tel:${order.supplier_phone.replace(/\s/g, '')}`}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--s-2)] px-2.5 py-1.5 text-[11px] font-bold text-cream transition hover:bg-[var(--s-3)]"
          >
            <Phone className="h-3 w-3" /> Call
          </a>
        )}
        {order.supplier_line_id && (
          <a
            href={`https://line.me/R/ti/p/~${order.supplier_line_id.replace(/^@/, '')}`}
            target="_blank"
            rel="noreferrer noopener"
            className="flex items-center gap-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--s-2)] px-2.5 py-1.5 text-[11px] font-bold text-cream transition hover:bg-[var(--s-3)]"
          >
            <MessageCircle className="h-3 w-3" /> LINE
          </a>
        )}
        {order.supplier_website && (
          <a
            href={order.supplier_website.startsWith('http') ? order.supplier_website : `https://${order.supplier_website}`}
            target="_blank"
            rel="noreferrer noopener"
            className="flex items-center gap-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--s-2)] px-2.5 py-1.5 text-[11px] font-bold text-cream transition hover:bg-[var(--s-3)]"
          >
            <Globe className="h-3 w-3" /> Website
          </a>
        )}
        <button
          onClick={handleCopyOrder}
          className="flex items-center gap-1.5 rounded-lg border border-honey-300/45 bg-[var(--s-2)] px-2.5 py-1.5 text-[11px] font-bold text-cream transition hover:bg-[var(--s-3)]"
        >
          {copied ? <Check className="h-3 w-3 text-mint-200" /> : <ClipboardCopy className="h-3 w-3" />}
          {copied ? 'Copied' : 'Copy order'}
        </button>
        <button
          onClick={() => onOpenSupplierCatalog?.(order.supplier_id)}
          className="flex items-center gap-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--s-2)] px-2.5 py-1.5 text-[11px] font-bold text-honey-300 transition hover:bg-[var(--s-3)]"
        >
          <BarChart3 className="h-3 w-3" /> Catalog
        </button>
      </div>

      {error && (
        <p className="rounded-lg border border-brick-soft/40 bg-brick-soft/10 p-2.5 text-xs text-brick-bright">
          {error}
        </p>
      )}

      {/* Delivery date + window */}
      <div className="flex gap-2">
        <label className="flex-1 rounded-xl border border-[var(--line-strong)] bg-[var(--s-2)] p-2.5">
          <span className="block text-[9.5px] uppercase tracking-[0.1em] text-cream/40">
            Delivery date
          </span>
          <input
            type="date"
            value={expectedDate}
            disabled={!editable || isBusy}
            onChange={(e) => setExpectedDate(e.target.value)}
            onBlur={() => {
              if ((order.expected_date ?? '') !== expectedDate) {
                applyPatch({ expected_date: expectedDate || null })
              }
            }}
            className="mt-0.5 w-full bg-transparent text-[13px] font-bold text-cream outline-none disabled:opacity-60"
          />
        </label>
        <label className="flex-1 rounded-xl border border-[var(--line-strong)] bg-[var(--s-2)] p-2.5">
          <span className="block text-[9.5px] uppercase tracking-[0.1em] text-cream/40">
            Time window
          </span>
          <input
            value={deliveryWindow}
            disabled={!editable || isBusy}
            placeholder="09:00–12:00"
            onChange={(e) => setDeliveryWindow(e.target.value)}
            onBlur={() => {
              if ((order.delivery_window ?? '') !== deliveryWindow) {
                applyPatch({ delivery_window: deliveryWindow || null })
              }
            }}
            className="mt-0.5 w-full bg-transparent text-[13px] font-bold text-cream outline-none placeholder:font-normal placeholder:text-cream/25 disabled:opacity-60"
          />
        </label>
      </div>

      {/* Lines */}
      <div className="space-y-1.5">
        <p className="text-[11px] font-medium text-cream/45">
          {lines.length} items {editable && '· editable'}
        </p>

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-[var(--s-2)]" />
            ))}
          </div>
        ) : (
          lines.map((l) => (
            <POLineEditor
              key={l.id}
              line={l}
              stations={stations}
              editable={editable}
              isBusy={isBusy}
              onPatch={handleLinePatch}
              onRemove={handleLineRemove}
            />
          ))
        )}

        {editable && !isPickerOpen && (
          <button
            onClick={openPicker}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-[var(--line-strong)] py-2 text-[11px] font-bold text-honey-300 transition hover:bg-[var(--s-2)]"
          >
            <Plus className="h-3.5 w-3.5" /> Add item
          </button>
        )}

        {isPickerOpen && (
          <div className="space-y-1.5 rounded-xl border border-[var(--line-strong)] bg-[var(--s-1)] p-2.5">
            <input
              autoFocus
              value={pickerQuery}
              onChange={(e) => setPickerQuery(e.target.value)}
              placeholder={`Search ${order.supplier_name} catalog…`}
              className="w-full rounded-lg bg-[var(--s-2)] px-2.5 py-2 text-xs text-cream outline-none placeholder:text-cream/30"
            />
            <div className="max-h-56 space-y-1 overflow-y-auto">
              {pickerResults.length === 0 && (
                <p className="px-1 py-2 text-[11px] text-cream/45">
                  {catalog.length === 0
                    ? 'No digitized catalog for this supplier yet.'
                    : 'Nothing matches — items already on the order are hidden.'}
                </p>
              )}
              {pickerResults.map((c) => (
                <button
                  key={c.nomenclature_id}
                  onClick={() => handleAddItem(c)}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition hover:bg-[var(--s-3)]"
                >
                  <span className="min-w-0 flex-1 truncate text-xs text-cream">{c.display_name}</span>
                  {c.last_seen_price != null && (
                    <span className="text-[11px] font-bold text-honey-300">
                      ฿{Number(c.last_seen_price).toLocaleString()}
                    </span>
                  )}
                </button>
              ))}
            </div>
            <button
              onClick={() => setPickerOpen(false)}
              className="w-full rounded-lg bg-[var(--s-3)] py-1.5 text-[11px] text-cream/60"
            >
              Close
            </button>
          </div>
        )}
      </div>

      {/* Totals */}
      <div className="flex gap-2">
        <div className="flex-1 rounded-xl border border-[var(--line-strong)] bg-[var(--s-2)] p-2.5">
          <span className="block text-[9.5px] uppercase tracking-[0.1em] text-cream/40">Subtotal</span>
          <span className="mt-0.5 block text-[13px] font-bold text-cream">
            ฿{subtotal.toLocaleString()}
          </span>
        </div>
        <label className="flex-1 rounded-xl border border-[var(--line-strong)] bg-[var(--s-2)] p-2.5">
          <span className="block text-[9.5px] uppercase tracking-[0.1em] text-cream/40">
            Delivery fee
          </span>
          <input
            value={deliveryFee}
            disabled={!editable || isBusy}
            inputMode="decimal"
            onChange={(e) => setDeliveryFee(e.target.value)}
            onBlur={() => {
              const next = Number(deliveryFee)
              if (!Number.isFinite(next) || next < 0) {
                setDeliveryFee(String(order.delivery_fee ?? 0))
                return
              }
              if (next !== (order.delivery_fee ?? 0)) applyPatch({ delivery_fee: next })
            }}
            className="mt-0.5 w-full bg-transparent text-[13px] font-bold text-cream outline-none disabled:opacity-60"
          />
        </label>
        <div className="flex-1 rounded-xl border border-honey-300/35 bg-[var(--s-2)] p-2.5">
          <span className="block text-[9.5px] uppercase tracking-[0.1em] text-cream/40">
            Grand total
          </span>
          <span className="mt-0.5 block text-[13px] font-bold text-honey-300">
            ฿{grandTotal.toLocaleString()}
          </span>
        </div>
      </div>

      {order.notes && (
        <p className="rounded-lg border border-[var(--line-strong)] bg-[var(--s-2)] p-2.5 text-xs text-cream/60">
          {order.notes}
        </p>
      )}

      {/* What actually arrived */}
      {received.length > 0 && (
        <div className="rounded-xl border border-[var(--line-strong)] bg-[var(--s-2)] p-3">
          <p className="text-xs font-bold text-cream">
            Delivery check: {received.length - discrepancies.length}/{received.length} lines match
          </p>
          {discrepancies.length === 0 ? (
            <p className="mt-1 text-[11px] text-mint-200">Everything arrived as ordered.</p>
          ) : (
            <ul className="mt-1 space-y-0.5">
              {discrepancies.map((d, i) => {
                const line = lines.find((l) => l.id === d.po_line_id)
                return (
                  <li key={d.po_line_id ?? i} className="text-[11px] text-amber-watch">
                    {line?.product_name ?? 'Unlinked item'}: ordered {d.qty_expected}, received{' '}
                    {d.qty_received}
                    {d.qty_rejected > 0 && `, rejected ${d.qty_rejected}`}
                    {d.reject_reason && ` (${d.reject_reason.replace(/_/g, ' ')})`}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}

      {/* Receipt documents */}
      {!['draft', 'submitted'].includes(order.status) && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-medium text-cream/45">Documents</p>
          {receipts.map((r) => (
            <div
              key={r.id}
              className="flex items-center gap-2.5 rounded-xl border border-[var(--line-strong)] bg-[var(--s-2)] p-2.5"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-cream">
                  Receipt · {new Date(r.created_at).toLocaleDateString('en-GB', {
                    day: 'numeric', month: 'short',
                  })}
                </p>
                <p className="text-[10px] text-cream/45">
                  {r.parsed
                    ? `read · ฿${(r.parsed.amount_original ?? 0).toLocaleString()}${
                        r.parsed.invoice_number ? ` · ${r.parsed.invoice_number}` : ''
                      } — fills the reconcile screen`
                    : parsingId === r.id
                      ? 'reading…'
                      : 'not read yet — read it to fill the reconcile screen'}
                </p>
              </div>
              {!r.parsed && (
                <button
                  onClick={() => handleParseReceipt(r.id)}
                  disabled={parsingId === r.id}
                  className="shrink-0 rounded-lg bg-honey-600/20 px-2 py-1 text-[10.5px] font-bold text-honey-300 transition hover:bg-honey-600/30 disabled:opacity-50"
                >
                  {parsingId === r.id ? '…' : 'Read'}
                </button>
              )}
              {r.photo_urls[0] && (
                <button
                  onClick={() => openReceipt(r.photo_urls[0])}
                  className="shrink-0 rounded-lg bg-[var(--s-3)] px-2 py-1 text-[10.5px] font-bold text-cream/75 transition hover:text-cream"
                >
                  Open
                </button>
              )}
            </div>
          ))}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) handleAttachReceipt(file)
              e.target.value = ''
            }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isBusy}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--s-3)] py-2.5 text-xs font-semibold text-cream/75 transition hover:text-cream disabled:opacity-50"
          >
            <Camera className="h-3.5 w-3.5" />
            {isBusy ? 'Uploading…' : 'Attach receipt'}
          </button>
        </div>
      )}

      {/* Actions */}
      <div className="space-y-2 pt-1">
        {action && (
          <button
            onClick={() => handleStatusChange(action.next)}
            disabled={isBusy}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--color-royal-green)] py-3 text-sm font-semibold text-white transition hover:bg-[var(--color-royal-soft)] active:scale-[0.99] disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
            {isBusy ? 'Working…' : action.label}
          </button>
        )}

        {order.status === 'shipped' && onReceive && (
          <button
            onClick={() => onReceive(order)}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-brick-bright py-3 text-sm font-semibold text-white transition hover:brightness-110 active:scale-[0.99]"
          >
            <ClipboardCheck className="h-4 w-4" />
            Receive delivery
          </button>
        )}

        {['received', 'partially_received'].includes(order.status) && onReconcile && (
          <button
            onClick={() => onReconcile(order)}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--color-royal-green)] py-3 text-sm font-semibold text-white transition hover:bg-[var(--color-royal-soft)] active:scale-[0.99]"
          >
            <DollarSign className="h-4 w-4" />
            Reconcile &amp; Approve
          </button>
        )}

        {!isDone && (
          <button
            onClick={handleCancel}
            disabled={isBusy}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--s-3)] py-2.5 text-xs text-cream/60 transition hover:bg-brick-soft/10 hover:text-brick-bright active:scale-[0.99] disabled:opacity-50"
          >
            <XCircle className="h-3.5 w-3.5" />
            Cancel order
          </button>
        )}
      </div>
    </div>
  )
}
