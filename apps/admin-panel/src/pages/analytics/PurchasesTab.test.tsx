import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import {
  ABC_ITEMS,
  COVERAGE,
  FOOD_COST,
  PRICE_WATCH,
  PURCHASES,
} from '../../lib/__fixtures__/analytics-purchases-prod'

/* ═══════════════════════════════════════════════════════════════════
   PurchasesTab — the numbers AS RENDERED.

   analyticsPurchases.prod-parity.test.ts proves the aggregation
   matches hand-written SQL. This proves the tab puts those same
   figures on screen, driving the real shell and period selector.
   ═══════════════════════════════════════════════════════════════════ */

function result(rows: unknown[]) {
  const builder: Record<string, unknown> = {
    select: () => builder,
    gte: () => builder,
    lte: () => builder,
    gt: () => builder,
    order: () => builder,
    limit: () => builder,
    then: (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
      resolve({ data: rows, error: null }),
  }
  return builder
}

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      switch (table) {
        case 'v_analytics_purchases_weekly':
          return result(PURCHASES)
        case 'v_analytics_purchase_coverage_weekly':
          return result(COVERAGE)
        case 'v_analytics_price_watch':
          return result(PRICE_WATCH)
        case 'v_analytics_abc_items':
          return result(ABC_ITEMS)
        case 'v_analytics_food_cost_weekly':
          return result(FOOD_COST)
        case 'bom_structures':
          // Mirrors the fixture: only the canonical items are consumed.
          return result(
            ABC_ITEMS.filter((r) => r.has_bom).map((r) => ({ ingredient_id: r.nomenclature_id })),
          )
        default:
          throw new Error(`PurchasesTab must not read ${table}`)
      }
    },
  },
}))

const { PurchasesTab } = await import('./PurchasesTab')
const { AnalyticsLayout } = await import('./AnalyticsLayout')

function renderTab() {
  return render(
    <MemoryRouter initialEntries={['/analytics/purchases']}>
      <Routes>
        <Route path="/analytics" element={<AnalyticsLayout />}>
          <Route path="purchases" element={<PurchasesTab />} />
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

describe('PurchasesTab — rendered figures match prod SQL', () => {
  it('renders the coverage strip with the SQL-verified spend and share', async () => {
    renderTab()
    // SQL for 2026-08-24 … 2026-10-16: THB 22,984.50 over 149 lines, 21.19 % canonical.
    // The figure shows twice — strip and KPI — and the two agreeing is the point.
    await waitFor(() => expect(screen.getAllByText('฿22,985')).toHaveLength(2))
    expect(screen.getByText('39 of 149')).toBeInTheDocument()
  })

  it('puts the purchase total and canonical share in the KPI strip', async () => {
    renderTab()
    await waitFor(() => expect(screen.getByText('Purchased · 8w')).toBeInTheDocument())

    // "On canonical items" labels both a strip fact and a KPI card, so pick
    // the occurrence that sits inside a KPI tile.
    const kpi = (label: string) => {
      const card = screen
        .getAllByText(label)
        .map((el) => el.closest('.shk-kpi'))
        .find((el): el is HTMLElement => el !== null)
      expect(card).toBeTruthy()
      return within(card as HTMLElement)
    }
    expect(kpi('Purchased · 8w').getByText('฿22,985')).toBeInTheDocument()
    expect(kpi('On canonical items').getByText('21.2%')).toBeInTheDocument()
  })

  it('leads the supplier table with Makro at its SQL spend', async () => {
    renderTab()
    await waitFor(() => expect(screen.getByText('Suppliers')).toBeInTheDocument())
    expect(screen.getByText('17,298')).toBeInTheDocument()
    expect(screen.getByText('+76%')).toBeInTheDocument()
  })

  it('warns that most of the purchase money is unattributable', async () => {
    renderTab()
    await waitFor(() => expect(screen.getByText(/auto-created stub lines/)).toBeInTheDocument())
    expect(screen.getByText(/not what the kitchen actually uses/)).toBeInTheDocument()
  })

  it('flags the spike that can be acted on and the one that cannot', async () => {
    renderTab()
    await waitFor(() => expect(screen.getByText('Price watch')).toBeInTheDocument())
    expect(screen.getByText('Short Cucumber 500 g')).toBeInTheDocument()
    expect(screen.getByText(/Pack size unresolved/)).toBeInTheDocument()
  })

  it('re-renders on the period selector', async () => {
    renderTab()
    await waitFor(() => expect(screen.getByText('Purchased · 8w')).toBeInTheDocument())

    await userEvent.click(screen.getByTitle('Last 4 ISO weeks'))
    await waitFor(() => expect(screen.getByText('Purchased · 4w')).toBeInTheDocument())
    // The 4-week window is a strict subset, so the total must fall.
    expect(screen.queryByText('฿22,985')).not.toBeInTheDocument()
  })

  it('says which panels the selector does not govern', async () => {
    renderTab()
    await waitFor(() => expect(screen.getByText('Price watch')).toBeInTheDocument())
    // Once for price watch, once for top-20.
    expect(screen.getAllByText(/not affected by the period above/)).toHaveLength(2)
  })
})
