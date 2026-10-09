# Spec — Staff access follows employment (offboarding, roles, PINs)

> MC Task: `8ee6783a-15c3-4a10-a2cf-44eeada457fe`
> Branch: `feature/admin/staff-access-offboarding`
> Status: **decisions closed 2026-10-09** (§ 7) — migration drafted (`454_staff_access_follows_employment.sql`), reviewed (`/code-review high`, 10 findings, all folded in), **not applied**; apply is CEO-gated
> Origin: CEO 2026-10-02: "есть ли у нас страница для управления ролями и доступами? У Минт был доступ как админа, она уволилась, теперь у нас есть Нук и Ни Ни, и они должны загружать и проверять чеки." Follow-up, same day: "Запись Минт не надо было переименовывать — просто оставить со статусом уволена, и при получении такого статуса лишать её всех доступов." Answers 2026-10-09: § 7.

---

## 1. What is wrong today

State verified on live prod, 2026-10-02 and again 2026-10-09 (unchanged).

| # | Problem | Evidence | Severity |
|---|---|---|---|
| 1 | **There is no access page.** The access tier (`staff.app_role`) cannot be changed in the UI, a PIN cannot be set, and a login cannot be revoked. `/hr/staff` edits only HR fields (salary, permit, tax). Firing someone is done by a SQL migration (Mint: mig 445). | `pages/hr/StaffPage.tsx`; PINs only via the owner-only RPC `fn_set_staff_pin` (mig 314), called from nowhere in the UI | High, blocks the CEO |
| 2 | **A fired employee's record was reused for a new employee.** Mint left 2026-09-04; mig 445 set `fire_date` and deactivated row `af85ba68`. On 2026-10-02 that row was renamed "Nook", reactivated, and pointed at a new login `nook@shishka.health`. | Row `af85ba68`: name Nook, `is_active=true`, `fire_date=2026-09-04`, hired 2026-06-01, ฿25,000, 51 shifts, 31 attendance rows (Jun–Jul), 3 payroll lines, 2 staff payments. All of them are Mint's. | **Critical, payroll integrity.** Mint's history reads as Nook's, and Mint's overdue final pay (MC `ad967e87`) now sits on a row labelled with someone else's name |
| 3 | **The real Nuk has no login.** | Row `b4d9512d` "Nuk": cook, hired 2026-09-03, ฿17,000, `auth_user_id NULL` | High: she cannot do receipts |
| 4 | **Mint can still log in.** Her own auth user `mint@staff.shishka.local` was orphaned (no staff row points at it) but is not banned. Last sign-in **2026-09-29**, 25 days after she left. | `auth.users`: not banned; 0 live sessions as of 2026-10-02 | **Critical, security.** With no staff row she gets the cook UI, and `receipt_inbox` + finance are role-gated at the DB, but **89 public tables still accept writes from any authenticated user**, so she has broad API write access |
| 5 | **Every former employee keeps a working login.** Deactivating a row changes nothing in Auth. | Alex (left 2026-07-07) and Hein (left 2026-07-31): inactive, logins live, not banned. **Noe Noe left 2026-09-08 (CEO, 2026-10-09) but her row is still active, her login is live, and her schedule template is still on.** | High, same exposure as #4 |
| 5b | **A fired person's schedule template keeps generating shifts.** `useScheduleTemplates.generateMonth` reads every active template and never checks `staff.is_active`. | Noe Noe's template `is_active = true` | Medium: a departed cook reappears on the roster |
| 6 | **A plaintext PIN is readable by every logged-in user.** `staff.pin_code` was filled on row `af85ba68` on 2026-10-02, and `staff` is SELECT-able by any authenticated user (`staff_read_auth`). | `pin_code IS NOT NULL` on `af85ba68` | High: anyone logged in can read it and sign in as a manager |
| 7 | **Name + PIN login cannot work for `nook@shishka.health`.** The staff login screen derives the address from the typed name (`"Nuk"` becomes `nuk@staff.shishka.local`, `lib/staffAuth.ts`). A login under any other address only works through the owner email form. | `LoginPage.tsx`, `staffNameToEmail()` | Medium |

### Root cause

One gap behind #2, #4, #5. **Employment status and login access are not connected.** `is_active` / `fire_date` live in `public.staff`; the ability to sign in lives in `auth.users`. Nothing links the two, so "fire" means "hide from pickers", and "hire" was done by recycling a row that already had a login.

---

## 2. Principles (CEO decisions, 2026-10-02)

- **P1. One row = one person, forever.** A staff row is never renamed, recycled or handed to another person. A new hire gets a new row. Payroll, attendance and shifts hang off `staff.id`, so reuse rewrites history.
- **P2. Fired = keep the row, mark it, strip access.** Firing sets `fire_date` (last working day) and `is_active = false`. The row stays for payroll and legal history.
- **P3. Access follows employment, enforced in the database.** Hiding a nav item is not access control (see memory `gotcha_rls_authenticated_not_role_gated`). The rule lives in a DB trigger, so it holds no matter who edits the row: the UI, an agent, SQL, or a cron.
- **P4. Nuk and NeNe become `task_manager`.** This is the tier `/receipts` requires (CEO confirmed the wider scope in § 3.2, 2026-10-09).
- **P5. A rehire is a new row** (CEO, 2026-10-09). A row whose last working day has passed never becomes active again.
- **P6. The owner invents the login and the PIN** and hands both to the employee (CEO, 2026-10-09). No login is created by anyone else.

---

## 3. Target behaviour

### 3.1 The access rule

| Event on a `staff` row | Effect on its login |
|---|---|
| `is_active` → false | **Immediately:** auth user banned (`banned_until = now() + 100 years`), all sessions and refresh tokens deleted, schedule template turned off, planned shifts after the last working day removed |
| `fire_date` passes (it is the *last working day*) | Daily job at **00:05 Bangkok** (`fn_staff_retire_expired()`, one row per exception block so one refused row never blocks the rest) sets `is_active = false`, which bans as above. Any other write to such a row also flips it inactive. |
| `fire_date` is in the past and someone clears it or moves it to today/future | **Refused:** "X left on DATE — that date cannot be cleared; a rehire gets a new staff record". Correcting it to another past date is allowed. This closes the two-step bypass (clear the date, then reactivate). |
| `is_active` → true on a row whose `fire_date` is in the past | **Refused:** "X left on DATE — a rehire gets a new staff record" (P5). This exact edit resurrected Mint's row. |
| `is_active` → true with no past `fire_date` (e.g. undoing a same-day mistake) | Ban lifted |
| `fire_date` set or moved on a row that is already inactive | Shift cleanup re-runs against the new date, so a date recorded after the fact still clears the right shifts |
| Owner changes a PIN or login | Sessions already open on that login are revoked; the person signs in again with the new PIN |
| A login is detached from its row (re-pointed or row deleted) and no other row claims it | That login is banned. No orphan logins. |
| Deactivating, demoting or **deleting** the **last active owner** | Refused, so nobody locks the company out. The guard is SECURITY DEFINER, so its "another active owner?" lookup does not depend on what RLS lets the caller read |

**Residual window:** an access token already issued stays valid until it expires (1 h JWT lifetime). Deleting the sessions stops it from being refreshed. Acceptable.

### 3.2 What `task_manager` unlocks (for § 7 Q3)

Pages: Receipt Inbox, Procurement, Shopping List, Schedule, Staff Tasks, Kitchen KDS, Salad Bar, Cashier, plus everything a cook sees. DB: `receipt_inbox` read/write (mig 390). **Not:** finance ledger and dashboards, HR, payroll, menu/BOM, Mission Control, settings.

### 3.3 `/hr/staff`: new "Access" block on each card (owner-only page)

```
┌ Nuk ─────────────────────────────── cook · Active ┐
│ … existing HR fields, Payment QR, leave …         │
│ ── ACCESS ─────────────────────────────────────── │
│ Level   [ Manager — receipts, procurement… ▾ ]    │
│ Login   no login yet                              │
│         [ Create login ] → login [nuk____]        │
│                            PIN   [_ _ _ _] [Save] │
│         Give her: login "nuk" + the PIN you chose │
│ [ Fire… ]  → last working day [2026-10-09] [Confirm]│
│            past/today: "Login is blocked now."    │
│            future: "Access ends the day after."   │
└───────────────────────────────────────────────────┘
Inactive card: "Fired 2026-09-04 · login blocked" (red), no controls.
```

- **Level:** `Manager` (task_manager) or `Kitchen` (cook). Owner rows show a static "Owner". Promotion to owner stays SQL-only, deliberately.
- **Login status:** comes from a new owner-only RPC, because `auth.users` is not readable from the client. Four states: *no login yet* · *never used* · *last sign-in DATE* · *blocked*.
- **Create login / Change PIN:** the owner types the login (3–20 Latin letters or digits, prefilled from the name) and a 4-digit PIN, then hands both over (P6). Calls `fn_set_staff_pin(staff, pin, login)`. Hidden for owners and inactive rows.
- **Login screen:** the staff field label changes from "Имя" to "Логин", since the login no longer has to equal the name.
- **Fire:** always writes `fire_date` (the last working day). If that day is **before today**, the same update also sets `is_active = false`, so access ends now. If it is **today or later** (notice period), `is_active` stays true and the daily job retires the row the morning after the last day: the person keeps the KDS, tasks and schedule until then. There is no "reactivate" control for a fired row (P5).
- Copy is English, matching the rest of the admin. Styling follows the existing slate card (`PaymentQrCard` pattern) until the brand re-skin (RULE-DESIGN-SYSTEM).

---

## 4. Database changes (one migration)

**File:** `services/supabase/migrations/454_staff_access_follows_employment.sql` (drafted, not applied). Re-check the number against prod `migration_log` **right before applying**: the first draft's 453 was taken by another branch on 2026-10-04.

| Object | Kind | Purpose |
|---|---|---|
| `fn_bkk_today()` | STABLE util, `GRANT authenticated` | `(now() AT TIME ZONE 'Asia/Bangkok')::date` — the single definition of "today" used by the guard, the sync trigger and the daily job (UTC midnight is 07:00 here) |
| `fn_staff_login_revoke_sessions(uuid)` | function, SECURITY DEFINER, no client grant | Delete every `auth.sessions` + `auth.refresh_tokens` row of one auth user. Used by the ban path and by a PIN change |
| `fn_staff_login_set_allowed(uuid, boolean)` | function, SECURITY DEFINER, no client grant | Ban (`banned_until`, then revoke sessions) or unban one auth user |
| `fn_staff_employment_guard()` + `trg_staff_employment_guard` | BEFORE INSERT/UPDATE/DELETE, SECURITY DEFINER | A past `fire_date` is immutable except towards another past date; an active row with a past `fire_date` is forced inactive; reactivation refused; the last active owner cannot be deactivated, demoted or deleted |
| `fn_staff_sync_login_access()` + 3 triggers `trg_staff_sync_login_access_{ins,upd,del}` | AFTER, SECURITY DEFINER | The login follows `is_active`; detached logins are banned; on deactivation the schedule template is turned off and `scheduled` shifts after `fire_date` are deleted (all 206 shifts in the table are `scheduled`; payroll reads `staff_attendance`, not `shifts`). The UPDATE trigger fires `WHEN` `is_active`, `auth_user_id` **or `fire_date`** changes (so a date recorded later re-runs the shift cleanup), **not** `UPDATE OF is_active`: a column list ignores changes made by BEFORE triggers, and the guard flips `is_active` on its own. |
| `fn_set_staff_pin(uuid, text)` → `fn_set_staff_pin(p_staff_id, p_pin, p_login DEFAULT NULL)` returns the login | replace (mig 314; no caller in code or in other DB functions — verified in `pg_proc`) | The owner chooses the login (P6): `^[a-z0-9]{3,20}$`, unique across `auth.users` **and `staff.email`** (the `staff_email_unique` index would otherwise surface as a raw 23505); omitted = keep the current staff login, else derive from the name. Refuses inactive rows and owners. Creates the auth user + identity if missing, otherwise rewrites email + password **and revokes the open sessions** (fixes #7) |
| `fn_staff_login_status()` | new RPC, SECURITY DEFINER, `GRANT authenticated` | Returns `(staff_id, login_email, last_sign_in_at, is_blocked)`; zero rows unless `fn_is_owner()` |
| `fn_staff_retire_expired()` | function, SECURITY DEFINER, no client grant | Loops over active rows with `fire_date < fn_bkk_today()` and deactivates each in its own exception block (`RAISE WARNING` on refusal), returns the count. A single refused row (an owner with a date and no second owner) must not stop everyone else |
| cron `staff-fire-date-expiry` | `5 17 * * *` (UTC) = 00:05 Bangkok | `SELECT fn_staff_retire_expired()` |

Constraints this must respect, verified live: `staff_role_credential_check` (a task_manager with a login needs `email`; a cook with a login needs `pin_hash`); unique `auth_user_id`; unique `lower(email)`.

### 4.1 Data repair (same migration; a replay is a no-op, a drifted row is an error)

| Row | Before | After |
|---|---|---|
| `af85ba68` | "Nook", active, login `nook@shishka.health`, plaintext PIN | **"Mint"**, inactive, `fire_date` 2026-09-04 kept, her own login `mint@staff.shishka.local` re-linked **and banned**, `pin_code`/`pin_hash`/`pin_set_at` cleared. Runs in a `DO` block that **raises unless exactly one row changed** (already repaired = skip), so the migration cannot log success while her login is still live |
| `nook@shishka.health` | made by hand 2026-10-02, never used, given to no one (CEO) | detached from Mint's row, so the trigger **bans** it |
| `b4d9512d` Nuk | cook, no login | **task_manager**. No login: the CEO creates it in the UI (P6) |
| `15f13b0b` NeNe | cook, no login | **task_manager**. No login: the CEO creates it in the UI (P6) |
| `b1fb72db` Noe Noe | active, login live (never used), template on | **fire_date 2026-09-08, inactive**, login banned, template off. No shifts or attendance after 2026-09-08 to clean up |
| Alex, Hein | inactive, logins live | logins **banned**, templates off |
| **Every `auth.users` row without an active staff row** | — | **banned** (one-time backfill = the rule itself; today every auth user is a staff login, so a future non-staff account must be created after this pass) |

---

## 5. Frontend changes

| File | Change |
|---|---|
| `hooks/use-staff-access.ts` (new) | `loginStatus` (rpc `fn_staff_login_status`), `setAppRole`, `setPin` (rpc `fn_set_staff_pin`), `fire(staffId, lastDay)` → `{ fire_date: lastDay, ...(lastDay < todayBkk ? { is_active: false } : {}) }`. All Supabase calls live here, per admin-panel convention. Surface DB errors verbatim: the trigger messages are written for humans. |
| `components/hr/StaffAccessPanel.tsx` (new) | The § 3.3 block |
| `pages/hr/StaffPage.tsx` | Render the panel in `StaffCardView`; refetch after writes |
| tests | `use-staff-access` unit tests (error surfacing, `fire` payload); panel render states (owner row, inactive row, no-login row) |

Out of this PR: deleting the dead `components/schedule/StaffForm.tsx` (it writes `pin_code`, nothing renders it). Log it to MC.

---

## 6. Verification (VERIFY-BEFORE-DONE)

1. **Dry run, CEO-gated.** Run the full migration inside `BEGIN … ROLLBACK` with probes, and show the CEO the resulting `staff` + login table before any real apply. (The 2026-10-02 dry run was declined at the permission prompt; it contains `DELETE FROM auth.sessions`.)
2. **Apply**, then check against live tables, not the ledger:
   - `staff`: Mint inactive + banned; Noe Noe inactive (fire 2026-09-08) + banned; Nuk and NeNe task_manager with no login; Alex + Hein banned; the only orphan login is `nook@shishka.health`, banned; zero active rows with a past `fire_date`; zero active templates on inactive rows.
   - Guards, inside a rolled-back txn: reactivating Mint raises; clearing Mint's `fire_date` raises (two-step bypass closed); correcting it to another past date is allowed; deactivating both owners raises on the second; deleting the last owner raises; `fn_set_staff_pin` refuses a fired row, a taken login (via `auth.users` and via `staff.email`), and a PIN change leaves zero sessions for that uid; `fn_staff_retire_expired()` retires an expired cook even when an expired last-owner row is refused in the same run.
   - Per-tier, as mig 390 did (inside a rolled-back txn with `set_config('request.jwt.claims', …)`): as owner, create Nuk's login; as that new uid, `fn_get_my_role()` = task_manager, `fn_has_app_role(owner, task_manager)` = true (the `receipt_inbox` gate), `fn_staff_login_status()` = 0 rows.
   - The 2026-10-02 and 2026-10-09 dry runs were both declined at the permission prompt (they contain `DELETE FROM auth.sessions` and `INSERT INTO auth.users`, rolled back). Alternative: the CEO runs the dry-run file in the Supabase SQL editor.
   - `cron.job` contains `staff-fire-date-expiry` with command `SELECT public.fn_staff_retire_expired()`.
3. **UI:** build + lint + tests green; preview link for the CEO with what to click (memory `feedback_preview_before_pr`). An agent cannot log in (the PIN is the Auth password), so the CEO checks: create NeNe's login, sign in with it, reach `/receipts`.
4. **Docs:** `vault/Database/Schema.md` RPCs & Triggers table — **done in the migration commit** (RULE-DB-SCHEMA-DOCS); memory `project_admin_auth_model` (firing now revokes the login; PIN setting is in the UI) — at close.

---

## 7. CEO decisions (2026-10-09)

| # | Question | Answer |
|---|---|---|
| Q1 | Was `nook@shishka.health` (made 2026-10-02) given to Nuk? | **No.** Nuk has no login; the owner invents a login + password and hands them over → P6. The stray login is banned. |
| Q2 | Rehire: reactivate the old row or create a new one? | **New row** → P5, enforced by the guard. |
| Q3 | Is the full `task_manager` scope (§ 3.2) fine for Nuk and NeNe? | **Yes.** No 4th tier. |
| Q4 | Ni Ni = `NeNe` (cook, hired 2026-08-07)? | **Yes.** And **Noe Noe left on 2026-09-08** → fired in § 4.1. |

---|---|---|
| Q1 | `nook@shishka.health` was created on 2026-10-02 by hand. Was it already given to Nuk? | Move it to Nuk now (no break for whoever has it). Then set her PIN in the UI, which converts the login to "Nuk + PIN". |
| Q2 | Rehiring a former employee: reactivate the old row (after clearing `fire_date`), or create a new row? | **New row.** Under P1 it keeps the two employment periods and their payroll separate. The guard already stops silent reactivation. |
| Q3 | `task_manager` opens procurement, schedule, cashier, KDS and staff tasks too (§ 3.2). Is that fine for Nuk and NeNe, or do they need a narrower "receipts only" tier? | Accept now (CEO said yes on 2026-10-02). A 4th tier means touching the role CHECK, `ROLE_RANK`, RoleGuard and RLS, so it gets its own task if wanted. |
| Q4 | Ni Ni = `NeNe` (cook, hired 2026-08-07), **not** `Noe Noe` (helper, since May)? | Assumed NeNe; please confirm. |

---

## 8. Out of scope (logged or to log in MC)

- **89 tables writable by any authenticated user.** That is Phase 4.2 of Code Cleanup & Security (MC `773face7`). This spec closes the "former employee" path into them, not the tables themselves.
- **`staff.pin_code` plaintext column.** Readable by all staff; nothing reads it for login. Drop it (pending Phase-3 drop, memory `project_admin_auth_model`).
- **Mint's final pay** (MC `ad967e87`). Restoring the row's name fixes how her payroll lines display; the payment decision stays with that task.
- **Noe Noe's final pay.** She left 2026-09-08, so under LPA §70 her wages were due by 2026-09-11; no September line exists. Logged to MC separately. (Her August line shows `days_worked = 0` but net ฿11,400 — attendance was not recorded, not a payroll error.)
- **Shift generation ignores `staff.is_active`.** The trigger turns templates off, which closes the hole; a guard in `generateMonth` itself would be belt-and-braces.
- **Two password paths.** `fn_set_staff_pin_hash` (≥6 chars, cook-only, writes only `pin_hash`) coexists with `fn_set_staff_pin` (4 digits, sets the real Auth password). Only the latter lets anyone sign in. Consolidate later.

---

## 9. PIN storage: owners only (CEO, 2026-10-09)

> "PIN в открытом виде быть не должен — он должен быть виден только мне и Басу, никому другому."

**What leaked.** `public.staff` is SELECT-able by every logged-in user. Two of its columns carried the PIN: `pin_code` (plain text — Bas, Alex, Hein, Noe Noe) and `pin_hash` (bcrypt of a 4-digit PIN: 10 000 candidates, brute-forced in seconds, so the PIN in all but name — Alex, Hein, Noe Noe). Migration 454's `fn_set_staff_pin` still wrote `pin_hash` for every new login. Bas's `pin_code` was checked and is **not** his sign-in password.

**Migration 455 (applied 2026-10-09):**
- `pin_code` / `pin_hash` emptied on every row; CHECK `staff_no_readable_pin` keeps them empty. `staff_role_credential_check` (which demanded `pin_hash` on cook logins) becomes `staff_login_has_email`.
- The PIN lives only in **Supabase Vault**, encrypted, as `staff_pin:<staff_id>`, written by `fn_set_staff_pin`.
- **`fn_staff_pin_reveal(staff_id)`** returns it to an owner and raises `42501` for anyone else; `authenticated` has no access to the `vault` schema at all.
- A deactivated or deleted row's PIN secret is deleted together with its login.
- `fn_staff_login_status` gains `has_pin`; the dead `fn_set_staff_pin_hash` is dropped.
- Verified in a rolled-back probe: owner creates a login → reveals it → changes it → reveals the new one (one secret); Nuk's own reveal is refused; direct Vault read as `authenticated` is refused; firing deletes the secret.

**Trade-off, accepted by the CEO's requirement:** an owner must be able to read the PIN again, so it is stored reversibly (encrypted). Service-role access (agents, cron) can still decrypt Vault — the floor for any secret an owner can see.

**UI:** "Show PIN / Hide PIN" in the Access block, owners only, for active non-owner rows that have a stored PIN; fetched on demand, held only in component state. `pin_code` removed from `useStaff`; the dead `StaffForm` (which wrote `pin_code`) deleted.

**Follow-up:** drop the `pin_code` / `pin_hash` columns once the admin build that no longer selects `pin_code` is live on main. The standalone `apps/kds` app (not deployed) still compares `pin_code` client-side — logged to MC.

