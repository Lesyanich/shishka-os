"""
Lazada order parser — phase 2 of the Lazada import pipeline.

Reads ./extracted/<uid>.{json,html} produced by extract.py and emits
fn_approve_receipt-compatible payloads under ./payloads/<order_id>.json.
Items it cannot map to nomenclature land in ./unmatched.csv for manual review.

This is a skeleton built without access to a real Lazada email sample, so the
HTML/plain extractors below are intentionally conservative. When the first real
.mbox is processed the regexes/selectors in `extractors.py` should be tightened.

Run flow:
    1. python extract.py path/to/Mail.mbox        # populates ./extracted/
    2. python parse.py --dry-run                  # emits payloads, no DB writes
    3. review payloads/, unmatched.csv, summary.md
    4. python parse.py --execute                  # calls fn_approve_receipt RPC

DB access uses DATABASE_URL from env (read it from macOS Keychain in the wrapper
shell — never inline). See README.md.
"""

from __future__ import annotations

import argparse
import csv
import dataclasses
import json
import logging
import os
import re
import sys
from dataclasses import dataclass, field
from datetime import date, datetime
from email.utils import parsedate_to_datetime
from pathlib import Path
from typing import Any

LOG = logging.getLogger("lazada-parse")

LAZADA_SUPPLIER_ID = "d0cdee66-9aee-43c9-9764-d3b8d67e1b6c"
CATEGORY_COGS_FOOD = 4100
CATEGORY_OPEX_KITCHEN = 2200
CATEGORY_OPEX_CLEANING = 2300

# Heuristics — tighten with real samples
PRICE_RE = re.compile(r"฿\s*([\d,]+(?:\.\d{1,2})?)")
QTY_RE = re.compile(r"(?:Qty|จำนวน|quantity)[:\s]+(\d+)", re.I)
SHIPPING_RE = re.compile(r"(?:Shipping|Delivery|ค่าจัดส่ง)[^฿]*฿\s*([\d,]+(?:\.\d{1,2})?)", re.I)
DISCOUNT_RE = re.compile(r"(?:Discount|Voucher|ส่วนลด)[^฿\-]*[-]?\s*฿?\s*([\d,]+(?:\.\d{1,2})?)", re.I)
TOTAL_RE = re.compile(r"(?:Order Total|Grand Total|รวม)[^฿]*฿\s*([\d,]+(?:\.\d{1,2})?)", re.I)


@dataclass
class LineItem:
    name: str
    quantity: float = 1.0
    unit: str = "pcs"
    unit_price: float = 0.0
    total_price: float = 0.0
    nomenclature_id: str | None = None
    matched_name: str | None = None
    is_food: bool = True


@dataclass
class ParsedOrder:
    uid: str
    order_id: str | None
    subject: str
    date_iso: str
    items: list[LineItem] = field(default_factory=list)
    shipping_total: float = 0.0
    discount_total: float = 0.0
    amount_original: float = 0.0
    vat_amount: float = 0.0
    payment_method: str = "card"
    warnings: list[str] = field(default_factory=list)

    def to_payload(self) -> dict[str, Any]:
        food = [
            {
                "name": i.matched_name or i.name,
                "quantity": i.quantity,
                "unit": i.unit,
                "unit_price": round(i.unit_price, 2),
                "total_price": round(i.total_price, 2),
                "nomenclature_id": i.nomenclature_id,
            }
            for i in self.items
            if i.is_food
        ]
        opex = [
            {
                "name": i.name,
                "quantity": i.quantity,
                "unit": i.unit,
                "unit_price": round(i.unit_price, 2),
                "total_price": round(i.total_price, 2),
            }
            for i in self.items
            if not i.is_food
        ]
        return {
            "supplier_id": LAZADA_SUPPLIER_ID,
            "transaction_date": self.date_iso,
            "flow_type": "OpEx",
            "category_code": CATEGORY_COGS_FOOD,
            "invoice_number": self.order_id,
            "details": self.subject[:200],
            "amount_original": round(self.amount_original, 2),
            "currency": "THB",
            "exchange_rate": 1,
            "discount_total": round(self.discount_total, 2),
            "vat_amount": round(self.vat_amount, 2),
            "delivery_fee": round(self.shipping_total, 2),
            "payment_method": self.payment_method,
            "status": "paid",
            "has_tax_invoice": False,
            "food_items": food,
            "opex_items": opex,
        }


# ─── Extraction (heuristics, to be tightened with real samples) ───

def parse_money(s: str) -> float:
    return float(s.replace(",", ""))


def to_iso_date(raw: str) -> str:
    """Accept ISO 8601 (from GAS export) or RFC 2822 (from .mbox). Fall back to today."""
    if not raw:
        return date.today().isoformat()
    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00")).date().isoformat()
    except (TypeError, ValueError):
        pass
    try:
        return parsedate_to_datetime(raw).date().isoformat()
    except (TypeError, ValueError):
        return date.today().isoformat()


def html_to_text(html: str) -> str:
    """Strip HTML to plain-ish text. Uses BeautifulSoup if available, else regex."""
    try:
        from bs4 import BeautifulSoup  # type: ignore
        soup = BeautifulSoup(html, "html.parser")
        for tag in soup(["script", "style"]):
            tag.decompose()
        return soup.get_text(separator="\n")
    except ImportError:
        return re.sub(r"<[^>]+>", "\n", html)


def extract_order_fields(body: str) -> dict[str, float]:
    """Pull totals/shipping/discount from a body blob. Returns 0 for missing."""
    out: dict[str, float] = {"shipping_total": 0.0, "discount_total": 0.0, "amount_original": 0.0}
    if m := TOTAL_RE.search(body):
        out["amount_original"] = parse_money(m.group(1))
    # Sum every shipping fee occurrence (Lazada bills per shop)
    out["shipping_total"] = sum(parse_money(g) for g in SHIPPING_RE.findall(body))
    # Sum every discount line
    out["discount_total"] = sum(parse_money(g) for g in DISCOUNT_RE.findall(body))
    return out


def extract_line_items(body: str) -> list[LineItem]:
    """Skeleton item extractor. Real Lazada emails will need targeted selectors.

    Strategy when real sample lands:
      - Lazada HTML wraps each item in a table row with the product name in <a>
        and the price in a <td class="...price...">
      - Adapt to use BeautifulSoup soup.select() with that pattern
      - Until then, return an empty list and let humans fill payloads/<order>.json
    """
    return []


def parse_message(meta: dict[str, Any], html: str | None) -> ParsedOrder:
    body_plain = meta.get("plain_body") or ""
    body_html_text = html_to_text(html) if html else ""
    body = (body_plain + "\n" + body_html_text).strip()

    iso = to_iso_date(meta.get("date") or "")
    order = ParsedOrder(
        uid=meta["uid"],
        order_id=meta.get("order_id"),
        subject=meta.get("subject", ""),
        date_iso=iso,
    )

    fields = extract_order_fields(body)
    order.shipping_total = fields["shipping_total"]
    order.discount_total = fields["discount_total"]
    order.amount_original = fields["amount_original"]
    order.vat_amount = round(order.amount_original * 7 / 107, 2)

    order.items = extract_line_items(body)

    if order.amount_original == 0:
        order.warnings.append("amount_original=0 — totals regex missed")
    if not order.items:
        order.warnings.append("no items extracted — fill manually")
    if not order.order_id:
        order.warnings.append("order_id missing — assign before RPC call")

    return order


# ─── Nomenclature matching (DB) ───

def load_nomenclature_index(conn) -> list[tuple[str, str, str]]:
    """Return [(id, product_code, name)] for all type='good' nomenclature."""
    with conn.cursor() as cur:
        cur.execute(
            "SELECT id::text, product_code, name FROM nomenclature WHERE type = 'good'"
        )
        return list(cur.fetchall())


def match_item(item: LineItem, index: list[tuple[str, str, str]]) -> None:
    """Case-insensitive substring match. Sets nomenclature_id + matched_name when unambiguous."""
    needle = item.name.lower().strip()
    if not needle:
        return
    hits = [(i, c, n) for (i, c, n) in index if needle in n.lower() or n.lower() in needle]
    if len(hits) == 1:
        item.nomenclature_id, _, item.matched_name = hits[0]


# ─── Pipeline ───

def pipeline(args: argparse.Namespace) -> int:
    in_dir: Path = args.extracted
    out_dir: Path = args.out
    payloads_dir = out_dir / "payloads"
    payloads_dir.mkdir(parents=True, exist_ok=True)

    nom_index: list[tuple[str, str, str]] = []
    if not args.skip_db:
        try:
            import psycopg  # type: ignore
        except ImportError:
            LOG.error("psycopg not installed. pip install -r requirements.txt OR pass --skip-db")
            return 2
        db_url = os.environ.get("DATABASE_URL")
        if not db_url:
            LOG.error("DATABASE_URL not set. Retrieve from Keychain — see README.md")
            return 2
        with psycopg.connect(db_url) as conn:
            nom_index = load_nomenclature_index(conn)
        LOG.info("loaded %d nomenclature rows for matching", len(nom_index))

    summary_rows: list[dict[str, Any]] = []
    unmatched_rows: list[dict[str, Any]] = []
    json_files = sorted(in_dir.glob("*.json"))
    if not json_files:
        LOG.warning("no extracted/*.json files in %s — run extract.py first", in_dir)
        return 1

    for meta_path in json_files:
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        html_path = meta_path.with_suffix(".html")
        html = html_path.read_text(encoding="utf-8") if html_path.exists() else None

        order = parse_message(meta, html)
        for item in order.items:
            if nom_index:
                match_item(item, nom_index)
            if not item.nomenclature_id:
                unmatched_rows.append(
                    {
                        "uid": order.uid,
                        "order_id": order.order_id or "",
                        "name": item.name,
                        "qty": item.quantity,
                        "unit_price": item.unit_price,
                    }
                )

        target = payloads_dir / f"{order.order_id or order.uid}.json"
        target.write_text(
            json.dumps(order.to_payload(), ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

        summary_rows.append(
            {
                "uid": order.uid,
                "order_id": order.order_id or "(missing)",
                "subject": order.subject[:80],
                "date": order.date_iso,
                "amount": order.amount_original,
                "items": len(order.items),
                "matched": sum(1 for i in order.items if i.nomenclature_id),
                "warnings": "; ".join(order.warnings) or "-",
            }
        )

    # summary.md
    md_lines = [
        f"# Lazada parse summary ({datetime.now().date().isoformat()})",
        "",
        f"- orders: **{len(summary_rows)}**",
        f"- unmatched items: **{len(unmatched_rows)}**",
        "",
        "| order_id | date | THB | items | matched | warnings |",
        "|---|---|---:|---:|---:|---|",
    ]
    for r in summary_rows:
        md_lines.append(
            f"| {r['order_id']} | {r['date']} | {r['amount']:.2f} | "
            f"{r['items']} | {r['matched']} | {r['warnings']} |"
        )
    (out_dir / "summary.md").write_text("\n".join(md_lines), encoding="utf-8")

    # unmatched.csv
    with (out_dir / "unmatched.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["uid", "order_id", "name", "qty", "unit_price"])
        w.writeheader()
        w.writerows(unmatched_rows)

    LOG.info(
        "done. %d orders → %s; %d unmatched items → %s",
        len(summary_rows),
        payloads_dir,
        len(unmatched_rows),
        out_dir / "unmatched.csv",
    )
    return 0


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="Parse extracted Lazada emails → fn_approve_receipt payloads")
    p.add_argument(
        "--extracted",
        type=Path,
        default=Path(__file__).parent / "extracted",
        help="Directory with extract.py output (default: ./extracted)",
    )
    p.add_argument(
        "--out",
        type=Path,
        default=Path(__file__).parent,
        help="Output base dir for payloads/, summary.md, unmatched.csv (default: cwd)",
    )
    p.add_argument(
        "--skip-db",
        action="store_true",
        help="Skip nomenclature matching (no DB calls). Items land in unmatched.csv.",
    )
    p.add_argument("--verbose", "-v", action="store_true")
    args = p.parse_args(argv)

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
    )
    return pipeline(args)


if __name__ == "__main__":
    sys.exit(main())
