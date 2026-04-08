#!/usr/bin/env python3
"""
MemPalace pre-ingest filter.

Reads `pre-ingest-blocklist.yaml`, scans input content, and HARD-FAILS on any
match. Design principles (spec §4.1):

    - Drop, not redact. Redaction invites a false sense of security when regex
      misses a variant — we'd rather reject the whole ingest and force the
      human to look at what leaked.
    - Hard-fail on detection: exit non-zero, print pattern name + offending
      line number + 40-char context window.
    - Blocklist lives in YAML so new patterns need no code change.

Usage:
    python filter.py <path-to-content>         # exit 0 = clean, 1 = blocked
    cat foo.txt | python filter.py -           # read from stdin

Wrap every mempalace ingest with this — do NOT bypass even for "test" content.
"""

from __future__ import annotations

import argparse
import pathlib
import re
import sys
from dataclasses import dataclass

import yaml

DEFAULT_BLOCKLIST = pathlib.Path(__file__).parent / "pre-ingest-blocklist.yaml"


@dataclass(frozen=True)
class Pattern:
    name: str
    regex: re.Pattern[str]
    severity: str
    why: str


def load_blocklist(path: pathlib.Path) -> list[Pattern]:
    with path.open("r", encoding="utf-8") as f:
        data = yaml.safe_load(f) or {}
    patterns: list[Pattern] = []
    for entry in data.get("patterns", []):
        patterns.append(
            Pattern(
                name=entry["name"],
                regex=re.compile(entry["regex"]),
                severity=entry.get("severity", "high"),
                why=entry.get("why", ""),
            )
        )
    if not patterns:
        raise SystemExit(f"ERROR: blocklist {path} is empty — refusing to run")
    return patterns


def scan(text: str, patterns: list[Pattern]) -> list[tuple[Pattern, int, str]]:
    """Return every hit as (pattern, line_number, context_snippet)."""
    hits: list[tuple[Pattern, int, str]] = []
    lines = text.splitlines()
    for i, line in enumerate(lines, start=1):
        for p in patterns:
            m = p.regex.search(line)
            if m:
                start = max(0, m.start() - 20)
                end = min(len(line), m.end() + 20)
                snippet = line[start:end]
                hits.append((p, i, snippet))
    return hits


def read_input(path_arg: str) -> str:
    if path_arg == "-":
        return sys.stdin.read()
    return pathlib.Path(path_arg).read_text(encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("path", help="File to scan, or '-' for stdin")
    parser.add_argument(
        "--blocklist",
        default=str(DEFAULT_BLOCKLIST),
        help=f"Path to blocklist YAML (default: {DEFAULT_BLOCKLIST})",
    )
    parser.add_argument(
        "--quiet",
        action="store_true",
        help="Suppress the 'OK' banner on clean input",
    )
    args = parser.parse_args()

    patterns = load_blocklist(pathlib.Path(args.blocklist))
    text = read_input(args.path)
    hits = scan(text, patterns)

    if hits:
        print(
            f"BLOCKED: {len(hits)} match(es) in {args.path} — ingest refused.",
            file=sys.stderr,
        )
        for p, line_no, snippet in hits:
            print(
                f"  [{p.severity}] {p.name} @ line {line_no}: …{snippet}…",
                file=sys.stderr,
            )
            if p.why:
                print(f"    why: {p.why}", file=sys.stderr)
        return 1

    if not args.quiet:
        print(f"OK: {args.path} passed {len(patterns)} block pattern(s).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
