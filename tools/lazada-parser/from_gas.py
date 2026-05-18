"""
Bridge: Google Apps Script export folder → extract.py-compatible layout.

The `gmail-export.gs` script writes:
    <gas_folder>/
        orders/<slug>.html      — full email HTML
        images/<slug>_<n>.<ext> — inline product images
        index.json              — order_id ↔ slug ↔ image filenames metadata

This script reads that layout and emits the same `extracted/<uid>.{json,html}`
shape that extract.py produces from a .mbox. parse.py then runs unchanged.

Usage:
    python from_gas.py /path/to/Lazada-export-2026-05-18_1430 [--out extracted]
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from pathlib import Path

LOG = logging.getLogger("lazada-from-gas")


def convert(gas_folder: Path, out_dir: Path) -> int:
    index_path = gas_folder / "index.json"
    if not index_path.exists():
        LOG.error("index.json not found in %s", gas_folder)
        return 2
    out_dir.mkdir(parents=True, exist_ok=True)

    index = json.loads(index_path.read_text(encoding="utf-8"))
    orders = index.get("orders", [])
    LOG.info("converting %d orders from %s", len(orders), gas_folder)

    written = 0
    for order in orders:
        slug: str = order["slug"]
        order_id: str = order["order_id"]
        html_src = gas_folder / "orders" / f"{slug}.html"
        if not html_src.exists():
            LOG.warning("missing html for order %s (expected %s)", order_id, html_src)
            continue
        html_body = html_src.read_text(encoding="utf-8", errors="replace")

        # Use slug (order_id + msgIdPrefix) so multiple messages per order
        # (placement / shipped / delivered / cancellation) get separate files
        # instead of overwriting each other. parse.py dedups by order_id later.
        uid = slug
        meta = {
            "uid": uid,
            "order_id": order_id,
            "subject": order.get("subject", ""),
            "from_addr": order.get("from", ""),
            "date": order.get("date", ""),
            "attachments": order.get("images", []),
            "has_html": True,
            "has_plain": False,
            "plain_body": "",
        }
        (out_dir / f"{uid}.json").write_text(
            json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        (out_dir / f"{uid}.html").write_text(html_body, encoding="utf-8")
        written += 1

    LOG.info("wrote %d files to %s", written, out_dir)
    return 0


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="Convert GAS export folder to extract.py layout")
    p.add_argument("gas_folder", type=Path, help="Path to Lazada-export-* folder (locally downloaded from Drive)")
    p.add_argument(
        "--out",
        type=Path,
        default=Path(__file__).parent / "extracted",
        help="Output directory (default: ./extracted)",
    )
    p.add_argument("--verbose", "-v", action="store_true")
    args = p.parse_args(argv)

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
    )
    if not args.gas_folder.exists():
        LOG.error("folder not found: %s", args.gas_folder)
        return 2
    return convert(args.gas_folder, args.out)


if __name__ == "__main__":
    sys.exit(main())
