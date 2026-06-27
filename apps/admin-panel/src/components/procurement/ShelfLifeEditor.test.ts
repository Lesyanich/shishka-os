import { describe, it, expect } from 'vitest'
import { ShelfLifeEditor } from './ShelfLifeEditor'

// Smoke: import-time guard for the shelf-life editor.
describe('ShelfLifeEditor', () => {
  it('exports a component function', () => {
    expect(typeof ShelfLifeEditor).toBe('function')
    expect(ShelfLifeEditor.name).toBe('ShelfLifeEditor')
  })
})
