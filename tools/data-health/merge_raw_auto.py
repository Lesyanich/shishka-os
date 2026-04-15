#!/usr/bin/env python3
"""
merge_raw_auto.py — RAW-AUTO duplicate merger for Shishka nomenclature.

Passes:
  1   Exact barcode match (via sku table)             -> auto-merge
  1b  Exact name match (case-insensitive)             -> auto-merge
  2   pg_trgm similarity >= 0.8                       -> auto-merge
  3   pg_trgm similarity 0.4-0.8                      -> export to CSV (ambiguous)
  no  similarity < 0.4                                -> export to CSV (no match)

Merge operation:
  - Repoints purchase_logs, supplier_catalog, sku, bom_structures to curated id
  - Sets RAW-AUTO item is_available = false (soft-delete)

Usage:
  python merge_raw_auto.py --dry-run
  python merge_raw_auto.py --execute
  python merge_raw_auto.py --dry-run --export-csv
  python merge_raw_auto.py --execute --export-csv
"""

import argparse
import csv
import os
import re
import subprocess
import sys
from pathlib import Path

# ---------------------------------------------------------------------------
# Database connection
# ---------------------------------------------------------------------------

def get_db_url() -> str:
    """Resolve DATABASE_URL from env or macOS Keychain."""
    if url := os.environ.get("DATABASE_URL"):
        return url
    try:
        raw = subprocess.check_output(
            ["security", "find-generic-password", "-s", "shishka-database-url", "-w"],
            text=True,
            stderr=subprocess.DEVNULL,
        ).strip()
        # macOS may emit a hex-encoded value for multi-line payloads
        if re.match(r"^[0-9a-fA-F]+$", raw) and len(raw) > 50:
            return bytes.fromhex(raw).decode()
        return raw
    except subprocess.CalledProcessError:
        print("ERROR: DATABASE_URL not set and keychain entry 'shishka-database-url' not found.", file=sys.stderr)
        sys.exit(1)


# ---------------------------------------------------------------------------
# SQL helpers  (psycopg3 uses %s positional placeholders)
# ---------------------------------------------------------------------------

FETCH_AUTO_ITEMS = """
SELECT id, product_code, name, cost_per_unit
FROM   nomenclature
WHERE  product_code LIKE 'RAW-AUTO-%'
  AND  is_available = true
ORDER  BY name;
"""

FETCH_CURATED_COUNT = """
SELECT COUNT(*)
FROM   nomenclature
WHERE  product_code LIKE 'RAW-%'
  AND  product_code NOT LIKE 'RAW-AUTO-%'
  AND  is_available = true;
"""

# Pass 1: exact barcode match via sku table
BARCODE_MATCH_SQL = """
SELECT c.id, c.product_code, c.name
FROM   sku sa
JOIN   sku sc ON sc.barcode = sa.barcode AND sc.barcode IS NOT NULL
JOIN   nomenclature c ON c.id = sc.nomenclature_id
WHERE  sa.nomenclature_id = %s
  AND  sc.nomenclature_id != %s
  AND  c.product_code LIKE 'RAW-%%'
  AND  c.product_code NOT LIKE 'RAW-AUTO-%%'
  AND  c.is_available = true
LIMIT 1;
"""

# Pass 1b: exact name match (case-insensitive)
NAME_EXACT_SQL = """
SELECT id, product_code, name
FROM   nomenclature
WHERE  lower(name) = lower(%s)
  AND  product_code LIKE 'RAW-%%'
  AND  product_code NOT LIKE 'RAW-AUTO-%%'
  AND  is_available = true
LIMIT 1;
"""

# Pass 2+3: pg_trgm fuzzy similarity
TRGM_SQL = """
SELECT id, product_code, name, similarity(name, %s) AS sim
FROM   nomenclature
WHERE  product_code LIKE 'RAW-%%'
  AND  product_code NOT LIKE 'RAW-AUTO-%%'
  AND  is_available = true
  AND  similarity(name, %s) > 0.4
ORDER  BY sim DESC
LIMIT 1;
"""

AFFECTED_TABLES = [
    ("purchase_logs",    "nomenclature_id"),
    ("supplier_catalog", "nomenclature_id"),
    ("sku",              "nomenclature_id"),
    ("bom_structures",   "ingredient_id"),
]


def count_affected(cur, auto_id) -> dict:
    totals = {}
    for table, col in AFFECTED_TABLES:
        cur.execute(f"SELECT COUNT(*) FROM {table} WHERE {col} = %s", (auto_id,))
        totals[table] = cur.fetchone()[0]
    return totals


def do_merge(cur, auto_id, curated_id) -> None:
    """Execute the five-statement merge in the current transaction."""
    cur.execute("UPDATE purchase_logs    SET nomenclature_id = %s WHERE nomenclature_id = %s", (curated_id, auto_id))
    cur.execute("UPDATE supplier_catalog SET nomenclature_id = %s WHERE nomenclature_id = %s", (curated_id, auto_id))
    cur.execute("UPDATE sku              SET nomenclature_id = %s WHERE nomenclature_id = %s", (curated_id, auto_id))
    cur.execute("UPDATE bom_structures   SET ingredient_id   = %s WHERE ingredient_id   = %s", (curated_id, auto_id))
    cur.execute("UPDATE nomenclature     SET is_available    = false WHERE id = %s",           (auto_id,))


# ---------------------------------------------------------------------------
# Core logic
# ---------------------------------------------------------------------------

def run(dry_run: bool, export_csv: bool) -> None:
    import psycopg

    db_url = get_db_url()

    auto_merged: list[dict] = []
    ambiguous:   list[dict] = []
    no_match:    list[dict] = []

    with psycopg.connect(db_url, autocommit=False) as conn:
        with conn.cursor() as cur:
            cur.execute(FETCH_AUTO_ITEMS)
            auto_items = cur.fetchall()

            cur.execute(FETCH_CURATED_COUNT)
            curated_count = cur.fetchone()[0]

            print(f"RAW-AUTO items (active)    : {len(auto_items)}")
            print(f"Curated RAW items (active) : {curated_count}")
            print()

            for auto_id, auto_code, auto_name, auto_cost in auto_items:
                match_id = match_code = match_name = None
                sim = 0.0
                pass_label = None

                # --- Pass 1: exact barcode ---
                cur.execute(BARCODE_MATCH_SQL, (auto_id, auto_id))
                m = cur.fetchone()
                if m:
                    match_id, match_code, match_name = m
                    sim = 1.0
                    pass_label = "barcode"

                # --- Pass 1b: exact name ---
                if not match_id:
                    cur.execute(NAME_EXACT_SQL, (auto_name,))
                    m = cur.fetchone()
                    if m:
                        match_id, match_code, match_name = m
                        sim = 1.0
                        pass_label = "name_exact"

                # --- Pass 2 + 3: fuzzy ---
                if not match_id:
                    cur.execute(TRGM_SQL, (auto_name, auto_name))
                    m = cur.fetchone()
                    if m:
                        match_id, match_code, match_name, sim = m
                        sim = float(sim)
                        if sim >= 0.8:
                            pass_label = "fuzzy_high"

                # --- Decide ---
                if match_id and pass_label:
                    affected = count_affected(cur, auto_id)
                    auto_merged.append({
                        "auto_id":      auto_id,
                        "auto_code":    auto_code,
                        "auto_name":    auto_name,
                        "auto_cost":    auto_cost,
                        "curated_id":   match_id,
                        "curated_code": match_code,
                        "curated_name": match_name,
                        "similarity":   round(sim, 4),
                        "pass":         pass_label,
                        "affected":     affected,
                    })
                    if not dry_run:
                        do_merge(cur, auto_id, match_id)

                elif match_id and sim >= 0.4:
                    # Ambiguous — needs human review
                    ambiguous.append({
                        "auto_id":        str(auto_id),
                        "auto_code":      auto_code,
                        "auto_name":      auto_name,
                        "auto_cost":      str(auto_cost) if auto_cost is not None else "",
                        "suggested_id":   str(match_id),
                        "suggested_code": match_code,
                        "suggested_name": match_name,
                        "similarity":     round(sim, 4),
                        "action":         "",
                    })

                else:
                    no_match.append({
                        "auto_id":        str(auto_id),
                        "auto_code":      auto_code,
                        "auto_name":      auto_name,
                        "auto_cost":      str(auto_cost) if auto_cost is not None else "",
                        "suggested_id":   "",
                        "suggested_code": "",
                        "suggested_name": "",
                        "similarity":     0.0,
                        "action":         "",
                    })

            if dry_run:
                conn.rollback()
                print("[DRY-RUN] No changes committed.")
            else:
                conn.commit()
                print("[EXECUTE] Changes committed.")

    # --- Summary ---
    print()
    print(f"  Auto-merged  : {len(auto_merged)}")
    print(f"  Ambiguous    : {len(ambiguous)}")
    print(f"  No match     : {len(no_match)}")

    if auto_merged:
        print()
        print("Auto-merge details:")
        for item in auto_merged:
            affected_str = ", ".join(
                f"{t}:{n}" for t, n in item["affected"].items() if n > 0
            )
            print(
                f"  [{item['pass']:12s}] {item['auto_code']:30s}  ->  {item['curated_code']:30s}"
                f"  sim={item['similarity']:.4f}  ({affected_str or 'no refs'})"
            )

    # --- CSV export ---
    if export_csv:
        csv_path = Path(__file__).parent / "review.csv"
        csv_rows = ambiguous + no_match
        if csv_rows:
            fieldnames = [
                "auto_id", "auto_code", "auto_name", "auto_cost",
                "suggested_id", "suggested_code", "suggested_name",
                "similarity", "action",
            ]
            with open(csv_path, "w", newline="", encoding="utf-8") as f:
                writer = csv.DictWriter(f, fieldnames=fieldnames)
                writer.writeheader()
                writer.writerows(csv_rows)
            print()
            print(f"CSV exported -> {csv_path}  ({len(csv_rows)} rows)")
            print("Fill 'action' column:  merge | merge:<UUID> | new | skip")
        else:
            print()
            print("Nothing to export — all items auto-merged or no items found.")


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="Auto-merge RAW-AUTO nomenclature duplicates.")
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--dry-run",   action="store_true", help="Preview merges without applying")
    mode.add_argument("--execute",   action="store_true", help="Apply auto-merges to database")
    parser.add_argument("--export-csv", action="store_true",
                        help="Export ambiguous + no-match rows to review.csv")
    args = parser.parse_args()

    run(dry_run=args.dry_run, export_csv=args.export_csv)


if __name__ == "__main__":
    main()
