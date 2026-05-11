import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { postSweepSummary, formatSummaryBody } from './notifier.js';
import type { SweepResult } from './sweep.js';

const RUN = '00000000-0000-0000-0000-0000000000aa';

function makeResult(over: Partial<SweepResult> = {}): SweepResult {
  return {
    run_id: RUN,
    total_candidates: 3,
    auto_applied: [
      {
        nomenclature_id: 'aaa',
        action: 'auto-applied',
        source: 'supplier_catalog_exact',
        confidence: 1.0,
        resolved_base_unit: 'kg',
      },
    ],
    pending: [
      {
        nomenclature_id: 'bbb',
        action: 'pending',
        source: 'makro_fuzzy',
        confidence: 0.6,
        resolved_base_unit: 'kg',
      },
    ],
    skipped: [{ nomenclature_id: 'ccc', reason: 'cascade-fail' }],
    errors: [],
    ...over,
  };
}

describe('formatSummaryBody', () => {
  it('includes the run_id and the three counters', () => {
    const body = formatSummaryBody(makeResult());
    expect(body).toContain('Pack-info sweep');
    expect(body).toContain('1 auto-applied');
    expect(body).toContain('1 pending');
    expect(body).toContain('1 skipped');
    expect(body).toContain(RUN);
  });

  it('mentions errors when non-empty', () => {
    const body = formatSummaryBody(
      makeResult({ errors: [{ stage: 'makro', message: 'timeout', nomenclature_id: 'xxx' }] }),
    );
    expect(body).toMatch(/error/i);
    expect(body).toContain('makro');
    expect(body).toContain('timeout');
  });

  it('handles an empty result gracefully', () => {
    const body = formatSummaryBody(
      makeResult({ total_candidates: 0, auto_applied: [], pending: [], skipped: [], errors: [] }),
    );
    expect(body).toContain('0 auto-applied');
    expect(body).toContain('0 candidates');
  });
});

describe('postSweepSummary', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    errSpy.mockRestore();
  });

  it('prints a single JSON line to stdout', async () => {
    const sb = null;
    await postSweepSummary(sb, { task_id: null, result: makeResult() });
    expect(logSpy).toHaveBeenCalledTimes(1);
    const printed = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(printed.run_id).toBe(RUN);
    expect(printed.counts).toEqual({ candidates: 3, auto_applied: 1, pending: 1, skipped: 1, errors: 0 });
  });

  it('skips the MC comment insert when task_id is null', async () => {
    const sb = { from: vi.fn() } as unknown as Parameters<typeof postSweepSummary>[0];
    await postSweepSummary(sb, { task_id: null, result: makeResult() });
    expect((sb as unknown as { from: ReturnType<typeof vi.fn> }).from).not.toHaveBeenCalled();
  });

  it('posts a task_comments row when task_id is provided', async () => {
    const insert = vi.fn().mockResolvedValue({ data: null, error: null });
    const sb = {
      from: vi.fn(() => ({ insert })),
    } as unknown as Parameters<typeof postSweepSummary>[0];
    await postSweepSummary(sb, { task_id: 'TASK-123', result: makeResult() });
    expect((sb as unknown as { from: ReturnType<typeof vi.fn> }).from).toHaveBeenCalledWith('task_comments');
    expect(insert).toHaveBeenCalledTimes(1);
    const row = insert.mock.calls[0][0];
    expect(row.task_id).toBe('TASK-123');
    expect(row.author).toBe('pack-info-sweep');
    expect(row.body).toContain('Pack-info sweep');
  });

  it('logs a warning when the MC insert fails but does not throw', async () => {
    const insert = vi.fn().mockResolvedValue({ data: null, error: { message: 'rls denied' } });
    const sb = {
      from: vi.fn(() => ({ insert })),
    } as unknown as Parameters<typeof postSweepSummary>[0];
    await expect(
      postSweepSummary(sb, { task_id: 'TASK-123', result: makeResult() }),
    ).resolves.toBeUndefined();
    expect(errSpy).toHaveBeenCalled();
  });
});
