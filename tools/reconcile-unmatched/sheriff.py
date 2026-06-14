#!/usr/bin/env python3
"""
sheriff.py — Data Health AI Sheriff for Shishka Healthy Kitchen
Weekly full audit: nomenclature + procurement data quality.

Phases:
  1. Run ALL active data_health_rules, update trigger_count, auto-apply WAC recalc
  2. Enhanced duplicate detection (pg_trgm + supplier + price similarity)
  3. Full Makro barcode audit (wraps audit_makro_barcodes.py)
  4. Price drift + conversion factor sanity check
  5. Generate sheriff_report.md

Usage:
  python3 tools/reconcile-unmatched/sheriff.py
  python3 tools/reconcile-unmatched/sheriff.py --skip-makro   # skip Makro API (fast)
  python3 tools/reconcile-unmatched/sheriff.py --dry-run      # no DB writes

Rules:
  - NEVER delete items (only deactivate)
  - NEVER auto-merge (only recommend)
  - NEVER modify prices without purchase_logs evidence
  - Skip items where notes contain 'free'/'in-house'/'recipe' for zero-cost checks
  - Rate limit Makro API: 2s between requests
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import subprocess
import sys
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

logging.basicConfig(level=logging.INFO, format="%(message)s")
log = logging.getLogger(__name__)

REPORT_PATH = Path("tools/reconcile-unmatched/sheriff_report.md")
MAKRO_AUDIT_SCRIPT = Path("tools/reconcile-unmatched/audit_makro_barcodes.py")


# ─────────────────────────────────────────────────────────────────────────────
# DB connection
# ─────────────────────────────────────────────────────────────────────────────

def get_db_url() -> str:
    if url := os.environ.get("DATABASE_URL"):
        return url
    # macOS Keychain (local dev)
    try:
        raw = subprocess.check_output(
            ["security", "find-generic-password", "-s", "shishka-database-url", "-w"],
            text=True, stderr=subprocess.DEVNULL,
        ).strip()
        if raw:
            return raw
    except (subprocess.CalledProcessError, FileNotFoundError):
        pass
    sys.exit(
        "ERROR: DATABASE_URL not found.\n"
        "  Set DATABASE_URL env var, or add 'shishka-database-url' to macOS Keychain."
    )


# ─────────────────────────────────────────────────────────────────────────────
# Phase 1: Run all data_health_rules
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class RuleResult:
    rule_code: str
    title: str
    severity: str
    auto_apply: bool
    violations: list[dict] = field(default_factory=list)
    error: str | None = None


def phase1_run_rules(cur, dry_run: bool) -> list[RuleResult]:
    log.info("\n═══ Phase 1: Active data_health_rules ═══")

    cur.execute("""
        SELECT id::text, rule_code, title, detect_sql, auto_apply, severity
          FROM data_health_rules
         WHERE is_active = TRUE
         ORDER BY severity DESC, rule_code
    """)
    rules = cur.fetchall()
    cols = [d[0] for d in cur.description]
    rules = [dict(zip(cols, r)) for r in rules]
    log.info(f"  Found {len(rules)} active rules")

    results: list[RuleResult] = []
    for rule in rules:
        rr = RuleResult(
            rule_code=rule["rule_code"],
            title=rule["title"],
            severity=rule["severity"],
            auto_apply=bool(rule["auto_apply"]),
        )
        try:
            cur.execute(rule["detect_sql"])
            vcols = [d[0] for d in cur.description]
            rows = [dict(zip(vcols, r)) for r in cur.fetchall()]
            rr.violations = rows
        except Exception as exc:
            rr.error = str(exc)
            log.warning(f"  ⚠ Rule {rule['rule_code']} FAILED: {exc}")
            results.append(rr)
            continue

        icon = "✓" if not rows else ("⚠" if rule["severity"] == "warn" else "✗")
        log.info(f"  {icon} [{rule['severity']:5s}] {rule['rule_code']}: {len(rows)} violation(s)")
        results.append(rr)

        # Update trigger_count
        if not dry_run and rows:
            cur.execute("""
                UPDATE data_health_rules
                   SET trigger_count = trigger_count + 1, last_triggered_at = now()
                 WHERE rule_code = %s
            """, (rule["rule_code"],))

    return results


def phase1_wac_recalc(cur, dry_run: bool) -> int:
    """
    Auto-apply WAC recalculation for zero_cost_with_purchases items.
    Skips items where notes contain 'free', 'in-house', or 'recipe'.
    Returns count of items updated.
    """
    log.info("\n  → Auto-apply WAC recalc for zero_cost_with_purchases …")

    wac_sql = """
        WITH wac_calc AS (
          SELECT pl.nomenclature_id,
                 ROUND(SUM(pl.quantity * pl.price_per_unit) / NULLIF(SUM(pl.quantity), 0), 4) AS wac
            FROM purchase_logs pl
            JOIN nomenclature n ON n.id = pl.nomenclature_id
           WHERE n.is_available = TRUE
             AND (n.cost_per_unit IS NULL OR n.cost_per_unit = 0)
             AND (n.notes IS NULL
                  OR (LOWER(n.notes) NOT LIKE '%%free%%'
                  AND LOWER(n.notes) NOT LIKE '%%in-house%%'
                  AND LOWER(n.notes) NOT LIKE '%%recipe%%'))
             AND pl.price_per_unit > 0
             AND pl.quantity > 0
           GROUP BY pl.nomenclature_id
          HAVING SUM(pl.quantity) > 0
        )
        SELECT COUNT(*)::integer
          FROM wac_calc w
          JOIN nomenclature n ON n.id = w.nomenclature_id
    """
    cur.execute(wac_sql)
    eligible = cur.fetchone()[0]
    log.info(f"  Eligible items for WAC recalc: {eligible}")

    if dry_run or eligible == 0:
        return eligible

    apply_sql = """
        WITH wac_calc AS (
          SELECT pl.nomenclature_id,
                 ROUND(SUM(pl.quantity * pl.price_per_unit) / NULLIF(SUM(pl.quantity), 0), 4) AS wac
            FROM purchase_logs pl
            JOIN nomenclature n ON n.id = pl.nomenclature_id
           WHERE n.is_available = TRUE
             AND (n.cost_per_unit IS NULL OR n.cost_per_unit = 0)
             AND (n.notes IS NULL
                  OR (LOWER(n.notes) NOT LIKE '%%free%%'
                  AND LOWER(n.notes) NOT LIKE '%%in-house%%'
                  AND LOWER(n.notes) NOT LIKE '%%recipe%%'))
             AND pl.price_per_unit > 0
             AND pl.quantity > 0
           GROUP BY pl.nomenclature_id
          HAVING SUM(pl.quantity) > 0
        )
        UPDATE nomenclature n
           SET cost_per_unit = w.wac, updated_at = now()
          FROM wac_calc w
         WHERE n.id = w.nomenclature_id
    """
    cur.execute(apply_sql)
    count = cur.rowcount
    log.info(f"  ✓ WAC recalc applied to {count} items")
    return count


# ─────────────────────────────────────────────────────────────────────────────
# Phase 2: Enhanced duplicate detection
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class DuplicateCandidate:
    code_a: str
    name_a: str
    cost_a: float | None
    code_b: str
    name_b: str
    cost_b: float | None
    similarity: float
    same_unit: bool
    has_shared_supplier: bool


def phase2_duplicates(cur) -> list[DuplicateCandidate]:
    log.info("\n═══ Phase 2: Enhanced duplicate detection ═══")

    # pg_trgm similarity + same base_unit + cost within 20%
    sql = """
        SELECT
            a.product_code  AS code_a,
            a.name          AS name_a,
            a.cost_per_unit AS cost_a,
            a.base_unit     AS unit_a,
            b.product_code  AS code_b,
            b.name          AS name_b,
            b.cost_per_unit AS cost_b,
            b.base_unit     AS unit_b,
            ROUND(similarity(lower(a.name), lower(b.name))::numeric, 3) AS sim,
            EXISTS (
              SELECT 1 FROM purchase_logs pa
              JOIN purchase_logs pb ON pa.supplier_id = pb.supplier_id
              WHERE pa.nomenclature_id = a.id
                AND pb.nomenclature_id = b.id
            ) AS shared_supplier
          FROM nomenclature a
          JOIN nomenclature b
            ON a.id < b.id
           AND a.is_available = TRUE
           AND b.is_available = TRUE
           AND a.base_unit = b.base_unit
           AND similarity(lower(a.name), lower(b.name)) > 0.5
          WHERE a.product_code LIKE 'RAW%%'
            AND b.product_code LIKE 'RAW%%'
          ORDER BY sim DESC
          LIMIT 50
    """
    try:
        cur.execute(sql)
        cols = [d[0] for d in cur.description]
        rows = [dict(zip(cols, r)) for r in cur.fetchall()]
    except Exception as exc:
        log.warning(f"  Phase 2 failed: {exc}")
        return []

    candidates: list[DuplicateCandidate] = []
    for r in rows:
        cost_a = float(r["cost_a"]) if r["cost_a"] else None
        cost_b = float(r["cost_b"]) if r["cost_b"] else None
        # Additional filter: price within 20% (learned pattern)
        if cost_a and cost_b and cost_a > 0 and cost_b > 0:
            drift = abs(cost_a - cost_b) / max(cost_a, cost_b)
            if drift > 0.20:
                continue  # price too different → different products

        candidates.append(DuplicateCandidate(
            code_a=r["code_a"],
            name_a=r["name_a"],
            cost_a=cost_a,
            code_b=r["code_b"],
            name_b=r["name_b"],
            cost_b=cost_b,
            similarity=float(r["sim"]),
            same_unit=True,
            has_shared_supplier=bool(r["shared_supplier"]),
        ))
        icon = "⚡" if float(r["sim"]) > 0.8 else "~"
        log.info(
            f"  {icon} sim={r['sim']:.2f} | {r['code_a']} \"{r['name_a'][:30]}\""
            f" ~ {r['code_b']} \"{r['name_b'][:30]}\""
        )

    log.info(f"  Total duplicate candidates: {len(candidates)}")
    return candidates


# ─────────────────────────────────────────────────────────────────────────────
# Phase 3: Makro barcode audit
# ─────────────────────────────────────────────────────────────────────────────

def phase3_makro_audit(skip: bool) -> dict[str, Any]:
    log.info("\n═══ Phase 3: Makro barcode audit ═══")

    if skip:
        log.info("  ⏭  Skipped (--skip-makro flag)")
        return {"skipped": True}

    if not MAKRO_AUDIT_SCRIPT.exists():
        log.warning(f"  ⚠ Script not found: {MAKRO_AUDIT_SCRIPT}")
        return {"error": "audit_makro_barcodes.py not found"}

    try:
        result = subprocess.run(
            [sys.executable, str(MAKRO_AUDIT_SCRIPT)],
            capture_output=True, text=True, timeout=600,
        )
        if result.returncode != 0:
            log.warning(f"  ⚠ Makro audit failed:\n{result.stderr[:500]}")
            return {"error": result.stderr[:500]}

        log.info(result.stdout[-1000:])
        return {"ok": True, "output": result.stdout}
    except subprocess.TimeoutExpired:
        return {"error": "Makro audit timed out after 10 minutes"}
    except Exception as exc:
        return {"error": str(exc)}


# ─────────────────────────────────────────────────────────────────────────────
# Phase 4: Price drift + conversion sanity
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class PriceDrift:
    product_code: str
    name: str
    cost_per_unit: float
    last_seen_price: float
    drift_pct: float
    base_unit: str
    purchase_unit: str | None
    conversion_factor: float | None

    def is_broken_conversion(self) -> bool:
        return self.drift_pct > 1000

    def severity(self) -> str:
        if self.drift_pct > 1000:
            return "CRITICAL"
        elif self.drift_pct > 100:
            return "WARNING"
        return "INFO"


def phase4_price_drift(cur) -> list[PriceDrift]:
    log.info("\n═══ Phase 4: Price drift + conversion sanity ═══")

    sql = """
        SELECT
            n.product_code,
            n.name,
            n.cost_per_unit,
            n.base_unit,
            sc.last_seen_price,
            sc.purchase_unit,
            sc.conversion_factor,
            ROUND(
              ABS(n.cost_per_unit - sc.last_seen_price)
                / NULLIF(n.cost_per_unit, 0) * 100
            )::integer AS drift_pct
          FROM nomenclature n
          JOIN supplier_catalog sc ON sc.nomenclature_id = n.id
         WHERE n.is_available = TRUE
           AND n.cost_per_unit > 0
           AND sc.last_seen_price > 0
           AND ABS(n.cost_per_unit - sc.last_seen_price) / n.cost_per_unit > 0.20
         ORDER BY drift_pct DESC
         LIMIT 30
    """

    try:
        cur.execute(sql)
        cols = [d[0] for d in cur.description]
        rows = [dict(zip(cols, r)) for r in cur.fetchall()]
    except Exception as exc:
        log.warning(f"  Phase 4 failed: {exc}")
        return []

    drifts: list[PriceDrift] = []
    for r in rows:
        pd = PriceDrift(
            product_code=r["product_code"] or "",
            name=r["name"] or "",
            cost_per_unit=float(r["cost_per_unit"]),
            last_seen_price=float(r["last_seen_price"]),
            drift_pct=float(r["drift_pct"] or 0),
            base_unit=r["base_unit"] or "",
            purchase_unit=r["purchase_unit"],
            conversion_factor=float(r["conversion_factor"]) if r["conversion_factor"] else None,
        )
        drifts.append(pd)
        sev = pd.severity()
        icon = "🔴" if sev == "CRITICAL" else ("⚠" if sev == "WARNING" else "ℹ")
        log.info(
            f"  {icon} {r['product_code']:<25} drift={pd.drift_pct:.0f}%"
            f" cost={pd.cost_per_unit:.2f}/{pd.base_unit}"
            f" catalog={pd.last_seen_price:.2f}"
        )

    log.info(f"  Total price drift items: {len(drifts)}")
    return drifts


# ─────────────────────────────────────────────────────────────────────────────
# Phase 4b: g/kg unit confusion check (learned pattern)
# ─────────────────────────────────────────────────────────────────────────────

def phase4b_unit_confusion(cur) -> list[dict]:
    """
    Items with base_unit='g' AND cost_per_unit < 5 — likely stored in grams
    but should be kilograms (gouda cheese pattern: WAC=0.82/g should be 820/kg).
    """
    log.info("\n  → Unit confusion check (g/kg, cost < 5) …")

    sql = """
        SELECT n.product_code, n.name, n.cost_per_unit, n.base_unit, n.notes
          FROM nomenclature n
         WHERE n.is_available = TRUE
           AND n.base_unit = 'g'
           AND n.cost_per_unit IS NOT NULL
           AND n.cost_per_unit < 5
           AND n.cost_per_unit > 0
           AND (n.notes IS NULL
                OR (LOWER(n.notes) NOT LIKE '%%free%%'
                AND LOWER(n.notes) NOT LIKE '%%in-house%%'
                AND LOWER(n.notes) NOT LIKE '%%recipe%%'))
         ORDER BY n.cost_per_unit ASC
    """
    try:
        cur.execute(sql)
        cols = [d[0] for d in cur.description]
        rows = [dict(zip(cols, r)) for r in cur.fetchall()]
    except Exception as exc:
        log.warning(f"  Unit confusion check failed: {exc}")
        return []

    for r in rows:
        log.info(
            f"  ⚠ UNIT? {r['product_code']:<25} cost={r['cost_per_unit']:.4f}/g"
            f" (if kg: {float(r['cost_per_unit'])*1000:.1f}/kg)"
        )
    return rows


# ─────────────────────────────────────────────────────────────────────────────
# Phase 5: Summary stats for report
# ─────────────────────────────────────────────────────────────────────────────

def collect_summary_stats(cur) -> dict[str, Any]:
    log.info("\n═══ Collecting summary stats ═══")
    stats: dict[str, Any] = {}

    queries = {
        "total_active_nomenclature": "SELECT COUNT(*) FROM nomenclature WHERE is_available = TRUE",
        "total_raw": "SELECT COUNT(*) FROM nomenclature WHERE is_available = TRUE AND product_code LIKE 'RAW%'",
        "total_raw_auto": "SELECT COUNT(*) FROM nomenclature WHERE is_available = TRUE AND product_code LIKE 'RAW-AUTO-%'",
        "total_dishes": "SELECT COUNT(*) FROM nomenclature WHERE is_available = TRUE AND product_code LIKE 'SALE-%'",
        "total_pf": "SELECT COUNT(*) FROM nomenclature WHERE is_available = TRUE AND product_code LIKE 'PF-%'",
        "total_purchase_logs": "SELECT COUNT(*) FROM purchase_logs",
        "empty_bom_dishes": """
            SELECT COUNT(*) FROM nomenclature n
            WHERE n.is_available = TRUE AND n.product_code LIKE 'SALE-%'
              AND NOT EXISTS (SELECT 1 FROM bom_structures b WHERE b.parent_id = n.id)
        """,
        "orphan_raws": """
            SELECT COUNT(*) FROM nomenclature n
            WHERE n.is_available = TRUE AND n.product_code LIKE 'RAW%'
              AND NOT EXISTS (SELECT 1 FROM purchase_logs pl WHERE pl.nomenclature_id = n.id)
              AND NOT EXISTS (SELECT 1 FROM bom_structures b WHERE b.ingredient_id = n.id)
        """,
        "missing_nutrition": """
            SELECT COUNT(*) FROM nomenclature
            WHERE product_code LIKE 'RAW-%' AND is_available = TRUE
              AND calories IS NULL AND type = 'raw_ingredient'
        """,
        "zero_cost_skipped": """
            SELECT COUNT(*) FROM nomenclature n
            WHERE is_available = TRUE
              AND (cost_per_unit IS NULL OR cost_per_unit = 0)
              AND n.notes IS NOT NULL
              AND (LOWER(n.notes) LIKE '%%free%%'
                OR LOWER(n.notes) LIKE '%%in-house%%'
                OR LOWER(n.notes) LIKE '%%recipe%%')
        """,
        "unmatched_queue": "SELECT COUNT(*) FROM unmatched_items WHERE resolved_to IS NULL",
        "data_health_score": """
            SELECT ROUND(health_score) FROM v_data_health LIMIT 1
        """,
    }

    for key, sql in queries.items():
        try:
            cur.execute(sql)
            val = cur.fetchone()
            stats[key] = val[0] if val else 0
        except Exception as exc:
            stats[key] = f"ERROR: {exc}"
            log.warning(f"  Stats query '{key}' failed: {exc}")

    # Top 10 empty BOM dishes
    try:
        cur.execute("""
            SELECT n.product_code, n.name, n.price
              FROM nomenclature n
             WHERE n.is_available = TRUE
               AND n.product_code LIKE 'SALE-%%'
               AND NOT EXISTS (SELECT 1 FROM bom_structures b WHERE b.parent_id = n.id)
             ORDER BY n.name
             LIMIT 10
        """)
        cols = [d[0] for d in cur.description]
        stats["empty_bom_list"] = [dict(zip(cols, r)) for r in cur.fetchall()]
    except Exception:
        stats["empty_bom_list"] = []

    # Top 10 orphan RAW items
    try:
        cur.execute("""
            SELECT n.product_code, n.name, n.cost_per_unit, n.created_at::date AS created
              FROM nomenclature n
             WHERE n.is_available = TRUE
               AND n.product_code LIKE 'RAW%%'
               AND NOT EXISTS (SELECT 1 FROM purchase_logs pl WHERE pl.nomenclature_id = n.id)
               AND NOT EXISTS (SELECT 1 FROM bom_structures b WHERE b.ingredient_id = n.id)
             ORDER BY n.created_at DESC
             LIMIT 10
        """)
        cols = [d[0] for d in cur.description]
        stats["orphan_list"] = [dict(zip(cols, r)) for r in cur.fetchall()]
    except Exception:
        stats["orphan_list"] = []

    return stats


# ─────────────────────────────────────────────────────────────────────────────
# Phase 5: Generate sheriff_report.md
# ─────────────────────────────────────────────────────────────────────────────

def generate_report(
    rule_results: list[RuleResult],
    wac_applied: int,
    duplicates: list[DuplicateCandidate],
    makro_result: dict,
    drifts: list[PriceDrift],
    unit_confusion: list[dict],
    stats: dict[str, Any],
    dry_run: bool,
) -> None:
    now_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    health_score = stats.get("data_health_score", "N/A")

    lines: list[str] = []

    lines += [
        f"# Data Health Sheriff Report",
        f"",
        f"> Generated: {now_str}",
        f"> Mode: {'DRY RUN (no writes)' if dry_run else 'LIVE RUN'}",
        f"",
        f"---",
        f"",
    ]

    # ── Health Score ──
    score_val = int(health_score) if isinstance(health_score, (int, float)) else 0
    if score_val >= 85:
        score_icon = "🟢"
    elif score_val >= 65:
        score_icon = "🟡"
    else:
        score_icon = "🔴"

    lines += [
        f"## {score_icon} Health Score: {health_score}/100",
        f"",
        f"| Metric | Count |",
        f"|--------|-------|",
        f"| Active nomenclature | {stats.get('total_active_nomenclature', '?')} |",
        f"| RAW items | {stats.get('total_raw', '?')} |",
        f"| RAW-AUTO (unreviewed) | {stats.get('total_raw_auto', '?')} |",
        f"| Dishes (SALE) | {stats.get('total_dishes', '?')} |",
        f"| Semi-finished (PF) | {stats.get('total_pf', '?')} |",
        f"| Purchase log entries | {stats.get('total_purchase_logs', '?')} |",
        f"| Unmatched queue | {stats.get('unmatched_queue', '?')} |",
        f"",
    ]

    # ── Phase 1: Rule violations ──
    lines += ["## Phase 1: Data Health Rule Violations", ""]

    block_rules = [r for r in rule_results if r.severity == "block" and r.violations]
    warn_rules = [r for r in rule_results if r.severity == "warn" and r.violations]
    info_rules = [r for r in rule_results if r.severity == "info" and r.violations]
    error_rules = [r for r in rule_results if r.error]
    clean_rules = [r for r in rule_results if not r.violations and not r.error]

    lines += [
        f"- ✅ Clean rules (0 violations): **{len(clean_rules)}**",
        f"- 🔴 BLOCK violations: **{sum(len(r.violations) for r in block_rules)}**",
        f"- ⚠️  WARN violations: **{sum(len(r.violations) for r in warn_rules)}**",
        f"- ℹ️  INFO violations: **{sum(len(r.violations) for r in info_rules)}**",
        f"- ❌ Rules with errors: **{len(error_rules)}**",
        f"",
    ]

    if block_rules:
        lines += ["### 🔴 BLOCK — Must Fix", ""]
        for rr in block_rules:
            lines += [f"**{rr.rule_code}** — {rr.title} ({len(rr.violations)} items)", ""]
            for v in rr.violations[:5]:
                lines += [f"- `{v.get('product_code', '?')}` {v.get('name', '')[:50]}"]
            if len(rr.violations) > 5:
                lines += [f"- … and {len(rr.violations) - 5} more"]
            lines += [""]

    if warn_rules:
        lines += ["### ⚠️ WARN — Should Fix", ""]
        for rr in warn_rules:
            lines += [f"**{rr.rule_code}** — {rr.title} ({len(rr.violations)} items)", ""]
            for v in rr.violations[:5]:
                lines += [f"- `{v.get('product_code', '?')}` {v.get('name', '')[:50]}"]
            if len(rr.violations) > 5:
                lines += [f"- … and {len(rr.violations) - 5} more"]
            lines += [""]

    if info_rules:
        lines += ["### ℹ️ INFO — Nice to Fix", ""]
        for rr in info_rules:
            lines += [f"**{rr.rule_code}** ({len(rr.violations)} items): {rr.title}"]
        lines += [""]

    if error_rules:
        lines += ["### ❌ Rule Errors", ""]
        for rr in error_rules:
            lines += [f"- `{rr.rule_code}`: {rr.error}"]
        lines += [""]

    # ── Phase 1 Auto-fixes ──
    lines += [
        f"## Phase 1: Auto-fixes Applied",
        f"",
        f"| Fix type | Items updated |",
        f"|----------|--------------|",
        f"| WAC recalc (zero_cost_with_purchases) | {wac_applied} |",
        f"",
    ]
    if dry_run:
        lines += ["> ⚠️ DRY RUN — no DB writes executed", ""]

    # ── Phase 2: Merge candidates ──
    lines += ["## Phase 2: Duplicate / Merge Candidates", ""]

    if not duplicates:
        lines += ["✅ No duplicate candidates found.", ""]
    else:
        critical_dups = [d for d in duplicates if d.similarity > 0.8]
        review_dups = [d for d in duplicates if 0.5 < d.similarity <= 0.8]

        lines += [
            f"- ⚡ High confidence (sim > 0.8): **{len(critical_dups)}** — likely same product",
            f"- ~  Review (sim 0.5–0.8): **{len(review_dups)}** — manual check needed",
            f"",
            f"**NEVER auto-merge. Recommend only.**",
            f"",
        ]

        if critical_dups:
            lines += ["### High-confidence merge candidates (ACTION REQUIRED)", ""]
            lines += ["| Code A | Name A | Code B | Name B | Sim | Cost A | Cost B | Shared supplier |"]
            lines += ["|--------|--------|--------|--------|-----|--------|--------|-----------------|"]
            for d in critical_dups[:20]:
                cost_a = f"฿{d.cost_a:.2f}" if d.cost_a else "—"
                cost_b = f"฿{d.cost_b:.2f}" if d.cost_b else "—"
                lines += [
                    f"| `{d.code_a}` | {d.name_a[:25]} | `{d.code_b}` | {d.name_b[:25]}"
                    f" | {d.similarity:.2f} | {cost_a} | {cost_b} | {'✓' if d.has_shared_supplier else '—'} |"
                ]
            lines += [""]

        if review_dups:
            lines += ["### Review-level candidates", ""]
            for d in review_dups[:10]:
                lines += [f"- sim={d.similarity:.2f} | `{d.code_a}` ≈ `{d.code_b}` — {d.name_a[:30]} ≈ {d.name_b[:30]}"]
            lines += [""]

    # ── Phase 3: Makro barcodes ──
    lines += ["## Phase 3: Makro Barcode Audit", ""]
    if makro_result.get("skipped"):
        lines += ["⏭ Skipped (--skip-makro flag). Run without flag for full audit.", ""]
    elif makro_result.get("error"):
        lines += [f"❌ Audit failed: {makro_result['error']}", ""]
        lines += ["Check `tools/reconcile-unmatched/audit_report.csv` for previous results.", ""]
    else:
        lines += ["✅ Completed — see `tools/reconcile-unmatched/audit_report.csv` for full results.", ""]
        # Extract stats from stdout if available
        out = makro_result.get("output", "")
        if "Total barcodes:" in out:
            for line in out.split("\n"):
                if any(kw in line for kw in ("Total barcodes:", "MATCH:", "NAME_DIFF:", "NAME_MISMATCH:", "NOT_FOUND:", "ERROR:")):
                    lines += [f"  {line.strip()}"]
        lines += [""]

    # ── Phase 4: Price drift ──
    lines += ["## Phase 4: Price Drift Alerts", ""]

    critical_drifts = [d for d in drifts if d.is_broken_conversion()]
    warn_drifts = [d for d in drifts if not d.is_broken_conversion() and d.drift_pct > 100]
    info_drifts = [d for d in drifts if not d.is_broken_conversion() and d.drift_pct <= 100]

    if not drifts:
        lines += ["✅ No significant price drift detected.", ""]
    else:
        if critical_drifts:
            lines += [
                "### 🔴 CRITICAL: Broken conversion factor (drift > 1000%)",
                "",
                "These items have WAC vs catalog_price mismatch > 10x.",
                "Root cause: conversion_factor wrong or missing in supplier_catalog.",
                "",
                "| Product code | Name | WAC/unit | Catalog price | Drift % | Conv factor |",
                "|-------------|------|----------|---------------|---------|-------------|",
            ]
            for d in critical_drifts:
                cf = f"{d.conversion_factor:.3f}" if d.conversion_factor else "MISSING"
                lines += [
                    f"| `{d.product_code}` | {d.name[:30]} | ฿{d.cost_per_unit:.2f}/{d.base_unit}"
                    f" | ฿{d.last_seen_price:.2f} | {d.drift_pct:.0f}% | {cf} |"
                ]
            lines += [""]

        if warn_drifts:
            lines += ["### ⚠️ WARNING: Price drift 100–1000%", ""]
            for d in warn_drifts[:10]:
                lines += [
                    f"- `{d.product_code}` — WAC ฿{d.cost_per_unit:.2f}/{d.base_unit}"
                    f" vs catalog ฿{d.last_seen_price:.2f} ({d.drift_pct:.0f}% drift)"
                ]
            lines += [""]

        if info_drifts:
            lines += [f"ℹ️ {len(info_drifts)} items with 20–100% price drift (normal volatility — review monthly).", ""]

    # ── Unit confusion ──
    if unit_confusion:
        lines += [
            "## Unit Confusion: base_unit='g' with cost < ฿5",
            "",
            "These items are stored per gram but cost < ฿5/g is unusually cheap.",
            "Likely should be per kg (learned from Gouda cheese pattern).",
            "",
            "| Product code | Name | Cost/g | If kg |",
            "|-------------|------|--------|-------|",
        ]
        for r in unit_confusion:
            cost_g = float(r["cost_per_unit"])
            lines += [
                f"| `{r['product_code']}` | {r['name'][:35]} | ฿{cost_g:.4f}/g | ฿{cost_g*1000:.1f}/kg |"
            ]
        lines += [
            "",
            "> **Action**: Verify with latest purchase receipt. If kg is correct, update base_unit + multiply cost_per_unit × 1000 in a migration.",
            "",
        ]

    # ── Empty BOM dishes ──
    lines += ["## Dishes with Empty BOM (need /chef)", ""]
    empty_bom_count = stats.get("empty_bom_dishes", 0)
    lines += [f"Total dishes missing BOM: **{empty_bom_count}**", ""]

    empty_list = stats.get("empty_bom_list", [])
    if empty_list:
        lines += ["| Product code | Name | Price |"]
        lines += ["|-------------|------|-------|"]
        for item in empty_list:
            price = f"฿{float(item['price']):.0f}" if item.get("price") else "—"
            lines += [f"| `{item['product_code']}` | {item['name'][:40]} | {price} |"]
        if int(empty_bom_count) > len(empty_list):
            lines += [f"| … | +{int(empty_bom_count) - len(empty_list)} more | |"]
        lines += [""]

    # ── Orphan items ──
    lines += ["## Orphan Items (purchased but unused in BOM)", ""]
    orphan_count = stats.get("orphan_raws", 0)
    lines += [
        f"Total orphan RAW items (no purchases, no BOM use): **{orphan_count}**",
        "",
        "These are RAW items that were never purchased and never used in any BOM.",
        "Likely created by OCR auto-match and then corrected elsewhere.",
        "Recommend: deactivate after confirming no active usage.",
        "",
    ]
    orphan_list = stats.get("orphan_list", [])
    if orphan_list:
        lines += ["| Code | Name | Cost | Created |"]
        lines += ["|------|------|------|---------|"]
        for item in orphan_list:
            cost = f"฿{float(item['cost_per_unit']):.2f}" if item.get("cost_per_unit") else "—"
            lines += [f"| `{item['product_code']}` | {item['name'][:35]} | {cost} | {item.get('created', '?')} |"]
        lines += [""]

    # ── Missing nutrition ──
    lines += ["## Missing Nutrition Data", ""]
    miss_count = stats.get("missing_nutrition", 0)
    lines += [
        f"RAW ingredients with no calories data: **{miss_count}**",
        "",
        "Run USDA FoodData Central lookup for these items.",
        "Priority: items used in SALE BOM dishes (affects customer nutrition display).",
        "",
    ]

    # ── Zero cost intentionally exempt ──
    lines += ["## Zero-cost Items (intentionally exempt)", ""]
    zero_skip = stats.get("zero_cost_skipped", 0)
    lines += [
        f"Items with zero cost exempted from WAC recalc: **{zero_skip}**",
        "",
        "These have notes containing 'free', 'in-house', or 'recipe'.",
        "Examples: tahini (free from supplier), chili paste (made in-house from recipe).",
        "",
    ]

    # ── Action checklist ──
    lines += [
        "---",
        "",
        "## Action Checklist",
        "",
        "- [ ] Review BLOCK rule violations above — fix or create migration",
        "- [ ] Review high-confidence merge candidates — deactivate duplicates, reroute purchase_logs",
        "- [ ] Fix broken conversion factors (CRITICAL drift items)",
        "- [ ] Verify unit confusion items (g vs kg) against receipts",
        "- [ ] Add BOM to empty dishes — send to /chef",
        "- [ ] Deactivate orphan RAW items after CEO approval",
        "- [ ] Backfill missing nutrition from USDA FoodData Central",
        "- [ ] Review unmatched queue items in admin panel",
        "",
        "---",
        f"*Generated by `tools/reconcile-unmatched/sheriff.py` on {now_str}*",
    ]

    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text("\n".join(lines), encoding="utf-8")
    log.info(f"\n✅ Report written: {REPORT_PATH}")


# ─────────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="Data Health AI Sheriff — weekly full audit")
    parser.add_argument("--dry-run", action="store_true", help="No DB writes")
    parser.add_argument("--skip-makro", action="store_true", help="Skip Makro API audit")
    args = parser.parse_args()

    log.info("╔══════════════════════════════════════════════════════════╗")
    log.info("║   Data Health AI Sheriff — Shishka Healthy Kitchen       ║")
    log.info(f"║   {datetime.now().strftime('%Y-%m-%d %H:%M')}  {'DRY RUN' if args.dry_run else 'LIVE RUN'}                              ║")
    log.info("╚══════════════════════════════════════════════════════════╝")

    try:
        import psycopg2
        import psycopg2.extras
    except ImportError:
        subprocess.check_call([sys.executable, "-m", "pip", "install", "psycopg2-binary", "-q"])
        import psycopg2
        import psycopg2.extras

    db_url = get_db_url()
    conn = psycopg2.connect(db_url)

    try:
        with conn.cursor() as cur:
            # Phase 1: Rules
            rule_results = phase1_run_rules(cur, args.dry_run)
            wac_applied = phase1_wac_recalc(cur, args.dry_run)
            if not args.dry_run:
                conn.commit()

            # Phase 2: Duplicates
            duplicates = phase2_duplicates(cur)

            # Phase 4: Price drift (before Makro which takes time)
            drifts = phase4_price_drift(cur)
            unit_confusion = phase4b_unit_confusion(cur)

            # Summary stats
            stats = collect_summary_stats(cur)

        # Phase 3: Makro (outside cursor, uses subprocess)
        makro_result = phase3_makro_audit(skip=args.skip_makro)

        # Phase 5: Report
        generate_report(
            rule_results=rule_results,
            wac_applied=wac_applied,
            duplicates=duplicates,
            makro_result=makro_result,
            drifts=drifts,
            unit_confusion=unit_confusion,
            stats=stats,
            dry_run=args.dry_run,
        )

        log.info("\n" + "═" * 60)
        log.info(f"Health score:        {stats.get('data_health_score', 'N/A')}/100")
        log.info(f"Rule violations:     {sum(len(r.violations) for r in rule_results)}")
        log.info(f"WAC recalc applied:  {wac_applied}")
        log.info(f"Dup candidates:      {len(duplicates)}")
        log.info(f"Price drift alerts:  {len(drifts)}")
        log.info(f"Report:              {REPORT_PATH}")
        log.info("═" * 60)

    finally:
        conn.close()


if __name__ == "__main__":
    main()
