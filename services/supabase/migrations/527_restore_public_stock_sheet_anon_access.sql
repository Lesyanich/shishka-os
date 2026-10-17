-- 527_restore_public_stock_sheet_anon_access.sql
--
-- REGRESSION FIX: the public staff stock-order sheet at /stock is broken for anon.
--
-- `/stock` is the one route in apps/admin-panel OUTSIDE `<ProtectedRoute>`, and
-- `useStockSheet.ts` documents the contract in its own header:
--
--     reads v_stock_sheet_items (anon-readable) and submits via fn_submit_stock_sheet
--     (passcode-gated, anon). No auth session required — runs on the anon Supabase key.
--
-- Measured with the publishable key:
--   GET  /rest/v1/v_stock_sheet_items       -> 401
--   POST /rest/v1/rpc/fn_submit_stock_sheet -> 401 "permission denied for function"
--
-- TWO SEPARATE CAUSES, and the attribution matters
-- ------------------------------------------------------------------------------
-- 1. **The read was ALREADY broken before today.** `v_stock_sheet_items` carries
--    `security_invoker = true`, so it reads its base tables as the CALLER — and anon has
--    no SELECT on `nomenclature`. A REST sweep taken BEFORE migration 504 recorded it as
--    401, exactly as it does now. 504 revoked anon's SELECT on the view, but that grant
--    was already insufficient on its own, so 504 did not cause this; it only removed one
--    of the pieces the fix needs back. The real cause is the view being invoker.
--
-- 2. **The submit was broken by 490**, which revoked EXECUTE on
--    `fn_submit_stock_sheet` from anon.
--
-- THE FIX IS THE MIGRATION-256 PATTERN, not a base-table grant
-- ------------------------------------------------------------------------------
-- The tempting repair — grant anon SELECT on `nomenclature` — would be a serious leak:
-- that table carries `cost_per_unit`, `price`, `markup_pct`, `cost_source`,
-- `loyverse_price` and `default_supplier_id`. Never.
--
-- The house rule already covers this exact shape: anon-facing views MUST be
-- `SECURITY DEFINER`, because anon has no grant on `nomenclature`. `menu_public`,
-- `v_public_menu` and `menu_modifiers` all are. Migration 253 once set `security_invoker`
-- on them and silently broke the live site (anon got 42501, `useMenu` swallowed it and
-- rendered MOCK data); 256 put them back. **`v_stock_sheet_items` is a fourth view in that
-- class and was missed.** So it goes back to DEFINER, and anon needs nothing on the base
-- tables or on `fn_active_menu_ingredient_ids()` — the view owner evaluates both.
--
-- WHY BOTH 490 AND 504 MISSED THIS SURFACE — worth recording
-- ------------------------------------------------------------------------------
-- Both derived the anon surface from the PUBLIC SITE repos (`shishka-health`, `apps/web`)
-- and treated the admin panel as entirely authenticated. 490's audit even noted "no
-- `.rpc(` call in either repo" — true of those two, false of `apps/admin-panel`.
--
-- My own 504 check compounded it: I grepped `StockSheetPage.tsx` for `.from(` / `.rpc(`,
-- found nothing, and concluded the page read no data. The data access lives in the HOOK.
-- Same shape as the CookTasksPage near-miss earlier today — judging a file by its own text
-- when the behaviour is one import away.
--
-- **The anon surface is three repos wide**: shishka-health, apps/web, AND the public routes
-- of apps/admin-panel (`/login`, `/stock`).
--
-- WHY RE-OPENING IT IS SAFE
-- ------------------------------------------------------------------------------
-- `v_stock_sheet_items` is a picking list: 25 rows of id, name, emoji, base_unit,
-- storage_location, category id/code/name/name_th/sort, in_active_menu. No cost, no
-- supplier, no margin, no staff identifier.
--
-- `fn_submit_stock_sheet(p_passcode, p_note, p_lines)` is authenticated by its passcode
-- argument — the intended gate for staff without accounts. It is therefore deliberately
-- NOT role-gated, unlike the payroll RPCs in 523; a role check would make it unusable for
-- the people it exists for.

-- CONTRACT-REVIEWED: this migration does NOT touch the menu contract. `menu_public`,
-- `menu_modifiers` and `v_public_menu` appear in the comments ABOVE only as the precedent
-- for keeping an anon-facing view SECURITY DEFINER (mig 253 -> 256); no statement here
-- references them. The only objects altered are `v_stock_sheet_items` (the public /stock
-- picking list, not a contract resource) and `fn_submit_stock_sheet`. contract-check.mjs
-- was run green against both endpoints before and after applying, and no column moved, so
-- contracts/menu-contract.json needs no update.

BEGIN;

-- back to DEFINER so the view owner reads nomenclature, not the anon caller
ALTER VIEW public.v_stock_sheet_items SET (security_invoker = false);

GRANT SELECT  ON public.v_stock_sheet_items                               TO anon;
GRANT EXECUTE ON FUNCTION public.fn_submit_stock_sheet(text, text, jsonb) TO anon;

COMMENT ON VIEW public.v_stock_sheet_items IS
  'Picking list for the PUBLIC /stock route (outside ProtectedRoute). MUST stay '
  'SECURITY DEFINER and anon-SELECTable: anon has no grant on nomenclature, so '
  'security_invoker=true silently 401s this view (migration 527; same class as '
  'menu_public / v_public_menu / menu_modifiers, see mig 253 -> 256). '
  'Holds no cost, supplier or staff data.';

COMMENT ON FUNCTION public.fn_submit_stock_sheet(text, text, jsonb) IS
  'rpc: anon - the PUBLIC /stock staff order sheet. Authenticated by its p_passcode '
  'argument, not by a role: do NOT add a role gate, and do NOT revoke anon (migration 527).';

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES ('527_restore_public_stock_sheet_anon_access.sql', 'claude-opus-session-df80a758', NULL,
        'REGRESSION FIX for the public /stock staff order sheet. Read: v_stock_sheet_items was security_invoker=true while anon has no SELECT on nomenclature, so it 401d - verified 401 BEFORE migration 504 as well, so 504 did not cause it (504 revoked a grant that was already insufficient). Fixed the mig-256 way: back to SECURITY DEFINER + anon SELECT, NOT by granting anon on nomenclature, which holds cost_per_unit/price/markup_pct/default_supplier_id. Submit: 490 revoked anon EXECUTE on fn_submit_stock_sheet; restored. It is passcode-gated by design and must never be role-gated. Root blind spot: 490 and 504 both derived the anon surface from the public-site repos and treated apps/admin-panel as fully authenticated, but /stock is public and its data access lives in useStockSheet.ts, not the page file. Added COMMENTs on both objects so the next narrowing pass does not repeat it.');

COMMIT;
