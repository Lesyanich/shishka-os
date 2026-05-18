/**
 * search-purchase-history — Query purchase_logs with supplier_catalog enrichment
 *
 * Closes the gap where Chef agent could search nomenclature (search_products)
 * but had no way to query actual purchase history: dates, prices, barcodes,
 * supplier names, and supplier_catalog metadata.
 */

import { getSupabase } from "../lib/supabase.js";

export async function searchPurchaseHistory(args: {
  query: string;
  supplier?: string;
  date_from?: string;
  date_to?: string;
  limit?: number;
}) {
  const sb = getSupabase();
  const limit = args.limit || 50;
  const q = args.query.trim();

  // Build the base query via Supabase PostgREST
  // purchase_logs → nomenclature + suppliers, LEFT JOIN supplier_catalog for enrichment
  let query = sb
    .from("purchase_logs")
    .select(
      `id,
       barcode,
       price_per_unit,
       quantity,
       total_price,
       invoice_date,
       nomenclature:nomenclature_id (id, product_code, name),
       supplier:supplier_id (id, name)`
    )
    .order("invoice_date", { ascending: false })
    .limit(limit);

  // Date range filters
  if (args.date_from) {
    query = query.gte("invoice_date", args.date_from);
  }
  if (args.date_to) {
    query = query.lte("invoice_date", args.date_to);
  }

  const { data, error } = await query;

  if (error) return { error: error.message };
  if (!data || data.length === 0)
    return { message: "No purchase history found", results: [] };

  // Client-side filter by query (nomenclature name/code, barcode)
  // and by supplier name — PostgREST doesn't support OR across joined tables
  const qLower = q.toLowerCase();
  let filtered = data.filter((row: any) => {
    const nom = row.nomenclature;
    const sup = row.supplier;
    const matchesQuery =
      nom?.name?.toLowerCase().includes(qLower) ||
      nom?.product_code?.toLowerCase().includes(qLower) ||
      (row.barcode && row.barcode.includes(q));

    if (!matchesQuery) return false;

    if (args.supplier) {
      const supLower = args.supplier.toLowerCase();
      return sup?.name?.toLowerCase().includes(supLower);
    }
    return true;
  });

  // If no results from nomenclature name/code/barcode, try supplier_catalog
  if (filtered.length === 0) {
    const scResult = await sb
      .from("supplier_catalog")
      .select("nomenclature_id")
      .or(
        `product_name.ilike.%${q}%,product_name_th.ilike.%${q}%,barcode.ilike.%${q}%`
      )
      .not("nomenclature_id", "is", null);

    if (!scResult.error && scResult.data && scResult.data.length > 0) {
      const nomIds = [
        ...new Set(scResult.data.map((sc: any) => sc.nomenclature_id)),
      ];
      // Re-filter from the already fetched data
      filtered = data.filter((row: any) => {
        const nom = row.nomenclature;
        if (!nom?.id || !nomIds.includes(nom.id)) return false;
        if (args.supplier) {
          return row.supplier?.name
            ?.toLowerCase()
            .includes(args.supplier.toLowerCase());
        }
        return true;
      });
    }
  }

  if (filtered.length === 0)
    return { message: "No purchase history found for this query", results: [] };

  // Enrich with supplier_catalog metadata (batch lookup)
  const nomIds = [
    ...new Set(
      filtered.map((r: any) => r.nomenclature?.id).filter(Boolean)
    ),
  ];
  const supIds = [
    ...new Set(filtered.map((r: any) => r.supplier?.id).filter(Boolean)),
  ];

  let catalogMap: Record<string, any> = {};
  if (nomIds.length > 0 && supIds.length > 0) {
    const scEnrich = await sb
      .from("supplier_catalog")
      .select(
        "nomenclature_id, supplier_id, barcode, original_name, product_name, product_name_th, package_weight, brand"
      )
      .in("nomenclature_id", nomIds)
      .in("supplier_id", supIds);

    if (!scEnrich.error && scEnrich.data) {
      for (const sc of scEnrich.data) {
        const key = `${sc.nomenclature_id}_${sc.supplier_id}`;
        catalogMap[key] = sc;
      }
    }
  }

  return {
    count: filtered.length,
    results: filtered.map((row: any) => {
      const nom = row.nomenclature;
      const sup = row.supplier;
      const catKey = `${nom?.id}_${sup?.id}`;
      const cat = catalogMap[catKey];

      return {
        product_code: nom?.product_code,
        name: nom?.name,
        barcode: row.barcode || cat?.barcode || undefined,
        price_per_unit: row.price_per_unit,
        quantity: row.quantity,
        total_price: row.total_price,
        invoice_date: row.invoice_date,
        supplier: sup?.name,
        catalog: cat
          ? {
              original_name: cat.original_name,
              product_name_th: cat.product_name_th,
              package_weight: cat.package_weight,
              brand: cat.brand,
            }
          : undefined,
      };
    }),
  };
}
