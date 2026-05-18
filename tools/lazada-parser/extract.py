"""
Lazada email extractor — phase 1 of the Lazada import pipeline.

Reads a Google Takeout .mbox file, filters messages from Lazada, dumps each
message body (plain + HTML) and metadata as JSON for downstream parsing.

Output layout:
    extracted/
        <uid>.json   (metadata + body texts + attachment names)
        <uid>.html   (raw HTML body, for inspection / parser tuning)

UID is the message Order ID when extractable, otherwise the SHA1 of the Message-ID.
"""

from __future__ import annotations

import argparse
import email
import hashlib
import json
import logging
import mailbox
import re
import sys
from dataclasses import dataclass, field
from email.message import Message
from pathlib import Path
from typing import Iterator

LOG = logging.getLogger("lazada-extract")

LAZADA_FROM_PATTERNS = [
    re.compile(r"@lazada\.co\.th", re.I),
    re.compile(r"@lazada\.com", re.I),
    re.compile(r"@mail\.lazada\.co\.th", re.I),
    re.compile(r"noreply.*lazada", re.I),
    re.compile(r"tracking.*lazada", re.I),
]

ORDER_ID_RE = re.compile(r"\b(\d{16,})\b")


@dataclass
class ExtractedMessage:
    uid: str
    order_id: str | None
    subject: str
    from_addr: str
    date: str
    plain_body: str
    html_body: str
    attachments: list[str] = field(default_factory=list)


def is_lazada(msg: Message) -> bool:
    from_addr = (msg.get("From") or "").lower()
    if any(p.search(from_addr) for p in LAZADA_FROM_PATTERNS):
        return True
    subj = (msg.get("Subject") or "").lower()
    return "lazada" in subj


def decode_part(part: Message) -> str:
    payload = part.get_payload(decode=True)
    if payload is None:
        return ""
    charset = part.get_content_charset() or "utf-8"
    try:
        return payload.decode(charset, errors="replace")
    except (LookupError, UnicodeDecodeError):
        return payload.decode("utf-8", errors="replace")


def extract_bodies(msg: Message) -> tuple[str, str, list[str]]:
    plain_parts: list[str] = []
    html_parts: list[str] = []
    attachments: list[str] = []

    if msg.is_multipart():
        for part in msg.walk():
            ctype = part.get_content_type()
            disp = (part.get("Content-Disposition") or "").lower()
            if "attachment" in disp:
                fname = part.get_filename() or "(unnamed)"
                attachments.append(fname)
                continue
            if ctype == "text/plain":
                plain_parts.append(decode_part(part))
            elif ctype == "text/html":
                html_parts.append(decode_part(part))
    else:
        ctype = msg.get_content_type()
        body = decode_part(msg)
        if ctype == "text/html":
            html_parts.append(body)
        else:
            plain_parts.append(body)

    return "\n\n".join(plain_parts), "\n\n".join(html_parts), attachments


def find_order_id(subject: str, plain: str, html: str) -> str | None:
    for haystack in (subject, plain, html):
        m = ORDER_ID_RE.search(haystack or "")
        if m:
            return m.group(1)
    return None


def make_uid(msg: Message, order_id: str | None) -> str:
    if order_id:
        return order_id
    mid = msg.get("Message-ID") or msg.get("Message-Id") or ""
    if mid:
        return "msg-" + hashlib.sha1(mid.encode("utf-8", "replace")).hexdigest()[:12]
    raw = (msg.get("Subject") or "") + (msg.get("Date") or "")
    return "msg-" + hashlib.sha1(raw.encode("utf-8", "replace")).hexdigest()[:12]


def iter_lazada(box_path: Path) -> Iterator[ExtractedMessage]:
    box = mailbox.mbox(str(box_path))
    seen = 0
    matched = 0
    try:
        for msg in box:
            seen += 1
            if not is_lazada(msg):
                continue
            matched += 1
            plain, html, attachments = extract_bodies(msg)
            order_id = find_order_id(msg.get("Subject") or "", plain, html)
            uid = make_uid(msg, order_id)
            yield ExtractedMessage(
                uid=uid,
                order_id=order_id,
                subject=msg.get("Subject") or "",
                from_addr=msg.get("From") or "",
                date=msg.get("Date") or "",
                plain_body=plain,
                html_body=html,
                attachments=attachments,
            )
    finally:
        box.close()
        LOG.info("Scanned %d messages, matched %d Lazada", seen, matched)


def write_outputs(out_dir: Path, extracted: ExtractedMessage) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    meta = {
        "uid": extracted.uid,
        "order_id": extracted.order_id,
        "subject": extracted.subject,
        "from_addr": extracted.from_addr,
        "date": extracted.date,
        "attachments": extracted.attachments,
        "has_html": bool(extracted.html_body),
        "has_plain": bool(extracted.plain_body),
        "plain_body": extracted.plain_body,
    }
    (out_dir / f"{extracted.uid}.json").write_text(
        json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    if extracted.html_body:
        (out_dir / f"{extracted.uid}.html").write_text(extracted.html_body, encoding="utf-8")


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="Extract Lazada emails from a Google Takeout .mbox file")
    p.add_argument("mbox", type=Path, help="Path to the .mbox file (from Google Takeout)")
    p.add_argument(
        "--out",
        type=Path,
        default=Path(__file__).parent / "extracted",
        help="Output directory (default: ./extracted)",
    )
    p.add_argument("--limit", type=int, default=None, help="Stop after N matched messages")
    p.add_argument("--verbose", "-v", action="store_true")
    args = p.parse_args(argv)

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
    )

    if not args.mbox.exists():
        LOG.error("mbox not found: %s", args.mbox)
        return 2

    count = 0
    for extracted in iter_lazada(args.mbox):
        write_outputs(args.out, extracted)
        LOG.info(
            "wrote %s (order_id=%s, subject=%r, attachments=%d)",
            extracted.uid,
            extracted.order_id or "-",
            extracted.subject[:60],
            len(extracted.attachments),
        )
        count += 1
        if args.limit and count >= args.limit:
            LOG.info("limit reached (%d), stopping", args.limit)
            break

    LOG.info("done. %d messages written to %s", count, args.out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
