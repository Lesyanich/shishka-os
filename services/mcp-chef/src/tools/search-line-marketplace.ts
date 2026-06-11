/**
 * search-line-marketplace — Marketplace-wide product search across ALL LINE
 * SHOPPING sellers, with price comparison.
 *
 * Complements search_line_catalog (single shop by @handle). This one searches
 * the whole LINE SHOPPING marketplace for a keyword and returns matching
 * products from many sellers, sorted for price comparison.
 *
 * API (no auth, same endpoint as the single-shop tool):
 *   POST https://customer-api.line-apps.com/search/graph
 *   operation SearchWithCouponQuery → products(input:{search}) { …, shop{…} }
 * Each product carries its shop (name, storefront URL, friend count) and the
 * product storefrontUrl embeds the shop @handle.
 *
 * Adds best-effort pack-size parsing (e.g. "300 กรัม", "500g", "1 kg") to
 * compute price-per-100g — the only fair way to compare powders sold in
 * different pack sizes. Sorted by price-per-100g (then absolute price).
 *
 * NOTE: LINE's search is a loose substring match, so unrelated items can leak
 * in (e.g. a TV remote brand "Createch" for "ครีเอทีน"). We surface raw
 * results sorted by price; eyeball the names. Zero external dependencies.
 */

const SEARCH_API = "https://customer-api.line-apps.com/search/graph";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const SEARCH_QUERY = `query SearchProducts($limit: Int!, $search: String!) {
  products(limit: $limit, input: {search: $search}, isBoostShippingCoupon: true) {
    products {
      id
      name
      discountPercent
      price
      salePrice
      storefrontUrl
      isInStock
      hasEReceipt
      hasTrustBadge
      shop { id name storefrontUrl friendCount }
    }
    lastPage
  }
}`;

export interface LineMarketProduct {
  product_id: string;
  name: string;
  shop_name: string;
  shop_handle: string;
  shop_url: string;
  shop_friends: number | null;
  price_thb: number;
  original_price_thb: number | null;
  discount_pct: number | null;
  in_stock: boolean;
  has_e_receipt: boolean;
  has_trust_badge: boolean;
  grams: number | null;
  price_per_100g: number | null;
  product_url: string;
}

/** API returns prices as formatted strings ("฿1,399") or numbers. */
function parsePrice(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = parseFloat(v.replace(/[^\d.]/g, ""));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

/** @handle from a storefront URL like https://shop.line.me/@abc/product/123. */
function handleFromUrl(url: string): string {
  const m = (url || "").match(/\/(@[^/?#]+)/);
  return m ? m[1] : "";
}

/**
 * Best-effort net-weight in grams from a product name.
 * Handles kg / กิโล / กิโลกรัม and g / กรัม. Avoids mg (มก. / mg).
 */
function parseGrams(name: string): number | null {
  const s = name.replace(/,/g, "");
  // kilograms first
  const kg = s.match(/(\d+(?:\.\d+)?)\s*(?:kg|กก\.?|กิโลกรัม|กิโล)\b/i);
  if (kg) {
    const g = parseFloat(kg[1]) * 1000;
    if (g > 0 && g < 100000) return g;
  }
  // grams — explicit "กรัม" or a g/G not part of "mg"/"มก"
  const gm = s.match(/(\d+(?:\.\d+)?)\s*(?:กรัม|g\b)/i);
  if (gm) {
    // Reject milligrams: "มก" or "mg" right before the matched unit.
    const idx = gm.index ?? 0;
    const around = s.slice(Math.max(0, idx - 2), idx + (gm[0]?.length ?? 0) + 2);
    if (/มก|mg/i.test(around)) return null;
    const g = parseFloat(gm[1]);
    if (g >= 10 && g < 100000) return g;
  }
  return null;
}

async function runSearch(search: string, limit: number): Promise<any> {
  for (let attempt = 0; attempt <= 2; attempt++) {
    try {
      const resp = await fetch(SEARCH_API, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "*/*",
          referer: "https://shop.line.me/",
          "User-Agent": USER_AGENT,
        },
        body: JSON.stringify({
          operationName: "SearchProducts",
          variables: { limit, search },
          query: SEARCH_QUERY,
        }),
      });
      if (resp.status === 429 || resp.status === 403) {
        await new Promise((r) => setTimeout(r, 2 ** attempt * 1500));
        continue;
      }
      if (!resp.ok) return null;
      return await resp.json();
    } catch {
      if (attempt < 2) await new Promise((r) => setTimeout(r, 1500));
    }
  }
  return null;
}

export async function searchLineMarketplace(args: {
  query: string;
  limit?: number;
  in_stock_only?: boolean;
  e_receipt_only?: boolean;
  strict?: boolean;
}) {
  const q = (args.query || "").trim();
  if (!q) {
    return { error: "query is required (e.g. 'ครีเอทีน' or 'creatine')" };
  }
  const limit = Math.min(args.limit ?? 60, 100);
  const strict = args.strict !== false; // default ON — cut fuzzy false positives

  const json = await runSearch(q, limit);
  if (!json) {
    return { error: `LINE marketplace search failed for "${q}"`, hint: "Try again or a different keyword (Thai often yields more results)" };
  }
  if (json.errors) {
    return { error: `LINE search rejected the query`, detail: JSON.stringify(json.errors).slice(0, 300) };
  }

  const raw: any[] = json.data?.products?.products || [];
  const more = json.data?.products?.lastPage === false;

  const seen = new Set<string>();
  let results: LineMarketProduct[] = [];
  for (const p of raw) {
    const id = String(p.id);
    if (seen.has(id)) continue;
    seen.add(id);

    const price = parsePrice(p.price);
    const sale = parsePrice(p.salePrice) || price;
    const grams = parseGrams(String(p.name || ""));
    results.push({
      product_id: id,
      name: String(p.name || "").replace(/\s+/g, " ").trim(),
      shop_name: p.shop?.name || "",
      shop_handle: handleFromUrl(p.shop?.storefrontUrl || p.storefrontUrl || ""),
      shop_url: p.shop?.storefrontUrl || "",
      shop_friends: typeof p.shop?.friendCount === "number" ? p.shop.friendCount : null,
      price_thb: sale,
      original_price_thb: price > sale ? price : null,
      discount_pct: p.discountPercent ? Number(p.discountPercent) : null,
      in_stock: p.isInStock !== false,
      has_e_receipt: p.hasEReceipt === true,
      has_trust_badge: p.hasTrustBadge === true,
      grams,
      price_per_100g: grams && sale ? Math.round((sale / grams) * 100) : null,
      product_url: p.storefrontUrl || "",
    });
  }

  if (args.in_stock_only) results = results.filter((r) => r.in_stock);
  if (args.e_receipt_only) results = results.filter((r) => r.has_e_receipt);

  // Relevance gate (default ON): LINE's search is a loose fuzzy match that
  // leaks unrelated items (e.g. "ครีเอเทค" TV remotes, L-carnitine dressings
  // for "ครีเอทีน"). Require every query token (≥2 chars) to appear in the
  // product name. Set strict:false to see the raw fuzzy result set.
  const droppedByStrict: string[] = [];
  if (strict) {
    const tokens = q.toLowerCase().split(/\s+/).filter((t) => t.length >= 2);
    if (tokens.length) {
      results = results.filter((r) => {
        const hay = r.name.toLowerCase();
        const keep = tokens.every((t) => hay.includes(t));
        if (!keep) droppedByStrict.push(r.name);
        return keep;
      });
    }
  }

  // Sort: items with a comparable per-100g price first (cheapest), then the
  // rest by absolute price.
  results.sort((a, b) => {
    if (a.price_per_100g != null && b.price_per_100g != null)
      return a.price_per_100g - b.price_per_100g;
    if (a.price_per_100g != null) return -1;
    if (b.price_per_100g != null) return 1;
    return a.price_thb - b.price_thb;
  });

  if (results.length === 0) {
    return {
      count: 0,
      source: "shop.line.me (marketplace search)",
      query: q,
      results: [],
      strict,
      dropped_by_strict: droppedByStrict.length,
      note: strict
        ? "No products whose name contains the query. Retry with strict:false to see fuzzy matches."
        : "No products matched.",
    };
  }

  const shops = new Set(results.map((r) => r.shop_name).filter(Boolean));
  const comparable = results.filter((r) => r.price_per_100g != null);
  const cheapest = comparable[0] || results[0];

  return {
    query: q,
    source: "shop.line.me (marketplace search)",
    count: results.length,
    shops_count: shops.size,
    has_more: more,
    strict,
    dropped_by_strict: droppedByStrict.length,
    e_receipt_count: results.filter((r) => r.has_e_receipt).length,
    cheapest_per_100g: comparable.length
      ? {
          shop: cheapest.shop_name,
          name: cheapest.name,
          price_thb: cheapest.price_thb,
          grams: cheapest.grams,
          price_per_100g: cheapest.price_per_100g,
          url: cheapest.product_url,
        }
      : null,
    note:
      "LINE search is a loose substring match — unrelated items may appear; check names. price_per_100g computed only where a pack size was parseable from the name.",
    results,
  };
}
