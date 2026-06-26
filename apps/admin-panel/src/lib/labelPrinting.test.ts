import { describe, it, expect } from 'vitest'
import { packMonoBits } from './labelPrinting'

/** Build an RGBA buffer from a black/white pixel map ('#' = black, '.' = white). */
function rgbaFrom(rows: string[]): { rgba: Uint8ClampedArray; w: number; h: number } {
  const h = rows.length
  const w = rows[0].length
  const rgba = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const black = rows[y][x] === '#'
      const i = (y * w + x) * 4
      const v = black ? 0 : 255
      rgba[i] = v
      rgba[i + 1] = v
      rgba[i + 2] = v
      rgba[i + 3] = 255 // opaque
    }
  }
  return { rgba, w, h }
}

describe('packMonoBits', () => {
  it('packs one byte per 8px row, black → bit 0, white → bit 1', () => {
    // 8px wide: leftmost black, rest white → 0b01111111 = 0x7F.
    const { rgba, w, h } = rgbaFrom(['#.......'])
    const { widthBytes, data } = packMonoBits(rgba, w, h)
    expect(widthBytes).toBe(1)
    expect(data.length).toBe(1)
    expect(data[0]).toBe(0x7f)
  })

  it('all-white stays 0xFF, all-black becomes 0x00', () => {
    const white = rgbaFrom(['........'])
    expect(packMonoBits(white.rgba, white.w, white.h).data[0]).toBe(0xff)
    const black = rgbaFrom(['########'])
    expect(packMonoBits(black.rgba, black.w, black.h).data[0]).toBe(0x00)
  })

  it('pads partial trailing bytes as white (1 bits)', () => {
    // 5px wide → still 1 byte; last 3 bits padded white. All black → 0b00000111.
    const { rgba, w, h } = rgbaFrom(['#####'])
    const { widthBytes, data } = packMonoBits(rgba, w, h)
    expect(widthBytes).toBe(1)
    expect(data[0]).toBe(0x07)
  })

  it('treats transparent pixels as white (no stray print)', () => {
    const w = 8
    const h = 1
    const rgba = new Uint8ClampedArray(w * h * 4) // all zero → black colour but alpha 0
    const { data } = packMonoBits(rgba, w, h)
    expect(data[0]).toBe(0xff)
  })

  it('handles multi-byte rows with the MSB as the leftmost pixel', () => {
    // 9px → 2 bytes/row. Pixel 8 (the 9th) black, rest white.
    const { rgba, w, h } = rgbaFrom(['........#'])
    const { widthBytes, data } = packMonoBits(rgba, w, h)
    expect(widthBytes).toBe(2)
    expect(data[0]).toBe(0xff) // first 8px all white
    expect(data[1]).toBe(0x7f) // 9th px black → top bit cleared
  })
})
