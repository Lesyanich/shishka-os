import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react'
import { SearchableSelect } from './SearchableSelect'

/**
 * Replaces native <select> where the list is too long to scan — 80 suppliers,
 * hundreds of products. The behaviour that matters: typing narrows the list,
 * the product code is searchable (it is what supplier paperwork shows), and
 * the panel can always be escaped.
 */

const options = [
  { value: 's1', label: 'DOY FRESH', sublabel: 'vegetables' },
  { value: 's2', label: 'Makro', sublabel: 'wholesale' },
  { value: 's3', label: 'Chicken breast', sublabel: 'RAW-CHK-BR' },
]

function setup(value = '') {
  const onChange = vi.fn()
  render(
    <SearchableSelect label="Supplier" value={value} onChange={onChange} options={options} />,
  )
  return { onChange }
}

const open = () => fireEvent.click(screen.getByRole('button', { name: 'Supplier' }))
const list = () => screen.getByRole('listbox')
const search = () => screen.getByLabelText('Search Supplier')

afterEach(cleanup)

describe('SearchableSelect', () => {
  it('shows the placeholder until something is picked', () => {
    setup()
    expect(screen.getByRole('button', { name: 'Supplier' }).textContent).toContain('Select…')
  })

  it('shows the chosen option', () => {
    setup('s2')
    expect(screen.getByRole('button', { name: 'Supplier' }).textContent).toContain('Makro')
  })

  it('lists everything before a query is typed', () => {
    setup()
    open()
    expect(within(list()).getAllByRole('option')).toHaveLength(3)
  })

  it('narrows the list as you type', () => {
    setup()
    open()
    fireEvent.change(search(), { target: { value: 'mak' } })

    const shown = within(list()).getAllByRole('option')
    expect(shown).toHaveLength(1)
    expect(shown[0].textContent).toContain('Makro')
  })

  it('finds an item by its product code, not just its name', () => {
    setup()
    open()
    fireEvent.change(search(), { target: { value: 'RAW-CHK' } })

    const shown = within(list()).getAllByRole('option')
    expect(shown).toHaveLength(1)
    expect(shown[0].textContent).toContain('Chicken breast')
  })

  it('says so when nothing matches instead of showing an empty box', () => {
    setup()
    open()
    fireEvent.change(search(), { target: { value: 'zzzz' } })

    expect(within(list()).queryAllByRole('option')).toHaveLength(0)
    expect(screen.getByText('Nothing matches')).toBeTruthy()
  })

  it('reports how much of the list is hidden by the filter', () => {
    setup()
    open()
    fireEvent.change(search(), { target: { value: 'mak' } })
    expect(screen.getByText('1 of 3')).toBeTruthy()
  })

  it('returns the picked value and closes', () => {
    const { onChange } = setup()
    open()
    fireEvent.click(screen.getByText('DOY FRESH'))

    expect(onChange).toHaveBeenCalledWith('s1')
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('closes on Escape without choosing anything', () => {
    const { onChange } = setup()
    open()
    fireEvent.keyDown(document, { key: 'Escape' })

    expect(screen.queryByRole('listbox')).toBeNull()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('drops the query when reopened, so the last search does not linger', () => {
    setup()
    open()
    fireEvent.change(search(), { target: { value: 'mak' } })
    fireEvent.keyDown(document, { key: 'Escape' })
    open()

    expect((search() as HTMLInputElement).value).toBe('')
    expect(within(list()).getAllByRole('option')).toHaveLength(3)
  })

  it('cannot be opened when disabled', () => {
    render(
      <SearchableSelect
        label="Item"
        value=""
        onChange={vi.fn()}
        options={options}
        disabled
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Item' }))
    expect(screen.queryByRole('listbox')).toBeNull()
  })
})
