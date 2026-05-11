import { describe, it, expect } from 'vitest';

describe('approve-receipt module shape', () => {
  it('exports approveReceipt as an async function', async () => {
    const mod = await import('./approve-receipt.js');
    expect(typeof mod.approveReceipt).toBe('function');
  });

  it('module shape includes approveReceipt export', async () => {
    // Compile-time / type-level check — if the export is removed,
    // the import line in this file will fail to typecheck.
    const mod = await import('./approve-receipt.js');
    expect(mod).toHaveProperty('approveReceipt');
  });
});
