#!/usr/bin/env python3
"""
apply_reviewed_merges.py — Apply human-reviewed merge decisions from review.csv.

Reads tools/data-health/review.csv (produced by merge_raw_auto.py --export-csv).
The human fills the 'action' column for each row:

  merge          — accept the suggested match (use suggested_id)
  merge:<UUID>   — merge into a specific nomenclature ID
  new            — promote RAW-AUTO to curated: rename product_code to clean RAW-* code
  skip           — leave as-is (also treated as empty action)
  <empty>        — same as skip

Usage:
  python apply_reviewed_merges.py --dry-run
  python apply_reviewed_merges.py --execute
"""

import argparse
import csv
import os
import re
import subprocess
import sys
from pathlib import Path

# ---------------------------------------------------------------------------
# Database connection (same helper as merge_raw_auto.py)
# ---------------------------------------------------------------------------

def get_db_url() -> str:
    if url := os.environ.get("DATABASE_URL"):
        return url
    try:
        raw = subprocess.check_output(
            ["security", "find-generic-password", "-s", "shishka-database-url", "-w"],
            text=True,
            stderr=subprocess.DEVNULL,
        ).strip()
        if re.match(r"^[0-9a-fA-F]+$", raw) and len(raw) > 50:
            return bytes.fromhex(raw).decode()
        return raw
    except subprocess.CalledProcessError:
        print("ERROR: DATABASE_URL not set and keychain entry 'shishka-database-url' not found.", file=sys.stderr)
        sys.exit(1)


# ---------------------------------------------------------------------------
# SQL helpers  (psycopg3 uses %s positional placeholders)
# ---------------------------------------------------------------------------

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

def run(dry_run: bool) -> None:
    import psycopg

    csv_path = Path(__file__).parent / "review.csv"
    if not csv_path.exists():
        print(f"ERROR: {csv_path} not found. Run merge_raw_auto.py --export-csv first.", file=sys.stderr)
        sys.exit(1)

    with open(csv_path, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    if not rows:
        print("review.csv is empty — nothing to apply.")
        return

    db_url = get_db_url()

    counts = {"merge": 0, "new": 0, "skip": 0, "error": 0}

    with psycopg.connect(db_url, autocommit=False) as conn:
        with conn.cursor() as cur:
            for i, row in enumerate(rows, start=2):  # row 1 = header
                auto_id = row.get("auto_id", "").strip()
                auto_code = row.get("auto_code", "").strip()
                auto_name = row.get("auto_name", "").strip()
                suggested_id = row.get("suggested_id", "").strip()
                action = row.get("action", "").strip().lower()

                if not auto_id:
                    print(f"  Row {i}: missing auto_id — skipped")
                    counts["error"] += 1
                    continue

                if not action or action == "skip":
                    print(f"  Row {i}: SKIP  {auto_code}")
                    counts["skip"] += 1
                    continue

                if action == "merge":
                    curated_id = suggested_id
                    if not curated_id:
                        print(f"  Row {i}: ERROR  {auto_code} — action=merge but suggested_id is empty")
                        counts["error"] += 1
                        continue

                elif action.startswith("merge:"):
                    curated_id = action.split(":", 1)[1].strip()
                    if not curated_id:
                        print(f"  Row {i}: ERROR  {auto_code} — merge: action missing UUID")
                        counts["error"] += 1
                        continue

                elif action == "new":
                    # Verify it still looks like a RAW-AUTO item
                    cur.execute(
                        "SELECT product_code FROM nomenclature WHERE id = %s",
                        (auto_id,)
                    )
                    existing = cur.fetchone()
                    if not existing:
                        print(f"  Row {i}: ERROR  {auto_code} — id not found in nomenclature")
                        counts["error"] += 1
                        continue
                    if not existing[0].startswith("RAW-AUTO-"):
                        print(f"  Row {i}: SKIP (already promoted)  {existing[0]}")
                        counts["skip"] += 1
                        continue

                    print(f"  Row {i}: NEW  {auto_code}  ->  {re.sub('^RAW-AUTO-', 'RAW-', auto_code)}")
                    if not dry_run:
                        cur.execute(
                            "UPDATE nomenclature SET product_code = regexp_replace(product_code, '^RAW-AUTO-', 'RAW-')"
                            " WHERE id = %s AND product_code LIKE 'RAW-AUTO-%%'",
                            (auto_id,)
                        )
                    counts["new"] += 1
                    continue

                else:
                    print(f"  Row {i}: ERROR  {auto_code} — unknown action '{action}' (expected: merge | merge:<UUID> | new | skip)")
                    counts["error"] += 1
                    continue

                # Validate curated_id exists
                cur.execute(
                    "SELECT id, product_code, name FROM nomenclature WHERE id = %s AND is_available = true",
                    (curated_id,)
                )
                curated = cur.fetchone()
                if not curated:
                    print(f"  Row {i}: ERROR  {auto_code} — curated id {curated_id} not found or inactive")
                    counts["error"] += 1
                    continue

                curated_id_real, curated_code, curated_name = curated
                print(f"  Row {i}: MERGE  {auto_code} ({auto_name})  ->  {curated_code} ({curated_name})")
                if not dry_run:
                    do_merge(cur, auto_id, curated_id_real)
                counts["merge"] += 1

        if dry_run:
            conn.rollback()
            print()
            print("[DRY-RUN] No changes committed.")
        else:
            conn.commit()
            print()
            print("[EXECUTE] Changes committed.")

    print()
    print(f"  Merged   : {counts['merge']}")
    print(f"  Promoted : {counts['new']}")
    print(f"  Skipped  : {counts['skip']}")
    print(f"  Errors   : {counts['error']}")


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="Apply human-reviewed merge decisions from review.csv.")
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--dry-run", action="store_true", help="Preview actions without applying")
    mode.add_argument("--execute", action="store_true", help="Apply decisions to database")
    args = parser.parse_args()

    run(dry_run=args.dry_run)


if __name__ == "__main__":
    main()
