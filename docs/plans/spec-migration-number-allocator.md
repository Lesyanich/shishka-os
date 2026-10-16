# Spec — Migration number allocator

> MC task: `c520decf-8ea1-45a8-b3dc-c55240ede544`
> Status: **DESIGN — awaiting CEO sign-off before build** (changes how every session works)
> Author session: `claude-opus-session-c7283135` · branch `claude/beautiful-cray-317631`
> Supersedes the manual procedure in `services/supabase/migrations/RENUMBERING-2026-06-11.md`
> (that doc stays — it remains the rule for repairing *already-applied* collisions).

---

## 1. The problem

A migration number is chosen as **"max + 1 at the moment I look"** — by eyeballing
`ls services/supabase/migrations`, or the max in `origin/main`.

With a dozen sessions working the repo in parallel worktrees, two sessions read the
same max inside the same minute and take the same number. Nothing anywhere rejects
the second one: `migration_log` accepts any filename, and the file lands in a branch
nobody else can see yet.

The cost is not local. `scripts/migration-canary.sh --check-numbering` fails on **any**
duplicate numeric prefix in the tree, so the moment two colliding branches meet in
`main`, *every* session in the repo is blocked from committing *any* migration until
someone renumbers by hand.

This has now been cleaned up by hand three times:

| Date | Files renamed | Log-sync migration |
|---|---|---|
| 2026-06-11 | 37 files / 32 numbers | `267_renumber_collision_log_sync.sql` |
| 2026-06-14 | 3 files | `282_renumber_273_275_collision_log_sync.sql` |
| 2026-10-16 | 3 files (PR #602) | `472_renumber_463_465_466_collision_log_sync.sql` |

### 1.1 Why the cleanups do not converge

Numbers are consumed at **apply** time. `origin/main` does not know about a number
that an unmerged branch already burned in prod. So each cleanup is computed against
a tree that is already stale, and new collisions accumulate behind it while the
cleanup is being written.

Measured on 2026-10-16, after PR #602 had just landed:

```
466  466_tomato_paste_pack_factor.sql        | 466_dish_names_stay_english_in_every_language.sql
467  467_unlink_stale_taco_loyverse_pointer  | 467_th_translations_labels.sql
468  468_count_class_clear_stubs_and_deleted | 468_th_descriptions_and_allergen_clauses.sql
469  469_allergen_tag_backfill | 469_cost_trust_views | 469_th_ingredients_part1.sql
```

Four more collisions, nine files, five of them unmerged — invisible to the cleanup
that had just finished.

### 1.2 The repair path has the same bug

While this spec was being written, another session applied
`479_renumber_th_migrations_log_sync.sql` at **15:39**, renumbering its five TH
migrations from 466-471 to 473-478. It assigned **473** to `dish_names` — but
`473_analytics_hourly_heat_weekly.sql` had been applied at **15:37**, two minutes
earlier.

**The cleanup resolved four collisions and created a fifth, by using the same
"max + 1 at a glance" rule it was cleaning up after.**

This is the central design input: the fix cannot be a better manual procedure.
Any path that picks a number by looking — including the repair path — is racy.

### 1.3 State as of 2026-10-16 15:40

Live duplicate prefixes in prod `migration_log`:

| Number | Files | Where |
|---|---|---|
| `469` | `469_allergen_tag_backfill.sql` | on `origin/main` |
| | `469_cost_trust_views.sql` | **unmerged** |
| `473` | `473_dish_names_stay_english_in_every_language.sql` | **unmerged** (created 15:39) |
| | `473_analytics_hourly_heat_weekly.sql` | **unmerged** |

Applied-but-unmerged, no collision (numbers legitimately burned): 474-478.
Next free number: **480**. `461` is a permanent gap — never applied.

---

## 2. Goal

**Two sessions can never be handed the same number.** Not "are told not to collide" —
cannot. Plus: the mechanism has to be where a session will actually trip over it,
or sessions keep guessing.

### Constraints (all carried from the task brief)

1. Must work for a session that has **not merged**. Numbers are consumed at apply
   time; `origin/main` is not the authority. `migration_log` is.
2. Letter suffixes (`469a`) stay exactly as they are — the mechanism for resolving
   an already-applied duplicate after the fact. The canary treats `469` and `469a`
   as distinct; so does this design.
3. **Never reuse a gap number.**
4. Discoverable, not a script nobody knows about.
5. **Making the canary more permissive is not the fix.** It is the thing that
   catches this. Its logic is unchanged here; only its error text gains a pointer.

---

## 3. Design

`migration_log` is already the only place that knows what has truly been applied,
including from unmerged branches. It is the natural allocator — but it only learns
a number *after* the migration runs, and the number is needed *before* the file is
named. So: a sibling registry that records the claim, and an allocator that takes
the max over both.

### 3.1 `public.migration_numbers` — the registry

```sql
CREATE TABLE IF NOT EXISTS public.migration_numbers (
  number      integer     NOT NULL CHECK (number > 0),
  letter      text        NOT NULL DEFAULT ''  CHECK (letter ~ '^[a-z]?$'),
  slug        text        NOT NULL,
  session_id  text        NOT NULL,
  git_branch  text,
  mc_task_id  text,
  state       text        NOT NULL DEFAULT 'reserved'
                          CHECK (state IN ('reserved','applied','abandoned')),
  claimed_at  timestamptz NOT NULL DEFAULT now(),
  applied_at  timestamptz,
  PRIMARY KEY (number, letter)
);
```

The primary key **is** the guarantee. Two sessions cannot both hold `(480, '')`;
the second INSERT fails. Everything else is bookkeeping.

`letter` in the key lets one allocator serve both cases: bare numbers for new work,
letter suffixes for retrospective repair (§3.4).

Rows are **never deleted**. An abandoned claim stays as a tombstone, so its number
is permanently burned — which is precisely the standing "never reuse a gap" rule,
enforced by construction rather than by remembering.

### 3.2 `fn_claim_migration_number` — the allocator

```sql
CREATE OR REPLACE FUNCTION public.fn_claim_migration_number(
  p_slug       text,
  p_session_id text,
  p_git_branch text DEFAULT NULL,
  p_mc_task_id text DEFAULT NULL
) RETURNS TABLE (number integer, filename text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_num integer;
BEGIN
  -- Serialize every allocator call against every other one. Held to COMMIT.
  PERFORM pg_advisory_xact_lock(hashtext('migration_number_allocator'));

  SELECT GREATEST(
    COALESCE((SELECT max((substring(filename FROM '^([0-9]+)'))::int)
                FROM migration_log WHERE filename ~ '^[0-9]+[a-z]?_'), 0),
    COALESCE((SELECT max(n.number) FROM migration_numbers n), 0)
  ) + 1 INTO v_num;

  INSERT INTO migration_numbers (number, letter, slug, session_id, git_branch, mc_task_id)
  VALUES (v_num, '', p_slug, p_session_id, p_git_branch, p_mc_task_id);

  RETURN QUERY SELECT v_num, lpad(v_num::text, 3, '0') || '_' || p_slug || '.sql';
END $$;
```

- **Atomic** — the advisory lock makes read-then-insert indivisible across sessions.
  The PK is the backstop if anything ever bypasses the lock.
- **Monotonic** — `max + 1` over the *union* of applied and reserved. A number burned
  by an unmerged branch is in `migration_log`; a number claimed but not yet applied
  is in `migration_numbers`. Neither is ever handed out twice.
- **Returns the filename**, so the session has nothing left to compute.

```
SELECT * FROM fn_claim_migration_number('allocator_registry', 'claude-opus-session-c7283135');
 number |                filename
--------+------------------------------------------
    480 | 480_allocator_registry.sql
```

### 3.3 Apply-time guard — the teeth

The allocator fixes the compliant path. A session that never calls it still collides.
So prod itself refuses the duplicate:

```sql
CREATE OR REPLACE FUNCTION public.fn_migration_log_guard_number() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE v_prefix text; v_existing text;
BEGIN
  v_prefix := substring(NEW.filename FROM '^([0-9]+[a-z]?)');
  IF v_prefix IS NULL THEN RETURN NEW; END IF;

  SELECT filename INTO v_existing FROM migration_log
  WHERE substring(filename FROM '^([0-9]+[a-z]?)') = v_prefix
    AND filename <> NEW.filename
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RAISE EXCEPTION
      'migration number % is already taken by %. Claim a free number: SELECT * FROM fn_claim_migration_number(''<slug>'', ''<session-id>''); then rename your file. See docs/constitution/technical-rules.md RULE-MIGRATION-NUMBERING.',
      v_prefix, v_existing;
  END IF;

  UPDATE migration_numbers SET state = 'applied', applied_at = now()
   WHERE number = (substring(v_prefix FROM '^([0-9]+)'))::int
     AND letter = COALESCE(substring(v_prefix FROM '([a-z])$'), '')
     AND state  = 'reserved';

  RETURN NEW;
END $$;

CREATE TRIGGER trg_migration_log_guard_number
  BEFORE INSERT OR UPDATE OF filename ON public.migration_log
  FOR EACH ROW EXECUTE FUNCTION public.fn_migration_log_guard_number();
```

Why this shape:

- **`BEFORE INSERT`** — catches the non-compliant session at the moment it applies,
  when the fix costs one rename. Today it is caught at merge, where it blocks everyone.
- **`OR UPDATE OF filename`** — renumber migrations rewrite `migration_log.filename`.
  That is exactly where the 15:39 mistake happened. This guard would have rejected it.
- **A trigger, not a CHECK/UNIQUE constraint.** The table already holds two duplicate
  pairs (§1.3) and a constraint — even `NOT VALID` — would block unrelated UPDATEs to
  those rows. A `BEFORE` trigger validates only the row in flight and leaves history alone.
- **Full prefix comparison** (`[0-9]+[a-z]?`), so `469a` is distinct from `469`.
  Constraint 2 holds.
- It also **closes the loop**: the matching reservation flips to `applied`. A row still
  `reserved` days later is a claim that never shipped; a `migration_log` row with no
  reservation is a session that skipped the allocator. Both are now queryable, which
  makes non-compliance visible instead of invisible.

### 3.4 Letter suffixes — the repair path, made atomic

Already-applied collisions are still resolved by letter suffix anchored to apply
order (the `RENUMBERING-2026-06-11.md` rule, unchanged). But §1.2 shows two sessions
can both pick `469a`. Same allocator, same lock:

```sql
fn_claim_migration_letter(p_anchor integer, p_slug text, p_session_id text, ...)
  -> (letter text, filename text)   -- next free letter at that anchor
```

New work gets a fresh high number. Already-applied work being repaired gets a letter
at its anchor. Both go through one lock and one PK.

### 3.5 Visibility — gaps and collisions, explicit

```sql
CREATE OR REPLACE VIEW public.v_migration_collisions AS   -- live duplicate prefixes
CREATE OR REPLACE VIEW public.v_migration_number_map  AS   -- number -> state, holder, filename(s)
```

`v_migration_collisions` is the query that had to be hand-written twice today, and
that the three previous cleanups each re-derived from scratch. `v_migration_number_map`
represents gaps explicitly: every number from 1 to max, labelled `applied`,
`reserved`, `burned` (claimed, abandoned, never reusable) or `free`.

---

## 4. Discoverability

The mechanism is worthless if sessions keep guessing. Five surfaces, cheapest first:

| # | Surface | Why |
|---|---|---|
| 1 | **MCP tool `claim_migration_number`** in `services/mcp-mission-control`, beside the existing `check_migrations` | Highest value by far: it appears in every session's tool list with **no doc to read first**. Sessions already call MC at session start. |
| 2 | `check_migrations` output gains `collisions[]` and `next_free_number` | The tool sessions already use for migration state starts reporting the thing it was blind to. |
| 3 | **Canary error text** — on duplicate and on not-above-max, print the claim call | The canary is where a colliding session actually lands today. Pointer only; **logic unchanged** (constraint 5). |
| 4 | `scripts/migration-number.sh claim <slug>` | Shell/CI path, and for sessions without the MC tool loaded. |
| 5 | `CLAUDE.md` one line + `technical-rules.md` **RULE-MIGRATION-NUMBERING** + addendum to `RENUMBERING-2026-06-11.md` | The written rule, for when someone goes looking. |

The canary stays **offline and strict**. It does no DB call: a pre-commit hook that
needs credentials and a network round-trip is a hook that gets bypassed. Online
allocation (MC tool / script / RPC) and offline enforcement (canary) stay separate.

---

## 5. Remediation of the live collisions

`469` and `473` (§1.3). Every colliding file is already applied to prod, so each is a
letter-suffix repair under the existing rule — and in both pairs at least one file sits
in another session's unmerged worktree, which this session must not rewrite.

**Rule, to be written into `RENUMBERING-2026-06-11.md` as a standing instruction:**

> The file whose number is already on `origin/main` keeps it. The unmerged file
> renames to `<anchor><letter>_`, where `anchor` and `letter` come from
> `fn_claim_migration_letter(anchor, ...)` — not from eyeballing. The renaming
> session ships the `migration_log.filename` UPDATE in the same branch as the rename.
> Whoever merges second does the rename; the guard in §3.3 will stop them if they skip it.

Concretely:

- **`469`** — `469_allergen_tag_backfill.sql` is on `main` and keeps `469`.
  `469_cost_trust_views.sql` (unmerged) renames, anchored per apply order.
- **`473`** — neither is on `main`. `473_analytics_hourly_heat_weekly.sql` applied at
  15:37, `473_dish_names_stay_english_in_every_language.sql` at 15:16 but was *renamed
  into* 473 at 15:39. Earliest-applied-keeps-the-name gives `473` to `dish_names`;
  `analytics_hourly_heat_weekly` renames. Owning session decides; the guard enforces
  that one of them must.

Once §3.3 is live, neither pair can recur: the second UPDATE/INSERT is rejected.

---

## 6. What this does not do

- Does not renumber files in other sessions' worktrees (not this session's to touch).
- Does not retro-validate the two existing duplicate pairs — a `BEFORE` trigger only
  sees rows in flight. §5 is the plan for those.
- Does not loosen the canary.
- Does not make the canary online.

## 7. Build order

1. Migration: table + both allocator functions + guard trigger + two views + grants.
2. Verify on a local PG fixture first (`RULE` precedent: PL/pgSQL A/B before prod),
   including the concurrency case: two sessions claiming at once get different numbers.
3. MC MCP tool `claim_migration_number` + `check_migrations` extension (+ tests).
4. `scripts/migration-number.sh`.
5. Canary error-text pointer.
6. Docs: `CLAUDE.md`, `technical-rules.md` RULE-MIGRATION-NUMBERING, RENUMBERING addendum.

## 8. Decision needed from the CEO

**§3.3, the apply-time guard.** It makes the guarantee physical rather than advisory,
and it is the piece that would have prevented today's 15:39 incident. It also means a
migration apply now **hard-fails** for a session that picked a colliding number — an
interruption at apply time, in exchange for never blocking the whole repo at merge time.

Recommended: ship it. The alternative is allocator-plus-docs only, which relies on
every session choosing to call the allocator — and §1.2 is what that reliance costs.
