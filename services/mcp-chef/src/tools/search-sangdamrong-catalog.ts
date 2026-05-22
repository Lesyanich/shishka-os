/**
 * search-sangdamrong-catalog — Search Sangdamrong product catalog via SSR scraping.
 *
 * Sangdamrong is a kitchenware/packaging/supplies supplier in Thailand.
 * Their site (sangdamrong.com) uses React Router 7 SSR — product data is
 * embedded in the homepage HTML as a double-encoded turbo-stream payload
 * inside `window.__reactRouterContext.streamController.enqueue("...")`. The
 * payload is a flat array of values with positional reference objects
 * (`{"_N": M}` where `_N` is a field-name index and `M` is a value index).
 *
 * No public search API exists, so we fetch the homepage, decode the
 * turbo-stream, walk the resolved category tree, and filter client-side.
 *
 * ~200 featured products across nested promotion / top-sold categories.
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

// ─── Turbo-stream payload extraction ─────────────────────────────

/**
 * Find the JS string literal passed to `streamController.enqueue("...")`
 * and return it WITH surrounding quotes — ready for JSON.parse.
 * Walks character-by-character respecting JS string escapes.
 */
function extractEnqueueLiteral(html: string): string | null {
  const marker = "streamController.enqueue(";
  const start = html.indexOf(marker);
  if (start === -1) return null;
  const quoteStart = start + marker.length;
  if (html[quoteStart] !== '"') return null;
  let i = quoteStart + 1;
  while (i < html.length) {
    const c = html[i];
    if (c === "\\") {
      i += 2; // skip escape + next char
      continue;
    }
    if (c === '"') {
      return html.slice(quoteStart, i + 1);
    }
    i++;
  }
  return null;
}

/**
 * Resolve an index into the flat turbo-stream array into a plain JS value.
 * - Negative indices are sentinels → null
 * - Object values `{"_N": M}` resolve to `{ [arr[N]]: resolve(M) }`
 * - Array values `[n, m, ...]` resolve each element via `resolve(n)`
 * - Strings / booleans / numbers / null pass through as-is
 */
type TurboValue =
  | string
  | number
  | boolean
  | null
  | TurboValue[]
  | { [k: string]: TurboValue };

function resolveTurbo(
  arr: unknown[],
  idx: number,
  depth: number = 0
): TurboValue {
  if (depth > 60) return null;
  if (!Number.isInteger(idx) || idx < 0 || idx >= arr.length) return null;
  const v = arr[idx];
  if (v === null) return null;
  if (
    typeof v === "string" ||
    typeof v === "boolean" ||
    typeof v === "number"
  ) {
    return v;
  }
  if (Array.isArray(v)) {
    return v.map((x) =>
      typeof x === "number" ? resolveTurbo(arr, x, depth + 1) : (x as TurboValue)
    );
  }
  if (typeof v === "object") {
    const out: { [k: string]: TurboValue } = {};
    for (const [k, valIdx] of Object.entries(v as Record<string, unknown>)) {
      if (!k.startsWith("_")) continue;
      const keyIdx = parseInt(k.slice(1), 10);
      if (!Number.isInteger(keyIdx) || keyIdx < 0 || keyIdx >= arr.length) continue;
      const keyName = arr[keyIdx];
      if (typeof keyName !== "string") continue;
      out[keyName] =
        typeof valIdx === "number"
          ? resolveTurbo(arr, valIdx, depth + 1)
          : (valIdx as TurboValue);
    }
    return out;
  }
  return null;
}

/** Heuristic: a resolved object is a product if it has an id + a name field. */
function isProductRecord(v: TurboValue): v is { [k: string]: TurboValue } {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const o = v as Record<string, TurboValue>;
  if (typeof o.id !== "string" || o.id.length === 0) return false;
  return typeof o.product_name === "string" || typeof o.name === "string";
}

function walkForProducts(
  node: TurboValue,
  out: SangdamrongProduct[],
  seen: Set<string>,
  categoryHint: string
): void {
  if (node === null || node === undefined) return;
  if (Array.isArray(node)) {
    for (const item of node) {
      if (isProductRecord(item)) {
        const id = String(item.id);
        if (seen.has(id)) continue;
        seen.add(id);
        out.push(mapProduct(item, categoryHint));
      } else if (item && typeof item === "object") {
        walkForProducts(item as TurboValue, out, seen, categoryHint);
      }
    }
    return;
  }
  if (typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      walkForProducts(v, out, seen, k);
    }
  }
}

function mapProduct(
  item: { [k: string]: TurboValue },
  categoryHint: string
): SangdamrongProduct {
  const get = (k: string): TurboValue => item[k];
  const asString = (v: TurboValue): string => (typeof v === "string" ? v : "");
  const asNumber = (v: TurboValue): number => {
    if (typeof v === "number") return v;
    if (typeof v === "string") {
      const n = parseFloat(v);
      return Number.isFinite(n) ? n : 0;
    }
    return 0;
  };

  const price = asNumber(get("price")) || asNumber(get("original_price"));
  const discount = asNumber(get("discount")) || asNumber(get("gross_price"));
  const discountPct = asNumber(get("discount_percentage"));
  const image = asString(get("image"));

  return {
    product_id: asString(get("id")),
    name: asString(get("product_name")) || asString(get("name")),
    category: asString(get("category_name")) || categoryHint,
    brand: asString(get("brand_name")),
    sku_code: asString(get("SKU_CODE")) || asString(get("sku_code")),
    price_thb: price,
    discount_price_thb: discount > 0 && discount < price ? discount : null,
    discount_pct: discountPct > 0 ? discountPct : null,
    unit: asString(get("unit_name")),
    stock: asNumber(get("display_stock")) || asNumber(get("stock")),
    image_url: image
      ? image.startsWith("http")
        ? image
        : `${BASE_URL}${image}`
      : "",
  };
}

function parseTurboStream(html: string): SangdamrongProduct[] {
  if (!html) return [];

  const literal = extractEnqueueLiteral(html);
  if (!literal) return [];

  let arr: unknown[];
  try {
    // Outer JS string literal → JSON string → array (two parses).
    const unescaped = JSON.parse(literal);
    if (typeof unescaped !== "string") return [];
    const parsed = JSON.parse(unescaped);
    if (!Array.isArray(parsed) || parsed.length === 0) return [];
    arr = parsed;
  } catch {
    return [];
  }

  const root = resolveTurbo(arr, 0);
  if (!root || typeof root !== "object" || Array.isArray(root)) return [];

  const loaderData = (root as Record<string, TurboValue>).loaderData;
  if (!loaderData || typeof loaderData !== "object" || Array.isArray(loaderData)) {
    return [];
  }

  const products: SangdamrongProduct[] = [];
  const seen = new Set<string>();

  for (const routeData of Object.values(loaderData)) {
    if (!routeData || typeof routeData !== "object" || Array.isArray(routeData)) {
      continue;
    }
    const productTree = (routeData as Record<string, TurboValue>).products;
    if (!productTree) continue;
    walkForProducts(productTree, products, seen, "");
  }

  return products;
}

async function loadCatalog(): Promise<SangdamrongProduct[]> {
  const now = Date.now();
  if (cachedProducts && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedProducts;
  }

  const html = await fetchHomepage();
  const products = parseTurboStream(html);

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
    source: "sangdamrong.com SSR (React Router 7 turbo-stream)",
    results: filtered.map((p) => ({
      ...p,
      url: `${BASE_URL}`,
    })),
  };
}
