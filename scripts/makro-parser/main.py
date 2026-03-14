import argparse
import json
import logging
from datetime import datetime
from typing import Any, Dict, List

from scraper import MakroScraper
from mapper import determine_nomenclature, determine_base_unit_from_category
from db import load_reference_data, find_makro_supplier_id, build_batch_sql, execute_sql_batch


logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")


def parse_args():
    parser = argparse.ArgumentParser(description="Makro Pro to Shishka DB Parser")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Scrape and output intended SQL without executing",
    )
    parser.add_argument(
        "--preview",
        action="store_true",
        help="Scrape and print JSON output without DB generation",
    )
    parser.add_argument(
        "--execute",
        action="store_true",
        help="Scrape and insert directly to Supabase",
    )
    parser.add_argument(
        "--category",
        type=str,
        default="dairy-eggs",
        help="Food category to scrape (dairy-eggs, fresh-meat, seafood, grocery, bakery, frozen, beverages, produce, condiments) or a single search keyword",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=50,
        help="Max number of products to process",
    )

    args = parser.parse_args()
    if not any([args.dry_run, args.preview, args.execute]):
        parser.error("Must specify one of: --dry-run, --preview, --execute")
    return args


def _enrich_products(
    raw_products: List[Dict[str, Any]],
    reference_data: Dict[str, Any],
) -> List[Dict[str, Any]]:
    """Attach nomenclature and basic fields required for SQL generation."""
    all_nomenclatures = reference_data.get("nomenclature") or []
    enriched: List[Dict[str, Any]] = []

    for p in raw_products:
        nom_id, base_unit, nom_label = determine_nomenclature(
            p.get("english_name", ""),
            p.get("thai_name", ""),
            p.get("category_path") or [],
            all_nomenclatures,
        )
        if base_unit is None:
            base_unit = determine_base_unit_from_category(
                p.get("english_name", ""),
                p.get("category_path") or [],
            )

        p["nomenclature_id"] = nom_id
        p["nomenclature_base_unit"] = base_unit
        p["assigned_nomenclature_name"] = nom_label
        p["category_code"] = 4100  # Raw Materials / Food

        enriched.append(p)

    return enriched


import os as _os

_SCRIPT_DIR = _os.path.dirname(_os.path.abspath(__file__))
_PROJECT_ROOT = _os.path.abspath(_os.path.join(_SCRIPT_DIR, "..", ".."))
PROGRESS_PATH = _os.path.join(_PROJECT_ROOT, "docs", "context", "state", "makro-parser-progress.md")


def _parse_list_line(line: str) -> List[str]:
    start = line.find("[")
    end = line.find("]")
    if start == -1 or end == -1 or end <= start:
        return []
    inner = line[start + 1 : end]
    items = [x.strip() for x in inner.split(",") if x.strip()]
    return items


def _format_list_line(label: str, items: List[str]) -> str:
    inner = ", ".join(items)
    return f"{label}: [{inner}]\n"


def update_progress_file(
    category: str,
    counts: Dict[str, int],
    status: str,
) -> None:
    """Update docs/context/state/makro-parser-progress.md with latest stats."""
    try:
        with open(PROGRESS_PATH, "r", encoding="utf-8") as f:
            lines = f.readlines()
    except FileNotFoundError:
        lines = [
            "# Makro Parser Progress\n",
            "Status: NOT_STARTED\n",
            f"Last updated: {datetime.now().isoformat()}\n",
            "Categories parsed: []\n",
            "Categories remaining: []\n",
            "Total SKUs created: 0\n",
            "Total brands created: 0\n",
            "Total nomenclature created: 0\n",
            "Total supplier_catalog created: 0\n",
            "Errors: []\n",
        ]

    parsed = []
    remaining = []
    total_skus = 0
    total_brands = 0
    total_noms = 0
    total_catalog = 0

    for i, line in enumerate(lines):
        if line.startswith("Status:"):
            lines[i] = f"Status: {status}\n"
        elif line.startswith("Last updated:"):
            lines[i] = f"Last updated: {datetime.now().isoformat()}\n"
        elif line.startswith("Categories parsed:"):
            parsed = _parse_list_line(line)
        elif line.startswith("Categories remaining:"):
            remaining = _parse_list_line(line)
        elif line.startswith("Total SKUs created:"):
            try:
                total_skus = int(line.split(":")[1].strip())
            except ValueError:
                total_skus = 0
        elif line.startswith("Total brands created:"):
            try:
                total_brands = int(line.split(":")[1].strip())
            except ValueError:
                total_brands = 0
        elif line.startswith("Total nomenclature created:"):
            try:
                total_noms = int(line.split(":")[1].strip())
            except ValueError:
                total_noms = 0
        elif line.startswith("Total supplier_catalog created:"):
            try:
                total_catalog = int(line.split(":")[1].strip())
            except ValueError:
                total_catalog = 0

    if category not in parsed:
        parsed.append(category)
    if category in remaining:
        remaining = [c for c in remaining if c != category]

    total_skus += counts.get("sku", 0)
    total_brands += counts.get("brands", 0)
    total_noms += counts.get("nomenclature", 0)
    total_catalog += counts.get("supplier_catalog", 0)

    for i, line in enumerate(lines):
        if line.startswith("Categories parsed:"):
            lines[i] = _format_list_line("Categories parsed", parsed)
        elif line.startswith("Categories remaining:"):
            lines[i] = _format_list_line("Categories remaining", remaining)
        elif line.startswith("Total SKUs created:"):
            lines[i] = f"Total SKUs created: {total_skus}\n"
        elif line.startswith("Total brands created:"):
            lines[i] = f"Total brands created: {total_brands}\n"
        elif line.startswith("Total nomenclature created:"):
            lines[i] = f"Total nomenclature created: {total_noms}\n"
        elif line.startswith("Total supplier_catalog created:"):
            lines[i] = f"Total supplier_catalog created: {total_catalog}\n"

    if not remaining and status == "IN_PROGRESS":
        for i, line in enumerate(lines):
            if line.startswith("Status:"):
                lines[i] = "Status: COMPLETED\n"

    with open(PROGRESS_PATH, "w", encoding="utf-8") as f:
        f.writelines(lines)


def main():
    args = parse_args()
    mode = "EXECUTE" if args.execute else ("PREVIEW" if args.preview else "DRY-RUN")
    logging.info("Starting Makro Parser in mode: %s", mode)

    # Load reference data once per run
    reference_data = load_reference_data()
    supplier_id = find_makro_supplier_id(reference_data)
    if not supplier_id:
        logging.error("Cannot proceed without Makro supplier_id.")
        return

    scraper = MakroScraper()

    logging.info("Scraping category: %s (limit: %d)", args.category, args.limit)
    raw_docs = scraper.scrape_category(args.category, limit=args.limit)
    logging.info("Got %d unique products", len(raw_docs))

    if not raw_docs:
        logging.warning("No products found. Check category name or network.")
        return

    # Convert Typesense documents to our internal format
    raw_parsed: List[Dict[str, Any]] = []
    for doc in raw_docs:
        parsed = MakroScraper.doc_to_parsed(doc)
        if args.preview:
            print(json.dumps(parsed, indent=2, ensure_ascii=False))
            continue
        raw_parsed.append(parsed)

    if args.preview:
        logging.info("Preview mode finished. %d products shown.", len(raw_docs))
        return

    enriched_products = _enrich_products(raw_parsed, reference_data)

    sql, counts = build_batch_sql(enriched_products, supplier_id)

    if not sql:
        logging.warning("No SQL generated for this run.")
        return

    if args.dry_run:
        logging.info("DRY RUN SUMMARY:")
        print(sql)
        with open("batch_output.sql", "w", encoding="utf-8") as f:
            f.write(sql)
        logging.info(
            "Counts: brands=%s, sku=%s, supplier_catalog=%s, nomenclature=%s",
            counts["brands"],
            counts["sku"],
            counts["supplier_catalog"],
            counts["nomenclature"],
        )
        update_progress_file(args.category, counts, "IN_PROGRESS")
        return

    if args.execute:
        result = execute_sql_batch(sql)
        logging.info("Execution result code: %s", result.get("returncode"))
        if result.get("stdout"):
            print(result["stdout"])
        if result.get("stderr"):
            print(result["stderr"])
        new_status = "ERROR" if result.get("returncode") else "IN_PROGRESS"
        update_progress_file(args.category, counts, new_status)


if __name__ == "__main__":
    main()
