import { describe, it, expect } from 'vitest'
import { bahtTextEnglish, bahtTextThai } from './amount-words'

describe('bahtTextThai', () => {
  it('reads plain digits', () => {
    expect(bahtTextThai(0)).toBe('ศูนย์บาทถ้วน')
    expect(bahtTextThai(1)).toBe('หนึ่งบาทถ้วน')
    expect(bahtTextThai(9)).toBe('เก้าบาทถ้วน')
  })

  it('drops หนึ่ง before สิบ', () => {
    expect(bahtTextThai(10)).toBe('สิบบาทถ้วน')
    expect(bahtTextThai(15)).toBe('สิบห้าบาทถ้วน')
  })

  it('uses ยี่ for twenty', () => {
    expect(bahtTextThai(20)).toBe('ยี่สิบบาทถ้วน')
    expect(bahtTextThai(25)).toBe('ยี่สิบห้าบาทถ้วน')
  })

  it('uses เอ็ด for a trailing one above nine', () => {
    expect(bahtTextThai(11)).toBe('สิบเอ็ดบาทถ้วน')
    expect(bahtTextThai(21)).toBe('ยี่สิบเอ็ดบาทถ้วน')
    expect(bahtTextThai(101)).toBe('หนึ่งร้อยเอ็ดบาทถ้วน')
    expect(bahtTextThai(1_000_001)).toBe('หนึ่งล้านเอ็ดบาทถ้วน')
  })

  it('skips zero places', () => {
    expect(bahtTextThai(100)).toBe('หนึ่งร้อยบาทถ้วน')
    expect(bahtTextThai(1_000)).toBe('หนึ่งพันบาทถ้วน')
    expect(bahtTextThai(100_000)).toBe('หนึ่งแสนบาทถ้วน')
    expect(bahtTextThai(1_000_000)).toBe('หนึ่งล้านบาทถ้วน')
  })

  it('reads realistic payroll amounts', () => {
    expect(bahtTextThai(14_032)).toBe('หนึ่งหมื่นสี่พันสามสิบสองบาทถ้วน')
    expect(bahtTextThai(12_500)).toBe('หนึ่งหมื่นสองพันห้าร้อยบาทถ้วน')
    expect(bahtTextThai(16_000)).toBe('หนึ่งหมื่นหกพันบาทถ้วน')
  })

  it('rounds to whole baht so words match the printed figure', () => {
    expect(bahtTextThai(14_032.4)).toBe(bahtTextThai(14_032))
    expect(bahtTextThai(14_032.5)).toBe(bahtTextThai(14_033))
  })
})

describe('bahtTextEnglish', () => {
  it('reads plain digits and teens', () => {
    expect(bahtTextEnglish(0)).toBe('Zero baht only')
    expect(bahtTextEnglish(7)).toBe('Seven baht only')
    expect(bahtTextEnglish(19)).toBe('Nineteen baht only')
  })

  it('hyphenates compound tens', () => {
    expect(bahtTextEnglish(32)).toBe('Thirty-two baht only')
    expect(bahtTextEnglish(40)).toBe('Forty baht only')
  })

  it('joins a sub-hundred tail with "and"', () => {
    expect(bahtTextEnglish(101)).toBe('One hundred and one baht only')
    expect(bahtTextEnglish(14_032)).toBe('Fourteen thousand and thirty-two baht only')
  })

  it('omits "and" when the tail opens a hundreds group', () => {
    expect(bahtTextEnglish(12_500)).toBe('Twelve thousand five hundred baht only')
  })

  it('handles round scales', () => {
    expect(bahtTextEnglish(16_000)).toBe('Sixteen thousand baht only')
    expect(bahtTextEnglish(1_000_000)).toBe('One million baht only')
  })

  it('rounds to whole baht so words match the printed figure', () => {
    expect(bahtTextEnglish(14_032.5)).toBe(bahtTextEnglish(14_033))
  })
})
