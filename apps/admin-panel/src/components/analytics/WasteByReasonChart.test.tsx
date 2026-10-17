import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { periodRange } from '../../lib/analytics'
import { wasteSummary, type WasteWeekRow } from '../../lib/analyticsStock'
import { WASTE } from '../../lib/__fixtures__/analytics-stock-prod'
import { WasteByReasonChart } from './WasteByReasonChart'

const RANGE = periodRange(8, '2026-10-16')

describe('WasteByReasonChart — empty on prod', () => {
  it('distinguishes "none recorded" from "no waste"', () => {
    render(<WasteByReasonChart summary={wasteSummary(WASTE, RANGE)} isLoading={false} />)
    expect(screen.getByText('No waste has been logged')).toBeInTheDocument()
    expect(screen.getByText(/none recorded/)).toBeInTheDocument()
  })

  it('says what that does to the variance numbers', () => {
    render(<WasteByReasonChart summary={wasteSummary(WASTE, RANGE)} isLoading={false} />)
    expect(screen.getByText(/counts binned stock as missing stock/)).toBeInTheDocument()
  })

  it('points at the open floor routine rather than blaming the app', () => {
    render(<WasteByReasonChart summary={wasteSummary(WASTE, RANGE)} isLoading={false} />)
    expect(screen.getByText(/all exist; logging them is the open floor/)).toBeInTheDocument()
  })
})

describe('WasteByReasonChart — with entries', () => {
  const rows: WasteWeekRow[] = [
    {
      week: '2026-10-12',
      reason: 'expiration',
      entries: 3,
      items: 2,
      qty: 4,
      thb: 500,
      thb_liability_cafe: 400,
      thb_liability_employee: 100,
      thb_liability_supplier: 0,
    },
    {
      week: '2026-10-12',
      reason: 'spillage_damage',
      entries: 1,
      items: 1,
      qty: 1,
      thb: 80,
      thb_liability_cafe: 80,
      thb_liability_employee: 0,
      thb_liability_supplier: 0,
    },
  ]
  const summary = wasteSummary(rows, RANGE)

  it('totals the waste and the entries', () => {
    render(<WasteByReasonChart summary={summary} isLoading={false} />)
    expect(screen.getByText(/฿580 over 4 entries/)).toBeInTheDocument()
  })

  it('gives each reason a readable label, biggest first', () => {
    render(<WasteByReasonChart summary={summary} isLoading={false} />)
    expect(screen.getByText('Expired')).toBeInTheDocument()
    expect(screen.getByText('Spilled or damaged')).toBeInTheDocument()
  })

  it('shows the liability split', () => {
    render(<WasteByReasonChart summary={summary} isLoading={false} />)
    expect(screen.getByText(/café ฿480 · employee ฿100 · supplier ฿0/)).toBeInTheDocument()
  })
})
