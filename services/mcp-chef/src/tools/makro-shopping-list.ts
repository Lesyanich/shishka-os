/**
 * makro-shopping-list — Generate Makro shopping list for active SALE menu.
 *
 * Walks BOM tree of all active SALE dishes, collects unique RAW ingredients
 * sourced from Makro, returns each with product name, price, package info,
 * and a direct makro.pro link.
 *
 * Phase 1: no quantity calculation — just the ingredient list with links.
 */

import { getSupabase } from "../lib/supabase.js";
import { generateMakroPdf, type MakroPdfItem } from "../lib/makro-pdf.js";

interface MakroShoppingItem {
  ingredient_id: string;
  ingredient_name: string;
  ingredient_code: string;
  base_unit: string;
  makro_product_name: string | null;
  barcode: string | null;
  last_seen_price: number | null;
  package_info: string | null;
  makro_url: string;
  image_url: string | null;
  used_in_dishes: string[];
}

/**
 * Recursively collect all RAW leaf ingredient IDs from a set of parent products.
 * Uses iterative BOM descent to avoid deep recursion on large menus.
 */
async function collectRawLeaves(
  saleIds: string[]
): Promise<Map<string, Set<string>>> {
  const sb = getSupabase();

  // Map: raw ingredient_id → set of SALE dish names that use it
  const rawToDishes = new Map<string, Set<string>>();

  // We need dish names for the output
  const { data: saleItems } = await sb
    .from("nomenclature")
    .select("id, name")
    .in("id", saleIds);

  const dishNameMap = new Map<string, string>();
  for (const item of saleItems || []) {
    dishNameMap.set(item.id, item.name);
  }

  // BFS through BOM tree for each SALE dish
  for (const saleId of saleIds) {
    const dishName = dishNameMap.get(saleId) || "Unknown";
    const queue: string[] = [saleId];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const batch = queue.splice(0, 50); // process in batches
      const unvisited = batch.filter((id) => !visited.has(id));
      if (unvisited.length === 0) continue;

      for (const id of unvisited) visited.add(id);

      const { data: bomLines } = await sb
        .from("bom_structures")
        .select("ingredient_id")
        .in("parent_id", unvisited);

      if (!bomLines || bomLines.length === 0) {
        // These are leaves — check if they're RAW
        const { data: items } = await sb
          .from("nomenclature")
          .select("id, type")
          .in("id", unvisited)
          .eq("type", "good");

        for (const item of items || []) {
          if (!rawToDishes.has(item.id)) {
            rawToDishes.set(item.id, new Set());
          }
          rawToDishes.get(item.id)!.add(dishName);
        }
        continue;
      }

      // Separate: items with children (intermediate) vs without (potential leaves)
      const childIds = bomLines.map((l) => l.ingredient_id);
      const parentIdsWithChildren = new Set(
        bomLines.map((l) => l.ingredient_id)
      );

      // The unvisited items that had NO children in bom_structures are leaves
      // But we fetched children of `unvisited` parents, getting ingredient_ids
      // Those ingredient_ids go into the queue for further descent
      for (const childId of childIds) {
        if (!visited.has(childId)) {
          queue.push(childId);
        }
      }

      // Check which of the unvisited batch are themselves leaves (no outgoing BOM)
      const { data: asParents } = await sb
        .from("bom_structures")
        .select("parent_id")
        .in("parent_id", unvisited);

      const hasChildren = new Set((asParents || []).map((r) => r.parent_id));
      const leaves = unvisited.filter((id) => !hasChildren.has(id));

      if (leaves.length > 0) {
        const { data: leafItems } = await sb
          .from("nomenclature")
          .select("id, type")
          .in("id", leaves)
          .eq("type", "good");

        for (const item of leafItems || []) {
          if (!rawToDishes.has(item.id)) {
            rawToDishes.set(item.id, new Set());
          }
          rawToDishes.get(item.id)!.add(dishName);
        }
      }
    }
  }

  return rawToDishes;
}

export async function makroShoppingList(args?: {
  format?: "json" | "pdf";
}): Promise<{
  items?: MakroShoppingItem[];
  total_items: number;
  total_estimated_cost: number | null;
  note: string;
  pdf_path?: string;
}> {
  const format = args?.format || "json";
  const sb = getSupabase();

  // 1. Get all active SALE dishes
  const { data: saleDishes, error: saleErr } = await sb
    .from("nomenclature")
    .select("id")
    .eq("type", "dish")
    .like("product_code", "SALE-%")
    .eq("is_available", true);

  if (saleErr || !saleDishes || saleDishes.length === 0) {
    return {
      items: [],
      total_items: 0,
      total_estimated_cost: null,
      note: saleErr
        ? `Error fetching SALE dishes: ${saleErr.message}`
        : "No active SALE dishes found",
    };
  }

  // 2. Walk BOM trees → collect unique RAW ingredient IDs with dish mapping
  const rawToDishes = await collectRawLeaves(saleDishes.map((d) => d.id));

  if (rawToDishes.size === 0) {
    return {
      items: [],
      total_items: 0,
      total_estimated_cost: null,
      note: "No RAW ingredients found in active SALE dish BOM trees",
    };
  }

  const rawIds = Array.from(rawToDishes.keys());

  // 3. Get nomenclature details for RAW ingredients
  const { data: rawItems } = await sb
    .from("nomenclature")
    .select("id, product_code, name, base_unit")
    .in("id", rawIds);

  const rawMap = new Map<string, { code: string; name: string; unit: string }>();
  for (const item of rawItems || []) {
    rawMap.set(item.id, {
      code: item.product_code,
      name: item.name,
      unit: item.base_unit,
    });
  }

  // 4. Find Makro supplier(s)
  const { data: makroSuppliers } = await sb
    .from("suppliers")
    .select("id, name")
    .ilike("name", "%makro%");

  if (!makroSuppliers || makroSuppliers.length === 0) {
    return {
      items: [],
      total_items: 0,
      total_estimated_cost: null,
      note: "No Makro supplier found in suppliers table",
    };
  }

  const makroSupplierIds = makroSuppliers.map((s) => s.id);

  // 5. Get supplier_catalog entries for these RAW items from Makro
  const { data: catalogEntries } = await sb
    .from("supplier_catalog")
    .select(
      "nomenclature_id, product_name, full_title, barcode, last_seen_price, package_weight, package_unit, external_url, image_url"
    )
    .in("nomenclature_id", rawIds)
    .in("supplier_id", makroSupplierIds);

  // Build lookup: nomenclature_id → catalog entry
  type CatalogEntry = NonNullable<typeof catalogEntries>[number];
  const catalogMap = new Map<string, CatalogEntry>();
  for (const entry of catalogEntries || []) {
    if (entry.nomenclature_id) {
      catalogMap.set(entry.nomenclature_id, entry as any);
    }
  }

  // 6. Build result
  const items: MakroShoppingItem[] = [];
  let totalCost = 0;
  let hasPrices = false;

  for (const [rawId, dishes] of rawToDishes) {
    const raw = rawMap.get(rawId);
    if (!raw) continue;

    const catalog = catalogMap.get(rawId);
    if (!catalog) continue; // Only include items that are in Makro catalog

    const productName = catalog.product_name || catalog.full_title || raw.name;
    const packageInfo =
      catalog.package_weight && catalog.package_unit
        ? `${catalog.package_weight} ${catalog.package_unit}`
        : catalog.package_weight || null;

    // Build URL: use external_url if available, otherwise search fallback
    let makroUrl: string;
    if (catalog.external_url) {
      makroUrl = catalog.external_url;
    } else if (catalog.barcode) {
      // Barcode search is more precise
      makroUrl = `https://www.makro.pro/search?q=${encodeURIComponent(catalog.barcode)}`;
    } else {
      makroUrl = `https://www.makro.pro/search?q=${encodeURIComponent(productName)}`;
    }

    if (catalog.last_seen_price) {
      totalCost += catalog.last_seen_price;
      hasPrices = true;
    }

    items.push({
      ingredient_id: rawId,
      ingredient_name: raw.name,
      ingredient_code: raw.code,
      base_unit: raw.unit,
      makro_product_name: productName,
      barcode: catalog.barcode || null,
      last_seen_price: catalog.last_seen_price || null,
      package_info: packageInfo,
      makro_url: makroUrl,
      image_url: (catalog as any).image_url || null,
      used_in_dishes: Array.from(dishes).sort(),
    });
  }

  // Sort by ingredient name
  items.sort((a, b) => a.ingredient_name.localeCompare(b.ingredient_name));

  const note = `Phase 1: ingredient list only (no quantities). ${items.length} Makro items from ${rawToDishes.size} total RAW ingredients across ${saleDishes.length} active SALE dishes.`;

  if (format === "pdf") {
    const pdfItems: MakroPdfItem[] = items.map((i) => ({
      title: i.makro_product_name || i.ingredient_name,
      barcode: i.barcode || "",
      brand: "",
      price: i.last_seen_price,
      weight: i.package_info || i.base_unit,
      image_url: i.image_url,
      product_url: i.makro_url,
    }));
    const pdfPath = await generateMakroPdf(pdfItems, "Makro Shopping List — Shishka Kitchen");
    return {
      total_items: items.length,
      total_estimated_cost: hasPrices ? Math.round(totalCost * 100) / 100 : null,
      note,
      pdf_path: pdfPath,
    };
  }

  return {
    items,
    total_items: items.length,
    total_estimated_cost: hasPrices ? Math.round(totalCost * 100) / 100 : null,
    note,
  };
}
