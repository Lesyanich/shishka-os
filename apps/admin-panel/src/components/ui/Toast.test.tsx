import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { ToastProvider, useToast } from './Toast'

function Trigger() {
  const toast = useToast()
  return (
    <button
      type="button"
      onClick={() =>
        toast.push({ title: 'New order #042', body: 'Mint · 240 THB', durationMs: null })
      }
    >
      push
    </button>
  )
}

describe('Toast', () => {
  it('throws when useToast is used outside a provider', () => {
    function Bad() {
      useToast()
      return null
    }
    expect(() => render(<Bad />)).toThrow(/ToastProvider/)
  })

  it('pushes a toast and dismisses it', () => {
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    )

    fireEvent.click(screen.getByText('push'))
    expect(screen.getByText('New order #042')).toBeInTheDocument()
    expect(screen.getByText('Mint · 240 THB')).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('Dismiss'))
    expect(screen.queryByText('New order #042')).not.toBeInTheDocument()
  })
})
