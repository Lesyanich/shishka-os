-- Migration 011: Dynamic Production Order Generator
-- Goal: Automate task generation with scaled BOM weights.

CREATE OR REPLACE FUNCTION public.fn_generate_production_order(p_plan_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_target_qty NUMERIC;
    v_prod_code TEXT;
    v_ingredient_summary TEXT := '';
    v_ing RECORD;
    v_task_count INTEGER := 0;
BEGIN
    -- 1. Fetch Plan Details
    SELECT target_quantity, product_code INTO v_target_qty, v_prod_code 
    FROM public.daily_plan WHERE id = p_plan_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'PLAN_NOT_FOUND');
    END IF;

    -- 2. Calculate Ingredient List
    FOR v_ing IN 
        SELECT n.name, (v_target_qty * bom.quantity_per_unit) as scaled_qty, COALESCE(n.base_unit, 'qty') as unit
        FROM public.bom_structures bom
        JOIN public.nomenclature n ON bom.ingredient_id = n.id
        WHERE bom.parent_id = (SELECT id FROM public.nomenclature WHERE product_code = v_prod_code)
    LOOP
        v_ingredient_summary := v_ingredient_summary || v_ing.name || ': ' || ROUND(v_ing.scaled_qty, 2) || ' ' || v_ing.unit || E'\n';
    END LOOP;

    -- 3. Ingest Production Tasks from recipes_flow
    INSERT INTO public.production_tasks (
        plan_id, 
        flow_step_id, 
        equipment_id, 
        status, 
        capacity_used, 
        expected_duration_min, 
        description
    )
    SELECT 
        p_plan_id,
        rf.id,
        rf.equipment_id,
        'pending',
        rf.requires_capacity,
        rf.expected_duration_min,
        CASE 
            WHEN rf.step_order = 1 THEN 'PREP LIST:' || E'\n' || v_ingredient_summary || E'\n' || rf.instruction_text
            ELSE rf.instruction_text
        END
    FROM public.recipes_flow rf
    WHERE rf.product_code = v_prod_code
    ORDER BY rf.step_order;

    GET DIAGNOSTICS v_task_count = ROW_COUNT;

    RETURN jsonb_build_object(
        'success', true, 
        'plan_id', p_plan_id, 
        'tasks_generated', v_task_count,
        'ingredients', v_ingredient_summary
    );
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.fn_generate_production_order(UUID) IS 'Generates production tasks for a plan, scaling BOM ingredients dynamically.';
