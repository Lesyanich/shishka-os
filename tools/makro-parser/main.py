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
        "--report",
        action="store_true",
        help="Scrape, check store inventory, and output markdown report with barcodes (no DB)",
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
    parser.add_argument(
        "--store",
        type=str,
        default="166",
        help="Makro store code for inventory check (default: 166 = Rawai Phuket)",
    )

    args = parser.parse_args()
    if not any([args.dry_run, args.preview, args.execute, args.report]):
        parser.error("Must specify one of: --dry-run, --preview, --execute, --report")
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


def _check_and_apply_store_inventory(
    scraper: MakroScraper,
    parsed_products: List[Dict[str, Any]],
    store_code: str,
) -> List[Dict[str, Any]]:
    """
    Cross-check inventory via Makro GraphQL API for the given store.

    Adds 'store_in_stock' (bool) and 'store_inventory' (int) to each product.
    Products without a product_id are marked as unknown (store_in_stock=None).
    """
    product_ids = [
        p["product_id"] for p in parsed_products if p.get("product_id")
    ]
    if not product_ids:
        logging.warning("No product_ids found — skipping store inventory check.")
        return parsed_products

    logging.info(
        "Checking inventory at store ST%s for %d products...",
        store_code,
        len(product_ids),
    )
    inventory = scraper.check_store_inventory(product_ids, store_code)

    in_stock_count = 0
    oos_count = 0
    for p in parsed_products:
        pid = p.get("product_id")
        if pid and pid in inventory:
            qty = inventory[pid]
            p["store_inventory"] = qty
            p["store_in_stock"] = qty > 0
            if qty > 0:
                in_stock_count += 1
            else:
                oos_count += 1
        else:
            p["store_inventory"] = None
            p["store_in_stock"] = None

    logging.info(
        "Store ST%s inventory: %d in stock, %d OOS, %d unknown",
        store_code,
        in_stock_count,
        oos_count,
        len(parsed_products) - in_stock_count - oos_count,
    )
    return parsed_products


def _generate_report(
    products: List[Dict[str, Any]],
    store_code: str,
    category: str,
) -> str:
    """Generate markdown report with barcodes, prices, and store inventory."""
    lines: List[str] = []
    today = datetime.now().strftime("%Y-%m-%d")
    lines.append(f"## Makro Scan — ST{store_code} ({today})")
    lines.append(f"Category: `{category}` | {len(products)} products")
    lines.append("")

    in_stock = [p for p in products if p.get("store_in_stock") is True]
    oos = [p for p in products if p.get("store_in_stock") is False]
    unknown = [p for p in products if p.get("store_in_stock") is None]

    # Sort by price
    products_sorted = sorted(products, key=lambda x: x.get("price", 0))

    lines.append("| Product | Barcode | Makro ID | Price | Pack | Stock | Qty |")
    lines.append("|---------|---------|----------|-------|------|-------|-----|")
    for p in products_sorted:
        name = (p.get("english_name") or p.get("original_name") or "?")[:50]
        barcode = p.get("barcode", "")
        makro_code = p.get("makro_code", "")
        price = p.get("price", 0)
        weight = p.get("package_weight_raw", "")
        inv = p.get("store_inventory")
        if inv is None:
            stock, qty = "?", "?"
        elif inv > 0:
            stock, qty = "IN", str(inv)
        else:
            stock, qty = "**OOS**", "0"
            name = f"**{name}**"
        lines.append(
            f"| {name} | `{barcode}` | {makro_code} | {price} | {weight} | {stock} | {qty} |"
        )

    lines.append("")
    lines.append(
        f"**Summary:** {len(in_stock)} in stock, {len(oos)} OOS, {len(unknown)} unknown"
    )

    if in_stock:
        lines.append("")
        lines.append("### In Stock — Quick Reference")
        lines.append("")
        lines.append("| Product | Barcode | Price | Qty |")
        lines.append("|---------|---------|-------|-----|")
        for p in sorted(in_stock, key=lambda x: x.get("price", 0)):
            lines.append(
                f"| {(p.get('english_name') or '')[:50]} "
                f"| `{p.get('barcode', '')}` "
                f"| {p.get('price', 0)} "
                f"| {p.get('store_inventory', '?')} |"
            )

    return "\n".join(lines)


def main():
    args = parse_args()
    mode = (
        "REPORT" if args.report
        else "EXECUTE" if args.execute
        else "PREVIEW" if args.preview
        else "DRY-RUN"
    )
    logging.info("Starting Makro Parser in mode: %s (store: ST%s)", mode, args.store)

    # Load reference data (not needed for --report mode)
    reference_data = {}
    supplier_id = None
    if not args.report:
        reference_data = load_reference_data()
        supplier_id = find_makro_supplier_id(reference_data)
        if not supplier_id:
            logging.error("Cannot proceed without Makro supplier_id.")
            return

    scraper = MakroScraper(store_code=args.store)

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

    # Cross-check inventory at the target store via GraphQL
    raw_parsed = _check_and_apply_store_inventory(scraper, raw_parsed, args.store)

    if args.report:
        report = _generate_report(raw_parsed, args.store, args.category)
        print(report)
        report_path = f"report_{args.category}_{args.store}.md"
        with open(report_path, "w", encoding="utf-8") as f:
            f.write(report)
        logging.info("Report saved to %s (%d chars)", report_path, len(report))
        return

    enriched_products = _enrich_products(raw_parsed, reference_data)

    sql, counts = build_batch_sql(enriched_products, supplier_id)

    if not sql:
        logging.warning("No SQL generated for this run.")
        return

    if args.dry_run:
        logging.info("DRY RUN SUMMARY (store ST%s):", args.store)
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
        # Print stock summary
        in_stock = [p for p in enriched_products if p.get("store_in_stock") is True]
        oos = [p for p in enriched_products if p.get("store_in_stock") is False]
        logging.info(
            "Store ST%s stock: %d in stock, %d out of stock",
            args.store,
            len(in_stock),
            len(oos),
        )
        if oos:
            logging.info("OOS items: %s", ", ".join(p.get("english_name", "?") for p in oos))
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
