-- 506_close_anon_insert_haccp_waste.sql
--
-- MC ef80ceed (high) — the anon-INSERT slice. Follow-up to 504 (MC 5927338d).
--
-- THE BUG
-- ------------------------------------------------------------------------------
-- `haccp_logs` and `waste_entries` each carry an INSERT policy with `roles = {public}`
-- and `with_check = true`, and `anon` holds the table-level INSERT privilege on both. So
-- an unauthenticated caller holding the publishable key — which ships in the live site's
-- JavaScript bundle — can write food-safety and waste records.
--
-- CONFIRMED, not inferred. Run against prod inside a transaction that rolled back:
--
--   SET LOCAL ROLE anon;
--   INSERT INTO public.waste_entries
--     (production_task_id, waste_type, gross_weight, net_weight, recorded_by, notes)
--   SELECT (SELECT id FROM public.production_tasks LIMIT 1), 'spoilage', 99.0, 1.0,
--          (SELECT staff_id FROM public.shifts WHERE staff_id IS NOT NULL LIMIT 1), '…';
--   -- → 1 row inserted, recorded_by = a real staff UUID
--
-- `recorded_by` is `NOT NULL REFERENCES staff(id)`, so a forged row must name a real
-- employee. `staff` itself is closed to anon (401) — but **`shifts` is not**
-- (`shifts_read_anon`, `qual = true`, 206 rows), and it carries `staff_id`. Likewise
-- `production_tasks` is anon-readable (`kds_anon_read`, 82 rows) and supplies the required
-- `production_task_id`. So every input a forged row needs is harvestable by anon, and the
-- result is **a fabricated waste record attributed to a named employee** — not anonymous
-- junk. For HACCP that is a records-integrity problem, not merely a data-quality one.
--
-- Note for anyone re-running the probe: use a plain INSERT, **not** `INSERT … RETURNING`.
-- anon has no SELECT policy on `waste_entries`, so RETURNING fails with
-- "new row violates row-level security policy" and looks like the write was blocked when
-- it was not. That false negative cost one round of this investigation.
--
-- `haccp_logs` is, today, blocked by accident rather than by policy: `recipe_flow_id` is
-- `NOT NULL REFERENCES recipes_flow(id)` and `recipes_flow` is closed to anon, so there is
-- no way to obtain a valid id. The INSERT policy itself permits the write. That is one
-- leaked id away from being exploitable, so it is fixed here rather than relied upon.
--
-- WHY THIS IS SAFE — the question that kept tables out of 504
-- ------------------------------------------------------------------------------
-- 504 deliberately left table grants alone because 31 `qual = true` anon policies serve
-- the KDS and the staff Telegram app, and the ACL is checked *before* RLS, so a blind
-- revoke would cut live surfaces off. That objection does not apply to these two:
--
--   * **No code writes to them.** Searched both repos — `apps/`, `services/`, `packages/`,
--     all 15 edge functions, and shishka-health: zero references outside migrations.
--   * **Both tables are empty** (0 rows each).
--
-- They are scaffolding for the shrinkage / HACCP work that is not wired up yet. There is
-- no consumer to break, which is exactly why this slice can be done now and the rest of
-- MC ef80ceed cannot.
--
-- SHAPE OF THE FIX
-- ------------------------------------------------------------------------------
-- `TO authenticated`, not `roles = {public}` guarded by `fn_is_authenticated()`. Both deny
-- anon, but the guard form makes anon evaluate a function it lost EXECUTE on in 490, which
-- raises `42501 permission denied for function fn_is_authenticated` instead of a clean
-- denial — noisy, and it leaks that the policy exists. `TO authenticated` means no policy
-- applies to anon at all. It also matches what `waste_entries` already does for its own
-- SELECT and UPDATE (`roles = {authenticated}`, `qual = true`), so the table ends up
-- internally consistent instead of half one style and half the other.
--
-- OUT OF SCOPE, deliberately: the other three unconditional anon INSERT policies —
-- `cook_feedback`, `recipe_feedback`, `production_log`. Those look like intentional
-- feedback intake and each has a plausible anonymous writer, so they need the same
-- consumer check the rest of ef80ceed needs. Not folded in.

BEGIN;

-- ── haccp_logs ───────────────────────────────────────────────────────────────
-- INSERT: was roles={public} with_check=true
DROP POLICY IF EXISTS haccp_logs_insert ON public.haccp_logs;
CREATE POLICY haccp_logs_insert ON public.haccp_logs
  FOR INSERT TO authenticated WITH CHECK (true);

-- SELECT: was roles={public} qual=true, i.e. anon could also READ the food-safety log.
-- Strictly this is the read half of ef80ceed, but it is the same table and the same
-- policy sweep; closing it here avoids touching haccp_logs twice, and it is safe for the
-- same reason as the rest of this migration — no consumer, no rows.
DROP POLICY IF EXISTS haccp_logs_select ON public.haccp_logs;
CREATE POLICY haccp_logs_select ON public.haccp_logs
  FOR SELECT TO authenticated USING (true);

-- ── waste_entries ────────────────────────────────────────────────────────────
-- INSERT: was roles={public} with_check=true. SELECT and UPDATE were already
-- roles={authenticated} — the asymmetry is what gave this away as a leftover.
DROP POLICY IF EXISTS waste_entries_insert ON public.waste_entries;
CREATE POLICY waste_entries_insert ON public.waste_entries
  FOR INSERT TO authenticated WITH CHECK (true);

-- ── belt and braces: take anon off the table ACL too ─────────────────────────
-- The ACL is checked before RLS, so this alone would deny anon even if a future policy
-- re-opened the table by mistake. Safe here only because nothing anonymous reads or writes
-- these two; do NOT generalise this to the rest of the tables in ef80ceed.
REVOKE ALL ON public.haccp_logs    FROM anon;
REVOKE ALL ON public.waste_entries FROM anon;

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES ('506_close_anon_insert_haccp_waste.sql', 'claude-opus-session-df80a758', NULL,
        'MC ef80ceed: closed anon INSERT on haccp_logs and waste_entries (both were roles=public with_check=true; anon forging a waste_entries row attributed to a real staff id was confirmed against prod in a rolled-back transaction, harvesting staff_id from shifts and production_task_id from production_tasks). Also closed haccp_logs anon SELECT, same table. Policies moved to TO authenticated; anon removed from both table ACLs. Safe because no code in either repo or any edge function writes these tables and both are empty. cook_feedback/recipe_feedback/production_log left alone - plausible deliberate anon intake, still open on ef80ceed.');

COMMIT;
