import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

/**
 * CEO 2026-10-09: the sign-in screen is in English — the staff signing in
 * (Nuk, NeNe) are Thai, and Russian labels were unreadable to them.
 */

const signIn = vi.fn(async () => ({ error: new Error('bad') }))

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: null, loading: false, signIn }),
}))

afterEach(() => {
  cleanup()
  signIn.mockClear()
})

async function renderLogin() {
  const { LoginPage } = await import('./LoginPage')
  return render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>,
  )
}

describe('LoginPage', () => {
  it('is in English, with no Cyrillic anywhere', async () => {
    const { container } = await renderLogin()
    expect(screen.getByText('Staff sign-in')).toBeInTheDocument()
    expect(screen.getByLabelText('Login')).toBeInTheDocument()
    expect(screen.getByLabelText('PIN')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument()
    expect(container.textContent).not.toMatch(/[А-Яа-яЁё]/)

    fireEvent.click(screen.getByText('Owner sign-in (email)'))
    expect(screen.getByText('Owner sign-in')).toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toBeInTheDocument()
    expect(container.textContent).not.toMatch(/[А-Яа-яЁё]/)
  })

  it('signs staff in as <login>@staff.shishka.local and reports a wrong PIN in English', async () => {
    await renderLogin()
    fireEvent.change(screen.getByLabelText('Login'), { target: { value: 'NeNe' } })
    fireEvent.change(screen.getByLabelText('PIN'), { target: { value: '1234' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    await waitFor(() => expect(signIn).toHaveBeenCalledWith('nene@staff.shishka.local', '1234'))
    expect(await screen.findByText('Wrong login or PIN')).toBeInTheDocument()
  })
})
