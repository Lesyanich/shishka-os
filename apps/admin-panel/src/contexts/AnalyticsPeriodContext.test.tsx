import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AnalyticsPeriodProvider, useAnalyticsPeriod } from './AnalyticsPeriodContext'

function Probe() {
  const { weeks, setWeeks, range } = useAnalyticsPeriod()
  return (
    <div>
      <span data-testid="weeks">{weeks}</span>
      <span data-testid="start">{range.start}</span>
      <span data-testid="span">{range.weekStarts.length}</span>
      <button type="button" onClick={() => setWeeks(13)}>
        go 13
      </button>
    </div>
  )
}

describe('AnalyticsPeriodContext', () => {
  it('opens on 8 weeks', () => {
    render(
      <AnalyticsPeriodProvider>
        <Probe />
      </AnalyticsPeriodProvider>,
    )
    expect(screen.getByTestId('weeks')).toHaveTextContent('8')
    expect(screen.getByTestId('span')).toHaveTextContent('8')
  })

  it('derives a new range when the selector moves', async () => {
    render(
      <AnalyticsPeriodProvider>
        <Probe />
      </AnalyticsPeriodProvider>,
    )
    const firstStart = screen.getByTestId('start').textContent

    await userEvent.click(screen.getByRole('button', { name: 'go 13' }))

    expect(screen.getByTestId('weeks')).toHaveTextContent('13')
    expect(screen.getByTestId('span')).toHaveTextContent('13')
    // A longer period must reach further back, never forward.
    expect(screen.getByTestId('start').textContent! < firstStart!).toBe(true)
  })

  it('always starts the period on a Monday', () => {
    render(
      <AnalyticsPeriodProvider>
        <Probe />
      </AnalyticsPeriodProvider>,
    )
    const start = new Date(`${screen.getByTestId('start').textContent}T00:00:00Z`)
    expect(start.getUTCDay()).toBe(1)
  })

  it('refuses to be used outside its provider instead of returning a default', () => {
    // A tab rendered outside the shell would otherwise silently show a period
    // nobody selected.
    expect(() => render(<Probe />)).toThrow(/must be used inside/)
  })
})
