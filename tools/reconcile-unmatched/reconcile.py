#!/usr/bin/env python3
"""
Reconcile unmatched receipt food_items → purchase_logs + WAC update.

Reads parsed_payload from receipt_inbox, matches to nomenclature
(or creates RAW-AUTO), and inserts purchase_logs so the WAC trigger
fires. No re-OCR needed — data already exists in parsed_payload.

Usage:
  python3 reconcile.py --dry-run   # preview what would happen
  python3 reconcile.py             # execute reconciliation
"""

import json
import os
import subprocess
import sys
from typing import Optional

try:
    import psycopg2
    import psycopg2.extras
except ImportError:
    print("Installing psycopg2-binary...")
    subprocess.check_call([sys.executable, "-m", "pip", "install", "psycopg2-binary", "-q"])
    import psycopg2
    import psycopg2.extras


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


def fetch_unmatched_items(cur) -> list[dict]:
    """Extract all unmatched food_items from receipt_inbox.parsed_payload."""
    cur.execute("""
        SELECT
            ri.id AS receipt_id,
            ri.expense_id,
            ri.upload_date,
            fi.ordinality AS item_idx,
            fi.value->>'name' AS item_name,
            fi.value->>'original_name' AS thai_name,
            fi.value->>'barcode' AS barcode,
            fi.value->>'supplier_sku' AS supplier_sku,
            fi.value->>'nomenclature_id' AS nom_id,
            (fi.value->>'quantity')::numeric AS quantity,
            fi.value->>'unit' AS unit,
            (fi.value->>'unit_price')::numeric AS unit_price,
            (fi.value->>'total_price')::numeric AS total_price,
            fi.value->>'brand' AS brand,
            fi.value->>'package_weight' AS package_weight
        FROM receipt_inbox ri,
             jsonb_array_elements(ri.parsed_payload->'food_items')
             WITH ORDINALITY AS fi(value, ordinality)
        WHERE ri.status = 'processed'
          AND ri.parsed_payload->'food_items' IS NOT NULL
          AND (fi.value->>'nomenclature_id' IS NULL
               OR fi.value->>'nomenclature_id' = '')
        ORDER BY ri.upload_date DESC, fi.ordinality
    """)
    columns = [desc[0] for desc in cur.description]
    return [dict(zip(columns, row)) for row in cur.fetchall()]


def find_nomenclature_match(cur, item: dict) -> Optional[str]:
    """Try to match item to existing nomenclature."""
    barcode = item.get("barcode")
    name = item.get("item_name", "")

    # 1. Barcode match via supplier_catalog
    if barcode:
        cur.execute("""
            SELECT sc.nomenclature_id FROM supplier_catalog sc
            WHERE sc.barcode = %s AND sc.nomenclature_id IS NOT NULL
            ORDER BY sc.match_count DESC LIMIT 1
        """, (barcode,))
        row = cur.fetchone()
        if row:
            return str(row[0])

        # Also try SKU table
        cur.execute("""
            SELECT s.nomenclature_id FROM sku s
            WHERE s.barcode = %s AND s.nomenclature_id IS NOT NULL
            LIMIT 1
        """, (barcode,))
        row = cur.fetchone()
        if row:
            return str(row[0])

    # 2. Fuzzy name match against existing RAW items
    if name:
        cur.execute("""
            SELECT n.id, similarity(lower(n.name), lower(%s)) AS sim
            FROM nomenclature n
            WHERE n.is_available = true
              AND n.product_code LIKE 'RAW-%%'
              AND n.product_code NOT LIKE 'RAW-AUTO-%%'
              AND similarity(lower(n.name), lower(%s)) > 0.5
            ORDER BY sim DESC
            LIMIT 1
        """, (name, name))
        row = cur.fetchone()
        if row and row[1] > 0.6:
            return str(row[0])

    return None


def create_raw_auto(cur, item: dict) -> str:
    """Create RAW-AUTO nomenclature item, return its UUID."""
    import hashlib
    name = item.get("item_name", "Unknown")
    barcode = item.get("barcode") or ""
    code_hash = hashlib.md5((name + barcode).encode()).hexdigest()[:8]
    product_code = f"RAW-AUTO-{code_hash}"
    unit = item.get("unit", "pcs")

    cur.execute("""
        INSERT INTO nomenclature (product_code, name, type, base_unit, is_available)
        VALUES (%s, %s, 'raw_ingredient', %s, true)
        ON CONFLICT (product_code) DO UPDATE SET updated_at = now()
        RETURNING id
    """, (product_code, name, unit))
    return str(cur.fetchone()[0])


def check_already_reconciled(cur, expense_id: str, item_name: str) -> bool:
    """Check if this item was already written to purchase_logs (idempotency)."""
    if not expense_id:
        return True  # skip items without expense_id
    cur.execute("""
        SELECT 1 FROM purchase_logs
        WHERE expense_id = %s AND notes = %s
        LIMIT 1
    """, (expense_id, item_name))
    return cur.fetchone() is not None


# Makro supplier UUID (constant)
MAKRO_SUPPLIER_ID = "c548db19-8a70-4f34-96af-d66162793cbf"


def insert_purchase_log(cur, item: dict, nom_id: str) -> None:
    """Insert a purchase_logs row — WAC trigger fires automatically."""
    cur.execute("""
        INSERT INTO purchase_logs (
            nomenclature_id, supplier_id, quantity, price_per_unit,
            total_price, invoice_date, expense_id, notes, barcode
        ) VALUES (%s, %s, %s, %s, %s,
            COALESCE(
                (SELECT transaction_date FROM expense_ledger WHERE id = %s),
                CURRENT_DATE
            ),
            %s, %s, %s
        )
    """, (
        nom_id,
        MAKRO_SUPPLIER_ID,
        item.get("quantity", 1),
        item.get("unit_price", 0),
        item.get("total_price", 0),
        item["expense_id"],
        item["expense_id"],
        item.get("item_name", ""),
        item.get("barcode"),
    ))


def main():
    dry_run = "--dry-run" in sys.argv
    db_url = get_db_url()
    conn = psycopg2.connect(db_url)

    if dry_run:
        print("=== DRY RUN MODE ===\n")

    try:
        with conn.cursor() as cur:
            items = fetch_unmatched_items(cur)
            print(f"Found {len(items)} unmatched food_items in parsed_payload\n")

            matched = 0
            created = 0
            skipped = 0
            errors = 0

            for item in items:
                name = item.get("item_name", "?")
                expense_id = item.get("expense_id")

                if not expense_id:
                    skipped += 1
                    continue

                # Idempotency check
                if check_already_reconciled(cur, expense_id, name):
                    skipped += 1
                    continue

                # Try matching
                nom_id = find_nomenclature_match(cur, item)
                action = "MATCH"

                if not nom_id:
                    if dry_run:
                        action = "WOULD-CREATE"
                    else:
                        nom_id = create_raw_auto(cur, item)
                    action = "CREATE"
                    created += 1
                else:
                    matched += 1

                total = item.get("total_price", 0) or 0
                print(f"  [{action:6}] {name[:50]:<50} ฿{total:>8.0f}  nom={nom_id or '?'}")

                if not dry_run and nom_id:
                    try:
                        insert_purchase_log(cur, item, nom_id)
                    except Exception as e:
                        print(f"    ERROR: {e}")
                        errors += 1
                        conn.rollback()
                        continue

            if not dry_run:
                conn.commit()

            print(f"\n{'=' * 60}")
            print(f"Total items:  {len(items)}")
            print(f"Matched:      {matched}")
            print(f"Created:      {created}")
            print(f"Skipped:      {skipped} (already reconciled or no expense_id)")
            print(f"Errors:       {errors}")
            print(f"{'=' * 60}")

            if not dry_run:
                # Verify key ingredients got WAC
                print("\nVerifying key ingredients WAC:")
                cur.execute("""
                    SELECT product_code, name, cost_per_unit
                    FROM nomenclature
                    WHERE product_code IN (
                        'RAW-LAMB_MINCE', 'RAW-TAHINI',
                        'RAW-POMEGRANATE_MOLASSES', 'RAW-CHILI-PASTE',
                        'RAW-TOMATO-PASTE'
                    )
                    ORDER BY product_code
                """)
                for row in cur.fetchall():
                    status = "✓" if row[2] and row[2] > 0 else "✗ STILL ZERO"
                    print(f"  {row[0]:<30} cost={row[2] or 0:>8.2f} {status}")

    finally:
        conn.close()


if __name__ == "__main__":
    main()
