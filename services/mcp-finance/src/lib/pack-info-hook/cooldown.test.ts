import { describe, it, expect, vi } from 'vitest';
import { hasRecentSkipDecision } from './cooldown.js';

function makeStubSb(rows: Array<{ id: string }>) {
  const builder: any = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    gt: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data: rows, error: null }),
  };
  return { from: vi.fn().mockReturnValue(builder), _builder: builder };
}

const NID = 'd411c6ec-b843-46c7-8cd4-eba0f6efe19a';

describe('hasRecentSkipDecision', () => {
  it('returns true when a skip row exists in the last 7 days', async () => {
    const sb = makeStubSb([{ id: 'row-1' }]);
    const result = await hasRecentSkipDecision(sb as any, NID, 'base_unit', 7);
    expect(result).toBe(true);
    expect(sb.from).toHaveBeenCalledWith('data_health_decisions');
    expect(sb._builder.eq).toHaveBeenCalledWith('entity_id', NID);
    expect(sb._builder.eq).toHaveBeenCalledWith('field', 'base_unit');
    expect(sb._builder.eq).toHaveBeenCalledWith('status', 'skip');
  });

  it('returns false when no recent skip rows', async () => {
    const sb = makeStubSb([]);
    const result = await hasRecentSkipDecision(sb as any, NID, 'base_unit', 7);
    expect(result).toBe(false);
  });

  it('returns false on supabase error and does not throw', async () => {
    const builder: any = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gt: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: null, error: { message: 'db down' } }),
    };
    const sb = { from: vi.fn().mockReturnValue(builder) };
    const result = await hasRecentSkipDecision(sb as any, NID, 'base_unit', 7);
    expect(result).toBe(false);
  });
});
