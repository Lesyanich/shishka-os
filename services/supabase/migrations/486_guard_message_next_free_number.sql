-- 486_guard_message_next_free_number.sql
-- MC c520decf — follow-up to 483_migration_number_allocator.sql
--
-- WHY. Review from a parallel session that had been bitten by this twice in one
-- day raised two fair objections to the guard shipped in 483:
--
--   "REJECTION ALONE IS NOT A FIX. If two sessions are handed the same number and
--    the second is rejected at apply time, that session is now mid-migration
--    holding a number it cannot use. It needs to be handed the next free one in
--    the same call."
--
--   "MAKE THE FAILURE READABLE. When it rejects, say which session/filename holds
--    the number and what the next free one is. Today the only way anyone
--    discovered a collision was a pre-commit hook failing on someone else's files."
--
-- 483's message named the filename holding the number and told the caller to go
-- call the allocator. It did not say WHO holds it, and it did not say what to use
-- instead — so the rejected session still had to go and look, which is the habit
-- this whole change is trying to break.
--
-- WHAT CHANGES. Only the text of the exception raised by
-- fn_migration_log_guard_number(). No change to what is accepted or rejected:
-- same predicate, same full-prefix comparison, same failed/rolled_back exclusion.
-- The message now carries who holds the number (applied_by, and the claiming
-- session if there is a live reservation) and the next free number.
--
-- The next free number is deliberately labelled ADVISORY. Printing it as a value
-- to use would re-introduce the exact race this fixes: between reading it and
-- applying, another session can take it. The caller must still claim.

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_migration_log_guard_number()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_prefix     text;
  v_existing   text;
  v_by         text;
  v_at         timestamptz;
  v_holder     text;
  v_next       integer;
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
  SELECT l.filename, l.applied_by, l.applied_at
    INTO v_existing, v_by, v_at
  FROM migration_log l
  WHERE substring(l.filename FROM '^([0-9]+[a-z]?)') = v_prefix
    AND l.id IS DISTINCT FROM NEW.id
    AND l.filename <> NEW.filename
    AND l.status NOT IN ('failed', 'rolled_back')
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    -- Who claimed it, if the number went through the allocator at all.
    SELECT n.session_id INTO v_holder
    FROM migration_numbers n
    WHERE n.number = (substring(v_prefix FROM '^([0-9]+)'))::int
      AND n.letter = COALESCE(substring(v_prefix FROM '([a-z])$'), '')
    LIMIT 1;

    v_next := fn_migration_number_high_water() + 1;

    RAISE EXCEPTION
      'migration number % is already taken by % (applied by % at %)%',
      v_prefix, v_existing, COALESCE(v_by, 'unknown'),
      to_char(v_at, 'YYYY-MM-DD HH24:MI'),
      CASE WHEN v_holder IS NOT NULL AND v_holder <> COALESCE(v_by, '')
           THEN ', claimed by ' || v_holder ELSE '' END
    USING HINT =
      'Next free number is ' || v_next || ' — ADVISORY, not reserved: another '
      || 'session can take it between now and your apply. Claim it, do not just '
      || 'rename to it: SELECT * FROM fn_claim_migration_number(''<slug>'', '
      || '''<your-session-id>''); then rename your file to the filename it '
      || 'returns and re-apply. Shell: scripts/migration-number.sh claim <slug>. '
      || 'Repairing an already-applied duplicate instead? '
      || 'fn_claim_migration_letter(' || (substring(v_prefix FROM '^([0-9]+)'))::int
      || ', ...). Only your apply is blocked — nobody else is. See '
      || 'docs/constitution/technical-rules.md RULE-MIGRATION-NUMBERING.';
  END IF;

  -- Close the loop: the matching reservation becomes 'applied'.
  UPDATE migration_numbers
     SET state = 'applied', applied_at = now()
   WHERE number = (substring(v_prefix FROM '^([0-9]+)'))::int
     AND letter = COALESCE(substring(v_prefix FROM '([a-z])$'), '')
     AND state  = 'reserved';

  RETURN NEW;
END $fn$;

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES ('486_guard_message_next_free_number.sql', 'claude-opus-session-c7283135', NULL,
        'MC c520decf — guard error message now names the holder and the next free number (peer review of 483)');

COMMIT;
