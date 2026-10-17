import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AnalyticsPeriodProvider, useAnalyticsPeriod } from '../../contexts/AnalyticsPeriodContext'
import { SALES_WINDOW_START } from '../../lib/analytics'
import { PeriodPicker } from './PeriodPicker'

/* The picker reads "today" from the real clock, so it is frozen here. */

function Readout() {
  const { range } = useAnalyticsPeriod()
  return (
    <div>
      <span data-testid="mode">{range.mode}</span>
      <span data-testid="label">{range.label}</span>
      <span data-testid="start">{range.start}</span>
      <span data-testid="end">{range.end}</span>
      <span data-testid="snapped">{String(range.snappedToWeeks)}</span>
    </div>
  )
}

function renderPicker() {
  return render(
    <AnalyticsPeriodProvider>
      <PeriodPicker />
      <Readout />
    </AnalyticsPeriodProvider>,
  )
}

beforeAll(() => {
  // 12:00 on 2026-10-16 in Bangkok (UTC+7).
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(new Date('2026-10-16T05:00:00Z'))
})

afterAll(() => {
  vi.useRealTimers()
})

describe('PeriodPicker', () => {
  it('opens on the 8-week preset', () => {
    renderPicker()
    expect(screen.getByTitle('Last 8 ISO weeks')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('mode')).toHaveTextContent('preset')
    expect(screen.getByTestId('label')).toHaveTextContent('8w')
  })

  it('still switches presets', async () => {
    renderPicker()
    await userEvent.click(screen.getByTitle('Last 13 ISO weeks'))
    expect(screen.getByTestId('label')).toHaveTextContent('13w')
    expect(screen.getByTestId('snapped')).toHaveTextContent('false')
  })

  it('applies a custom from–to range', async () => {
    renderPicker()
    const from = screen.getByLabelText('From date')
    const to = screen.getByLabelText('To date')

    await userEvent.clear(from)
    await userEvent.type(from, '2026-10-01')
    await userEvent.clear(to)
    await userEvent.type(to, '2026-10-15')
    await userEvent.click(screen.getByRole('button', { name: 'Apply' }))

    await waitFor(() => expect(screen.getByTestId('mode')).toHaveTextContent('custom'))
    expect(screen.getByTestId('start')).toHaveTextContent('2026-10-01')
    expect(screen.getByTestId('end')).toHaveTextContent('2026-10-15')
    expect(screen.getByTestId('label')).toHaveTextContent('1 – 15 Oct')
    // Mid-week both ends, so week-grain panels must disclose the widening.
    expect(screen.getByTestId('snapped')).toHaveTextContent('true')
  })

  it('refuses a start after the end, and says which field is wrong', async () => {
    renderPicker()
    const from = screen.getByLabelText('From date')
    await userEvent.clear(from)
    await userEvent.type(from, '2026-10-20')

    expect(screen.getByText('Start date is after the end date')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled()
    expect(from).toHaveAttribute('aria-invalid', 'true')
  })

  it('explains a window before any sales rather than drawing an empty tab', async () => {
    renderPicker()
    const from = screen.getByLabelText('From date')
    const to = screen.getByLabelText('To date')
    await userEvent.clear(from)
    await userEvent.type(from, '2026-01-01')
    await userEvent.clear(to)
    await userEvent.type(to, '2026-02-01')

    expect(screen.getByText(new RegExp(SALES_WINDOW_START))).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled()
  })

  it('bounds the inputs to the sales window and today', () => {
    renderPicker()
    for (const field of ['From date', 'To date']) {
      expect(screen.getByLabelText(field)).toHaveAttribute('min', SALES_WINDOW_START)
      expect(screen.getByLabelText(field)).toHaveAttribute('max', '2026-10-16')
    }
  })

  it('offers month shortcuts that set a real range', async () => {
    renderPicker()
    await userEvent.click(screen.getByRole('button', { name: 'Month to date' }))

    await waitFor(() => expect(screen.getByTestId('mode')).toHaveTextContent('custom'))
    expect(screen.getByTestId('start')).toHaveTextContent('2026-10-01')
    expect(screen.getByTestId('end')).toHaveTextContent('2026-10-16')
  })

  it('has a last-month shortcut covering the whole previous month', async () => {
    renderPicker()
    await userEvent.click(screen.getByRole('button', { name: 'Last month' }))

    await waitFor(() => expect(screen.getByTestId('start')).toHaveTextContent('2026-09-01'))
    expect(screen.getByTestId('end')).toHaveTextContent('2026-09-30')
  })

  it('has a rolling 30-day shortcut', async () => {
    renderPicker()
    await userEvent.click(screen.getByRole('button', { name: 'Last 30 days' }))

    await waitFor(() => expect(screen.getByTestId('start')).toHaveTextContent('2026-09-17'))
    expect(screen.getByTestId('end')).toHaveTextContent('2026-10-16')
  })

  it('clears back to the 8-week preset', async () => {
    renderPicker()
    await userEvent.click(screen.getByRole('button', { name: 'Month to date' }))
    await waitFor(() => expect(screen.getByTestId('mode')).toHaveTextContent('custom'))

    await userEvent.click(screen.getByRole('button', { name: 'Clear the custom range' }))
    await waitFor(() => expect(screen.getByTestId('mode')).toHaveTextContent('preset'))
    expect(screen.getByTestId('label')).toHaveTextContent('8w')
  })

  it('offers no clear button while a preset is active', () => {
    renderPicker()
    expect(screen.queryByRole('button', { name: 'Clear the custom range' })).not.toBeInTheDocument()
  })
})
