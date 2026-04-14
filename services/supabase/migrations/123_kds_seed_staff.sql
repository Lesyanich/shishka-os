-- Migration 123: Seed kitchen staff for KDS testing
-- Adds initial cooks with PIN codes for the KDS PWA login

BEGIN;

INSERT INTO public.staff (id, name, name_th, role, phone, pin_code, is_active, preferred_language, skill_level)
VALUES
  (gen_random_uuid(), 'Bas', 'บาส', 'sous_chef', NULL, '1234', true, 'th', 4),
  (gen_random_uuid(), 'Noi', 'น้อย', 'cook', NULL, '5678', true, 'th', 2),
  (gen_random_uuid(), 'Som', 'ส้ม', 'cook', NULL, '9012', true, 'th', 3),
  (gen_random_uuid(), 'Lek', 'เล็ก', 'prep', NULL, '3456', true, 'th', 1)
ON CONFLICT DO NOTHING;

-- Self-register
INSERT INTO public.migration_log (filename, notes, checksum)
VALUES (
  '123_kds_seed_staff.sql',
  'Seed kitchen staff: Bas (sous_chef), Noi/Som (cook), Lek (prep) with PIN codes for KDS',
  NULL
)
ON CONFLICT (filename) DO NOTHING;

COMMIT;
