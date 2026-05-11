import { describe, it, expect } from 'vitest';
import { resolveJobConfig } from './pack-info-sweep.js';

describe('resolveJobConfig', () => {
  it('reads SUPABASE_URL and SERVICE_ROLE_KEY from env', () => {
    const cfg = resolveJobConfig({
      SUPABASE_URL: 'https://x.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'sk_test',
      PACK_INFO_SWEEP_LIMIT: undefined,
      PACK_INFO_SWEEP_MC_TASK_ID: undefined,
    });
    expect(cfg.ok).toBe(true);
    if (cfg.ok) {
      expect(cfg.value.supabaseUrl).toBe('https://x.supabase.co');
      expect(cfg.value.serviceRoleKey).toBe('sk_test');
      expect(cfg.value.limit).toBe(100); // default
      expect(cfg.value.mcTaskId).toBeNull();
    }
  });

  it('parses optional PACK_INFO_SWEEP_LIMIT', () => {
    const cfg = resolveJobConfig({
      SUPABASE_URL: 'u',
      SUPABASE_SERVICE_ROLE_KEY: 'k',
      PACK_INFO_SWEEP_LIMIT: '25',
      PACK_INFO_SWEEP_MC_TASK_ID: undefined,
    });
    expect(cfg.ok).toBe(true);
    if (cfg.ok) expect(cfg.value.limit).toBe(25);
  });

  it('threads PACK_INFO_SWEEP_MC_TASK_ID through when set', () => {
    const cfg = resolveJobConfig({
      SUPABASE_URL: 'u',
      SUPABASE_SERVICE_ROLE_KEY: 'k',
      PACK_INFO_SWEEP_LIMIT: undefined,
      PACK_INFO_SWEEP_MC_TASK_ID: 'TASK-9',
    });
    expect(cfg.ok).toBe(true);
    if (cfg.ok) expect(cfg.value.mcTaskId).toBe('TASK-9');
  });

  it('fails when SUPABASE_URL is missing', () => {
    const cfg = resolveJobConfig({
      SUPABASE_URL: undefined,
      SUPABASE_SERVICE_ROLE_KEY: 'k',
      PACK_INFO_SWEEP_LIMIT: undefined,
      PACK_INFO_SWEEP_MC_TASK_ID: undefined,
    });
    expect(cfg.ok).toBe(false);
    if (!cfg.ok) expect(cfg.error).toContain('SUPABASE_URL');
  });

  it('fails when SUPABASE_SERVICE_ROLE_KEY is missing', () => {
    const cfg = resolveJobConfig({
      SUPABASE_URL: 'u',
      SUPABASE_SERVICE_ROLE_KEY: undefined,
      PACK_INFO_SWEEP_LIMIT: undefined,
      PACK_INFO_SWEEP_MC_TASK_ID: undefined,
    });
    expect(cfg.ok).toBe(false);
    if (!cfg.ok) expect(cfg.error).toContain('SUPABASE_SERVICE_ROLE_KEY');
  });

  it('fails when PACK_INFO_SWEEP_LIMIT is not a positive int', () => {
    const cfg = resolveJobConfig({
      SUPABASE_URL: 'u',
      SUPABASE_SERVICE_ROLE_KEY: 'k',
      PACK_INFO_SWEEP_LIMIT: 'abc',
      PACK_INFO_SWEEP_MC_TASK_ID: undefined,
    });
    expect(cfg.ok).toBe(false);
    if (!cfg.ok) expect(cfg.error).toContain('PACK_INFO_SWEEP_LIMIT');
  });
});
