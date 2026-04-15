-- ============================================================
-- Migration 130: AI Chef Foundation Tables
-- Creates chef_feedback_queue + chef_chat_sessions with RLS
-- Spec: docs/projects/admin/plans/spec-ai-executive-chef.md §Data Structures
-- MC: 0886291e-964e-4ba0-be4e-c191f3908705
-- ============================================================

BEGIN;

-- ══════════════════════════════════════════════════════════════
-- 1. chef_feedback_queue — staff feedback awaiting owner approval
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS chef_feedback_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Source
  submitted_by TEXT NOT NULL,
  original_text TEXT NOT NULL,
  original_lang TEXT,
  translated_text TEXT NOT NULL,

  -- Classification
  category TEXT NOT NULL
    CONSTRAINT cfq_category_check CHECK (
      category IN ('ingredient_adjustment', 'process_change', 'equipment_issue', 'quality_report', 'general_question')
    ),
  affected_product_ids UUID[],
  proposed_change JSONB,
  impact_summary TEXT,

  -- Approval
  status TEXT NOT NULL DEFAULT 'pending'
    CONSTRAINT cfq_status_check CHECK (
      status IN ('pending', 'approved', 'rejected', 'executed')
    ),
  reviewed_by TEXT,
  reviewer_note TEXT,
  reviewed_at TIMESTAMPTZ,

  -- Execution
  executed_at TIMESTAMPTZ,
  execution_log JSONB,

  -- Meta
  source_surface TEXT NOT NULL
    CONSTRAINT cfq_source_surface_check CHECK (
      source_surface IN ('kds', 'erp_chat', 'claude_desktop')
    ),
  session_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes: owner queue polling + per-staff history + affected product lookup
CREATE INDEX IF NOT EXISTS idx_cfq_status_created
  ON chef_feedback_queue (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cfq_submitted_by_created
  ON chef_feedback_queue (submitted_by, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cfq_affected_products
  ON chef_feedback_queue USING GIN (affected_product_ids);

-- ══════════════════════════════════════════════════════════════
-- 2. chef_chat_sessions — conversation history + token counters
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS chef_chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  surface TEXT NOT NULL
    CONSTRAINT ccs_surface_check CHECK (
      surface IN ('erp_chat', 'kds_widget')
    ),
  messages JSONB[] NOT NULL DEFAULT '{}',
  context JSONB,
  status TEXT DEFAULT 'active'
    CONSTRAINT ccs_status_check CHECK (
      status IN ('active', 'closed')
    ),
  token_count_in INT DEFAULT 0,
  token_count_out INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes: per-user history + active sessions
CREATE INDEX IF NOT EXISTS idx_ccs_user_created
  ON chef_chat_sessions (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ccs_active
  ON chef_chat_sessions (status) WHERE status = 'active';

-- updated_at trigger — reuses fn_set_updated_at from migration 021
CREATE OR REPLACE TRIGGER trg_ccs_updated_at
  BEFORE UPDATE ON chef_chat_sessions
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

-- ══════════════════════════════════════════════════════════════
-- 3. RLS policies — authenticated only, no anon
--    Role helper: fn_get_my_role() from migration 126
-- ══════════════════════════════════════════════════════════════

-- ── chef_feedback_queue RLS ─────────────────────────────────

ALTER TABLE chef_feedback_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS feedback_insert_staff ON chef_feedback_queue;
CREATE POLICY feedback_insert_staff ON chef_feedback_queue
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM staff
      WHERE staff.auth_user_id = auth.uid()
        AND staff.is_active = true
        AND staff.app_role IN ('cook', 'owner')
    )
  );

DROP POLICY IF EXISTS feedback_select_owner ON chef_feedback_queue;
CREATE POLICY feedback_select_owner ON chef_feedback_queue
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM staff
      WHERE staff.auth_user_id = auth.uid()
        AND staff.is_active = true
        AND staff.app_role = 'owner'
    )
  );

DROP POLICY IF EXISTS feedback_update_owner ON chef_feedback_queue;
CREATE POLICY feedback_update_owner ON chef_feedback_queue
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM staff
      WHERE staff.auth_user_id = auth.uid()
        AND staff.is_active = true
        AND staff.app_role = 'owner'
    )
  );

-- ── chef_chat_sessions RLS ──────────────────────────────────

ALTER TABLE chef_chat_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sessions_select_own ON chef_chat_sessions;
CREATE POLICY sessions_select_own ON chef_chat_sessions
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()::text
    OR EXISTS (
      SELECT 1 FROM staff
      WHERE staff.auth_user_id = auth.uid()
        AND staff.is_active = true
        AND staff.app_role = 'owner'
    )
  );

DROP POLICY IF EXISTS sessions_insert_own ON chef_chat_sessions;
CREATE POLICY sessions_insert_own ON chef_chat_sessions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()::text
  );

DROP POLICY IF EXISTS sessions_update_own ON chef_chat_sessions;
CREATE POLICY sessions_update_own ON chef_chat_sessions
  FOR UPDATE
  TO authenticated
  USING (
    user_id = auth.uid()::text
  );

-- ══════════════════════════════════════════════════════════════
-- 4. Self-register in migration_log
-- ══════════════════════════════════════════════════════════════

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '130_ai_chef_foundation.sql',
  'claude-code',
  NULL,
  'AI Chef foundation: chef_feedback_queue + chef_chat_sessions. RLS authenticated-only. No anon policies (af26e9a4 pending). MC 0886291e'
)
ON CONFLICT DO NOTHING;

COMMIT;
