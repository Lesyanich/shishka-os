import { describe, it, expect, vi } from 'vitest';
import { fetchSweepCandidates } from './candidates.js';

function makeSb(rpcResponse: { data: unknown; error: { message: string } | null }) {
  const rpc = vi.fn().mockResolvedValue(rpcResponse);
  return { rpc } as unknown as Parameters<typeof fetchSweepCandidates>[0];
}

describe('fetchSweepCandidates', () => {
  it('returns rows from the RPC', async () => {
    const rows = [
      {
        nomenclature_id: '11111111-1111-1111-1111-111111111111',
        base_unit: 'pcs',
        cost_per_unit: 30,
        name: 'Ercho Rice Flour',
        recent_supplier_id: '22222222-2222-2222-2222-222222222222',
        recent_barcode: '8005121004113',
        recent_price_per_unit: 133,
      },
    ];
    const sb = makeSb({ data: rows, error: null });
    const out = await fetchSweepCandidates(sb, 100);
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.candidates).toEqual(rows);
    }
  });

  it('passes p_limit to the RPC call', async () => {
    const sb = makeSb({ data: [], error: null });
    await fetchSweepCandidates(sb, 25);
    expect((sb as { rpc: ReturnType<typeof vi.fn> }).rpc).toHaveBeenCalledWith('pack_info_sweep_candidates', { p_limit: 25 });
  });

  it('returns an error result when the RPC fails', async () => {
    const sb = makeSb({ data: null, error: { message: 'permission denied' } });
    const out = await fetchSweepCandidates(sb, 100);
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.error).toContain('permission denied');
    }
  });

  it('returns an empty array when RPC returns null data', async () => {
    const sb = makeSb({ data: null, error: null });
    const out = await fetchSweepCandidates(sb, 100);
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.candidates).toEqual([]);
    }
  });
});
