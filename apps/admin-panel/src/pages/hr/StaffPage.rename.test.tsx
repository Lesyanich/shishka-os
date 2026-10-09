import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'

/**
 * CEO 2026-10-09: "я не могу менять имена — хочу поменять Nuk на Nookie".
 * Renaming the same person is allowed; the login is separate and unchanged.
 */

const updateStaff = vi.fn(async () => {})

vi.mock('../../hooks/use-staff-cards', () => ({
  useStaffCards: () => ({
    staff: [
      {
        id: 'nuk', name: 'Nuk', name_th: null, role: 'cook', app_role: 'task_manager', phone: null,
        is_active: true, monthly_salary: 17000, hire_date: '2026-09-03', fire_date: null,
        employment_type: 'probation', nationality: null, work_permit_number: null, work_permit_expiry: null,
        sso_number: null, tax_id: null, probation_end_date: null, payment_qr_path: null, payment_note: null,
        created_at: '2026-09-03T00:00:00Z',
      },
    ],
    leaveBalances: [],
    isLoading: false,
    updateStaff,
    createStaff: vi.fn(),
    refetch: vi.fn(),
  }),
}))

vi.mock('../../hooks/use-staff-access', async (orig) => ({
  ...(await orig<typeof import('../../hooks/use-staff-access')>()),
  useStaffAccess: () => ({
    loginStatus: {},
    isLoadingStatus: false,
    refetchStatus: vi.fn(),
    setAppRole: vi.fn(),
    setLogin: vi.fn(),
    fire: vi.fn(),
    revealPin: vi.fn(),
  }),
}))

vi.mock('../../components/hr/PaymentQrCard', () => ({ PaymentQrCard: () => null }))

afterEach(() => {
  cleanup()
  updateStaff.mockClear()
})

describe('StaffPage — rename', () => {
  it('lets the owner rename a staff member', async () => {
    const { StaffPage } = await import('./StaffPage')
    render(<StaffPage />)

    fireEvent.click(screen.getByLabelText('Edit Nuk'))
    const name = screen.getByDisplayValue('Nuk')
    fireEvent.change(name, { target: { value: '  Nookie ' } })
    fireEvent.click(screen.getByLabelText('Save'))

    await waitFor(() => expect(updateStaff).toHaveBeenCalledWith('nuk', expect.objectContaining({ name: 'Nookie' })))
  })

  it('refuses an empty name', async () => {
    const { StaffPage } = await import('./StaffPage')
    render(<StaffPage />)

    fireEvent.click(screen.getByLabelText('Edit Nuk'))
    fireEvent.change(screen.getByDisplayValue('Nuk'), { target: { value: '   ' } })
    fireEvent.click(screen.getByLabelText('Save'))

    expect(updateStaff).not.toHaveBeenCalled()
  })
})
