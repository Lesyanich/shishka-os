#!/usr/bin/env python3
"""
Gap-to-MC Pipeline — creates Mission Control tasks for recurring brain knowledge gaps.

Spec: docs/plans/spec-brain-feedback-loop.md §6.1
MC task: 087e6502

Reads brain_gaps view, creates MC business_tasks for gaps with hit_count >= 3.
Deduplicates against existing tasks tagged 'brain-gap'.

Env vars:
  SUPABASE_URL              — Supabase project URL
  SUPABASE_SERVICE_ROLE_KEY — service-role key (write access)
"""

import json
import os
import sys
import urllib.request
import urllib.error
import urllib.parse
import uuid
from datetime import datetime, timezone


# ── Config ───────────────────────────────────────────────────────────

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

MIN_HIT_COUNT = 3
HIGH_PRIORITY_THRESHOLD = 5


# ── Supabase helpers ─────────────────────────────────────────────────

def _headers(prefer: str = "return=minimal"):
    return {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": prefer,
    }


def _get(path: str, params: dict = None) -> list:
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    if params:
        url += "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url)
    req.add_header("apikey", SUPABASE_KEY)
    req.add_header("Authorization", f"Bearer {SUPABASE_KEY}")
    req.add_header("Accept", "application/json")
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read())


def _post(path: str, body: dict):
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    data = json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, method="POST")
    for k, v in _headers("return=representation").items():
        req.add_header(k, v)
    with urllib.request.urlopen(req, timeout=10) as resp:
        return json.loads(resp.read())


# ── Main ─────────────────────────────────────────────────────────────

def main():
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required", file=sys.stderr)
        sys.exit(1)

    # 1. Read gaps with hit_count >= MIN_HIT_COUNT
    gaps = _get("brain_gaps", {
        "select": "layer,query_pattern,hit_count,first_seen,last_seen,avg_score,agents",
        "hit_count": f"gte.{MIN_HIT_COUNT}",
        "order": "hit_count.desc",
        "limit": "50",
    })

    if not gaps:
        print("No gaps with hit_count >= 3. Done.")
        return

    print(f"Found {len(gaps)} gaps with hit_count >= {MIN_HIT_COUNT}.")

    # 2. Load existing brain-gap tasks for dedup
    existing_tasks = _get("business_tasks", {
        "select": "id,title",
        "tags": "cs.{brain-gap}",
        "status": "not.in.(done,cancelled)",
        "limit": "100",
    })
    existing_titles = {t["title"].lower() for t in existing_tasks}
    print(f"  {len(existing_tasks)} existing brain-gap tasks found.")

    created = 0
    skipped = 0

    for gap in gaps:
        pattern = gap.get("query_pattern", "")[:80]
        layer = gap.get("layer", "L2")
        hit_count = gap.get("hit_count", 0)

        # Build title matching the spec template
        title = f"Brain gap: {pattern} ({layer}, {hit_count}x)"

        # Dedup: check if similar title exists (fuzzy: match on query_pattern substring)
        if _is_duplicate(pattern, existing_titles):
            skipped += 1
            continue

        priority = "high" if hit_count >= HIGH_PRIORITY_THRESHOLD else "medium"

        task = {
            "id": str(uuid.uuid4()),
            "title": title,
            "domain": "tech",
            "status": "inbox",
            "priority": priority,
            "created_by": "brain-quality-monitor",
            "source": "agent_discovery",
            "executor_type": "human",
            "tags": ["brain-gap", layer],
            "related_ids": {
                "layer": layer,
                "query_count": hit_count,
                "first_seen": gap.get("first_seen", ""),
            },
            "description": (
                f"Recurring knowledge gap detected in {layer}. "
                f"Query pattern: \"{pattern}\" — seen {hit_count}x. "
                f"Avg quality score: {gap.get('avg_score', 'N/A')}. "
                f"Agents affected: {', '.join(gap.get('agents') or []) or 'unknown'}."
            ),
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }

        try:
            _post("business_tasks", task)
            created += 1
            existing_titles.add(title.lower())
            print(f"  CREATED: {title}")
        except (urllib.error.URLError, OSError) as e:
            print(f"  FAILED: {title} — {e}")

    print(f"\nDone: {created} created, {skipped} skipped (duplicates)")


def _is_duplicate(pattern: str, existing_titles: set) -> bool:
    """Check if a gap pattern is already covered by an existing MC task."""
    pattern_lower = pattern.lower().strip()
    for title in existing_titles:
        # Match if the query pattern appears in an existing task title
        if pattern_lower[:50] in title:
            return True
    return False


if __name__ == "__main__":
    main()
