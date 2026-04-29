// Smoke test — module exports and the error class behave.
import { describe, it, expect } from 'vitest'
import { fetchVaultPageFresh, saveVaultPage, VaultApiError } from '../vault'

describe('api/vault', () => {
  it('exports fetchVaultPageFresh and saveVaultPage as functions', () => {
    expect(typeof fetchVaultPageFresh).toBe('function')
    expect(typeof saveVaultPage).toBe('function')
  })

  it('VaultApiError carries status + optional conflictSha', () => {
    const e = new VaultApiError('conflict', 409, 'abc123')
    expect(e.status).toBe(409)
    expect(e.conflictSha).toBe('abc123')
    expect(e.message).toBe('conflict')
  })
})
