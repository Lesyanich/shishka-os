import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { FilterChip, type FilterChipOption } from './FilterChip'

const opts: FilterChipOption<string>[] = [
  { value: 'a', label: 'Alpha', count: 3 },
  { value: 'b', label: 'Beta', count: 1 },
]

describe('FilterChip', () => {
  it('renders label and active count badge', () => {
    render(<FilterChip label="Cats" options={opts} selectedValues={['a']} onChange={() => {}} />)
    expect(screen.getByRole('button', { name: /Cats/ })).toBeInTheDocument()
    expect(screen.getByText('1')).toBeInTheDocument() // active count badge
  })

  it('toggles option on click in multi mode', () => {
    let selected: string[] = []
    const handler = (v: string[]) => { selected = v }
    render(<FilterChip label="Cats" options={opts} selectedValues={[]} onChange={handler} />)
    fireEvent.click(screen.getByRole('button', { name: /Cats/ }))
    fireEvent.click(screen.getByLabelText(/Alpha/))
    expect(selected).toEqual(['a'])
  })

  it('single mode replaces value', () => {
    let selected: string[] = ['a']
    const handler = (v: string[]) => { selected = v }
    render(<FilterChip label="Avail" mode="single" options={opts} selectedValues={['a']} onChange={handler} />)
    fireEvent.click(screen.getByRole('button', { name: /Avail/ }))
    fireEvent.click(screen.getByLabelText(/Beta/))
    expect(selected).toEqual(['b'])
  })
})
