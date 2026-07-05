#!/usr/bin/env python3
"""
Makro API barcode enrichment for RAW-AUTO nomenclature items.

Queries Makro Pro website by barcode to verify/correct OCR-parsed
names, weights, units. Updates nomenclature + supplier_catalog.
Merges duplicates. Renames RAW-AUTO → RAW-{CLEAN_NAME}.

Usage:
  python3 enrich_makro.py --dry-run   # preview
  python3 enrich_makro.py             # execute
"""

import hashlib
import logging
import os
import re
import subprocess
import sys
import time
from typing import Any, Optional

logging.basicConfig(level=logging.INFO, format="%(message)s")

try:
    import psycopg2
    import psycopg2.extras
except ImportError:
    subprocess.check_call([sys.executable, "-m", "pip", "install", "psycopg2-binary", "-q"])
    import psycopg2
    import psycopg2.extras

# Add makro-parser to path
sys.path.insert(0, "tools/makro-parser")
from scraper import MakroScraper
from mapper import normalize_package_weight

MAKRO_SUPPLIER_ID = "c548db19-8a70-4f34-96af-d66162793cbf"


def get_db_url() -> str:
    """Retrieve DATABASE_URL from env var (cloud/CI) or macOS Keychain (local)."""
    env_url = os.environ.get("DATABASE_URL", "").strip()
    if env_url:
        return env_url
    result = subprocess.run(
        ["security", "find-generic-password", "-s", "shishka-database-url", "-w"],
        capture_output=True, text=True,
    )
    url = result.stdout.strip()
    if not url:
        raise RuntimeError("DATABASE_URL not found in env or Keychain (shishka-database-url)")
    return url


def fetch_raw_auto_items(cur) -> list[dict]:
    """Get all RAW-AUTO items with barcodes from purchase_logs."""
    cur.execute("""
        SELECT DISTINCT ON (n.id)
            n.id AS nom_id,
            n.product_code,
            n.name AS ocr_name,
            n.base_unit,
            n.cost_per_unit,
            pl.barcode
        FROM nomenclature n
        JOIN purchase_logs pl ON pl.nomenclature_id = n.id
        WHERE n.product_code LIKE 'RAW-AUTO-%%'
          AND n.is_available = true
          AND pl.barcode IS NOT NULL
          AND pl.barcode <> ''
        ORDER BY n.id, pl.created_at DESC
    """)
    cols = [d[0] for d in cur.description]
    return [dict(zip(cols, row)) for row in cur.fetchall()]


def search_makro_by_barcode(scraper: MakroScraper, barcode: str) -> Optional[dict]:
    """Search Makro by barcode. Returns parsed product or None."""
    results = scraper.search_products(barcode, delay=2.5)
    if not results:
        return None
    # Find exact barcode match
    for doc in results:
        if doc.get("itemBarCode") == barcode:
            return scraper.doc_to_parsed(doc)
    # If no exact match, return first result anyway (Typesense fuzzy)
    return scraper.doc_to_parsed(results[0]) if results else None


def make_clean_product_code(name: str) -> str:
    """Convert 'ARO Frozen Salmon Steak 120-160g' → 'RAW-SALMON_STEAK_ARO_FROZEN'."""
    # Remove weight/quantity suffixes
    clean = re.sub(r"\d+(?:\.\d+)?\s*(?:g|kg|ml|l|pcs|pc|x\d+)\b", "", name, flags=re.I)
    # Remove brand prefixes that are too generic
    clean = re.sub(r"^(ARO|ARO-G|MAKRO)\s+", "", clean, flags=re.I)
    # Normalize
    clean = re.sub(r"[^a-zA-Z0-9\s]", "", clean)
    clean = "_".join(clean.upper().split())
    # Truncate
    if len(clean) > 40:
        clean = clean[:40].rstrip("_")
    return f"RAW-{clean}" if clean else None


def determine_base_unit(makro_data: dict) -> str:
    """Determine correct base_unit from Makro data."""
    pkg_unit = (makro_data.get("package_unit") or "").lower()
    name = (makro_data.get("english_name") or "").lower()

    if pkg_unit in ("kg", "g"):
        return "kg"
    if pkg_unit in ("l", "ml"):
        return "L"

    # Heuristic from name
    if any(w in name for w in ["oil", "sauce", "juice", "milk", "water", "syrup"]):
        return "L"
    if any(w in name for w in ["egg", "piece", "box", "can", "bottle", "pack"]):
        return "pcs"
    return "kg"


def calc_conversion_factor(makro_data: dict, base_unit: str) -> Optional[float]:
    """Calculate conversion_factor from package to base_unit."""
    qty = makro_data.get("package_qty")
    unit = (makro_data.get("package_unit") or "").lower()

    if qty is None or not unit:
        return None

    if base_unit == "kg":
        if unit == "g":
            return qty / 1000.0
        if unit == "kg":
            return qty
    elif base_unit == "L":
        if unit == "ml":
            return qty / 1000.0
        if unit in ("l",):
            return qty

    return None


def main():
    dry_run = "--dry-run" in sys.argv
    db_url = get_db_url()
    conn = psycopg2.connect(db_url)
    scraper = MakroScraper()

    if dry_run:
        logging.info("=== DRY RUN ===\n")

    try:
        with conn.cursor() as cur:
            items = fetch_raw_auto_items(cur)
            logging.info(f"Found {len(items)} RAW-AUTO items with barcodes\n")

            verified = 0
            not_found = 0
            renamed = 0
            errors = 0

            for item in items:
                barcode = item["barcode"]
                ocr_name = item["ocr_name"]

                try:
                    makro = search_makro_by_barcode(scraper, barcode)
                except Exception as e:
                    logging.warning(f"  ERROR querying Makro for {barcode}: {e}")
                    errors += 1
                    continue

                if not makro:
                    logging.info(f"  [MISS] {barcode} | {ocr_name[:45]}")
                    not_found += 1
                    continue

                makro_name = makro.get("english_name") or ocr_name
                base_unit = determine_base_unit(makro)
                conv_factor = calc_conversion_factor(makro, base_unit)
                brand = makro.get("brand") or ""
                pkg_weight = makro.get("package_weight_raw") or ""
                pkg_qty = makro.get("package_qty")
                pkg_unit = makro.get("package_unit")

                name_changed = makro_name.lower().strip() != ocr_name.lower().strip()
                tag = "FIX " if name_changed else "OK  "

                logging.info(
                    f"  [{tag}] {barcode} | OCR: {ocr_name[:35]:<35} → Makro: {makro_name[:35]}"
                    f" | {pkg_weight} | conv={conv_factor or '?'}"
                )

                if not dry_run:
                    # Update nomenclature
                    new_code = make_clean_product_code(makro_name)
                    if new_code:
                        # Check uniqueness
                        cur.execute("SELECT 1 FROM nomenclature WHERE product_code = %s AND id != %s", (new_code, item["nom_id"]))
                        if cur.fetchone():
                            new_code = None  # conflict, keep RAW-AUTO

                    update_fields = {"name": makro_name, "base_unit": base_unit, "updated_at": "now()"}
                    if new_code:
                        update_fields["product_code"] = new_code
                        renamed += 1

                    set_clause = ", ".join(f"{k} = %s" for k in update_fields)
                    vals = [v if v != "now()" else None for v in update_fields.values()]
                    # Use raw SQL for now()
                    set_clause = set_clause.replace("updated_at = %s", "updated_at = now()")
                    vals = [v for k, v in update_fields.items() if k != "updated_at"]

                    cur.execute(
                        f"UPDATE nomenclature SET name = %s, base_unit = %s, "
                        f"{'product_code = %s, ' if new_code else ''}"
                        f"updated_at = now() WHERE id = %s",
                        [makro_name, base_unit] + ([new_code] if new_code else []) + [item["nom_id"]],
                    )

                    # Upsert supplier_catalog (no unique constraint, so check-then-insert)
                    cur.execute("""
                        SELECT id FROM supplier_catalog
                        WHERE supplier_id = %s AND barcode = %s
                        LIMIT 1
                    """, (MAKRO_SUPPLIER_ID, barcode))
                    existing_sc = cur.fetchone()

                    if existing_sc:
                        cur.execute("""
                            UPDATE supplier_catalog SET
                                nomenclature_id = %s,
                                product_name = %s, brand = %s,
                                package_weight = %s, package_qty = %s, package_unit = %s,
                                conversion_factor = %s, source = 'makro-api', updated_at = now()
                            WHERE id = %s
                        """, (
                            item["nom_id"], makro_name, brand,
                            pkg_weight, pkg_qty, pkg_unit,
                            conv_factor, existing_sc[0],
                        ))
                    else:
                        cur.execute("""
                            INSERT INTO supplier_catalog (
                                supplier_id, nomenclature_id, barcode,
                                product_name, original_name, brand,
                                package_weight, package_qty, package_unit,
                                conversion_factor, last_seen_price, match_count, source
                            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 1, 'makro-api')
                        """, (
                            MAKRO_SUPPLIER_ID, item["nom_id"], barcode,
                            makro_name, ocr_name, brand,
                            pkg_weight, pkg_qty, pkg_unit,
                            conv_factor, makro.get("price", 0),
                        ))

                verified += 1

            if not dry_run:
                conn.commit()

            logging.info(f"\n{'=' * 60}")
            logging.info(f"Total with barcodes: {len(items)}")
            logging.info(f"Verified (Makro):    {verified}")
            logging.info(f"Not found:           {not_found}")
            logging.info(f"Renamed:             {renamed}")
            logging.info(f"Errors:              {errors}")
            logging.info(f"{'=' * 60}")

    finally:
        conn.close()


if __name__ == "__main__":
    main()
