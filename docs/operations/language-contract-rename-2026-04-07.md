# Language Contract Rename Pass — 2026-04-07

> MC Task: TBD (spawned by COO sweep 2026-04-07)
> Author: COO
> Trigger: 17 MC tasks with Russian or hybrid titles violate RULE-LANGUAGE-CONTRACT (formalized today in `core-rules.md`)

## Context

`RULE-LANGUAGE-CONTRACT` (core-rules.md, dated 2026-04-07) states: storage layer (DB, MC tasks, code, specs) is **English only, no exceptions**. Translation is the receiving agent's job at the boundary.

During inbox sweep on 2026-04-07, COO identified 17 inbox tasks with Russian or hybrid titles. MCP `update_task` cannot rename tasks (title field locked), so a one-off SQL migration is required.

## Proposed renames

| MC ID | Current title (RU) | Proposed title (EN) | Notes |
|---|---|---|---|
| `934f341f-0cbc-4ff5-986c-83163fc2d98a` | MC UI: группировка задач по топикам/агентам + валидаторы полноты данных | MC UI: task grouping by topic/agent + data completeness validators | |
| `c7afe75a-ccd8-4897-aa46-ce3ac0b62661` | Bible Management UI в admin panel — просмотр, proposals, approve/reject workflow | Bible Management UI in admin panel — viewer, proposals, approve/reject workflow | |
| `da4d94ab-ce3c-43da-b234-9ec8366e9321` | Receipt Inbox v2: UX-доработки после открытия | Receipt Inbox v2: UX improvements (post-opening) | |
| `17d5d583-288d-493c-a54f-fa9becf7501f` | Admin Panel: страница Migrations с кнопкой Apply | Admin Panel: Migrations page with Apply button | |
| `1972572e-476d-4725-b559-01453bf4aa28` | Настроить MeriChef | Configure MeriChef | |
| `29500b1e-2aa7-494a-bb7c-402c252a79fb` | Заказать POS-систему | Order POS system | |
| `77092ce4-276d-4b10-b200-4c10e075b36f` | Купить сушилку для овощей | Buy vegetable dehydrator | |
| `1c36113b-c0c9-46c9-8ac7-78cc1304a7c0` | Купить баскеты/баннеты для расстойки хлеба | Buy bannetons for bread proofing | |
| `fb8f6aad-af9e-4f89-a2ac-8be48edbdf46` | Купить G pans (гастроёмкости) | Buy gastronorm pans | |
| `fa0e9ee0-983a-4206-9c59-f63a30029238` | Купить машинку сувид | Buy sous vide machine | |
| `0901bf2b-9d50-40dc-882f-5b1f2358d2dc` | Купить погружной блендер | Buy immersion blender | |
| `82ac4714-29be-42ea-97f1-f18f66dac99b` | Купить пресс-гриль | Buy panini press / contact grill | |
| `1530c6ec-175b-454d-b72c-c0647b0654be` | Купить Sous Vide Vacuum Bags | Buy sous vide vacuum bags | already half-English |
| `d7929dea-a35b-4363-ac95-ce81b4c199b1` | Купить label machine (этикетировщик) | Buy label printer | |
| `20d74b7a-e042-4ace-8842-265fa8da5bc0` | Выбрать муку для хлебной программы | Select flour for bread program | |
| `4f4cf515-cb74-433b-922b-8fee7353b20d` | Купить озонатор | Buy ozone generator | |
| `7cdd25e6-38a5-4a8d-b35b-48559983fd31` | Купить бумажные полотенца (bulk) | Buy paper towels (bulk) | |

## SQL migration

Create `services/supabase/migrations/100_language_contract_rename.sql`:

```sql
-- 100_language_contract_rename.sql
-- Rename 17 MC tasks from Russian/hybrid to English per RULE-LANGUAGE-CONTRACT (2026-04-07).
-- Source: docs/operations/language-contract-rename-2026-04-07.md
-- Reversible: original Russian titles preserved in business_tasks_audit (if exists) or in this file.

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

-- Verification
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

COMMIT;
```

## Verification after apply

```sql
SELECT id, title, status, created_by FROM business_tasks
WHERE title ~ '[А-Яа-яЁё]'
  AND status NOT IN ('done', 'cancelled');
```

Expected: zero rows.

## Out of scope

- Task **descriptions** in Russian — separate pass, lower priority. Most are mixed and machine-translatable; not blocking.
- Task **comments** in Russian — explicitly permitted by `RULE-LANGUAGE-CONTRACT` exception clause (verbatim CEO quotes).
- Task **notes** field — same exception.

## Rollback

If a translation is wrong, fix it as a normal `update_task` flow (description) or as a follow-up rename in a new migration. Do NOT revert this migration — Russian titles are a contract violation, not a recoverable state.
