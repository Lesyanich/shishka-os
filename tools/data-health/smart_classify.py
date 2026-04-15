#!/usr/bin/env python3
"""
smart_classify.py — Auto-classify unclassified rows in review.csv.

Strategy:
  - Rows with suggested_id (similarity match from pg_trgm):  action = merge (use suggested_id)
  - Rows without suggested_id:
      * Non-food / packaging / water              → skip
      * Keyword override (curated UUID known)     → merge:<uuid>
      * Fuzzy match to curated item (score≥0.75)  → merge:<uuid>
      * Duplicate of another unresolved row       → merge:<first_auto_uuid>
      * Genuinely new ingredient                  → new

Usage:
  python smart_classify.py --dry-run     # show what it would do, don't write
  python smart_classify.py --execute     # write updated CSV
"""

import argparse
import csv
import os
import re
import subprocess
import sys
from collections import defaultdict
from difflib import SequenceMatcher
from pathlib import Path


# ---------------------------------------------------------------------------
# DB connection
# ---------------------------------------------------------------------------

def get_db_url() -> str:
    if url := os.environ.get("DATABASE_URL"):
        return url
    try:
        raw = subprocess.check_output(
            ["security", "find-generic-password", "-s", "shishka-database-url", "-w"],
            text=True, stderr=subprocess.DEVNULL,
        ).strip()
        if re.match(r"^[0-9a-fA-F]+$", raw) and len(raw) > 50:
            return bytes.fromhex(raw).decode()
        return raw
    except subprocess.CalledProcessError:
        print("ERROR: DATABASE_URL not set and 'shishka-database-url' not in keychain.", file=sys.stderr)
        sys.exit(1)


# ---------------------------------------------------------------------------
# Skip patterns — non-food, packaging, water, junk
# ---------------------------------------------------------------------------

SKIP_PATTERNS = [
    r'\bwater\b',
    r'\b\d{3,}\s*[lL]\b',           # 2000 L, 19L, 20L water
    r'^267\b',                        # "267 2000 L" OCR junk
    r'\bpaper\s+bowl',
    r'\bbox\b',                       # pizza box, food box, burger box
    r'\bhandle\s+bags?\b',
    r'\bzipper\s+bags?\b',
    r'\bpet\s+clear\b',
    r'\bpet\s+(bottle|lid)\b',
    r'\bparchment\s+paper\b',
    r'\bsilicone\s+coated\b',
    r'\bbaking\s+paper\b',
    r'\bshopping\s+bag\b',
    r'\bround\s+container\b',
    r'^item\s+n$',
    r'^miscellaneous\s+purchase',
    r'^product\s+return',
    r"whittaker",                     # chocolate product, not raw ingredient
    r'^water\s+delivery',
    r'flavou?red\s+gelatin',          # Imperial Orange Flavor (Jelly), Lychee Gelatin
    r'\bgelatin\b',
    r'\bjelly\b',
    r'\bbanana\s+leaf\b',             # ARO Artificial Banana Leaf — decorative
    r'\bpudluk\b',                    # ARO Round Pudluk PET Bottle — packaging
]

SKIP_RE = [re.compile(p, re.IGNORECASE) for p in SKIP_PATTERNS]


def is_skip(name: str) -> bool:
    return any(r.search(name) for r in SKIP_RE)


# ---------------------------------------------------------------------------
# Manual keyword overrides — keyword regex → curated UUID
# (applied against lowercased original name, before normalization)
# ---------------------------------------------------------------------------

# UUID map from the DB query (210 curated items)
KEYWORD_OVERRIDES = [
    # Protein / Meat
    (r'\beggs?\b',                                'f82edd8a-d9c2-4146-a8c9-2c25ee9145d2'),  # Chicken Egg
    (r'\bchicken\b.*\bbreast\b|\bbreast\b.*\bchicken\b', 'aaa295fc-7677-477c-91c2-6fcb40250953'),  # Chicken Breast
    (r'\bchicken\b.*\bthigh\b|\bthigh\b.*\bchicken\b',   '5f181b69-8374-4616-9c81-128d33c21cd6'),  # Chicken Thigh
    (r'\bchicken\b.*\bmince\b|\bminced\s+chicken\b',      '1f194368-8081-4564-aa0d-e5d4270fc492'),  # Chicken Mince
    (r'\bchicken\b.*\bliver\b',                   None),  # no curated → new
    (r'\bchicken\b.*\btenderloin\b',              None),  # no curated → new (chicken tenderloin ≠ breast/thigh)
    (r'\b(minced|ground)\s+(wagyu|brahman|beef)\b|\b(wagyu|brahman)\b.*\b(minced|ground|mince)\b',
                                                  'cf7dbbf8-ec51-42cf-a0af-ab32caa14f75'),  # Minced Beef
    # Dairy
    (r'\bmozzarella\b',   'a406e010-4354-454f-a53a-cc12feb98a4f'),  # Mozzarella Cheese
    (r'\bparmesan\b',     '8eb8007f-648b-48eb-86b3-18bcba831eb8'),  # Parmesan Cheese
    (r'\bgouda\b',        None),   # no curated → new
    (r'\bblue\s+cheese\b', None),  # no curated → new
    (r'\bsalad\s+cheese\b', 'e36a9e23-2eb3-4f94-b085-c891c10b1e4a'),  # Salad Cheese → Feta
    (r'\bfeta\b',         'e36a9e23-2eb3-4f94-b085-c891c10b1e4a'),  # Feta Cheese
    (r'\bricotta\b',      'bc6ef060-41f3-4d54-be23-f07b6f30c992'),  # Ricotta Cheese
    (r'\bgreek\s+yogurt\b|\byogurt\s+(natural|plain)\b',
                          '6996b6e8-e912-4bb0-9168-80a1b3ba6442'),  # Greek Yogurt
    (r'\blow.fat\s+yogurt\b',  '6996b6e8-e912-4bb0-9168-80a1b3ba6442'),  # Greek Yogurt (close enough)
    (r'\bsour\s+cream\b', 'b12f2ed1-2f81-4b78-95f7-9227ebcb367d'),  # Sour Cream
    (r'\bmilk\b',         'a9a133fd-6531-4720-9362-ebe65ab3431f'),  # Cow Milk (default)
    # Nuts / Seeds
    (r'\balmonds?\b',          '8c2588d4-94a6-41ba-97c7-3d7784785244'),  # Almonds
    (r'\bwalnuts?\b',          'dd672fe5-707a-466c-9d28-d900f7589510'),  # Walnuts
    (r'\bpeanuts?\b',          None),  # peanut ≠ peanut butter → new
    (r'\bcashews?\b',          '98c7bb48-0aea-42f2-b81c-2977e09634e5'),  # Cashew Nuts
    (r'\bpistachios?\b',       '3b99c204-34e5-49a3-8451-2cae751bc439'),  # Pistachios
    (r'\bchia\s+seeds\b',      '21606827-f92c-40de-80cc-62edacc6b713'),  # Chia Seeds
    # Oils / Vinegar (specific before generic)
    (r'\bred\s+wine\s+vinegar\b',  None),  # no RAW-VINEGAR-RED-WINE curated → new
    (r'\bolive\s+oil\b',       'c08b36bc-f67c-4fbb-a7f4-6f96e94bd5b2'),  # Olive Oil
    # dried/shredded coconut is NOT coconut oil — check before coconut oil pattern
    (r'\b(shredded|desiccated|dried)\s+coconut\b|\bcoconut\s+(shreds?|flakes?)\b',
                               None),   # no curated dried coconut → new
    (r'\bcoconut\s+oil\b',     '719c7289-97f2-4fcf-a22e-209b554816d8'),  # Coconut Oil
    (r'\bsesame\s+oil\b',      'd3073662-1930-45fe-bcbd-1c3f30489c9c'),  # Sesame Oil
    # Herbs / Spices
    (r'\bbasil\b',          '92615586-0a88-40fc-8f77-267ad2e52e66'),  # Basil Leaf
    (r'\bgarlic\b',         '0e8a7fcc-855c-46e5-94a6-681bb9875069'),  # Garlic
    (r'\bginger\b',         'bff6cc03-9f46-4a65-a6c1-3160fece0e14'),  # Ginger
    (r'\bcelery\b',         '7cc8045f-8ea3-49bd-9739-67cca83bdf43'),  # Celery
    (r'\bcilantro\b|\bcoriander\s+(leaf|leaves|herb|pack)\b',
                            '2e9b069c-4376-42b2-8bbc-152851751d76'),  # Cilantro
    (r'\bcardamom\b',       '592e6217-0f4c-4e5a-81c2-07146e29e063'),  # Cardamom
    (r'\bblack\s+pepper\b', 'a0a3b913-2790-4185-a019-d2c7e3eca370'),  # Black Pepper
    (r'\boregano\b',        'bb2b1b55-53b5-480f-b24c-3be8bdd9c883'),  # Oregano
    (r'\bparsley\b',        '8933f385-e4c3-42ad-a109-de90ea005d17'),  # Parsley
    (r'\bthyme\b',          '1821c045-8da8-4aee-9467-08104338277b'),  # Thyme
    (r'\brosemary\b',       'c40a135c-2799-4d4e-aeb3-97c849a01b7e'),  # Rosemary
    (r'\bdill\b',           '71edfebe-e40f-4f89-b362-419f8b770731'),  # Dill
    (r'\bmint\b',           '0a6dad8d-a508-46ce-912e-1a22ed67e44e'),  # Mint Leaf
    (r'\bfenugreek\b',      'd7e5000c-db71-4676-bbca-6507e7bdd51b'),  # Fenugreek
    (r'\bnutmeg\b',         'e89c2cfc-ec0e-49b7-a1e9-1772d2cf6a54'),  # Nutmeg
    (r'\bpaprika\b',        '77c764cc-b176-420a-b27d-5fd3a5af735d'),  # Paprika
    (r'\bcumin\b',          '9abbe8f9-6d9e-487d-af80-b66f364fb6e0'),  # Cumin Powder (seeds→powder)
    (r'\bcurry\s+powder\b', 'd484029a-39ec-4676-8474-ffee6268fc61'),  # Curry Powder
    (r'\bkaffir\s+lime\b',  'a715e162-a598-49ec-8156-29fc02b19a15'),  # Kaffir Lime Leaves (before generic lime)
    (r'\blemongrass\b',     '43619014-56b3-4991-8a03-eb23896f5676'),  # Lemongrass
    (r'\bgalangal\b',       '18acc32d-ea54-493d-a772-102aa78dadc1'),  # Galangal
    (r'\bturmeric\b',       '6649a5f0-188d-4766-be83-b08dd7e99d39'),  # Turmeric Powder
    (r'\byeast\b',          'd31bbea3-ae50-4524-9d38-06421c481139'),  # any yeast → Nutritional Yeast
    # Vegetables
    (r'\bcabbage\b',        'c891cba5-d703-4a2c-89df-6fb7e2f10c02'),  # Cabbage
    (r'\bspring\s+onion\b|\bscallions?\b', 'dff3957a-3d4a-4541-b0b7-e1f62472472a'),  # Spring Onion
    (r'\bonion\b',          '123d8bca-224d-4c10-9298-2d215b5c55e8'),  # Onion
    (r'\bshallots?\b',      '123d8bca-224d-4c10-9298-2d215b5c55e8'),  # Onion (shallots→onion)
    (r'\bpotato\b',         'b79be8e2-1bc5-4f7b-849b-ed9b60c299bd'),  # Potato
    (r'\bcarrot\b',         'fec3f583-8690-416a-8f04-46f215204ad9'),  # Carrot
    (r'\bgreen\s+beans?\b', '6465ffca-88fe-4f21-bff7-2a4556a07722'),  # Green Beans
    (r'\beggplant\b',       '8d6dd793-74be-4373-9c86-63389b7bc967'),  # Thai Eggplant (default)
    # bird's eye chili — must use double-quoted string to avoid apostrophe confusion
    (r"\bbird'?s?\s+eye\b|\bthai\s+chili\b",   'f8218a6d-997a-48bb-83b5-6c3ce441e5a5'),  # Thai Chili
    (r'\bokra\b',           None),  # no curated → new
    # Fruit (specific before generic — melon before orange)
    (r'\bmelon\b',          None),   # no curated melon → new (must be before orange)
    (r'\btomato',           '698ed52d-bf06-4fdf-84cc-bbe8628712f1'),  # Tomato / Tomatoes
    (r'\blimes?\b',         '7c3cd922-662b-4f7c-9dab-4ab66482419b'),  # Lime / Limes
    (r'\blemon\b',          '1b33bb95-c374-48c7-bf67-a78fc00e6e20'),  # Lemon
    (r'\boranges?\b',       '3c7ccb14-8ffe-478d-aa6e-f27151a5db92'),  # Orange / Oranges
    (r'\bpineapple\b',      '3c27b496-2a0d-4a54-a57d-fb0a9ef8f7d2'),  # Pineapple
    (r'\bmango\b',          'cb265878-6f6b-4fdb-b19d-81e106089df5'),  # Mango
    (r'\bavocado\b',        '5d3ae177-7614-4dc0-bd0d-5b4351e14ee0'),  # Avocado
    # Grains / Flour
    (r'\bwhite\s+rice\b|\bjasmine\s+rice\b',   '637c9191-8f7d-46c9-95ea-3c1df6faddaf'),  # Jasmine Rice
    (r'\bquinoa\b',         '48473fe4-d09f-4dac-b66c-395106e6f618'),  # Quinoa
    (r'\bhoney\b',          'c8fc16eb-1941-4161-a89c-a56aa68575e2'),  # Honey
    (r'\bcocoa\b',          'a294031f-cb9f-4668-b047-30fdfa13056d'),  # Cocoa Powder
]

KEYWORD_RE = [(re.compile(p, re.IGNORECASE), uuid) for p, uuid in KEYWORD_OVERRIDES]


def keyword_match(name: str):
    """Return UUID from manual override table, or False (skip), or None (no match)."""
    for pattern, uuid in KEYWORD_RE:
        if pattern.search(name):
            return uuid  # may be None → still means "no curated item, but we know what it is"
    return False  # False = no keyword matched at all → fall through to fuzzy


# ---------------------------------------------------------------------------
# Normalization for fuzzy matching (fallback after keyword check)
# ---------------------------------------------------------------------------

def normalize(text: str) -> str:
    t = text.lower()
    t = re.sub(r'\b\d+\s*(g|kg|ml|l|liter|liters|pcs|pc|oz|cm|x\d+)\b', '', t)
    t = re.sub(r'\bx\d+\b|\b\d+x\b', '', t)
    t = re.sub(
        r'\b(per\s+kg|per\s+pack|per\s+bag|per\s+sack|large\s+bag|small\s+bag|'
        r'whole\s+sack|fresh|frozen|dried|organic|imported|indian|'
        r'hydro|royal\s+project|sliced|shredded|ground|peeled|skinless|boneless|'
        r'unsweetened|pasteurized|low.fat|fat.free|pure|100%|inferred|discounted|'
        r'rpf|cs|rpl)\b', '', t
    )
    t = re.sub(
        r'\b(aro|aro-g|aro-r|cp|fz|ufo|upm|upo|hilltribe|meiji|magnolia|kesorn|naturel|'
        r'evolu.gio|doi\s+kham|bee\s+brand|raithip|suan\s+thai|a.joyz|sky\s+blue|'
        r'smuckers|maille|ponti|tulip|giuliano|olympus|chef\s+pack|hand\s+brand|'
        r'braggman|boncafe|nescafe|imperial|divella|eros|thainung|watties|ercho|'
        r'castle|castello|mdh|tgm|inferred|discounted|chanslady|tasty\s+life|'
        r'phueng\s+luang)\b', '', t
    )
    t = re.sub(r'[,"\'\(\)\[\]]', ' ', t)
    t = re.sub(r'\s+', ' ', t).strip()
    return t


def fuzzy_score(a: str, b: str) -> float:
    return SequenceMatcher(None, normalize(a), normalize(b)).ratio()


# ---------------------------------------------------------------------------
# Main logic
# ---------------------------------------------------------------------------

def run(dry_run: bool) -> None:
    import psycopg

    csv_path = Path(__file__).parent / "review.csv"
    with open(csv_path, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    if not rows:
        print("review.csv is empty.")
        return

    fieldnames = list(rows[0].keys())
    db_url = get_db_url()

    with psycopg.connect(db_url) as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id, product_code, name
                FROM nomenclature
                WHERE is_available = true
                  AND type = 'raw_ingredient'
                  AND product_code NOT LIKE 'RAW-AUTO-%%'
                ORDER BY name
            """)
            curated = [(str(r[0]), r[1], r[2]) for r in cur.fetchall()]

    print(f"Loaded {len(curated)} curated ingredients from DB\n")

    def best_fuzzy(name: str, threshold: float = 0.75):
        best_score = threshold
        best = None
        for uid, code, cname in curated:
            s = fuzzy_score(name, cname)
            if s > best_score:
                best_score = s
                best = (uid, code, cname, s)
        return best

    # -----------------------------------------------------------------------
    # Group ALL empty-action rows by normalized name (detect cross-row dups)
    # -----------------------------------------------------------------------
    name_groups: dict[str, list[tuple[int, dict]]] = defaultdict(list)
    for i, row in enumerate(rows):
        if not row.get("action", "").strip():
            key = normalize(row["auto_name"])
            if key:
                name_groups[key].append((i, row))

    # For each normalized-name group, determine canonical action once
    # (applied to all members — first=new/merge, rest=dup→merge:first_uuid)
    canonical: dict[str, str] = {}  # norm_key → action string for representative
    group_for_idx: dict[int, str] = {}  # row_idx → norm_key

    for key, group in name_groups.items():
        rep_idx, rep_row = group[0]
        name = rep_row["auto_name"]
        for idx, _ in group:
            group_for_idx[idx] = key

        # 1. Explicit skip
        if is_skip(name):
            canonical[key] = "skip"
            continue

        # 2. Keyword override table
        kw = keyword_match(name)
        if kw is not False:
            # kw is a UUID string (match found) or None (known gap → new)
            canonical[key] = f"merge:{kw}" if kw else "new"
            continue

        # 3. Fuzzy match against curated items (threshold 0.75)
        match = best_fuzzy(name)
        if match:
            uid, code, cname, score = match
            canonical[key] = f"merge:{uid}"
            continue

        # 4. Default: new ingredient
        canonical[key] = "new"

    # -----------------------------------------------------------------------
    # Apply actions to every row
    # -----------------------------------------------------------------------
    counts = {"already_set": 0, "merge_suggested": 0, "merge_curated": 0,
              "new": 0, "new_dup": 0, "skip": 0}

    for i, row in enumerate(rows):
        existing = row.get("action", "").strip()

        # Already classified (Lesia's merges or previous run)
        if existing:
            counts["already_set"] += 1
            continue

        # Has pg_trgm suggested_id → accept suggestion as merge
        if row.get("suggested_id", "").strip():
            if not dry_run:
                rows[i]["action"] = "merge"
            counts["merge_suggested"] += 1
            print(f"  SUGG  {row['auto_name']!r:62s}  →  {row.get('suggested_code','')} [{row.get('similarity','')}]")
            continue

        # No suggested_id — apply group logic
        key = group_for_idx.get(i)
        if key is None:
            if not dry_run:
                rows[i]["action"] = "skip"
            counts["skip"] += 1
            continue

        action = canonical[key]
        group = name_groups[key]
        rep_idx = group[0][0]

        if action == "skip":
            if not dry_run:
                rows[i]["action"] = "skip"
            counts["skip"] += 1
            print(f"  SKIP  {row['auto_name']!r}")

        elif action.startswith("merge:"):
            uid = action.split(":", 1)[1]
            cname = next((c for u, _, c in curated if u == uid), "?") if uid else "?"
            score = round(fuzzy_score(row["auto_name"], cname), 2)
            if not dry_run:
                rows[i]["action"] = action
            counts["merge_curated"] += 1
            print(f"  MATCH {row['auto_name']!r:62s}  →  {cname} [{score}]")

        elif action == "new":
            if i == rep_idx:
                if not dry_run:
                    rows[i]["action"] = "new"
                counts["new"] += 1
                extra = f"  (+ {len(group)-1} dup(s))" if len(group) > 1 else ""
                print(f"  NEW   {row['auto_name']!r}{extra}")
            else:
                rep_uuid = group[0][1]["auto_id"]
                dup_action = f"merge:{rep_uuid}"
                if not dry_run:
                    rows[i]["action"] = dup_action
                counts["new_dup"] += 1
                print(f"  DUP   {row['auto_name']!r:62s}  →  {rep_uuid[:8]}...")

    # -----------------------------------------------------------------------
    # Summary
    # -----------------------------------------------------------------------
    print()
    print("=" * 65)
    print(f"  Already set (no change):            {counts['already_set']}")
    print(f"  Accept pg_trgm suggestion (merge):  {counts['merge_suggested']}")
    print(f"  Merge to curated item:              {counts['merge_curated']}")
    print(f"  Promote as new ingredient:          {counts['new']}")
    print(f"  Merge duplicate to new item:        {counts['new_dup']}")
    print(f"  Skip (packaging/water/junk):        {counts['skip']}")
    total = sum(counts.values()) - counts['already_set']
    print(f"  Total rows classified now:          {total}")
    print("=" * 65)

    if dry_run:
        print("\n[DRY-RUN] CSV not modified.")
        return

    with open(csv_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    print(f"\n[EXECUTE] Updated {csv_path}")


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="Auto-classify review.csv rows.")
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--dry-run", action="store_true", help="Show actions without writing")
    mode.add_argument("--execute", action="store_true", help="Write updated CSV")
    args = parser.parse_args()
    run(dry_run=args.dry_run)


if __name__ == "__main__":
    main()
