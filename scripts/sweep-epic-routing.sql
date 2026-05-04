-- One-shot retroactive sweep — assigns initiative_id or kind:standalone to all open tasks.
-- Generated from Step 3 proposal on task 61102477 after CEO sign-off (chat 2026-04-28).
-- This is intentionally not a numbered migration — it operates on data that doesn't exist
-- in fresh environments. Re-running is safe (idempotent: ON CONFLICT-style guards inline).

begin;

-- ── A. Auto-attached by tag-overlap (12 tasks) ─────────────────────────────

update business_tasks set initiative_id = (select id from business_initiatives where slug = 'brain')
  where id in (
    '9ea1d78e-3aa3-4462-84b2-b151196ef953',  -- Brain: entity detail panel
    '1ad969ae-9d1f-4959-b8ab-4b02524da7a7'   -- Knowledge Vault Bootstrap
  ) and initiative_id is null;

update business_tasks set initiative_id = (select id from business_initiatives where slug = 'kds-phase3')
  where id in (
    'f73da9fa-a6b7-4ca7-88bf-5266f653977b',  -- KDS auth hardening
    '8bbe974d-aa9b-4227-bd6e-55fbab3f5c19',  -- KDS 3.4 AI Enhanced Operations
    'b2b46fe6-5dda-41bb-acdf-be9b7b0c1f53'   -- KDS 3.3 Smart Monitoring
  ) and initiative_id is null;

update business_tasks set initiative_id = (select id from business_initiatives where slug = 'menu')
  where id in (
    '9a198e54-0f29-4288-bf2a-3111c9d1f297',  -- Menu Page: Scorecard badge
    '3a75c655-da05-418c-afd1-50b097fd28bf'   -- Audited 13 dishes
  ) and initiative_id is null;

update business_tasks set initiative_id = (select id from business_initiatives where slug = 'l2-opening')
  where id in (
    '3c29c970-6047-4a63-9ca8-fd1851212276',  -- BLOCKER: dough sheeter for manaeesh
    '4e6c7872-fc56-4ac0-b740-77cea29ab6ca'   -- Strategy Chat: AI strategist
  ) and initiative_id is null;

update business_tasks set initiative_id = (select id from business_initiatives where slug = 'erp')
  where id = 'd27caf91-eca1-45d5-998e-5b4aa4943e1f'  -- Add user management UI
  and initiative_id is null;

update business_tasks set initiative_id = (select id from business_initiatives where slug = 'ai-chef')
  where id in (
    '4e68fbd2-b2c0-4c4b-8c36-358f04f71205',  -- Production Log
    '61f9679b-eed7-4414-aee0-a8bba6e29a3b'   -- Chef chat: saved conversations
  ) and initiative_id is null;

-- ── B. Title-only matches (2 tasks) ────────────────────────────────────────

update business_tasks set initiative_id = (select id from business_initiatives where slug = 'menu')
  where id = 'fe1d0fbe-b9c2-4a0d-b654-d06b9259fac6'  -- Add fiber field + Menu Page
  and initiative_id is null;

update business_tasks set initiative_id = (select id from business_initiatives where slug = 'l2-opening')
  where id = '4fa46f42-7481-46e7-a255-973ec07db587'  -- Buy table-top dough sheeter
  and initiative_id is null;

-- B-bonus: extend menu match_tags so future nutrition-adjacent tasks auto-route there
update business_initiatives
  set match_tags = array_append(match_tags, 'nutrition')
  where slug = 'menu' and not (match_tags @> ARRAY['nutrition']);

-- ── D + C. Mark 30 remaining tasks as kind:standalone ──────────────────────

update business_tasks
  set tags = array_append(tags, 'kind:standalone')
  where id in (
    -- Bugs / DX friction
    '3760af53-e2eb-428b-ac2d-06ecebc61fc6',
    '25a40b48-3c51-45e4-96ec-06b927683a29',
    'fc1c345b-42ac-438d-8828-085b588b3376',
    '9c39632c-e3bb-4c57-b7da-d84704116ec6',
    '61102477-bc0c-42ce-b9e3-02c5562fe907',  -- this task itself
    -- Data health
    '6fbd16eb-3353-417a-a015-7a30c7236498',
    'b6ca0bdb-4978-4177-b6f9-0580b1cf8752',
    '7f3f6559-8e73-4926-ac47-4bb78d7ac03f',
    '05795744-2af5-4fa1-891d-4c46fa598eac',
    '884fcdcc-5c0a-40ba-b273-0722b904f599',
    'b4fa35d7-8f3f-4cdf-8818-c356264399d8',
    '39add9cb-2ebd-4e3f-ac62-843840369ded',
    'ade8c9e6-7621-4a90-8d46-a0726c428af5',
    '3788a19f-30ec-4212-a2db-ef7cf93f3337',
    'f43a949c-0a8b-465a-8751-bfb40f9d6b01',
    -- Kitchen / procurement one-offs
    '8e2b1af4-ab67-4dd0-ad95-f7fcecf60814',
    '7e13032b-5baa-46ce-9819-9a7af4373662',
    '4dac18c6-283b-40b6-bee5-938e43fddc37',  -- Bas to ERP — left standalone (CEO ok)
    -- Admin panel one-offs
    'db452ef6-71df-452c-a822-d161b9d2a7a4',
    '7b878b16-ba98-4f62-ae0a-224674f47dae',
    '0b81e357-7c75-49f4-a910-32832d44efbc',
    '5ced907b-085f-4cf8-bd1f-cea6dce6ac74',
    -- MC / Claude infra
    '8690f410-24cd-4c86-b99e-b993aea5c5a7',
    '7d912d1f-f525-454c-b341-28daa3031707',
    '708055c0-e8cb-4b70-9beb-b5e8cbe25c27',
    '04a4fe06-9c69-4753-b122-4410aed83492',
    -- Inventory
    'e4b7a4de-6cc6-4b05-9fea-3bcc70790a98',
    -- Strategy / orchestrator
    '7bd550d8-9bb4-4e27-b54c-869cb7a85331',
    '92a9e428-cbd9-4dd1-9216-ef3dcdb61efb',
    -- Analytics Brain Agent — standalone for now (CEO can promote to epic:analytics later if cluster grows)
    'b8ca591f-6d04-43ab-8fde-53fe27a56199'
  ) and not (tags @> ARRAY['kind:standalone']);

commit;

-- ── Verification ───────────────────────────────────────────────────────────
-- After commit, every open task should satisfy: initiative_id IS NOT NULL OR 'kind:standalone' = ANY(tags)

select
  count(*) filter (where initiative_id is not null) as linked,
  count(*) filter (where 'kind:standalone' = any(tags)) as standalone,
  count(*) filter (where initiative_id is null and not ('kind:standalone' = any(tags))) as orphans
from business_tasks
where status not in ('done', 'cancelled');
