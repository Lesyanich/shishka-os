import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { StaffAccessPanel } from './StaffAccessPanel'
import type { LoginStatus } from '../../hooks/use-staff-access'

/**
 * The block is only ever rendered on the owner-only /hr/staff page. What it
 * must get right: no controls on owner or fired rows, the create-login flow
 * hands the owner the login to pass on, and a DB refusal is shown verbatim.
 */

const noop = vi.fn(async () => ({ ok: true }))

function setup(over: Partial<Parameters<typeof StaffAccessPanel>[0]> = {}) {
  const props = {
    staffId: 's1',
    staffName: 'Nuk',
    appRole: 'task_manager',
    isActive: true,
    fireDate: null,
    status: undefined as LoginStatus | undefined,
    onSetRole: noop,
    onSetLogin: vi.fn(async () => ({ ok: true, login: 'nuk' })),
    onFire: noop,
    onRevealPin: vi.fn(async () => ({ ok: true, pin: '4821' })),
    onChanged: vi.fn(),
    ...over,
  }
  render(<StaffAccessPanel {...props} />)
  return props
}

afterEach(cleanup)

describe('StaffAccessPanel', () => {
  it('shows owners as static — no tier select, no PIN, no fire', () => {
    setup({ appRole: 'owner', staffName: 'Lesia' })
    expect(screen.getByText('Owner')).toBeInTheDocument()
    expect(screen.queryByLabelText('Access level')).not.toBeInTheDocument()
    expect(screen.queryByText(/Create login|Change PIN/)).not.toBeInTheDocument()
    expect(screen.queryByText('Fire…')).not.toBeInTheDocument()
  })

  it('shows a fired row read-only with the blocked login', () => {
    setup({
      isActive: false,
      fireDate: '2026-09-04',
      staffName: 'Mint',
      status: { staff_id: 's1', login_email: 'mint@staff.shishka.local', last_sign_in_at: '2026-09-29T06:17:39Z', is_blocked: true, has_pin: false },
    })
    expect(screen.getByText('mint')).toBeInTheDocument()
    expect(screen.getByText('Login blocked')).toBeInTheDocument()
    expect(screen.queryByLabelText('Access level')).not.toBeInTheDocument()
    expect(screen.queryByText('Change PIN')).not.toBeInTheDocument()
    expect(screen.queryByText('Fire…')).not.toBeInTheDocument()
  })

  it('creates a login prefilled from the name and tells the owner what to hand over', async () => {
    const props = setup()
    expect(screen.getByText('No login yet')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Create login'))
    const loginInput = screen.getByLabelText(/^Login/) as HTMLInputElement
    expect(loginInput.value).toBe('nuk')

    fireEvent.change(screen.getByLabelText(/PIN/), { target: { value: '12x45' } })
    fireEvent.click(screen.getByText('Save'))

    await waitFor(() => expect(props.onSetLogin).toHaveBeenCalledWith('s1', 'nuk', '1245'))
    expect(await screen.findByText(/Give Nuk: login/)).toBeInTheDocument()
    expect(screen.queryByText('Save')).not.toBeInTheDocument()
  })

  it('shows the server refusal verbatim', async () => {
    setup({
      onFire: vi.fn(async () => ({ ok: false, error: 'Cannot remove the last active owner' })),
    })
    fireEvent.click(screen.getByText('Fire…'))
    fireEvent.change(screen.getByLabelText('Last working day'), { target: { value: '2026-01-01' } })
    fireEvent.click(screen.getByText('Confirm'))
    expect(await screen.findByText('Cannot remove the last active owner')).toBeInTheDocument()
  })

  it('explains that a past last day blocks now and a future one waits', () => {
    setup()
    fireEvent.click(screen.getByText('Fire…'))
    const date = screen.getByLabelText('Last working day')
    fireEvent.change(date, { target: { value: '2020-01-01' } })
    expect(screen.getByText(/blocked now/)).toBeInTheDocument()
    fireEvent.change(date, { target: { value: '2099-01-01' } })
    expect(screen.getByText(/morning after that day/)).toBeInTheDocument()
  })

  it('changes the tier through the select and refetches the card', async () => {
    const props = setup()
    fireEvent.change(screen.getByLabelText('Access level'), { target: { value: 'cook' } })
    await waitFor(() => expect(props.onSetRole).toHaveBeenCalledWith('s1', 'cook'))
    await waitFor(() => expect(props.onChanged).toHaveBeenCalled())
  })

  it('shows and hides a stored PIN on demand', async () => {
    const props = setup({
      status: { staff_id: 's1', login_email: 'nuk@staff.shishka.local', last_sign_in_at: null, is_blocked: false, has_pin: true },
    })
    expect(screen.queryByLabelText('PIN')).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('Show PIN'))
    await waitFor(() => expect(props.onRevealPin).toHaveBeenCalledWith('s1'))
    expect((await screen.findByLabelText('PIN')).textContent).toBe('4821')

    fireEvent.click(screen.getByText('Hide PIN'))
    expect(screen.queryByLabelText('PIN')).not.toBeInTheDocument()
  })

  it('offers no Show PIN when nothing is stored, nor on owner or fired rows', () => {
    setup({
      status: { staff_id: 's1', login_email: 'nuk@staff.shishka.local', last_sign_in_at: null, is_blocked: false, has_pin: false },
    })
    expect(screen.queryByText('Show PIN')).not.toBeInTheDocument()
    cleanup()
    setup({
      isActive: false,
      fireDate: '2026-09-04',
      status: { staff_id: 's1', login_email: 'mint@staff.shishka.local', last_sign_in_at: null, is_blocked: true, has_pin: true },
    })
    expect(screen.queryByText('Show PIN')).not.toBeInTheDocument()
  })
})
