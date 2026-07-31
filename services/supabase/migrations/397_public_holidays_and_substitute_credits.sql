-- 397_public_holidays_and_substitute_credits.sql
-- MC task: 56512d1a-37e9-414a-8fee-1702f5f26cc1
-- Spec: docs/plans/spec-hr-payroll-process.md § 4.2
--
-- CORRECTION TO THE SPEC. § 4.2 and the 2026-07-31 analysis both state that no
-- holiday calendar exists. That is wrong. `public_holidays` has existed since
-- migration 170a, is seeded with 17 rows for 2026, and is already read by
-- `useScheduleTemplates.ts` (which skips holidays when generating shifts) and by
-- `use-attendance.ts`. That is precisely WHY 28 July 2026 held zero shifts while
-- every other July weekday held three or four — the generator did its job. The
-- spec section is corrected in the same commit as this migration.
--
-- WHAT IS ACTUALLY MISSING, and what this migration adds:
--
--  1. No way to record that we TRADED THROUGH a holiday. The table is a list of
--     dates, with an implicit "shop closed" assumption baked into the schedule
--     generator. 28 July breaks that assumption: the shop opened and everyone
--     worked. Adds `is_company_closed`.
--  2. No ledger of what working a holiday earns. CEO 2026-07-31: "в ДР короля мы
--     все работали, значит в системе должен быть один выходной день
--     дополнительно" — a substitute day off, not a cash premium. Lawful and
--     specifically available to a restaurant: LPA §29 requires ≥13 paid public
--     holidays a year, and its final paragraph lets a hotel/restaurant employer
--     agree a SUBSTITUTE day instead, the alternative being holiday-rate pay
--     under §62. An untracked promise is not a holiday, so it needs a balance
--     somebody can spend. Adds `holiday_credits`.
--  3. Two July holidays are absent from the 2026 seed: Asalha Bucha and Khao
--     Phansa. Both are lunar and both fall in July, so if the shop traded on
--     either, further substitute days are owed. They are NOT added here — lunar
--     dates move every year and must be copied from the published government
--     list, never guessed. `is_confirmed` exists to mark that doubt in the data
--     rather than in someone's memory.
--  4. Nothing recorded that 28 July was worked at all. Because the date was
--     missing from `shifts`, `days_worked` under-counted a day everyone worked.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Extend the existing calendar
-- ---------------------------------------------------------------------------

ALTER TABLE public.public_holidays
  ADD COLUMN IF NOT EXISTS kind              TEXT NOT NULL DEFAULT 'fixed',
  ADD COLUMN IF NOT EXISTS is_company_closed BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_confirmed      BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS note              TEXT,
  ADD COLUMN IF NOT EXISTS updated_at        TIMESTAMPTZ NOT NULL DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'public_holidays_kind_check') THEN
    ALTER TABLE public.public_holidays
      ADD CONSTRAINT public_holidays_kind_check
      CHECK (kind IN ('fixed', 'lunar', 'substitute', 'special'));
  END IF;
  -- holiday_date is the natural key but was never constrained; holiday_credits
  -- needs it to reference, and the upserts below need it to conflict on.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'public_holidays_date_key') THEN
    ALTER TABLE public.public_holidays
      ADD CONSTRAINT public_holidays_date_key UNIQUE (holiday_date);
  END IF;
END $$;

COMMENT ON COLUMN public.public_holidays.is_company_closed IS
  'false = we traded through this holiday. That is what earns substitute days off. '
  'The schedule generator (useScheduleTemplates) skips every holiday regardless, so a false '
  'here means the shifts were worked without being scheduled.';
COMMENT ON COLUMN public.public_holidays.is_confirmed IS
  'false = the date has not been checked against the official published list. Lunar holidays '
  '(Makha/Visakha/Asalha Bucha, Khao Phansa) move every year — treat unconfirmed as a question.';

-- Owner-only writes. The two pre-existing SELECT policies stay untouched;
-- until now the table had no write policy at all.
DROP POLICY IF EXISTS public_holidays_write ON public.public_holidays;
CREATE POLICY public_holidays_write ON public.public_holidays FOR ALL
  USING ((SELECT r.app_role FROM fn_get_my_role() r) = 'owner')
  WITH CHECK ((SELECT r.app_role FROM fn_get_my_role() r) = 'owner');

-- Classify what is already seeded, and record the two known gaps.
UPDATE public.public_holidays
SET kind = 'lunar', updated_at = now()
WHERE name_en ILIKE '%bucha%' OR name_en ILIKE '%phansa%';

UPDATE public.public_holidays
SET is_company_closed = false,
    note = 'WE TRADED THROUGH THIS DAY. The schedule generator skipped it (zero shifts on a '
        || 'Tuesday, while every other July weekday had 3-4), but the shop opened and the staff '
        || 'worked. CEO 2026-07-31 chose the substitute-day-off route over holiday-rate pay — '
        || 'lawful for a restaurant under LPA s.29 final paragraph.',
    updated_at = now()
WHERE holiday_date = DATE '2026-07-28';

-- ---------------------------------------------------------------------------
-- 2. The substitute-day ledger
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.holiday_credits (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id     UUID NOT NULL REFERENCES public.staff(id),
  /* The holiday that was worked, i.e. what earned this day. */
  earned_for   DATE NOT NULL REFERENCES public.public_holidays(holiday_date),
  status       TEXT NOT NULL DEFAULT 'owed'
               CHECK (status IN ('owed', 'used', 'paid_out', 'expired')),
  /* The day actually taken off, once it is taken. */
  used_on      DATE,
  note         TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  /* One credit per person per holiday — makes the granting function idempotent. */
  UNIQUE (staff_id, earned_for)
);

COMMENT ON TABLE public.holiday_credits IS
  'Substitute days off owed for working a public holiday (LPA s.29 restaurant substitute-day '
  'route, chosen by the CEO over holiday-rate pay). One row per person per holiday.';

CREATE INDEX IF NOT EXISTS idx_holiday_credits_staff_status
  ON public.holiday_credits(staff_id, status);

ALTER TABLE public.holiday_credits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS holiday_credits_select ON public.holiday_credits;
DROP POLICY IF EXISTS holiday_credits_write  ON public.holiday_credits;

-- An employee must be able to see what they are owed; only the owner changes it.
CREATE POLICY holiday_credits_select ON public.holiday_credits FOR SELECT
  USING (
    staff_id = (SELECT r.staff_id FROM fn_get_my_role() r)
    OR (SELECT r.app_role FROM fn_get_my_role() r) = 'owner'
  );
CREATE POLICY holiday_credits_write ON public.holiday_credits FOR ALL
  USING ((SELECT r.app_role FROM fn_get_my_role() r) = 'owner')
  WITH CHECK ((SELECT r.app_role FROM fn_get_my_role() r) = 'owner');

-- ---------------------------------------------------------------------------
-- 3. Granting credits
-- ---------------------------------------------------------------------------
-- A credit is earned by ACTUALLY WORKING a public holiday — evidenced by a
-- staff_attendance row with status 'worked' on that date. Not by being employed,
-- not by being scheduled. Idempotent, so it is safe to re-run after backfilling
-- attendance or after adding a lunar holiday that was missing from the calendar.

CREATE OR REPLACE FUNCTION public.fn_sync_holiday_credits(
  p_from DATE DEFAULT NULL,
  p_to   DATE DEFAULT NULL
)
RETURNS TABLE (staff_name TEXT, holiday_on DATE, holiday_name TEXT, outcome TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  WITH worked AS (
    SELECT a.staff_id, h.holiday_date, h.name_en
    FROM public.public_holidays h
    JOIN public.staff_attendance a ON a.attendance_date = h.holiday_date
    WHERE a.status = 'worked'
      AND (p_from IS NULL OR h.holiday_date >= p_from)
      AND (p_to   IS NULL OR h.holiday_date <= p_to)
  ), inserted AS (
    INSERT INTO public.holiday_credits (staff_id, earned_for, note)
    SELECT w.staff_id, w.holiday_date,
           format('Worked %s (%s) — substitute day off owed, LPA s.29.', w.name_en, w.holiday_date)
    FROM worked w
    ON CONFLICT (staff_id, earned_for) DO NOTHING
    RETURNING holiday_credits.staff_id, holiday_credits.earned_for
  )
  SELECT s.name, w.holiday_date, w.name_en,
         CASE WHEN i.staff_id IS NOT NULL THEN 'granted' ELSE 'already existed' END
  FROM worked w
  JOIN public.staff s ON s.id = w.staff_id
  LEFT JOIN inserted i ON i.staff_id = w.staff_id AND i.earned_for = w.holiday_date
  ORDER BY w.holiday_date, s.name;
END;
$function$;

COMMENT ON FUNCTION public.fn_sync_holiday_credits IS
  'Grants one substitute-day credit per person per public holiday they actually worked. '
  'Idempotent — re-run freely after backfilling attendance or adding a missing lunar holiday.';

-- Balance for the UI and the payslip.
CREATE OR REPLACE VIEW public.v_holiday_credit_balance AS
SELECT
  s.id   AS staff_id,
  s.name AS staff_name,
  COUNT(c.id) FILTER (WHERE c.status = 'owed') AS days_owed,
  COUNT(c.id) FILTER (WHERE c.status = 'used') AS days_used,
  MIN(c.earned_for) FILTER (WHERE c.status = 'owed') AS oldest_unused
FROM public.staff s
LEFT JOIN public.holiday_credits c ON c.staff_id = s.id
WHERE s.is_active
GROUP BY s.id, s.name;

-- ---------------------------------------------------------------------------
-- 4. Backfill 28 July 2026
-- ---------------------------------------------------------------------------
-- Everyone employed on the day worked it. Alex is excluded by his fire_date of
-- 2026-07-07 — he had already left. Recording the day fixes days_worked (the
-- date was missing from the schedule entirely) and gives fn_sync_holiday_credits
-- the evidence it needs.

INSERT INTO public.staff_attendance (staff_id, attendance_date, status, notes)
SELECT s.id, DATE '2026-07-28', 'worked',
       'Worked HM the King''s Birthday. The date was absent from the schedule because the '
    || 'generator skips public holidays, so this row is the only record that the day was worked. '
    || 'Earns a substitute day off (holiday_credits) per CEO decision 2026-07-31.'
FROM public.staff s
WHERE s.monthly_salary IS NOT NULL
  AND s.hire_date IS NOT NULL
  AND s.hire_date <= DATE '2026-07-28'
  AND (s.fire_date IS NULL OR s.fire_date >= DATE '2026-07-28')
ON CONFLICT (staff_id, attendance_date) DO NOTHING;

SELECT public.fn_sync_holiday_credits(DATE '2026-01-01', DATE '2026-12-31');

-- ---------------------------------------------------------------------------
-- 4b. April 2026 was already settled in cash — do not pay for it twice
-- ---------------------------------------------------------------------------
-- The sync above correctly finds that Alex and Hein worked Chakri Day and all
-- three Songkran days. Those were NOT left outstanding: the April 2026 payroll
-- line notes read "Holiday bonus: 4 public holidays worked (Chakri Day + 3x
-- Songkran) x 500 THB = 2,000", and that 2,000 sits in overtime_pay for both.
-- Leaving the credits as 'owed' would grant a substitute day for a day already
-- compensated. They are marked settled rather than deleted — a ledger exists to
-- record how an entitlement was discharged, not to hide that it arose.

UPDATE public.holiday_credits
SET status  = 'paid_out',
    note    = note || ' SETTLED IN CASH in the April 2026 payroll: 500 THB per holiday worked, '
                   || '4 holidays = 2,000 THB, recorded in overtime_pay. No substitute day is owed '
                   || 'for this date.',
    updated_at = now()
WHERE earned_for BETWEEN DATE '2026-04-01' AND DATE '2026-04-30';

-- ---------------------------------------------------------------------------
-- 5. Ledger
-- ---------------------------------------------------------------------------

INSERT INTO public.migration_log (filename, applied_by, status, notes)
VALUES ('397_public_holidays_and_substitute_credits.sql', 'claude-opus-session-eb56fda0', 'success',
        'Substitute-day-off tracking on top of the EXISTING public_holidays table (created in 170a '
     || '— the spec claim that no calendar existed was wrong and is corrected in the same commit). '
     || 'Adds is_company_closed (28 Jul 2026 set false: the generator skipped it but the shop '
     || 'traded), is_confirmed, kind, note, a unique key on holiday_date, and an owner-only write '
     || 'policy where there was none. New holiday_credits ledger + fn_sync_holiday_credits (grants '
     || 'one credit per person per holiday ACTUALLY worked, idempotent) + v_holiday_credit_balance. '
     || 'Backfilled 2026-07-28 attendance and granted the substitute days. STILL MISSING from the '
     || '2026 seed: Asalha Bucha and Khao Phansa, both lunar and both in July — if the shop traded '
     || 'on either, more credits are owed. MC 56512d1a.')
ON CONFLICT DO NOTHING;

COMMIT;

-- ---------------------------------------------------------------------------
-- DOWN
-- ---------------------------------------------------------------------------
-- BEGIN;
-- DELETE FROM public.staff_attendance WHERE attendance_date = DATE '2026-07-28';
-- DROP VIEW IF EXISTS public.v_holiday_credit_balance;
-- DROP FUNCTION IF EXISTS public.fn_sync_holiday_credits(date, date);
-- DROP TABLE IF EXISTS public.holiday_credits;   -- INTENTIONAL DROP
-- ALTER TABLE public.public_holidays
--   DROP COLUMN IF EXISTS kind, DROP COLUMN IF EXISTS is_company_closed,
--   DROP COLUMN IF EXISTS is_confirmed, DROP COLUMN IF EXISTS note,
--   DROP COLUMN IF EXISTS updated_at;
-- DELETE FROM public.migration_log WHERE filename='397_public_holidays_and_substitute_credits.sql';
-- COMMIT;
