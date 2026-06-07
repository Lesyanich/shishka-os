#!/usr/bin/env python3
"""
sheriff_audit.py — Weekly Data Health Audit for Shishka Healthy Kitchen

Runs ALL data quality checks in 5 phases:
  Phase 1: Execute all active data_health_rules (auto-apply WAC where safe)
  Phase 2: Smart duplicate detection (same supplier + price + name similarity)
  Phase 3: Makro barcode audit (delegates to audit_makro_barcodes.py)
  Phase 4: Price drift + conversion sanity check
  Phase 5: Generate sheriff_report.md

Safe auto-fixes applied in this script:
  - WAC recalc for zero-cost items that have purchase_logs
  - Skips items where notes ILIKE '%free%' or '%in-house%' or '%recipe%'

NEVER: delete, auto-merge, modify prices without purchase_logs evidence.

Usage:
  python3 tools/data-health/sheriff_audit.py
  python3 tools/data-health/sheriff_audit.py --dry-run    # no DB writes
  python3 tools/data-health/sheriff_audit.py --skip-makro  # skip Makro API phase
"""

from __future__ import annotations

import argparse
import os
import re
import subprocess
import sys
import textwrap
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

REPO_ROOT = Path(__file__).resolve().parents[2]
REPORT_PATH = REPO_ROOT / "tools" / "reconcile-unmatched" / "sheriff_report.md"
AUDIT_CSV_PATH = REPO_ROOT / "tools" / "reconcile-unmatched" / "audit_report.csv"
SCRIPT_DIR = Path(__file__).parent
MAKRO_AUDIT_SCRIPT = REPO_ROOT / "tools" / "reconcile-unmatched" / "audit_makro_barcodes.py"

try:
    import psycopg
    from psycopg.rows import dict_row
except ImportError:
    sys.exit("psycopg not installed — run: pip install -r tools/data-health/requirements.txt")


# ---------------------------------------------------------------------------
# DB connection
# ---------------------------------------------------------------------------

def get_db_url() -> str:
    if url := os.environ.get("DATABASE_URL"):
        return url
    # macOS Keychain fallback (for local dev)
    try:
        raw = subprocess.check_output(
            ["security", "find-generic-password", "-s", "shishka-database-url", "-w"],
            text=True, stderr=subprocess.DEVNULL,
        ).strip()
        if re.match(r"^[0-9a-fA-F]+$", raw) and len(raw) > 50:
            return bytes.fromhex(raw).decode()
        if raw:
            return raw
    except (subprocess.CalledProcessError, FileNotFoundError):
        pass
    sys.exit(
        "ERROR: DATABASE_URL not set.\n"
        "  Option A: export DATABASE_URL=postgresql://...\n"
        "  Option B: add 'shishka-database-url' to macOS Keychain\n"
        "  Option C: create .env with DATABASE_URL= in repo root"
    )


# ---------------------------------------------------------------------------
# Data containers
# ---------------------------------------------------------------------------

@dataclass
class Phase:
    name: str
    ok: bool = False
    error: Optional[str] = None
    findings: list[dict] = field(default_factory=list)
    auto_fixed: int = 0
    notes: str = ""


# ---------------------------------------------------------------------------
# Phase 1: Run all active data_health_rules
# ---------------------------------------------------------------------------

INTENTIONALLY_ZERO_NOTES = ("free", "in-house", "recipe", "gratis", "complimentary")


def _is_intentionally_zero(notes: Optional[str]) -> bool:
    if not notes:
        return False
    low = notes.lower()
    return any(kw in low for kw in INTENTIONALLY_ZERO_NOTES)


def phase1_run_rules(conn, dry_run: bool) -> Phase:
    p = Phase("Phase 1: data_health_rules")
    try:
        with conn.cursor(row_factory=dict_row) as cur:
            # Fetch all active rules
            cur.execute("""
                SELECT id::text, rule_code, title, detect_sql, auto_apply, severity,
                       trigger_count
                FROM public.data_health_rules
                WHERE is_active
                ORDER BY
                    CASE severity
                        WHEN 'critical' THEN 0
                        WHEN 'high'     THEN 1
                        WHEN 'medium'   THEN 2
                        ELSE 3
                    END,
                    rule_code
            """)
            rules = cur.fetchall()

            rule_results: list[dict] = []
            for rule in rules:
                try:
                    cur.execute(rule["detect_sql"])
                    rows = cur.fetchall()
                    count = len(rows)
                    rule_results.append({
                        "rule_code": rule["rule_code"],
                        "title": rule["title"],
                        "severity": rule["severity"],
                        "auto_apply": rule["auto_apply"],
                        "count": count,
                        "rows": rows[:10],  # keep first 10 for report
                    })
                    # Update trigger_count
                    if count > 0 and not dry_run:
                        cur.execute("""
                            UPDATE public.data_health_rules
                            SET trigger_count = trigger_count + 1,
                                last_triggered_at = now()
                            WHERE id = %s
                        """, (rule["id"],))
                except Exception as e:
                    rule_results.append({
                        "rule_code": rule["rule_code"],
                        "title": rule["title"],
                        "severity": "RULE_ERROR",
                        "auto_apply": False,
                        "count": 0,
                        "rows": [],
                        "error": str(e),
                    })
                    conn.rollback()

            p.findings = rule_results

            # Legacy health view counts
            try:
                cur.execute("SELECT metric, severity, val, health_score FROM public.v_data_health ORDER BY 1")
                p.notes = "\n".join(
                    f"  {r['metric']:<30} {r['severity']:<10} {r['val']:>5}   (health_score={r['health_score']})"
                    for r in cur.fetchall()
                )
            except Exception:
                pass

            # Auto-apply: WAC recalc for zero_cost_with_purchases
            # Skip items with intentionally-zero notes
            wac_applied = 0
            if not dry_run:
                cur.execute("""
                    WITH wac_calc AS (
                        SELECT pl.nomenclature_id,
                               ROUND(SUM(pl.quantity * pl.price_per_unit) /
                                     NULLIF(SUM(pl.quantity), 0), 4) AS wac
                        FROM public.purchase_logs pl
                        JOIN public.nomenclature n ON n.id = pl.nomenclature_id
                        WHERE n.is_available
                          AND (n.cost_per_unit IS NULL OR n.cost_per_unit = 0)
                          AND pl.price_per_unit > 0
                          AND pl.quantity > 0
                          AND (n.notes IS NULL
                               OR NOT (
                                   n.notes ILIKE '%free%'
                                OR n.notes ILIKE '%in-house%'
                                OR n.notes ILIKE '%recipe%'
                                OR n.notes ILIKE '%gratis%'
                               ))
                        GROUP BY pl.nomenclature_id
                        HAVING SUM(pl.quantity) > 0
                    )
                    UPDATE public.nomenclature n
                       SET cost_per_unit = w.wac,
                           updated_at = now()
                    FROM wac_calc w
                    WHERE n.id = w.nomenclature_id
                    RETURNING n.product_code, n.name, w.wac
                """)
                updated = cur.fetchall()
                wac_applied = len(updated)
                p.auto_fixed = wac_applied
                if wac_applied:
                    p.notes += f"\n\nAUTO-FIXED WAC recalc ({wac_applied} items):\n"
                    for row in updated:
                        p.notes += f"  {row['product_code']}: {row['name']} → WAC={row['wac']}\n"
                conn.commit()
            else:
                cur.execute("""
                    SELECT n.product_code, n.name
                    FROM public.nomenclature n
                    WHERE n.is_available
                      AND (n.cost_per_unit IS NULL OR n.cost_per_unit = 0)
                      AND EXISTS (
                          SELECT 1 FROM public.purchase_logs pl
                          WHERE pl.nomenclature_id = n.id AND pl.price_per_unit > 0
                      )
                      AND (n.notes IS NULL
                           OR NOT (
                               n.notes ILIKE '%free%'
                            OR n.notes ILIKE '%in-house%'
                            OR n.notes ILIKE '%recipe%'
                           ))
                    ORDER BY n.product_code
                """)
                zero_cost_fixable = cur.fetchall()
                wac_applied = len(zero_cost_fixable)
                if wac_applied:
                    p.notes += f"\n\n[DRY-RUN] Would auto-fix WAC for {wac_applied} items:\n"
                    for row in zero_cost_fixable:
                        p.notes += f"  {row['product_code']}: {row['name']}\n"

        p.ok = True
    except Exception as e:
        p.error = str(e)
        try:
            conn.rollback()
        except Exception:
            pass
    return p


# ---------------------------------------------------------------------------
# Phase 2: Smart duplicate detection
# ---------------------------------------------------------------------------

def phase2_duplicates(conn) -> Phase:
    p = Phase("Phase 2: Duplicate detection")
    try:
        with conn.cursor(row_factory=dict_row) as cur:
            # Pattern 1: similar name + same base_unit + similar cost → likely duplicate
            cur.execute("""
                SELECT
                    a.product_code, a.name, a.cost_per_unit, a.base_unit,
                    b.product_code AS dup_code, b.name AS dup_name,
                    b.cost_per_unit AS dup_cost,
                    ROUND(similarity(lower(a.name), lower(b.name))::numeric, 2) AS name_sim,
                    ROUND(
                        ABS(COALESCE(a.cost_per_unit, 0) - COALESCE(b.cost_per_unit, 0))
                        / NULLIF(GREATEST(COALESCE(a.cost_per_unit, 1), COALESCE(b.cost_per_unit, 1)), 0)
                    * 100) AS cost_diff_pct
                FROM public.nomenclature a
                JOIN public.nomenclature b ON a.id < b.id
                WHERE a.is_available AND b.is_available
                  AND a.base_unit = b.base_unit
                  AND (a.product_code LIKE 'RAW%' AND b.product_code LIKE 'RAW%')
                  AND similarity(lower(a.name), lower(b.name)) > 0.5
                ORDER BY similarity(lower(a.name), lower(b.name)) DESC
                LIMIT 30
            """)
            name_dups = cur.fetchall()

            # Pattern 2: same barcode linked to multiple nomenclature items
            cur.execute("""
                SELECT sc.barcode,
                       COUNT(DISTINCT sc.nomenclature_id) AS linked_items,
                       STRING_AGG(n.product_code || ' | ' || n.name, E'\n  ' ORDER BY n.product_code) AS items
                FROM public.supplier_catalog sc
                JOIN public.nomenclature n ON n.id = sc.nomenclature_id
                WHERE sc.barcode IS NOT NULL AND sc.barcode <> ''
                  AND n.is_available
                GROUP BY sc.barcode
                HAVING COUNT(DISTINCT sc.nomenclature_id) > 1
                ORDER BY COUNT(DISTINCT sc.nomenclature_id) DESC
                LIMIT 20
            """)
            barcode_dups = cur.fetchall()

            # Pattern 3: RAW-AUTO or RAW-{hex8} items still active
            cur.execute("""
                SELECT product_code, name, cost_per_unit, base_unit, created_at::date AS created
                FROM public.nomenclature
                WHERE is_available
                  AND (product_code ~ '^RAW-(AUTO-)?[0-9a-f]{8}$')
                ORDER BY created_at DESC
                LIMIT 20
            """)
            hash_items = cur.fetchall()

            p.findings = {
                "name_similarity_dups": [dict(r) for r in name_dups],
                "barcode_collision_dups": [dict(r) for r in barcode_dups],
                "raw_hash_items": [dict(r) for r in hash_items],
            }
            p.notes = (
                f"Name-similarity duplicates (>0.5): {len(name_dups)}\n"
                f"Barcode collisions (1 barcode → N items): {len(barcode_dups)}\n"
                f"RAW-AUTO / RAW-hex8 items still active: {len(hash_items)}"
            )
        p.ok = True
    except Exception as e:
        p.error = str(e)
    return p


# ---------------------------------------------------------------------------
# Phase 3: Makro barcode audit (delegates to existing script)
# ---------------------------------------------------------------------------

def phase3_makro_barcode_audit(dry_run: bool, skip_makro: bool) -> Phase:
    p = Phase("Phase 3: Makro barcode audit")
    if skip_makro:
        p.ok = True
        p.notes = "Skipped (--skip-makro flag)"
        return p
    if not MAKRO_AUDIT_SCRIPT.exists():
        p.error = f"Script not found: {MAKRO_AUDIT_SCRIPT}"
        return p
    try:
        result = subprocess.run(
            [sys.executable, str(MAKRO_AUDIT_SCRIPT), "--limit", "250"],
            capture_output=True, text=True, timeout=600,
            cwd=str(REPO_ROOT),
        )
        p.ok = result.returncode == 0
        p.notes = result.stdout[-3000:] if result.stdout else ""
        if result.stderr:
            p.error = result.stderr[-1000:]
    except subprocess.TimeoutExpired:
        p.error = "Makro audit timed out after 10 minutes"
    except Exception as e:
        p.error = str(e)
    return p


# ---------------------------------------------------------------------------
# Phase 4: Price drift + conversion sanity
# ---------------------------------------------------------------------------

def phase4_price_drift(conn) -> Phase:
    p = Phase("Phase 4: Price drift + conversion sanity")
    try:
        with conn.cursor(row_factory=dict_row) as cur:
            # Drift: cost_per_unit vs last_seen_price from supplier_catalog
            cur.execute("""
                SELECT
                    n.product_code, n.name, n.base_unit,
                    n.cost_per_unit AS our_cost,
                    sc.last_seen_price AS supplier_last_price,
                    sc.conversion_factor,
                    sc.package_weight,
                    sc.package_qty,
                    sc.package_unit,
                    ROUND(
                        ABS(n.cost_per_unit - sc.last_seen_price)
                        / NULLIF(n.cost_per_unit, 0) * 100
                    ) AS drift_pct,
                    sup.name AS supplier_name
                FROM public.nomenclature n
                JOIN public.supplier_catalog sc ON sc.nomenclature_id = n.id
                JOIN public.suppliers sup ON sup.id = sc.supplier_id
                WHERE n.is_available
                  AND n.cost_per_unit > 0
                  AND sc.last_seen_price > 0
                  AND ABS(n.cost_per_unit - sc.last_seen_price) / n.cost_per_unit > 0.2
                ORDER BY drift_pct DESC
                LIMIT 20
            """)
            drift_rows = cur.fetchall()

            # Unit confusion: cost_per_unit < 5 AND base_unit = 'g' (likely should be kg)
            cur.execute("""
                SELECT product_code, name, cost_per_unit, base_unit, notes
                FROM public.nomenclature
                WHERE is_available
                  AND base_unit = 'g'
                  AND cost_per_unit > 0
                  AND cost_per_unit < 5
                ORDER BY cost_per_unit ASC
                LIMIT 20
            """)
            unit_confusion = cur.fetchall()

            # Empty BOM: SALE dishes with no BOM lines
            cur.execute("""
                SELECT n.product_code, n.name, n.is_available
                FROM public.nomenclature n
                WHERE n.product_code LIKE 'SALE-%'
                  AND n.is_available
                  AND NOT EXISTS (
                      SELECT 1 FROM public.bom_structures b WHERE b.parent_id = n.id
                  )
                ORDER BY n.product_code
                LIMIT 30
            """)
            empty_boms = cur.fetchall()

            # Missing nutrition (SALE dishes)
            cur.execute("""
                SELECT n.product_code, n.name
                FROM public.nomenclature n
                WHERE n.product_code LIKE 'SALE-%'
                  AND n.is_available
                  AND (
                      n.calories IS NULL
                   OR n.protein_g IS NULL
                   OR n.carbs_g IS NULL
                   OR n.fat_g IS NULL
                  )
                ORDER BY n.product_code
                LIMIT 30
            """)
            missing_nutrition = cur.fetchall()

            # Orphan items (RAW, purchased but not used in any BOM)
            cur.execute("""
                SELECT n.product_code, n.name, n.cost_per_unit, n.base_unit,
                       MAX(pl.invoice_date) AS last_purchased,
                       SUM(pl.quantity) AS total_qty_purchased
                FROM public.nomenclature n
                JOIN public.purchase_logs pl ON pl.nomenclature_id = n.id
                WHERE n.is_available
                  AND n.product_code LIKE 'RAW-%'
                  AND NOT EXISTS (
                      SELECT 1 FROM public.bom_structures b WHERE b.ingredient_id = n.id
                  )
                GROUP BY n.id, n.product_code, n.name, n.cost_per_unit, n.base_unit
                HAVING MAX(pl.invoice_date) >= CURRENT_DATE - INTERVAL '90 days'
                ORDER BY MAX(pl.invoice_date) DESC
                LIMIT 20
            """)
            orphan_purchased = cur.fetchall()

            p.findings = {
                "price_drift": [dict(r) for r in drift_rows],
                "unit_confusion_g_vs_kg": [dict(r) for r in unit_confusion],
                "empty_bom_dishes": [dict(r) for r in empty_boms],
                "missing_nutrition": [dict(r) for r in missing_nutrition],
                "orphan_purchased_unused": [dict(r) for r in orphan_purchased],
            }

            critical_drift = [r for r in drift_rows if (r.get("drift_pct") or 0) > 1000]
            p.notes = (
                f"Price drift items (>20%): {len(drift_rows)}  "
                f"(critical >1000%: {len(critical_drift)})\n"
                f"Unit confusion g→kg candidates: {len(unit_confusion)}\n"
                f"Empty BOM dishes: {len(empty_boms)}\n"
                f"Missing nutrition: {len(missing_nutrition)}\n"
                f"Orphan (purchased, not in any BOM): {len(orphan_purchased)}"
            )
        p.ok = True
    except Exception as e:
        p.error = str(e)
    return p


# ---------------------------------------------------------------------------
# Phase 5: Generate sheriff_report.md
# ---------------------------------------------------------------------------

def compute_health_score(phases: dict[str, Phase]) -> int:
    """Rough health score 0-100 based on findings."""
    score = 100

    # Phase 1: rule violations
    p1 = phases.get("p1")
    if p1 and p1.ok and p1.findings:
        for r in p1.findings:
            sev = r.get("severity", "")
            cnt = r.get("count", 0)
            if sev == "critical":
                score -= cnt * 5
            elif sev == "high":
                score -= cnt * 3
            elif sev == "medium":
                score -= cnt * 2
            elif sev == "low":
                score -= cnt * 1

    # Phase 2: duplicates
    p2 = phases.get("p2")
    if p2 and p2.ok and isinstance(p2.findings, dict):
        score -= len(p2.findings.get("name_similarity_dups", [])) * 2
        score -= len(p2.findings.get("barcode_collision_dups", [])) * 3
        score -= len(p2.findings.get("raw_hash_items", [])) * 1

    # Phase 4: price drift
    p4 = phases.get("p4")
    if p4 and p4.ok and isinstance(p4.findings, dict):
        critical_drift = [
            r for r in p4.findings.get("price_drift", [])
            if (r.get("drift_pct") or 0) > 1000
        ]
        score -= len(critical_drift) * 5
        score -= len(p4.findings.get("unit_confusion_g_vs_kg", [])) * 3
        score -= len(p4.findings.get("empty_bom_dishes", [])) * 2

    return max(0, min(100, score))


def phase5_generate_report(phases: dict[str, Phase], dry_run: bool, run_at: str) -> Phase:
    p = Phase("Phase 5: Generate sheriff_report.md")

    score = compute_health_score(phases)
    score_icon = "🟢" if score >= 80 else ("🟡" if score >= 60 else "🔴")

    lines: list[str] = []
    lines.append(f"# Shishka Data Health Sheriff Report")
    lines.append(f"")
    lines.append(f"**Run:** {run_at}  ")
    lines.append(f"**Mode:** {'DRY-RUN (no DB writes)' if dry_run else 'LIVE'}  ")
    lines.append(f"**Health Score:** {score_icon} **{score}/100**")
    lines.append(f"")

    # ── Score formula legend ──
    lines.append("## Score Formula")
    lines.append("")
    lines.append("| Severity | Penalty each |")
    lines.append("|----------|-------------|")
    lines.append("| Critical rule violation | −5 |")
    lines.append("| High rule violation | −3 |")
    lines.append("| Medium rule violation | −2 |")
    lines.append("| Barcode collision | −3 |")
    lines.append("| Name-dup pair | −2 |")
    lines.append("| Price drift >1000% | −5 |")
    lines.append("| Unit confusion (g vs kg) | −3 |")
    lines.append("| Empty BOM dish | −2 |")
    lines.append("")

    # ── Summary table ──
    lines.append("## Summary")
    lines.append("")
    lines.append("| Phase | Status | Key Finding |")
    lines.append("|-------|--------|-------------|")

    def _status(ph: Optional[Phase]) -> str:
        if ph is None:
            return "⏭ skipped"
        if not ph.ok:
            return f"❌ ERROR: {(ph.error or '')[:60]}"
        return "✅ OK"

    p1 = phases.get("p1")
    p2 = phases.get("p2")
    p3 = phases.get("p3")
    p4 = phases.get("p4")

    p1_key = ""
    if p1 and p1.ok and p1.findings:
        critical = [r for r in p1.findings if r.get("severity") in ("critical", "high") and r.get("count", 0) > 0]
        p1_key = f"{sum(r.get('count',0) for r in p1.findings)} total violations, {len(critical)} critical/high rules"

    p2_key = ""
    if p2 and p2.ok and isinstance(p2.findings, dict):
        p2_key = (
            f"{len(p2.findings.get('name_similarity_dups',[]))} name-dups, "
            f"{len(p2.findings.get('barcode_collision_dups',[]))} barcode collisions, "
            f"{len(p2.findings.get('raw_hash_items',[]))} RAW-AUTO leftovers"
        )

    p3_key = ""
    if p3:
        if not p3.ok:
            p3_key = p3.error or "failed"
        else:
            p3_key = "see audit_report.csv" if AUDIT_CSV_PATH.exists() else p3.notes[:80]

    p4_key = ""
    if p4 and p4.ok and isinstance(p4.findings, dict):
        p4_key = p4.notes.split("\n")[0] if p4.notes else ""

    lines.append(f"| Phase 1 — Rules | {_status(p1)} | {p1_key} |")
    lines.append(f"| Phase 2 — Duplicates | {_status(p2)} | {p2_key} |")
    lines.append(f"| Phase 3 — Makro barcodes | {_status(p3)} | {p3_key} |")
    lines.append(f"| Phase 4 — Price drift | {_status(p4)} | {p4_key} |")
    lines.append("")

    # ── Auto-fixes applied ──
    total_fixed = sum(ph.auto_fixed for ph in phases.values() if ph)
    lines.append("## Auto-fixes Applied")
    lines.append("")
    if total_fixed == 0:
        lines.append("No auto-fixes applied this run.")
    else:
        if p1 and p1.auto_fixed:
            lines.append(f"- **WAC recalc:** {p1.auto_fixed} items updated with purchase-log WAC")
    lines.append("")

    # ── Phase 1: Rule violations ──
    lines.append("## Phase 1: Rule Violations")
    lines.append("")
    if p1 and p1.ok:
        if p1.notes:
            lines.append("**Legacy v_data_health view:**")
            lines.append("```")
            lines.append(p1.notes.strip())
            lines.append("```")
            lines.append("")
        if p1.findings:
            lines.append("**Active rule results:**")
            lines.append("")
            lines.append("| Rule Code | Severity | Title | Violations |")
            lines.append("|-----------|----------|-------|-----------|")
            for r in p1.findings:
                sev = r.get("severity", "?")
                cnt = r.get("count", 0)
                err = r.get("error", "")
                flag = " ⚠️" if err else (" 🔴" if cnt > 0 and sev in ("critical", "high") else ("🟡" if cnt > 0 else "✅"))
                lines.append(f"| `{r['rule_code']}` | {sev} | {r['title']} | {cnt}{flag}{(' ERROR: ' + err[:40]) if err else ''} |")
            lines.append("")

            # Detail for rules with violations
            violations = [r for r in p1.findings if r.get("count", 0) > 0 and not r.get("error")]
            if violations:
                lines.append("**Violation details (first 10 rows each):**")
                lines.append("")
                for r in violations:
                    lines.append(f"### `{r['rule_code']}` — {r['title']}")
                    lines.append("")
                    rows = r.get("rows", [])
                    if rows:
                        headers = list(rows[0].keys())
                        lines.append("| " + " | ".join(str(h) for h in headers[:6]) + " |")
                        lines.append("|" + "|".join("---" for _ in headers[:6]) + "|")
                        for row in rows:
                            vals = [str(v)[:40] if v is not None else "" for v in list(row.values())[:6]]
                            lines.append("| " + " | ".join(vals) + " |")
                    lines.append("")
    elif p1:
        lines.append(f"**ERROR:** {p1.error}")
    else:
        lines.append("Phase not run.")
    lines.append("")

    # ── Phase 2: Duplicates ──
    lines.append("## Phase 2: Duplicate Detection")
    lines.append("")
    if p2 and p2.ok and isinstance(p2.findings, dict):
        name_dups = p2.findings.get("name_similarity_dups", [])
        barcode_dups = p2.findings.get("barcode_collision_dups", [])
        hash_items = p2.findings.get("raw_hash_items", [])

        if name_dups:
            lines.append(f"### Name-similarity duplicates ({len(name_dups)} pairs)")
            lines.append("")
            lines.append("> These pairs have name similarity > 0.5 + same base_unit. Manual review required.")
            lines.append("> Use `merge_raw_auto.py --execute` after verifying correct master item.")
            lines.append("")
            lines.append("| Product A | Name A | Product B | Name B | Similarity | Cost Diff % |")
            lines.append("|-----------|--------|-----------|--------|------------|------------|")
            for r in name_dups[:15]:
                lines.append(
                    f"| `{r.get('product_code','')}` | {r.get('name','')[:30]} "
                    f"| `{r.get('dup_code','')}` | {r.get('dup_name','')[:30]} "
                    f"| {r.get('name_sim','')} | {r.get('cost_diff_pct','')}% |"
                )
            lines.append("")

        if barcode_dups:
            lines.append(f"### Barcode collisions ({len(barcode_dups)} barcodes → multiple items)")
            lines.append("")
            lines.append("> One barcode should map to exactly ONE nomenclature item.")
            lines.append("> Fix: deactivate duplicates, keep the curated one.")
            lines.append("")
            for r in barcode_dups[:10]:
                lines.append(f"**Barcode `{r.get('barcode','')}`** ({r.get('linked_items','')} items):")
                lines.append("```")
                lines.append(str(r.get("items", "")))
                lines.append("```")
                lines.append("")

        if hash_items:
            lines.append(f"### RAW-AUTO / RAW-hex8 leftovers ({len(hash_items)} items)")
            lines.append("")
            lines.append("> These auto-generated items should be merged into curated RAW- codes.")
            lines.append("> Run: `python3 tools/data-health/merge_raw_auto.py --dry-run`")
            lines.append("")
            lines.append("| Product Code | Name | Cost | Unit | Created |")
            lines.append("|-------------|------|------|------|---------|")
            for r in hash_items:
                lines.append(
                    f"| `{r.get('product_code','')}` | {r.get('name','')[:40]} "
                    f"| {r.get('cost_per_unit','')} | {r.get('base_unit','')} | {r.get('created','')} |"
                )
            lines.append("")
    elif p2:
        lines.append(f"**ERROR:** {p2.error}")
    lines.append("")

    # ── Phase 3: Makro barcodes ──
    lines.append("## Phase 3: Makro Barcode Audit")
    lines.append("")
    if p3:
        if p3.ok:
            if AUDIT_CSV_PATH.exists():
                lines.append(f"Barcode audit CSV: `{AUDIT_CSV_PATH.relative_to(REPO_ROOT)}`")
                lines.append("")
                # Parse CSV for summary
                try:
                    import csv
                    stats: dict[str, int] = {}
                    mismatches: list[dict] = []
                    with AUDIT_CSV_PATH.open(encoding="utf-8") as f:
                        for row in csv.DictReader(f):
                            st = row.get("status", "UNKNOWN")
                            stats[st] = stats.get(st, 0) + 1
                            if st in ("NAME_MISMATCH", "NAME_DIFF", "ERROR"):
                                mismatches.append(row)

                    lines.append("| Status | Count |")
                    lines.append("|--------|-------|")
                    for st, cnt in sorted(stats.items()):
                        flag = " ← REVIEW" if st in ("NAME_MISMATCH", "ERROR") else ""
                        lines.append(f"| {st} | {cnt}{flag} |")
                    lines.append("")

                    if mismatches:
                        lines.append(f"### Items needing review ({len(mismatches)} items)")
                        lines.append("")
                        lines.append("| Barcode | Our Name | Makro Name | Similarity | Status |")
                        lines.append("|---------|----------|------------|------------|--------|")
                        for r in mismatches[:20]:
                            lines.append(
                                f"| `{r.get('barcode','')}` | {r.get('our_name','')[:35]} "
                                f"| {r.get('makro_name','')[:35]} "
                                f"| {r.get('name_similarity','')} | {r.get('status','')} |"
                            )
                        lines.append("")
                except Exception as e:
                    lines.append(f"Could not parse audit_report.csv: {e}")
            else:
                lines.append(p3.notes)
        else:
            lines.append(f"**ERROR:** {p3.error}")
            if p3.notes:
                lines.append("")
                lines.append("```")
                lines.append(p3.notes[-1000:])
                lines.append("```")
    else:
        lines.append("Phase not run.")
    lines.append("")

    # ── Phase 4: Price drift ──
    lines.append("## Phase 4: Price Drift & Conversion Issues")
    lines.append("")
    if p4 and p4.ok and isinstance(p4.findings, dict):
        drift = p4.findings.get("price_drift", [])
        if drift:
            lines.append(f"### Price drift (cost_per_unit vs last_seen_price) — {len(drift)} items")
            lines.append("")
            lines.append("| Product | Name | Our Cost | Supplier Price | Drift % | Conversion | Supplier |")
            lines.append("|---------|------|----------|---------------|---------|------------|---------|")
            for r in drift:
                drift_pct = r.get("drift_pct") or 0
                flag = " 🔴 BROKEN CONV" if drift_pct > 1000 else (" 🟡" if drift_pct > 200 else "")
                lines.append(
                    f"| `{r.get('product_code','')}` | {r.get('name','')[:30]} "
                    f"| ฿{r.get('our_cost','')} | ฿{r.get('supplier_last_price','')} "
                    f"| {drift_pct}%{flag} | {r.get('conversion_factor','')} | {r.get('supplier_name','')[:20]} |"
                )
            lines.append("")

        unit_conf = p4.findings.get("unit_confusion_g_vs_kg", [])
        if unit_conf:
            lines.append(f"### Unit confusion: base_unit=g but cost<5฿ ({len(unit_conf)} items)")
            lines.append("")
            lines.append("> Likely should be base_unit=kg. WAC would be ×1000 too low.")
            lines.append("> Fix: change base_unit to 'kg', recalc WAC from purchase_logs.")
            lines.append("")
            lines.append("| Product | Name | Cost/g | Notes |")
            lines.append("|---------|------|--------|-------|")
            for r in unit_conf:
                lines.append(
                    f"| `{r.get('product_code','')}` | {r.get('name','')[:40]} "
                    f"| ฿{r.get('cost_per_unit','')} | {(r.get('notes') or '')[:40]} |"
                )
            lines.append("")

        empty_boms = p4.findings.get("empty_bom_dishes", [])
        if empty_boms:
            lines.append(f"### Empty BOM dishes — {len(empty_boms)} dishes with no recipe")
            lines.append("")
            lines.append("> These SALE dishes have no BOM lines. /chef cannot cost them.")
            lines.append("")
            for r in empty_boms:
                lines.append(f"- `{r.get('product_code','')}` — {r.get('name','')}")
            lines.append("")

        missing_nutr = p4.findings.get("missing_nutrition", [])
        if missing_nutr:
            lines.append(f"### Missing nutrition — {len(missing_nutr)} dishes")
            lines.append("")
            for r in missing_nutr:
                lines.append(f"- `{r.get('product_code','')}` — {r.get('name','')}")
            lines.append("")

        orphans = p4.findings.get("orphan_purchased_unused", [])
        if orphans:
            lines.append(f"### Orphan items (purchased last 90d, not in any BOM) — {len(orphans)} items")
            lines.append("")
            lines.append("| Product | Name | Cost | Last Purchased | Total Qty |")
            lines.append("|---------|------|------|---------------|-----------|")
            for r in orphans:
                lines.append(
                    f"| `{r.get('product_code','')}` | {r.get('name','')[:35]} "
                    f"| ฿{r.get('cost_per_unit','')} | {r.get('last_purchased','')} "
                    f"| {r.get('total_qty_purchased','')} |"
                )
            lines.append("")
    elif p4:
        lines.append(f"**ERROR:** {p4.error}")
    lines.append("")

    # ── Action items ──
    lines.append("## Action Items")
    lines.append("")
    lines.append("| Priority | Action | How |")
    lines.append("|----------|--------|-----|")

    action_items = []

    if p2 and p2.ok and isinstance(p2.findings, dict):
        n_hash = len(p2.findings.get("raw_hash_items", []))
        if n_hash > 0:
            action_items.append(("HIGH", f"Merge {n_hash} RAW-AUTO leftovers",
                                 "`python3 tools/data-health/merge_raw_auto.py --dry-run`"))
        n_bc = len(p2.findings.get("barcode_collision_dups", []))
        if n_bc > 0:
            action_items.append(("HIGH", f"Resolve {n_bc} barcode collisions (1 barcode → N items)",
                                 "Manual: check supplier_catalog, deactivate wrong item"))
        n_nd = len(p2.findings.get("name_similarity_dups", []))
        if n_nd > 0:
            action_items.append(("MEDIUM", f"Review {n_nd} name-similarity dup pairs",
                                 "`python3 tools/data-health/merge_raw_auto.py --export-csv`"))

    if p4 and p4.ok and isinstance(p4.findings, dict):
        critical_drift = [r for r in p4.findings.get("price_drift", []) if (r.get("drift_pct") or 0) > 1000]
        if critical_drift:
            action_items.append(("CRITICAL", f"Fix {len(critical_drift)} broken conversion factors (drift >1000%)",
                                 "Check supplier_catalog.conversion_factor vs package_weight"))
        n_uc = len(p4.findings.get("unit_confusion_g_vs_kg", []))
        if n_uc > 0:
            action_items.append(("HIGH", f"Fix {n_uc} unit confusion items (base_unit=g but WAC<5฿)",
                                 "Change base_unit to 'kg', then recalc WAC"))
        n_bom = len(p4.findings.get("empty_bom_dishes", []))
        if n_bom > 0:
            action_items.append(("MEDIUM", f"Build recipes for {n_bom} empty BOM dishes",
                                 "/chef → add BOM lines"))
        n_nutr = len(p4.findings.get("missing_nutrition", []))
        if n_nutr > 0:
            action_items.append(("LOW", f"Add nutrition data for {n_nutr} dishes",
                                 "Update nomenclature.calories/protein_g/carbs_g/fat_g"))

    if not action_items:
        lines.append("| — | No actions needed | — |")
    else:
        for priority, action, how in action_items:
            lines.append(f"| {priority} | {action} | {how} |")

    lines.append("")
    lines.append("---")
    lines.append(f"*Generated by `tools/data-health/sheriff_audit.py` at {run_at}*")

    report_text = "\n".join(lines)
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(report_text, encoding="utf-8")

    p.ok = True
    p.notes = f"Report written: {REPORT_PATH}"
    return p


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> int:
    parser = argparse.ArgumentParser(description="Shishka weekly data health audit")
    parser.add_argument("--dry-run", action="store_true",
                        help="Run all checks but do NOT write to DB")
    parser.add_argument("--skip-makro", action="store_true",
                        help="Skip Phase 3 Makro barcode audit (saves ~10 min)")
    args = parser.parse_args()

    run_at = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    print(f"\n{'='*60}")
    print(f"  Shishka Data Health Sheriff Audit")
    print(f"  {run_at}{'  [DRY-RUN]' if args.dry_run else ''}")
    print(f"{'='*60}\n")

    db_url = get_db_url()
    conn = psycopg.connect(db_url, autocommit=False)

    phases: dict[str, Phase] = {}

    try:
        print("▶ Phase 1: Running data_health_rules...")
        phases["p1"] = phase1_run_rules(conn, args.dry_run)
        p1 = phases["p1"]
        if p1.ok:
            total = sum(r.get("count", 0) for r in p1.findings)
            print(f"  ✓ {len(p1.findings)} rules, {total} violations, {p1.auto_fixed} auto-fixed")
        else:
            print(f"  ✗ ERROR: {p1.error}")

        print("▶ Phase 2: Smart duplicate detection...")
        phases["p2"] = phase2_duplicates(conn)
        p2 = phases["p2"]
        if p2.ok:
            print(f"  ✓ {p2.notes}")
        else:
            print(f"  ✗ ERROR: {p2.error}")

        print("▶ Phase 3: Makro barcode audit...")
        phases["p3"] = phase3_makro_barcode_audit(args.dry_run, args.skip_makro)
        p3 = phases["p3"]
        if p3.ok:
            print(f"  ✓ {p3.notes[:80]}")
        else:
            print(f"  ✗ ERROR: {p3.error}")

        print("▶ Phase 4: Price drift + conversion sanity...")
        phases["p4"] = phase4_price_drift(conn)
        p4 = phases["p4"]
        if p4.ok:
            print(f"  ✓ {p4.notes.splitlines()[0] if p4.notes else 'done'}")
        else:
            print(f"  ✗ ERROR: {p4.error}")

        print("▶ Phase 5: Generating sheriff_report.md...")
        phases["p5"] = phase5_generate_report(phases, args.dry_run, run_at)
        print(f"  ✓ {phases['p5'].notes}")

    finally:
        conn.close()

    score = compute_health_score(phases)
    print(f"\n{'='*60}")
    print(f"  Health Score: {score}/100")
    print(f"  Report: {REPORT_PATH}")
    print(f"{'='*60}\n")

    # Commit and push report
    if not args.dry_run:
        try:
            subprocess.run(
                ["git", "add", str(REPORT_PATH), str(AUDIT_CSV_PATH) if AUDIT_CSV_PATH.exists() else str(REPORT_PATH)],
                cwd=str(REPO_ROOT), check=False
            )
            subprocess.run(
                ["git", "commit", "-m",
                 f"chore(data-health): weekly sheriff audit {run_at[:10]} score={score}"],
                cwd=str(REPO_ROOT), check=False
            )
            subprocess.run(
                ["git", "push", "-u", "origin", "HEAD"],
                cwd=str(REPO_ROOT), check=False
            )
            print("Report committed and pushed.")
        except Exception as e:
            print(f"Git push failed: {e}")

    return 0 if all(ph.ok for ph in phases.values()) else 1


if __name__ == "__main__":
    sys.exit(main())
