import { describe, it, expect, vi } from 'vitest'
import { waitFor } from '@testing-library/react'

vi.mock('./hooks/usePublicMenu.ts', () => ({
  usePublicMenu: () => ({ categories: [], isLoading: false, error: null }),
}))

describe('main entrypoint', () => {
  it('mounts the app into #root without crashing', async () => {
    const root = document.createElement('div')
    root.id = 'root'
    document.body.appendChild(root)

    await import('./main.tsx')

    await waitFor(() => expect(root.innerHTML.length).toBeGreaterThan(0))
  })
})
