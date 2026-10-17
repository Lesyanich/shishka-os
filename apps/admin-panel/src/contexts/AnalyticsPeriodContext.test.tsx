import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AnalyticsPeriodProvider, useAnalyticsPeriod } from './AnalyticsPeriodContext'

function Probe() {
  const { weeks, setWeeks, setCustomRange, clearCustomRange, range } = useAnalyticsPeriod()
  return (
    <div>
      <span data-testid="weeks">{String(weeks)}</span>
      <span data-testid="start">{range.start}</span>
      <span data-testid="end">{range.end}</span>
      <span data-testid="mode">{range.mode}</span>
      <span data-testid="label">{range.label}</span>
      <span data-testid="span">{range.weekStarts.length}</span>
      <button type="button" onClick={() => setWeeks(13)}>
        go 13
      </button>
      <button type="button" onClick={() => setCustomRange('2026-10-01', '2026-10-15')}>
        go custom
      </button>
      <button type="button" onClick={clearCustomRange}>
        clear
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

  it('switches to a custom range and reports it as such', async () => {
    render(
      <AnalyticsPeriodProvider>
        <Probe />
      </AnalyticsPeriodProvider>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'go custom' }))

    expect(screen.getByTestId('mode')).toHaveTextContent('custom')
    expect(screen.getByTestId('start')).toHaveTextContent('2026-10-01')
    expect(screen.getByTestId('end')).toHaveTextContent('2026-10-15')
    expect(screen.getByTestId('label')).toHaveTextContent('1 – 15 Oct')
    // No preset is active, so there is no week count to report.
    expect(screen.getByTestId('weeks')).toHaveTextContent('null')
  })

  it('clears a custom range back to the 8-week preset', async () => {
    render(
      <AnalyticsPeriodProvider>
        <Probe />
      </AnalyticsPeriodProvider>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'go custom' }))
    await userEvent.click(screen.getByRole('button', { name: 'clear' }))

    expect(screen.getByTestId('mode')).toHaveTextContent('preset')
    expect(screen.getByTestId('weeks')).toHaveTextContent('8')
  })

  it('refuses to be used outside its provider instead of returning a default', () => {
    // A tab rendered outside the shell would otherwise silently show a period
    // nobody selected.
    expect(() => render(<Probe />)).toThrow(/must be used inside/)
  })
})
