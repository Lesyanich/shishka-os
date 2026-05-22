/**
 * search-homepro-catalog — Search HomePro product catalog via REST API.
 *
 * HomePro (homepro.co.th) is a major Thai home improvement retailer.
 * Sells kitchenware, security cameras, equipment, tools, packaging, etc.
 *
 * Uses their suggest API (/service/search/suggest.jsp) which returns
 * structured JSON with Thai+English names, prices, brands, and images.
 * For stock/availability details, enriches with product page JSON-LD.
 *
 * Zero external dependencies — uses native fetch + JSON parsing.
 */

const BASE_URL = "https://www.homepro.co.th";
const SUGGEST_API = `${BASE_URL}/service/search/suggest.jsp`;
const SEARCH_URL = `${BASE_URL}/search`;

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export interface HomeProProduct {
  product_id: string;
  name_th: string;
  name_en: string;
  brand: string;
  sku: string;
  price_thb: number;
  original_price_thb: number | null;
  image_url: string;
  product_url: string;
  category: string;
  seller: string;
  in_stock: boolean;
}

async function fetchWithRetry(
  url: string,
  opts: RequestInit = {},
  retries = 2
): Promise<Response | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const resp = await fetch(url, {
        ...opts,
        headers: {
          "User-Agent": USER_AGENT,
          "Accept-Language": "th-TH,th;q=0.9,en;q=0.8",
          ...(opts.headers || {}),
        },
      });
      if (resp.status === 429 || resp.status === 403) {
        await new Promise((r) => setTimeout(r, 2 ** attempt * 3000));
        continue;
      }
      if (!resp.ok) return null;
      return resp;
    } catch {
      if (attempt < retries) await new Promise((r) => setTimeout(r, 2000));
    }
  }
  return null;
}

function parseSuggestResponse(data: any): HomeProProduct[] {
  if (!data) return [];

  const products: HomeProProduct[] = [];
  const seen = new Set<string>();

  // The suggest API may return products in various structures
  const items: any[] = Array.isArray(data)
    ? data
    : data.products || data.items || data.results || [];

  for (const item of items) {
    if (!item || typeof item !== "object") continue;

    const sku = String(item.partnumber || item.sku || item.id || "");
    if (sku && seen.has(sku)) continue;
    if (sku) seen.add(sku);

    const price = parseFloat(
      item.price_display?.current ||
        item.price_display?.price ||
        item.price ||
        item.salePrice ||
        item.offerprice ||
        item.selling_price ||
        item.display_price ||
        "0"
    );
    const originalPrice = parseFloat(
      item.price_display?.original ||
        item.price_display?.listPrice ||
        item.originalPrice ||
        item.listPrice ||
        item.list_price ||
        item.regular_price ||
        "0"
    );

    products.push({
      product_id: sku,
      name_th: item.item_name || item.name || "",
      name_en: item.item_name_en || item.nameEn || "",
      brand: item.brand || "",
      sku,
      price_thb: price,
      original_price_thb:
        originalPrice > price ? originalPrice : null,
      image_url: item.image
        ? item.image.startsWith("http")
          ? item.image
          : `https://statice.homepro.co.th${item.image}`
        : "",
      product_url: sku ? `${BASE_URL}/p/${sku}` : "",
      category: item.categories || item.category || "",
      seller: item.partnername || item.seller || "HomePro",
      in_stock: true, // Suggest API only returns available items
    });
  }

  return products;
}

async function searchViaSuggestApi(query: string): Promise<HomeProProduct[]> {
  const url = `${SUGGEST_API}?q=${encodeURIComponent(query)}`;
  const resp = await fetchWithRetry(url, {
    headers: { Accept: "application/json" },
  });

  if (!resp) return [];

  try {
    const data = await resp.json();
    return parseSuggestResponse(data);
  } catch {
    return [];
  }
}

async function searchViaHtml(query: string, limit: number): Promise<HomeProProduct[]> {
  const perPage = Math.min(limit, 60);
  const url = `${SEARCH_URL}?q=${encodeURIComponent(query)}&page=1&perPage=${perPage}`;
  const resp = await fetchWithRetry(url);
  if (!resp) return [];

  const html = await resp.text();
  if (!html) return [];

  const products: HomeProProduct[] = [];
  const seen = new Set<string>();

  // Try JSON-LD first
  const jsonLdRegex = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = jsonLdRegex.exec(html)) !== null) {
    try {
      const ld = JSON.parse(match[1]);
      if (ld["@type"] === "ItemList" && Array.isArray(ld.itemListElement)) {
        for (const el of ld.itemListElement) {
          const item = el.item || el;
          if (!item || item["@type"] !== "Product") continue;

          const sku = item.sku || item.productID || "";
          if (sku && seen.has(sku)) continue;
          if (sku) seen.add(sku);

          const offer = Array.isArray(item.offers)
            ? item.offers[0]
            : item.offers;
          const price = parseFloat(offer?.price || "0");

          products.push({
            product_id: sku,
            name_th: item.name || "",
            name_en: "",
            brand: item.brand?.name || "",
            sku,
            price_thb: price,
            original_price_thb: null,
            image_url: item.image || "",
            product_url: item.url || (sku ? `${BASE_URL}/p/${sku}` : ""),
            category: "",
            seller: offer?.seller?.name || "HomePro",
            in_stock: offer?.availability?.includes("InStock") ?? true,
          });
        }
      }
    } catch {
      // Not valid JSON-LD
    }
  }

  // If JSON-LD gave results, use those
  if (products.length > 0) return products;

  // Fallback: parse product cards from HTML
  // Look for product SKUs in the HTML
  const skuRegex = /data-sku="([^"]+)"/g;
  const priceRegex = /data-price="([^"]+)"/g;
  const nameRegex = /data-name="([^"]+)"/g;

  const skus: string[] = [];
  const prices: string[] = [];
  const names: string[] = [];

  while ((match = skuRegex.exec(html)) !== null) skus.push(match[1]);
  while ((match = priceRegex.exec(html)) !== null) prices.push(match[1]);
  while ((match = nameRegex.exec(html)) !== null) names.push(match[1]);

  for (let i = 0; i < skus.length; i++) {
    if (seen.has(skus[i])) continue;
    seen.add(skus[i]);

    products.push({
      product_id: skus[i],
      name_th: names[i] || "",
      name_en: "",
      brand: "",
      sku: skus[i],
      price_thb: parseFloat(prices[i] || "0"),
      original_price_thb: null,
      image_url: "",
      product_url: `${BASE_URL}/p/${skus[i]}`,
      category: "",
      seller: "HomePro",
      in_stock: true,
    });
  }

  return products;
}

export async function searchHomeProCatalog(args: {
  query: string;
  limit?: number;
}) {
  const q = args.query.trim();
  if (!q) return { error: "Query is required" };

  const limit = args.limit || 20;

  // Try HTML search first — it exposes prices via JSON-LD Product.offers.price.
  // The suggest API is faster but historically returned metadata with price=0
  // for every item. Fall back to suggest only if HTML yields nothing.
  let products = await searchViaHtml(q, limit);

  if (products.length === 0) {
    products = await searchViaSuggestApi(q);
  }

  if (products.length === 0) {
    return {
      error: `Could not find products for "${q}" on HomePro`,
      hint: "Try different keywords (Thai or English), or use WebSearch as fallback",
      search_url: `${SEARCH_URL}?q=${encodeURIComponent(q)}`,
    };
  }

  return {
    count: Math.min(products.length, limit),
    source: "homepro.co.th",
    search_url: `${SEARCH_URL}?q=${encodeURIComponent(q)}`,
    results: products.slice(0, limit),
  };
}
