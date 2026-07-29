import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import { ReconciliationPanel } from './ReconciliationPanel'
import type { PurchaseOrder, LinkedReceipt } from '../../types/procurement'

/**
 * Reconcile prefill (spec §4.6 / §6.8): the receipt attached to the order is
 * what the supplier actually charged, so its parsed values seed the screen the
 * owner approves from. Everything stays editable, and the banner has to say
 * where the numbers came from — this screen writes an irreversible expense.
 *
 * The panel queries Supabase directly for lines (pre-existing behaviour), so
 * the client is mocked; the receipt arrives through the injected
 * fetchLinkedReceipts, which is the part under test.
 */

vi.mock('../../lib/supabase', () => {
  const empty = { data: [], error: null }
  const builder: Record<string, unknown> = {}
  const chain = () => builder
  Object.assign(builder, {
    select: chain,
    eq: chain,
    in: chain,
    order: () => empty,
    then: undefined,
  })
  return {
    supabase: {
      from: () => builder,
      rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    },
  }
})

const order: PurchaseOrder = {
  id: 'po-1',
  po_number: 'PO-0012',
  supplier_id: 'sup-1',
  supplier_name: 'DOY FRESH',
  status: 'received',
  expected_date: '2026-07-31',
  delivery_window: null,
  notes: null,
  subtotal: 1000,
  discount_total: 0,
  vat_amount: 0,
  delivery_fee: 0,
  grand_total: 1000,
  deliver_to_station_id: null,
  created_by: 'user-1',
  author_name: 'Lesia',
  created_at: '2026-07-27T09:12:00Z',
  line_count: 1,
  supplier_phone: null,
  supplier_line_id: null,
  supplier_website: null,
  supplier_default_delivery_fee: null,
  archived_at: null,
}

const parsedReceipt: LinkedReceipt = {
  id: 'inbox-1',
  status: 'parsed',
  photo_urls: ['receipts/x.jpg'],
  created_at: '2026-07-27T10:00:00Z',
  parsed_at: '2026-07-27T10:05:00Z',
  parsed: {
    amount_original: 1234.5,
    vat_amount: 80.75,
    discount_total: 15,
    delivery_fee: 60,
    invoice_number: 'INV-8891',
    transaction_date: '2026-07-26',
    has_tax_invoice: true,
    payment_method: 'cash',
    paid_by: 'Mint',
    items: [],
  },
}

function renderPanel(receipts: LinkedReceipt[]) {
  const fetchLinkedReceipts = vi.fn().mockResolvedValue(receipts)
  render(
    <ReconciliationPanel
      order={order}
      onBack={vi.fn()}
      onReconciled={vi.fn()}
      fetchLinkedReceipts={fetchLinkedReceipts}
    />,
  )
  return { fetchLinkedReceipts }
}

const value = (label: RegExp) => (screen.getByLabelText(label) as HTMLInputElement).value

beforeEach(() => vi.clearAllMocks())
afterEach(cleanup)

describe('ReconciliationPanel prefill from the attached receipt', () => {
  it('fills the financial fields from the parsed receipt', async () => {
    renderPanel([parsedReceipt])

    await waitFor(() => expect(screen.getByText(/Filled in from the attached receipt/)).toBeTruthy())

    expect(value(/^Total amount THB$/)).toBe('1234.5')
    expect(value(/^VAT$/)).toBe('80.75')
    expect(value(/^Discount$/)).toBe('15')
    expect(value(/^Delivery fee$/)).toBe('60')
    expect(value(/^Invoice number$/)).toBe('INV-8891')
    expect(value(/^Paid by$/)).toBe('Mint')
    // Date comes from the receipt, NOT today — RULE-TXN-DATE-INTEGRITY.
    expect(value(/^Transaction date$/)).toBe('2026-07-26')
  })

  it('warns that the figures must be checked before approving', async () => {
    renderPanel([parsedReceipt])
    await waitFor(() => expect(screen.getByText(/Filled in from the attached receipt/)).toBeTruthy())
    expect(screen.getByText(/cannot be\s+undone/)).toBeTruthy()
  })

  it('shows no banner when the attached receipt has not been read yet', async () => {
    const unparsed: LinkedReceipt = { ...parsedReceipt, status: 'pending', parsed_at: null, parsed: null }
    const { fetchLinkedReceipts } = renderPanel([unparsed])

    await waitFor(() => expect(fetchLinkedReceipts).toHaveBeenCalledWith('po-1'))
    expect(screen.queryByText(/Filled in from the attached receipt/)).toBeNull()
  })

  it('shows no banner when no receipt is attached at all', async () => {
    const { fetchLinkedReceipts } = renderPanel([])

    await waitFor(() => expect(fetchLinkedReceipts).toHaveBeenCalledWith('po-1'))
    expect(screen.queryByText(/Filled in from the attached receipt/)).toBeNull()
  })
})
