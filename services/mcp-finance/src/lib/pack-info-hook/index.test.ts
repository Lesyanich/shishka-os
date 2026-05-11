import { describe, it, expect } from 'vitest';
import * as Hook from './index.js';

describe('pack-info-hook barrel', () => {
  it('re-exports runPackInfoHook + writers + cooldown', () => {
    expect(typeof Hook.runPackInfoHook).toBe('function');
    expect(typeof Hook.hasRecentSkipDecision).toBe('function');
    expect(typeof Hook.writeAutoApply).toBe('function');
    expect(typeof Hook.writePending).toBe('function');
    expect(typeof Hook.writeSkip).toBe('function');
  });
});
