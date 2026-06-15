import { describe, it, expect } from 'vitest'
import { isWebUsbSupported, getGrantedPrinter } from './webusbPrint'

describe('webusbPrint', () => {
  it('reports WebUSB unsupported when navigator.usb is absent (jsdom)', () => {
    expect(isWebUsbSupported()).toBe(false)
  })

  it('getGrantedPrinter resolves to null without WebUSB', async () => {
    await expect(getGrantedPrinter()).resolves.toBeNull()
  })
})
