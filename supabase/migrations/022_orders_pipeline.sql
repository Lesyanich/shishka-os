-- ============================================================
-- Migration 022: Orders Pipeline & Webhook Receiver
-- Phase 5.1: Orders → KDS auto-dispatch via BOM explosion
-- ============================================================

-- ─── 1. ENUMs ────────────────────────────────────────────────

DO $$ BEGIN
    CREATE TYPE public.order_source AS ENUM ('website', 'syrve', 'manual');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE public.order_status AS ENUM ('new', 'preparing', 'ready', 'delivered', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── 2. Orders Table ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.orders (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source          public.order_source NOT NULL DEFAULT 'manual',
    status          public.order_status NOT NULL DEFAULT 'new',
    customer_name   TEXT,
    customer_phone  TEXT,
    total_amount    NUMERIC NOT NULL DEFAULT 0,
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.orders IS 'Customer orders from website, POS (Syrve), or manual entry';

CREATE INDEX IF NOT EXISTS idx_orders_status     ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at DESC);

-- ─── 3. Order Items Table ────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.order_items (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id          UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    nomenclature_id   UUID NOT NULL REFERENCES public.nomenclature(id) ON DELETE RESTRICT,
    quantity          INTEGER NOT NULL CHECK (quantity > 0),
    price_at_purchase NUMERIC NOT NULL DEFAULT 0,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.order_items IS 'Line items per order — price_at_purchase = snapshot of price at order time';

CREATE INDEX IF NOT EXISTS idx_order_items_order ON public.order_items(order_id);

-- ─── 4. Link production_tasks → orders ───────────────────────

ALTER TABLE public.production_tasks
    ADD COLUMN IF NOT EXISTS order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pt_order_id ON public.production_tasks(order_id)
    WHERE order_id IS NOT NULL;

-- ─── 5. Updated_at trigger for orders ────────────────────────

DROP TRIGGER IF EXISTS trg_orders_updated_at ON public.orders;

CREATE TRIGGER trg_orders_updated_at
    BEFORE UPDATE ON public.orders
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_set_updated_at();

-- ─── 6. RPC: fn_process_new_order ────────────────────────────
-- Explodes SALE-items BOM into production_tasks for KDS.
-- Graceful: if this fails, order stays 'new' and can be processed manually.

CREATE OR REPLACE FUNCTION public.fn_process_new_order(p_order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_item       RECORD;
    v_bom        RECORD;
    v_tasks_created INTEGER := 0;
BEGIN
    -- Loop through each SALE-item in the order
    FOR v_item IN
        SELECT oi.id AS item_id,
               oi.nomenclature_id,
               oi.quantity,
               n.product_code,
               n.name AS dish_name
        FROM public.order_items oi
        JOIN public.nomenclature n ON n.id = oi.nomenclature_id
        WHERE oi.order_id = p_order_id
          AND n.product_code ILIKE 'SALE-%'
    LOOP
        -- For each unit ordered, create production tasks from BOM
        FOR v_bom IN
            SELECT bs.ingredient_id,
                   bs.quantity_per_unit,
                   ing.product_code AS ingredient_code,
                   ing.name AS ingredient_name
            FROM public.bom_structures bs
            JOIN public.nomenclature ing ON ing.id = bs.ingredient_id
            WHERE bs.parent_id = v_item.nomenclature_id
        LOOP
            INSERT INTO public.production_tasks (
                description,
                status,
                order_id
            ) VALUES (
                v_item.dish_name
                    || ' x' || v_item.quantity
                    || ' [' || v_bom.ingredient_code || ': '
                    || v_bom.ingredient_name || ']',
                'pending',
                p_order_id
            );
            v_tasks_created := v_tasks_created + 1;
        END LOOP;
    END LOOP;

    -- Update order status to 'preparing' if tasks were created
    IF v_tasks_created > 0 THEN
        UPDATE public.orders
        SET status = 'preparing'
        WHERE id = p_order_id AND status = 'new';
    END IF;

    RETURN jsonb_build_object(
        'ok', true,
        'tasks_created', v_tasks_created
    );

EXCEPTION WHEN OTHERS THEN
    -- Graceful degradation: order stays 'new', return error info
    RETURN jsonb_build_object(
        'ok', false,
        'error', SQLERRM,
        'tasks_created', 0
    );
END;
$$;

COMMENT ON FUNCTION public.fn_process_new_order(UUID)
IS 'Explodes order SALE-items via BOM into production_tasks for KDS. Graceful: order stays new on failure.';

-- ─── 7. RLS Policies ────────────────────────────────────────

ALTER TABLE public.orders      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

-- Orders: full access for authenticated
DO $$ BEGIN
    CREATE POLICY "orders_select" ON public.orders FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE POLICY "orders_insert" ON public.orders FOR INSERT TO authenticated WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE POLICY "orders_update" ON public.orders FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Order Items: full access for authenticated
DO $$ BEGIN
    CREATE POLICY "order_items_select" ON public.order_items FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE POLICY "order_items_insert" ON public.order_items FOR INSERT TO authenticated WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── 8. Realtime ─────────────────────────────────────────────

DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.order_items;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
