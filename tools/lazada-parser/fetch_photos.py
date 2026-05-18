"""
Fetch product photos for Lazada orders by scraping the Drive-exported HTML.

The Apps Script can't follow external image URLs reliably, and Lazada emails
embed product photos as `<img src="https://*.slatic.net/p/<hash>.jpg">` rather
than as inline attachments. This script downloads them locally so they can be
linked to nomenclature later (see MC task 2d9bf822).

Strategy per HTML email:
  1. Parse the HTML with BeautifulSoup.
  2. Cut everything after the "Don't Forget to Buy These" boilerplate to avoid
     pulling in recommendation thumbnails.
  3. Walk <img> tags in document order, keep those matching the product-photo
     pattern (path contains `/p/` on a `slatic.net` host).
  4. Dedup URLs (Lazada sometimes repeats the same image as both the row
     thumbnail and a decorative banner) preserving first-seen order.
  5. Download each — that's the order's product gallery, listed in the same
     order as the line items so the parser can 1:1 zip them.

Output: <out>/<order_id>/<order_id>_<idx>.<ext>
"""

from __future__ import annotations

import argparse
import json
import logging
import re
import sys
import time
from pathlib import Path
from urllib.parse import urlparse

LOG = logging.getLogger("lazada-photos")

PRODUCT_URL_RE = re.compile(
    r"https?://[a-z0-9.-]*slatic\.net/p/[a-f0-9]+\.(?:jpg|jpeg|png|webp)",
    re.IGNORECASE,
)
RECOMMENDATION_MARKERS = [
    "Don't Forget to Buy These",
    "Don&#39;t Forget to Buy These",
    "Don’t Forget to Buy These",
    "Recommended for you",
    "ติดตามลาซาด้า",
]
USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/127.0 Safari/537.36"
)


def cut_recommendations(html: str) -> str:
    """Return HTML up to the first 'recommendations' marker."""
    cut = len(html)
    lower = html.lower()
    for marker in RECOMMENDATION_MARKERS:
        idx = lower.find(marker.lower())
        if 0 <= idx < cut:
            cut = idx
    return html[:cut]


def product_urls(html: str) -> list[str]:
    """Extract product photo URLs in document order, deduplicated."""
    trimmed = cut_recommendations(html)
    seen: set[str] = set()
    out: list[str] = []
    for m in PRODUCT_URL_RE.finditer(trimmed):
        url = m.group(0)
        if url not in seen:
            seen.add(url)
            out.append(url)
    return out


def download(url: str, dest: Path, session) -> bool:
    if dest.exists() and dest.stat().st_size > 0:
        LOG.debug("skip existing %s", dest.name)
        return True
    try:
        r = session.get(url, timeout=20, headers={"User-Agent": USER_AGENT})
        r.raise_for_status()
    except Exception as e:  # noqa: BLE001
        LOG.warning("fetch failed %s — %s", url, e)
        return False
    dest.write_bytes(r.content)
    return True


def ext_for(url: str) -> str:
    suffix = Path(urlparse(url).path).suffix.lower()
    return suffix if suffix in {".jpg", ".jpeg", ".png", ".webp"} else ".jpg"


def process_gas_folder(gas_folder: Path, out_dir: Path) -> int:
    try:
        import requests  # type: ignore
    except ImportError:
        LOG.error("requests not installed. pip install -r requirements.txt")
        return 2

    index_path = gas_folder / "index.json"
    if not index_path.exists():
        LOG.error("index.json not found in %s", gas_folder)
        return 2
    index = json.loads(index_path.read_text(encoding="utf-8"))

    orders_dir = gas_folder / "orders"
    out_dir.mkdir(parents=True, exist_ok=True)

    manifest: list[dict] = []
    session = requests.Session()
    total_downloaded = 0
    skipped_orders = 0

    for order in index.get("orders", []):
        slug: str = order["slug"]
        order_id: str = order["order_id"]
        subject: str = order.get("subject", "")
        # Only confirmation emails carry product images we care about
        if subject and not subject.lower().startswith(("we have received", "thank you for")):
            skipped_orders += 1
            continue

        html_path = orders_dir / f"{slug}.html"
        if not html_path.exists():
            continue
        html = html_path.read_text(encoding="utf-8", errors="replace")
        urls = product_urls(html)
        if not urls:
            continue

        order_out = out_dir / order_id
        order_out.mkdir(exist_ok=True)
        fetched: list[dict] = []
        for i, url in enumerate(urls):
            name = f"{order_id}_{i}{ext_for(url)}"
            dest = order_out / name
            if download(url, dest, session):
                fetched.append({"idx": i, "url": url, "filename": name})
                total_downloaded += 1
            time.sleep(0.1)  # be polite to the CDN

        manifest.append(
            {
                "order_id": order_id,
                "slug": slug,
                "subject": subject,
                "date": order.get("date"),
                "photos": fetched,
            }
        )

    (out_dir / "photos-manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    LOG.info(
        "downloaded %d photos for %d orders (%d order(s) skipped as non-confirmation); manifest: %s",
        total_downloaded,
        len(manifest),
        skipped_orders,
        out_dir / "photos-manifest.json",
    )
    return 0


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="Download Lazada product photos from a GAS export folder")
    p.add_argument("gas_folder", type=Path, help="Path to the Lazada-export-* folder")
    p.add_argument(
        "--out",
        type=Path,
        default=Path(__file__).parent / "photos",
        help="Output directory (default: ./photos)",
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
    return process_gas_folder(args.gas_folder, args.out)


if __name__ == "__main__":
    sys.exit(main())
