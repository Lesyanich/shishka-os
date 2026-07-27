import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { POLineEditor } from './POLineEditor'
import type { POLine, Station } from '../../types/procurement'

const stations: Station[] = [
  { id: 'st-1', code: 'bar', name: 'Bar', floor: 'L2' },
  { id: 'st-2', code: 'kitchen', name: 'Kitchen', floor: 'L1' },
]

const line: POLine = {
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
  destination_station_id: 'st-1',
  sort_order: 1,
  notes: null,
}

function setup(over?: { editable?: boolean; line?: Partial<POLine> }) {
  const onPatch = vi.fn()
  const onRemove = vi.fn()
  render(
    <POLineEditor
      line={{ ...line, ...over?.line }}
      stations={stations}
      editable={over?.editable ?? true}
      onPatch={onPatch}
      onRemove={onRemove}
    />,
  )
  return { onPatch, onRemove }
}

afterEach(cleanup)

describe('POLineEditor', () => {
  it('sends the new quantity once the field is committed', () => {
    const { onPatch } = setup()
    const qty = screen.getByLabelText(/Quantity of Bell pepper red/)
    fireEvent.change(qty, { target: { value: '8' } })
    fireEvent.blur(qty)
    expect(onPatch).toHaveBeenCalledWith({ id: 'line-1', qty_ordered: 8 })
  })

  it('refuses a zero or negative quantity locally and restores the old value', () => {
    const { onPatch } = setup()
    const qty = screen.getByLabelText(/Quantity of Bell pepper red/) as HTMLInputElement
    fireEvent.change(qty, { target: { value: '0' } })
    fireEvent.blur(qty)
    expect(onPatch).not.toHaveBeenCalled()
    expect(qty.value).toBe('5')
  })

  it('stays silent when the committed value did not actually change', () => {
    const { onPatch } = setup()
    const qty = screen.getByLabelText(/Quantity of Bell pepper red/)
    fireEvent.blur(qty)
    expect(onPatch).not.toHaveBeenCalled()
  })

  it('steps the quantity up', () => {
    const { onPatch } = setup({ line: { qty_ordered: 1 } })
    fireEvent.click(screen.getByLabelText('Increase quantity'))
    expect(onPatch).toHaveBeenCalledWith({ id: 'line-1', qty_ordered: 2 })
  })

  it('will not step the last unit away — the RPC rejects qty 0 anyway', () => {
    const { onPatch } = setup({ line: { qty_ordered: 1 } })
    fireEvent.click(screen.getByLabelText('Decrease quantity'))
    expect(onPatch).not.toHaveBeenCalled()
  })

  it('clears the price when the field is emptied', () => {
    const { onPatch } = setup()
    const price = screen.getByLabelText(/Unit price of Bell pepper red/)
    fireEvent.change(price, { target: { value: '' } })
    fireEvent.blur(price)
    expect(onPatch).toHaveBeenCalledWith({ id: 'line-1', unit_price_expected: null })
  })

  it('reassigns the destination station', () => {
    const { onPatch } = setup()
    fireEvent.change(screen.getByLabelText(/Destination for Bell pepper red/), {
      target: { value: 'st-2' },
    })
    expect(onPatch).toHaveBeenCalledWith({ id: 'line-1', destination_station_id: 'st-2' })
  })

  it('removes the line', () => {
    const { onRemove } = setup()
    fireEvent.click(screen.getByLabelText('Remove Bell pepper red'))
    expect(onRemove).toHaveBeenCalledWith('line-1')
  })

  it('drops every edit control once the order is past editing', () => {
    setup({ editable: false })
    expect(screen.queryByLabelText(/Quantity of/)).toBeNull()
    expect(screen.queryByLabelText('Remove Bell pepper red')).toBeNull()
    // still readable: quantity, price and the unload point
    expect(screen.getByText('5 kg')).toBeTruthy()
    expect(screen.getByText(/→ Bar · L2/)).toBeTruthy()
  })
})
