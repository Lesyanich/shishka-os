import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { SupplierManager } from './SupplierManager'

/**
 * The import surface, driven for real.
 *
 * The first version of this shipped with the Import button at the bottom of an
 * expanded supplier card, reachable only via a small chevron — the CEO clicked a
 * supplier, nothing happened, and reported it as broken. These tests pin the
 * two things that fix cost us: the button is reachable from the COLLAPSED row,
 * and a pasted price list reaches `fn_import_supplier_catalog` as a dry run
 * before anything is written.
 *
 * Everything from the paste box through the parser to the RPC arguments is the
 * real code path; only `useSuppliers` and the supabase client are stubbed.
 */

const rpc = vi.fn().mockResolvedValue({
  data: { ok: true, dry_run: true, inserted: 2, updated: 0, unlinked: 2, pack_unknown: 1 },
  error: null,
})

vi.mock('../../lib/supabase', () => ({
  supabase: { rpc: (...args: unknown[]) => rpc(...args) },
}))

vi.mock('../../hooks/useSuppliers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../hooks/useSuppliers')>()
  return {
    ...actual,
    useSuppliers: () => ({
      suppliers: [
        {
          id: 'sup-1',
          name: 'Laad Thai',
          contact_person: null,
          phone: '081-000-0000',
          delivery_days: ['mon'],
          delivery_window: null,
          lead_time_days: 1,
          min_order_thb: null,
          payment_terms: null,
          notes: null,
          contact_info: null,
        },
      ],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      createSupplier: vi.fn(),
      updateSupplier: vi.fn().mockResolvedValue({ ok: true }),
      removeSupplier: vi.fn(),
      fetchSupplierProducts: vi.fn().mockResolvedValue([]),
    }),
  }
})

const PRICE_LIST = ['ชื่อสินค้า\tราคา\tขนาด', 'ข้าวหอมมะลิ\t฿1,234.50\t5 kg', 'Sugar\t45\tassorted'].join(
  '\n',
)

beforeEach(() => rpc.mockClear())
afterEach(cleanup)

describe('reaching the importer', () => {
  it('opens from the collapsed row in one click', async () => {
    render(<SupplierManager />)
    // Nothing expanded yet: no paste box on screen.
    expect(screen.queryByPlaceholderText(/Paste the price list/i)).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /^Import$/i }))

    // The card expands and the panel opens on its own — no second click, no
    // hunting for a chevron. (It appears once the supplier's existing catalog
    // rows have loaded, which is one query.)
    await waitFor(() =>
      expect(screen.getByPlaceholderText(/Paste the price list/i)).toBeTruthy(),
    )
  })
})

describe('pasting a price list', () => {
  async function openImporter() {
    render(<SupplierManager />)
    fireEvent.click(screen.getByRole('button', { name: /^Import$/i }))
    const box = await screen.findByPlaceholderText(/Paste the price list/i)
    fireEvent.change(box, { target: { value: PRICE_LIST } })
  }

  async function pasteAndPreview() {
    await openImporter()
    fireEvent.click(screen.getByRole('button', { name: /^Preview$/i }))
  }

  it('sends a DRY RUN first — nothing is written before the human confirms', async () => {
    await pasteAndPreview()
    await waitFor(() => expect(rpc).toHaveBeenCalled())
    const [fn, args] = rpc.mock.calls[0] as [string, Record<string, unknown>]
    expect(fn).toBe('fn_import_supplier_catalog')
    expect(args.p_dry_run).toBe(true)
    expect(args.p_supplier_id).toBe('sup-1')
  })

  it('parses Thai headers, ฿ and thousands separators on the way through', async () => {
    await pasteAndPreview()
    await waitFor(() => expect(rpc).toHaveBeenCalled())
    const rows = (rpc.mock.calls[0][1] as { p_rows: Record<string, unknown>[] }).p_rows
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({
      name: 'ข้าวหอมมะลิ',
      price: 1234.5,
      package_qty: 5,
      package_unit: 'kg',
    })
  })

  it('sends NO pack size for a row it could not read one from (mig 388)', async () => {
    await pasteAndPreview()
    await waitFor(() => expect(rpc).toHaveBeenCalled())
    const rows = (rpc.mock.calls[0][1] as { p_rows: Record<string, unknown>[] }).p_rows
    // "assorted" is not a pack size. An assumed 1 here is exactly the invented
    // unit price migration 388 removed, so the key must be absent entirely.
    expect(rows[1]).toMatchObject({ name: 'Sugar', price: 45 })
    expect('package_qty' in rows[1]).toBe(false)
    expect('conversion_factor' in rows[1]).toBe(false)
  })

  it('states how much of the import will be unusable, in words', async () => {
    await pasteAndPreview()
    await waitFor(() =>
      expect(screen.getByText(/have no pack size and cannot be price-compared/i)).toBeTruthy(),
    )
    expect(screen.getByText(/will land unlinked/i)).toBeTruthy()
  })

  it('will not commit until a preview has run', async () => {
    await openImporter()
    const commit = screen.getByRole('button', { name: /^Import 2 rows$/i }) as HTMLButtonElement
    expect(commit.disabled).toBe(true)
  })

  it('commits the same rows it previewed, with the dry run flipped off', async () => {
    await pasteAndPreview()
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(1))
    const previewArgs = rpc.mock.calls[0][1] as Record<string, unknown>

    const commit = await screen.findByRole('button', { name: /^Import 2 rows$/i })
    await waitFor(() => expect((commit as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(commit)

    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(2))
    const commitArgs = rpc.mock.calls[1][1] as Record<string, unknown>
    expect(commitArgs.p_dry_run).toBe(false)
    // Same payload both times — a preview that disagreed with the commit would
    // be worse than no preview.
    expect(commitArgs.p_rows).toEqual(previewArgs.p_rows)
    expect(commitArgs.p_supplier_id).toBe(previewArgs.p_supplier_id)
    expect(commitArgs.p_source).toBe(previewArgs.p_source)
  })
})
