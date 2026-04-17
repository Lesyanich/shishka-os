// Chef Agent write tools (P1.5).
// Each tool has a `confirmed` boolean parameter:
//   - false (default): returns a PROPOSAL describing what would change. No DB writes.
//   - true: executes the write. Agent must only set this after user explicitly confirms.
//
// System prompt enforces: "describe change → ask user → re-call with confirmed=true".
// Files prefixed with `_` are not exposed as Vercel routes.

import { tool } from 'ai'
import { z } from 'zod'
import { supabaseForUser } from '../_lib/supabase.js'
import type { SupabaseClient } from '@supabase/supabase-js'

export function createChefWriteTools(jwt: string) {
  const supa = supabaseForUser(jwt)

  return {
    create_dish: createDish(supa),
    update_dish_price: updateDishPrice(supa),
    add_bom_ingredient: addBomIngredient(supa),
    update_bom_quantity: updateBomQuantity(supa),
    remove_bom_ingredient: removeBomIngredient(supa),
  }
}

// ─── Helpers ────────────────────────────────────────────────

function proposal(description: string, details: Record<string, unknown>) {
  return {
    status: 'proposal' as const,
    description,
    details,
    message: 'This is a preview. Ask the user to confirm before executing.',
  }
}

function success(description: string, details: Record<string, unknown>) {
  return { status: 'executed' as const, description, details }
}

// ─── Tools ──────────────────────────────────────────────────

function createDish(supa: SupabaseClient) {
  return tool({
    description:
      'Create a new SALE dish in the menu. When confirmed=false (default), returns a proposal. When confirmed=true, inserts the dish into nomenclature. ALWAYS call with confirmed=false first, show the proposal to the user, and only call again with confirmed=true after they approve.',
    inputSchema: z.object({
      name: z.string().describe('Dish name (e.g. "Poke Salmon Avocado")'),
      product_code: z.string().describe('Product code (e.g. "SALE-POKE_SALMON_AVOCADO"). Must be unique.'),
      category_id: z.string().uuid().optional().describe('Category UUID. Omit if unknown.'),
      price: z.number().optional().describe('Selling price in THB'),
      confirmed: z.boolean().default(false).describe('Set to true ONLY after user explicitly confirms the proposal'),
    }),
    execute: async ({ name, product_code, category_id, price, confirmed }) => {
      const code = product_code.trim().toUpperCase()

      // Check uniqueness
      const { data: existing } = await supa
        .from('nomenclature')
        .select('id')
        .eq('product_code', code)
        .maybeSingle()

      if (existing) {
        return { status: 'error' as const, error: `Product code ${code} already exists` }
      }

      if (!confirmed) {
        return proposal(`Create dish "${name}" (${code})`, {
          name,
          product_code: code,
          type: 'dish',
          base_unit: 'portion',
          category_id: category_id ?? null,
          price: price ?? null,
          is_available: true,
        })
      }

      // Execute
      const payload: Record<string, unknown> = {
        name: name.trim(),
        product_code: code,
        type: 'dish',
        base_unit: 'portion',
        is_available: true,
        is_featured: false,
      }
      if (category_id) payload.category_id = category_id
      if (price != null && price > 0) payload.price = price

      const { data, error } = await supa
        .from('nomenclature')
        .insert(payload)
        .select('id, name, product_code')
        .single()

      if (error) return { status: 'error' as const, error: error.message }

      return success(`Dish "${data.name}" created`, {
        id: data.id,
        name: data.name,
        product_code: data.product_code,
      })
    },
  })
}

function updateDishPrice(supa: SupabaseClient) {
  return tool({
    description:
      'Update the selling price of a dish. When confirmed=false, returns a proposal showing old → new price. When confirmed=true, executes the update. ALWAYS show the proposal first.',
    inputSchema: z.object({
      product_id: z.string().uuid().optional().describe('Nomenclature UUID'),
      product_code: z.string().optional().describe('Product code (e.g. SALE-BORSCH_BIOACTIVE)'),
      new_price: z.number().describe('New price in THB'),
      confirmed: z.boolean().default(false),
    }),
    execute: async ({ product_id, product_code, new_price, confirmed }) => {
      // Resolve product
      let query = supa.from('nomenclature').select('id, name, product_code, price, cost_per_unit')
      if (product_id) query = query.eq('id', product_id)
      else if (product_code) query = query.eq('product_code', product_code)
      else return { status: 'error' as const, error: 'Provide product_id or product_code' }

      const { data: product, error: fetchErr } = await query.maybeSingle()
      if (fetchErr) return { status: 'error' as const, error: fetchErr.message }
      if (!product) return { status: 'error' as const, error: 'Product not found' }

      const oldPrice = Number(product.price ?? 0)
      const cost = Number(product.cost_per_unit ?? 0)
      const newFoodCostPct = new_price > 0 ? Math.round((cost / new_price) * 1000) / 10 : null

      if (!confirmed) {
        return proposal(`Change price of "${product.name}" from ฿${oldPrice} → ฿${new_price}`, {
          id: product.id,
          name: product.name,
          product_code: product.product_code,
          old_price: oldPrice,
          new_price,
          cost,
          new_food_cost_pct: newFoodCostPct,
          new_margin: new_price - cost,
        })
      }

      const { error: updateErr } = await supa
        .from('nomenclature')
        .update({ price: new_price })
        .eq('id', product.id as string)

      if (updateErr) return { status: 'error' as const, error: updateErr.message }

      return success(`Price of "${product.name}" updated: ฿${oldPrice} → ฿${new_price}`, {
        id: product.id,
        new_price,
        new_food_cost_pct: newFoodCostPct,
      })
    },
  })
}

function addBomIngredient(supa: SupabaseClient) {
  return tool({
    description:
      'Add an ingredient to a dish\'s BOM. When confirmed=false, returns a proposal. When confirmed=true, inserts the bom_structures row. ALWAYS show proposal first.',
    inputSchema: z.object({
      dish_id: z.string().uuid().describe('Parent dish nomenclature UUID'),
      ingredient_id: z.string().uuid().describe('Ingredient nomenclature UUID'),
      quantity_per_unit: z.number().describe('Quantity per 1 unit of the dish (in ingredient base_unit)'),
      yield_loss_pct: z.number().optional().describe('Yield loss percentage (e.g. 10 for 10% loss)'),
      notes: z.string().optional(),
      confirmed: z.boolean().default(false),
    }),
    execute: async ({ dish_id, ingredient_id, quantity_per_unit, yield_loss_pct, notes, confirmed }) => {
      // Resolve names for proposal
      const [dishRes, ingRes] = await Promise.all([
        supa.from('nomenclature').select('name, product_code').eq('id', dish_id).maybeSingle(),
        supa.from('nomenclature').select('name, product_code, base_unit, cost_per_unit').eq('id', ingredient_id).maybeSingle(),
      ])

      if (!dishRes.data) return { status: 'error' as const, error: `Dish ${dish_id} not found` }
      if (!ingRes.data) return { status: 'error' as const, error: `Ingredient ${ingredient_id} not found` }

      const costContribution = quantity_per_unit * Number(ingRes.data.cost_per_unit ?? 0)

      if (!confirmed) {
        return proposal(
          `Add ${quantity_per_unit} ${ingRes.data.base_unit ?? ''} of "${ingRes.data.name}" to "${dishRes.data.name}"`,
          {
            dish: { id: dish_id, name: dishRes.data.name, product_code: dishRes.data.product_code },
            ingredient: { id: ingredient_id, name: ingRes.data.name, product_code: ingRes.data.product_code, base_unit: ingRes.data.base_unit },
            quantity_per_unit,
            yield_loss_pct: yield_loss_pct ?? null,
            cost_contribution: costContribution,
            notes: notes ?? null,
          },
        )
      }

      const payload: Record<string, unknown> = {
        parent_id: dish_id,
        ingredient_id,
        quantity_per_unit,
      }
      if (yield_loss_pct != null) payload.yield_loss_pct = yield_loss_pct
      if (notes) payload.notes = notes

      const { error } = await supa.from('bom_structures').insert(payload)
      if (error) return { status: 'error' as const, error: error.message }

      return success(
        `Added "${ingRes.data.name}" (${quantity_per_unit} ${ingRes.data.base_unit ?? ''}) to "${dishRes.data.name}"`,
        { dish_id, ingredient_id, quantity_per_unit, cost_contribution: costContribution },
      )
    },
  })
}

function updateBomQuantity(supa: SupabaseClient) {
  return tool({
    description:
      'Update the quantity of an existing BOM ingredient. When confirmed=false, returns a proposal. When confirmed=true, executes.',
    inputSchema: z.object({
      bom_row_id: z.string().uuid().describe('bom_structures row UUID'),
      new_quantity: z.number().describe('New quantity_per_unit value'),
      confirmed: z.boolean().default(false),
    }),
    execute: async ({ bom_row_id, new_quantity, confirmed }) => {
      const { data: row, error: fetchErr } = await supa
        .from('bom_structures')
        .select('id, parent_id, ingredient_id, quantity_per_unit')
        .eq('id', bom_row_id)
        .maybeSingle()

      if (fetchErr) return { status: 'error' as const, error: fetchErr.message }
      if (!row) return { status: 'error' as const, error: `BOM row ${bom_row_id} not found` }

      const { data: ing } = await supa
        .from('nomenclature')
        .select('name, base_unit')
        .eq('id', row.ingredient_id as string)
        .maybeSingle()

      const oldQty = Number(row.quantity_per_unit ?? 0)
      const ingName = ing?.name ?? 'unknown'
      const unit = ing?.base_unit ?? ''

      if (!confirmed) {
        return proposal(`Change quantity of "${ingName}": ${oldQty} → ${new_quantity} ${unit}`, {
          bom_row_id,
          ingredient: ingName,
          old_quantity: oldQty,
          new_quantity,
          unit,
        })
      }

      const { error } = await supa
        .from('bom_structures')
        .update({ quantity_per_unit: new_quantity })
        .eq('id', bom_row_id)

      if (error) return { status: 'error' as const, error: error.message }

      return success(`Quantity of "${ingName}" updated: ${oldQty} → ${new_quantity} ${unit}`, {
        bom_row_id,
        new_quantity,
      })
    },
  })
}

function removeBomIngredient(supa: SupabaseClient) {
  return tool({
    description:
      'Remove an ingredient from a dish\'s BOM. When confirmed=false, returns a proposal. When confirmed=true, deletes the bom_structures row. ALWAYS show proposal first.',
    inputSchema: z.object({
      bom_row_id: z.string().uuid().describe('bom_structures row UUID'),
      confirmed: z.boolean().default(false),
    }),
    execute: async ({ bom_row_id, confirmed }) => {
      const { data: row, error: fetchErr } = await supa
        .from('bom_structures')
        .select('id, parent_id, ingredient_id, quantity_per_unit')
        .eq('id', bom_row_id)
        .maybeSingle()

      if (fetchErr) return { status: 'error' as const, error: fetchErr.message }
      if (!row) return { status: 'error' as const, error: `BOM row ${bom_row_id} not found` }

      const [dishRes, ingRes] = await Promise.all([
        supa.from('nomenclature').select('name').eq('id', row.parent_id as string).maybeSingle(),
        supa.from('nomenclature').select('name, base_unit').eq('id', row.ingredient_id as string).maybeSingle(),
      ])

      const dishName = dishRes.data?.name ?? 'unknown dish'
      const ingName = ingRes.data?.name ?? 'unknown ingredient'

      if (!confirmed) {
        return proposal(`Remove "${ingName}" from "${dishName}" BOM`, {
          bom_row_id,
          dish: dishName,
          ingredient: ingName,
          quantity: Number(row.quantity_per_unit ?? 0),
          unit: ingRes.data?.base_unit ?? '',
        })
      }

      const { error } = await supa.from('bom_structures').delete().eq('id', bom_row_id)
      if (error) return { status: 'error' as const, error: error.message }

      return success(`Removed "${ingName}" from "${dishName}"`, { bom_row_id })
    },
  })
}
