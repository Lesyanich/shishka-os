-- Migration 335 — add 'delete' to loyverse_push_action
-- Why: let the agent/admin remove a dish's item from Loyverse through the same
-- audited push queue (action='delete', target_id=dish). The edge function resolves
-- the dish's loyverse_item_id, soft-deletes it in Loyverse, and unlinks the DB row
-- (handleDeleteDish → handleDeleteItem). Pairs with the loyverse-sync deploy that
-- adds the 'delete' case to internal_push.

-- ADD VALUE is idempotent and safe to run outside an explicit txn block.
ALTER TYPE loyverse_push_action ADD VALUE IF NOT EXISTS 'delete';

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '335_loyverse_push_queue_delete_action.sql',
  'claude-code',
  NULL,
  'Add ''delete'' to loyverse_push_action enum so the push queue can drive Loyverse item deletion (action=delete, target_id=dish → handleDeleteDish). Soft-delete + DB unlink.'
)
ON CONFLICT DO NOTHING;

-- DOWN (manual; Postgres cannot drop a single enum value — would require recreating
-- the type). No automated down.
