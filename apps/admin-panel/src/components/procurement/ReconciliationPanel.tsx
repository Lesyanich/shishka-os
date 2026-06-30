import { useState, useEffect, useCallback } from 'react'
import { ChevronLeft, CheckCircle, AlertTriangle, DollarSign } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import type {
  PurchaseOrder,
  ReconciliationLine,
  ApprovePOPayload,
  ApprovePOResult,
} from '../../types/procurement'

interface Props {
  order: PurchaseOrder
  onBack: () => void
  onReconciled: () => void
}

const defaultToday = new Date().toISOString().slice(0, 10)

export function ReconciliationPanel({ order, onBack, onReconciled }: Props) {
  const [lines, setLines] = useState<ReconciliationLine[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isApproving, setIsApproving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Financial fields
  const [transactionDate, setTransactionDate] = useState(defaultToday)
  const [amountOriginal, setAmountOriginal] = useState<number | ''>('')
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('transfer')
  const [paidBy, setPaidBy] = useState('')
  const [discountTotal, setDiscountTotal] = useState<number | ''>(0)
  const [vatAmount, setVatAmount] = useState<number | ''>(0)
  const [deliveryFee, setDeliveryFee] = useState<number | ''>(0)
  const [hasTaxInvoice, setHasTaxInvoice] = useState(false)
  const [comments, setComments] = useState('')

  // Load ordered vs received comparison data
  useEffect(() => {
    async function load() {
      setIsLoading(true)

      // 1. Get PO lines (what was ordered)
      const { data: poLines } = await supabase
        .from('po_lines')
        .select('id, nomenclature_id, sku_id, qty_ordered, unit, unit_price_expected')
        .eq('po_id', order.id)
        .order('sort_order')

      // 2. Get receiving lines (what was received)
      const { data: recRecords } = await supabase
        .from('receiving_records')
        .select('id')
        .eq('po_id', order.id)

      const recIds = (recRecords ?? []).map((r: { id: string }) => r.id)

      let recLines: Array<{
        id: string
        po_line_id: string | null
        nomenclature_id: string
        sku_id: string | null
        qty_received: number
        qty_rejected: number
        unit_price_actual: number | null
        reject_reason: string | null
      }> = []

      if (recIds.length > 0) {
        const { data } = await supabase
          .from('receiving_lines')
          .select(
            'id, po_line_id, nomenclature_id, sku_id, qty_received, qty_rejected, unit_price_actual, reject_reason',
          )
          .in('receiving_id', recIds)

        recLines = (data ?? []) as typeof recLines
      }

      // 3. Get nomenclature names
      const nomIds = [
        ...new Set([
          ...(poLines ?? []).map((l: { nomenclature_id: string }) => l.nomenclature_id),
          ...recLines.map((l) => l.nomenclature_id),
        ]),
      ]

      const { data: noms } = await supabase
        .from('nomenclature')
        .select('id, product_code, name, base_unit')
        .in('id', nomIds)

      const nomMap = new Map(
        (noms ?? []).map(
          (n: { id: string; product_code: string; name: string; base_unit: string | null }) => [
            n.id,
            { product_code: n.product_code, name: n.name, base_unit: n.base_unit ?? 'pcs' },
          ],
        ),
      )

      // 4. Aggregate receiving_lines by po_line_id
      const recByPoLine = new Map<
        string,
        {
          qty_received: number
          qty_rejected: number
          unit_price_actual: number | null
          reject_reason: string | null
          receiving_line_id: string
        }
      >()
      for (const rl of recLines) {
        const key = rl.po_line_id ?? rl.nomenclature_id
        const existing = recByPoLine.get(key)
        if (existing) {
          existing.qty_received += Number(rl.qty_received)
          existing.qty_rejected += Number(rl.qty_rejected)
          if (rl.unit_price_actual != null)
            existing.unit_price_actual = Number(rl.unit_price_actual)
        } else {
          recByPoLine.set(key, {
            qty_received: Number(rl.qty_received),
            qty_rejected: Number(rl.qty_rejected),
            unit_price_actual: rl.unit_price_actual != null ? Number(rl.unit_price_actual) : null,
            reject_reason: rl.reject_reason,
            receiving_line_id: rl.id,
          })
        }
      }

      // 5. Build reconciliation lines
      const result: ReconciliationLine[] = (poLines ?? []).map(
        (pl: {
          id: string
          nomenclature_id: string
          qty_ordered: number
          unit: string
          unit_price_expected: number | null
        }) => {
          const nom = nomMap.get(pl.nomenclature_id)
          const rec = recByPoLine.get(pl.id)
          return {
            receiving_line_id: rec?.receiving_line_id ?? '',
            po_line_id: pl.id,
            nomenclature_id: pl.nomenclature_id,
            product_name: nom?.name ?? 'Unknown',
            product_code: nom?.product_code ?? '',
            unit: pl.unit ?? nom?.base_unit ?? 'pcs',
            qty_ordered: Number(pl.qty_ordered),
            qty_received: rec?.qty_received ?? 0,
            qty_rejected: rec?.qty_rejected ?? 0,
            unit_price_expected:
              pl.unit_price_expected != null ? Number(pl.unit_price_expected) : null,
            unit_price_actual: rec?.unit_price_actual ?? null,
            reject_reason: rec?.reject_reason ?? null,
          }
        },
      )

      setLines(result)

      // Pre-fill amount from sum of (qty_received * unit_price)
      const estimatedTotal = result.reduce((sum, l) => {
        const price = l.unit_price_actual ?? l.unit_price_expected ?? 0
        return sum + l.qty_received * price
      }, 0)
      if (estimatedTotal > 0) setAmountOriginal(Math.round(estimatedTotal * 100) / 100)

      setIsLoading(false)
    }
    load()
  }, [order.id])

  const handleApprove = useCallback(async () => {
    setError(null)
    setSuccess(null)

    if (!amountOriginal && amountOriginal !== 0) {
      setError('Enter the total amount')
      return
    }

    setIsApproving(true)

    const payload: ApprovePOPayload = {
      po_id: order.id,
      transaction_date: transactionDate,
      amount_original: Number(amountOriginal),
      invoice_number: invoiceNumber || undefined,
      payment_method: paymentMethod,
      paid_by: paidBy || undefined,
      discount_total: discountTotal ? Number(discountTotal) : 0,
      vat_amount: vatAmount ? Number(vatAmount) : 0,
      delivery_fee: deliveryFee ? Number(deliveryFee) : 0,
      has_tax_invoice: hasTaxInvoice,
      comments: comments || undefined,
    }

    const { data, error: rpcError } = await supabase.rpc('fn_approve_po', {
      p_payload: payload,
    })

    setIsApproving(false)

    if (rpcError) {
      setError(rpcError.message)
      return
    }

    const result = data as ApprovePOResult
    if (!result.ok) {
      setError(result.error ?? 'Reconciliation failed')
      return
    }

    setSuccess(
      `Reconciled! ${result.purchase_count} items logged${result.sku_auto_created ? `, ${result.sku_auto_created} SKUs auto-created` : ''}.`,
    )
    setTimeout(() => onReconciled(), 1500)
  }, [
    order.id,
    transactionDate,
    amountOriginal,
    invoiceNumber,
    paymentMethod,
    paidBy,
    discountTotal,
    vatAmount,
    deliveryFee,
    hasTaxInvoice,
    comments,
    onReconciled,
  ])

  // Computed totals
  const totalOrdered = lines.reduce((s, l) => s + l.qty_ordered * (l.unit_price_expected ?? 0), 0)
  const totalReceived = lines.reduce(
    (s, l) => s + l.qty_received * (l.unit_price_actual ?? l.unit_price_expected ?? 0),
    0,
  )
  const hasDiscrepancy = lines.some((l) => l.qty_received !== l.qty_ordered || l.qty_rejected > 0)

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-xl bg-[var(--s-2)]" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--s-2)] text-cream/60 transition hover:text-cream"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div>
          <h2 className="text-sm font-bold text-cream">Reconcile {order.po_number}</h2>
          <p className="text-xs text-cream/45">{order.supplier_name}</p>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-brick-soft/30 bg-brick-soft/10 px-3 py-2 text-xs text-brick-bright">
          {error}
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 rounded-lg border border-forest-soft/30 bg-forest-soft/10 px-3 py-2 text-xs text-mint-200">
          <CheckCircle className="h-4 w-4 shrink-0" />
          {success}
        </div>
      )}

      {/* ── Ordered vs Received Diff ── */}
      <div className="rounded-xl border border-[var(--line-strong)] bg-[var(--s-2)] p-3">
        <h3 className="mb-2 text-xs font-semibold text-cream/60">
          {hasDiscrepancy && <AlertTriangle className="mr-1 inline h-3.5 w-3.5 text-amber-watch" />}
          Ordered vs Received
        </h3>

        {/* Header row */}
        <div className="mb-1 grid grid-cols-[1fr_auto_auto_auto] gap-2 text-[10px] text-cream/45">
          <span>Item</span>
          <span className="w-16 text-right">Ordered</span>
          <span className="w-16 text-right">Received</span>
          <span className="w-20 text-right">Amount</span>
        </div>

        <div className="space-y-1">
          {lines.map((l, idx) => {
            const diff = l.qty_received - l.qty_ordered
            const price = l.unit_price_actual ?? l.unit_price_expected ?? 0
            const lineTotal = l.qty_received * price
            const hasDiff = diff !== 0 || l.qty_rejected > 0

            return (
              <div
                key={idx}
                className={`grid grid-cols-[1fr_auto_auto_auto] items-center gap-2 rounded-lg p-2 ${
                  hasDiff
                    ? 'border border-amber-watch/20 bg-amber-watch/5'
                    : 'border border-[var(--line-strong)] bg-[var(--s-2)]'
                }`}
              >
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-cream">{l.product_name}</p>
                  <p className="text-[10px] text-cream/45">
                    {l.product_code}
                    {l.qty_rejected > 0 && (
                      <span className="ml-1 text-brick-bright">
                        ({l.qty_rejected} rejected: {l.reject_reason})
                      </span>
                    )}
                  </p>
                </div>
                <span className="w-16 text-right text-xs text-cream/80">
                  {l.qty_ordered} {l.unit}
                </span>
                <span
                  className={`w-16 text-right text-xs font-medium ${
                    hasDiff ? 'text-amber-watch' : 'text-mint-200'
                  }`}
                >
                  {l.qty_received} {l.unit}
                  {diff !== 0 && (
                    <span className="block text-[9px]">
                      {diff > 0 ? '+' : ''}
                      {diff}
                    </span>
                  )}
                </span>
                <span className="w-20 text-right text-xs text-cream">
                  {lineTotal > 0 ? `${lineTotal.toLocaleString()} ฿` : '—'}
                </span>
              </div>
            )
          })}
        </div>

        {/* Totals summary */}
        <div className="mt-2 flex items-center justify-between border-t border-[var(--line-strong)] pt-2">
          <span className="text-[11px] text-cream/45">Expected total</span>
          <span className="text-xs text-cream/80">{totalOrdered.toLocaleString()} ฿</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-cream/45">Received total</span>
          <span
            className={`text-xs font-medium ${
              totalReceived !== totalOrdered ? 'text-amber-watch' : 'text-mint-200'
            }`}
          >
            {totalReceived.toLocaleString()} ฿
          </span>
        </div>
      </div>

      {/* ── Financial Form ── */}
      <div className="rounded-xl border border-[var(--line-strong)] bg-[var(--s-2)] p-3">
        <h3 className="mb-3 flex items-center gap-1.5 text-xs font-semibold text-cream/60">
          <DollarSign className="h-3.5 w-3.5" />
          Financial Details
        </h3>

        <div className="space-y-3">
          {/* Date + Invoice */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[11px] text-cream/45">Transaction Date</label>
              <input
                type="date"
                value={transactionDate}
                onChange={(e) => setTransactionDate(e.target.value)}
                className="h-9 w-full rounded-md border border-[var(--line-strong)] bg-[var(--s-2)] px-3 text-xs text-cream outline-none focus:border-forest-soft"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] text-cream/45">Invoice #</label>
              <input
                type="text"
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                placeholder="Optional"
                className="h-9 w-full rounded-md border border-[var(--line-strong)] bg-[var(--s-2)] px-3 text-xs text-cream outline-none focus:border-forest-soft"
              />
            </div>
          </div>

          {/* Amount + Payment */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[11px] text-cream/45">Total Amount (THB)</label>
              <input
                type="number"
                value={amountOriginal}
                onChange={(e) => setAmountOriginal(e.target.value ? Number(e.target.value) : '')}
                placeholder="0.00"
                step="any"
                min={0}
                className="h-9 w-full rounded-md border border-[var(--line-strong)] bg-[var(--s-2)] px-3 text-xs text-cream outline-none focus:border-forest-soft"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] text-cream/45">Payment Method</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="h-9 w-full rounded-md border border-[var(--line-strong)] bg-[var(--s-2)] px-3 text-xs text-cream outline-none focus:border-forest-soft"
              >
                <option value="transfer">Bank Transfer</option>
                <option value="cash">Cash</option>
                <option value="credit_card">Credit Card</option>
                <option value="promptpay">PromptPay</option>
              </select>
            </div>
          </div>

          {/* Discount, VAT, Delivery */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-[11px] text-cream/45">Discount</label>
              <input
                type="number"
                value={discountTotal}
                onChange={(e) => setDiscountTotal(e.target.value ? Number(e.target.value) : '')}
                placeholder="0"
                step="any"
                min={0}
                className="h-9 w-full rounded-md border border-[var(--line-strong)] bg-[var(--s-2)] px-3 text-xs text-cream outline-none focus:border-forest-soft"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] text-cream/45">VAT</label>
              <input
                type="number"
                value={vatAmount}
                onChange={(e) => setVatAmount(e.target.value ? Number(e.target.value) : '')}
                placeholder="0"
                step="any"
                min={0}
                className="h-9 w-full rounded-md border border-[var(--line-strong)] bg-[var(--s-2)] px-3 text-xs text-cream outline-none focus:border-forest-soft"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] text-cream/45">Delivery Fee</label>
              <input
                type="number"
                value={deliveryFee}
                onChange={(e) => setDeliveryFee(e.target.value ? Number(e.target.value) : '')}
                placeholder="0"
                step="any"
                min={0}
                className="h-9 w-full rounded-md border border-[var(--line-strong)] bg-[var(--s-2)] px-3 text-xs text-cream outline-none focus:border-forest-soft"
              />
            </div>
          </div>

          {/* Paid by + Tax invoice */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[11px] text-cream/45">Paid By</label>
              <input
                type="text"
                value={paidBy}
                onChange={(e) => setPaidBy(e.target.value)}
                placeholder="Name"
                className="h-9 w-full rounded-md border border-[var(--line-strong)] bg-[var(--s-2)] px-3 text-xs text-cream outline-none focus:border-forest-soft"
              />
            </div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 text-xs text-cream/80">
                <input
                  type="checkbox"
                  checked={hasTaxInvoice}
                  onChange={(e) => setHasTaxInvoice(e.target.checked)}
                  className="h-4 w-4 rounded border-[var(--line-strong)] bg-[var(--s-2)]"
                />
                Tax invoice received
              </label>
            </div>
          </div>

          {/* Comments */}
          <div>
            <label className="mb-1 block text-[11px] text-cream/45">Comments</label>
            <input
              type="text"
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              placeholder="Optional notes..."
              className="h-9 w-full rounded-md border border-[var(--line-strong)] bg-[var(--s-2)] px-3 text-xs text-cream outline-none focus:border-forest-soft"
            />
          </div>
        </div>
      </div>

      {/* Approve button */}
      <button
        onClick={handleApprove}
        disabled={isApproving || !!success}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--color-royal-green)] py-3 text-sm font-semibold text-white transition hover:bg-[var(--color-royal-soft)] active:scale-[0.99] disabled:opacity-50"
      >
        <CheckCircle className="h-4 w-4" />
        {isApproving ? 'Processing...' : 'Approve & Reconcile'}
      </button>
    </div>
  )
}
