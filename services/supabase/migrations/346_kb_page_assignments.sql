-- 346_kb_page_assignments.sql
-- Per-employee Handbook page sets. Builds on 345 (kb_pages).
--
-- WHY: each employee should have their OWN set of instructions. A page with no
-- assignments stays visible to everyone in its role (min_role) — shared basics
-- like company info. A page WITH assignments becomes personal: only the assigned
-- staff (plus managers/owner) see it. This lets the owner distribute specific
-- SOPs to specific people while keeping general pages open.
--
-- Visibility is computed in the app (same UI-level model as min_role, mig 345):
-- non-sensitive instructional content, so DB read stays open to authenticated.
-- Writes are owner-only. Additive + idempotent.

BEGIN;

CREATE TABLE IF NOT EXISTS public.kb_page_assignments (
  page_id     uuid NOT NULL REFERENCES public.kb_pages(id) ON DELETE CASCADE,
  staff_id    uuid NOT NULL REFERENCES public.staff(id)    ON DELETE CASCADE,
  assigned_by text,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (page_id, staff_id)
);

COMMENT ON TABLE public.kb_page_assignments IS
  'Assigns a Handbook page to a specific staff member. A page with >=1 assignment is personal (only assignees + managers/owner see it in the UI); a page with none stays role-visible via kb_pages.min_role. UI-level gate (reads open to authenticated).';

CREATE INDEX IF NOT EXISTS idx_kb_assignments_staff ON public.kb_page_assignments(staff_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.kb_page_assignments TO authenticated;

ALTER TABLE public.kb_page_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS kb_assignments_select ON public.kb_page_assignments;
CREATE POLICY kb_assignments_select ON public.kb_page_assignments
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS kb_assignments_write ON public.kb_page_assignments;
CREATE POLICY kb_assignments_write ON public.kb_page_assignments
  FOR ALL USING (public.fn_is_owner()) WITH CHECK (public.fn_is_owner());

INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES ('346_kb_page_assignments.sql', 'claude-code',
  'Per-employee Handbook page assignments: kb_page_assignments(page_id, staff_id). Read authenticated, write owner (fn_is_owner). Unassigned pages stay role-visible; assigned pages become personal (UI-level).')
ON CONFLICT (filename) DO NOTHING;

COMMIT;
