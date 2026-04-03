import { getSupabase } from "../lib/supabase.js";

export const checkInventorySchema = {
  name: "check_inventory",
  description:
    "Check current inventory levels. Uses sku_balances aggregated by nomenclature. Can filter by product or type.",
  inputSchema: {
    type: "object" as const,
    properties: {
      product_id: {
        type: "string",
        description: "UUID of a specific nomenclature item to check",
      },
      low_stock_only: {
        type: "boolean",
        description: "If true, only return items with quantity = 0 (default: false)",
      },
      type: {
        type: "string",
        enum: ["RAW", "PF"],
        description: "Filter by product type (only RAW and PF have inventory)",
      },
    },
  },
};

export async function checkInventory(args: {
  product_id?: string;
  low_stock_only?: boolean;
  type?: string;
}) {
  try {
    const sb = getSupabase();

    // --- Strategy ---
    // 1. Query sku_balances joined to sku → nomenclature
    // 2. Aggregate quantities per nomenclature_id
    // We use the v_inventory_by_nomenclature view which already aggregates

    if (args.product_id) {
      // Direct lookup for a single product
      const { data, error } = await sb
        .from("v_inventory_by_nomenclature")
        .select("*")
        .eq("nomenclature_id", args.product_id);

      if (error) return { error: error.message };

      // Also fetch product info
      const { data: product } = await sb
        .from("nomenclature")
        .select("id, product_code, name, base_unit")
        .eq("id", args.product_id)
        .single();

      const qty = data && data.length > 0 ? Number(data[0].quantity) : 0;
      const lastCounted = data && data.length > 0 ? data[0].last_counted_at : null;

      return {
        count: 1,
        results: [
          {
            product_id: args.product_id,
            code: product?.product_code,
            name: product?.name,
            unit: product?.base_unit,
            current_qty: qty,
            last_counted: lastCounted,
          },
        ],
      };
    }

    // Fetch all inventory from the aggregation view
    const { data: inventory, error: invError } = await sb
      .from("v_inventory_by_nomenclature")
      .select("*");

    if (invError) return { error: invError.message };

    // Collect nomenclature_ids for product info lookup
    const nomIds = (inventory || []).map((r: any) => r.nomenclature_id).filter(Boolean);

    // Fetch product details for all items
    let products: any[] = [];
    if (nomIds.length > 0) {
      const { data: prods } = await sb
        .from("nomenclature")
        .select("id, product_code, name, base_unit")
        .in("id", nomIds);
      products = prods || [];
    }

    const productMap = new Map(products.map((p: any) => [p.id, p]));

    let results = (inventory || []).map((inv: any) => {
      const prod = productMap.get(inv.nomenclature_id);
      return {
        product_id: inv.nomenclature_id,
        code: prod?.product_code || null,
        name: prod?.name || null,
        unit: prod?.base_unit || null,
        current_qty: Number(inv.quantity) || 0,
        last_counted: inv.last_counted_at,
      };
    });

    // Filter by type (using product_code prefix)
    if (args.type) {
      results = results.filter(
        (r: any) => r.code && r.code.startsWith(`${args.type}-`)
      );
    }

    // Filter zero/low stock
    if (args.low_stock_only) {
      results = results.filter((r: any) => r.current_qty <= 0);
    }

    // Sort by quantity ascending (lowest stock first)
    results.sort((a: any, b: any) => a.current_qty - b.current_qty);

    const zeroStockCount = results.filter((r: any) => r.current_qty <= 0).length;

    return {
      count: results.length,
      zero_stock_count: zeroStockCount,
      results,
      alert:
        zeroStockCount > 0
          ? `${zeroStockCount} item(s) with zero stock`
          : null,
    };
  } catch (err: any) {
    return { error: err.message };
  }
}
