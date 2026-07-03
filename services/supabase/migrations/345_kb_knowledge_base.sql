-- 345_kb_knowledge_base.sql
-- Knowledge Base ("Handbook") — Confluence-style page tree for staff.
-- MC: employee handbook / process instructions surface in the admin panel.
--
-- WHY THIS EXISTS: staff need one clear, fast place to read how the company
-- works — company principles & rules, how to use the admin panel, and kitchen
-- process SOPs. Recipes/assembly already live in /menu + /kitchen/recipes; this
-- is the *narrative* knowledge base (tree of pages, internal links, trilingual).
--
-- MODEL:
--   • kb_pages             — tree nodes (page = node; top-level node = "space").
--   • kb_page_translations — one row per (page, lang) in en / th / my.
--   • staff_tasks.kb_page_id — optional deep-link from a task to a handbook page.
--   • kb-images bucket     — owner-uploaded images embedded in page markdown.
--
-- SECURITY:
--   • READ  — any authenticated staff (content is instructional, non-sensitive;
--             min_role only gates UI tree/sidebar visibility, NOT the DB row —
--             so do NOT store finance/secret data here).
--   • WRITE — owner only (fn_is_owner), same guard as staff/expense writes.
-- Additive + idempotent.

BEGIN;

-- ─── 1. kb_pages (tree) ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.kb_pages (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id           uuid REFERENCES public.kb_pages(id) ON DELETE CASCADE,
  slug                text NOT NULL UNIQUE,
  icon                text,                       -- optional lucide icon name
  sort_order          int  NOT NULL DEFAULT 0,    -- order among siblings
  min_role            text NOT NULL DEFAULT 'cook'
                        CHECK (min_role IN ('owner','task_manager','cook')),
  is_published        boolean NOT NULL DEFAULT true,
  redirect_to_page_id uuid REFERENCES public.kb_pages(id) ON DELETE SET NULL,
  cover_image_url     text,
  created_by          text,
  updated_by          text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.kb_pages IS
  'Knowledge-base ("Handbook") page tree. Top-level rows (parent_id NULL) are spaces. Content lives in kb_page_translations. Read: authenticated; write: owner only.';

CREATE INDEX IF NOT EXISTS idx_kb_pages_parent ON public.kb_pages(parent_id, sort_order);

-- ─── 2. kb_page_translations (en / th / my) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.kb_page_translations (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id    uuid NOT NULL REFERENCES public.kb_pages(id) ON DELETE CASCADE,
  lang       text NOT NULL CHECK (lang IN ('en','th','my')),
  title      text NOT NULL,
  body_md    text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (page_id, lang)
);

COMMENT ON TABLE public.kb_page_translations IS
  'Per-language content for a kb_pages row. English (en) is the canonical storage language; th/my are drafted via kb-translate edge fn and hand-corrected by the owner. Missing translation → UI falls back to en.';

CREATE INDEX IF NOT EXISTS idx_kb_translations_page ON public.kb_page_translations(page_id, lang);

-- ─── 3. staff_tasks deep-link → handbook page ───────────────────────────────
ALTER TABLE public.staff_tasks
  ADD COLUMN IF NOT EXISTS kb_page_id uuid REFERENCES public.kb_pages(id) ON DELETE SET NULL;

-- ─── 4. updated_at triggers (reuse shared fn_set_updated_at) ─────────────────
DROP TRIGGER IF EXISTS trg_kb_pages_updated_at ON public.kb_pages;
CREATE TRIGGER trg_kb_pages_updated_at
  BEFORE UPDATE ON public.kb_pages
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

DROP TRIGGER IF EXISTS trg_kb_translations_updated_at ON public.kb_page_translations;
CREATE TRIGGER trg_kb_translations_updated_at
  BEFORE UPDATE ON public.kb_page_translations
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

-- ─── 5. Grants + RLS ────────────────────────────────────────────────────────
-- Read for every authenticated staff member; write gated to owner by RLS.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kb_pages             TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kb_page_translations TO authenticated;

ALTER TABLE public.kb_pages             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kb_page_translations ENABLE ROW LEVEL SECURITY;

-- kb_pages: authenticated read, owner-only write
DROP POLICY IF EXISTS kb_pages_select ON public.kb_pages;
CREATE POLICY kb_pages_select ON public.kb_pages
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS kb_pages_write ON public.kb_pages;
CREATE POLICY kb_pages_write ON public.kb_pages
  FOR ALL USING (public.fn_is_owner()) WITH CHECK (public.fn_is_owner());

-- kb_page_translations: authenticated read, owner-only write
DROP POLICY IF EXISTS kb_translations_select ON public.kb_page_translations;
CREATE POLICY kb_translations_select ON public.kb_page_translations
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS kb_translations_write ON public.kb_page_translations;
CREATE POLICY kb_translations_write ON public.kb_page_translations
  FOR ALL USING (public.fn_is_owner()) WITH CHECK (public.fn_is_owner());

-- ─── 6. kb-images storage bucket (public read, owner write) ──────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('kb-images', 'kb-images', true, 8388608,
        ARRAY['image/jpeg','image/png','image/webp','image/gif'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS kb_images_select ON storage.objects;
CREATE POLICY kb_images_select ON storage.objects
  FOR SELECT USING (bucket_id = 'kb-images');

DROP POLICY IF EXISTS kb_images_insert ON storage.objects;
CREATE POLICY kb_images_insert ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'kb-images' AND public.fn_is_owner());

DROP POLICY IF EXISTS kb_images_update ON storage.objects;
CREATE POLICY kb_images_update ON storage.objects
  FOR UPDATE USING (bucket_id = 'kb-images' AND public.fn_is_owner());

DROP POLICY IF EXISTS kb_images_delete ON storage.objects;
CREATE POLICY kb_images_delete ON storage.objects
  FOR DELETE USING (bucket_id = 'kb-images' AND public.fn_is_owner());

-- ─── 7. Seed a starter tree (English only; th/my added later by owner) ───────
-- Spaces (top-level). No hardcoded UUIDs — children resolve parent via slug.
INSERT INTO public.kb_pages (slug, icon, sort_order, min_role, created_by)
VALUES
  ('company',           'Building2',         10, 'cook', 'claude-code'),
  ('admin-panel',       'MonitorSmartphone', 20, 'cook', 'claude-code'),
  ('kitchen-processes', 'ChefHat',           30, 'cook', 'claude-code')
ON CONFLICT (slug) DO NOTHING;

-- Child pages.
INSERT INTO public.kb_pages (parent_id, slug, sort_order, min_role, created_by)
SELECT p.id, x.slug, x.sort_order, 'cook', 'claude-code'
FROM (VALUES
  ('company',           'about-shishka',        10),
  ('company',           'principles-and-rules', 20),
  ('company',           'kitchen-philosophy',   30),
  ('admin-panel',       'login-with-pin',       10),
  ('admin-panel',       'reading-your-tasks',   20),
  ('admin-panel',       'printing-labels',      30),
  ('admin-panel',       'reading-recipes',      40),
  ('kitchen-processes', 'opening-checklist',    10),
  ('kitchen-processes', 'closing-checklist',    20),
  ('kitchen-processes', 'fridge-cleaning',      30),
  ('kitchen-processes', 'receiving-deliveries', 40),
  ('kitchen-processes', 'food-safety-haccp',    50)
) AS x(parent_slug, slug, sort_order)
JOIN public.kb_pages p ON p.slug = x.parent_slug
ON CONFLICT (slug) DO NOTHING;

-- English content.
INSERT INTO public.kb_page_translations (page_id, lang, title, body_md)
SELECT pg.id, 'en', t.title, t.body_md
FROM (VALUES
  ('company', 'Company',
$md$Welcome to the **Shishka** team handbook. Everything you need to know about our
company, our values, and how we work lives here.

Start with our [Principles & Rules](/handbook/principles-and-rules), then read the
[Kitchen Philosophy](/handbook/kitchen-philosophy).$md$),

  ('about-shishka', 'About Shishka',
$md$## Who we are
Shishka Healthy Kitchen is a healthy-food kitchen in Phuket. We cook real,
fresh food — no shortcuts, no cheap fillers.

## Our mission
Make delicious healthy food that people can eat every day and feel good about.

## What matters here
- Fresh, honest ingredients
- Clean stations and safe food
- Respect for each other and for our guests$md$),

  ('principles-and-rules', 'Our Principles & Rules',
$md$These are the rules everyone on the team follows.

1. **Food safety first.** Wash hands, check temperatures, respect shelf-life dates.
2. **Clean as you go.** A clean station is a fast station.
3. **Be honest.** If something is wrong, tell your manager — mistakes are fine, hiding them is not.
4. **Be on time.** The team depends on every shift starting ready.
5. **Follow the recipe.** Weigh, don't guess. Consistency is our promise to guests.
6. **Respect.** Speak kindly to teammates and guests.

See also: [Food Safety / HACCP Basics](/handbook/food-safety-haccp).$md$),

  ('kitchen-philosophy', 'Kitchen Philosophy',
$md$## Real food, done right
We cook with real ingredients and honest technique. We do not use cheap refined
seed oils or artificial shortcuts.

## Taste and health together
Healthy does not mean boring. Season well, cook with care, and plate with pride.

## Consistency
Every dish should taste the same great way, every time. That is what recipes and
weighing are for.$md$),

  ('admin-panel', 'Using the Admin Panel',
$md$How to use the Shishka admin panel from your phone or the shop tablet.

- [Login with your PIN](/handbook/login-with-pin)
- [Reading your Tasks](/handbook/reading-your-tasks)
- [Printing Labels](/handbook/printing-labels)
- [Reading Recipes](/handbook/reading-recipes)$md$),

  ('login-with-pin', 'Login with your PIN',
$md$1. Open the admin panel link on your phone or the shop tablet.
2. Choose **Staff** login.
3. Type your **name** and your **PIN**.
4. Tap **Sign in**.

Forgot your PIN? Ask the owner to reset it for you.$md$),

  ('reading-your-tasks', 'Reading your Tasks',
$md$1. Open **Tasks** in the sidebar.
2. Your tasks are grouped by time of day (morning / day / evening).
3. Tap a task to see the full instructions.
4. When you finish, mark it **Done**. You can attach a photo of the finished work.
5. Some tasks have a **📖 Instructions** button — tap it to read the process page here in the handbook.$md$),

  ('printing-labels', 'Printing Labels',
$md$1. Open **Labels** in the sidebar.
2. Pick the prep item you made.
3. Check the name and date, then print.
4. Stick the label on the container so everyone knows what it is and when it was made.$md$),

  ('reading-recipes', 'Reading Recipes',
$md$1. Open **Recipes** in the sidebar.
2. Recipes are grouped by station (L1 prep kitchen, L2 assembly).
3. Tap a dish to see the steps, weights, and equipment.
4. Follow the steps in order. Weigh ingredients — do not guess.$md$),

  ('kitchen-processes', 'Kitchen Processes',
$md$Standard operating procedures for daily kitchen work. Read these until you know
them by heart.

- [Opening Checklist](/handbook/opening-checklist)
- [Closing Checklist](/handbook/closing-checklist)
- [Fridge Cleaning](/handbook/fridge-cleaning)
- [Receiving Deliveries](/handbook/receiving-deliveries)
- [Food Safety / HACCP Basics](/handbook/food-safety-haccp)$md$),

  ('opening-checklist', 'Opening Checklist',
$md$Do these every morning before service.

- [ ] Wash hands and put on a clean apron
- [ ] Check fridge and freezer temperatures, log them
- [ ] Check prep list and today's tasks
- [ ] Sanitize work surfaces
- [ ] Confirm you have enough prepped items for the day$md$),

  ('closing-checklist', 'Closing Checklist',
$md$Do these every night before you leave.

- [ ] Label and store all open items (name + date)
- [ ] Wipe and sanitize all surfaces
- [ ] Empty and clean bins, take out the trash
- [ ] Check fridge temperatures one more time
- [ ] Turn off equipment that should be off$md$),

  ('fridge-cleaning', 'Fridge Cleaning',
$md$## Weekly deep clean
1. Move stock to the backup fridge or a cool box.
2. Remove shelves and wash them with hot soapy water.
3. Wipe the inside with sanitizer, top to bottom.
4. Dry and refit shelves.
5. Return stock, checking dates — discard anything past its shelf life.

Always keep raw and ready-to-eat foods on separate shelves.$md$),

  ('receiving-deliveries', 'Receiving Deliveries',
$md$1. Check the delivery against the order — right items, right quantities.
2. Check temperatures of chilled and frozen goods on arrival.
3. Reject anything damaged, spoiled, or above safe temperature.
4. Record the delivery for the finance team (photo of the invoice).
5. Store immediately — frozen first, then chilled, then dry goods.$md$),

  ('food-safety-haccp', 'Food Safety / HACCP Basics',
$md$## The basics that keep our guests safe
- **Wash hands** often — after touching raw food, bins, or your face.
- **Keep cold food cold** (below 5°C) and **hot food hot** (above 60°C).
- **Avoid cross-contamination** — separate boards and knives for raw and ready-to-eat.
- **Respect shelf life** — label everything with a date, discard when expired.
- **Cook to safe temperatures** — check with a probe when in doubt.

If you are ever unsure whether food is safe, ask your manager. When in doubt, throw it out.$md$)
) AS t(slug, title, body_md)
JOIN public.kb_pages pg ON pg.slug = t.slug
ON CONFLICT (page_id, lang) DO NOTHING;

-- ─── 8. Ledger ──────────────────────────────────────────────────────────────
INSERT INTO public.migration_log (filename, applied_by, notes)
VALUES ('345_kb_knowledge_base.sql', 'claude-code',
  'Knowledge base (Handbook): kb_pages tree + kb_page_translations (en/th/my) + staff_tasks.kb_page_id deep-link + kb-images bucket. RLS: authenticated read, owner-only write (fn_is_owner). Seeded starter tree (Company / Using the Admin Panel / Kitchen Processes) in English.')
ON CONFLICT (filename) DO NOTHING;

COMMIT;
