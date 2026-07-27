import { describe, it, expect, vi, afterEach } from 'vitest'
import type { Mock } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { PODetail } from './PODetail'
import type { PurchaseOrder, POStatus, POLine } from '../../types/procurement'

/**
 * Regression guard for the frozen-snapshot bug, which had two halves:
 *   1. Procurement.tsx held the selected order as a state OBJECT, so the prop
 *      never changed after the row was clicked.
 *   2. PODetail seeded its header fields and totals from that prop once, with
 *      no re-sync.
 *
 * These tests cover half 2 only — they feed PODetail a changing `order` prop
 * and assert it follows. Verified against the pre-fix code: the totals and
 * delivery-date cases FAIL without the re-sync, the other two pass either way
 * (they depend on half 1, which lives in the page and is not rendered here).
 */

const baseOrder: PurchaseOrder = {
  id: 'po-1',
  po_number: 'PO-0012',
  supplier_id: 'sup-1',
  supplier_name: 'DOY FRESH',
  status: 'submitted',
  expected_date: '2026-07-31',
  delivery_window: '06:00–09:00',
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
}

function renderDetail(order: PurchaseOrder, over?: { updatePO?: Mock; lines?: POLine[] }) {
  const updatePO: Mock =
    over?.updatePO ?? vi.fn().mockResolvedValue({ ok: true, subtotal: 1000, grand_total: 1000 })
  const props = {
    onBack: vi.fn(),
    fetchLines: vi.fn().mockResolvedValue(over?.lines ?? []),
    updateStatus: vi.fn().mockResolvedValue(true),
    updatePO,
    fetchLinkedReceipts: vi.fn().mockResolvedValue([]),
    parseLinkedReceipt: vi.fn().mockResolvedValue({ ok: true }),
    attachReceipt: vi.fn().mockResolvedValue(null),
    fetchReceivedSummary: vi.fn().mockResolvedValue([]),
    stations: [],
    onReceive: vi.fn(),
    onReconcile: vi.fn(),
  }
  const view = render(<PODetail order={order} {...props} />)
  const rerenderWith = (next: PurchaseOrder) =>
    view.rerender(<PODetail order={next} {...props} />)
  return { updatePO, rerenderWith }
}

const poLine: POLine = {
  id: 'line-1',
  po_id: 'po-1',
  nomenclature_id: 'nom-1',
  sku_id: null,
  product_name: 'Bell pepper red',
  product_name_th: null,
  product_code: 'RAW-PEPPER',
  base_unit: 'kg',
  qty_ordered: 5,
  unit: 'kg',
  unit_price_expected: 58,
  total_expected: 290,
  destination_station_id: null,
  sort_order: 1,
  notes: null,
}

const feeInput = () => screen.getByRole('textbox', { name: /delivery fee/i })

/** The amount sits in a sibling span, so read the whole labelled box. */
const totalsBox = (label: RegExp) => screen.getByText(label).parentElement as HTMLElement

afterEach(cleanup)

describe('PODetail follows the live order row', () => {
  it('saves a value that is edited and then set back to its original', async () => {
    const { updatePO, rerenderWith } = renderDetail(baseOrder)

    // First edit: 0 -> 150.
    fireEvent.change(feeInput(), { target: { value: '150' } })
    fireEvent.blur(feeInput())
    await waitFor(() => expect(updatePO).toHaveBeenCalledWith('po-1', { delivery_fee: 150 }))

    // The live row now carries the saved fee — this is what the page feeds back.
    rerenderWith({ ...baseOrder, delivery_fee: 150, grand_total: 1150 })
    expect((feeInput() as HTMLInputElement).value).toBe('150')

    // Reverting to 0 must still reach the server. With a frozen prop the guard
    // compared 0 against the ORIGINAL 0 and sent nothing, leaving 150 in the DB.
    updatePO.mockClear()
    fireEvent.change(feeInput(), { target: { value: '0' } })
    fireEvent.blur(feeInput())
    await waitFor(() => expect(updatePO).toHaveBeenCalledWith('po-1', { delivery_fee: 0 }))
  })

  it('shows totals from the live row, not the row captured when it was opened', () => {
    const { rerenderWith } = renderDetail(baseOrder)
    expect(totalsBox(/^Subtotal$/).textContent).toContain('฿1,000')
    expect(totalsBox(/^Grand total$/).textContent).toContain('฿1,000')

    rerenderWith({ ...baseOrder, subtotal: 2400, grand_total: 2560, delivery_fee: 160 })
    expect(totalsBox(/^Subtotal$/).textContent).toContain('฿2,400')
    expect(totalsBox(/^Grand total$/).textContent).toContain('฿2,560')
  })

  it('picks up a delivery date the other side changed while the order was open', () => {
    const { rerenderWith } = renderDetail(baseOrder)
    const date = () => screen.getByLabelText(/delivery date/i) as HTMLInputElement
    expect(date().value).toBe('2026-07-31')

    rerenderWith({ ...baseOrder, expected_date: '2026-08-05' })
    expect(date().value).toBe('2026-08-05')
  })

  it('puts a rejected line edit back instead of leaving a value the DB never took', async () => {
    // The other side shipped the order while it was open: fn_update_po refuses
    // the patch, so the optimistic 8 kg must not survive on screen.
    const updatePO = vi
      .fn()
      .mockResolvedValue({ ok: false, error: 'Order is not editable in status shipped' })
    renderDetail(baseOrder, { updatePO, lines: [poLine] })

    const qty = (await screen.findByLabelText(/Quantity of Bell pepper red/)) as HTMLInputElement
    expect(qty.value).toBe('5')

    fireEvent.change(qty, { target: { value: '8' } })
    fireEvent.blur(qty)

    await waitFor(() => expect(updatePO).toHaveBeenCalled())
    await waitFor(() =>
      expect(
        (screen.getByLabelText(/Quantity of Bell pepper red/) as HTMLInputElement).value,
      ).toBe('5'),
    )
    expect(screen.getByText(/not editable in status shipped/)).toBeTruthy()
  })

  it('keeps an accepted line edit', async () => {
    const updatePO = vi.fn().mockResolvedValue({ ok: true, subtotal: 464, grand_total: 464 })
    renderDetail(baseOrder, { updatePO, lines: [poLine] })

    const qty = (await screen.findByLabelText(/Quantity of Bell pepper red/)) as HTMLInputElement
    fireEvent.change(qty, { target: { value: '8' } })
    fireEvent.blur(qty)

    await waitFor(() =>
      expect(updatePO).toHaveBeenCalledWith('po-1', {
        lines_upsert: [{ id: 'line-1', qty_ordered: 8 }],
      }),
    )
    expect(screen.queryByText(/not editable/)).toBeNull()
  })

  it('still allows edits on a shipped order, and offers the receive CTA', () => {
    // CEO ruling 2026-07-27 (spec §4.3/§6.2/§4.8): editing runs until
    // `received`. A shipped order is precisely when a quantity correction or
    // an unload destination gets learned, so the gate must stay open.
    const { rerenderWith } = renderDetail(baseOrder)
    expect((feeInput() as HTMLInputElement).disabled).toBe(false)

    rerenderWith({ ...baseOrder, status: 'shipped' as POStatus })
    expect((feeInput() as HTMLInputElement).disabled).toBe(false)
    expect(screen.getByText('Receive delivery')).toBeTruthy()
  })

  it('closes the edit gate once the order is received', () => {
    const { rerenderWith } = renderDetail(baseOrder)

    rerenderWith({ ...baseOrder, status: 'received' as POStatus })
    expect((feeInput() as HTMLInputElement).disabled).toBe(true)
  })
})
