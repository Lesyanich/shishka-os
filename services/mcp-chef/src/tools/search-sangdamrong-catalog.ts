/**
 * search-sangdamrong-catalog — Search Sangdamrong product catalog via SSR scraping.
 *
 * Sangdamrong is a kitchenware/packaging/supplies supplier in Thailand.
 * Their site (sangdamrong.com) uses Remix SSR — product data is embedded in
 * the homepage HTML as React Router loader state. No public search API exists,
 * so we fetch the homepage and filter products client-side.
 *
 * ~100 featured products across 18 categories (kitchenware, trays, glassware,
 * porcelain, electrical appliances, display items, etc.).
 *
 * Zero external dependencies — uses native fetch + JSON parsing.
 */

const BASE_URL = "https://www.sangdamrong.com";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export interface SangdamrongProduct {
  product_id: string;
  name: string;
  category: string;
  brand: string;
  sku_code: string;
  price_thb: number;
  discount_price_thb: number | null;
  discount_pct: number | null;
  unit: string;
  stock: number;
  image_url: string;
}

let cachedProducts: SangdamrongProduct[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

async function fetchHomepage(): Promise<string> {
  for (let attempt = 0; attempt <= 2; attempt++) {
    try {
      const resp = await fetch(BASE_URL, {
        headers: {
          "User-Agent": USER_AGENT,
          "Accept-Language": "th-TH,th;q=0.9,en;q=0.8",
          Accept: "text/html,application/xhtml+xml",
        },
      });
      if (resp.status === 429 || resp.status === 403) {
        await new Promise((r) => setTimeout(r, 2 ** attempt * 3000));
        continue;
      }
      if (!resp.ok) return "";
      return await resp.text();
    } catch {
      if (attempt < 2) await new Promise((r) => setTimeout(r, 2000));
    }
  }
  return "";
}

function parseProducts(html: string): SangdamrongProduct[] {
  if (!html) return [];

  // Sangdamrong uses Remix/React Router SSR. Product data is serialized
  // in <script> tags as part of the router context or inline JSON.
  // Look for JSON arrays containing product objects with known fields.
  const products: SangdamrongProduct[] = [];
  const seen = new Set<string>();

  // Strategy: find all JSON-like structures that contain product data.
  // Products have fields: product_name, SKU_CODE, price, category_name
  const scriptRegex = /<script[^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;

  while ((match = scriptRegex.exec(html)) !== null) {
    const content = match[1];
    if (!content.includes("product_name") && !content.includes("SKU_CODE")) {
      continue;
    }

    // Try to extract JSON arrays or objects containing product data
    const jsonCandidates = extractJsonBlobs(content);
    for (const blob of jsonCandidates) {
      const extracted = extractProductsFromBlob(blob);
      for (const p of extracted) {
        if (!seen.has(p.product_id)) {
          seen.add(p.product_id);
          products.push(p);
        }
      }
    }
  }

  return products;
}

function extractJsonBlobs(script: string): any[] {
  const results: any[] = [];

  // Try parsing the entire script content as JSON assignment
  // Pattern: variable = {...} or window.__something = {...}
  const assignRegex = /=\s*(\{[\s\S]*\})\s*[;\n]/g;
  let m: RegExpExecArray | null;
  while ((m = assignRegex.exec(script)) !== null) {
    try {
      results.push(JSON.parse(m[1]));
    } catch {
      // Not valid JSON, skip
    }
  }

  // Also try finding JSON arrays directly
  const arrayRegex = /(\[[\s\S]*?\])\s*[;,\n]/g;
  while ((m = arrayRegex.exec(script)) !== null) {
    if (m[1].includes("product_name") || m[1].includes("SKU_CODE")) {
      try {
        results.push(JSON.parse(m[1]));
      } catch {
        // Not valid JSON, skip
      }
    }
  }

  // Remix turbo-stream or React Router serialization: look for JSON embedded
  // in larger data structures. Try to find product arrays by bracket matching.
  const productArrayStart = script.indexOf('"products"');
  if (productArrayStart !== -1) {
    const bracketStart = script.indexOf("[", productArrayStart);
    if (bracketStart !== -1) {
      let depth = 0;
      let end = bracketStart;
      for (let i = bracketStart; i < script.length; i++) {
        if (script[i] === "[") depth++;
        else if (script[i] === "]") {
          depth--;
          if (depth === 0) {
            end = i + 1;
            break;
          }
        }
      }
      try {
        results.push(JSON.parse(script.slice(bracketStart, end)));
      } catch {
        // Skip
      }
    }
  }

  return results;
}

function extractProductsFromBlob(blob: any): SangdamrongProduct[] {
  const products: SangdamrongProduct[] = [];

  if (Array.isArray(blob)) {
    for (const item of blob) {
      const p = tryParseProduct(item);
      if (p) products.push(p);
    }
  } else if (typeof blob === "object" && blob !== null) {
    // Recurse into object values looking for product arrays
    for (const key of Object.keys(blob)) {
      const val = blob[key];
      if (Array.isArray(val)) {
        for (const item of val) {
          const p = tryParseProduct(item);
          if (p) products.push(p);
        }
      }
    }
  }

  return products;
}

function tryParseProduct(item: any): SangdamrongProduct | null {
  if (!item || typeof item !== "object") return null;
  if (!item.product_name && !item.name) return null;

  const price = parseFloat(item.price || item.original_price || "0");
  const discountRaw = item.discount || item.sale_price;
  const discountPrice = discountRaw ? parseFloat(discountRaw) : null;
  const discountPct = item.discount_percentage
    ? parseFloat(item.discount_percentage)
    : null;

  return {
    product_id: String(item.id || item.product_id || ""),
    name: item.product_name || item.name || "",
    category: item.category_name || item.category || "",
    brand: item.brand_name || item.brand || "",
    sku_code: item.SKU_CODE || item.sku_code || item.sku || "",
    price_thb: price,
    discount_price_thb: discountPrice && discountPrice < price ? discountPrice : null,
    discount_pct: discountPct,
    unit: item.unit_name || item.unit || "",
    stock: Number(item.display_stock ?? item.stock ?? 0),
    image_url: item.image
      ? item.image.startsWith("http")
        ? item.image
        : `${BASE_URL}${item.image}`
      : "",
  };
}

async function loadCatalog(): Promise<SangdamrongProduct[]> {
  const now = Date.now();
  if (cachedProducts && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedProducts;
  }

  const html = await fetchHomepage();
  const products = parseProducts(html);

  if (products.length > 0) {
    cachedProducts = products;
    cacheTimestamp = now;
  }

  return products;
}

function matchesQuery(product: SangdamrongProduct, query: string): boolean {
  const q = query.toLowerCase();
  const fields = [
    product.name,
    product.category,
    product.brand,
    product.sku_code,
  ];
  return fields.some((f) => f.toLowerCase().includes(q));
}

export async function searchSangdamrongCatalog(args: {
  query?: string;
  category?: string;
}) {
  const products = await loadCatalog();

  if (products.length === 0) {
    return {
      error:
        "Could not load Sangdamrong catalog — site may be temporarily unavailable",
      hint: "Retry in a few minutes or use WebSearch as fallback",
    };
  }

  let filtered = products;

  if (args.query?.trim()) {
    const q = args.query.trim();
    filtered = filtered.filter((p) => matchesQuery(p, q));
  }

  if (args.category?.trim()) {
    const cat = args.category.trim().toLowerCase();
    filtered = filtered.filter((p) =>
      p.category.toLowerCase().includes(cat)
    );
  }

  if (filtered.length === 0) {
    const categories = Array.from(new Set(products.map((p) => p.category))).filter(Boolean);
    return {
      message: `No products matched${args.query ? ` "${args.query}"` : ""}${args.category ? ` in category "${args.category}"` : ""}`,
      hint: "Try a broader search term or browse by category",
      available_categories: categories,
      total_catalog_size: products.length,
      results: [],
    };
  }

  return {
    count: filtered.length,
    total_catalog_size: products.length,
    source: "sangdamrong.com SSR (Remix loader)",
    results: filtered.map((p) => ({
      ...p,
      url: `${BASE_URL}`,
    })),
  };
}
