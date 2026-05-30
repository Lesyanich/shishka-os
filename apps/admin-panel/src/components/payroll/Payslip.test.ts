import { describe, it, expect } from 'vitest'
import { Payslip } from './Payslip'

// Payslip is the on-screen modal wrapper. Smoke test on export shape;
// full DOM rendering is exercised manually (depends on @react-pdf pdf()).
describe('Payslip', () => {
  it('is a component function', () => {
    expect(typeof Payslip).toBe('function')
  })
})
