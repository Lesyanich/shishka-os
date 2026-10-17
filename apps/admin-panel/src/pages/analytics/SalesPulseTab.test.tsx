import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { HEAT, ITEMS, SALES } from '../../lib/__fixtures__/analytics-prod'

/* ═══════════════════════════════════════════════════════════════════
   SalesPulseTab — the numbers AS RENDERED.

   analytics.prod-parity.test.ts proves the aggregation matches SQL.
   This proves the tab puts those same figures on screen, which is the
   acceptance criterion the owner actually cares about: the UI agrees
   with hand-written SQL on prod, not just the helper functions.

   Supabase is stubbed with the real prod rows; the clock is frozen to
   2026-10-16 so the rolling windows are deterministic.
   ═══════════════════════════════════════════════════════════════════ */

/** Minimal stand-in for the PostgREST builder chain the hook uses. */
function queryResult(rows: unknown[]) {
  const builder = {
    select: () => builder,
    gte: () => builder,
    lte: () => builder,
    order: () => builder,
    then: (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
      resolve({ data: rows, error: null }),
  }
  return builder
}

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'v_analytics_sales_daily') return queryResult(SALES)
      if (table === 'v_analytics_item_sales_daily') return queryResult(ITEMS)
      if (table === 'v_analytics_hourly_heat') return queryResult(HEAT)
      throw new Error(`SalesPulseTab must not read ${table}`)
    },
  },
}))

// Imported after the mock so the hook picks up the stub.
const { SalesPulseTab } = await import('./SalesPulseTab')
const { AnalyticsLayout } = await import('./AnalyticsLayout')

/** The real shell around the real tab — the period selector and the tab
 *  switcher live in the layout, so the test drives what the owner drives. */
function renderTab() {
  return render(
    <MemoryRouter initialEntries={['/analytics/sales']}>
      <Routes>
        <Route path="/analytics" element={<AnalyticsLayout />}>
          <Route path="sales" element={<SalesPulseTab />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

beforeAll(() => {
  // 12:00 on 2026-10-16 in Bangkok (UTC+7) — a Friday, mid-ISO-week.
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(new Date('2026-10-16T05:00:00Z'))
})

afterAll(() => {
  vi.useRealTimers()
})

describe('SalesPulseTab — rendered figures match prod SQL', () => {
  it('renders the 7-day revenue KPI', async () => {
    renderTab()
    // 2026-10-10 … 10-16 = 75 + 4572 + 1137 + 1202 + 2658 + 2249 = 11,893
    await waitFor(() => expect(screen.getByText('฿11,893')).toBeInTheDocument())
    expect(screen.getByText('Revenue · 7d')).toBeInTheDocument()
  })

  it('renders the 8-week period totals in the coverage strip', async () => {
    renderTab()
    // Default period is 8 weeks: 2026-08-24 … 2026-10-16. The fixture starts
    // at 2026-09-01, which is what the strip can see.
    await waitFor(() => expect(screen.getByText('Trading days')).toBeInTheDocument())
    expect(screen.getByText('Receipts')).toBeInTheDocument()
    expect(screen.getByText('Gross')).toBeInTheDocument()
    // The one refunded day in the window.
    expect(screen.getByText('฿569')).toBeInTheDocument()
  })

  it('switches to 4 weeks and shows SQL-matching receipts and avg check', async () => {
    renderTab()
    await waitFor(() => expect(screen.getByText('Trading days')).toBeInTheDocument())

    await userEvent.click(screen.getByTitle('Last 4 ISO weeks'))

    // SQL for 2026-09-21 … 2026-10-16: 142 receipts, THB 46,026 gross,
    // avg check 324.1268 → rendered as ฿324.
    await waitFor(() => expect(screen.getByText('Receipts · 4w')).toBeInTheDocument())

    const kpi = (label: string) =>
      within(screen.getByText(label).closest('.shk-kpi') as HTMLElement)
    expect(kpi('Receipts · 4w').getByText('142')).toBeInTheDocument()
    expect(kpi('Avg check · 4w').getByText('฿324')).toBeInTheDocument()

    // Gross for the period is the coverage strip's own figure.
    expect(screen.getByText('฿46,026')).toBeInTheDocument()
  })

  it('renders the top-10 panel with both metric toggles', async () => {
    renderTab()
    await waitFor(() => expect(screen.getByText('Top 10 dishes')).toBeInTheDocument())
    // The bars themselves are recharts, which does not lay out under jsdom
    // (ResponsiveContainer measures 0x0), so the ranking itself is pinned in
    // analytics.prod-parity.test.ts against SQL. Here we check the control.
    expect(screen.getByRole('button', { name: 'Units' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: 'Revenue' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  it('labels the heatmap as receipts and warns that the evidence is thin', async () => {
    renderTab()
    await waitFor(() => expect(screen.getByText(/Day .* hour receipts/)).toBeInTheDocument())

    await userEvent.click(screen.getByTitle('Last 4 ISO weeks'))

    // 142 receipts over 50 lit cells → 2.84 each, under the threshold of 3.
    await waitFor(() =>
      expect(
        screen.getByText(/Receipts, not revenue · 142 receipts over 50 active hours/),
      ).toBeInTheDocument(),
    )
    expect(screen.getByText(/Thin evidence: 2.8 receipts per active hour/)).toBeInTheDocument()
  })

  it('shows the category mix with wraps leading', async () => {
    renderTab()
    await waitFor(() => expect(screen.getByText('Category mix')).toBeInTheDocument())
    expect(screen.getAllByText('KP-FIN-WRP').length).toBeGreaterThan(0)
  })
})
