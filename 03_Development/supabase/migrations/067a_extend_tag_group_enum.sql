-- ═══════════════════════════════════════════════════════════════
-- Migration 067a: Extend tag_group ENUM
-- MUST run and COMMIT before 067_normalize_seed_data.sql
-- PostgreSQL rule: new ENUM values must be committed before use.
-- ═══════════════════════════════════════════════════════════════

ALTER TYPE tag_group ADD VALUE IF NOT EXISTS 'taste';
ALTER TYPE tag_group ADD VALUE IF NOT EXISTS 'boosters';
ALTER TYPE tag_group ADD VALUE IF NOT EXISTS 'science';
ALTER TYPE tag_group ADD VALUE IF NOT EXISTS 'serving';
ALTER TYPE tag_group ADD VALUE IF NOT EXISTS 'ops';
