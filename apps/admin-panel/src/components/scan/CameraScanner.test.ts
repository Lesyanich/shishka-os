import { describe, it, expect } from 'vitest'
import { CameraScanner } from './CameraScanner'

describe('CameraScanner', () => {
  it('exports CameraScanner component', () => {
    expect(typeof CameraScanner).toBe('function')
  })
})
