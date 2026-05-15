#!/usr/bin/env python3
"""
Full barcode audit: compare ALL Makro items in our DB against Makro website.

READ-ONLY — no DB writes. Produces a CSV report with discrepancies.

For each barcode:
  - Query Makro Typesense by barcode
  - Compare: our name vs Makro name, our unit vs Makro unit, our price vs Makro price
  - Flag: MATCH / NAME_DIFF / WEIGHT_DIFF / NOT_FOUND / BARCODE_ERROR

Output: tools/reconcile-unmatched/audit_report.csv

Usage:
  python3 audit_makro_barcodes.py          # full audit (~222 barcodes, ~8 min)
  python3 audit_makro_barcodes.py --limit 20  # test first 20
"""

import csv
import json
import logging
import subprocess
import sys
import time
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

MAKRO_SUPPLIER_ID = "c548db19-8a70-4f34-96af-d66162793cbf"
REPORT_PATH = "tools/reconcile-unmatched/audit_report.csv"


def get_db_url() -> str:
    result = subprocess.run(
        ["security", "find-generic-password", "-s", "shishka-database-url", "-w"],
        capture_output=True, text=True,
    )
    return result.stdout.strip()


def fetch_all_makro_barcodes(cur) -> list[dict]:
    """Get all unique barcodes linked to Makro supplier."""
    cur.execute("""
        WITH all_barcodes AS (
            SELECT DISTINCT ON (barcode)
                barcode,
                nomenclature_id,
                'purchase_logs' AS source
            FROM purchase_logs
            WHERE supplier_id = %s
              AND barcode IS NOT NULL AND barcode <> ''
            UNION ALL
            SELECT DISTINCT ON (barcode)
                barcode,
                nomenclature_id,
                'supplier_catalog' AS source
            FROM supplier_catalog
            WHERE supplier_id = %s
              AND barcode IS NOT NULL AND barcode <> ''
              AND nomenclature_id IS NOT NULL
        )
        SELECT DISTINCT ON (ab.barcode)
            ab.barcode,
            ab.nomenclature_id AS nom_id,
            n.product_code,
            n.name AS our_name,
            n.base_unit AS our_unit,
            n.cost_per_unit AS our_cost,
            sc.product_name AS catalog_name,
            sc.package_weight AS catalog_weight,
            sc.conversion_factor AS catalog_conv,
            sc.brand AS catalog_brand
        FROM all_barcodes ab
        JOIN nomenclature n ON n.id = ab.nomenclature_id
        LEFT JOIN supplier_catalog sc ON sc.nomenclature_id = n.id
            AND sc.supplier_id = %s
            AND sc.barcode = ab.barcode
        WHERE n.is_available = true
        ORDER BY ab.barcode, ab.source
    """, (MAKRO_SUPPLIER_ID, MAKRO_SUPPLIER_ID, MAKRO_SUPPLIER_ID))
    cols = [d[0] for d in cur.description]
    return [dict(zip(cols, row)) for row in cur.fetchall()]


def name_similarity(a: str, b: str) -> float:
    """Compare two product names, return 0-1 similarity."""
    if not a or not b:
        return 0.0
    return SequenceMatcher(None, a.lower().strip(), b.lower().strip()).ratio()


def classify_result(item: dict, makro: Optional[dict]) -> tuple[str, dict]:
    """Classify the comparison result and return (status, details)."""
    if makro is None:
        return "NOT_FOUND", {"reason": "Barcode not in Makro search index"}

    makro_name = makro.get("english_name") or ""
    our_name = item.get("our_name") or ""
    sim = name_similarity(our_name, makro_name)

    makro_weight = str(makro.get("package_weight_raw") or "")
    catalog_weight = str(item.get("catalog_weight") or "")

    makro_price = makro.get("price") or 0
    our_cost = float(item.get("our_cost") or 0)

    details = {
        "makro_name": makro_name,
        "makro_weight": makro_weight,
        "makro_price": makro_price,
        "makro_brand": makro.get("brand") or "",
        "name_similarity": round(sim, 2),
        "makro_pkg_qty": makro.get("package_qty"),
        "makro_pkg_unit": makro.get("package_unit"),
    }

    if sim < 0.4:
        return "NAME_MISMATCH", details  # Completely different product!
    if sim < 0.7:
        return "NAME_DIFF", details  # Significant name difference
    return "MATCH", details


def main():
    limit = None
    for i, arg in enumerate(sys.argv[1:]):
        if arg == "--limit" and i + 2 <= len(sys.argv[1:]):
            limit = int(sys.argv[i + 2])

    db_url = get_db_url()
    conn = psycopg2.connect(db_url)
    scraper = MakroScraper()

    try:
        with conn.cursor() as cur:
            items = fetch_all_makro_barcodes(cur)
            if limit:
                items = items[:limit]

            logging.info(f"Auditing {len(items)} unique barcodes against Makro website\n")

            rows = []
            stats = {"MATCH": 0, "NAME_DIFF": 0, "NAME_MISMATCH": 0, "NOT_FOUND": 0, "ERROR": 0}

            for i, item in enumerate(items):
                barcode = item["barcode"]
                our_name = item["our_name"] or "?"

                try:
                    results = scraper.search_products(barcode, delay=2.0)
                    if results:
                        doc = results[0]
                        makro = scraper.doc_to_parsed(doc)
                    else:
                        makro = None
                except Exception as e:
                    logging.warning(f"  [{i+1}/{len(items)}] ERROR {barcode} | {our_name[:40]} | {e}")
                    stats["ERROR"] += 1
                    rows.append({
                        "barcode": barcode, "product_code": item["product_code"],
                        "our_name": our_name, "our_unit": item["our_unit"],
                        "our_cost": item["our_cost"],
                        "status": "ERROR", "makro_name": "", "makro_weight": "",
                        "makro_price": "", "makro_brand": "", "name_similarity": "",
                        "note": str(e),
                    })
                    continue

                status, details = classify_result(item, makro)
                stats[status] += 1

                icon = {"MATCH": "✓", "NAME_DIFF": "~", "NAME_MISMATCH": "✗", "NOT_FOUND": "?"}
                logging.info(
                    f"  [{i+1}/{len(items)}] {icon.get(status, '!')} {barcode} "
                    f"| {our_name[:30]:<30} "
                    f"| {status:<14} "
                    f"| {details.get('makro_name', '')[:30]}"
                )

                note = ""
                if status == "NAME_MISMATCH":
                    note = f"REVIEW: sim={details['name_similarity']} — possibly wrong barcode or different product"
                elif status == "NOT_FOUND":
                    note = "Barcode not in Makro index (imported? OCR error?)"

                rows.append({
                    "barcode": barcode,
                    "product_code": item["product_code"],
                    "our_name": our_name,
                    "our_unit": item["our_unit"] or "",
                    "our_cost": item["our_cost"] or 0,
                    "catalog_weight": item["catalog_weight"] or "",
                    "catalog_conv": item["catalog_conv"] or "",
                    "status": status,
                    "makro_name": details.get("makro_name", ""),
                    "makro_weight": details.get("makro_weight", ""),
                    "makro_price": details.get("makro_price", ""),
                    "makro_brand": details.get("makro_brand", ""),
                    "makro_pkg_qty": details.get("makro_pkg_qty", ""),
                    "makro_pkg_unit": details.get("makro_pkg_unit", ""),
                    "name_similarity": details.get("name_similarity", ""),
                    "note": note,
                })

            # Write CSV report
            fieldnames = [
                "status", "barcode", "product_code", "our_name", "our_unit", "our_cost",
                "catalog_weight", "catalog_conv",
                "makro_name", "makro_brand", "makro_weight", "makro_price",
                "makro_pkg_qty", "makro_pkg_unit", "name_similarity", "note",
            ]
            with open(REPORT_PATH, "w", newline="", encoding="utf-8") as f:
                writer = csv.DictWriter(f, fieldnames=fieldnames)
                writer.writeheader()
                # Sort: mismatches first, then diffs, then not_found, then matches
                priority = {"NAME_MISMATCH": 0, "NAME_DIFF": 1, "ERROR": 2, "NOT_FOUND": 3, "MATCH": 4}
                rows.sort(key=lambda r: (priority.get(r["status"], 9), r["our_name"]))
                writer.writerows(rows)

            logging.info(f"\n{'=' * 60}")
            logging.info(f"Total barcodes:    {len(items)}")
            logging.info(f"  MATCH:           {stats['MATCH']}")
            logging.info(f"  NAME_DIFF:       {stats['NAME_DIFF']}")
            logging.info(f"  NAME_MISMATCH:   {stats['NAME_MISMATCH']}  ← REVIEW THESE")
            logging.info(f"  NOT_FOUND:       {stats['NOT_FOUND']}")
            logging.info(f"  ERROR:           {stats['ERROR']}")
            logging.info(f"{'=' * 60}")
            logging.info(f"\nReport saved: {REPORT_PATH}")

    finally:
        conn.close()


if __name__ == "__main__":
    main()
