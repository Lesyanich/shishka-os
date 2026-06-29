# Column-Level RLS → Owner-Gated RPC Design (Phase 3.4)

> Epic: Code Cleanup & Security Hardening (`2a8b06a4`) · Phase 3.4 (`b91be681`)
> Output: the **migration spec for Phase 4.3** (`c2a5d578`). Prepared migration `327` (UNAPPLIED)
> implements this. **Apply is CEO-gated and must ship WITH the frontend RPC migration.**

## Problem

Postgres RLS is **row**-level, not column-level. Today `authenticated` holds `UPDATE` on sensitive
**columns**, so any logged-in user (incl. a cook) can change financial values directly via the
anon-key client. Confirmed live via `information_schema.column_privileges`:

| Table.column | Type | Current grant | Risk |
|---|---|---|---|
| `nomenclature.price` | numeric | `authenticated UPDATE` | sale price change by any staff (Phase 3.2 F2: chef tool too) |
| `expense_ledger.amount_original` | numeric | `authenticated UPDATE` | financial record tampering |
| `expense_ledger.exchange_rate` | numeric | `authenticated UPDATE` | FX manipulation → distorts THB totals |
| `sku_balances.quantity` | numeric | `authenticated UPDATE` | stock figure tampering |

> **Reconciliation note:** `technical-rules.md` / the RLS report name `inventory_balances.quantity`,
> but that table **does not exist** — the canonical stock table is **`sku_balances`**. Spec corrected.

## Mechanism (the standard Postgres column-privilege pattern)

1. **`REVOKE UPDATE (col) ON <table> FROM authenticated` (and `anon`)** — direct column writes blocked.
   Other columns on the same table remain writable (so routine edits like `display_order`,
   `is_available` still work via direct `.update()`).
2. **`SECURITY DEFINER` RPCs gated by `fn_is_owner()`** (verified to exist: checks `staff.app_role =
   'owner'`). The function runs as owner so it can write the revoked column; it first asserts owner.
3. **`value_change_audit`** table — one row per change (actor, table, column, row id, old→new, reason).

### Why a new audit table (not `access_audit_log`)

`access_audit_log` is auth-specific (`actor_staff_id`, `target_staff_id`, `action`, `metadata`).
Financial value changes want typed old/new + the target table/column for queryable trails →
dedicated `value_change_audit`.

## Proposed objects (see prepared migration 327)

```sql
-- audit table
create table public.value_change_audit (
  id uuid primary key default gen_random_uuid(),
  actor_auth_uid uuid not null default auth.uid(),
  table_name text not null,
  column_name text not null,
  row_id uuid not null,
  old_value numeric,
  new_value numeric,
  reason text,
  changed_at timestamptz not null default now()
);
-- RLS: owner-read only; writes only via the SECURITY DEFINER RPCs.

-- RPCs (all: assert fn_is_owner() else raise; update; insert audit row)
fn_set_dish_price(p_id uuid, p_price numeric, p_reason text default null) returns nomenclature
fn_set_expense_amount(p_id uuid, p_amount_original numeric, p_exchange_rate numeric, p_reason text) returns expense_ledger
fn_set_sku_quantity(p_sku_id uuid, p_quantity numeric, p_reason text) returns sku_balances
```

Each RPC body:
```sql
if not public.fn_is_owner() then
  raise exception 'forbidden: owner role required' using errcode = '42501';
end if;
-- capture old, update, insert into value_change_audit, return row
```

## Frontend migration (must ship in the SAME release as the REVOKE)

The REVOKE breaks any `.update()` that writes a revoked column until it routes through the RPC.
Call sites to migrate (from grep of `apps/admin-panel/src`):

| Column | Replace `.update()` with `.rpc()` in |
|---|---|
| `nomenclature.price` | `useMenuDishes.ts`, `useDishDetail.ts`, `useDishCardSave.ts`, `useMenuData.ts` (price paths only — keep `display_order`/`is_available` as direct updates), and chef `_writeTools.ts` `update_dish_price` |
| `expense_ledger.amount_original/exchange_rate` | `useExpenseLedger.ts` (the `ExpenseEditModal` save) |
| `sku_balances.quantity` | `useWasteLog.ts` + any stocktake writer (route through `fn_set_sku_quantity` or the existing stocktake flow) |

> ⚠ Edits that set price **alongside** other columns must split: RPC for price + direct `.update()`
> for the rest, OR extend the RPC to take the other fields. Per-hook decision in Phase 4.3.

## Apply plan (Phase 4.3 — CEO-gated)

1. Apply migration 327 (audit table + RPCs + REVOKEs) — **only together with** the frontend PR.
2. Smoke test: as a **cook**, a direct price `.update()` must 401/403; the owner RPC must succeed and
   write a `value_change_audit` row. As **owner**, both the RPC path works.
3. Phase 4.4 re-runs `get_advisors`; this also removes the Phase 3.2 F2 gap.

## Hand-off

- **Phase 4.3 (`c2a5d578`)**: apply the appendix migration + land the frontend RPC migration in one release.
- Coordinate with the **auth-hardening** session (`79f3e983`) — overlapping `staff`/owner-role surface.

> The migration `.sql` file is intentionally **not** committed here — Phase 3.4 ships the *spec*; the
> file is created/numbered in Phase 4.3 (next free number at that time; today that would be 327, but
> mig 326 from PR #443 must merge first). The complete SQL is below, ready to lift.

---

## Appendix — complete migration SQL (for Phase 4.3, UNAPPLIED)

```sql
-- Migration <NNN>: column-level RLS — owner-gated RPCs for price/amount/quantity
-- MC: c2a5d578 (Phase 4.3) · spec: docs/security/column-rls-rpc-design-2026-06-29.md
-- ⚠ Ship WITH the frontend RPC migration — the REVOKEs break direct .update() of these columns.
BEGIN;

-- 1) Audit table -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.value_change_audit (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_auth_uid uuid NOT NULL DEFAULT auth.uid(),
  table_name     text NOT NULL,
  column_name    text NOT NULL,
  row_id         uuid NOT NULL,
  old_value      numeric,
  new_value      numeric,
  reason         text,
  changed_at     timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.value_change_audit ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS value_change_audit_owner_read ON public.value_change_audit;
CREATE POLICY value_change_audit_owner_read ON public.value_change_audit
  FOR SELECT TO authenticated USING (public.fn_is_owner());
-- no INSERT/UPDATE/DELETE policy: writes happen only inside the SECURITY DEFINER RPCs below.

-- 2) RPCs --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_set_dish_price(p_id uuid, p_price numeric, p_reason text DEFAULT NULL)
RETURNS public.nomenclature LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_old numeric; v_row public.nomenclature;
BEGIN
  IF NOT public.fn_is_owner() THEN RAISE EXCEPTION 'forbidden: owner role required' USING errcode='42501'; END IF;
  SELECT price INTO v_old FROM public.nomenclature WHERE id = p_id;
  UPDATE public.nomenclature SET price = p_price WHERE id = p_id RETURNING * INTO v_row;
  INSERT INTO public.value_change_audit(table_name,column_name,row_id,old_value,new_value,reason)
    VALUES ('nomenclature','price',p_id,v_old,p_price,p_reason);
  RETURN v_row;
END $$;

CREATE OR REPLACE FUNCTION public.fn_set_expense_amount(p_id uuid, p_amount_original numeric, p_exchange_rate numeric, p_reason text DEFAULT NULL)
RETURNS public.expense_ledger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_old_amt numeric; v_old_fx numeric; v_row public.expense_ledger;
BEGIN
  IF NOT public.fn_is_owner() THEN RAISE EXCEPTION 'forbidden: owner role required' USING errcode='42501'; END IF;
  SELECT amount_original, exchange_rate INTO v_old_amt, v_old_fx FROM public.expense_ledger WHERE id = p_id;
  UPDATE public.expense_ledger SET amount_original = p_amount_original, exchange_rate = p_exchange_rate WHERE id = p_id RETURNING * INTO v_row;
  INSERT INTO public.value_change_audit(table_name,column_name,row_id,old_value,new_value,reason)
    VALUES ('expense_ledger','amount_original',p_id,v_old_amt,p_amount_original,p_reason),
           ('expense_ledger','exchange_rate', p_id,v_old_fx, p_exchange_rate, p_reason);
  RETURN v_row;
END $$;

CREATE OR REPLACE FUNCTION public.fn_set_sku_quantity(p_sku_id uuid, p_quantity numeric, p_reason text DEFAULT NULL)
RETURNS public.sku_balances LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_old numeric; v_row public.sku_balances;
BEGIN
  IF NOT public.fn_is_owner() THEN RAISE EXCEPTION 'forbidden: owner role required' USING errcode='42501'; END IF;
  SELECT quantity INTO v_old FROM public.sku_balances WHERE sku_id = p_sku_id;
  UPDATE public.sku_balances SET quantity = p_quantity WHERE sku_id = p_sku_id RETURNING * INTO v_row;
  INSERT INTO public.value_change_audit(table_name,column_name,row_id,old_value,new_value,reason)
    VALUES ('sku_balances','quantity',p_sku_id,v_old,p_quantity,p_reason);
  RETURN v_row;
END $$;

-- 3) Revoke direct column writes (other columns stay writable) ---------------
REVOKE UPDATE (price) ON public.nomenclature FROM authenticated, anon;
REVOKE UPDATE (amount_original, exchange_rate) ON public.expense_ledger FROM authenticated, anon;
REVOKE UPDATE (quantity) ON public.sku_balances FROM authenticated, anon;

-- 4) Grant execute on the RPCs to authenticated (owner-check is inside)
GRANT EXECUTE ON FUNCTION public.fn_set_dish_price(uuid,numeric,text)        TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_set_expense_amount(uuid,numeric,numeric,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_set_sku_quantity(uuid,numeric,text)      TO authenticated;

-- 5) self-register (set the real filename at creation time in Phase 4.3)
INSERT INTO public.migration_log (filename, notes, checksum)
VALUES ('<NNN>_column_rls_owner_rpcs.sql','Column-level RLS: owner-gated RPCs + value_change_audit; REVOKE UPDATE on price/amount_original/exchange_rate/quantity',NULL)
ON CONFLICT (filename) DO NOTHING;

COMMIT;
```

> `sku_balances` is keyed by `sku_id` — confirm the PK/unique column name when authoring (the RPC
> assumes one balance row per `sku_id`; adjust to the real grain, e.g. per location, if needed).
