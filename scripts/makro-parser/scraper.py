"""
Makro Pro scraper — search-based approach.

Makro Pro uses Typesense for search, results are embedded in SSR
via __NEXT_DATA__.props.pageProps.initialSearchResult.hits[].document.

Strategy:
  - Use /en/c/search?q=KEYWORD to get first 20 products per keyword.
  - Use /en/c/CATEGORY_SLUG for category browsing (products come via SSR too).
  - No authentication required — public SSR data.
"""

import json
import logging
import time
from typing import Any, Dict, List, Optional

import requests
from bs4 import BeautifulSoup

# Search keywords grouped by food category for broad coverage
FOOD_SEARCH_QUERIES: Dict[str, List[str]] = {
    "dairy-eggs": [
        "butter", "milk", "cheese", "yogurt", "cream", "egg",
        "margarine", "whipping cream", "condensed milk", "ghee",
    ],
    "fresh-meat": [
        "chicken", "pork", "beef", "duck", "lamb", "sausage",
        "bacon", "ham", "minced", "steak",
    ],
    "seafood": [
        "shrimp", "fish", "salmon", "squid", "crab", "tuna",
        "prawn", "mussel", "oyster", "mackerel",
    ],
    "grocery": [
        "rice", "flour", "sugar", "salt", "oil", "vinegar",
        "soy sauce", "pasta", "noodle", "coconut milk",
    ],
    "bakery": [
        "bread", "cake", "pastry", "croissant", "cookie", "muffin",
    ],
    "frozen": [
        "frozen", "ice cream", "dumpling", "frozen fish", "frozen shrimp",
    ],
    "beverages": [
        "water", "juice", "coffee", "tea", "soda", "syrup",
    ],
    "produce": [
        "vegetable", "fruit", "onion", "garlic", "tomato", "potato",
        "lettuce", "mushroom", "lemon", "lime",
    ],
    "condiments": [
        "sauce", "ketchup", "mayonnaise", "mustard", "dressing",
        "pepper", "chili", "curry", "seasoning", "herb",
    ],
}


class MakroScraper:
    BASE_URL = "https://www.makro.pro"

    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update(
            {
                "User-Agent": (
                    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/120.0.0.0 Safari/537.36"
                ),
                "Accept-Language": "en-US,en;q=0.9",
            }
        )
        self.last_request_time = 0.0
        self._seen_barcodes: set = set()

    def _throttle(self, delay: float) -> None:
        elapsed = time.time() - self.last_request_time
        if elapsed < delay:
            time.sleep(delay - elapsed)
        self.last_request_time = time.time()

    def _fetch_html(self, url: str, delay: float = 2.0) -> str:
        self._throttle(delay)
        attempts = 0
        while attempts < 3:
            try:
                resp = self.session.get(url, timeout=15)
                if resp.status_code in (429, 403):
                    backoff = 2 ** attempts * 5
                    logging.warning("Got %d from %s. Backing off %ds...", resp.status_code, url, backoff)
                    time.sleep(backoff)
                    attempts += 1
                    continue
                resp.raise_for_status()
                return resp.text
            except requests.RequestException as exc:
                logging.error("Error fetching %s: %s", url, exc)
                attempts += 1
                time.sleep(2)
        return ""

    def _parse_search_hits(self, html: str) -> List[Dict[str, Any]]:
        """Extract product documents from __NEXT_DATA__ SSR payload."""
        if not html:
            return []
        soup = BeautifulSoup(html, "html.parser")
        script = soup.find("script", id="__NEXT_DATA__")
        if not script or not script.string:
            return []
        try:
            data = json.loads(script.string)
        except json.JSONDecodeError:
            return []

        isr = data.get("props", {}).get("pageProps", {}).get("initialSearchResult")
        if not isr:
            return []

        hits = isr.get("hits") or []
        products: List[Dict[str, Any]] = []
        for hit in hits:
            doc = hit.get("document")
            if not doc:
                continue
            barcode = doc.get("itemBarCode") or ""
            if not barcode:
                continue
            if barcode in self._seen_barcodes:
                continue
            self._seen_barcodes.add(barcode)
            products.append(doc)
        return products

    def search_products(self, query: str, delay: float = 3.0) -> List[Dict[str, Any]]:
        """
        Search Makro Pro and return product documents from SSR.
        Returns up to 20 unique products per query.
        """
        url = f"{self.BASE_URL}/en/c/search?q={requests.utils.quote(query)}"
        logging.info("Searching: %s", url)
        html = self._fetch_html(url, delay=delay)
        products = self._parse_search_hits(html)
        logging.info("  → %d new products for query '%s'", len(products), query)
        return products

    def scrape_category(
        self,
        category: str,
        limit: int = 200,
    ) -> List[Dict[str, Any]]:
        """
        Scrape products for a food category using multiple search queries.
        Uses FOOD_SEARCH_QUERIES mapping for broad coverage.
        """
        queries = FOOD_SEARCH_QUERIES.get(category)
        if not queries:
            logging.warning("Unknown category '%s'. Using it as a single search query.", category)
            queries = [category]

        all_products: List[Dict[str, Any]] = []
        for q in queries:
            if len(all_products) >= limit:
                break
            batch = self.search_products(q)
            all_products.extend(batch)
            if len(all_products) >= limit:
                all_products = all_products[:limit]
                break

        logging.info(
            "Category '%s': %d unique products from %d queries",
            category,
            len(all_products),
            len(queries),
        )
        return all_products

    def get_category_products(self, category_slug: str) -> List[Dict[str, Any]]:
        """
        Backwards-compatible: returns list of product documents (not slugs).
        Called by main.py.
        """
        return self.scrape_category(category_slug)

    @staticmethod
    def doc_to_parsed(doc: Dict[str, Any]) -> Dict[str, Any]:
        """
        Convert a Typesense document to the format expected by mapper/db.
        This replaces the old parse_product_json flow.
        """
        title_en = doc.get("titleEn") or ""
        title_th = doc.get("title") or ""
        brand_en = doc.get("brandEn") or ""
        barcode = doc.get("itemBarCode") or ""
        makro_code = doc.get("makroId") or ""
        price = doc.get("displayPrice") or doc.get("originalPrice") or 0
        packaging_weight = doc.get("packagingWeight") or ""
        unit_size = doc.get("unitSize") or ""
        unit_type = doc.get("unitType") or ""
        categories = doc.get("categories") or []
        deepest = doc.get("deepestCategory") or ""

        # Parse weight from title (e.g. "227 g", "1 kg", "200 ml")
        import re

        pkg_qty: Optional[float] = None
        pkg_unit: Optional[str] = None
        weight_match = re.search(r"(\d+(?:\.\d+)?)\s*(g|kg|ml|l|pcs|unit)\b", title_en, re.IGNORECASE)
        if weight_match:
            try:
                pkg_qty = float(weight_match.group(1))
            except ValueError:
                pkg_qty = None
            pkg_unit = weight_match.group(2).lower()
            if pkg_unit == "l":
                pkg_unit = "L"

        return {
            "original_name": title_en or title_th,
            "english_name": title_en,
            "thai_name": title_th,
            "brand": brand_en,
            "price": price,
            "makro_code": str(makro_code),
            "barcode": barcode,
            "package_weight_raw": packaging_weight or (f"{pkg_qty} {pkg_unit}" if pkg_qty else ""),
            "package_qty": pkg_qty,
            "package_unit": pkg_unit or "pcs",
            "package_type": "case",
            "purchase_unit": "pc",
            "category_path": categories,
            "deepest_category": deepest,
        }
