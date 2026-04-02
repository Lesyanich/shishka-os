/**
 * makro-lookup — Search products on makro.pro by barcode or name
 *
 * Runs on user's Mac (outside Cowork sandbox), so HTTP requests work.
 * Uses Makro's search page to find product details, price, and image.
 *
 * Two modes:
 *   - barcode: fetches https://www.makro.pro/search?q={barcode}
 *   - batch:   looks up multiple barcodes in sequence
 */

interface MakroProduct {
  barcode: string;
  name: string | null;
  price: number | null;
  unit: string | null;
  brand: string | null;
  image_url: string | null;
  product_url: string | null;
  found: boolean;
}

async function fetchMakroProduct(query: string): Promise<MakroProduct> {
  const url = `https://www.makro.pro/search?q=${encodeURIComponent(query)}`;

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9,th;q=0.8",
      },
    });

    if (!response.ok) {
      return {
        barcode: query,
        name: null,
        price: null,
        unit: null,
        brand: null,
        image_url: null,
        product_url: null,
        found: false,
      };
    }

    const html = await response.text();

    // Extract product data from the HTML
    // Makro uses Next.js with JSON-LD or __NEXT_DATA__ for product info
    const result: MakroProduct = {
      barcode: query,
      name: null,
      price: null,
      unit: null,
      brand: null,
      image_url: null,
      product_url: null,
      found: false,
    };

    // Try to extract from __NEXT_DATA__ JSON
    const nextDataMatch = html.match(
      /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/
    );
    if (nextDataMatch) {
      try {
        const nextData = JSON.parse(nextDataMatch[1]);
        const products =
          nextData?.props?.pageProps?.initialData?.products ||
          nextData?.props?.pageProps?.products ||
          [];

        if (products.length > 0) {
          const p = products[0];
          result.found = true;
          result.name = p.name || p.title || null;
          result.price = p.price || p.salePrice || null;
          result.unit = p.unit || p.uom || null;
          result.brand = p.brand || null;
          result.image_url = p.image || p.imageUrl || p.thumbnail || null;
          result.product_url = p.slug
            ? `https://www.makro.pro/${p.slug}`
            : null;
          return result;
        }
      } catch {
        // JSON parse failed, try regex fallback
      }
    }

    // Fallback: try JSON-LD structured data
    const jsonLdMatch = html.match(
      /<script type="application\/ld\+json">([\s\S]*?)<\/script>/
    );
    if (jsonLdMatch) {
      try {
        const ld = JSON.parse(jsonLdMatch[1]);
        if (ld["@type"] === "Product" || ld.name) {
          result.found = true;
          result.name = ld.name || null;
          result.price = ld.offers?.price || null;
          result.brand = ld.brand?.name || null;
          result.image_url = ld.image || null;
          return result;
        }
      } catch {
        // continue to next fallback
      }
    }

    // Fallback: simple regex for product title and price
    const titleMatch = html.match(
      /<h[1-3][^>]*class="[^"]*product[^"]*"[^>]*>(.*?)<\/h[1-3]>/i
    );
    if (titleMatch) {
      result.found = true;
      result.name = titleMatch[1].replace(/<[^>]+>/g, "").trim();
    }

    const priceMatch = html.match(/฿\s*([\d,]+\.?\d*)/);
    if (priceMatch) {
      result.price = parseFloat(priceMatch[1].replace(",", ""));
    }

    // Check if search returned "no results"
    if (
      html.includes("ไม่พบสินค้า") ||
      html.includes("No results") ||
      html.includes("0 สินค้า")
    ) {
      result.found = false;
    }

    return result;
  } catch (err: any) {
    return {
      barcode: query,
      name: null,
      price: null,
      unit: null,
      brand: null,
      image_url: null,
      product_url: `https://www.makro.pro/search?q=${encodeURIComponent(query)}`,
      found: false,
    };
  }
}

export interface MakroLookupArgs {
  barcode?: string;
  name?: string;
  barcodes?: string[];
}

export async function makroLookup(args: MakroLookupArgs) {
  // Single lookup by barcode or name
  if (args.barcode || args.name) {
    const query = args.barcode || args.name!;
    const product = await fetchMakroProduct(query);
    return {
      mode: "single",
      query,
      search_url: `https://www.makro.pro/search?q=${encodeURIComponent(query)}`,
      ...product,
    };
  }

  // Batch lookup
  if (args.barcodes && args.barcodes.length > 0) {
    const results: MakroProduct[] = [];
    const limit = Math.min(args.barcodes.length, 20); // cap at 20

    for (let i = 0; i < limit; i++) {
      const product = await fetchMakroProduct(args.barcodes[i]);
      results.push(product);
      // Small delay between requests to be polite
      if (i < limit - 1) {
        await new Promise((r) => setTimeout(r, 500));
      }
    }

    const found = results.filter((r) => r.found).length;
    return {
      mode: "batch",
      total: results.length,
      found,
      not_found: results.length - found,
      results,
    };
  }

  return {
    error: "Provide barcode, name, or barcodes[] array",
  };
}
