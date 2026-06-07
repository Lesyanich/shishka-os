-- 255_visitor_site_public_menu.sql
-- Mirror of schema applied directly in Supabase for the shishka.health visitor site.
-- These objects are already live in the prod project; this file captures them as
-- source-of-truth so the schema is reproducible from the repo.
-- Recorded from a session handoff (2026-06-07). See MC task a22a5362.
-- All statements are idempotent so this runs cleanly on a fresh database.

begin;

-- 1) Customer-facing ingredient list (состав) shown in the visitor-site dish dialog.
alter table public.nomenclature
  add column if not exists customer_ingredients text;

comment on column public.nomenclature.customer_ingredients is
  'Customer-facing ingredient list (состав) shown in the shishka.health dish dialog. Free text, English.';

-- 2) Editable brand copy for the visitor site (hero / rule / cta blocks).
--    Key/JSON store edited from admin/Supabase and read by shishka.health with no deploy.
create table if not exists public.site_content (
  key        text primary key,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

comment on table public.site_content is
  'Key/JSON store for editable visitor-site brand copy (hero, rule, cta). Public read, authenticated write.';

alter table public.site_content enable row level security;

drop policy if exists site_content_public_read on public.site_content;
create policy site_content_public_read on public.site_content
  for select to anon, authenticated
  using (true);

drop policy if exists site_content_auth_write on public.site_content;
create policy site_content_auth_write on public.site_content
  for all to authenticated
  using (true)
  with check (true);

grant select on public.site_content to anon;
grant select, insert, update, delete on public.site_content to authenticated;

-- Seed default brand copy (idempotent: never overwrites edited content).
insert into public.site_content (key, data) values
  ('hero', $json$
    {
      "eyebrow": "SHiSHKA · Healthy Kitchen",
      "title": "from the SOIL to the SOUL.",
      "sub": "fresh, unprocessed, scientifically balanced — real food, made daily."
    }
  $json$::jsonb),
  ('rule', $json$
    {
      "eyebrow": "the rule",
      "title": "no compromises.",
      "lead": "we eliminate the noise that harms the human machine, and replace it with powerful nutrition that resonates with your DNA.",
      "items": ["seed oils", "industrial gluten", "fake food", "fried food", "preservatives", "toxic"],
      "afterCategory": 1
    }
  $json$::jsonb),
  ('cta', $json$
    {
      "eyebrow": "visit us in phuket",
      "title": "come hungry.",
      "sub": "Real food, made fresh every day — drop by our Phuket kitchen.",
      "hoursLabel": "open daily",
      "hoursTime": "9:00 – 18:00",
      "instagramUrl": "https://www.instagram.com/shishka_phuket",
      "whatsappUrl": ""
    }
  $json$::jsonb)
on conflict (key) do nothing;

-- 3) Public read-only menu view. Anon sees only available, POS-synced SALE dishes,
--    and ONLY customer-safe columns — no cost_per_unit / margin / markup.
--    security_invoker = true so the caller's RLS on nomenclature still applies.
create or replace view public.menu_public
with (security_invoker = true) as
  select
    n.id,
    n.product_code,
    n.name,
    n.customer_short_name,
    n.customer_photo_url,
    n.image_url,
    n.customer_description,
    n.price,
    n.is_available,
    n.is_featured,
    n.pos_status,
    n.calories,
    n.protein,
    n.carbs,
    n.fat,
    n.portion_size,
    n.portion_unit,
    n.category_id,
    n.display_order,
    c.code AS category_code,
    c.name AS category_name,
    c.sort_order AS category_sort_order,
    n.customer_ingredients
  from nomenclature n
    left join product_categories c on c.id = n.category_id
  where n.product_code like 'SALE-%'
    and n.pos_status = 'synced'::pos_status_enum
    and n.is_available = true;

grant select on public.menu_public to anon, authenticated;

-- 4) Public modifier options per dish (group name, option name/emoji, price delta only).
--    Intentionally SECURITY DEFINER (no security_invoker): the underlying modifier
--    tables are not anon-readable, and this view exposes only customer-safe columns
--    (no cost). The Supabase advisor flags this as `security_definer_view` — this is
--    expected and accepted for the public visitor site.
create or replace view public.menu_modifiers as
  select
    o.dish_id,
    o.loyverse_modifier_list_name AS group_name,
    g.sort_order AS group_sort,
    COALESCE(m.customer_short_name, m.name) AS option_name,
    m.emoji AS option_emoji,
    o.price_delta,
    o.is_default,
    o.sort_order
  from nomenclature_modifier_options o
    join nomenclature m on m.id = o.modifier_id
    left join dish_modifier_groups g
      on g.dish_id = o.dish_id
     and g.loyverse_modifier_list_id = o.loyverse_modifier_list_id
  where o.dish_id in (
    select nomenclature.id
    from nomenclature
    where nomenclature.product_code like 'SALE-%'
      and nomenclature.pos_status = 'synced'::pos_status_enum
      and nomenclature.is_available = true
  );

grant select on public.menu_modifiers to anon, authenticated;

INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES (
  '255_visitor_site_public_menu.sql',
  'claude-code',
  'Mirror of shishka.health visitor-site schema applied directly in Supabase (MC a22a5362): nomenclature.customer_ingredients, site_content table (+RLS/grants/seed), menu_public view (security_invoker, no cost), menu_modifiers view (intentional security_definer). Objects already live in prod; recorded for reproducibility.'
) on conflict (filename) do nothing;

commit;
