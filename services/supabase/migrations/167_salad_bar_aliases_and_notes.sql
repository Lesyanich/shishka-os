-- Migration 167: Enrich salad bars with aliases, capacity, notes
-- Problem: chef agent couldn't find salad bars (name_search not in Zod schema — fixed in code)
-- and capacity/notes were empty (cell sizes from legacy capex sheet never migrated)
-- Source: Google Sheet "Expenses and Capex Equipment", sheet REF_Locations_Map

-- Unit 1: Salad Bar (L-2-S-SB-150-9)
UPDATE equipment
SET
  aliases = ARRAY['салат-бар', 'салат бар', 'บาร์สลัด', 'salad display', 'Salad Bar Unit 1'],
  name = 'Salad Bar (Unit 1)',
  capacity = 28,
  capacity_unit = 'GN pan slot',
  notes = '150x80x135cm. 304 SS, Glass Top, LED. 28 GN slots: 6x GN 1/3 (32L base), 16x GN 1/6 (26.8L toppings), 6x GN 1/9 (3.6L garnish). Total 62.4L. Bottom: 100kg refrigerated shelf. Surface: 150x25cm assembly. Layout: docs/business/equipment/salad-bar-layout.md'
WHERE equipment_code = 'L-2-S-SB-150-9';

-- Unit 2: Salad Bar (L-2-S-SB-150-10) — identical layout
UPDATE equipment
SET
  aliases = ARRAY['салат-бар', 'салат бар', 'บาร์สลัด', 'salad display', 'Salad Bar Unit 2'],
  name = 'Salad Bar (Unit 2)',
  capacity = 28,
  capacity_unit = 'GN pan slot',
  notes = '150x80x135cm. 304 SS, Glass Top, LED. 28 GN slots: 6x GN 1/3 (32L base), 16x GN 1/6 (26.8L toppings), 6x GN 1/9 (3.6L garnish). Total 62.4L. Bottom: 100kg refrigerated shelf. Surface: 150x25cm assembly. Layout: docs/business/equipment/salad-bar-layout.md'
WHERE equipment_code = 'L-2-S-SB-150-10';

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '167_salad_bar_aliases_and_notes.sql',
  'claude-code',
  NULL,
  'Enrich salad bars: multilingual aliases, capacity=28 GN slots, notes with full layout spec. Source: legacy REF_Locations_Map sheet.'
);
