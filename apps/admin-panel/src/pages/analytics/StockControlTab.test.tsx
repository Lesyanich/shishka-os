import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import {
  BOM_COVERAGE,
  COUNT_DAYS,
  INVENTORY,
  REPLENISHMENT,
  STOCK_STATUS,
  VARIANCE,
  WASTE,
} from '../../lib/__fixtures__/analytics-stock-prod'
import { FOOD_COST } from '../../lib/__fixtures__/analytics-purchases-prod'

/* ═══════════════════════════════════════════════════════════════════
   StockControlTab — the numbers AS RENDERED, and above all the empty
   state: this tab's defining behaviour today is explaining what it
   cannot yet show.
   ═══════════════════════════════════════════════════════════════════ */

function result(rows: unknown[]) {
  const builder: Record<string, unknown> = {
    select: () => builder,
    order: () => builder,
    gte: () => builder,
    lte: () => builder,
    then: (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
      resolve({ data: rows, error: null }),
  }
  return builder
}

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      switch (table) {
        case 'v_analytics_stock_variance':
          return result(VARIANCE)
        case 'v_analytics_count_days':
          return result(COUNT_DAYS)
        case 'v_analytics_inventory_value':
          return result(INVENTORY)
        case 'v_analytics_waste_weekly':
          return result(WASTE)
        case 'v_analytics_bom_coverage_weekly':
          return result(BOM_COVERAGE)
        case 'v_analytics_food_cost_weekly':
          return result(FOOD_COST)
        case 'v_station_replenishment':
          return result(REPLENISHMENT)
        case 'v_stock_status':
          return result(STOCK_STATUS)
        default:
          throw new Error(`StockControlTab must not read ${table}`)
      }
    },
  },
}))

const { StockControlTab } = await import('./StockControlTab')
const { AnalyticsLayout } = await import('./AnalyticsLayout')

function renderTab() {
  return render(
    <MemoryRouter initialEntries={['/analytics/stock']}>
      <Routes>
        <Route path="/analytics" element={<AnalyticsLayout />}>
          <Route path="stock" element={<StockControlTab />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

beforeAll(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(new Date('2026-10-16T05:00:00Z'))
})

afterAll(() => {
  vi.useRealTimers()
})

describe('StockControlTab', () => {
  it('explains the empty variance table instead of showing a spinner or a zero', async () => {
    renderTab()
    await waitFor(() =>
      expect(screen.getByText('Waiting on a second stock count')).toBeInTheDocument(),
    )
    expect(screen.getByText(/weekly floor routine/)).toBeInTheDocument()
  })

  it('renders the SQL-verified inventory total and its locations', async () => {
    renderTab()
    await waitFor(() => expect(screen.getByText('Inventory value')).toBeInTheDocument())
    // THB 19,014.83 over 122 lines; Fridge 10,946, Bar 6,418.
    expect(screen.getAllByText('฿19,015').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('฿10,946')).toBeInTheDocument()
    expect(screen.getByText('฿6,418')).toBeInTheDocument()
  })

  it('says the inventory total is a floor, not the holding', async () => {
    renderTab()
    await waitFor(() => expect(screen.getByText('14 of 122')).toBeInTheDocument())
    expect(screen.getByText(/this total is a floor, not the holding/)).toBeInTheDocument()
  })

  it('reports the count age in the strip and the KPI', async () => {
    renderTab()
    await waitFor(() => expect(screen.getByText('Count age')).toBeInTheDocument())
    const card = screen
      .getAllByText('Count age')
      .map((el) => el.closest('.shk-kpi'))
      .find((el): el is HTMLElement => el !== null)!
    expect(within(card).getByText('46 days')).toBeInTheDocument()
  })

  it('distinguishes no waste logged from no waste', async () => {
    renderTab()
    await waitFor(() => expect(screen.getByText('No waste has been logged')).toBeInTheDocument())
    expect(screen.getByText(/counts binned stock as missing stock/)).toBeInTheDocument()
  })

  it('shows the one item below par and nothing expiring', async () => {
    renderTab()
    await waitFor(() => expect(screen.getByText('Chia Seeds')).toBeInTheDocument())
    expect(screen.getByText('Nothing flagged as expiring or expired')).toBeInTheDocument()
  })

  it('reports the BOM coverage the view gives', async () => {
    renderTab()
    await waitFor(() => expect(screen.getByText('89.8%')).toBeInTheDocument())
  })

  it('warns that the food-cost gap is not shrinkage yet', async () => {
    renderTab()
    await waitFor(() =>
      expect(screen.getByText(/spend\s+not yet linked to an item/)).toBeInTheDocument(),
    )
  })
})
