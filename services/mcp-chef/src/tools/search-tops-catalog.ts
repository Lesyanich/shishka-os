/**
 * search-tops-catalog — Browse the Tops Online (tops.co.th) product catalog.
 *
 * Tops is a major Thai supermarket (Central Retail). Unlike Makro/HomePro/
 * Sangdamrong, the ENTIRE tops.co.th domain (HTML, api.tops.co.th, and the
 * Next.js `_next/data` JSON routes) sits behind Cloudflare Bot Management.
 * Plain `fetch()`/curl is hard-blocked at the TLS (JA3) layer — every request
 * returns a 403 "Sorry, you have been blocked" interstitial regardless of
 * headers. A real browser passes; a Node HTTP client does not.
 *
 * So this scraper drives a headless Chromium via Playwright. To keep it fast
 * and to avoid tripping Cloudflare's rate limiter, it is built around a single
 * WARM, REUSED browser context:
 *   - One Chromium + context + page is launched on first use and kept alive
 *     (the Cloudflare clearance cookies live on the context, so paying the
 *     launch + challenge cost ONCE makes every later call ~1-2s of pure fetch).
 *   - The warm page sits on the tops.co.th origin; the Next.js `_next/data`
 *     route is same-origin and absolute-path, so ANY category can be fetched
 *     from that one page WITHOUT re-navigating.
 *   - Calls are serialized (one warm page can't serve two scrapes at once) and
 *     each page fetch is paced + retried with exponential backoff; on a 403 the
 *     scraper re-navigates once to refresh Cloudflare clearance before giving up.
 *   - The browser auto-closes after a few idle minutes to free memory.
 *
 * Products live at `pageProps.categoryData.products[]` (barcode, price, stock,
 * brand, image, 3-level category). Two modes:
 *   - `search`: keyword search across ALL categories, via the `/en/search/<q>`
 *     route → data route `en/search/<q>.json?slug=<q>`. This is what the site's
 *     search box uses (the old `/en/search?q=` is dead/404). Preferred.
 *   - `category`: browse one category by URL or slug-path.
 * An optional `query` token-filters the returned products (Makro-style).
 *
 * Playwright is an optional heavy dependency. If it is not installed, the
 * lazyScraper() wrapper in index.ts surfaces a clean "module not available"
 * error instead of crashing the chef MCP.
 */

import type { Browser, BrowserContext, Page } from "playwright";

const BASE_URL = "https://www.tops.co.th";
const ASSET_BASE = "https://assets.tops.co.th";
const ORIGIN_PAGE = `${BASE_URL}/en`;
const PAGE_SIZE = 40; // Tops returns 40 products per catalog page
const IDLE_CLOSE_MS = 5 * 60 * 1000; // close the warm browser after 5 min idle

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export interface TopsProduct {
  product_id: string;
  name: string;
  name_th: string;
  brand: string;
  barcode: string;
  sku: string;
  price_thb: number;
  original_price_thb: number | null;
  discount_pct: number | null;
  unit: string;
  in_stock: boolean;
  stock: number;
  image_url: string;
  product_url: string;
  category: string;
}

// ─── Warm browser state (module-level singletons) ────────────────────

let browser: Browser | null = null;
let context: BrowserContext | null = null;
let page: Page | null = null;
let buildId: string | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
let shutdownHooked = false;
let callChain: Promise<unknown> = Promise.resolve();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Serialize Tops calls — one warm page cannot safely serve two scrapes at once. */
function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = callChain.then(fn, fn);
  callChain = run.catch(() => {});
  return run;
}

async function loadChromium(): Promise<typeof import("playwright").chromium> {
  const mod = await import("playwright");
  return mod.chromium;
}

function hookShutdown() {
  if (shutdownHooked) return;
  shutdownHooked = true;
  const close = () => {
    browser?.close().catch(() => {});
  };
  process.once("exit", close);
  process.once("SIGINT", () => {
    close();
    process.exit(0);
  });
  process.once("SIGTERM", () => {
    close();
    process.exit(0);
  });
}

function scheduleIdleClose() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    void closeBrowser();
  }, IDLE_CLOSE_MS);
  // Don't let the idle timer keep the process alive.
  (idleTimer as { unref?: () => void }).unref?.();
}

async function closeBrowser() {
  const b = browser;
  browser = null;
  context = null;
  page = null;
  buildId = null;
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
  await b?.close().catch(() => {});
}

async function readBuildId(p: Page): Promise<string | null> {
  return p.evaluate(() => (window as any).__NEXT_DATA__?.buildId ?? null);
}

/** Navigate the warm page to the Tops origin and refresh Cloudflare clearance + buildId. */
async function navigateAndClear(p: Page): Promise<void> {
  await p.goto(ORIGIN_PAGE, { waitUntil: "domcontentloaded", timeout: 45000 });
  buildId = await readBuildId(p);
  if (!buildId) {
    await p.waitForTimeout(4000); // give a Cloudflare JS challenge time to clear
    buildId = await readBuildId(p);
  }
}

/** Ensure a warm page exists, is on the Tops origin, and we know the buildId. */
async function getReadyPage(): Promise<Page> {
  const chromium = await loadChromium();

  if (browser && !browser.isConnected()) {
    // Browser died — reset everything.
    browser = null;
    context = null;
    page = null;
    buildId = null;
  }

  if (!browser || !context) {
    browser = await chromium.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-blink-features=AutomationControlled",
        "--disable-dev-shm-usage",
      ],
    });
    context = await browser.newContext({
      userAgent: USER_AGENT,
      locale: "en-US",
      viewport: { width: 1366, height: 900 },
    });
    page = null;
    buildId = null;
    hookShutdown();
  }

  if (!page || page.isClosed()) {
    page = await context.newPage();
    buildId = null;
  }

  if (!page.url().startsWith(BASE_URL) || !buildId) {
    await navigateAndClear(page);
  }

  return page;
}

// ─── Pure helpers ────────────────────────────────────────────────────

/** Strip a full URL or leading/trailing slashes + `en/` prefix down to `a/b/c`. */
function normalizeCategoryPath(input: string): string {
  let p = input.trim();
  const m = p.match(/^https?:\/\/[^/]+\/(.*)$/i);
  if (m) p = m[1];
  p = p.split("?")[0].split("#")[0];
  p = p.replace(/^\/+/, "").replace(/\/+$/, "");
  p = p.replace(/^(en|th)\//i, "");
  return p;
}

/**
 * Build a Next.js data-route URL.
 *  - browse: pagePath = "a/b/c" (already slug-safe), slugValues = ["a","b","c"]
 *  - search: pagePath = "search/<encoded q>", slugValues = ["<q>"]
 */
function buildDataRouteUrl(
  bid: string,
  pagePath: string,
  slugValues: string[],
  pageNum: number,
): string {
  const slugParams = slugValues.map((s) => `slug=${encodeURIComponent(s)}`).join("&");
  const pageParam = pageNum > 1 ? `&page=${pageNum}` : "";
  return `${BASE_URL}/_next/data/${bid}/en/${pagePath}.json?${slugParams}${pageParam}`;
}

function queryTokens(q: string): string[] {
  return q
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length >= 3);
}

function productMatchesAnyToken(p: TopsProduct, tokens: string[]): boolean {
  if (tokens.length === 0) return true;
  const hay = `${p.name} ${p.name_th} ${p.brand}`.toLowerCase();
  return tokens.some((t) => hay.includes(t));
}

function num(v: unknown): number {
  const n = parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
}

function mapProduct(raw: any): TopsProduct {
  const price = num(raw.price);
  const original = num(raw.originalPrice);
  const discountPct =
    original > 0 && price > 0 && original > price
      ? Math.round((1 - price / original) * 100)
      : null;

  let image = String(raw.pimImage || "");
  if (image && image.startsWith("/")) image = `${ASSET_BASE}${image}`;

  const slug = String(raw.slugName || "");
  const categoryParts = [
    raw.categoryLevel1Name || raw.categoryLevel1,
    raw.categoryLevel2,
    raw.categoryLevel3,
  ].filter(Boolean);

  return {
    product_id: String(raw.sku || raw.prCode || ""),
    name: String(raw.nameEN || raw.name || ""),
    name_th: String(raw.name || ""),
    brand: String(raw.brand || ""),
    barcode: String(raw.prCode || raw.sku || ""),
    sku: String(raw.sku || ""),
    price_thb: price,
    original_price_thb: original > price ? original : null,
    discount_pct: discountPct,
    unit: String(raw.unitName || ""),
    in_stock: num(raw.stockAvail) > 0,
    stock: num(raw.stockAvail),
    image_url: image,
    product_url: slug ? `${BASE_URL}/en/${slug}` : BASE_URL,
    category: categoryParts.join(" > "),
  };
}

/** Pull the products array out of a Next.js data-route payload, defensively. */
function extractProducts(payload: any): { products: any[]; total: number } {
  const cd = payload?.pageProps?.categoryData;
  if (cd && Array.isArray(cd.products)) {
    return { products: cd.products, total: num(cd.totalProducts) || cd.products.length };
  }
  let found: any[] = [];
  (function walk(o: any, d: number) {
    if (d > 8 || !o || typeof o !== "object" || found.length) return;
    if (Array.isArray(o)) {
      if (o.length && o[0] && typeof o[0] === "object" && "sku" in o[0] && "price" in o[0]) {
        found = o;
        return;
      }
      for (const it of o.slice(0, 1)) walk(it, d + 1);
      return;
    }
    for (const k of Object.keys(o)) walk(o[k], d + 1);
  })(payload?.pageProps, 0);
  return { products: found, total: found.length };
}

type FetchResult =
  | { ok: true; payload: any }
  | { ok: false; status: number; exhausted?: boolean };

/**
 * Fetch one catalog page's data-route from the warm page, with pacing,
 * exponential backoff on 403, and a one-time Cloudflare-clearance refresh.
 * The URL is rebuilt from the live `buildId` on every attempt (a clearance
 * refresh may change it).
 */
async function fetchDataPage(
  p: Page,
  pagePath: string,
  slugValues: string[],
  pageNum: number,
  maxAttempts = 4,
): Promise<FetchResult> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (!buildId) await navigateAndClear(p);
    if (!buildId) return { ok: false, status: 0 };

    const url = buildDataRouteUrl(buildId, pagePath, slugValues, pageNum);
    const res = await p.evaluate(async (u: string) => {
      try {
        const r = await fetch(u, { headers: { "x-nextjs-data": "1" } });
        if (!r.ok) return { __status: r.status };
        return await r.json();
      } catch (e) {
        return { __err: String(e) };
      }
    }, url);

    if (res && !res.__status && !res.__err) return { ok: true, payload: res };
    if (res?.__status === 404) return { ok: false, status: 404 }; // bad path — don't retry

    // Blocked / transient. Back off, and at the midpoint refresh CF clearance.
    const backoff = 1200 * 2 ** attempt; // 1.2s, 2.4s, 4.8s, 9.6s
    await p.waitForTimeout(backoff);
    if (attempt === 1) {
      buildId = null; // force navigateAndClear() on next attempt
    }
  }
  return { ok: false, status: 403, exhausted: true };
}

// ─── Public tool ─────────────────────────────────────────────────────

export async function searchTopsCatalog(args: {
  search?: string;
  category?: string;
  query?: string;
  limit?: number;
  max_pages?: number;
}) {
  const searchTerm = (args.search || "").trim();
  const rawCategory = (args.category || "").trim();

  if (!searchTerm && !rawCategory) {
    return {
      error: "Provide either `search` (keyword) or `category` (slug-path).",
      hint:
        "Keyword search spans all categories, e.g. search='Biovitt'. " +
        "Category browse needs a slug-path, e.g. " +
        "category='health-and-beauty-care/health-and-supplement/vitamins-and-supplements' " +
        "(see api.tops.co.th/homepage/allcats for the tree).",
    };
  }

  // Mode resolution. `search` wins if both given.
  // browse:  /en/<a/b/c>          → data route en/<a/b/c>.json?slug=a&slug=b&slug=c
  // search:  /en/search/<query>   → data route en/search/<query>.json?slug=<query>
  const isSearch = !!searchTerm;
  const path = isSearch ? "" : normalizeCategoryPath(rawCategory);
  const pagePath = isSearch ? `search/${encodeURIComponent(searchTerm)}` : path;
  const slugValues = isSearch ? [searchTerm] : path.split("/").filter(Boolean);
  const label = isSearch ? `search "${searchTerm}"` : `category "${path}"`;
  const sourceUrl = isSearch
    ? `${BASE_URL}/en/search/${encodeURIComponent(searchTerm)}`
    : `${BASE_URL}/en/${path}`;

  const limit = Math.max(1, args.limit ?? 40);
  const maxPages = Math.max(1, Math.min(args.max_pages ?? (isSearch ? 3 : 1), 10));

  // Confirm Playwright is installed before taking the lock.
  try {
    await loadChromium();
  } catch {
    return {
      error:
        "Playwright is not installed. Tops sits behind Cloudflare and needs a " +
        "real browser. Run: cd services/mcp-chef && npm i playwright && npx playwright install chromium",
    };
  }

  return withLock(async () => {
    if (idleTimer) clearTimeout(idleTimer);
    try {
      const p = await getReadyPage();
      if (!buildId) {
        const title = await p.title().catch(() => "");
        return {
          error: "Blocked or unexpected page from tops.co.th (no Next.js buildId found).",
          page_title: title,
          hint: "Cloudflare may be challenging this session — retry shortly.",
          url: sourceUrl,
        };
      }

      const collected: any[] = [];
      let total = 0;
      let pagesFetched = 0;
      let truncatedByBlock = false;

      for (let pg = 1; pg <= maxPages; pg++) {
        const res = await fetchDataPage(p, pagePath, slugValues, pg);

        if (!res.ok) {
          if (pg === 1) {
            if (res.status === 404) {
              return {
                error: isSearch
                  ? `Tops search route returned 404 for ${label}.`
                  : `Tops category not found: ${label} (HTTP 404).`,
                hint: isSearch
                  ? "The /en/search/<query> data route may have changed — re-capture the search URL."
                  : "Check the slug-path is valid (no /en prefix needed). See api.tops.co.th/homepage/allcats.",
                url: sourceUrl,
              };
            }
            return {
              error:
                `Cloudflare blocked the request for ${label} after retries` +
                (res.status ? ` (HTTP ${res.status})` : " (challenge on navigation)") +
                ".",
              hint:
                "Your IP is being rate-limited by Cloudflare — wait ~1 minute and retry. " +
                "Avoid bursts of many fetches in quick succession.",
              url: sourceUrl,
            };
          }
          truncatedByBlock = res.exhausted === true; // later page blocked — return what we have
          break;
        }

        pagesFetched++;
        const { products, total: t } = extractProducts(res.payload);
        total = t || total;
        if (products.length === 0) break;
        collected.push(...products);

        if (collected.length >= limit) break;
        if (collected.length >= total) break;
        if (products.length < PAGE_SIZE) break; // last page

        await p.waitForTimeout(700); // pace between pages so we don't trip Cloudflare
      }

      if (collected.length === 0) {
        return {
          message: `No products found for Tops ${label}.`,
          url: sourceUrl,
          results: [],
        };
      }

      // Dedupe by barcode/sku, map, optional query filter, cap at limit.
      const seen = new Set<string>();
      let mapped = collected
        .map(mapProduct)
        .filter((pr) => {
          const key = pr.barcode || pr.sku || pr.product_id;
          if (key && seen.has(key)) return false;
          if (key) seen.add(key);
          return true;
        });

      const tokens = args.query ? queryTokens(args.query) : [];
      if (tokens.length > 0) {
        mapped = mapped.filter((pr) => productMatchesAnyToken(pr, tokens));
      }

      const scanned = collected.length;
      const complete = scanned >= total && !truncatedByBlock;

      if (mapped.length === 0) {
        return {
          message: args.query
            ? `No products matching "${args.query}" in Tops ${label} (scanned ${scanned}/${total}).`
            : `No products found for Tops ${label}.`,
          url: sourceUrl,
          scanned,
          total_available: total,
          complete,
          results: [],
        };
      }

      return {
        count: Math.min(mapped.length, limit),
        scanned,
        total_available: total,
        pages_fetched: pagesFetched,
        complete,
        ...(complete
          ? {}
          : {
              note: truncatedByBlock
                ? `Coverage incomplete: Cloudflare blocked a later page; scanned ${scanned} of ${total}. Retry or raise max_pages.`
                : `Scanned ${scanned} of ${total}; raise max_pages / limit for full coverage.`,
            }),
        source: "tops.co.th",
        mode: isSearch ? "search" : "browse",
        ...(isSearch ? { search: searchTerm } : { category: path }),
        url: sourceUrl,
        results: mapped.slice(0, limit),
      };
    } catch (err) {
      const e = err as { message?: string };
      // A hard failure may mean a wedged browser — drop it so the next call relaunches clean.
      await closeBrowser();
      return {
        error: `Tops scrape failed: ${e.message ?? String(err)}`,
        hint: "Cloudflare may be blocking the headless browser, or the search/category path is wrong.",
        url: sourceUrl,
      };
    } finally {
      scheduleIdleClose();
    }
  });
}
