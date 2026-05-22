/**
 * search-makro-catalog — Search Makro Pro product catalog via SSR scraping.
 *
 * Replaces WebSearch for Makro product lookups. Uses makro.pro Typesense SSR
 * data embedded in __NEXT_DATA__ — returns real prices, barcodes, brands,
 * and stock for ST166 (Rawai, Phuket).
 *
 * Zero external dependencies — uses native fetch + regex parsing.
 */

const BASE_URL = "https://www.makro.pro";
const GRAPHQL_URL =
  "https://marketplace.mango-prod.siammakro.cloud/product/api/v1/graphql";
const DEFAULT_STORE = "166"; // ST166 Rawai, Phuket

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

interface MakroProduct {
  product_id: string;
  title_en: string;
  title_th: string;
  brand: string;
  barcode: string;
  makro_code: string;
  price_thb: number;
  packaging_weight: string;
  deepest_category: string;
  in_stock: boolean;
}

async function fetchWithRetry(
  url: string,
  opts: RequestInit = {},
  retries = 2
): Promise<string> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const resp = await fetch(url, {
        ...opts,
        headers: {
          "User-Agent": USER_AGENT,
          "Accept-Language": "en-US,en;q=0.9",
          ...(opts.headers || {}),
        },
      });
      if (resp.status === 429 || resp.status === 403) {
        const backoff = 2 ** attempt * 3000;
        await new Promise((r) => setTimeout(r, backoff));
        continue;
      }
      if (!resp.ok) return "";
      return await resp.text();
    } catch {
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  }
  return "";
}

function parseSearchHits(html: string): MakroProduct[] {
  if (!html) return [];

  // Extract __NEXT_DATA__ JSON from SSR page
  const marker = '<script id="__NEXT_DATA__" type="application/json">';
  const start = html.indexOf(marker);
  if (start === -1) return [];
  const jsonStart = start + marker.length;
  const jsonEnd = html.indexOf("</script>", jsonStart);
  if (jsonEnd === -1) return [];

  let data: any;
  try {
    data = JSON.parse(html.slice(jsonStart, jsonEnd));
  } catch {
    return [];
  }

  const hits =
    data?.props?.pageProps?.initialSearchResult?.hits || [];

  const seen = new Set<string>();
  const products: MakroProduct[] = [];

  for (const hit of hits) {
    const doc = hit?.document;
    if (!doc) continue;

    let barcode = doc.itemBarCode || "";
    if (!barcode) {
      const barcodes = doc.itemBarCodes || [];
      barcode = barcodes[0] || "";
    }

    const productId = String(doc.productId || doc.id || "");
    const dedupKey = barcode || productId;
    if (dedupKey && seen.has(dedupKey)) continue;
    if (dedupKey) seen.add(dedupKey);

    products.push({
      product_id: productId,
      title_en: doc.titleEn || "",
      title_th: doc.title || "",
      brand: doc.brandEn || "",
      barcode,
      makro_code: String(doc.makroId || ""),
      price_thb: doc.displayPrice || doc.originalPrice || 0,
      packaging_weight: doc.packagingWeight || "",
      deepest_category: doc.deepestCategory || "",
      in_stock: Boolean(doc.inStock),
    });
  }

  return products;
}

async function checkStoreInventory(
  productIds: string[],
  storeCode: string
): Promise<Record<string, number>> {
  const result: Record<string, number> = {};
  const batchSize = 20;
  const query = `
    query Products($ids: [String!]!, $storeCodes: [String!]) {
      products(ids: $ids, storeCodes: $storeCodes) {
        id
        totalInventory
      }
    }
  `;

  for (let i = 0; i < productIds.length; i += batchSize) {
    const batch = productIds.slice(i, i + batchSize);
    try {
      const resp = await fetch(GRAPHQL_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": USER_AGENT,
          "apollographql-client-name": "makro-pro-web",
          "apollographql-client-version": "1.0",
        },
        body: JSON.stringify({
          query,
          variables: { ids: batch, storeCodes: [storeCode] },
        }),
      });
      if (!resp.ok) continue;
      const data = await resp.json();
      for (const p of data?.data?.products || []) {
        result[p.id] = p.totalInventory ?? 0;
      }
    } catch {
      // Skip failed batch
    }
  }

  return result;
}

export async function searchMakroCatalog(args: {
  query: string;
  check_stock?: boolean;
  store_code?: string;
}) {
  const q = args.query.trim();
  if (!q) return { error: "Query is required" };

  const url = `${BASE_URL}/en/c/search?q=${encodeURIComponent(q)}`;
  const html = await fetchWithRetry(url);

  if (!html) {
    return {
      error: "Could not reach makro.pro — site may be temporarily unavailable",
      hint: "Retry in a few minutes or use WebSearch as fallback",
    };
  }

  const products = parseSearchHits(html);

  if (products.length === 0) {
    return {
      message: `No products found for "${q}" on makro.pro`,
      results: [],
    };
  }

  // Optionally check ST166 Rawai inventory
  let inventory: Record<string, number> | undefined;
  if (args.check_stock !== false) {
    const store = args.store_code || DEFAULT_STORE;
    const ids = products.map((p) => p.product_id).filter(Boolean);
    if (ids.length > 0) {
      inventory = await checkStoreInventory(ids, store);
    }
  }

  return {
    count: products.length,
    store: `ST${args.store_code || DEFAULT_STORE}`,
    source: "makro.pro SSR (Typesense)",
    results: products.map((p) => ({
      ...p,
      stock_rawai:
        inventory && p.product_id in inventory
          ? inventory[p.product_id]
          : undefined,
    })),
  };
}
