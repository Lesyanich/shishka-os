import { describe, it, expect } from 'vitest';
import {
  SUSPICIOUS_BASE_UNITS,
  PACK_INFO_RULE_CODE,
  AUTO_APPLY_CONFIDENCE,
  PENDING_CONFIDENCE_FLOOR,
  SKIP_COOLDOWN_DAYS,
} from './shared-constants.js';

describe('shared-constants', () => {
  it('SUSPICIOUS_BASE_UNITS contains the four target units', () => {
    expect(SUSPICIOUS_BASE_UNITS.has('pcs')).toBe(true);
    expect(SUSPICIOUS_BASE_UNITS.has('bag')).toBe(true);
    expect(SUSPICIOUS_BASE_UNITS.has('bottle')).toBe(true);
    expect(SUSPICIOUS_BASE_UNITS.has('pack')).toBe(true);
    expect(SUSPICIOUS_BASE_UNITS.has('kg')).toBe(false);
  });

  it('rule code matches migration 170 seed', () => {
    expect(PACK_INFO_RULE_CODE).toBe('NOMENCLATURE_AUTO_PACK_FILL');
  });

  it('confidence thresholds are ordered', () => {
    expect(AUTO_APPLY_CONFIDENCE).toBeGreaterThan(PENDING_CONFIDENCE_FLOOR);
    expect(SKIP_COOLDOWN_DAYS).toBeGreaterThan(0);
  });
});
