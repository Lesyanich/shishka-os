# Spec — Staff access follows employment (offboarding, roles, PINs)

> MC Task: `8ee6783a-15c3-4a10-a2cf-44eeada457fe`
> Branch: `feature/admin/staff-access-offboarding`
> Status: **draft, awaiting CEO sign-off** (§ 7 open questions)
> Origin: CEO 2026-10-02: "есть ли у нас страница для управления ролями и доступами? У Минт был доступ как админа, она уволилась, теперь у нас есть Нук и Ни Ни, и они должны загружать и проверять чеки." Follow-up, same day: "Запись Минт не надо было переименовывать — просто оставить со статусом уволена, и при получении такого статуса лишать её всех доступов."

---

## 1. What is wrong today

State verified on live prod, 2026-10-02 and again 2026-10-09 (unchanged).

| # | Problem | Evidence | Severity |
|---|---|---|---|
| 1 | **There is no access page.** The access tier (`staff.app_role`) cannot be changed in the UI, a PIN cannot be set, and a login cannot be revoked. `/hr/staff` edits only HR fields (salary, permit, tax). Firing someone is done by a SQL migration (Mint: mig 445). | `pages/hr/StaffPage.tsx`; PINs only via the owner-only RPC `fn_set_staff_pin` (mig 314), called from nowhere in the UI | High, blocks the CEO |
| 2 | **A fired employee's record was reused for a new employee.** Mint left 2026-09-04; mig 445 set `fire_date` and deactivated row `af85ba68`. On 2026-10-02 that row was renamed "Nook", reactivated, and pointed at a new login `nook@shishka.health`. | Row `af85ba68`: name Nook, `is_active=true`, `fire_date=2026-09-04`, hired 2026-06-01, ฿25,000, 51 shifts, 31 attendance rows (Jun–Jul), 3 payroll lines, 2 staff payments. All of them are Mint's. | **Critical, payroll integrity.** Mint's history reads as Nook's, and Mint's overdue final pay (MC `ad967e87`) now sits on a row labelled with someone else's name |
| 3 | **The real Nuk has no login.** | Row `b4d9512d` "Nuk": cook, hired 2026-09-03, ฿17,000, `auth_user_id NULL` | High: she cannot do receipts |
| 4 | **Mint can still log in.** Her own auth user `mint@staff.shishka.local` was orphaned (no staff row points at it) but is not banned. Last sign-in **2026-09-29**, 25 days after she left. | `auth.users`: not banned; 0 live sessions as of 2026-10-02 | **Critical, security.** With no staff row she gets the cook UI, and `receipt_inbox` + finance are role-gated at the DB, but **89 public tables still accept writes from any authenticated user**, so she has broad API write access |
| 5 | **Every former employee keeps a working login.** Deactivating a row changes nothing in Auth. | Alex (left 2026-07-07) and Hein (left 2026-07-31): inactive, logins live, not banned | High, same exposure as #4 |
| 6 | **A plaintext PIN is readable by every logged-in user.** `staff.pin_code` was filled on row `af85ba68` on 2026-10-02, and `staff` is SELECT-able by any authenticated user (`staff_read_auth`). | `pin_code IS NOT NULL` on `af85ba68` | High: anyone logged in can read it and sign in as a manager |
| 7 | **Name + PIN login cannot work for `nook@shishka.health`.** The staff login screen derives the address from the typed name (`"Nuk"` becomes `nuk@staff.shishka.local`, `lib/staffAuth.ts`). A login under any other address only works through the owner email form. | `LoginPage.tsx`, `staffNameToEmail()` | Medium |

### Root cause

One gap behind #2, #4, #5. **Employment status and login access are not connected.** `is_active` / `fire_date` live in `public.staff`; the ability to sign in lives in `auth.users`. Nothing links the two, so "fire" means "hide from pickers", and "hire" was done by recycling a row that already had a login.

---

## 2. Principles (CEO decisions, 2026-10-02)

- **P1. One row = one person, forever.** A staff row is never renamed, recycled or handed to another person. A new hire gets a new row. Payroll, attendance and shifts hang off `staff.id`, so reuse rewrites history.
- **P2. Fired = keep the row, mark it, strip access.** Firing sets `fire_date` (last working day) and `is_active = false`. The row stays for payroll and legal history.
- **P3. Access follows employment, enforced in the database.** Hiding a nav item is not access control (see memory `gotcha_rls_authenticated_not_role_gated`). The rule lives in a DB trigger, so it holds no matter who edits the row: the UI, an agent, SQL, or a cron.
- **P4. Nuk and NeNe become `task_manager`.** This is the tier `/receipts` requires.

---

## 3. Target behaviour

### 3.1 The access rule

| Event on a `staff` row | Effect on its login |
|---|---|
| `is_active` → false (owner fires someone in the UI) | **Immediately:** auth user banned (`banned_until = now() + 100 years`), all sessions and refresh tokens deleted |
| `fire_date` passes (it is the *last working day*) | Daily cron at **00:05 Bangkok** sets `is_active = false`, which bans as above. Any other write to such a row also flips it inactive. |
| `is_active` → true on a row whose `fire_date` is in the past | **Refused:** "X left on DATE — clear the fire date before reactivating". This exact edit resurrected Mint's row. |
| `is_active` → true (legitimate reactivation) | Ban lifted |
| A login is detached from its row (re-pointed or row deleted) and no other row claims it | That login is banned. No orphan logins. |
| Deactivating or demoting the **last active owner** | Refused, so nobody locks the company out |

**Residual window:** an access token already issued stays valid until it expires (1 h JWT lifetime). Deleting the sessions stops it from being refreshed. Acceptable.

### 3.2 What `task_manager` unlocks (for § 7 Q3)

Pages: Receipt Inbox, Procurement, Shopping List, Schedule, Staff Tasks, Kitchen KDS, Salad Bar, Cashier, plus everything a cook sees. DB: `receipt_inbox` read/write (mig 390). **Not:** finance ledger and dashboards, HR, payroll, menu/BOM, Mission Control, settings.

### 3.3 `/hr/staff`: new "Access" block on each card (owner-only page)

```
┌ Nuk ─────────────────────────────── cook · Active ┐
│ … existing HR fields, Payment QR, leave …         │
│ ── ACCESS ─────────────────────────────────────── │
│ Level   [ Manager — receipts, procurement… ▾ ]    │
│ Login   nuk@staff.shishka.local · never used      │
│         [ Set PIN ]   → [ _ _ _ _ ] [Save]        │
│         Sign-in: name "Nuk" + this PIN            │
│ [ Fire… ]  → last working day [2026-10-09] [Confirm]│
│            "Every login is blocked immediately."  │
└───────────────────────────────────────────────────┘
Inactive card: "Fired 2026-09-04 · login blocked" (red), no controls.
```

- **Level:** `Manager` (task_manager) or `Kitchen` (cook). Owner rows show a static "Owner". Promotion to owner stays SQL-only, deliberately.
- **Login status:** comes from a new owner-only RPC, because `auth.users` is not readable from the client. Four states: *no login yet* · *never used* · *last sign-in DATE* · *blocked*.
- **Set PIN:** 4 digits, calls `fn_set_staff_pin`. Hidden for owners and inactive rows.
- **Fire:** sets `fire_date` + `is_active = false` in one update. The trigger does the rest.
- Copy is English, matching the rest of the admin. Styling follows the existing slate card (`PaymentQrCard` pattern) until the brand re-skin (RULE-DESIGN-SYSTEM).

---

## 4. Database changes (one migration)

**Number:** pick it from prod `migration_log` **at apply time**. The draft used 453, which another branch took on 2026-10-04 (`453_hide_fresh_spring_roll_from_web.sql`).

| Object | Kind | Purpose |
|---|---|---|
| `fn_staff_login_set_allowed(uuid, boolean)` | function, SECURITY DEFINER, no client grant | Ban or unban one auth user; on ban, delete its `auth.sessions` and `auth.refresh_tokens` |
| `fn_staff_employment_guard()` + `trg_staff_employment_guard` | BEFORE INSERT/UPDATE | Past `fire_date` forces the row inactive; refuses reactivation; protects the last owner |
| `fn_staff_sync_login_access()` + 3 triggers `trg_staff_sync_login_access_{ins,upd,del}` | AFTER, SECURITY DEFINER | The login follows `is_active`; detached logins are banned. The UPDATE trigger uses `WHEN (OLD.is_active IS DISTINCT FROM NEW.is_active OR OLD.auth_user_id IS DISTINCT FROM NEW.auth_user_id)`, **not** `UPDATE OF is_active`: a column list ignores changes made by BEFORE triggers, and the guard flips `is_active` on its own. |
| `fn_set_staff_pin(uuid, text)` | replace (mig 314) | Also refuses inactive rows and owners, rejects names with no Latin letters, and **normalises the login email** to the name-derived one, so "name + PIN" always works after a PIN is set (fixes #7) |
| `fn_staff_login_status()` | new RPC, SECURITY DEFINER, `GRANT authenticated` | Returns `(staff_id, login_email, last_sign_in_at, is_blocked)`; zero rows unless `fn_is_owner()` |
| cron `staff-fire-date-expiry` | `5 17 * * *` (UTC) = 00:05 Bangkok | `UPDATE staff SET is_active=false WHERE is_active AND fire_date < today_bkk` |

Constraints this must respect, verified live: `staff_role_credential_check` (a task_manager with a login needs `email`; a cook with a login needs `pin_hash`); unique `auth_user_id`; unique `lower(email)`.

### 4.1 Data repair (same migration, each statement guarded so a replay is a no-op)

| Row | Before | After |
|---|---|---|
| `af85ba68` | "Nook", active, login `nook@shishka.health`, plaintext PIN | **"Mint"**, inactive, `fire_date` 2026-09-04 kept, her own login `mint@staff.shishka.local` re-linked **and banned**, `pin_code`/`pin_hash`/`pin_set_at` cleared |
| `b4d9512d` Nuk | cook, no login | **task_manager**, login `nook@shishka.health` moved here (whoever was handed those credentials on 2026-10-02 can still sign in, through the owner email form) |
| `15f13b0b` NeNe | cook, no login | **task_manager**. No login yet; the CEO sets her PIN in the UI |
| Alex, Hein | inactive, logins live | logins **banned** (backfill: every login of an inactive row) |

Order matters because of the unique `auth_user_id`: first re-point Mint's row (this detaches `nook@shishka.health` and bans it briefly), then attach that login to Nuk (which unbans it).

---

## 5. Frontend changes

| File | Change |
|---|---|
| `hooks/use-staff-access.ts` (new) | `loginStatus` (rpc `fn_staff_login_status`), `setAppRole`, `setPin` (rpc `fn_set_staff_pin`), `fire(staffId, lastDay)`. All Supabase calls live here, per admin-panel convention. Surface DB errors verbatim: the trigger messages are written for humans. |
| `components/hr/StaffAccessPanel.tsx` (new) | The § 3.3 block |
| `pages/hr/StaffPage.tsx` | Render the panel in `StaffCardView`; refetch after writes |
| tests | `use-staff-access` unit tests (error surfacing, `fire` payload); panel render states (owner row, inactive row, no-login row) |

Out of this PR: deleting the dead `components/schedule/StaffForm.tsx` (it writes `pin_code`, nothing renders it). Log it to MC.

---

## 6. Verification (VERIFY-BEFORE-DONE)

1. **Dry run, CEO-gated.** Run the full migration inside `BEGIN … ROLLBACK` with probes, and show the CEO the resulting `staff` + login table before any real apply. (The 2026-10-02 dry run was declined at the permission prompt; it contains `DELETE FROM auth.sessions`.)
2. **Apply**, then check against live tables, not the ledger:
   - `staff`: Mint inactive + banned; Nuk task_manager + `nook@shishka.health` unbanned; NeNe task_manager; Alex + Hein banned; zero orphan auth users; zero active rows with a past `fire_date`.
   - Guards, inside a rolled-back txn: reactivating Mint raises; deactivating both owners raises on the second.
   - Per-tier, as mig 390 did (inside a rolled-back txn with `set_config('request.jwt.claims', …)`): Nuk's uid resolves `task_manager` via `fn_get_my_role()` and sees `receipt_inbox`.
   - `cron.job` contains `staff-fire-date-expiry`.
3. **UI:** build + lint + tests green; preview link for the CEO with what to click (memory `feedback_preview_before_pr`). An agent cannot log in (the PIN is the Auth password), so the CEO checks: set NeNe's PIN, sign in as "NeNe", reach `/receipts`.
4. **Docs:** `vault/Database/Schema.md` (RPCs & triggers table, RULE-DB-SCHEMA-DOCS); memory `project_admin_auth_model` (firing now revokes the login; PIN setting is in the UI).

---

## 7. Open questions for the CEO

| # | Question | Recommendation |
|---|---|---|
| Q1 | `nook@shishka.health` was created on 2026-10-02 by hand. Was it already given to Nuk? | Move it to Nuk now (no break for whoever has it). Then set her PIN in the UI, which converts the login to "Nuk + PIN". |
| Q2 | Rehiring a former employee: reactivate the old row (after clearing `fire_date`), or create a new row? | **New row.** Under P1 it keeps the two employment periods and their payroll separate. The guard already stops silent reactivation. |
| Q3 | `task_manager` opens procurement, schedule, cashier, KDS and staff tasks too (§ 3.2). Is that fine for Nuk and NeNe, or do they need a narrower "receipts only" tier? | Accept now (CEO said yes on 2026-10-02). A 4th tier means touching the role CHECK, `ROLE_RANK`, RoleGuard and RLS, so it gets its own task if wanted. |
| Q4 | Ni Ni = `NeNe` (cook, hired 2026-08-07), **not** `Noe Noe` (helper, since May)? | Assumed NeNe; please confirm. |

---

## 8. Out of scope (logged or to log in MC)

- **89 tables writable by any authenticated user.** That is Phase 4.2 of Code Cleanup & Security (MC `773face7`). This spec closes the "former employee" path into them, not the tables themselves.
- **`staff.pin_code` plaintext column.** Readable by all staff; nothing reads it for login. Drop it (pending Phase-3 drop, memory `project_admin_auth_model`).
- **Mint's final pay** (MC `ad967e87`). Restoring the row's name fixes how her payroll lines display; the payment decision stays with that task.
- **Two password paths.** `fn_set_staff_pin_hash` (≥6 chars, cook-only, writes only `pin_hash`) coexists with `fn_set_staff_pin` (4 digits, sets the real Auth password). Only the latter lets anyone sign in. Consolidate later.
