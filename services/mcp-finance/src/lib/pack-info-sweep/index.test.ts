import { describe, it, expect } from 'vitest';
import {
  runPackInfoSweep,
  fetchSweepCandidates,
  postSweepSummary,
  formatSummaryBody,
} from './index.js';

describe('pack-info-sweep barrel', () => {
  it('exports the public surface', () => {
    expect(typeof runPackInfoSweep).toBe('function');
    expect(typeof fetchSweepCandidates).toBe('function');
    expect(typeof postSweepSummary).toBe('function');
    expect(typeof formatSummaryBody).toBe('function');
  });
});
