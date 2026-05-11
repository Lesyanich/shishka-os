import { describe, it, expect } from 'vitest';
import { parsePackWeight } from './parse-pack.js';

describe('parsePackWeight', () => {
  it('parses simple grams', () => {
    expect(parsePackWeight('500g')).toEqual({ qty: 500, unit: 'g' });
  });
  it('parses kilograms', () => {
    expect(parsePackWeight('1kg')).toEqual({ qty: 1, unit: 'kg' });
    expect(parsePackWeight('2.5kg')).toEqual({ qty: 2.5, unit: 'kg' });
  });
  it('parses milliliters and liters', () => {
    expect(parsePackWeight('250ml')).toEqual({ qty: 250, unit: 'ml' });
    expect(parsePackWeight('1L')).toEqual({ qty: 1, unit: 'L' });
    expect(parsePackWeight('4.5L')).toEqual({ qty: 4.5, unit: 'L' });
  });
  it('handles whitespace and case variations', () => {
    expect(parsePackWeight(' 500 g ')).toEqual({ qty: 500, unit: 'g' });
    expect(parsePackWeight('500G')).toEqual({ qty: 500, unit: 'g' });
    expect(parsePackWeight('1KG')).toEqual({ qty: 1, unit: 'kg' });
    expect(parsePackWeight('1l')).toEqual({ qty: 1, unit: 'L' });
  });
  it('returns null for unparseable input', () => {
    expect(parsePackWeight('')).toBeNull();
    expect(parsePackWeight('large')).toBeNull();
    expect(parsePackWeight('500')).toBeNull();
    expect(parsePackWeight('g')).toBeNull();
  });
});
