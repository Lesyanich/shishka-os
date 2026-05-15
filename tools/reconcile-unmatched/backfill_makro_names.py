#!/usr/bin/env python3
"""
Backfill ALL nomenclature names from Makro API by barcode.

For EVERY item with a Makro barcode (not just RAW-AUTO):
- Query Makro Typesense by barcode
- If found: compare names, update if different
- Also update: brand, package_weight, conversion_factor in supplier_catalog

READ-ONLY by default (--dry-run). Use --apply to write changes.

Usage:
  python3 backfill_makro_names.py --dry-run    # preview all changes
  python3 backfill_makro_names.py --apply      # execute updates
"""

import csv
import logging
import re
import subprocess
import sys
from difflib import SequenceMatcher
from typing import Any, Optional

logging.basicConfig(level=logging.INFO, format="%(message)s")

try:
    import psycopg2
    import psycopg2.extras
except ImportError:
    subprocess.check_call([sys.executable, "-m", "pip", "install", "psycopg2-binary", "-q"])
    import psycopg2
    import psycopg2.extras

sys.path.insert(0, "tools/makro-parser")
from scraper import MakroScraper
from mapper import normalize_package_weight

MAKRO_SUPPLIER_ID = "c548db19-8a70-4f34-96af-d66162793cbf"
REPORT_PATH = "tools/reconcile-unmatched/backfill_report.csv"


def get_db_url() -> str:
    result = subprocess.run(
        ["security", "find-generic-password", "-s", "shishka-database-url", "-w"],
        capture_output=True, text=True,
    )
    return result.stdout.strip()


def fetch_all_items_with_barcodes(cur) -> list[dict]:
    """Get ALL active nomenclature items with Makro barcodes."""
    cur.execute("""
        SELECT DISTINCT ON (n.id)
            n.id AS nom_id,
            n.product_code,
            n.name AS our_name,
            n.base_unit,
            n.cost_per_unit,
            COALESCE(sc.barcode, pl.barcode) AS barcode,
            sc.id AS sc_id,
            sc.product_name AS sc_name,
            sc.brand AS sc_brand,
            sc.package_weight AS sc_weight,
            sc.conversion_factor AS sc_conv
        FROM nomenclature n
        LEFT JOIN supplier_catalog sc ON sc.nomenclature_id = n.id
            AND sc.supplier_id = %s
            AND sc.barcode IS NOT NULL AND sc.barcode <> ''
        LEFT JOIN LATERAL (
            SELECT DISTINCT barcode FROM purchase_logs
            WHERE nomenclature_id = n.id AND barcode IS NOT NULL AND barcode <> ''
            LIMIT 1
        ) pl ON sc.barcode IS NULL
        WHERE n.is_available = true
          AND COALESCE(sc.barcode, pl.barcode) IS NOT NULL
        ORDER BY n.id, sc.barcode IS NOT NULL DESC
    """, (MAKRO_SUPPLIER_ID,))
    cols = [d[0] for d in cur.description]
    return [dict(zip(cols, row)) for row in cur.fetchall()]


def calc_conversion(pkg_qty, pkg_unit, base_unit) -> Optional[float]:
    if pkg_qty is None or not pkg_unit:
        return None
    pkg_unit = pkg_unit.lower()
    if base_unit == "kg":
        if pkg_unit == "g":
            return pkg_qty / 1000.0
        if pkg_unit == "kg":
            return pkg_qty
    elif base_unit == "L":
        if pkg_unit == "ml":
            return pkg_qty / 1000.0
        if pkg_unit in ("l",):
            return pkg_qty
    return None


def main():
    apply_mode = "--apply" in sys.argv
    dry_run = not apply_mode

    if dry_run:
        logging.info("=== DRY RUN (use --apply to write changes) ===\n")
    else:
        logging.info("=== APPLY MODE — writing to DB ===\n")

    db_url = get_db_url()
    conn = psycopg2.connect(db_url)
    scraper = MakroScraper()

    try:
        with conn.cursor() as cur:
            items = fetch_all_items_with_barcodes(cur)
            logging.info(f"Found {len(items)} items with Makro barcodes\n")

            rows = []
            stats = {"match": 0, "updated": 0, "not_found": 0, "error": 0}

            for i, item in enumerate(items):
                barcode = item["barcode"]
                our_name = item["our_name"] or "?"

                try:
                    results = scraper.search_products(barcode, delay=2.0)
                    if results:
                        makro = scraper.doc_to_parsed(results[0])
                    else:
                        makro = None
                except Exception as e:
                    logging.warning(f"  [{i+1}/{len(items)}] ERROR {barcode} | {e}")
                    stats["error"] += 1
                    rows.append({"barcode": barcode, "product_code": item["product_code"],
                                 "our_name": our_name, "makro_name": "", "status": "ERROR", "action": str(e)})
                    continue

                if not makro:
                    stats["not_found"] += 1
                    rows.append({"barcode": barcode, "product_code": item["product_code"],
                                 "our_name": our_name, "makro_name": "", "status": "NOT_FOUND", "action": "skip"})
                    if (i + 1) % 20 == 0:
                        logging.info(f"  [{i+1}/{len(items)}] progress...")
                    continue

                makro_name = makro.get("english_name") or ""
                sim = SequenceMatcher(None, our_name.lower(), makro_name.lower()).ratio()
                brand = makro.get("brand") or ""
                pkg_weight_raw = makro.get("package_weight_raw") or ""
                pkg_qty = makro.get("package_qty")
                pkg_unit = makro.get("package_unit")
                conv = calc_conversion(pkg_qty, pkg_unit, item["base_unit"] or "kg")

                if sim > 0.9:
                    # Names match well enough — only update metadata
                    status = "MATCH"
                    action = "metadata only" if (brand or conv) else "skip"
                    stats["match"] += 1
                else:
                    status = "UPDATE"
                    action = f"name: '{our_name}' → '{makro_name}'"
                    stats["updated"] += 1

                icon = "✓" if status == "MATCH" else "✏"
                logging.info(
                    f"  [{i+1}/{len(items)}] {icon} {barcode} | {our_name[:28]:<28} → {makro_name[:28]:<28} | sim={sim:.2f}"
                )

                if apply_mode and makro_name:
                    # Update nomenclature name if significantly different
                    if sim <= 0.9:
                        cur.execute(
                            "UPDATE nomenclature SET name = %s, updated_at = now() WHERE id = %s",
                            (makro_name, item["nom_id"])
                        )

                    # Upsert supplier_catalog with Makro metadata
                    if item["sc_id"]:
                        cur.execute("""
                            UPDATE supplier_catalog SET
                                product_name = %s,
                                brand = COALESCE(NULLIF(%s, ''), brand),
                                package_weight = COALESCE(NULLIF(%s, ''), package_weight),
                                package_qty = COALESCE(%s, package_qty),
                                package_unit = COALESCE(NULLIF(%s, ''), package_unit),
                                conversion_factor = COALESCE(%s, conversion_factor),
                                updated_at = now()
                            WHERE id = %s
                        """, (makro_name, brand, pkg_weight_raw, pkg_qty, pkg_unit, conv, item["sc_id"]))
                    else:
                        cur.execute("""
                            SELECT id FROM supplier_catalog
                            WHERE supplier_id = %s AND barcode = %s LIMIT 1
                        """, (MAKRO_SUPPLIER_ID, barcode))
                        existing = cur.fetchone()
                        if existing:
                            cur.execute("""
                                UPDATE supplier_catalog SET
                                    nomenclature_id = %s, product_name = %s, brand = %s,
                                    package_weight = %s, package_qty = %s, package_unit = %s,
                                    conversion_factor = %s, updated_at = now()
                                WHERE id = %s
                            """, (item["nom_id"], makro_name, brand, pkg_weight_raw,
                                  pkg_qty, pkg_unit, conv, existing[0]))
                        else:
                            cur.execute("""
                                INSERT INTO supplier_catalog (
                                    supplier_id, nomenclature_id, barcode, product_name,
                                    original_name, brand, package_weight, package_qty,
                                    package_unit, conversion_factor, match_count, source
                                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 1, 'makro-api-backfill')
                            """, (MAKRO_SUPPLIER_ID, item["nom_id"], barcode, makro_name,
                                  our_name, brand, pkg_weight_raw, pkg_qty, pkg_unit, conv))

                rows.append({
                    "barcode": barcode, "product_code": item["product_code"],
                    "our_name": our_name, "makro_name": makro_name,
                    "similarity": f"{sim:.2f}", "brand": brand,
                    "pkg_weight": pkg_weight_raw, "conversion": conv or "",
                    "status": status, "action": action,
                })

            if apply_mode:
                conn.commit()

            # Write report
            fieldnames = ["status", "barcode", "product_code", "our_name", "makro_name",
                          "similarity", "brand", "pkg_weight", "conversion", "action"]
            with open(REPORT_PATH, "w", newline="", encoding="utf-8") as f:
                writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
                writer.writeheader()
                rows.sort(key=lambda r: (0 if r["status"] == "UPDATE" else 1 if r["status"] == "NOT_FOUND" else 2))
                writer.writerows(rows)

            logging.info(f"\n{'=' * 60}")
            logging.info(f"Total items:    {len(items)}")
            logging.info(f"  Names updated: {stats['updated']}")
            logging.info(f"  Names match:   {stats['match']}")
            logging.info(f"  Not on Makro:  {stats['not_found']}")
            logging.info(f"  Errors:        {stats['error']}")
            logging.info(f"{'=' * 60}")
            logging.info(f"Report: {REPORT_PATH}")

    finally:
        conn.close()


if __name__ == "__main__":
    main()
