import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { HEAT } from '../../lib/__fixtures__/analytics-prod'
import { heatGrid, periodRange } from '../../lib/analytics'
import { HourHeatmap } from './HourHeatmap'

const RANGE = periodRange(4, '2026-10-16')
const GRID = heatGrid(HEAT, RANGE)

describe('HourHeatmap', () => {
  it('states that it plots receipts, with the evidence behind the grid', () => {
    render(<HourHeatmap grid={GRID} isLoading={false} />)
    expect(
      screen.getByText(/Receipts, not revenue · 142 receipts over 50 active hours/),
    ).toBeInTheDocument()
  })

  it('shows all seven weekdays, including days that never traded', () => {
    render(<HourHeatmap grid={GRID} isLoading={false} />)
    for (const day of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']) {
      expect(screen.getByText(day)).toBeInTheDocument()
    }
  })

  it('names the busiest hour, which SQL puts at 7 receipts', () => {
    render(<HourHeatmap grid={GRID} isLoading={false} />)
    expect(screen.getByText(/Busiest hour/).textContent).toContain('7')
  })

  it('warns in words when the grid is too thin to read cell by cell', () => {
    render(<HourHeatmap grid={GRID} isLoading={false} />)
    // 142 receipts over 50 lit cells = 2.84 each, under the threshold of 3.
    expect(screen.getByText(/Thin evidence: 2.8 receipts per active hour/)).toBeInTheDocument()
  })

  it('drops the warning once the evidence is thick enough', () => {
    const dense = heatGrid(
      [{ iso_dow: 1, dow_label: 'Mon', hour_local: 12, receipts: 40, revenue: 0, week: '2026-10-12' }],
      RANGE,
    )
    render(<HourHeatmap grid={dense} isLoading={false} />)
    expect(screen.queryByText(/Thin evidence/)).not.toBeInTheDocument()
  })

  it('is a real table, so a screen reader can follow the grid', () => {
    const { container } = render(<HourHeatmap grid={GRID} isLoading={false} />)
    expect(container.querySelector('table')).toBeTruthy()
    expect(container.querySelectorAll('th[scope="row"]')).toHaveLength(7)
    expect(container.querySelectorAll('th[scope="col"]').length).toBeGreaterThan(1)
    // Colour is never the only signal — each cell is titled with its count.
    expect(container.querySelectorAll('td[title]').length).toBeGreaterThan(0)
  })

  it('says nothing traded rather than drawing an empty grid', () => {
    render(<HourHeatmap grid={heatGrid([], RANGE)} isLoading={false} />)
    expect(screen.getByText('No receipts in this period')).toBeInTheDocument()
  })
})
