-- 102: Rename 17 MC tasks RU → EN per RULE-LANGUAGE-CONTRACT (2026-04-07)
--
-- Source spec: docs/operations/language-contract-rename-2026-04-07.md
-- MC task:     e349b927-cdd0-4107-bb98-0c6c9ae897c9
--
-- Background: RULE-LANGUAGE-CONTRACT (core-rules.md, 2026-04-07) mandates
-- English-only storage layer. COO inbox sweep on 2026-04-07 identified 17
-- inbox tasks with Russian/hybrid titles. MCP update_task cannot rename
-- (title field locked in the current RPC schema) → SQL migration required.
--
-- Slot note: spec requested slot 100, but 100/101 were taken by the
-- Kitchen UX v2 spec_file fix. Promoted to 102.
--
-- Rollback policy: do NOT revert. Russian titles are a contract violation,
-- not a recoverable state. Correct any translation errors via a follow-up
-- migration or MC update_task on description/notes.

BEGIN;

UPDATE business_tasks SET title = 'MC UI: task grouping by topic/agent + data completeness validators' WHERE id = '934f341f-0cbc-4ff5-986c-83163fc2d98a';
UPDATE business_tasks SET title = 'Bible Management UI in admin panel — viewer, proposals, approve/reject workflow' WHERE id = 'c7afe75a-ccd8-4897-aa46-ce3ac0b62661';
UPDATE business_tasks SET title = 'Receipt Inbox v2: UX improvements (post-opening)' WHERE id = 'da4d94ab-ce3c-43da-b234-9ec8366e9321';
UPDATE business_tasks SET title = 'Admin Panel: Migrations page with Apply button' WHERE id = '17d5d583-288d-493c-a54f-fa9becf7501f';
UPDATE business_tasks SET title = 'Configure MeriChef' WHERE id = '1972572e-476d-4725-b559-01453bf4aa28';
UPDATE business_tasks SET title = 'Order POS system' WHERE id = '29500b1e-2aa7-494a-bb7c-402c252a79fb';
UPDATE business_tasks SET title = 'Buy vegetable dehydrator' WHERE id = '77092ce4-276d-4b10-b200-4c10e075b36f';
UPDATE business_tasks SET title = 'Buy bannetons for bread proofing' WHERE id = '1c36113b-c0c9-46c9-8ac7-78cc1304a7c0';
UPDATE business_tasks SET title = 'Buy gastronorm pans' WHERE id = 'fb8f6aad-af9e-4f89-a2ac-8be48edbdf46';
UPDATE business_tasks SET title = 'Buy sous vide machine' WHERE id = 'fa0e9ee0-983a-4206-9c59-f63a30029238';
UPDATE business_tasks SET title = 'Buy immersion blender' WHERE id = '0901bf2b-9d50-40dc-882f-5b1f2358d2dc';
UPDATE business_tasks SET title = 'Buy panini press / contact grill' WHERE id = '82ac4714-29be-42ea-97f1-f18f66dac99b';
UPDATE business_tasks SET title = 'Buy sous vide vacuum bags' WHERE id = '1530c6ec-175b-454d-b72c-c0647b0654be';
UPDATE business_tasks SET title = 'Buy label printer' WHERE id = 'd7929dea-a35b-4363-ac95-ce81b4c199b1';
UPDATE business_tasks SET title = 'Select flour for bread program' WHERE id = '20d74b7a-e042-4ace-8842-265fa8da5bc0';
UPDATE business_tasks SET title = 'Buy ozone generator' WHERE id = '4f4cf515-cb74-433b-922b-8fee7353b20d';
UPDATE business_tasks SET title = 'Buy paper towels (bulk)' WHERE id = '7cdd25e6-38a5-4a8d-b35b-48559983fd31';

-- Verification: no active Cyrillic titles remain
DO $$
DECLARE
  ru_count INT;
BEGIN
  SELECT COUNT(*) INTO ru_count FROM business_tasks
  WHERE title ~ '[А-Яа-яЁё]'
    AND status NOT IN ('done', 'cancelled');
  IF ru_count > 0 THEN
    RAISE NOTICE 'Still % active tasks with Cyrillic in title — investigate', ru_count;
  ELSE
    RAISE NOTICE 'Language contract clean: 0 Cyrillic titles in active tasks';
  END IF;
END $$;

-- Self-register with NULL checksum (per 101 workaround — avoids filename-stem
-- vs file-content md5 drift noise in check_migrations).
INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '102_language_contract_rename.sql',
  'claude-code',
  NULL,
  'Apply RULE-LANGUAGE-CONTRACT: rename 17 MC tasks RU → EN (MC e349b927)'
)
ON CONFLICT DO NOTHING;

COMMIT;
