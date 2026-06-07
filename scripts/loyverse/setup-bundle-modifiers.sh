#!/usr/bin/env bash
# ============================================================
# One-time setup: Loyverse slot-modifier bundles (×4 / ×8 / ×12)
# See docs/modules/manakish-bundles.md
#
# Creates 12 shared "Bundle Manakish #k" + 3 "Bundle Sauce #k" single-select
# slot lists (options priced at the discounted manakish price), then binds the
# right subset to each bundle item via the loyverse-sync edge function.
#
# NOT idempotent on creation — running twice creates duplicate lists. Run once;
# to re-do, delete the bundle modifier lists in Loyverse first.
#
# Usage:  SUPABASE_ANON_KEY=... ./setup-bundle-modifiers.sh
# Requires: curl, python3. Reads bundle dish ids from v_public_menu (anon).
# ============================================================
set -euo pipefail

PROJECT="${SUPABASE_PROJECT_REF:-qcqgtcsjoacuktcewpvo}"
BASE="https://${PROJECT}.supabase.co"
FN="${BASE}/functions/v1/loyverse-sync"
KEY="${SUPABASE_ANON_KEY:?set SUPABASE_ANON_KEY}"

# Manakish options = discounted, whole-baht price (round(price × 0.85)).
# Sauces are free. Keep in sync with the live KP-FIN-MAN / KP-FIN-SDR rosters.
read -r -d '' MAN_OPTS <<'JSON' || true
[{"name":"Chilli & Cheese","price":50},{"name":"Falafel","price":50},
 {"name":"Olive & Cheese","price":50},{"name":"Pumpkin & Cheese Mix","price":50},
 {"name":"Za'atar","price":50},{"name":"Beef","price":59},
 {"name":"Cheese & Mushroom","price":59},{"name":"Lamb","price":59},
 {"name":"Pumpkin & Goat Cheese","price":59},{"name":"Sujuk","price":59},
 {"name":"Za'atar & Cheese","price":59},{"name":"Truffle & Lamb Signature","price":67},
 {"name":"Lion's Mane Superfood","price":76}]
JSON
read -r -d '' SAUCE_OPTS <<'JSON' || true
[{"name":"Hummus Sauce","price":0},{"name":"Tahini Tamarind Sauce","price":0},
 {"name":"Yogurt Tahini Sauce","price":0}]
JSON

fn() { curl -s -X POST "${FN}?action=$1" -H "Authorization: Bearer ${KEY}" -H "apikey: ${KEY}" -H "Content-Type: application/json" --data @-; }
modid() { python3 -c "import sys,json;print((json.load(sys.stdin).get('modifier') or {}).get('id',''))"; }

# Resolve bundle dish ids from the public menu.
ids_json=$(curl -s "${BASE}/rest/v1/v_public_menu?select=id,product_code&product_code=like.SALE-BUNDLE_MANAKISH_%25" -H "apikey: ${KEY}" -H "Authorization: Bearer ${KEY}")
dish() { python3 -c "import sys,json;print(next(r['id'] for r in json.load(sys.stdin) if r['product_code']=='$1')" <<<"$ids_json"; }
D4=$(dish SALE-BUNDLE_MANAKISH_4); D8=$(dish SALE-BUNDLE_MANAKISH_8); D12=$(dish SALE-BUNDLE_MANAKISH_12)

declare -a M
for i in $(seq 1 12); do
  body=$(python3 -c "import json,sys;print(json.dumps({'name':'Bundle Manakish #$i','min_select':1,'max_select':1,'modifier_options':json.loads(sys.argv[1])}))" "$MAN_OPTS")
  M[$i]=$(echo "$body" | fn create_modifier | modid); echo "Manakish #$i -> ${M[$i]}"
done
declare -a S
for i in 1 2 3; do
  body=$(python3 -c "import json,sys;print(json.dumps({'name':'Bundle Sauce #$i','min_select':1,'max_select':1,'modifier_options':json.loads(sys.argv[1])}))" "$SAUCE_OPTS")
  S[$i]=$(echo "$body" | fn create_modifier | modid); echo "Sauce #$i -> ${S[$i]}"
done

bind() { # $1=dish_id  $2=comma-separated list ids
  python3 -c "import json,sys;print(json.dumps({'dish_id':sys.argv[1],'modifier_ids':sys.argv[2].split(',')}))" "$1" "$2" | fn recreate_item >/dev/null && echo "bound $1"
}
bind "$D4"  "${M[1]},${M[2]},${M[3]},${M[4]},${S[1]}"
bind "$D8"  "${M[1]},${M[2]},${M[3]},${M[4]},${M[5]},${M[6]},${M[7]},${M[8]},${S[1]},${S[2]}"
bind "$D12" "${M[1]},${M[2]},${M[3]},${M[4]},${M[5]},${M[6]},${M[7]},${M[8]},${M[9]},${M[10]},${M[11]},${M[12]},${S[1]},${S[2]},${S[3]}"

echo "Syncing mirror…"; echo '{}' | fn pull_modifiers >/dev/null
echo "Done. Now apply migration 254 (base price 0 + slot min_select 1)."
