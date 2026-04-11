#!/usr/bin/env python3
"""
Quality Gate Regression Runner — tests brain responses against known-answer pairs.

Spec: docs/plans/spec-brain-feedback-loop.md §4.3
MC task: 087e6502

Reads brain_quality_tests, executes queries against L1/L2 endpoints,
checks expected keywords, writes results. Creates MC task on regression.

Env vars:
  SUPABASE_URL              — Supabase project URL
  SUPABASE_SERVICE_ROLE_KEY — service-role key (write access)
  LIGHTRAG_URL              — LightRAG server (default: http://localhost:9621)
  MEMPALACE_URL             — MemPalace server (default: http://localhost:8765)
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
LIGHTRAG_URL = os.environ.get("LIGHTRAG_URL", "http://localhost:9621")
MEMPALACE_URL = os.environ.get("MEMPALACE_URL", "http://localhost:8765")


# ── Supabase helpers ─────────────────────────────────────────────────

def _headers():
    return {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
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


def _patch(path: str, match_params: dict, body: dict):
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    url += "?" + urllib.parse.urlencode(match_params)
    data = json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, method="PATCH")
    for k, v in _headers().items():
        req.add_header(k, v)
    with urllib.request.urlopen(req, timeout=10) as resp:
        resp.read()


def _post(path: str, body: dict):
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    data = json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, method="POST")
    for k, v in _headers().items():
        req.add_header(k, v)
    req.add_header("Prefer", "return=representation")
    with urllib.request.urlopen(req, timeout=10) as resp:
        return json.loads(resp.read())


# ── Brain query helpers ──────────────────────────────────────────────

def query_l2(query: str) -> str:
    """Query LightRAG (L2) and return response text."""
    url = f"{LIGHTRAG_URL}/query"
    body = json.dumps({"query": query, "mode": "hybrid", "stream": False}).encode()
    req = urllib.request.Request(url, data=body, method="POST")
    req.add_header("Content-Type", "application/json")
    req.add_header("Accept", "application/json")
    with urllib.request.urlopen(req, timeout=60) as resp:
        data = json.loads(resp.read())
    # LightRAG returns {"response": "..."} or the response as a string
    if isinstance(data, dict):
        return data.get("response", "") or data.get("data", "") or str(data)
    return str(data)


def query_l1(query: str) -> str:
    """Query MemPalace (L1) and return concatenated result texts."""
    params = urllib.parse.urlencode({"q": query, "limit": "5"})
    url = f"{MEMPALACE_URL}/search?{params}"
    req = urllib.request.Request(url)
    req.add_header("Accept", "application/json")
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read())
    results = data.get("results", []) if isinstance(data, dict) else []
    return " ".join(r.get("text", "") for r in results)


# ── Scoring ──────────────────────────────────────────────────────────

def check_keywords(response: str, expected: list[str]) -> tuple[int, int]:
    """Return (matched_count, total_count)."""
    response_lower = response.lower()
    matched = sum(1 for kw in expected if kw.lower() in response_lower)
    return matched, len(expected)


def compute_score(matched: int, total: int) -> int:
    """5 if all, 3 if >=50%, 1 if <50%."""
    if total == 0:
        return 1
    ratio = matched / total
    if ratio >= 1.0:
        return 5
    if ratio >= 0.5:
        return 3
    return 1


# ── Regression detection ─────────────────────────────────────────────

def create_regression_task(test_row: dict, new_score: int, old_score: int):
    """Create MC task for a regression."""
    title = f"Brain regression: {test_row['layer']} test failed — \"{test_row['query'][:60]}\""
    task = {
        "id": str(uuid.uuid4()),
        "title": title,
        "domain": "tech",
        "status": "inbox",
        "priority": "high",
        "created_by": "brain-quality-monitor",
        "source": "agent_discovery",
        "executor_type": "human",
        "tags": ["brain-regression", test_row["layer"]],
        "related_ids": {
            "test_id": test_row["id"],
            "layer": test_row["layer"],
            "old_score": old_score,
            "new_score": new_score,
        },
        "description": (
            f"Regression detected in {test_row['layer']} quality test. "
            f"Query: \"{test_row['query']}\". "
            f"Previous score: {old_score}, now: {new_score}. "
            f"Expected keywords: {', '.join(test_row.get('expected_keywords', []))}."
        ),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    try:
        _post("business_tasks", task)
        print(f"  REGRESSION TASK CREATED: {title}")
    except (urllib.error.URLError, OSError) as e:
        print(f"  Failed to create regression task: {e}")


# ── Main ─────────────────────────────────────────────────────────────

def main():
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required", file=sys.stderr)
        sys.exit(1)

    tests = _get("brain_quality_tests", {
        "select": "id,layer,query,expected_keywords,last_score",
        "order": "created_at.asc",
    })

    if not tests:
        print("No regression tests found in brain_quality_tests. Run the seed migration first.")
        return

    print(f"Running {len(tests)} regression tests...")

    passed = 0
    failed = 0
    errors = 0
    now = datetime.now(timezone.utc).isoformat()

    for test in tests:
        layer = test["layer"]
        query = test["query"]
        expected = test.get("expected_keywords", [])
        old_score = test.get("last_score")

        print(f"\n  [{layer}] {query[:60]}...")

        try:
            if layer == "L2":
                response = query_l2(query)
            elif layer == "L1":
                response = query_l1(query)
            else:
                print(f"    SKIP: unknown layer {layer}")
                errors += 1
                continue
        except (urllib.error.URLError, OSError) as e:
            print(f"    ERROR: {e}")
            errors += 1
            continue

        matched, total = check_keywords(response, expected)
        score = compute_score(matched, total)
        preview = response[:500] if response else None

        status = "PASS" if score >= 3 else "FAIL"
        print(f"    {status}: {matched}/{total} keywords, score={score}")

        # Write results back
        try:
            _patch("brain_quality_tests", {"id": f"eq.{test['id']}"}, {
                "last_run_at": now,
                "last_score": score,
                "last_response_preview": preview,
            })
        except (urllib.error.URLError, OSError) as e:
            print(f"    Failed to write result: {e}")

        if score >= 3:
            passed += 1
        else:
            failed += 1

        # Regression detection: was passing, now failing
        if old_score is not None and old_score >= 3 and score < 3:
            create_regression_task(test, score, old_score)

    print(f"\nDone: {passed} passed, {failed} failed, {errors} errors")
    if failed > 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
