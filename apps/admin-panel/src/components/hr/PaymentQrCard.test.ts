import { describe, it, expect } from 'vitest'
import { PaymentQrCard } from './PaymentQrCard'
import { STAFF_PAYMENT_QR_BUCKET } from '../../hooks/useStaffPaymentQr'
import { toStoragePath } from '../../lib/signedStorage'

describe('PaymentQrCard', () => {
  it('is a component function', () => {
    expect(typeof PaymentQrCard).toBe('function')
  })
})

describe('staff payment QR storage contract', () => {
  it('lives in its own private bucket', () => {
    expect(STAFF_PAYMENT_QR_BUCKET).toBe('staff-payment-qr')
  })

  it('stores a bare {staffId}/{file} path — ownership is derived from it', () => {
    // The storage policy reads the first path segment as the staff id, so the
    // path is the authority on whose QR this is, not any column.
    const path = 'b1fb72db-55b6-4afd-be85-be598a7c19ac/1753900000000.png'
    expect(toStoragePath(STAFF_PAYMENT_QR_BUCKET, path)).toBe(path)
    expect(path.split('/')[0]).toBe('b1fb72db-55b6-4afd-be85-be598a7c19ac')
  })

  it('tolerates a redundant bucket prefix on the stored value', () => {
    expect(
      toStoragePath(STAFF_PAYMENT_QR_BUCKET, 'staff-payment-qr/abc/1.png'),
    ).toBe('abc/1.png')
  })
})
