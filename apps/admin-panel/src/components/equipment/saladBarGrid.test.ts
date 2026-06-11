import { describe, it, expect } from 'vitest'
import {
  GRID_COLS,
  GRID_ROWS,
  GN_DIMS,
  FACTORY_LAYOUT,
  buildOccupancy,
  canPlace,
  dimsOf,
  rowLabel,
  footprintMM,
  rectsOverlap,
  canPlaceFree,
  snapX,
  snapY,
  HOLE_W_MM,
  HOLE_H_MM,
  type GridPan,
  type FreePan,
} from './saladBarGrid'

describe('saladBarGrid geometry', () => {
  it('dimsOf returns GN footprints and falls back for unknown', () => {
    expect(dimsOf('1/3')).toEqual({ w: 2, h: 6 })
    expect(dimsOf('1/9')).toEqual({ w: 2, h: 2 })
    expect(dimsOf('???')).toEqual(GN_DIMS['1/6'])
  })

  it('rowLabel splits back/front at the midline', () => {
    expect(rowLabel(0)).toBe('back')
    expect(rowLabel(5)).toBe('back')
    expect(rowLabel(6)).toBe('front')
    expect(rowLabel(11)).toBe('front')
  })

  it('canPlace rejects out-of-bounds and overlaps', () => {
    const occ = buildOccupancy([{ id: 'a', gn_size: '1/3', grid_col: 0, grid_row: 0 }])
    expect(canPlace(occ, 0, 0, 2, 6)).toBe(false) // overlaps pan "a"
    expect(canPlace(occ, 2, 0, 2, 6)).toBe(true) // free column
    expect(canPlace(occ, 15, 0, 2, 6)).toBe(false) // col+w > 16
    expect(canPlace(occ, 0, 8, 2, 6)).toBe(false) // row+h > 12
  })

  it('canPlace ignores the dragged pan via buildOccupancy ignoreId', () => {
    const pans: GridPan[] = [{ id: 'a', gn_size: '1/3', grid_col: 0, grid_row: 0 }]
    const occ = buildOccupancy(pans, 'a')
    expect(canPlace(occ, 0, 0, 2, 6)).toBe(true) // pan "a" excluded → cell free
  })

  it('each factory layout has 28 pans and tiles the full 16×12 grid with no overlap', () => {
    for (const unit of [1, 2] as const) {
      const layout = FACTORY_LAYOUT[unit]
      expect(layout).toHaveLength(28)
      const pans: GridPan[] = layout.map((p, i) => ({
        id: `${unit}-${i}`,
        gn_size: p.s,
        grid_col: p.c,
        grid_row: p.r,
      }))
      const occ = buildOccupancy(pans)
      let filled = 0
      for (let r = 0; r < GRID_ROWS; r++) for (let c = 0; c < GRID_COLS; c++) if (occ[r][c]) filled++
      // 6×(2·6) + 16×(2·3) + 6×(2·2) = 72 + 96 + 24 = 192 = full grid, no overlaps
      expect(filled).toBe(GRID_COLS * GRID_ROWS)
    }
  })
})

describe('free-form placement + rotation', () => {
  it('footprintMM swaps w/h on 90° rotation', () => {
    expect(footprintMM('1/3', 0)).toEqual({ w: 176, h: 324 })
    expect(footprintMM('1/3', 90)).toEqual({ w: 324, h: 176 })
    expect(footprintMM('1/1', 90)).toEqual({ w: 324, h: 528 })
  })

  it('snapX/snapY round to the 44/54 mm lattice', () => {
    expect(snapX(170)).toBe(176) // 4×44
    expect(snapX(20)).toBe(0)
    expect(snapY(160)).toBe(162) // 3×54
  })

  it('rectsOverlap detects overlap but allows edge-touching', () => {
    expect(rectsOverlap(0, 0, 100, 100, 50, 50, 100, 100)).toBe(true)
    expect(rectsOverlap(0, 0, 100, 100, 100, 0, 100, 100)).toBe(false) // touching edge
    expect(rectsOverlap(0, 0, 100, 100, 200, 0, 100, 100)).toBe(false) // apart
  })

  it('canPlaceFree rejects out-of-bounds, overlaps; ignores self', () => {
    const pans: FreePan[] = [{ id: 'a', gn_size: '1/3', x_mm: 0, y_mm: 0, rotation: 0 }] // 176×325
    expect(canPlaceFree(pans, 0, 0, 176, 325)).toBe(false) // overlaps a
    expect(canPlaceFree(pans, 176, 0, 176, 325)).toBe(true) // beside a
    expect(canPlaceFree(pans, HOLE_W_MM - 100, 0, 176, 325)).toBe(false) // off right edge
    expect(canPlaceFree(pans, 0, HOLE_H_MM - 100, 176, 325)).toBe(false) // off bottom
    expect(canPlaceFree(pans, 0, 0, 176, 325, 'a')).toBe(true) // ignore self → free
  })
})
