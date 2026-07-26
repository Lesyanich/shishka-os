#!/usr/bin/env python3
"""
Data Health Sheriff — weekly full audit.
Phases 1 (data_health_rules), 2 (duplicate detection), 4 (price drift).
Phase 3 (Makro barcode API audit) is run separately via audit_makro_barcodes.py.
"""

import json
import os
import sys
import traceback
from datetime import datetime, date
from typing import Any

import psycopg2
import psycopg2.extras

DB_URL = os.environ.get("DATABASE_URL", "")
if not DB_URL:
    print("ERROR: DATABASE_URL not set", file=sys.stderr)
    sys.exit(1)

SKIP_ZERO_COST_NOTES = ["free", "in-house", "recipe"]

results = {
    "run_date": datetime.utcnow().isoformat(),
    "phase1": {},
    "phase2": [],
    "phase4": [],
    "wac_fixes": [],
    "errors": [],
    "stats": {},
}


def get_conn():
    return psycopg2.connect(DB_URL, cursor_factory=psycopg2.extras.RealDictCursor)


# ─── Phase 1: data_health_rules ──────────────────────────────────────────────
def run_phase1(conn):
    print("\n=== Phase 1: data_health_rules ===")
    with conn.cursor() as cur:
        try:
            cur.execute("""
                SELECT rule_code, title, detect_sql, auto_apply, severity
                FROM data_health_rules
                WHERE is_active
                ORDER BY severity DESC
            """)
            rules = cur.fetchall()
        except Exception as e:
            msg = f"Phase 1 setup error: {e}"
            print(msg)
            results["errors"].append(msg)
            return

    rule_results = {}
    for rule in rules:
        code = rule["rule_code"]
        title = rule["title"]
        detect_sql = rule["detect_sql"]
        auto_apply = rule["auto_apply"]
        severity = rule["severity"]
        print(f"  [{severity}] {code}: {title}")

        if not detect_sql:
            print(f"    → no detect_sql, skipping")
            rule_results[code] = {"title": title, "severity": severity, "count": None, "auto_apply": auto_apply}
            continue

        with conn.cursor() as cur:
            try:
                cur.execute(detect_sql)
                rows = cur.fetchall()
                count = len(rows)
                print(f"    → {count} violations")

                # Update trigger_count
                try:
                    with conn.cursor() as c2:
                        c2.execute(
                            "UPDATE data_health_rules SET trigger_count = COALESCE(trigger_count,0) + %s, last_run_at = NOW() WHERE rule_code = %s",
                            (count, code)
                        )
                        conn.commit()
                except Exception as ue:
                    conn.rollback()
                    print(f"    → trigger_count update failed: {ue}")

                rule_results[code] = {
                    "title": title,
                    "severity": severity,
                    "count": count,
                    "auto_apply": auto_apply,
                    "sample": [dict(r) for r in rows[:5]],
                }
            except Exception as e:
                conn.rollback()
                msg = f"    → detect_sql failed for {code}: {e}"
                print(msg)
                results["errors"].append(msg)
                rule_results[code] = {"title": title, "severity": severity, "count": "ERROR", "error": str(e)}

    results["phase1"] = rule_results

    # ── auto_apply: WAC recalc for zero-cost items ──
    print("\n  [auto_apply] WAC recalculation for zero-cost items with purchase history...")
    skip_clause = " AND ".join([f"LOWER(COALESCE(n.notes,'')) NOT LIKE '%{k}%'" for k in SKIP_ZERO_COST_NOTES])
    wac_sql = f"""
        WITH wac_calc AS (
            SELECT pl.nomenclature_id,
                   ROUND(SUM(pl.quantity * pl.price_per_unit) / NULLIF(SUM(pl.quantity), 0), 4) AS wac
            FROM purchase_logs pl
            JOIN nomenclature n ON n.id = pl.nomenclature_id
            WHERE n.is_available
              AND (n.cost_per_unit IS NULL OR n.cost_per_unit = 0)
              AND pl.price_per_unit > 0 AND pl.quantity > 0
              AND {skip_clause}
            GROUP BY pl.nomenclature_id HAVING SUM(pl.quantity) > 0
        )
        UPDATE nomenclature n
        SET cost_per_unit = w.wac, updated_at = now()
        FROM wac_calc w
        WHERE n.id = w.nomenclature_id
        RETURNING n.id, n.product_code, n.name, w.wac
    """
    with conn.cursor() as cur:
        try:
            cur.execute(wac_sql)
            fixed = cur.fetchall()
            conn.commit()
            print(f"    → WAC recalculated for {len(fixed)} items")
            for row in fixed:
                print(f"       {row['product_code']} | {row['name'][:40]} | WAC={row['wac']}")
            results["wac_fixes"] = [dict(r) for r in fixed]
        except Exception as e:
            conn.rollback()
            msg = f"    → WAC recalc failed: {e}"
            print(msg)
            results["errors"].append(msg)


# ─── Phase 2: Smart duplicate detection ──────────────────────────────────────
def run_phase2(conn):
    print("\n=== Phase 2: Smart duplicate detection ===")

    # Requires pg_trgm extension for similarity()
    with conn.cursor() as cur:
        try:
            cur.execute("SELECT 1 FROM pg_extension WHERE extname='pg_trgm'")
            has_trgm = cur.fetchone() is not None
        except Exception:
            has_trgm = False
            conn.rollback()

    if not has_trgm:
        print("  pg_trgm extension not available, using basic duplicate check...")
        dup_sql = """
            SELECT a.product_code, a.name, a.cost_per_unit,
                   b.product_code AS dup_code, b.name AS dup_name, b.cost_per_unit AS dup_cost,
                   a.base_unit,
                   NULL::float AS name_similarity
            FROM nomenclature a
            JOIN nomenclature b ON a.id < b.id
              AND a.is_available AND b.is_available
              AND a.base_unit = b.base_unit
              AND a.cost_per_unit > 0 AND b.cost_per_unit > 0
              AND ABS(a.cost_per_unit - b.cost_per_unit) / GREATEST(a.cost_per_unit, b.cost_per_unit) < 0.2
            WHERE (a.product_code LIKE 'RAW%' AND b.product_code LIKE 'RAW%')
              AND LOWER(a.name) LIKE LOWER(SPLIT_PART(b.name, ' ', 1)) || '%'
            ORDER BY a.name
            LIMIT 30
        """
    else:
        dup_sql = """
            SELECT a.product_code, a.name, a.cost_per_unit,
                   b.product_code AS dup_code, b.name AS dup_name, b.cost_per_unit AS dup_cost,
                   a.base_unit,
                   ROUND(similarity(lower(a.name), lower(b.name))::numeric, 3) AS name_similarity
            FROM nomenclature a
            JOIN nomenclature b ON a.id < b.id
              AND a.is_available AND b.is_available
              AND a.base_unit = b.base_unit
              AND a.cost_per_unit > 0 AND b.cost_per_unit > 0
              AND ABS(a.cost_per_unit - b.cost_per_unit) / GREATEST(a.cost_per_unit, b.cost_per_unit) < 0.2
              AND similarity(lower(a.name), lower(b.name)) > 0.5
            WHERE (a.product_code LIKE 'RAW%' AND b.product_code LIKE 'RAW%')
            ORDER BY similarity(lower(a.name), lower(b.name)) DESC
            LIMIT 40
        """

    with conn.cursor() as cur:
        try:
            cur.execute(dup_sql)
            dups = cur.fetchall()
            print(f"  Found {len(dups)} potential duplicate pairs")
            for d in dups:
                sim = d.get("name_similarity")
                sim_str = f" sim={sim}" if sim else ""
                print(f"    {d['product_code']} '{d['name']}' vs {d['dup_code']} '{d['dup_name']}'{sim_str}")
            results["phase2"] = [dict(d) for d in dups]
        except Exception as e:
            conn.rollback()
            msg = f"  Phase 2 failed: {e}"
            print(msg)
            results["errors"].append(msg)

    # Additional: same base_unit + cost_per_unit < 5 AND base_unit='g' pattern
    print("\n  [unit confusion] Checking g vs kg confusion...")
    with conn.cursor() as cur:
        try:
            cur.execute("""
                SELECT product_code, name, cost_per_unit, base_unit, notes
                FROM nomenclature
                WHERE is_available AND base_unit = 'g' AND cost_per_unit > 0 AND cost_per_unit < 5
                ORDER BY cost_per_unit
                LIMIT 20
            """)
            unit_confused = cur.fetchall()
            print(f"  Found {len(unit_confused)} items with cost_per_unit < 5 AND base_unit='g' (likely kg confusion)")
            for r in unit_confused:
                print(f"    {r['product_code']} | {r['name'][:40]} | cost={r['cost_per_unit']} base={r['base_unit']}")
            results["unit_confusion"] = [dict(r) for r in unit_confused]
        except Exception as e:
            conn.rollback()
            msg = f"  unit confusion check failed: {e}"
            print(msg)
            results["errors"].append(msg)


# ─── Phase 4: Price drift + conversion sanity ─────────────────────────────────
def run_phase4(conn):
    print("\n=== Phase 4: Price drift + conversion sanity ===")
    drift_sql = """
        SELECT n.product_code, n.name, n.base_unit,
               n.cost_per_unit, sc.last_seen_price, sc.conversion_factor,
               ROUND(ABS(n.cost_per_unit - sc.last_seen_price) / NULLIF(n.cost_per_unit, 0) * 100) AS drift_pct
        FROM nomenclature n
        JOIN supplier_catalog sc ON sc.nomenclature_id = n.id
        WHERE n.is_available AND n.cost_per_unit > 0 AND sc.last_seen_price > 0
          AND ABS(n.cost_per_unit - sc.last_seen_price) / n.cost_per_unit > 0.2
        ORDER BY drift_pct DESC NULLS LAST
        LIMIT 20
    """
    with conn.cursor() as cur:
        try:
            cur.execute(drift_sql)
            drifts = cur.fetchall()
            print(f"  Found {len(drifts)} items with >20% price drift")
            for d in drifts:
                flag = " ← BROKEN CONVERSION" if (d["drift_pct"] or 0) > 1000 else ""
                print(f"    {d['product_code']} | {d['name'][:35]} | WAC={d['cost_per_unit']} last_price={d['last_seen_price']} drift={d['drift_pct']}%{flag}")
            results["phase4"] = [dict(d) for d in drifts]
        except Exception as e:
            conn.rollback()
            msg = f"  Phase 4 failed: {e}"
            print(msg)
            results["errors"].append(msg)


# ─── Additional: Zero-cost items (manual check) ───────────────────────────────
def run_zero_cost_check(conn):
    print("\n=== Additional: Zero-cost items (non-intentional) ===")
    skip_clause = " AND ".join([f"LOWER(COALESCE(notes,'')) NOT LIKE '%{k}%'" for k in SKIP_ZERO_COST_NOTES])
    with conn.cursor() as cur:
        try:
            cur.execute(f"""
                SELECT product_code, name, base_unit, notes,
                       (SELECT COUNT(*) FROM purchase_logs pl WHERE pl.nomenclature_id = n.id AND pl.price_per_unit > 0) as purchase_count
                FROM nomenclature n
                WHERE is_available AND (cost_per_unit IS NULL OR cost_per_unit = 0)
                  AND {skip_clause}
                ORDER BY product_code
            """)
            zeros = cur.fetchall()
            no_purchases = [r for r in zeros if r["purchase_count"] == 0]
            with_purchases = [r for r in zeros if r["purchase_count"] > 0]
            print(f"  Zero-cost items: {len(zeros)} total ({len(with_purchases)} have purchase history, {len(no_purchases)} orphaned)")
            for r in with_purchases:
                print(f"    HAS PURCHASES: {r['product_code']} | {r['name'][:40]} | {r['purchase_count']} logs")
            results["zero_cost"] = {"with_purchases": [dict(r) for r in with_purchases], "no_purchases": [dict(r) for r in no_purchases]}
        except Exception as e:
            conn.rollback()
            msg = f"  zero-cost check failed: {e}"
            print(msg)
            results["errors"].append(msg)


# ─── Additional: Orphan items + missing nutrition + empty BOM ─────────────────
def run_additional_checks(conn):
    print("\n=== Additional: Orphan / nutrition / empty BOM ===")

    # Orphan RAW items (purchased but not used in any BOM)
    with conn.cursor() as cur:
        try:
            cur.execute("""
                SELECT n.product_code, n.name, n.cost_per_unit,
                       (SELECT COUNT(*) FROM bom_items bi WHERE bi.ingredient_id = n.id) AS bom_count,
                       (SELECT MAX(pl.purchase_date) FROM purchase_logs pl WHERE pl.nomenclature_id = n.id) AS last_purchase
                FROM nomenclature n
                WHERE n.is_available AND n.product_code LIKE 'RAW%'
                  AND (SELECT COUNT(*) FROM bom_items bi WHERE bi.ingredient_id = n.id) = 0
                  AND (SELECT COUNT(*) FROM purchase_logs pl WHERE pl.nomenclature_id = n.id) > 0
                ORDER BY last_purchase DESC NULLS LAST
                LIMIT 25
            """)
            orphans = cur.fetchall()
            print(f"  Orphan RAW items (purchased, not in any BOM): {len(orphans)}")
            for r in orphans[:10]:
                print(f"    {r['product_code']} | {r['name'][:40]} | last purchase: {r['last_purchase']}")
            results["orphans"] = [dict(r) for r in orphans]
        except Exception as e:
            conn.rollback()
            msg = f"  orphan check failed: {e}"
            print(msg)
            results["errors"].append(msg)

    # Missing nutrition on SALE items
    with conn.cursor() as cur:
        try:
            cur.execute("""
                SELECT product_code, name
                FROM nomenclature
                WHERE is_available AND product_code LIKE 'SALE%'
                  AND (nutrition_per_100g IS NULL OR nutrition_per_100g = '{}' OR nutrition_per_100g = 'null')
                ORDER BY product_code
                LIMIT 20
            """)
            no_nutrition = cur.fetchall()
            print(f"  SALE items missing nutrition: {len(no_nutrition)}")
            results["missing_nutrition"] = [dict(r) for r in no_nutrition]
        except Exception as e:
            conn.rollback()
            msg = f"  nutrition check failed: {e}"
            print(msg)
            results["errors"].append(msg)

    # SALE items with empty BOM
    with conn.cursor() as cur:
        try:
            cur.execute("""
                SELECT product_code, name
                FROM nomenclature
                WHERE is_available AND product_code LIKE 'SALE%'
                  AND (SELECT COUNT(*) FROM bom_items bi WHERE bi.parent_id = nomenclature.id) = 0
                ORDER BY product_code
                LIMIT 20
            """)
            empty_bom = cur.fetchall()
            print(f"  SALE items with empty BOM: {len(empty_bom)}")
            results["empty_bom"] = [dict(r) for r in empty_bom]
        except Exception as e:
            conn.rollback()
            msg = f"  empty BOM check failed: {e}"
            print(msg)
            results["errors"].append(msg)

    # General stats
    with conn.cursor() as cur:
        try:
            cur.execute("""
                SELECT
                    COUNT(*) FILTER (WHERE is_available) AS total_active,
                    COUNT(*) FILTER (WHERE is_available AND product_code LIKE 'RAW%') AS raw_count,
                    COUNT(*) FILTER (WHERE is_available AND product_code LIKE 'PF%') AS pf_count,
                    COUNT(*) FILTER (WHERE is_available AND product_code LIKE 'SALE%') AS sale_count,
                    COUNT(*) FILTER (WHERE is_available AND product_code LIKE 'MOD%') AS mod_count,
                    COUNT(*) FILTER (WHERE is_available AND (cost_per_unit IS NULL OR cost_per_unit = 0)) AS zero_cost_total
                FROM nomenclature
            """)
            stats = cur.fetchone()
            print(f"\n  Catalog stats: {dict(stats)}")
            results["stats"] = dict(stats)
        except Exception as e:
            conn.rollback()
            msg = f"  stats failed: {e}"
            print(msg)
            results["errors"].append(msg)


# ─── Main ─────────────────────────────────────────────────────────────────────
def main():
    conn = get_conn()
    try:
        run_phase1(conn)
        run_phase2(conn)
        run_phase4(conn)
        run_zero_cost_check(conn)
        run_additional_checks(conn)
    finally:
        conn.close()

    # Save results as JSON for report generation
    out_path = "tools/reconcile-unmatched/sheriff_audit_data.json"
    with open(out_path, "w") as f:
        json.dump(results, f, indent=2, default=str)
    print(f"\n✓ Audit data saved to {out_path}")


if __name__ == "__main__":
    main()
