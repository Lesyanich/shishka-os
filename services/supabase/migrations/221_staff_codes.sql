-- Migration 221: Staff codes for dishes (S-1, M-1 …)
--
-- Short, human-friendly identifiers for staff: smoothies S-1, S-2…,
-- manakish M-1, M-2…, etc. Used for fast verbal/written communication
-- (cook ↔ cashier ↔ assembler) and on POS tiles / cheat-sheets.
--
-- Design:
--   • The letter namespace lives PER CATEGORY (product_categories.staff_code_prefix)
--     because category first-letters collide (Smoothie / Salad / Soup all 'S').
--   • The code lives in a dedicated nomenclature.staff_code column — the dish
--     `name` stays clean; the 'S-1 ' prefix is rendered at display time.
--   • Numbers are AUTO-assigned and STABLE: a code is bound to a dish forever;
--     adding a new dish never renumbers existing ones (MAX(n)+1 per prefix).

BEGIN;

-- ── 1. Prefix namespace per category ──────────────────────────────
ALTER TABLE public.product_categories
  ADD COLUMN IF NOT EXISTS staff_code_prefix TEXT;

COMMENT ON COLUMN public.product_categories.staff_code_prefix IS
  'Single-letter namespace for staff dish codes (e.g. S=Smoothie, M=Manakish). NULL = category not numbered.';

-- Seed non-colliding letters. Owner can edit later. Only S and M matter for
-- the current 9 smoothies + 13 manakish; the rest are pre-seeded so future
-- dishes in those categories auto-number too.
UPDATE public.product_categories SET staff_code_prefix = 'S' WHERE code = 'KP-DRK-SMT';
UPDATE public.product_categories SET staff_code_prefix = 'M' WHERE code = 'KP-FIN-MAN';
UPDATE public.product_categories SET staff_code_prefix = 'B' WHERE code = 'KP-FIN-BWL';
UPDATE public.product_categories SET staff_code_prefix = 'L' WHERE code = 'KP-FIN-SLD';
UPDATE public.product_categories SET staff_code_prefix = 'P' WHERE code = 'KP-FIN-SOU';
UPDATE public.product_categories SET staff_code_prefix = 'W' WHERE code = 'KP-FIN-WRP';
UPDATE public.product_categories SET staff_code_prefix = 'J' WHERE code = 'KP-DRK-JCE';
UPDATE public.product_categories SET staff_code_prefix = 'H' WHERE code = 'KP-DRK-HOT';

-- ── 2. The assigned code on each dish ─────────────────────────────
ALTER TABLE public.nomenclature
  ADD COLUMN IF NOT EXISTS staff_code TEXT;

COMMENT ON COLUMN public.nomenclature.staff_code IS
  'Short staff identifier, format <PREFIX>-<N> (e.g. S-1, M-13). Stable once assigned. Rendered as a prefix before name on POS / admin / cheat-sheets.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_nomenclature_staff_code
  ON public.nomenclature (staff_code)
  WHERE staff_code IS NOT NULL;

-- ── 3. Assignment logic (callable; used by trigger + backfill) ────
-- Resolves the dish's category → its prefix, finds the next free number in
-- that prefix's namespace, and writes <PREFIX>-<N>. No-op (returns existing /
-- NULL) when: code already set, not a SALE dish, no category, or category has
-- no prefix. Stability is guaranteed by the "already set" guard.
CREATE OR REPLACE FUNCTION public.fn_assign_staff_code(p_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_code     TEXT;
  v_pcode    TEXT;
  v_cat_id   UUID;
  v_avail    BOOLEAN;
  v_prefix   TEXT;
  v_next     INT;
  v_assigned TEXT;
BEGIN
  SELECT staff_code, product_code, category_id, is_available
    INTO v_code, v_pcode, v_cat_id, v_avail
  FROM public.nomenclature
  WHERE id = p_id;

  IF v_code IS NOT NULL THEN
    RETURN v_code;                       -- stability: never reassign
  END IF;
  IF v_pcode IS NULL OR v_pcode NOT LIKE 'SALE-%' THEN
    RETURN NULL;                         -- dishes only
  END IF;
  IF v_avail IS NOT TRUE THEN
    RETURN NULL;                         -- only dishes actually on the menu
  END IF;
  IF v_cat_id IS NULL THEN
    RETURN NULL;                         -- needs a category to know the prefix
  END IF;

  SELECT staff_code_prefix INTO v_prefix
  FROM public.product_categories
  WHERE id = v_cat_id;

  IF v_prefix IS NULL OR v_prefix = '' THEN
    RETURN NULL;                         -- category not opted in
  END IF;

  SELECT COALESCE(MAX(split_part(staff_code, '-', 2)::INT), 0) + 1
    INTO v_next
  FROM public.nomenclature
  WHERE staff_code ~ ('^' || v_prefix || '-[0-9]+$');

  v_assigned := v_prefix || '-' || v_next;

  UPDATE public.nomenclature SET staff_code = v_assigned WHERE id = p_id;
  RETURN v_assigned;
END;
$$;

COMMENT ON FUNCTION public.fn_assign_staff_code(UUID) IS
  'Assigns the next stable staff_code (<PREFIX>-<N>) for a SALE dish based on its category prefix. No-op if already set, not a dish, or category has no prefix.';

-- ── 4. Auto-assign when a dish goes live ──────────────────────────
-- Fires BEFORE INSERT OR UPDATE, inline on NEW. A code is assigned the first
-- time a SALE dish is both available AND uncoded — so a draft created
-- unavailable still gets numbered the moment it is published. Codes are never
-- reused or reassigned (stability), so archiving a dish keeps its number out
-- of circulation.
CREATE OR REPLACE FUNCTION public.fn_nomenclature_staff_code()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_prefix TEXT;
  v_next   INT;
BEGIN
  IF NEW.staff_code IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.product_code IS NULL OR NEW.product_code NOT LIKE 'SALE-%' THEN
    RETURN NEW;
  END IF;
  IF NEW.is_available IS NOT TRUE THEN
    RETURN NEW;                          -- only dishes actually on the menu
  END IF;
  IF NEW.category_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT staff_code_prefix INTO v_prefix
  FROM public.product_categories
  WHERE id = NEW.category_id;

  IF v_prefix IS NULL OR v_prefix = '' THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(MAX(split_part(staff_code, '-', 2)::INT), 0) + 1
    INTO v_next
  FROM public.nomenclature
  WHERE staff_code ~ ('^' || v_prefix || '-[0-9]+$');

  NEW.staff_code := v_prefix || '-' || v_next;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_nomenclature_staff_code() IS
  'BEFORE INSERT/UPDATE trigger on nomenclature: assigns staff_code the first time a SALE dish is available + uncoded and its category has a staff_code_prefix. Stable — never touches an existing code.';

-- NB: watch only is_available + category_id. Deliberately NOT staff_code —
-- otherwise an administrative `SET staff_code = NULL` would re-fire the trigger
-- and instantly reassign, making codes impossible to clear.
DROP TRIGGER IF EXISTS trg_nomenclature_staff_code ON public.nomenclature;
CREATE TRIGGER trg_nomenclature_staff_code
  BEFORE INSERT OR UPDATE OF is_available, category_id
  ON public.nomenclature
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_nomenclature_staff_code();

-- ── 5. Backfill existing dishes ───────────────────────────────────
-- Assign sequential codes per prefix, ordered stably so the result is
-- deterministic and human-sensible (display_order, then age, then name).
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT n.id
    FROM public.nomenclature n
    JOIN public.product_categories pc ON pc.id = n.category_id
    WHERE n.product_code LIKE 'SALE-%'
      AND n.is_available IS TRUE
      AND n.staff_code IS NULL
      AND pc.staff_code_prefix IS NOT NULL
    ORDER BY n.display_order, n.created_at, n.name
  LOOP
    PERFORM public.fn_assign_staff_code(r.id);
  END LOOP;
END;
$$;

INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES (
  '221_staff_codes.sql',
  'claude-code',
  'Staff codes for dishes: product_categories.staff_code_prefix + nomenclature.staff_code + auto-assign trigger + backfill. Stable per-category numbering (S-1, M-1 …).'
) ON CONFLICT (filename) DO NOTHING;

COMMIT;
