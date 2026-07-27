import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { POTimeline } from './POTimeline'

const CREATED = '2026-07-27T09:12:00Z'

afterEach(cleanup)

describe('POTimeline', () => {
  it('shows the whole path and marks where the order stands', () => {
    render(<POTimeline status="confirmed" createdAt={CREATED} authorName="Lesia" />)

    expect(screen.getAllByRole('listitem')).toHaveLength(6)
    expect(screen.getByText('Confirmed').closest('[role="listitem"]')).toHaveAttribute(
      'aria-current',
      'step',
    )
    // Only the current step is marked.
    expect(screen.getByText('Draft').closest('[role="listitem"]')).not.toHaveAttribute(
      'aria-current',
    )
  })

  it('labels the first step with who created the order and when', () => {
    render(<POTimeline status="draft" createdAt={CREATED} authorName="Mint" />)
    expect(screen.getByText(/Mint/)).toBeTruthy()
  })

  it('parks partially_received on the Received step rather than falling off the path', () => {
    render(<POTimeline status="partially_received" createdAt={CREATED} authorName={null} />)
    expect(screen.getByText('Received').closest('[role="listitem"]')).toHaveAttribute(
      'aria-current',
      'step',
    )
  })

  it('replaces the path with a plain statement when the order was cancelled', () => {
    render(<POTimeline status="cancelled" createdAt={CREATED} authorName="Lesia" />)
    expect(screen.getByText(/Cancelled/)).toBeTruthy()
    expect(screen.queryByRole('listitem')).toBeNull()
  })
})
