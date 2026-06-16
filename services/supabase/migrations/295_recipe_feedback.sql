-- 295_recipe_feedback.sql
-- Staff recipe feedback: comments on dish/PF cards visible in /kitchen/recipes.
-- Staff leave text notes; owner reads and decides whether to update the recipe.
--
-- RLS: any authenticated session can read/write (access is controlled at the
--      application layer via RoleGuard — cook+ can reach /kitchen/recipes).

BEGIN;

CREATE TABLE IF NOT EXISTS public.recipe_feedback (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  dish_id    UUID        NOT NULL REFERENCES public.nomenclature(id) ON DELETE CASCADE,
  staff_id   UUID        REFERENCES public.staff(id) ON DELETE SET NULL,
  staff_name TEXT        NOT NULL DEFAULT '',
  body       TEXT        NOT NULL
             CHECK (char_length(body) BETWEEN 1 AND 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS recipe_feedback_dish_id_idx
  ON public.recipe_feedback(dish_id);

ALTER TABLE public.recipe_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS recipe_feedback_read ON public.recipe_feedback;
CREATE POLICY recipe_feedback_read ON public.recipe_feedback
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS recipe_feedback_write ON public.recipe_feedback;
CREATE POLICY recipe_feedback_write ON public.recipe_feedback
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- Reuse the existing updated_at trigger function (created in earlier migrations).
CREATE TRIGGER set_recipe_feedback_updated_at
  BEFORE UPDATE ON public.recipe_feedback
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

INSERT INTO public.migration_log (filename, description)
VALUES (
  '295_recipe_feedback.sql',
  'Staff recipe feedback table — text comments on dish/PF cards in /kitchen/recipes'
);

COMMIT;
