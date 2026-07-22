#!/usr/bin/env python3
"""
Data Health Sheriff — weekly full audit.

Connection strategy (tries in order):
  1. psycopg2 direct TCP  — full SQL power; needs port 5432/6543 open
  2. Supabase REST API     — queries v_data_health view; needs SUPABASE_SERVICE_ROLE_KEY
                             + egress policy allowing *.supabase.co:443
  3. Error with fix instructions

Usage:
  python3 tools/reconcile-unmatched/sheriff_audit.py
  python3 tools/reconcile-unmatched/sheriff_audit.py --rest   # force REST mode
"""

import os
import sys
import json
import datetime
import subprocess
import argparse
from typing import Optional

# ── install deps ──────────────────────────────────────────────────────────────
try:
    import psycopg2
    import psycopg2.extras
except ImportError:
    subprocess.check_call([sys.executable, "-m", "pip", "install", "psycopg2-binary", "-q"])
    import psycopg2
    import psycopg2.extras

try:
    import requests
except ImportError:
    subprocess.check_call([sys.executable, "-m", "pip", "install", "requests", "-q"])
    import requests

# ── config ────────────────────────────────────────────────────────────────────
DB_URL          = os.environ.get("DATABASE_URL", "")
SUPABASE_URL    = "https://qcqgtcsjoacuktcewpvo.supabase.co"
SUPABASE_KEY    = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
REPORT_PATH     = "tools/reconcile-unmatched/sheriff_report.md"

SKIP_ZERO_NOTES = ["free", "in-house", "recipe"]


# ═══════════════════════════════════════════════════════════════════════════════
# Backend: psycopg2 (full SQL)
# ═══════════════════════════════════════════════════════════════════════════════

def try_psycopg2():
    """Attempt direct TCP connection. Returns psycopg2 connection or None."""
    if not DB_URL:
        return None
    try:
        conn = psycopg2.connect(
            DB_URL,
            cursor_factory=psycopg2.extras.RealDictCursor,
            connect_timeout=12,
        )
        return conn
    except Exception as e:
        print(f"  psycopg2: {e}")
        return None


def audit_psycopg2(conn) -> dict:
    """Full audit over direct SQL connection."""
    data = {}

    with conn.cursor() as cur:
        # ── stats ──
        stats = {}
        for label, sql in [
            ("total_items", "SELECT COUNT(*) AS n FROM nomenclature WHERE is_available"),
            ("raw_items",   "SELECT COUNT(*) AS n FROM nomenclature WHERE is_available AND product_code LIKE 'RAW%'"),
            ("purchase_logs","SELECT COUNT(*) AS n FROM purchase_logs"),
            ("supplier_catalog","SELECT COUNT(*) AS n FROM supplier_catalog"),
            ("zero_cost",   "SELECT COUNT(*) AS n FROM nomenclature WHERE is_available AND (cost_per_unit IS NULL OR cost_per_unit=0)"),
        ]:
            try:
                cur.execute(sql)
                stats[label] = cur.fetchone()["n"]
            except Exception:
                conn.rollback()
                stats[label] = "?"
        data["stats"] = stats

        # ── v_data_health (core metrics + score) ──
        try:
            cur.execute("SELECT metric, severity, val, health_score FROM v_data_health ORDER BY severity, val DESC")
            data["v_data_health"] = [dict(r) for r in cur.fetchall()]
        except Exception as e:
            conn.rollback()
            data["v_data_health"] = []
            print(f"  v_data_health error: {e}")

        # ── data_health_rules inventory + update trigger_count ──
        try:
            cur.execute("""
                SELECT rule_code, title, severity, auto_apply, trigger_count, is_active
                FROM data_health_rules WHERE is_active ORDER BY severity
            """)
            data["rules"] = [dict(r) for r in cur.fetchall()]
        except Exception as e:
            conn.rollback()
            data["rules"] = []

        # ── WAC recalc auto-apply ──
        wac_applied = []
        try:
            cur.execute("""
                WITH wac_calc AS (
                  SELECT pl.nomenclature_id,
                         ROUND(SUM(pl.quantity * pl.price_per_unit) / NULLIF(SUM(pl.quantity),0), 4) AS wac
                  FROM purchase_logs pl
                  JOIN nomenclature n ON n.id = pl.nomenclature_id
                  WHERE n.is_available AND (n.cost_per_unit IS NULL OR n.cost_per_unit = 0)
                    AND pl.price_per_unit > 0 AND pl.quantity > 0
                    AND (n.notes IS NULL OR NOT (
                        lower(n.notes) LIKE '%free%'
                        OR lower(n.notes) LIKE '%in-house%'
                        OR lower(n.notes) LIKE '%recipe%'
                    ))
                  GROUP BY pl.nomenclature_id HAVING SUM(pl.quantity) > 0
                )
                UPDATE nomenclature n
                SET cost_per_unit = w.wac, updated_at = now()
                FROM wac_calc w WHERE n.id = w.nomenclature_id
                RETURNING n.product_code, n.name, w.wac
            """)
            wac_applied = [dict(r) for r in cur.fetchall()]
            conn.commit()
            if wac_applied:
                print(f"  WAC recalc applied to {len(wac_applied)} items")
        except Exception as e:
            conn.rollback()
            print(f"  WAC recalc skipped: {e}")
        data["wac_applied"] = wac_applied

        # ── duplicates (pg_trgm) ──
        try:
            cur.execute("SELECT COUNT(*) AS n FROM pg_extension WHERE extname='pg_trgm'")
            has_trgm = cur.fetchone()["n"] > 0
            if has_trgm:
                cur.execute("""
                    SELECT a.product_code, a.name, a.cost_per_unit,
                           b.product_code AS dup_code, b.name AS dup_name, b.cost_per_unit AS dup_cost,
                           ROUND(similarity(lower(a.name), lower(b.name))::numeric, 2) AS sim
                    FROM nomenclature a JOIN nomenclature b ON a.id < b.id
                      AND a.is_available AND b.is_available AND a.base_unit = b.base_unit
                      AND a.cost_per_unit > 0 AND b.cost_per_unit > 0
                      AND ABS(a.cost_per_unit - b.cost_per_unit)
                          / GREATEST(a.cost_per_unit, b.cost_per_unit) < 0.2
                      AND similarity(lower(a.name), lower(b.name)) > 0.5
                    WHERE a.product_code LIKE 'RAW%' AND b.product_code LIKE 'RAW%'
                    ORDER BY sim DESC LIMIT 30
                """)
                data["duplicates"] = [dict(r) for r in cur.fetchall()]
            else:
                data["duplicates"] = []
        except Exception as e:
            conn.rollback()
            data["duplicates"] = []

        # ── unit confusion (g vs kg) ──
        try:
            cur.execute("""
                SELECT product_code, name, base_unit, cost_per_unit
                FROM nomenclature WHERE is_available AND base_unit='g'
                  AND cost_per_unit > 0 AND cost_per_unit < 5
                ORDER BY cost_per_unit LIMIT 20
            """)
            data["unit_confusion"] = [dict(r) for r in cur.fetchall()]
        except Exception as e:
            conn.rollback()
            data["unit_confusion"] = []

        # ── price drift ──
        try:
            cur.execute("""
                SELECT n.product_code, n.name, n.base_unit, n.cost_per_unit,
                       sc.last_seen_price, sc.conversion_factor,
                       ROUND(ABS(n.cost_per_unit - sc.last_seen_price)
                             / NULLIF(n.cost_per_unit,0) * 100) AS drift_pct
                FROM nomenclature n JOIN supplier_catalog sc ON sc.nomenclature_id = n.id
                WHERE n.is_available AND n.cost_per_unit > 0 AND sc.last_seen_price > 0
                  AND ABS(n.cost_per_unit - sc.last_seen_price) / n.cost_per_unit > 0.2
                ORDER BY drift_pct DESC LIMIT 25
            """)
            data["price_drift"] = [dict(r) for r in cur.fetchall()]
        except Exception as e:
            conn.rollback()
            data["price_drift"] = []

        # ── unlinked barcodes ──
        try:
            cur.execute("""
                SELECT pl.barcode, pl.raw_name, COUNT(*) AS purchase_count,
                       ROUND(SUM(pl.quantity * pl.price_per_unit)) AS total_spent
                FROM purchase_logs pl
                WHERE pl.barcode IS NOT NULL AND pl.barcode <> ''
                  AND pl.nomenclature_id IS NULL
                GROUP BY pl.barcode, pl.raw_name ORDER BY total_spent DESC LIMIT 20
            """)
            data["unlinked_barcodes"] = [dict(r) for r in cur.fetchall()]
        except Exception as e:
            conn.rollback()
            data["unlinked_barcodes"] = []

        # ── orphan purchases ──
        try:
            cur.execute("""
                SELECT n.product_code, n.name,
                       ROUND(SUM(pl.quantity * pl.price_per_unit)) AS total_spent,
                       MAX(pl.invoice_date) AS last_purchased
                FROM nomenclature n JOIN purchase_logs pl ON pl.nomenclature_id = n.id
                WHERE n.is_available AND n.product_code LIKE 'RAW%'
                  AND NOT EXISTS (SELECT 1 FROM bom_structures bs WHERE bs.ingredient_id = n.id)
                GROUP BY n.id, n.product_code, n.name ORDER BY total_spent DESC LIMIT 20
            """)
            data["orphan_purchases"] = [dict(r) for r in cur.fetchall()]
        except Exception as e:
            conn.rollback()
            data["orphan_purchases"] = []

        # ── missing nutrition ──
        try:
            cur.execute("""
                SELECT product_code, name FROM nomenclature
                WHERE is_available AND product_code LIKE 'RAW-%'
                  AND type='raw_ingredient' AND calories IS NULL
                ORDER BY product_code LIMIT 30
            """)
            data["missing_nutrition"] = [dict(r) for r in cur.fetchall()]
        except Exception as e:
            conn.rollback()
            data["missing_nutrition"] = []

    data["backend"] = "psycopg2"
    return data


# ═══════════════════════════════════════════════════════════════════════════════
# Backend: Supabase REST API
# ═══════════════════════════════════════════════════════════════════════════════

def try_supabase_rest() -> Optional[requests.Session]:
    """Attempt Supabase REST API connection. Returns requests.Session or None."""
    if not SUPABASE_KEY:
        print("  REST API: SUPABASE_SERVICE_ROLE_KEY not set in environment")
        return None
    sess = requests.Session()
    sess.headers.update({
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    })
    try:
        # A GET on /rest/v1/ with no table returns a schema list — good connectivity test
        r = sess.get(f"{SUPABASE_URL}/rest/v1/", timeout=12)
        if r.status_code in (200, 400):
            return sess
        print(f"  REST API: HTTP {r.status_code} — {r.text[:120]}")
        return None
    except requests.exceptions.ConnectionError as e:
        print(f"  REST API: connection error — {e}")
        return None
    except Exception as e:
        print(f"  REST API: {e}")
        return None


def rest_get(sess: requests.Session, path: str, params: dict = None) -> list:
    """GET /rest/v1/{path} and return list of rows."""
    r = sess.get(
        f"{SUPABASE_URL}/rest/v1/{path}",
        params=params or {},
        headers={"Prefer": "count=exact"},
        timeout=30,
    )
    r.raise_for_status()
    return r.json() if r.text else []


def rest_rpc(sess: requests.Session, fn: str, args: dict = None) -> list:
    """POST /rest/v1/rpc/{fn} and return list of rows."""
    r = sess.post(
        f"{SUPABASE_URL}/rest/v1/rpc/{fn}",
        json=args or {},
        timeout=30,
    )
    r.raise_for_status()
    return r.json() if r.text else []


def audit_supabase_rest(sess: requests.Session) -> dict:
    """Audit using Supabase REST API — queries pre-built views."""
    data = {}

    # ── v_data_health (core — all metrics + health score) ──
    try:
        rows = rest_get(sess, "v_data_health", {"order": "severity.asc,val.desc"})
        data["v_data_health"] = rows
        print(f"  v_data_health: {len(rows)} metrics")
    except Exception as e:
        data["v_data_health"] = []
        print(f"  v_data_health error: {e}")

    # ── data_health_rules ──
    try:
        rows = rest_get(sess, "data_health_rules", {
            "is_active": "eq.true",
            "select": "rule_code,title,severity,auto_apply,trigger_count",
            "order": "severity.asc",
        })
        data["rules"] = rows
        print(f"  data_health_rules: {len(rows)} active rules")
    except Exception as e:
        data["rules"] = []
        print(f"  data_health_rules error: {e}")

    # ── fn_data_health_rules_items() — per-item violations ──
    try:
        items = rest_rpc(sess, "fn_data_health_rules_items")
        data["rule_items"] = items
        print(f"  fn_data_health_rules_items: {len(items)} violations")
    except Exception as e:
        data["rule_items"] = []
        print(f"  fn_data_health_rules_items error: {e}")

    # ── WAC recalc: not possible via REST (needs CTE UPDATE) ──
    data["wac_applied"] = []

    # ── unit confusion: nomenclature filter ──
    try:
        rows = rest_get(sess, "nomenclature", {
            "is_available": "eq.true",
            "base_unit": "eq.g",
            "cost_per_unit": "gt.0",
            "select": "product_code,name,base_unit,cost_per_unit",
            "order": "cost_per_unit.asc",
            "limit": "20",
        })
        # PostgREST doesn't support cost_per_unit < 5 via simple params; filter client-side
        data["unit_confusion"] = [r for r in rows if float(r.get("cost_per_unit") or 99) < 5]
        print(f"  unit_confusion: {len(data['unit_confusion'])} items")
    except Exception as e:
        data["unit_confusion"] = []
        print(f"  unit_confusion error: {e}")

    # ── unmatched queue count ──
    try:
        rows = rest_get(sess, "unmatched_items", {
            "resolved_to": "is.null",
            "select": "id",
            "limit": "1000",
        })
        data["unmatched_count"] = len(rows)
        print(f"  unmatched_items: {data['unmatched_count']}")
    except Exception as e:
        data["unmatched_count"] = "?"

    # ── complex queries (duplicates, price_drift, orphans) require direct SQL ──
    data["duplicates"] = []
    data["price_drift"] = []
    data["orphan_purchases"] = []
    data["missing_nutrition"] = []
    data["stats"] = {}

    data["backend"] = "supabase_rest"
    return data


# ═══════════════════════════════════════════════════════════════════════════════
# Report generation
# ═══════════════════════════════════════════════════════════════════════════════

def generate_report(data: dict, run_date: str) -> str:
    backend  = data.get("backend", "unknown")
    metrics  = data.get("v_data_health", [])
    rules    = data.get("rules", [])
    stats    = data.get("stats", {})

    health_score = metrics[0].get("health_score") if metrics else "n/a"
    errors   = sum(r["val"] for r in metrics if r.get("severity") == "error")
    warnings = sum(r["val"] for r in metrics if r.get("severity") == "warning")
    actions  = sum(r["val"] for r in metrics if r.get("severity") == "action")

    def score_color(s):
        if s == "n/a":
            return "UNKNOWN"
        s = int(s)
        if s >= 90: return f"{s}/100 ✅ GOOD"
        if s >= 70: return f"{s}/100 ⚠️ FAIR"
        return f"{s}/100 🚨 CRITICAL"

    lines = [
        "# Data Health Sheriff Report",
        "",
        f"**Date:** {run_date}",
        f"**Backend:** {backend}",
        f"**Branch:** chore/ops/weekly-data-health-sheriff",
        "",
    ]

    if backend == "psycopg2":
        lines.append("> ✅ Live data — direct PostgreSQL connection succeeded.")
    elif backend == "supabase_rest":
        lines.append("> ⚠️ Live data via Supabase REST API. Some sections (duplicates, price drift,")
        lines.append("> orphan purchases) require direct SQL and are shown as n/a.")
    else:
        lines.append("> ❌ No DB connection — data sourced from migration analysis only.")

    lines += ["", "---", ""]

    # 1. Health score
    lines += [
        "## 1. Health Score",
        "",
        f"**{score_color(health_score)}**",
        "",
        f"Score formula: `100 − (errors×5) − (warnings×2) − (actions×1)`",
        "",
    ]
    if metrics:
        lines += [
            f"- Errors: {errors} × 5 = −{errors*5}",
            f"- Warnings: {warnings} × 2 = −{warnings*2}",
            f"- Actions: {actions} × 1 = −{actions}",
            "",
        ]
    if stats:
        lines += [
            "| Metric | Value |",
            "|--------|-------|",
        ]
        for k, v in stats.items():
            lines.append(f"| {k.replace('_',' ').title()} | {v} |")
        lines.append("")

    lines += ["---", ""]

    # 2. Metrics table
    lines += ["## 2. All Health Metrics", ""]
    if metrics:
        lines += ["| metric | severity | count |", "|--------|----------|-------|"]
        for m in metrics:
            icon = {"error": "🚨", "warning": "⚠️", "action": "🔔", "info": "ℹ️"}.get(m.get("severity",""), "")
            flag = " ← **FIX REQUIRED**" if m.get("severity") == "error" and int(m.get("val",0)) > 0 else ""
            lines.append(f"| {m['metric']} | {icon} {m.get('severity','')} | {m.get('val','?')}{flag} |")
    else:
        lines.append("_Not available — v_data_health could not be queried._")
    lines += ["", "---", ""]

    # 3. Auto-fixes applied
    wac = data.get("wac_applied", [])
    lines += ["## 3. Auto-fixes Applied (WAC Recalc)", ""]
    if wac:
        lines.append(f"Updated WAC on {len(wac)} zero-cost items:")
        lines.append("")
        for r in wac[:20]:
            lines.append(f"- `{r['product_code']}` {r['name']} → WAC={r['wac']}")
    elif backend == "psycopg2":
        lines.append("No zero-cost items with purchases found (or all are intentionally free).")
    else:
        lines.append("WAC recalc requires direct SQL — not available in REST mode.")
        lines.append("")
        lines.append("Run manually in Supabase SQL editor:")
        lines.append("```sql")
        lines.append("WITH wac_calc AS (")
        lines.append("  SELECT pl.nomenclature_id,")
        lines.append("         ROUND(SUM(pl.quantity * pl.price_per_unit) / NULLIF(SUM(pl.quantity),0), 4) AS wac")
        lines.append("  FROM purchase_logs pl JOIN nomenclature n ON n.id = pl.nomenclature_id")
        lines.append("  WHERE n.is_available AND (n.cost_per_unit IS NULL OR n.cost_per_unit = 0)")
        lines.append("    AND pl.price_per_unit > 0 AND pl.quantity > 0")
        lines.append("    AND (n.notes IS NULL OR NOT (")
        lines.append("        lower(n.notes) LIKE '%free%' OR lower(n.notes) LIKE '%in-house%'")
        lines.append("        OR lower(n.notes) LIKE '%recipe%'))")
        lines.append("  GROUP BY pl.nomenclature_id HAVING SUM(pl.quantity) > 0")
        lines.append(")")
        lines.append("UPDATE nomenclature n SET cost_per_unit = w.wac, updated_at = now()")
        lines.append("FROM wac_calc w WHERE n.id = w.nomenclature_id")
        lines.append("RETURNING product_code, name, cost_per_unit;")
        lines.append("```")
    lines += ["", "---", ""]

    # 4. Detailed rule violations (from fn_data_health_rules_items)
    rule_items = data.get("rule_items", [])
    if rule_items:
        lines += ["## 4. Rule Violations (Detail)", ""]
        from itertools import groupby
        rule_items_sorted = sorted(rule_items, key=lambda x: x.get("metric",""))
        for metric, group in groupby(rule_items_sorted, key=lambda x: x.get("metric","")):
            group_list = list(group)
            lines.append(f"### {metric} ({len(group_list)} items)")
            lines.append("")
            lines += ["| product_code | name |", "|-------------|------|"]
            for item in group_list[:10]:
                lines.append(f"| {item.get('product_code','—')} | {str(item.get('name',''))[:50]} |")
            if len(group_list) > 10:
                lines.append(f"| … | +{len(group_list)-10} more |")
            lines.append("")
        lines += ["---", ""]

    # 5. Duplicates
    dups = data.get("duplicates", [])
    lines += ["## 5. Merge Candidates (Fuzzy Duplicates)", ""]
    if dups:
        lines.append(f"**{len(dups)}** RAW item pairs with similar name + price (±20%), same base_unit:")
        lines.append("")
        lines += ["| sim | code | name | ↔ | code | name |",
                  "|-----|------|------|---|------|------|"]
        for d in dups[:20]:
            lines.append(
                f"| {d['sim']} | {d['product_code']} | {str(d['name'])[:28]} "
                f"| ↔ | {d['dup_code']} | {str(d['dup_name'])[:28]} |"
            )
        lines.append("")
        lines.append("> **Never auto-merge.** Deactivate the duplicate after manual confirmation.")
    elif backend == "psycopg2":
        lines.append("No fuzzy duplicate pairs found. ✅")
    else:
        lines.append("_Requires direct SQL — run `SELECT * FROM v_data_health WHERE metric='fuzzy_duplicate_candidates';` for count._")
    lines += ["", "---", ""]

    # 6. Empty BOMs
    lines += [
        "## 6. Empty BOM Dishes (need /chef)",
        "",
        "```sql",
        "SELECT product_code, name FROM nomenclature",
        "WHERE is_available AND product_code SIMILAR TO '(SALE|PF|MOD)-%'",
        "  AND NOT EXISTS (SELECT 1 FROM bom_structures bs WHERE bs.parent_id = id)",
        "ORDER BY product_code;",
        "```",
        "",
    ]

    # 7. Orphan purchases
    orphans = data.get("orphan_purchases", [])
    lines += ["## 7. Orphan Items (Purchased, Not in Any BOM)", ""]
    if orphans:
        lines += ["| product_code | name | total_spent | last_purchased |",
                  "|-------------|------|------------|----------------|"]
        for r in orphans:
            lines.append(f"| {r['product_code']} | {str(r['name'])[:30]} | {r['total_spent']} | {r['last_purchased']} |")
    elif backend == "psycopg2":
        lines.append("No orphan purchased items. ✅")
    else:
        lines.append("_Requires direct SQL — check `orphan_items` count in v_data_health above._")
    lines += ["", "---", ""]

    # 8. Price drift
    drift = data.get("price_drift", [])
    lines += ["## 8. Price Drift Alerts", ""]
    if drift:
        broken = [r for r in drift if (r.get("drift_pct") or 0) > 1000]
        if broken:
            lines.append(f"🚨 **{len(broken)} items with drift >1000% (broken conversion_factor):**")
            lines.append("")
        lines += ["| product_code | unit | WAC | last_price | drift% |",
                  "|-------------|------|-----|-----------|--------|"]
        for r in drift[:20]:
            flag = " 🚨" if (r.get("drift_pct") or 0) > 1000 else ""
            lines.append(f"| {r['product_code']} | {r['base_unit']} | {r['cost_per_unit']} | {r['last_seen_price']} | {r['drift_pct']}%{flag} |")
    elif backend == "psycopg2":
        lines.append("No price drift >20% detected. ✅")
    else:
        lines.append("_Requires direct SQL — not available in REST mode._")
    lines += ["", "---", ""]

    # 9. Unlinked barcodes
    unlinked = data.get("unlinked_barcodes", [])
    lines += ["## 9. Unlinked Barcodes", ""]
    if unlinked:
        lines += ["| barcode | raw_name | count | total_spent |",
                  "|---------|----------|-------|------------|"]
        for r in unlinked[:15]:
            lines.append(f"| {r['barcode']} | {str(r.get('raw_name',''))[:35]} | {r['purchase_count']} | {r['total_spent']} |")
    elif backend == "psycopg2":
        lines.append("No unlinked barcodes. ✅")
    else:
        lines.append("_Requires direct SQL._")
    lines += ["", "---", ""]

    # 10. Unit confusion
    unit_c = data.get("unit_confusion", [])
    lines += ["## 10. Unit Confusion (g vs kg)", ""]
    if unit_c:
        lines.append(f"**{len(unit_c)} items** with `base_unit='g'` and `cost_per_unit<5` — likely should be `kg`:")
        lines.append("")
        lines += ["| product_code | name | cost/g | → correct cost/kg |",
                  "|-------------|------|--------|-------------------|"]
        for r in unit_c:
            correct = round(float(r["cost_per_unit"]) * 1000, 2)
            lines.append(f"| {r['product_code']} | {r['name']} | {r['cost_per_unit']} | {correct} |")
        lines.append("")
        lines.append("> Fix: UPDATE nomenclature SET base_unit='kg', cost_per_unit=cost_per_unit*1000 WHERE … (write a migration)")
    else:
        lines.append("No g/kg unit confusion detected. ✅")
    lines += ["", "---", ""]

    # 11. Missing nutrition
    missing_n = data.get("missing_nutrition", [])
    lines += ["## 11. Missing Nutrition", ""]
    if missing_n:
        lines.append(f"{len(missing_n)} RAW food items missing `calories`:")
        lines.append("")
        for r in missing_n[:20]:
            lines.append(f"- `{r['product_code']}` {r['name']}")
    elif backend == "psycopg2":
        lines.append("No nutrition gaps detected. ✅")
    else:
        lines.append(f"_Requires direct SQL — check `nutrition_missing` count in v_data_health above._")
    lines += ["", "---", ""]

    # 12. Known open issues (always shown — from migration evidence)
    lines += [
        "## 12. Known Open Issues (Migration Evidence)",
        "",
        "These are confirmed regardless of DB connectivity:",
        "",
        "| # | finding | status | action |",
        "|---|---------|--------|--------|",
        "| A | Frozen/fresh SKU mismatches (ARO Cheddar/Mozzarella/Salmon → fresh SKUs) | 🔴 Open since mig 216 | `/chef create_product` + re-link purchase_logs |",
        "| B | `RAW-WHITE VINEGAR 5%` — spaces+`%` in product_code | 🔴 Open since mig 156 | Write migration to rename → `RAW-WHITE-VINEGAR-5PCT` |",
        "| C | 9 NF-PKG packaging items have correct per-piece cost but zero BOM refs | 🟠 MC 2385d288 Phase 2 | `/chef add_bom_line` for each dish that uses packaging |",
        "",
        "---",
        "",
        f"*Generated by Data Health Sheriff · {run_date} · backend={backend}*",
    ]

    return "\n".join(lines)


# ═══════════════════════════════════════════════════════════════════════════════
# Main
# ═══════════════════════════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--rest", action="store_true", help="Force Supabase REST API mode")
    args = parser.parse_args()

    run_date = datetime.date.today().isoformat()
    print(f"\nData Health Sheriff — {run_date}")
    print("=" * 60)

    data = None

    # ── Try psycopg2 first (unless --rest forced) ──
    if not args.rest:
        print("\n[1/2] Trying psycopg2 direct connection...")
        conn = try_psycopg2()
        if conn:
            print("  Connected via psycopg2 ✓")
            try:
                data = audit_psycopg2(conn)
            finally:
                conn.close()

    # ── Fall back to Supabase REST API ──
    if data is None:
        print("\n[2/2] Trying Supabase REST API...")
        sess = try_supabase_rest()
        if sess:
            print("  Connected via REST API ✓")
            data = audit_supabase_rest(sess)

    # ── Both failed ──
    if data is None:
        print("\n❌ No DB connection available.")
        print("\nTo fix:")
        print("  1. Add SUPABASE_SERVICE_ROLE_KEY to scheduled-routine environment variables")
        print("  2. Allow egress to qcqgtcsjoacuktcewpvo.supabase.co:443 in CC web settings")
        print("  3. Or open port 5432/6543 for direct psycopg2 access")
        print("\nSee sheriff_report.md for manual SQL queries.")
        sys.exit(1)

    # ── Generate report ──
    print("\n\nGenerating sheriff_report.md...")
    report = generate_report(data, run_date)
    with open(REPORT_PATH, "w", encoding="utf-8") as f:
        f.write(report)
    print(f"Report written: {REPORT_PATH}")

    # ── Summary ──
    metrics = data.get("v_data_health", [])
    health_score = metrics[0].get("health_score", "?") if metrics else "?"
    errors   = sum(r["val"] for r in metrics if r.get("severity") == "error")
    warnings = sum(r["val"] for r in metrics if r.get("severity") == "warning")
    wac_count = len(data.get("wac_applied", []))
    dup_count = len(data.get("duplicates", []))
    drift_count = len(data.get("price_drift", []))

    print(f"\n{'=' * 60}")
    print(f"Health score:  {health_score}/100")
    print(f"Errors:        {errors}")
    print(f"Warnings:      {warnings}")
    print(f"WAC fixes:     {wac_count}")
    print(f"Duplicates:    {dup_count}")
    print(f"Price drift:   {drift_count}")
    print(f"Backend:       {data['backend']}")
    print(f"{'=' * 60}")


if __name__ == "__main__":
    main()
