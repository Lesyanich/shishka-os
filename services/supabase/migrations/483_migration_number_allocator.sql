-- 483_migration_number_allocator.sql
-- MC c520decf — CEO 2026-10-16: "Да, включай жёсткую блокировку — триггер на
-- migration_log, который отклоняет дубль номера. Строй по спеку."
-- Spec: docs/plans/spec-migration-number-allocator.md
--
-- WHY. A migration number is picked as "max + 1 at the moment I look" — by
-- eyeballing `ls`, or the max in origin/main. With a dozen sessions in parallel
-- worktrees, two read the same max inside the same minute and take the same
-- number. Nothing rejects the second one: migration_log accepts any filename and
-- the file sits in a branch nobody else can see. The cost is not local —
-- `migration-canary.sh --check-numbering` fails on ANY duplicate prefix in the
-- tree, so the moment two colliding branches meet in main, EVERY session in the
-- repo is blocked from committing ANY migration until someone renumbers by hand.
--
-- Cleaned up by hand three times: 37 files on 2026-06-11 (mig 267), 3 on
-- 2026-06-14 (mig 282), 3 on 2026-10-16 (mig 472, PR #602). The cleanups do not
-- converge, because numbers are consumed at APPLY time and origin/main cannot
-- see a number an unmerged branch already burned in prod.
--
-- Measured on 2026-10-16 while this migration was being written — the repair
-- path has the same bug:
--   15:37  473_analytics_hourly_heat_weekly.sql applied
--   15:39  479_renumber_th_migrations_log_sync.sql renumbered five TH migrations
--          466-471 -> 473-478 and gave `dish_names` the number 473, two minutes
--          after 473 was taken. It resolved four collisions and created a fifth.
--   15:19  480_cost_trust_views.sql (renumbered out of a 469 collision)
--   15:43  480_retire_rice_paper_rolls.sql applied -> collision at 480.
-- Two fresh collisions inside half an hour, one of them created BY a cleanup.
--
-- WHAT THIS DOES. Moves allocation from "look, then name the file" to "claim,
-- atomically, from the one place that knows what is truly applied including from
-- unmerged branches". Then makes prod refuse a duplicate outright, so a session
-- that skips the allocator is stopped at apply time (one rename) instead of at
-- merge time (whole repo blocked).
--
-- WHAT IS PRESERVED. Letter suffixes (466a) stay exactly as they are — the
-- mechanism for repairing an ALREADY-APPLIED duplicate after the fact, per
-- RENUMBERING-2026-06-11.md. `466` and `466a` are distinct here, as in the
-- canary. Gap numbers are still never reused — now by construction rather than
-- by remembering. The canary is NOT loosened: it is the thing that catches this.
--
-- BOOTSTRAP NOTE. This migration's own number was picked the same racy way, for
-- the last time -- and the race took it mid-build: it was written as 481, and by
-- the time it was ready to apply, 481 and 482 had both been taken by other
-- sessions. Renumbered to 483. That is a fourth occurrence inside one afternoon.
-- Its self-register INSERT at the bottom runs AFTER the guard trigger is created,
-- so the migration validates itself: had another session taken 483 in the
-- meantime, this transaction would abort with nothing half-applied.

BEGIN;

-- ─── 1. The registry ────────────────────────────────────────────────────────
-- One row per number ever handed out. The PRIMARY KEY *is* the guarantee: two
-- sessions cannot both hold (483, ''). Everything else is bookkeeping.
--
-- Rows are NEVER deleted. An abandoned claim stays as a tombstone, so its number
-- is permanently burned — which is exactly the standing "never reuse a gap" rule,
-- enforced structurally instead of by convention.
--
-- `letter` is in the key so one allocator serves both cases: bare numbers for new
-- work, letter suffixes for retrospective repair.
CREATE TABLE IF NOT EXISTS public.migration_numbers (
  number      integer     NOT NULL CHECK (number > 0),
  letter      text        NOT NULL DEFAULT '' CHECK (letter ~ '^[a-z]?$'),
  slug        text        NOT NULL CHECK (slug ~ '^[a-z0-9_]+$'),
  session_id  text        NOT NULL,
  git_branch  text,
  mc_task_id  text,
  state       text        NOT NULL DEFAULT 'reserved'
                          CHECK (state IN ('reserved', 'applied', 'abandoned')),
  claimed_at  timestamptz NOT NULL DEFAULT now(),
  applied_at  timestamptz,
  PRIMARY KEY (number, letter)
);

COMMENT ON TABLE public.migration_numbers IS
  'Migration number reservations. PK (number, letter) makes a collision physically '
  'impossible. Rows are never deleted: an abandoned claim permanently burns its '
  'number, which is the "never reuse a gap" rule. Claim via fn_claim_migration_number().';

-- Read-only to sessions; all writes go through the SECURITY DEFINER functions
-- below, which bypass RLS. No INSERT/UPDATE/DELETE policy is intentional.
ALTER TABLE public.migration_numbers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "migration_numbers_read" ON public.migration_numbers;
CREATE POLICY "migration_numbers_read" ON public.migration_numbers
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "migration_numbers_service_write" ON public.migration_numbers;
CREATE POLICY "migration_numbers_service_write" ON public.migration_numbers
  FOR ALL USING (auth.role() = 'service_role');

GRANT SELECT ON public.migration_numbers TO authenticated, service_role, anon;

-- ─── 2. Shared helpers ──────────────────────────────────────────────────────
-- The high-water mark across BOTH sources of truth:
--   migration_log      — what is applied to prod, including from unmerged branches
--   migration_numbers  — what is claimed but not yet applied
-- Neither alone is sufficient; the max of both is the only safe floor.
CREATE OR REPLACE FUNCTION public.fn_migration_number_high_water()
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT GREATEST(
    COALESCE((SELECT max((substring(filename FROM '^([0-9]+)'))::int)
                FROM migration_log
               WHERE filename ~ '^[0-9]+[a-z]?_'), 0),
    COALESCE((SELECT max(n.number) FROM migration_numbers n), 0)
  );
$$;

COMMENT ON FUNCTION public.fn_migration_number_high_water() IS
  'Highest migration number known to prod: max over applied (migration_log) and '
  'reserved (migration_numbers). origin/main is NOT authoritative — unmerged '
  'branches burn numbers above its max.';

-- Normalise a caller-supplied slug into the filename convention. Normalising
-- beats rejecting: a session that passes "Retire Potato Tacos" gets
-- "retire_potato_tacos" rather than an error it has to go read about.
CREATE OR REPLACE FUNCTION public.fn_migration_slug_normalize(p_slug text)
RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT trim(both '_' from
           regexp_replace(lower(coalesce(p_slug, '')), '[^a-z0-9]+', '_', 'g'));
$$;

-- ─── 3. The allocator ───────────────────────────────────────────────────────
-- Atomic: the advisory lock is held to COMMIT, so read-then-insert is indivisible
-- across sessions. The PK is the backstop if anything ever bypasses the lock.
CREATE OR REPLACE FUNCTION public.fn_claim_migration_number(
  p_slug       text,
  p_session_id text,
  p_git_branch text DEFAULT NULL,
  p_mc_task_id text DEFAULT NULL
) RETURNS TABLE (number integer, filename text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_num  integer;
  v_slug text;
BEGIN
  v_slug := fn_migration_slug_normalize(p_slug);
  IF v_slug = '' THEN
    RAISE EXCEPTION 'migration slug is empty after normalisation (got %)', p_slug;
  END IF;
  IF coalesce(trim(p_session_id), '') = '' THEN
    RAISE EXCEPTION 'session_id is required — it is how an abandoned claim is traced back';
  END IF;

  -- Serialise every allocator call against every other one.
  PERFORM pg_advisory_xact_lock(hashtext('migration_number_allocator'));

  v_num := fn_migration_number_high_water() + 1;

  INSERT INTO migration_numbers (number, letter, slug, session_id, git_branch, mc_task_id)
  VALUES (v_num, '', v_slug, p_session_id, p_git_branch, p_mc_task_id);

  RETURN QUERY
    SELECT v_num, lpad(v_num::text, 3, '0') || '_' || v_slug || '.sql';
END $$;

COMMENT ON FUNCTION public.fn_claim_migration_number(text, text, text, text) IS
  'Atomically claim the next free migration number and return the filename to use. '
  'Call this instead of eyeballing `ls services/supabase/migrations`. '
  'Example: SELECT * FROM fn_claim_migration_number(''my_change'', ''<session-id>'');';

-- Letter suffix at an existing anchor, for repairing an ALREADY-APPLIED
-- duplicate per RENUMBERING-2026-06-11.md. Same lock, same table, so two
-- sessions repairing at once cannot both pick `469a` — which is how the
-- 2026-10-16 15:39 cleanup went wrong.
CREATE OR REPLACE FUNCTION public.fn_claim_migration_letter(
  p_anchor     integer,
  p_slug       text,
  p_session_id text,
  p_git_branch text DEFAULT NULL,
  p_mc_task_id text DEFAULT NULL
) RETURNS TABLE (letter text, filename text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_slug   text;
  v_letter text;
BEGIN
  v_slug := fn_migration_slug_normalize(p_slug);
  IF v_slug = '' THEN
    RAISE EXCEPTION 'migration slug is empty after normalisation (got %)', p_slug;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('migration_number_allocator'));

  -- First letter a-z not already used at this anchor, in either source.
  SELECT c INTO v_letter
  FROM unnest(string_to_array('a,b,c,d,e,f,g,h,i,j,k,l,m,n,o,p,q,r,s,t,u,v,w,x,y,z', ',')) AS c
  WHERE NOT EXISTS (
          SELECT 1 FROM migration_numbers n
           WHERE n.number = p_anchor AND n.letter = c)
    AND NOT EXISTS (
          SELECT 1 FROM migration_log l
           WHERE substring(l.filename FROM '^([0-9]+[a-z]?)')
                 = lpad(p_anchor::text, 3, '0') || c)
  ORDER BY c
  LIMIT 1;

  IF v_letter IS NULL THEN
    RAISE EXCEPTION 'anchor % has no free letter suffix (a-z all taken)', p_anchor;
  END IF;

  INSERT INTO migration_numbers (number, letter, slug, session_id, git_branch, mc_task_id)
  VALUES (p_anchor, v_letter, v_slug, p_session_id, p_git_branch, p_mc_task_id);

  RETURN QUERY
    SELECT v_letter,
           lpad(p_anchor::text, 3, '0') || v_letter || '_' || v_slug || '.sql';
END $$;

COMMENT ON FUNCTION public.fn_claim_migration_letter(integer, text, text, text, text) IS
  'Atomically claim the next free letter suffix at an anchor, for repairing an '
  'already-applied duplicate (RENUMBERING-2026-06-11.md). New work uses '
  'fn_claim_migration_number() instead.';

-- ─── 4. The guard — prod refuses a duplicate ────────────────────────────────
-- A trigger, NOT a UNIQUE/CHECK constraint: migration_log already holds
-- duplicate pairs from before this migration, and a constraint — even NOT VALID
-- — would block unrelated UPDATEs to those historical rows. A BEFORE trigger
-- validates only the row in flight and leaves history alone.
--
-- Fires on UPDATE OF filename as well as INSERT, because renumber migrations
-- rewrite migration_log.filename — and that is exactly where the 15:39 mistake
-- happened. This would have rejected it.
CREATE OR REPLACE FUNCTION public.fn_migration_log_guard_number()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_prefix   text;
  v_existing text;
BEGIN
  v_prefix := substring(NEW.filename FROM '^([0-9]+[a-z]?)');

  -- Not a numbered migration (ad-hoc / baseline row): nothing to guard.
  IF v_prefix IS NULL THEN
    RETURN NEW;
  END IF;

  -- Compare the FULL prefix, so 469a stays distinct from 469.
  -- Exclude the row itself (by id, so a no-op UPDATE cannot self-conflict).
  -- Exclude failed / rolled-back rows: a migration that did not take effect
  -- must not permanently burn its number for a different file.
  SELECT l.filename INTO v_existing
  FROM migration_log l
  WHERE substring(l.filename FROM '^([0-9]+[a-z]?)') = v_prefix
    AND l.id IS DISTINCT FROM NEW.id
    AND l.filename <> NEW.filename
    AND l.status NOT IN ('failed', 'rolled_back')
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RAISE EXCEPTION
      'migration number % is already taken by %',
      v_prefix, v_existing
    USING HINT =
      'Claim a free number instead of guessing: SELECT * FROM '
      'fn_claim_migration_number(''<slug>'', ''<session-id>''); then rename your '
      'file to the filename it returns. Repairing an already-applied duplicate? '
      'Use fn_claim_migration_letter(<anchor>, ...). See '
      'docs/constitution/technical-rules.md RULE-MIGRATION-NUMBERING.';
  END IF;

  -- Close the loop: the matching reservation becomes 'applied'. This is what
  -- makes non-compliance visible — a row still 'reserved' days later is a claim
  -- that never shipped, and a migration_log row with no reservation at all is a
  -- session that skipped the allocator.
  UPDATE migration_numbers
     SET state = 'applied', applied_at = now()
   WHERE number = (substring(v_prefix FROM '^([0-9]+)'))::int
     AND letter = COALESCE(substring(v_prefix FROM '([a-z])$'), '')
     AND state  = 'reserved';

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_migration_log_guard_number ON public.migration_log;
CREATE TRIGGER trg_migration_log_guard_number
  BEFORE INSERT OR UPDATE OF filename ON public.migration_log
  FOR EACH ROW EXECUTE FUNCTION public.fn_migration_log_guard_number();

-- ─── 5. Visibility ──────────────────────────────────────────────────────────
-- The query that had to be hand-written during every one of the three cleanups.
CREATE OR REPLACE VIEW public.v_migration_collisions AS
WITH guard AS (
  -- When the apply-time guard went live. Everything before it is frozen history.
  SELECT applied_at AS live_since
  FROM migration_log
  WHERE filename = '483_migration_number_allocator.sql'
  LIMIT 1
),
p AS (
  SELECT id, filename, applied_at, applied_by,
         substring(filename FROM '^([0-9]+[a-z]?)') AS prefix
  FROM migration_log
  WHERE filename ~ '^[0-9]+[a-z]?_'
    AND status NOT IN ('failed', 'rolled_back')
)
SELECT p.prefix,
       count(*)                                 AS file_count,
       array_agg(p.filename ORDER BY p.applied_at) AS filenames,
       min(p.applied_at)                        AS first_applied_at,
       max(p.applied_at)                        AS last_applied_at,
       -- TRUE  = pre-existing log history, already frozen; needs nothing.
       -- FALSE = formed after the guard went live, which the guard makes
       --         impossible unless it was disabled. Investigate those.
       (max(p.applied_at) < (SELECT live_since FROM guard)) AS is_pre_guard
FROM p
GROUP BY p.prefix
HAVING count(*) > 1;

COMMENT ON VIEW public.v_migration_collisions IS
  'Duplicate migration numbers in migration_log. NOTE: this is the LOG, not the '
  'file tree — migration-canary.sh --check-numbering reads the tree, so a log-only '
  'duplicate does not block commits. On 2026-10-16 there were 50 such rows, all '
  'is_pre_guard = true: branches whose files were renamed in the repo without a '
  'migration_log.filename UPDATE (the log<->repo reconciliation debt noted in '
  'RENUMBERING-2026-06-11.md). The invariant going forward is that no row has '
  'is_pre_guard = false — trg_migration_log_guard_number makes a new collision '
  'impossible, so one appearing means the trigger was disabled.';

-- Gaps made explicit: every number from 1 to the high-water mark, labelled.
-- 'burned' is a number that can never be reused — the standing rule, now queryable.
CREATE OR REPLACE VIEW public.v_migration_number_map AS
WITH hi AS (
  SELECT GREATEST(fn_migration_number_high_water(), 1) AS n
),
applied AS (
  SELECT (substring(filename FROM '^([0-9]+)'))::int AS num,
         array_agg(filename ORDER BY applied_at)      AS filenames
  FROM migration_log
  WHERE filename ~ '^[0-9]+[a-z]?_'
    AND status NOT IN ('failed', 'rolled_back')
  GROUP BY 1
),
reserved AS (
  SELECT number AS num,
         array_agg(COALESCE(NULLIF(letter, ''), '-') || ':' || slug
                   || ' (' || state || ')' ORDER BY letter) AS claims,
         bool_or(state = 'reserved')  AS has_open_claim,
         bool_or(state = 'abandoned') AS has_abandoned,
         min(session_id)              AS claimed_by
  FROM migration_numbers
  GROUP BY 1
)
SELECT g.num                                AS number,
       CASE
         WHEN a.num IS NOT NULL             THEN 'applied'
         WHEN r.has_open_claim              THEN 'reserved'
         WHEN r.has_abandoned               THEN 'burned'
         ELSE                                    'gap'
       END                                  AS state,
       a.filenames                          AS applied_filenames,
       r.claims                             AS reservations,
       r.claimed_by
FROM hi, generate_series(1, hi.n) AS g(num)
LEFT JOIN applied  a ON a.num = g.num
LEFT JOIN reserved r ON r.num = g.num;

COMMENT ON VIEW public.v_migration_number_map IS
  'Every migration number 1..high-water with its state: applied, reserved, '
  'burned (claimed then abandoned — never reusable) or gap. A "gap" is a number '
  'no one ever took; it is still never reused, per RENUMBERING-2026-06-11.md.';

GRANT SELECT ON public.v_migration_collisions, public.v_migration_number_map
  TO authenticated, service_role, anon;

GRANT EXECUTE ON FUNCTION public.fn_claim_migration_number(text, text, text, text)        TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_claim_migration_letter(integer, text, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_migration_number_high_water()                          TO authenticated, service_role, anon;

-- ─── 6. Seed the registry from history ──────────────────────────────────────
-- Mark every number already in migration_log as 'applied', so the allocator's
-- high-water mark is right from the first call and the loop-closing UPDATE in
-- the guard has rows to find. ON CONFLICT DO NOTHING keeps this idempotent.
INSERT INTO public.migration_numbers (number, letter, slug, session_id, state, claimed_at, applied_at)
SELECT DISTINCT ON (num, ltr)
       num, ltr,
       fn_migration_slug_normalize(
         regexp_replace(filename, '^[0-9]+[a-z]?_|\.sql$', '', 'g')),
       'backfill-483',
       'applied',
       applied_at,
       applied_at
FROM (
  SELECT filename, applied_at,
         (substring(filename FROM '^([0-9]+)'))::int                AS num,
         COALESCE(substring(substring(filename FROM '^([0-9]+[a-z]?)')
                            FROM '([a-z])$'), '')                   AS ltr
  FROM migration_log
  WHERE filename ~ '^[0-9]+[a-z]?_'
    AND status NOT IN ('failed', 'rolled_back')
) s
ORDER BY num, ltr, applied_at
ON CONFLICT (number, letter) DO NOTHING;

-- ─── 7. Self-register (runs under the guard created above) ──────────────────
INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES ('483_migration_number_allocator.sql', 'claude-opus-session-c7283135', NULL,
        'MC c520decf — atomic migration-number allocator + apply-time duplicate guard');

COMMIT;
