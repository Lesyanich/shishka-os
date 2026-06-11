/**
 * search-line-catalog — Pull a LINE SHOPPING storefront's full catalog by handle.
 *
 * LINE SHOPPING (shop.line.me) hosts per-merchant storefronts, e.g.
 * shop.line.me/@biovittofficial (Biovitt — whey protein & supplements).
 *
 * Unlike Makro/Tops this is NOT a marketplace-wide search: it pulls ONE
 * shop's products by its @handle.
 *
 * PRIMARY path (complete): the public storefront search API
 *   POST https://customer-api.line-apps.com/search/graph
 *   operation shopProductListQuery(shopId, page, limit, …)
 * returns the FULL paginated catalog (totalProduct / totalPage) with id,
 * name, price, salePrice, discountPercent, isInStock, imageUrl. No auth, no
 * cookies — just content-type + referer. We resolve @handle → numeric
 * shopId from the shop landing page, then page through the whole catalog.
 *
 * FALLBACK path: if shopId can't be resolved or the API fails, parse the
 * server-rendered collection pages (Nuxt 3 SSR, ~12 products/collection
 * above the fold, aggregated + deduped). Less complete but dependency-free.
 *
 * The optional `query` filters the (complete) result set by name token match
 * client-side. Zero external dependencies — native fetch.
 */

const BASE_URL = "https://shop.line.me";
const SEARCH_API = "https://customer-api.line-apps.com/search/graph";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// GraphQL operation captured from shop.line.me's own search page.
const SHOP_PRODUCT_LIST_QUERY = `query shopProductListQuery($limit: Int!, $page: Int!, $shopId: Int!, $sortType: SortType!, $sortSoldOutType: SortSoldOutType!, $isGift: Boolean!, $filterLSProhibited: Boolean!) {
  shopProductList(limit: $limit, page: $page, shopId: $shopId, sortType: $sortType, sortSoldOutType: $sortSoldOutType, isGift: $isGift, filterLSProhibited: $filterLSProhibited) {
    totalPage
    totalProduct
    products { id name imageUrl discountPercent price salePrice isInStock }
  }
}`;

export interface LineProduct {
  product_id: string;
  name: string;
  price_thb: number;
  original_price_thb: number | null;
  discount_pct: number | null;
  in_stock: boolean;
  category: string; // collection name (SSR fallback only; "" via API)
  shop_handle: string;
  image_url: string;
  product_url: string;
}

interface Collection {
  id: string;
  name: string;
}

/** Strip a full URL / leading @ / trailing slashes → bare handle. */
function normalizeHandle(input: string): string {
  let h = input.trim();
  const urlMatch = h.match(/shop\.line\.me\/(@?[^/?#\s]+)/i);
  if (urlMatch) h = urlMatch[1];
  h = h.replace(/^@/, "").replace(/[/?#].*$/, "").trim();
  return h;
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

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchHtml(url: string, retries = 2): Promise<string | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const resp = await fetch(url, {
        headers: {
          "User-Agent": USER_AGENT,
          "Accept-Language": "th-TH,th;q=0.9,en;q=0.8",
          Accept: "text/html,application/xhtml+xml",
        },
      });
      if (resp.status === 429 || resp.status === 403) {
        await new Promise((r) => setTimeout(r, 2 ** attempt * 2000));
        continue;
      }
      if (resp.status === 404) return null;
      if (!resp.ok) return null;
      return await resp.text();
    } catch {
      if (attempt < retries) await new Promise((r) => setTimeout(r, 1500));
    }
  }
  return null;
}

/** Resolve @handle → numeric shopId from the shop landing page payload. */
function extractShopId(html: string): number | null {
  // Most stable anchor: "shop:402242:promotions#hash=…" in the Nuxt payload.
  let m = html.match(/shop:(\d{3,}):/);
  if (m) return parseInt(m[1], 10);
  // Fallback: the displayName is preceded by the id in the devalue array,
  // e.g. 402242,"Biovitt Official".
  m = html.match(/(\d{4,}),"[^"]*Official"/);
  if (m) return parseInt(m[1], 10);
  return null;
}

/** Pull the entire catalog via the storefront search API (paginated). */
async function fetchCatalogViaApi(
  shopId: number,
  handle: string
): Promise<LineProduct[] | null> {
  const out: LineProduct[] = [];
  const limit = 100;
  let page = 1;
  let totalPage = 1;

  do {
    let data: any = null;
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
            operationName: "shopProductListQuery",
            variables: {
              limit,
              page,
              shopId,
              sortType: "POPULAR",
              sortSoldOutType: "NONE",
              isGift: false,
              filterLSProhibited: false,
            },
            query: SHOP_PRODUCT_LIST_QUERY,
          }),
        });
        if (resp.status === 429 || resp.status === 403) {
          await new Promise((r) => setTimeout(r, 2 ** attempt * 1500));
          continue;
        }
        if (!resp.ok) return out.length ? out : null;
        data = await resp.json();
        break;
      } catch {
        if (attempt < 2) await new Promise((r) => setTimeout(r, 1500));
      }
    }

    const list = data?.data?.shopProductList;
    if (!list) return out.length ? out : null;
    totalPage = list.totalPage || 1;

    for (const p of list.products || []) {
      const price = parsePrice(p.price);
      const sale = parsePrice(p.salePrice) || price;
      out.push({
        product_id: String(p.id),
        name: decodeEntities(String(p.name || "")),
        price_thb: sale,
        original_price_thb: price > sale ? price : null,
        discount_pct: p.discountPercent ? Number(p.discountPercent) : null,
        in_stock: p.isInStock !== false,
        category: "",
        shop_handle: `@${handle}`,
        image_url: p.imageUrl || "",
        product_url: `${BASE_URL}/@${handle}/product/${p.id}`,
      });
    }
    page++;
    if (page <= totalPage) await new Promise((r) => setTimeout(r, 250));
  } while (page <= totalPage);

  return out;
}

// ─── SSR fallback ─────────────────────────────────────────────────────

function extractCollections(html: string, handle: string): Collection[] {
  const out: Collection[] = [];
  const seen = new Set<string>();
  const linkRe = new RegExp(`/@${handle}/collection/(\\d+)"([\\s\\S]*?)</a>`, "g");
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(html)) !== null) {
    const id = m[1];
    if (seen.has(id)) continue;
    seen.add(id);
    const nameMatch = m[2].match(/>([^<>]{2,60})<\/p>/);
    out.push({ id, name: nameMatch ? decodeEntities(nameMatch[1]) : `Collection ${id}` });
  }
  return out;
}

function parseProductsSsr(html: string, category: string, handle: string): LineProduct[] {
  const imgMap = new Map<string, string>();
  const imgRe = /data-atd="product-item-image"[^>]*?(?:src|data-src)="([^"]+)"[^>]*?alt="([^"]*)"/g;
  let im: RegExpExecArray | null;
  while ((im = imgRe.exec(html)) !== null) {
    const alt = decodeEntities(im[2]);
    if (alt && alt !== "default" && !imgMap.has(alt)) imgMap.set(alt, im[1]);
  }

  const products: LineProduct[] = [];
  const cardRe = /product-item-name"[^>]*>([^<]{2,200})<([\s\S]*?)(?=product-item-name"|$)/g;
  let c: RegExpExecArray | null;
  while ((c = cardRe.exec(html)) !== null) {
    const name = decodeEntities(c[1]);
    if (!name) continue;
    const block = c[2];
    const priceMatch = block.match(/฿\s*([\d,]+)/);
    if (!priceMatch) continue;
    const price = parseFloat(priceMatch[1].replace(/,/g, ""));
    const discMatch = block.match(/discount-percent-badge[^>]*>\s*-?\s*(\d+)\s*%/);

    products.push({
      product_id: "",
      name,
      price_thb: price,
      original_price_thb: null,
      discount_pct: discMatch ? parseInt(discMatch[1], 10) : null,
      in_stock: true,
      category,
      shop_handle: `@${handle}`,
      image_url: imgMap.get(name) || "",
      product_url: `${BASE_URL}/@${handle}`,
    });
  }
  return products;
}

async function fetchCatalogViaSsr(
  shopUrl: string,
  handle: string,
  landing: string,
  maxCollections: number
): Promise<{ products: LineProduct[]; collections: Collection[] }> {
  const collections = extractCollections(landing, handle).slice(0, maxCollections);
  const all: LineProduct[] = [];
  for (const col of collections) {
    const html = await fetchHtml(`${shopUrl}/collection/${col.id}`);
    if (html) all.push(...parseProductsSsr(html, col.name, handle));
    await new Promise((r) => setTimeout(r, 350));
  }
  return { products: all, collections };
}

// ─── Entry point ──────────────────────────────────────────────────────

export async function searchLineCatalog(args: {
  handle: string;
  query?: string;
  shop_id?: number;
  limit?: number;
  max_collections?: number;
}) {
  if (!args.handle || !args.handle.trim()) {
    return { error: "handle is required (e.g. '@biovittofficial')" };
  }

  const handle = normalizeHandle(args.handle);
  const limit = args.limit ?? 200;
  const maxCollections = Math.min(args.max_collections ?? 15, 30);
  const shopUrl = `${BASE_URL}/@${handle}`;

  // Resolve shopId (from arg, else from landing page).
  let shopId = args.shop_id ?? null;
  let landing: string | null = null;
  if (!shopId) {
    landing = await fetchHtml(shopUrl);
    if (!landing) {
      return {
        error: `Could not load LINE shop @${handle}`,
        hint: "Check the handle. Example: search_line_catalog(handle='@biovittofficial')",
        shop_url: shopUrl,
      };
    }
    shopId = extractShopId(landing);
  }

  // PRIMARY: full catalog via storefront API.
  if (shopId) {
    const apiProducts = await fetchCatalogViaApi(shopId, handle);
    if (apiProducts && apiProducts.length) {
      const results = filterAndDedup(apiProducts, args.query);
      return {
        count: Math.min(results.length, limit),
        total_parsed: results.length,
        source: "shop.line.me (storefront API)",
        shop_handle: `@${handle}`,
        shop_id: shopId,
        shop_url: shopUrl,
        results: results.slice(0, limit),
      };
    }
  }

  // FALLBACK: SSR collection scan.
  if (!landing) landing = await fetchHtml(shopUrl);
  if (!landing) {
    return {
      error: `Could not load LINE shop @${handle} (API and SSR both failed)`,
      shop_url: shopUrl,
    };
  }
  const { products, collections } = await fetchCatalogViaSsr(
    shopUrl,
    handle,
    landing,
    maxCollections
  );
  const results = filterAndDedup(products, args.query);
  if (results.length === 0) {
    return {
      error: `No products parsed from @${handle}`,
      hint: shopId
        ? "Storefront API returned nothing and SSR found no products."
        : "Could not resolve shopId; pass shop_id explicitly if you know it.",
      shop_url: shopUrl,
      collections,
    };
  }
  return {
    count: Math.min(results.length, limit),
    total_parsed: results.length,
    source: "shop.line.me (SSR fallback)",
    shop_handle: `@${handle}`,
    shop_url: shopUrl,
    collections,
    note: "SSR fallback — ~12 products/collection above the fold, deduped. Pass shop_id for the complete API catalog.",
    results: results.slice(0, limit),
  };
}

/** Dedup by product_id (API) or name (SSR), keep the lowest seen price. */
function filterAndDedup(products: LineProduct[], query?: string): LineProduct[] {
  const byKey = new Map<string, LineProduct>();
  for (const p of products) {
    const key = p.product_id || p.name.toLowerCase();
    const existing = byKey.get(key);
    if (!existing || p.price_thb < existing.price_thb) byKey.set(key, p);
  }
  let out = [...byKey.values()];

  if (query && query.trim()) {
    const tokens = query.toLowerCase().split(/\s+/).filter((t) => t.length >= 2);
    if (tokens.length) {
      out = out.filter((p) => {
        const hay = p.name.toLowerCase();
        return tokens.every((t) => hay.includes(t));
      });
    }
  }
  return out;
}
