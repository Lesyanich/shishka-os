import { describe, it, expect } from 'vitest'
import { useStaffPaymentQr, STAFF_PAYMENT_QR_BUCKET } from './useStaffPaymentQr'

describe('useStaffPaymentQr', () => {
  it('is a hook function', () => {
    expect(typeof useStaffPaymentQr).toBe('function')
  })

  it('targets the private payment-QR bucket', () => {
    expect(STAFF_PAYMENT_QR_BUCKET).toBe('staff-payment-qr')
  })
})
