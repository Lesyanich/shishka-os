#!/usr/bin/env python3
"""
run_rules.py — Data Health rule runner with decision logging.

Reads active rules from public.data_health_rules, executes each
rule's detect_sql, proposes fixes based on fix_strategy, produces
a reviewable preview CSV, then (after CEO review) applies the
approved decisions and logs each one to data_health_decisions.

Modes:
  preview  — run all active rules, propose fixes, write preview CSV
  apply    — read reviewed CSV (decision column = apply|skip|manual),
             execute UPDATEs in a single transaction, write to
             data_health_decisions with run_id grouping
  summary  — print current v_data_health_summary

Usage:
  python run_rules.py preview [--entity nomenclature] [--out preview.csv]
  python run_rules.py apply   --from reviewed.csv [--actor lesia]
  python run_rules.py summary

Design:
  Every row written to data_health_decisions carries:
    run_id          groups all rows applied in one batch
    rule_id         which rule proposed the fix
    decision_source rule_auto | ceo_review | manual_edit | skip
  This history is the training signal for future rule tuning.
"""

from __future__ import annotations

import argparse
import csv
import os
import re
import subprocess
import sys
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

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
    try:
        raw = subprocess.check_output(
            ["security", "find-generic-password", "-s", "shishka-database-url", "-w"],
            text=True,
            stderr=subprocess.DEVNULL,
        ).strip()
        if raw:
            return raw
    except subprocess.CalledProcessError:
        pass
    sys.exit("DATABASE_URL unset and Keychain entry 'shishka-database-url' missing.")


# ---------------------------------------------------------------------------
# Fix strategies — pure functions: (row, extra_json) -> (field, new_value) or None
# ---------------------------------------------------------------------------

WEIGHT_TAIL_RE = re.compile(r"[,\s]+\d+\s*(?:g|kg|ml|l|L|G|KG|ML)\s*$", re.IGNORECASE)
UNIT_IN_NAME_RE = re.compile(r"(\d+)\s*(kg|g|ml|l|L|KG|G|ML)\s*$", re.IGNORECASE)

# Category code → default base_unit when we can't infer from name
CATEGORY_DEFAULT_UNIT = {
    "F-PRD": "kg",         # Produce
    "F-PRD-HRB": "kg",     # Fresh Herbs
    "F-PRD-FRZ": "kg",     # Frozen Produce
    "F-SPC-DRY": "g",      # Dry Spices
    "F-BEV": "L",          # Beverages
    "F-BEV-TEA": "g",      # Tea leaves
}


def strategy_strip_weight_tail(row: dict, extra: dict) -> tuple[str, str] | None:
    """Strip ', 200g' / ' 200g' tail from nomenclature.name."""
    name = row.get("name") or ""
    cleaned = WEIGHT_TAIL_RE.sub("", name).strip().rstrip(",").strip()
    if cleaned and cleaned != name:
        return ("name", cleaned)
    return None


def strategy_set_base_unit(row: dict, extra: dict, category_code: Optional[str]) -> tuple[str, str] | None:
    """Infer canonical base_unit from name tail or category."""
    name = row.get("name") or ""
    m = UNIT_IN_NAME_RE.search(name)
    if m:
        unit = m.group(2).lower()
        canonical = {"kg": "kg", "g": "g", "ml": "ml", "l": "L"}[unit]
        return ("base_unit", canonical)

    # Fallback: category default
    if category_code and category_code in CATEGORY_DEFAULT_UNIT:
        return ("base_unit", CATEGORY_DEFAULT_UNIT[category_code])

    # Last resort: pcs (but flag for manual review)
    return ("base_unit", "pcs")


def strategy_uppercase_l(row: dict, extra: dict) -> tuple[str, str] | None:
    current = (extra or {}).get("current") or row.get("base_unit")
    if current == "l":
        return ("base_unit", "L")
    return None


STRATEGIES = {
    "strip_weight_tail":                strategy_strip_weight_tail,
    "uppercase_L":                      strategy_uppercase_l,
    "set_base_unit_from_name_or_category": strategy_set_base_unit,
}


# ---------------------------------------------------------------------------
# Core flow
# ---------------------------------------------------------------------------

@dataclass
class Proposal:
    rule_id: str
    rule_code: str
    entity_kind: str
    entity_id: str
    product_code: Optional[str]
    name: Optional[str]
    field: str
    old_value: Optional[str]
    new_value: str
    confidence: Optional[float]
    fix_strategy: str


def fetch_rules(cur) -> list[dict]:
    cur.execute("""
        SELECT id::text, rule_code, title, entity_kind, metric,
               detect_sql, fix_strategy, confidence, auto_apply
          FROM public.data_health_rules
         WHERE is_active = TRUE
         ORDER BY severity DESC, rule_code
    """)
    return cur.fetchall()


def fetch_category_code_for_nomenclature(cur, entity_id: str) -> Optional[str]:
    cur.execute("""
        SELECT pc.code FROM public.nomenclature n
          LEFT JOIN public.product_categories pc ON pc.id = n.category_id
         WHERE n.id = %s
    """, (entity_id,))
    row = cur.fetchone()
    return row["code"] if row and row.get("code") else None


def build_proposal(cur, rule: dict, detect_row: dict) -> Optional[Proposal]:
    extra = detect_row.get("extra_json") or {}
    strategy = rule.get("fix_strategy")
    if not strategy:
        return None

    fn = STRATEGIES.get(strategy)
    if fn is None:
        return None  # unknown strategy — skipped (future work)

    if strategy == "set_base_unit_from_name_or_category":
        cat = fetch_category_code_for_nomenclature(cur, str(detect_row["entity_id"]))
        proposed = fn(detect_row, extra, cat)
    else:
        proposed = fn(detect_row, extra)

    if proposed is None:
        return None

    field, new_value = proposed
    old_value = detect_row.get(field)
    if old_value is None and field == "base_unit":
        old_value = extra.get("current")

    return Proposal(
        rule_id=rule["id"],
        rule_code=rule["rule_code"],
        entity_kind=rule["entity_kind"],
        entity_id=str(detect_row["entity_id"]),
        product_code=detect_row.get("product_code"),
        name=detect_row.get("name"),
        field=field,
        old_value=old_value,
        new_value=new_value,
        confidence=rule.get("confidence"),
        fix_strategy=strategy,
    )


def run_preview(conn, out_path: Path, entity_filter: Optional[str]) -> None:
    proposals: list[Proposal] = []
    with conn.cursor(row_factory=dict_row) as cur:
        rules = fetch_rules(cur)
        for rule in rules:
            if entity_filter and rule["entity_kind"] != entity_filter:
                continue
            cur.execute(rule["detect_sql"])
            rows = cur.fetchall()
            for r in rows:
                p = build_proposal(cur, rule, r)
                if p:
                    proposals.append(p)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow([
            "decision", "rule_code", "entity_kind", "entity_id",
            "product_code", "current_name", "field",
            "old_value", "new_value", "confidence", "notes",
        ])
        for p in proposals:
            default = "apply" if (p.confidence or 0) >= 0.95 else "review"
            w.writerow([
                default, p.rule_code, p.entity_kind, p.entity_id,
                p.product_code or "", p.name or "", p.field,
                p.old_value or "", p.new_value, p.confidence or "", "",
            ])

    print(f"Preview written: {out_path}")
    print(f"Total proposals: {len(proposals)}")

    # Summary by rule
    by_rule: dict[str, int] = {}
    for p in proposals:
        by_rule[p.rule_code] = by_rule.get(p.rule_code, 0) + 1
    for code, n in sorted(by_rule.items(), key=lambda x: -x[1]):
        print(f"  {code}: {n}")


# ---------------------------------------------------------------------------
# Apply phase — atomic transaction, decisions logged
# ---------------------------------------------------------------------------

UPDATE_TEMPLATES = {
    ("nomenclature", "name"):      "UPDATE public.nomenclature SET name = %s, updated_at = now() WHERE id = %s",
    ("nomenclature", "base_unit"): "UPDATE public.nomenclature SET base_unit = %s, updated_at = now() WHERE id = %s",
}


def run_apply(conn, csv_path: Path, actor: str) -> None:
    run_id = str(uuid.uuid4())
    applied = skipped = manual = 0

    with csv_path.open("r", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    if not rows:
        print("No rows in CSV — nothing to apply.")
        return

    with conn.cursor() as cur:
        try:
            # Ensure a rename backup table for this run (name column only — append-only)
            cur.execute(f"""
                CREATE TABLE IF NOT EXISTS public.nomenclature_rename_backup_{run_id.replace('-', '_')} AS
                SELECT id, product_code, name AS old_name, base_unit AS old_base_unit, now() AS backed_up_at
                  FROM public.nomenclature WHERE 1=0;
            """)

            for row in rows:
                decision = (row.get("decision") or "").strip().lower()
                entity_kind = row["entity_kind"]
                field = row["field"]
                entity_id = row["entity_id"]
                new_value = row["new_value"]
                old_value = row.get("old_value")
                rule_code = row["rule_code"]
                notes = row.get("notes") or ""

                source: str
                if decision == "apply":
                    source = "ceo_review"
                elif decision == "rule_auto":
                    source = "rule_auto"
                elif decision == "manual":
                    # CEO overrode new_value — still apply, log as manual_edit
                    source = "manual_edit"
                elif decision == "skip":
                    source = "skip"
                    skipped += 1
                else:
                    # unknown / review → skip
                    source = "skip"
                    skipped += 1

                if source != "skip":
                    sql = UPDATE_TEMPLATES.get((entity_kind, field))
                    if not sql:
                        print(f"!! no UPDATE template for ({entity_kind}, {field}) — row skipped", file=sys.stderr)
                        skipped += 1
                        source = "skip"
                    else:
                        # Backup row first
                        cur.execute(f"""
                            INSERT INTO public.nomenclature_rename_backup_{run_id.replace('-', '_')}
                              (id, product_code, old_name, old_base_unit, backed_up_at)
                            SELECT id, product_code, name, base_unit, now()
                              FROM public.nomenclature WHERE id = %s
                              ON CONFLICT DO NOTHING;
                        """, (entity_id,))
                        cur.execute(sql, (new_value, entity_id))
                        applied += 1
                        if source == "manual_edit":
                            manual += 1

                # Always log decision (including skips)
                cur.execute("""
                    INSERT INTO public.data_health_decisions
                      (run_id, rule_id, entity_kind, entity_id, field,
                       old_value, new_value, decision_source, decided_by, notes)
                    SELECT %s, dhr.id, %s, %s, %s, %s, %s, %s, %s, %s
                      FROM public.data_health_rules dhr
                     WHERE dhr.rule_code = %s
                """, (run_id, entity_kind, entity_id, field,
                      old_value, new_value, source, actor, notes,
                      rule_code))

            # Update trigger_count for involved rules
            cur.execute("""
                UPDATE public.data_health_rules dhr
                   SET trigger_count = trigger_count + 1,
                       last_triggered_at = now()
                 WHERE rule_code IN (SELECT DISTINCT rule_code FROM UNNEST(%s::text[]) AS rule_code)
            """, ([row["rule_code"] for row in rows],))

            conn.commit()
        except Exception:
            conn.rollback()
            raise

    print(f"run_id:  {run_id}")
    print(f"applied: {applied}   skipped: {skipped}   manual_edit: {manual}")
    print(f"Decisions logged to data_health_decisions.")
    print(f"Backup table: nomenclature_rename_backup_{run_id.replace('-', '_')}")


def run_summary(conn) -> None:
    with conn.cursor() as cur:
        cur.execute("SELECT metric, entity_kind, item_count, rule_code FROM public.v_data_health_summary")
        rows = cur.fetchall()
    print(f"{'metric':<26}{'entity':<16}{'items':>7}  rule")
    print("-" * 72)
    for metric, ent, cnt, rc in rows:
        print(f"{metric:<26}{ent:<16}{cnt:>7}  {rc}")


# ---------------------------------------------------------------------------

def main() -> int:
    p = argparse.ArgumentParser()
    sub = p.add_subparsers(dest="mode", required=True)

    pv = sub.add_parser("preview")
    pv.add_argument("--entity", default=None, help="Filter to entity_kind (e.g. nomenclature)")
    pv.add_argument("--out", default="tools/data-health/preview.csv", type=Path)

    ap = sub.add_parser("apply")
    ap.add_argument("--from", dest="src", required=True, type=Path)
    ap.add_argument("--actor", default=os.environ.get("USER", "unknown"))

    sub.add_parser("summary")

    args = p.parse_args()
    conn = psycopg.connect(get_db_url(), autocommit=False)
    try:
        if args.mode == "preview":
            run_preview(conn, args.out, args.entity)
        elif args.mode == "apply":
            run_apply(conn, args.src, args.actor)
        elif args.mode == "summary":
            run_summary(conn)
    finally:
        conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
