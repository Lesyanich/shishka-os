# `http` extension — the ask for Supabase support

**MC** `16ad5772` (critical) · **Project** `qcqgtcsjoacuktcewpvo` · **Measured** 2026-10-17
· **Follow-up to** migration 490 / MC `f133850a` · **This migration** 501

---

## TL;DR

The `http` extension sits in `public`, PostgREST exposes `public`, and all 19 of its
functions carry `EXECUTE` for `anon`. The publishable key that ships in the live site's
JavaScript can therefore make our database issue arbitrary outbound HTTP requests and read
the full response — an SSRF primitive inside Supabase's network. **Confirmed live, not
theoretical** (see *Proof* below).

We cannot close it ourselves. Everything is owned by `supabase_admin`; `postgres` is not a
superuser, not a member, and holds no grant option. **Nothing in-house calls the extension
any more**, so the cleanest fix — dropping it outright — is now risk-free for us.

**The one-line ask: please `DROP EXTENSION http;` on this project.**

---

## Proof that it is reachable (run 2026-10-17, publishable key only)

```bash
curl -X POST 'https://qcqgtcsjoacuktcewpvo.supabase.co/rest/v1/rpc/http_get' \
  -H 'apikey: sb_publishable_…' -H 'Authorization: Bearer sb_publishable_…' \
  -H 'Content-Type: application/json' -d '{"uri":"https://example.com"}'
```

→ `HTTP 200`, with the response status, every response header and the body returned to the
caller. Target was `example.com` (IANA's reserved documentation domain) deliberately: the
point was to prove the primitive works, not to probe anything internal.

## Why we cannot fix it ourselves — measured, not assumed

```sql
select pg_has_role(current_user, e.extowner, 'USAGE')  -- false
  from pg_extension e where e.extname = 'http';
-- extension owner .......... supabase_admin
-- every grantor in proacl .. supabase_admin   (…=X/supabase_admin, for all 19)
-- postgres grant option .... none             (no `postgres=X*/` anywhere)
```

* `DROP EXTENSION` and `ALTER EXTENSION … SET SCHEMA` both require **extension ownership**.
* `REVOKE` may only be issued by the **grantor** (or a holder of `WITH GRANT OPTION`).

So all three routes need `supabase_admin`. Migration 490 attempts the revoke anyway and
raises a `WARNING`, so the apply log is honest that the hole stayed open. A transactional
dry run against production left `http_still_open_to_anon = 19`.

> Note: `REVOKE … FROM anon, authenticated` alone would be insufficient even with the
> privilege — these functions hold **both** a `PUBLIC` grant and explicit `anon` /
> `authenticated` grants. All of them have to go.

## Why dropping it is safe for us

The earlier audit recorded five in-house callers — `fn_staff_tasks_push` plus the Loyverse
cron jobs `loyverse-pull-receipts`, `loyverse-pull-shifts`, `loyverse-pull-dim` and
`loyverse-push-drain`. **That was a false positive.** The detector regex
`\mhttp_(get|post)\M` also matches the `http_post` inside `net.http_post`, because `.` is a
word boundary in POSIX regex. All five were already migrated to `pg_net`.

Re-measured with a guard that excludes the qualified form:

```sql
-- '(^|[^.[:alnum:]_])http_(get|post|put|delete|patch|head)[[:space:]]*\('
-- over pg_proc.prosrc (non-extension), cron.job.command and pg_views.definition
→ 0 rows
```

**Real callers of the `http` extension: zero.** Nothing to migrate; nothing breaks on drop.
`fn_staff_tasks_push` is on `net.http_post` and healthy — `staff-tasks-reminders` logged 37
successful runs in the 24 h before this was written.

Migration 501 installs `public.v_security_outbound_http_exposure`, which keeps that zero
measurable. If `in_house_callers` ever rises above 0, a plain drop is no longer safe and
this document is stale.

---

## What to ask, in order of preference

### 1. Drop it (preferred)

```sql
DROP EXTENSION http;
```

Zero in-house callers, verified above. Removes the primitive instead of hiding it, and
clears the advisor's `extension_in_public` finding for `http` at the same time.

### 2. Move it out of the exposed schema, and revoke

```sql
ALTER EXTENSION http SET SCHEMA extensions;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA extensions FROM PUBLIC, anon, authenticated;
```

`extensions` is not in PostgREST's `db-schemas`, so this takes it off the REST surface.
Keep in mind `anon` and `authenticated` both hold `USAGE` on `extensions`, so the revoke is
the load-bearing half, not the move. Choose this only if the extension must stay installed.

### 3. Revoke in place (smallest change)

```sql
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;
-- or, scoped to the extension's 19 functions only
```

Careful: issued as written against `public` this also strips our own function grants and
pgvector's / pg_trgm's support functions. If support takes this route, ask them to scope it
to the functions where `pg_depend.deptype = 'e'` and `refobjid` is the `http` extension.

---

## Before opening the ticket — one thing to try first (2 minutes)

**Supabase Dashboard → Database → Extensions → `http` → disable.**

If the dashboard's extension toggle runs with privileges above `postgres`, this closes the
whole thing without a ticket. **We have not verified that it does** — the dashboard SQL
editor connects as `postgres`, which would fail with `must be owner of extension http`. It
costs two minutes to find out, and the failure is harmless and read-only in effect.

* **It worked** → re-run the verification below; nothing else needed.
* **It errored** → open the ticket with the body above, asking for option 1.

## Verification after the fix

```sql
select * from public.v_security_outbound_http_exposure order by extension;
```

Expected for `http`: the row is **gone** (option 1), or `anon_executable = 0` and
`anon_ssrf_open = false` (options 2–3).

Then confirm from outside, which is the test that actually matters:

```bash
curl -X POST 'https://qcqgtcsjoacuktcewpvo.supabase.co/rest/v1/rpc/http_get' \
  -H 'apikey: sb_publishable_…' -H 'Authorization: Bearer sb_publishable_…' \
  -H 'Content-Type: application/json' -d '{"uri":"https://example.com"}'
```

Expected: `404 PGRST202` (dropped) or `401 / 42501 permission denied` (revoked) — **not**
`200`.

Finally, confirm nothing regressed:

```sql
select jobname, status, start_time from cron.job_run_details d
  join cron.job j using (jobid)
 where jobname like 'loyverse-%' or jobname like 'staff-tasks-%'
 order by start_time desc limit 20;
```

The Loyverse and staff-task jobs are all on `pg_net` and must keep succeeding. Ignore
`job startup timeout` rows — that is a pre-existing pg_cron worker-slot issue, unrelated to
this change and tracked separately.

---

## `pg_net` — checked, accepted, not a ticket

`net.*` (12 functions) is also `anon`-executable and also `supabase_admin`-owned, so we
cannot revoke it either. But the `net` **schema is not in PostgREST's exposed schemas**, so
it is not reachable over REST. Verified the same day:

```
POST /rest/v1/rpc/net.http_post  →  404 PGRST202
```

PostgREST reads the dotted name as a function literally called `net.http_post` in `public`
and finds nothing. pg_net is load-bearing for every cron job we have, so there is nothing to
ask for and nothing to change. Tracked by the same view (`rest_reachable = false`,
`anon_ssrf_open = false`) in case the exposed-schema config ever changes.

## Advisor finding

`extension_in_public` (WARN, 4 findings) stays open while the extension is installed in
`public`. Option 1 or 2 clears the `http` one. The remaining findings cover the other
extensions in `public` (`pg_net`, pgvector, pg_trgm) and are **accepted**: they are
Supabase-managed placements we cannot alter, and none of them is both REST-reachable and an
outbound-request primitive the way `http` is.
