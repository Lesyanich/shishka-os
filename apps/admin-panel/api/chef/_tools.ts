// Chef Agent read-only tools (P1.4).
// Factory function creates tools bound to a user JWT for RLS-safe queries.
// Files prefixed with `_` are not exposed as Vercel routes.

import { tool } from 'ai'
import { z } from 'zod'
import { supabaseForUser } from '../_lib/supabase.js'
import type { SupabaseClient } from '@supabase/supabase-js'

// ─── Public factory ─────────────────────────────────────────

export function createChefTools(jwt: string) {
  const supa = supabaseForUser(jwt)

  return {
    list_active_dishes: listActiveDishes(supa),
    search_nomenclature: searchNomenclature(supa),
    calculate_margin: calculateMargin(supa),
    get_bom_tree: getBomTree(supa),
    get_dish_detail: getDishDetail(supa),
    list_missing_bom: listMissingBom(supa),
    get_nutrition: getNutrition(supa),
  }
}

// ─── Tool implementations ───────────────────────────────────

function listActiveDishes(supa: SupabaseClient) {
  return tool({
    description:
      'List all active SALE dishes on the menu with name, price, cost, food cost %, and availability. Use when the user asks "what dishes do we have" or "what\'s on the menu".',
    inputSchema: z.object({
      available_only: z
        .boolean()
        .optional()
        .default(true)
        .describe('If true, only show dishes where is_available=true'),
    }),
    execute: async ({ available_only }) => {
      let query = supa
        .from('nomenclature')
        .select('id, name, product_code, price, cost_per_unit, is_available, is_featured, category_id, product_categories!category_id(name)')
        .eq('type', 'dish')
        .ilike('product_code', 'SALE-%')
        .eq('is_deleted', false)
        .order('name')

      if (available_only) query = query.eq('is_available', true)

      const { data, error } = await query

      if (error) return { error: error.message }

      const dishes = (data ?? []).map((d) => {
        const price = Number(d.price ?? 0)
        const cost = Number(d.cost_per_unit ?? 0)
        const foodCostPct = price > 0 ? Math.round((cost / price) * 100) : null
        const categoryName = (d.product_categories as unknown as { name: string } | null)?.name ?? null
        return {
          id: d.id,
          name: d.name,
          product_code: d.product_code,
          category: categoryName,
          price,
          cost,
          food_cost_pct: foodCostPct,
          margin: price > 0 ? price - cost : null,
          is_available: d.is_available,
          is_featured: d.is_featured,
        }
      })

      return { count: dishes.length, dishes }
    },
  })
}

function searchNomenclature(supa: SupabaseClient) {
  return tool({
    description:
      'Search nomenclature (ingredients, semi-finished products, dishes) by name or product code. Fuzzy partial match. Use when the user asks "find X", "do we have X?", or references a specific ingredient/dish.',
    inputSchema: z.object({
      query: z.string().describe('Search term — name or product code fragment'),
      types: z
        .array(z.enum(['dish', 'semi', 'modifier', 'raw']))
        .optional()
        .describe('Filter by type(s). Omit to search all types.'),
      limit: z.number().optional().default(20).describe('Max results'),
    }),
    execute: async ({ query, types, limit }) => {
      let q = supa
        .from('nomenclature')
        .select('id, name, product_code, type, base_unit, cost_per_unit, price, is_available, is_deleted')
        .eq('is_deleted', false)
        .or(`name.ilike.%${query}%,product_code.ilike.%${query}%`)
        .order('name')
        .limit(limit)

      if (types && types.length > 0) {
        q = q.in('type', types)
      }

      const { data, error } = await q

      if (error) return { error: error.message }

      return {
        count: (data ?? []).length,
        items: (data ?? []).map((r) => ({
          id: r.id,
          name: r.name,
          product_code: r.product_code,
          type: r.type,
          base_unit: r.base_unit,
          cost_per_unit: Number(r.cost_per_unit ?? 0),
          price: r.price ? Number(r.price) : null,
          is_available: r.is_available,
        })),
      }
    },
  })
}

function calculateMargin(supa: SupabaseClient) {
  return tool({
    description:
      'Calculate price, cost, margin, and food cost % for a specific product. Use when the user asks "what\'s the margin on X?" or "how much does X cost?".',
    inputSchema: z.object({
      product_id: z.string().uuid().optional().describe('Nomenclature UUID'),
      product_code: z.string().optional().describe('Product code (e.g. SALE-BORSCH_BIOACTIVE)'),
    }),
    execute: async ({ product_id, product_code }) => {
      let query = supa
        .from('nomenclature')
        .select('id, name, product_code, type, price, cost_per_unit')

      if (product_id) query = query.eq('id', product_id)
      else if (product_code) query = query.eq('product_code', product_code)
      else return { error: 'Provide either product_id or product_code' }

      const { data, error } = await query.maybeSingle()

      if (error) return { error: error.message }
      if (!data) return { error: 'Product not found' }

      const price = Number(data.price ?? 0)
      const cost = Number(data.cost_per_unit ?? 0)
      const margin = price - cost
      const foodCostPct = price > 0 ? (cost / price) * 100 : null
      const marginPct = price > 0 ? (margin / price) * 100 : null

      return {
        id: data.id,
        name: data.name,
        product_code: data.product_code,
        type: data.type,
        price_thb: price,
        cost_thb: cost,
        margin_thb: margin,
        food_cost_pct: foodCostPct !== null ? Math.round(foodCostPct * 10) / 10 : null,
        margin_pct: marginPct !== null ? Math.round(marginPct * 10) / 10 : null,
        assessment:
          foodCostPct === null
            ? 'no price set'
            : foodCostPct < 25
              ? 'excellent margin'
              : foodCostPct <= 35
                ? 'healthy margin'
                : foodCostPct <= 45
                  ? 'tight margin — consider optimization'
                  : 'margin too thin — needs attention',
      }
    },
  })
}

function getBomTree(supa: SupabaseClient) {
  return tool({
    description:
      'Get the recursive BOM (Bill of Materials) tree for a product — all ingredients with required quantities, going through semi-finished products down to raw materials. Uses fn_explode_bom.',
    inputSchema: z.object({
      product_id: z.string().uuid().describe('Nomenclature UUID'),
      quantity: z.number().optional().default(1).describe('Number of units to explode (default 1)'),
    }),
    execute: async ({ product_id, quantity }) => {
      const { data, error } = await supa.rpc('fn_explode_bom', {
        p_nomenclature_id: product_id,
        p_quantity: quantity,
      })

      if (error) return { error: error.message }

      return {
        count: (data ?? []).length,
        tree: (data ?? []).map((r: Record<string, unknown>) => ({
          nomenclature_id: r.nomenclature_id,
          product_code: r.product_code,
          name: r.name,
          type: r.type,
          required_qty: Number(r.required_qty ?? 0),
          storage_type: r.storage_type,
          defrost_hours: r.defrost_hours,
          depth: r.depth,
        })),
      }
    },
  })
}

function getDishDetail(supa: SupabaseClient) {
  return tool({
    description:
      'Get full detail on a dish or product: direct BOM ingredients (with costs), recipe process steps, and nutrition. Use for "tell me about X" or "full info on X".',
    inputSchema: z.object({
      product_id: z.string().uuid().optional().describe('Nomenclature UUID'),
      product_code: z.string().optional().describe('Product code'),
    }),
    execute: async ({ product_id, product_code }) => {
      // Resolve product
      let pQuery = supa.from('nomenclature').select('id, name, product_code, type, price, cost_per_unit, is_available, is_featured, calories, protein, carbs, fat, category_id, product_categories!category_id(name)')
      if (product_id) pQuery = pQuery.eq('id', product_id)
      else if (product_code) pQuery = pQuery.eq('product_code', product_code)
      else return { error: 'Provide either product_id or product_code' }

      const { data: product, error: pErr } = await pQuery.maybeSingle()
      if (pErr) return { error: pErr.message }
      if (!product) return { error: 'Product not found' }

      const pid = product.id as string

      // Direct BOM
      const { data: bomRows } = await supa
        .from('bom_structures')
        .select('id, ingredient_id, quantity_per_unit, yield_loss_pct, notes')
        .eq('parent_id', pid)
        .order('created_at')

      let ingredients: Array<Record<string, unknown>> = []
      if (bomRows && bomRows.length > 0) {
        const ingredientIds = bomRows.map((r) => r.ingredient_id as string)
        const { data: ingRows } = await supa
          .from('nomenclature')
          .select('id, name, product_code, type, base_unit, cost_per_unit')
          .in('id', ingredientIds)

        const ingMap = new Map((ingRows ?? []).map((r) => [r.id as string, r]))

        ingredients = bomRows.map((b) => {
          const ing = ingMap.get(b.ingredient_id as string)
          const qty = Number(b.quantity_per_unit ?? 0)
          const cost = Number(ing?.cost_per_unit ?? 0)
          return {
            ingredient_id: b.ingredient_id,
            name: ing?.name ?? 'unknown',
            product_code: ing?.product_code ?? '',
            type: ing?.type ?? '',
            base_unit: ing?.base_unit ?? '',
            quantity_per_unit: qty,
            yield_loss_pct: b.yield_loss_pct ? Number(b.yield_loss_pct) : null,
            cost_per_unit: cost,
            cost_contribution: qty * cost,
            notes: b.notes,
          }
        })
      }

      // Recipe process steps
      const { data: steps } = await supa
        .from('recipes_flow')
        .select('step_order, operation_name, instruction_text, duration_min, equipment(name), temperature_c, internal_temp_c, is_passive, notes')
        .eq('nomenclature_id', pid)
        .order('step_order')

      const processSteps = (steps ?? []).map((s) => ({
        step: s.step_order,
        operation: s.operation_name,
        instruction: s.instruction_text,
        duration_min: s.duration_min,
        equipment: (s.equipment as unknown as { name: string } | null)?.name ?? null,
        temperature_c: s.temperature_c,
        internal_temp_c: s.internal_temp_c,
        is_passive: s.is_passive,
        notes: s.notes,
      }))

      const price = Number(product.price ?? 0)
      const cost = Number(product.cost_per_unit ?? 0)
      const categoryName = (product.product_categories as unknown as { name: string } | null)?.name ?? null

      return {
        product: {
          id: pid,
          name: product.name,
          product_code: product.product_code,
          type: product.type,
          category: categoryName,
          price_thb: price,
          cost_thb: cost,
          food_cost_pct: price > 0 ? Math.round((cost / price) * 1000) / 10 : null,
          margin_thb: price - cost,
          is_available: product.is_available,
          is_featured: product.is_featured,
        },
        nutrition: {
          calories: product.calories ? Number(product.calories) : null,
          protein: product.protein ? Number(product.protein) : null,
          carbs: product.carbs ? Number(product.carbs) : null,
          fat: product.fat ? Number(product.fat) : null,
        },
        bom: {
          count: ingredients.length,
          total_cost: ingredients.reduce((s, i) => s + (i.cost_contribution as number), 0),
          ingredients,
        },
        process: {
          step_count: processSteps.length,
          total_duration_min: processSteps.reduce((s, st) => s + (st.duration_min ?? 0), 0),
          steps: processSteps,
        },
      }
    },
  })
}

function listMissingBom(supa: SupabaseClient) {
  return tool({
    description:
      'List SALE dishes that have no BOM (no ingredients defined). Use when the user asks "which dishes need BOM?" or "what\'s missing?".',
    inputSchema: z.object({}),
    execute: async () => {
      // Get all active SALE items
      const { data: sales, error: sErr } = await supa
        .from('nomenclature')
        .select('id, name, product_code, price')
        .eq('type', 'dish')
        .ilike('product_code', 'SALE-%')
        .eq('is_deleted', false)
        .order('name')

      if (sErr) return { error: sErr.message }
      if (!sales || sales.length === 0) return { count: 0, missing: [] }

      // Check which have BOM
      const saleIds = sales.map((s) => s.id as string)
      const { data: bomData } = await supa
        .from('bom_structures')
        .select('parent_id')
        .in('parent_id', saleIds)

      const withBom = new Set((bomData ?? []).map((r) => r.parent_id as string))

      const missing = sales
        .filter((s) => !withBom.has(s.id as string))
        .map((s) => ({
          id: s.id,
          name: s.name,
          product_code: s.product_code,
          price: s.price ? Number(s.price) : null,
        }))

      return {
        total_sale_items: sales.length,
        with_bom: withBom.size,
        missing_count: missing.length,
        missing,
      }
    },
  })
}

function getNutrition(supa: SupabaseClient) {
  return tool({
    description:
      'Get nutrition info (calories, protein, carbs, fat) for a product. Use when the user asks "how many calories in X?" or "KBJU for X".',
    inputSchema: z.object({
      product_id: z.string().uuid().optional().describe('Nomenclature UUID'),
      product_code: z.string().optional().describe('Product code'),
    }),
    execute: async ({ product_id, product_code }) => {
      let query = supa.from('nomenclature').select('id, name, product_code, calories, protein, carbs, fat')
      if (product_id) query = query.eq('id', product_id)
      else if (product_code) query = query.eq('product_code', product_code)
      else return { error: 'Provide either product_id or product_code' }

      const { data, error } = await query.maybeSingle()
      if (error) return { error: error.message }
      if (!data) return { error: 'Product not found' }

      const cal = data.calories ? Number(data.calories) : null
      const prot = data.protein ? Number(data.protein) : null
      const carb = data.carbs ? Number(data.carbs) : null
      const fat = data.fat ? Number(data.fat) : null

      return {
        id: data.id,
        name: data.name,
        product_code: data.product_code,
        nutrition: {
          calories: cal,
          protein_g: prot,
          carbs_g: carb,
          fat_g: fat,
          has_data: cal !== null || prot !== null || carb !== null || fat !== null,
        },
      }
    },
  })
}
