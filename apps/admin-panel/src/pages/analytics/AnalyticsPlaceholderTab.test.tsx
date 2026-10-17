import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import {
  AnalyticsPlaceholderTab,
  PurchasesTabPlaceholder,
  StockControlTabPlaceholder,
} from './AnalyticsPlaceholderTab'

describe('AnalyticsPlaceholderTab', () => {
  it('says plainly that the tab is not built, and which phase ships it', () => {
    render(
      <AnalyticsPlaceholderTab title="Purchases" phase="S3" taskId="399488b2" widgets={['a widget']} />,
    )
    expect(screen.getByText('Purchases — not built yet')).toBeInTheDocument()
    expect(screen.getByText('S3')).toBeInTheDocument()
    expect(screen.getByText('399488b2')).toBeInTheDocument()
  })

  it('lists the planned widgets so the tab is not just blank', () => {
    render(
      <AnalyticsPlaceholderTab
        title="X"
        phase="S9"
        taskId="abc"
        widgets={['first widget', 'second widget']}
      />,
    )
    expect(screen.getByText('first widget')).toBeInTheDocument()
    expect(screen.getByText('second widget')).toBeInTheDocument()
  })

  it('omits the blocker note when there is no blocker', () => {
    render(<AnalyticsPlaceholderTab title="X" phase="S9" taskId="abc" widgets={['w']} />)
    expect(screen.queryByText(/Blocked on the floor/)).not.toBeInTheDocument()
  })
})

describe('PurchasesTabPlaceholder', () => {
  it('points at S3 and names the coverage strip it will open with', () => {
    render(<PurchasesTabPlaceholder />)
    expect(screen.getByText('399488b2')).toBeInTheDocument()
    expect(screen.getByText(/share on canonical items/)).toBeInTheDocument()
  })
})

describe('StockControlTabPlaceholder', () => {
  it('points at S4 and leads with the variance table', () => {
    render(<StockControlTabPlaceholder />)
    expect(screen.getByText('d8c02f8c')).toBeInTheDocument()
    expect(screen.getByText(/Variance table/)).toBeInTheDocument()
  })

  it('states the floor prerequisite, so an empty tab is not read as a bug', () => {
    render(<StockControlTabPlaceholder />)
    expect(screen.getByText(/Blocked on the floor/)).toBeInTheDocument()
    expect(screen.getByText(/at least two complete count days/)).toBeInTheDocument()
  })
})
