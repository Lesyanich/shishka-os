#!/usr/bin/env python3
"""
Nightly LLM Judge — scores unscored brain_query_log entries via gpt-4o-mini.

Spec: docs/plans/spec-brain-feedback-loop.md §3 Tier 1
MC task: 087e6502
Cost: ~$0.004/day (~50 queries * 500 tokens/eval)

Env vars:
  SUPABASE_URL              — Supabase project URL
  SUPABASE_SERVICE_ROLE_KEY — service-role key (write access)
  OPENAI_API_KEY            — OpenAI API key
"""

import json
import os
import sys
import urllib.request
import urllib.error
import urllib.parse

from openai import OpenAI

# ── Config ───────────────────────────────────────────────────────────

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")

MODEL = "gpt-4o-mini"
LOOKBACK_INTERVAL = "1 day"

RUBRIC_PROMPT = """\
You are evaluating a knowledge retrieval system. Given the query and the system's response,
rate the response quality on a 1-5 scale:
5 = Complete, accurate, well-sourced answer
4 = Mostly complete, minor gaps
3 = Partially relevant, missing key details
2 = Tangentially related, mostly unhelpful
1 = No useful information or completely wrong

Query: {query}
Response: {response}

Reply with ONLY a JSON object: {{"score": <int 1-5>, "reason": "<one sentence>"}}"""


# ── Supabase helpers ─────────────────────────────────────────────────

def _supabase_headers():
    return {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }


def _supabase_get(path: str, params: dict = None) -> list:
    """GET from Supabase REST API, returns parsed JSON list."""
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    if params:
        url += "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url)
    req.add_header("apikey", SUPABASE_KEY)
    req.add_header("Authorization", f"Bearer {SUPABASE_KEY}")
    req.add_header("Accept", "application/json")
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read())


def _supabase_patch(path: str, match_params: dict, body: dict):
    """PATCH a row in Supabase REST API."""
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    url += "?" + urllib.parse.urlencode(match_params)
    data = json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, method="PATCH")
    for k, v in _supabase_headers().items():
        req.add_header(k, v)
    with urllib.request.urlopen(req, timeout=10) as resp:
        resp.read()


# ── LLM Judge ────────────────────────────────────────────────────────

def judge_query(client: OpenAI, query: str, response: str) -> tuple[int, str]:
    """Call gpt-4o-mini to score a query-response pair. Returns (score, reason)."""
    prompt = RUBRIC_PROMPT.format(query=query, response=response)
    completion = client.chat.completions.create(
        model=MODEL,
        messages=[{"role": "user", "content": prompt}],
        temperature=0,
        max_tokens=100,
    )
    raw = completion.choices[0].message.content.strip()
    try:
        parsed = json.loads(raw)
        score = max(1, min(5, int(parsed["score"])))
        reason = parsed.get("reason", "")
    except (json.JSONDecodeError, KeyError, ValueError):
        # Fallback: try to extract just a number
        for ch in raw:
            if ch.isdigit() and 1 <= int(ch) <= 5:
                return int(ch), raw
        return 3, f"parse-error: {raw[:100]}"
    return score, reason


# ── Main ─────────────────────────────────────────────────────────────

def main():
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required", file=sys.stderr)
        sys.exit(1)
    if not OPENAI_API_KEY:
        print("ERROR: OPENAI_API_KEY required", file=sys.stderr)
        sys.exit(1)

    # Fetch unscored queries from the last day
    rows = _supabase_get("brain_query_log", {
        "select": "id,query_preview,response_preview",
        "quality_source": "is.null",
        f"ts": f"gte.{_ts_lookback()}",
        "response_preview": "not.is.null",
        "order": "ts.desc",
        "limit": "200",
    })

    if not rows:
        print("No unscored queries found. Done.")
        return

    print(f"Found {len(rows)} unscored queries to judge.")

    client = OpenAI(api_key=OPENAI_API_KEY)
    scored = 0
    total_score = 0
    gaps = 0

    for row in rows:
        query = row.get("query_preview") or ""
        response = row.get("response_preview") or ""
        if not query or not response:
            continue

        try:
            score, reason = judge_query(client, query, response)
        except Exception as e:
            print(f"  SKIP {row['id'][:8]}: LLM error: {e}")
            continue

        is_gap = score <= 2
        try:
            _supabase_patch("brain_query_log", {"id": f"eq.{row['id']}"}, {
                "quality_score": score,
                "quality_source": "llm-judge",
                "is_gap": is_gap,
            })
        except (urllib.error.URLError, OSError) as e:
            print(f"  SKIP {row['id'][:8]}: Supabase write error: {e}")
            continue

        scored += 1
        total_score += score
        if is_gap:
            gaps += 1
        print(f"  {row['id'][:8]}: score={score} gap={is_gap} — {reason[:80]}")

    avg = round(total_score / scored, 1) if scored else 0
    print(f"\nDone: {scored} scored, avg={avg}, gaps={gaps}")


def _ts_lookback() -> str:
    """Return ISO timestamp for 'now - LOOKBACK_INTERVAL'."""
    from datetime import datetime, timedelta, timezone
    dt = datetime.now(timezone.utc) - timedelta(days=1)
    return dt.isoformat()


if __name__ == "__main__":
    main()
