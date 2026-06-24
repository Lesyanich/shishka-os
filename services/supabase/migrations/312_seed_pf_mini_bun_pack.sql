-- Migration 312: seed PF-MINI_BUN pack card (per-piece weight + standard pack size)
--
-- The kitchen label station prints pack labels for countable PF preps as
-- "<pieces> pcs / <total> g". The per-piece weight is read from the DB
-- (pf_pack_card.portion_weight_g) — never hardcoded. PF-MINI_BUN had no pack-card
-- row, so the 60 g/bun lived only in kitchen_note text. Seed it: one bun = 60 g,
-- packed 8 per bag (the standard pack the kitchen uses).
--
-- COALESCE-only: fills NULLs, never clobbers a value the owner set via the pack
-- card editor. Idempotent.

BEGIN;

INSERT INTO public.pf_pack_card (nomenclature_id, portion_weight_g, portions_per_bag)
SELECT id, 60, 8
FROM public.nomenclature
WHERE product_code = 'PF-MINI_BUN'
ON CONFLICT (nomenclature_id) DO UPDATE
  SET portion_weight_g = COALESCE(pf_pack_card.portion_weight_g, EXCLUDED.portion_weight_g),
      portions_per_bag = COALESCE(pf_pack_card.portions_per_bag, EXCLUDED.portions_per_bag);

-- Ledger (numbering guard).
INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES (
  '312_seed_pf_mini_bun_pack.sql',
  'claude-code',
  'Seed pf_pack_card for PF-MINI_BUN (portion_weight_g=60, portions_per_bag=8) so the kitchen label station prints "8 pcs / 480 g" pack labels from the DB. Per-piece weight was previously only in kitchen_note text.'
) ON CONFLICT (filename) DO NOTHING;

COMMIT;
