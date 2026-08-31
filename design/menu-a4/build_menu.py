#!/usr/bin/env python3
"""
Build the printed A4 menu in "clean style".

The style itself is NOT defined here. It lives in sample-page.html, whose
<style> block and <svg class="defs"> sprite are read at build time and copied
into the output verbatim. Edit the look there, rerun this, and every page
follows. This file only decides *what goes on the page*, never how it looks.

  python3 build_menu.py            -> menu-print.html  (food sections)
  python3 build_menu.py --drinks   -> include Coffee / Smoothies / Juices / Matcha

Data comes from the live database. Nothing about a dish is invented here:
kcal, macros, portion and price are printed as stored, benefit chips are the
website's own rules (shishka-health/src/lib/benefits.js) applied to the dish's
real ingredient list, and the CONTAINS line is derived under the rules in
allergens_for() below.
"""
import argparse, hashlib, json, os, pathlib, re, subprocess, sys, time, urllib.parse, urllib.request
from PIL import Image

PROJECT = "qcqgtcsjoacuktcewpvo"
REST    = f"https://{PROJECT}.supabase.co/rest/v1"
HERE    = pathlib.Path(__file__).parent
CACHE   = HERE / "_cache"

DRINK_SECTIONS = {"☕ Coffee", "🥤 Smoothies", "🧃 Juices", "🍵 Matcha"}

# Per-page dish count. The clean style is built around three.
PER_PAGE = 3

# Dishes that must be read as one family and therefore share a sheet, even when
# that means a fourth row. The four dips sit inside All-Day Breakfast by price
# and were coming out split 2/2 across two pages; the CEO wants them together.
# A run like this gets a page of its own, rendered with .dishes--dense.
FAM_TACOS = {
    "SALE-MANAISH_ZAATAR_GF", "SALE-MANAISH_CHEESE_GF", "SALE-MANAISH_FALAFEL_GF",
    "SALE-MANAISH_PUMPKIN_CHEESE_MIX_GF", "SALE-MANAISH_LAMB_GF",
    "SALE-MANAISH_BEEF_GF", "SALE-MANAISH_SALAMI_GF",
}
FAMILIES = [
    {"SALE-HUMMUS_PLAIN", "SALE-HUMMUS_BEETROOT", "SALE-MUTABAL", "SALE-MUHAMMARA"},
    FAM_TACOS,
]
DENSE_PAGE = 4

# Families pinned to the end of their section instead of anchoring at their
# cheapest member. The CEO placed the Healthy Potato Tacos "in All Day Breakfast
# after toast"; at 69/89 they are the cheapest things in that section, so plain
# price order opens the section with them and puts the toasts (199/270/349) at
# the far end -- the exact inverse of the instruction.
TAIL_FAMILIES = [FAM_TACOS]

# Families that print ONE price for the sheet instead of a price on every row --
# the CEO's "put one price for all", the same call he made on the sauce sheet.
# A family listed here is split into pages by PRICE, not by DENSE_PAGE, because
# a page carrying a single price must not contain a dish that costs something
# else. The seven tacos fall 69 x4 / 89 x3, which is also exactly the Vege/Meat
# split (KP-FIN-MAN-VEG / KP-FIN-MAN-MET) -- the two tiers the CEO set.
#
# The value is the note printed beside the price, keyed by that price. It says
# what the money buys rather than what the dishes are called: the offer is that
# any one of them is the same price. This line is also the only place the family
# is named in print -- the page title is the section and there are no
# subheadings, so without it the seven print as seven unrelated rows.
ONE_PRICE_FAMILIES = [
    (FAM_TACOS, {69: "any vege potato taco",
                 89: "any meat potato taco"}),
]


# The twelve final sauces — the CEO's 2026-08-31 line: six sauces and six
# dressings. Ordered by the colour of the photograph and by nothing else. They
# are all the same money, so price would sort them arbitrarily, and alphabetical
# would be sorting by a word when the guest is choosing by a colour.
#
# HIS LIST WAS THIRTEEN NAMES AND THIS SHEET PRINTS TWELVE. He named both
# "Sumac Lime pomegranate" and "pomegranate molasses", and asked for six
# dressings, not seven. Those two are one sauce: the two photographs in the
# shoot are byte-identical (md5 ce20b7f5...), and PF-SUMAC_DRESSING is the only
# product in nomenclature built on RAW-POMEGRANATE_MOLASSES. Merging them is
# what makes the count come out at the 6 + 6 he asked for.
#
# THREE OF THE TWELVE ARE NEAR-BLACK in the bowl — sumac (15), teriyaki (28),
# sweet chili (55), measured as mean luminance over the centre of each bowl
# against 99-245 for the rest. Left adjacent they read as one blot rather than
# three sauces, so they sit at (0,1) (0,3) (2,0): no dark cell touches another,
# edge or corner. The same rule now applies at the top of the range — the two
# mayos photograph as near-identical white discs (243 and 245) and are split to
# (0,0) and (2,1) so they cannot be mistaken for one bowl printed twice.
#
# Reading order below is left-to-right, four to a row:
#     OLIVE OIL MAYO · SUMAC       · honey mustard · UMAMI
#     strawberry     · mango       · hummus yogurt · tahini vinaigrette
#     SWEET CHILI    · GARLIC MAYO · dynamite      · caesar
#
# `sale` is None where the photograph exists but no sale row does. `prep` names
# the kitchen's PF row, which is where the energy and the allergens come from
# when the sale row cannot supply them — a prep row is stated per kilo, so per
# 50 g is that over 20. A sale row always wins where it has the figure.
#
# FOUR CELLS HAVE NO PRODUCT BEHIND THEM AT ALL — olive oil mayo, garlic mayo,
# dynamite sriracha, honey mustard. They are the four bowls photographed for
# this list and never built: no SALE row, no PF row, no recipe, so no cost and
# no energy figure. Their cells print the name, the photograph and the 30 THB
# and leave the kcal line blank, because a made-up calorie count is worse than a
# missing one. The build says so out loud every run. They cannot be rung up on
# the till until somebody writes the recipes — see MC task 697d47ac.
SAUCES = [
    ("olive-oil-mayo.webp",         None,                         "Olive Oil Mayo",            None),
    ("sumac-lime-pomegranate.webp", None,                         "Sumac, Lime & Pomegranate", "PF-SUMAC_DRESSING"),
    ("honey-mustard.webp",          None,                         "Honey Mustard",             None),
    ("teriyaki.webp",               None,                         "Umami",                     "PF-TERIYAKI_CLEAN"),

    ("strawberry.webp",             "SALE-SAUCE_STRAWBERRY",      None,                        None),
    ("mango.webp",                  "SALE-SAUCE_MANGO",           None,                        None),
    ("hummus.webp",                 "SALE-SAUCE_HUMMUS",          "Hummus Yogurt",             None),
    ("tahini-vinaigrette.webp",     "SALE-SAUCE_TAHINI_TAMARIND", None,                        None),

    ("sweet-chili.webp",            None,                         "Thai Sweet Chili",          None),
    ("garlic-mayo.webp",            None,                         "Garlic Mayo",               None),
    ("dynamite-sriracha.webp",      None,                         "Dynamite Sriracha",         None),
    ("caesar.webp",                 "SALE-SAUCE_CAESAR",          None,                        None),
]
SAUCE_DIR = "photos/sauces"

# One price for any sauce — the CEO's call. Seven of the twelve already carry it
# in nomenclature; the rest have no sale row, or a null price, and this is what
# they print until those rows exist. The build shouts if a stored price ever
# disagrees, so the sheet cannot quietly go out of step with the till.
SAUCE_PRICE = 30
# And one pour. The twelve energy figures are only comparable because they are
# all quoted over the same 50 g, which is why the cell prints the gramme too.
SAUCE_PORTION_G = 50


# ─────────────────────────────────────────────────────────── data ────────────

def service_key():
    return subprocess.run(
        ["security", "find-generic-password", "-s", "SUPABASE_SERVICE_ROLE_KEY", "-w"],
        capture_output=True, text=True, check=True).stdout.strip()


def get(path, key):
    req = urllib.request.Request(f"{REST}/{path}",
                                 headers={"apikey": key, "Authorization": f"Bearer {key}"})
    with urllib.request.urlopen(req) as r:
        return json.load(r)


def fetch_dishes(key, include_drinks):
    cols = ("id,product_code,name,customer_description,customer_ingredients,image_url,"
            "price,calories,protein,carbs,fat,portion_size,portion_unit,"
            "section_name,section_sort_order,display_order")
    rows = get(f"menu_public?is_web_visible=eq.true&select={cols}", key)
    # Allergens and the translations live on nomenclature, not on the public
    # view. Ask for these ids only: nomenclature is past PostgREST's 1000-row
    # response cap, so an unfiltered select returns a truncated page and the
    # dishes that fall off it silently lose their allergen list.
    ids = ",".join(r["id"] for r in rows)
    extra = {r["id"]: r for r in get(
        "nomenclature?select=id,allergens,customer_description_ru,customer_description_th,"
        f"translation_reviewed_at&id=in.({ids})", key)}
    if len(extra) != len(rows):
        sys.exit(f"nomenclature returned {len(extra)} rows for {len(rows)} dishes")
    for r in rows:
        r.update({k: v for k, v in extra.get(r["id"], {}).items() if k != "id"})
    if not include_drinks:
        rows = [r for r in rows if r.get("section_name") not in DRINK_SECTIONS]
    rows.sort(key=sort_key_for(rows))
    return rows


def sort_key_for(rows):
    """Sections read cheapest first, with the FAMILIES kept in one block.

    A guest scanning a page should meet the entry price before the top of the
    range. Two things are allowed to break strict price order:

    - the Rice Paper Rolls, a family of four sold as a set of two, read as a
      block and stay together after the wraps rather than interleaving;
    - a FAMILIES run, which sorts at its cheapest member's price. The four dips
      tie at 169 with four breakfast plates and were being interleaved with
      them alphabetically — that is what split them across two sheets. Anchored,
      they sit as a run and paginate() can lift them onto a page of their own.
    """
    anchor = {}
    for i, fam in enumerate(FAMILIES, 1):
        prices = [float(r.get("price") or 0)
                  for r in rows if r.get("product_code") in fam]
        if prices:
            # A TAIL family anchors past every real price so the run lands at the
            # end of its section rather than at its cheapest member's position.
            anchor[i] = (float("inf") if any(fam is t for t in TAIL_FAMILIES)
                         else min(prices))

    def key(r):
        grouped = 1 if "rice paper roll" in (r["name"] or "").lower() else 0
        rank = next((i for i, fam in enumerate(FAMILIES, 1)
                     if r.get("product_code") in fam), 0)
        price = float(r.get("price") or 0)
        return (r.get("section_sort_order") or 999, grouped,
                anchor.get(rank, price), rank, price, r["name"])
    return key


def fetch_sauces(key, warnings):
    """The sauce sheet reads nomenclature directly, not menu_public.

    Only half the twelve are web-visible, so the public view would hand back six
    and the sheet would quietly become a sheet of six. Reading nomenclature by
    product_code is what makes the missing ones visible as missing.
    """
    codes = [c for _, c, _, _ in SAUCES if c] + [p for _, _, _, p in SAUCES if p]
    rows = {r["product_code"]: r for r in get(
        "nomenclature?select=product_code,name,customer_short_name,price,calories,"
        "portion_size,allergens,customer_ingredients,customer_description"
        f"&product_code=in.({','.join(codes)})", key)}
    missing = sorted(set(codes) - set(rows))
    if missing:
        sys.exit(f"sauce product_codes not found in nomenclature: {missing}")

    out = []
    for f, code, label, prep in SAUCES:
        s = dict(rows[code]) if code else {"product_code": None}
        s["_file"] = f"{SAUCE_DIR}/{f}"
        s["_label"] = label or s.get("customer_short_name") or s.get("name")
        if not (HERE / s["_file"]).exists():
            sys.exit(f"sauce photo missing: {s['_file']}")
        # Hashed, not compared by name: two cells were shipping the same bowl
        # under two filenames, which no path check would ever have caught.
        s["_sig"] = hashlib.md5((HERE / s["_file"]).read_bytes()).hexdigest()

        # Allergens. The sale row first, then the prep row — a sauce with no
        # sale row still has a recipe, and the recipe is where the soy sauce and
        # the parmesan are. Reading only the sale row is how Teriyaki came out
        # of the last build with no gluten warning on it at all, which is the
        # one kind of blank on this page that is not merely untidy.
        s["_allergens"] = allergens_for(s) if s.get("allergens") is not None else []
        if not s["_allergens"] and prep:
            s["_allergens"] = allergens_for(rows[prep])

        # Price. The house number stands unless the till says otherwise, and if
        # the till says something else that is a fault to fix, not a number to
        # print quietly — a menu and a POS disagreeing is how a guest gets
        # charged something the card in their hand does not say.
        stored = s.get("price")
        if stored is not None and round(float(stored)) != SAUCE_PRICE:
            sys.exit(f"sauce priced {stored} in nomenclature, sheet says "
                     f"{SAUCE_PRICE}: {s['_label']} ({code})")
        if code and stored is None:
            warnings.append(f"sauce has a sale row but no price in it, "
                            f"printing {SAUCE_PRICE}: {s['_label']} ({code})")
        if not code:
            warnings.append(f"sauce has no sale row at all, printing "
                            f"{SAUCE_PRICE}: {s['_label']} ({f})")

        # Energy per 50 g. From the sale row when it has one — those are already
        # stated at the 50 g pour. Otherwise from the kitchen's prep row, which
        # is per kilo. Where neither exists the cell prints nothing: a made-up
        # calorie count is worse than a missing one.
        s["_kcal"] = None
        if s.get("calories") is not None:
            portion = float(s.get("portion_size") or 0)
            if round(portion) != SAUCE_PORTION_G:
                sys.exit(f"sauce sale row is stated per {portion} g, not "
                         f"{SAUCE_PORTION_G}: {s['_label']} ({code})")
            s["_kcal"] = round(float(s["calories"]))
        elif prep and rows[prep].get("calories") is not None:
            s["_prep"] = prep
            s["_kcal"] = round(float(rows[prep]["calories"]) * SAUCE_PORTION_G / 1000)
            warnings.append(f"sauce energy derived from the prep row {prep}: "
                            f"{s['_label']} = {s['_kcal']} kcal / {SAUCE_PORTION_G} g")
        else:
            warnings.append(f"sauce has no energy figure anywhere, cell prints "
                            f"none: {s['_label']} ({f})")
        out.append(s)

    # Two cells that share a photograph, or share the recipe their figures come
    # from, are two names for one sauce until someone proves otherwise. The
    # sheet still prints both, because dropping a line off the CEO's list is not
    # the build's call — but it never lets the duplication pass in silence.
    for field, what in (("_sig", "photograph"), ("_prep", "recipe")):
        seen = {}
        for s in out:
            if s.get(field):
                seen.setdefault(s[field], []).append(s["_label"])
        for value, labels in seen.items():
            if len(labels) > 1:
                warnings.append(f"two sauces share one {what} ({value}) and so "
                                f"print the same figures: {' / '.join(labels)}")
    return out


# ────────────────────────────────────────────────────────── copy ─────────────

# Sentences that are metadata rather than description. The allergen sentence is
# dropped because the page prints a dedicated CONTAINS line that says the same
# thing far more legibly; leaving both in makes the copy read like a label.
_DROP = [
    re.compile(r"\s*Contains\s+[^.]*\.", re.I),
    re.compile(r"\s*Nutrition values are calculated[^.]*\.", re.I),
]


def clean_copy(text):
    s = (text or "").strip()
    for rx in _DROP:
        s = rx.sub("", s)
    return re.sub(r"\s+", " ", s).strip()


# ───────────────────────────────────────────────────── allergens ─────────────

# Only gluten, milk and peanuts are ever named — the CEO's call. That is
# narrower than the regulated set, so the footer says so in words and this is
# never presented as a complete allergen statement.
#
# Three sources, unioned, and the union only ever GROWS the warning:
#
#   1. nomenclature.allergens — the stored list. Necessary but not sufficient:
#      all six Chocolate dishes have an empty list while three of them state
#      peanuts, gluten or milk in their own ingredients.
#   2. An explicit "Contains x, y and z." sentence. Human-written, so it is the
#      highest-confidence source we have.
#   3. A keyword scan of the INGREDIENT list and the dish NAME only — never the
#      marketing description, because that is where "creamy tahini" and "silky
#      cream" live and neither is dairy.
#
# The keyword set is deliberately small and high-precision. Traps it handles:
# "gluten-free" must not imply gluten, "peanut butter" is peanut and not milk,
# "coconut/almond/oat milk" is not dairy, and rice noodles and rice paper are
# not wheat.
_GLUTEN_WORDS = r"(wheat|barley|rye|bread|croutons?|flour|pita|sourdough|multigrain|19-grain|semolina|bulgur|couscous|oats?)"
_MILK_WORDS   = r"(cheese|parmesan|feta|yogh?urt|labneh|mozzarella|cheddar|emmental|cream cheese|ghee)"
_PLANT_MILK   = r"(coconut|almond|oat|soy|soya|rice|cashew|hemp)"


def _scan(text):
    """Keyword pass over ingredient/name text. Returns a set."""
    t = (text or "").lower()
    found = set()

    # gluten: named grains, plus a bare "gluten" that is not "gluten-free"
    if re.search(r"\b" + _GLUTEN_WORDS, t):
        found.add("gluten")
    if re.search(r"\bgluten\b(?!\s*[-–]?\s*free)", t):
        found.add("gluten")

    # milk: dairy nouns, plus "milk" that is not a plant milk, plus "butter"
    # that is not peanut/nut butter
    if re.search(r"\b" + _MILK_WORDS, t):
        found.add("milk")
    if re.search(r"(?<!\w)(?!" + _PLANT_MILK + r"\s+)milk\b", t) and \
       not re.search(r"\b" + _PLANT_MILK + r"\s+milk\b", t.replace(",", " ")) or \
       re.search(r"(?:^|[,.]\s*)milk\b", t):
        found.add("milk")
    if re.search(r"\bbutter\b", t) and not re.search(r"\b(peanut|nut|almond|cashew)\s+butter\b", t):
        found.add("milk")

    if re.search(r"\bpeanuts?\b", t):
        found.add("peanut")
    return found


_CONTAINS_RX = re.compile(r"contains\s+([^.]*)\.", re.I)


def _from_contains(text):
    """Parse a human-written 'Contains x, y and z.' sentence."""
    found = set()
    for m in _CONTAINS_RX.finditer(text or ""):
        s = m.group(1).lower()
        if re.search(r"\bglutens?\b", s):            found.add("gluten")
        if re.search(r"\b(milk|dairy|lactose)\b", s): found.add("milk")
        if re.search(r"\bpeanuts?\b", s):             found.add("peanut")
    return found


def allergens_for(dish):
    stored = {a.lower() for a in (dish.get("allergens") or [])}
    out = set()
    if stored & {"gluten", "wheat"}:            out.add("gluten")
    if stored & {"milk", "dairy", "lactose"}:   out.add("milk")
    if stored & {"peanut", "peanuts"}:          out.add("peanut")

    out |= _from_contains(dish.get("customer_ingredients"))
    out |= _from_contains(dish.get("customer_description"))
    out |= _scan(dish.get("customer_ingredients"))
    out |= _scan(dish.get("name"))

    order = ["gluten", "milk", "peanut"]
    label = {"gluten": "gluten", "milk": "milk", "peanut": "peanuts"}
    return [label[a] for a in order if a in out]


def allergen_evidence(dish):
    """Why each allergen fired — for the review table, so a human can check."""
    ev = {}
    stored = {a.lower() for a in (dish.get("allergens") or [])}
    for src, name in ((stored, "stored list"),
                      (_from_contains(dish.get("customer_ingredients")), "ingredients 'Contains'"),
                      (_from_contains(dish.get("customer_description")), "description 'Contains'"),
                      (_scan(dish.get("customer_ingredients")), "ingredient keywords"),
                      (_scan(dish.get("name")), "dish name")):
        for a in src:
            a = {"wheat": "gluten", "dairy": "milk", "lactose": "milk", "peanuts": "peanut"}.get(a, a)
            if a in ("gluten", "milk", "peanut"):
                ev.setdefault(a, []).append(name)
    return ev


# ────────────────────────────────────────────────────── benefits ─────────────

# Ported verbatim from shishka-health/src/lib/benefits.js so the printed page
# and the website say the same thing about the same dish. Order is priority.
BENEFITS = [
    ("caffeine", "Energy & Focus", "coffee", "honey",
     ["espresso", "coffee", "matcha"]),
    ("omega3", "Omega-3", "waves", "green",
     ["tuna", "salmon", "sardine", "mackerel", "walnut", "chia"]),
    ("bvitamins", "Vitamin B12", "bolt", "honey",
     ["shrimp", "tuna", "chicken", "beef", "lamb", "sujuk", "egg"]),
    ("iron", "Iron", "beef", "red",
     ["beef", "lamb", "sujuk", "spinach"]),
    ("magnesium", "Magnesium", "leaf", "purple",
     ["tahini", "sesame", "chia", "spinach", "cacao", "cocoa", "dark chocolate",
      "almond", "cashew", "pumpkin seed", "sunflower seed"]),
    ("vitaminc", "Vitamin C", "shield", "honey",
     ["mango", "orange", "guava", "lemon", "lime", "kiwi", "strawberry",
      "passion fruit", "red pepper", "bell pepper", "pineapple", "blueberry"]),
    ("vitamina", "Vitamin A", "sprout", "honey",
     ["carrot", "pumpkin", "mango", "apricot", "spinach"]),
    ("fiber", "Fibre", "wheat", "green",
     ["chickpea", "hummus", "beetroot", "whole wheat", "oat", "banana",
      "lettuce", "cucumber", "carrot", "eggplant", "corn", "apple", "kiwi",
      "date", "seed"]),
    ("calcium", "Calcium", "bone", "purple",
     ["cheese", "milk", "yogurt", "tahini", "sesame", "almond"]),
    ("healthyfats", "Healthy Fats", "nut", "green",
     ["avocado", "olive oil", "almond", "cashew", "walnut", "peanut", "tahini",
      "sesame", "coconut milk", "seed"]),
    ("antioxidants", "Antioxidants", "sparkle", "purple",
     ["matcha", "cacao", "cocoa", "dark chocolate", "turmeric", "berry",
      "blueberry", "strawberry", "pomegranate", "espresso", "coffee",
      "beetroot", "guava"]),
    ("potassium", "Electrolytes", "heart", "green",
     ["coconut water", "coconut", "banana", "avocado", "potato"]),
    ("antiinflam", "Anti-Inflammatory", "flame", "red",
     ["ginger", "turmeric"]),
]

MAX_BENEFITS = 6

# Only these have a mark in the sprite; the rest fall back to the sparkle.
ICON_FOR = {"shield": "i-shield", "sparkle": "i-sparkle", "wheat": "i-wheat",
            "nut": "i-nut", "droplet": "i-droplet", "bolt": "i-bolt",
            "bone": "i-bone", "leaf": "i-nut", "heart": "i-droplet",
            "sprout": "i-wheat", "beef": "i-bolt", "waves": "i-droplet",
            "flame": "i-bolt", "coffee": "i-bolt"}

# Complete protein = all nine essential amino acids in one dish. Quinoa, soy and
# any animal protein qualify; this is a compositional fact, not a claim about
# quantity, so it is safe to print. Creatine is only ever in real meat/fish.
_COMPLETE = ["quinoa", "chicken", "beef", "lamb", "shrimp", "tuna", "salmon",
             "egg", "tofu", "soy", "cheese", "yogurt", "crab", "fish"]
_CREATINE = ["beef", "lamb", "chicken", "shrimp", "tuna", "salmon", "crab", "fish"]


def benefits_for(dish):
    text = " ".join(filter(None, [dish.get("customer_ingredients"),
                                  dish.get("customer_description"),
                                  dish.get("name")])).lower()
    out = []
    p = dish.get("protein")
    p = float(p) if p is not None else None
    if p is not None and p >= 20:
        out.append(dict(label="High Protein", icon="i-droplet", tone="red", val=f"{round(p)} g"))
    elif p is not None and p >= 10:
        out.append(dict(label="Protein", icon="i-droplet", tone="red", val=f"{round(p)} g"))

    if text and any(re.search(r"\b" + re.escape(k), text) for k in _COMPLETE):
        out.append(dict(label="Complete protein", icon="i-atom", tone="red", val="9 EAA"))
    if text and any(re.search(r"\b" + re.escape(k), text) for k in _CREATINE):
        out.append(dict(label="Natural creatine", icon="i-dumbbell", tone="red", val=None))

    for slug, label, icon, tone, keys in BENEFITS:
        if len(out) >= MAX_BENEFITS:
            break
        if any(re.search(r"\b" + re.escape(k), text) for k in keys):
            out.append(dict(label=label, icon=ICON_FOR.get(icon, "i-sparkle"), tone=tone, val=None))
    return out[:MAX_BENEFITS]


# ─────────────────────────────────────────────────────── profile ─────────────

def profile_for(dish, n_boosts):
    """The one-word verdict that ends the macro strip. First match wins.
    Returns (css_class, word) or None when the dish matches no rule — those are
    reported rather than guessed at."""
    p, kcal = dish.get("protein"), dish.get("calories")
    if p is not None and float(p) >= 20:
        return ("cell--body", "Bodybuilder")
    if n_boosts >= 4:
        return ("cell--nutri", "Nutritious +")
    if kcal is not None and int(kcal) <= 350:
        return ("cell--light", "Light")
    return None


# ───────────────────────────────────────────────────── photo fit ─────────────

# Cutouts are square canvases but are not cropped alike: the food fills 78% of
# some frames and 93% of others, so object-fit alone renders one bowl a fifth
# larger than its neighbour. Rescale each to a common fill.
TARGET_FILL = 0.78


# Print-only photo substitutions, keyed by product_code. The Rice Paper Rolls
# are sold two to a portion but every stored cutout shows one, so the printed
# page pairs the roll with itself (photos/rolls-*-x2.png, built from the stored
# image). Only the print artwork is overridden; the database still holds the
# single-roll shot the website uses.
PHOTO_OVERRIDE = {
    "SALE-SUMMER_ROLLS_VEGGIE":    "photos/rolls-veggie-x2.png",
    "SALE-SUMMER_ROLLS_CHICKEN":   "photos/rolls-chicken-x2.png",
    "SALE-SUMMER_ROLLS_TUNA_CORN": "photos/rolls-corn-x2.png",
    "SALE-SUMMER_ROLLS_SHRIMP":    "photos/rolls-shrimp-x2.png",
}


def photo_src(d):
    o = PHOTO_OVERRIDE.get(d.get("product_code"))
    if o and (HERE / o).exists():
        return o
    return d.get("image_url")


def fit_scale(url):
    if not url:
        return None, None
    if not url.startswith("http"):
        return _fit_from(HERE / url)
    CACHE.mkdir(exist_ok=True)
    # Key on the whole URL, not its last segment: every dish's cutout is named
    # "customer.png" and only the UUID directory above it differs, so a
    # basename key silently serves one dish's photo for another's alpha box.
    name = hashlib.sha1(url.encode()).hexdigest()[:16] + ".png"
    path = CACHE / name
    if not path.exists():
        # Download to a sidecar and only rename once the bytes decode as a whole
        # image. A reset connection yields a file that opens fine and only fails
        # on the pixel read, which a later run would otherwise trust as cached.
        tmp = path.with_suffix(path.suffix + ".part")
        for attempt in range(3):
            try:
                urllib.request.urlretrieve(url, tmp)
                Image.open(tmp).load()
                tmp.replace(path)
                break
            except Exception as e:
                tmp.unlink(missing_ok=True)
                if attempt == 2:
                    print(f"  ! photo download failed: {url} ({e})", file=sys.stderr)
                    return None, None
                time.sleep(1 + attempt)
    return _fit_from(path, unlink_on_error=True)


def _fit_from(path, unlink_on_error=False):
    try:
        im = Image.open(path)
        im.load()
    except Exception as e:
        print(f"  ! photo unreadable: {path.name} ({e})", file=sys.stderr)
        if unlink_on_error:
            path.unlink(missing_ok=True)
        return None, None
    if im.mode not in ("RGBA", "LA"):
        # No alpha: the photo IS the frame, so there is nothing to normalise.
        return 1.0, None
    alpha = im.getchannel("A")
    box = alpha.getbbox()
    if not box:
        return 1.0, None
    fill = max((box[2] - box[0]) / im.width, (box[3] - box[1]) / im.height)
    if fill <= 0:
        return 1.0, None
    return round(TARGET_FILL / fill, 3), round(fill, 3)


def section_key(section_name):
    """'🥗 Salads' -> 'Salads'."""
    return re.sub(r"^[^\w]+", "", section_name or "").strip()


# ─────────────────────────────────────────────────────── render ──────────────

def esc(s):
    return (str(s or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))


def num(v, nd=1):
    if v is None:
        return "—"
    f = float(v)
    return str(int(round(f))) if nd == 0 else f"{f:.{nd}f}"


def dish_html(d, warnings, priced=True):
    """One dish row. priced=False on a sheet that prints its price once, above.

    The row still carries its kcal and its allergen warning — those differ dish
    to dish. Only the chip that would have been identical four times down the
    margin is dropped, and it is not dropped from the page, it moves to the top.
    """
    scale, fill = d["_fit"]
    style = f' style="--fit:{scale}"' if scale and abs(scale - 1) > 0.01 else ""
    src = photo_src(d)
    # A dish with no photograph anywhere gets no photo column at all. Printing
    # the empty 64mm box instead leaves a hole the reader reads as a mistake,
    # and the copy is better off with the width.
    photo = (f'<div class="photo"><img src="{esc(src)}" alt="{esc(d["name"])}"{style}></div>'
             if src else "")

    boosts = d["_boosts"]
    pills = "".join(
        f'<span class="boost boost--{b["tone"]}"><span class="boost__icon">'
        f'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
        f'stroke-linecap="round" stroke-linejoin="round"><use href="#{b["icon"]}"/></svg></span>'
        f'{esc(b["label"])}'
        + (f'<span class="boost__val">{esc(b["val"])}</span>' if b["val"] else "")
        + "</span>"
        for b in boosts)

    prof = d["_profile"]
    prof_cell = (f'<div class="cell cell--profile {prof[0]}"><span class="v">{esc(prof[1])}</span></div>'
                 if prof else "")

    loc = ""
    if d.get("customer_description_ru"):
        loc += f'<p class="loc loc--ru">{esc(d["customer_description_ru"])}</p>'
    if d.get("customer_description_th"):
        loc += f'<p class="loc loc--th">{esc(d["customer_description_th"])}</p>'

    al = d["_allergens"]
    contains = ("" if not al else
                '<p class="contains"><b>Contains</b>'
                + "".join(f"<em>{esc(a)}</em>" for a in al) + "</p>")

    copy = clean_copy(d.get("customer_description"))
    if not copy:
        warnings.append(f"no description: {d['name']} ({d['product_code']})")

    price_chip = ("" if not priced else
                  f'\n            <div class="stat stat--price">'
                  f'<span class="v">{num(d.get("price"), 0)}</span>'
                  f'<span class="k">THB</span></div>')

    return f'''      <article class="dish">
        {photo}
        <div class="info">
          <h2 class="name">{esc(d["name"])}</h2>
          <p class="copy">{esc(copy)}</p>
          {loc}
          <div class="spacer"></div>
          <div class="boosts"><div class="pills">{pills}</div></div>
          <div class="macros">
            <div class="cell cell--portion"><span class="v">{num(d.get("portion_size"), 0)}</span><span class="k">Portion {esc(d.get("portion_unit") or "g")}</span></div>
            <div class="cell"><span class="v">{num(d.get("protein"))}</span><span class="k">Protein g</span></div>
            <div class="cell"><span class="v">{num(d.get("carbs"))}</span><span class="k">Carbs g</span></div>
            <div class="cell"><span class="v">{num(d.get("fat"))}</span><span class="k">Fat g</span></div>{prof_cell}
          </div>
          <div class="meta">
            <div class="stat stat--kcal"><span class="v">{num(d.get("calories"), 0)}</span><span class="k">kcal</span></div>
            {contains}{price_chip}
          </div>
        </div>
      </article>
'''


def balance(ds):
    """Split a section into pages of at most PER_PAGE, as evenly as possible.

    Slicing three at a time leaves the remainder alone on the last sheet — the
    seven Potato Tacos came out 3/3/1 and that single dish stretched to fill a
    whole A4. Spreading the same seven as 3/2/2 costs no extra page and no page
    ever carries fewer than two.
    """
    n = len(ds)
    if n <= PER_PAGE:
        return [ds]
    k = -(-n // PER_PAGE)
    out, i = [], 0
    for p in range(k):
        take = -(-(n - i) // (k - p))
        out.append(ds[i:i + take])
        i += take
    return out


def split_family(run, fam):
    """Cut one family's run into sheets. Yields (dishes, dense, lede) triples.

    A ONE_PRICE family is cut where the price changes, so that every sheet it
    produces contains exactly one price and can therefore print it once at the
    top. Any other family is cut at DENSE_PAGE, as before.
    """
    notes = next((n for f, n in ONE_PRICE_FAMILIES if f is fam), None)
    if notes:
        tiers, out = [], []
        for d in run:
            p = round(float(d.get("price") or 0))
            if not tiers or tiers[-1][0] != p:
                tiers.append((p, []))
            tiers[-1][1].append(d)
        for price, chunk in tiers:
            if price not in notes:
                sys.exit(f"one-price family has an unlabelled tier: {price} THB "
                         f"({', '.join(d['product_code'] for d in chunk)})")
            # Dense only when the sheet is actually full, same rule as below.
            for i in range(0, len(chunk), DENSE_PAGE):
                part = chunk[i:i + DENSE_PAGE]
                out.append((part, len(part) == DENSE_PAGE, (price, notes[price])))
        return out
    # Dense sizing only where the sheet is actually full. A short tail chunk
    # rendered dense keeps the tight cards AND leaves the bottom of the page
    # empty — a 4 + 3 split came out with a third of the second sheet blank.
    return [(run[i:i + DENSE_PAGE], len(run[i:i + DENSE_PAGE]) == DENSE_PAGE, None)
            for i in range(0, len(run), DENSE_PAGE)]


def paginate(ds):
    """Lay one section out as pages, keeping declared families on one sheet.

    Yields (dishes, dense, lede) triples. A FAMILIES run is lifted out of the
    price order it happens to fall in and given a page of its own; what sits
    before and after it is balanced as usual. Pulling the run out costs no extra
    sheet unless the run itself needs one — the four dips split the eleven
    All-Day Breakfast dishes 4 + 4 + 3, the same four pages the plain split used.
    """
    codes = [d.get("product_code") for d in ds]
    for fam in FAMILIES:
        idx = [i for i, c in enumerate(codes) if c in fam]
        # Only honour a family that is present in full and already contiguous.
        # A partial or interleaved run means the section is not what this table
        # was written against, and reordering it silently would be worse than
        # printing it in plain price order.
        if len(idx) != len(fam) or idx != list(range(idx[0], idx[-1] + 1)):
            continue
        a, b = idx[0], idx[-1] + 1
        out = []
        if a:
            out += paginate(ds[:a])
        out += split_family(ds[a:b], fam)
        if b < len(ds):
            out += paginate(ds[b:])
        return out
    return [(chunk, False, None) for chunk in balance(ds)]


def page_frame(title, main, page_no):
    """The chrome every page shares: logo, kitchen denials, section name, footer.

    Kept in one place so a new kind of page (the sauce sheet) cannot drift from
    the dish pages — the header rule and the allergen footer are promises the
    whole document makes, not decoration a layout gets to reinterpret.
    """
    return f'''  <div class="page">
    <header class="head">
      <img src="../labels/shishka-logo-color.png" alt="Shishka Healthy Kitchen">
      <div class="rule">
        <div class="rule__pair">
          <span class="rule__item"><svg class="rule__ico"><use href="#r-oil"/></svg>No seed oils</span>
          <span class="rule__item"><svg class="rule__ico"><use href="#r-msg"/></svg>No MSG</span>
        </div>
      </div>
      <div class="title"><span>{esc(title)}</span></div>
    </header>
    <div class="body">
{main}    </div>
    <footer class="foot">
      <div class="brand">shishka.health</div>
      <div class="note">We flag gluten, milk &amp; peanuts — for any other allergy please ask our team before ordering</div>
      <div class="pg">{page_no:02d}</div>
    </footer>
  </div>
'''


def lede_html(cls, price, note):
    """One price, said once, above the block it governs.

    Shared by the sauce sheet and the one-price dish sheets so the two cannot
    drift: it is the same promise made about a set, and a guest who has seen it
    on page 09 should recognise it on page 14 without re-reading it.
    """
    return (f'        <p class="{cls}">'
            f'<span class="price"><span class="v">{price}</span>'
            f'<span class="k">THB</span></span>'
            f'<span class="note">{esc(note)}</span></p>\n')


def page_html(section, dishes, page_no, warnings, dense=False, lede=None):
    rows = "".join(dish_html(d, warnings, priced=lede is None) for d in dishes)
    cls = "dishes dishes--dense" if dense else "dishes"
    head = "" if lede is None else lede_html("dishes__lede", *lede)
    return page_frame(section_key(section),
                      f'      <main class="{cls}">\n{head}{rows}      </main>\n', page_no)


def sauce_html(s):
    al = s["_allergens"]
    contains = ("" if not al else
                '<p class="contains"><b>Contains</b>'
                + "".join(f"<em>{esc(a)}</em>" for a in al) + "</p>")
    # The line is held even when there is no figure, so the CONTAINS warnings of
    # the twelve cells still land on one line across each row.
    kcal = (f'<div class="kcal">{s["_kcal"]} kcal</div>'
            if s["_kcal"] is not None else '<div class="kcal">&nbsp;</div>')
    return f'''          <figure class="sauce">
            <img src="{esc(s["_file"])}" alt="{esc(s["_label"])}">
            <figcaption class="name">{esc(s["_label"])}</figcaption>
            {kcal}
            {contains}
          </figure>
'''


def sauce_page_html(sauces, page_no):
    # One price, once, above the grid — see .sauces__lede in sample-page.html.
    cells = "".join(sauce_html(s) for s in sauces)
    main = (f'      <main class="sauces">\n'
            + lede_html("sauces__lede", SAUCE_PRICE,
                        f"any sauce · per {SAUCE_PORTION_G} g pour")
            + f'        <div class="sauces__grid">\n{cells}        </div>\n'
            f'      </main>\n')
    return page_frame("Sauces & Dressings", main, page_no)


def read_style():
    """Pull the clean style out of sample-page.html — one source of truth."""
    src = (HERE / "sample-page.html").read_text()
    style = re.search(r"<style>.*?</style>", src, re.S)
    defs  = re.search(r'<svg class="defs".*?</svg>', src, re.S)
    head  = re.search(r"<link href=\"https://fonts\.googleapis[^>]*>", src)
    if not (style and defs and head):
        sys.exit("sample-page.html: could not find <style>, defs sprite or font link")
    return style.group(0), defs.group(0), head.group(0)


def write_html(out, style, defs, fontlink, body):
    out.write_text(f'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Shishka — printed menu</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
{fontlink}
{style}
<style>
  /* Multi-page: the sample is one .page, here they stack and each breaks. */
  body{{ background:#e9e9e9; padding:8mm 0; }}
  .page{{ margin:0 auto 8mm; box-shadow:0 1mm 4mm rgba(0,0,0,.18); }}
  @media print{{ body{{ padding:0; background:#fff; }}
                 .page{{ margin:0; box-shadow:none; page-break-after:always; }} }}
</style>
</head>
<body>
{defs}
{body}</body>
</html>
''')


def report(warnings):
    if warnings:
        print(f"\n  {len(warnings)} data gaps:")
        for w in warnings:
            print(f"    {w}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--drinks", action="store_true", help="include the four drink sections")
    ap.add_argument("--sauce-sheet", action="store_true",
                    help="replace the Sauces & Dressings dish pages with the 12-up sheet")
    ap.add_argument("--only-sauces", action="store_true",
                    help="emit the sauce sheet alone (proof page)")
    ap.add_argument("-o", "--out", default="menu-print.html")
    args = ap.parse_args()

    key = service_key()
    warnings = []

    if args.only_sauces:
        style, defs, fontlink = read_style()
        write_html(HERE / args.out, style, defs, fontlink,
                   sauce_page_html(fetch_sauces(key, warnings), 1))
        print(f"sauce sheet -> {args.out}")
        report(warnings)
        return

    dishes = fetch_dishes(key, args.drinks)
    print(f"{len(dishes)} dishes")

    no_profile, unreviewed = [], 0
    for d in dishes:
        d["_boosts"] = benefits_for(d)
        d["_profile"] = profile_for(d, len(d["_boosts"]))
        d["_allergens"] = allergens_for(d)
        d["_fit"] = fit_scale(photo_src(d))
        if not d["_profile"]:
            no_profile.append(d)
        if not photo_src(d):
            warnings.append(f"no photo: {d['name']} ({d['product_code']})")
        if (d.get("customer_description_ru") or d.get("customer_description_th")) \
                and not d.get("translation_reviewed_at"):
            unreviewed += 1

    # Pages never mix sections: a printed menu is browsed by section, and a page
    # that starts in Wraps and ends in Tacos cannot be reprinted independently.
    pages, order = [], []
    for d in dishes:
        if not order or order[-1][0] != d["section_name"]:
            order.append((d["section_name"], []))
        order[-1][1].append(d)
    sauces = fetch_sauces(key, warnings) if args.sauce_sheet else None
    for section, ds in order:
        # The sauce sheet stands in for the whole section, dish rows and all —
        # it carries four sauces the section has never been able to show.
        if sauces and section_key(section) == "Sauces & Dressings":
            pages.append((section, sauces, None, None))
            continue
        for chunk, dense, lede in paginate(ds):
            pages.append((section, chunk, dense, lede))

    style, defs, fontlink = read_style()
    body = "".join(
        sauce_page_html(ds, n) if dense is None
        else page_html(s, ds, n, warnings, dense, lede)
        for n, (s, ds, dense, lede) in enumerate(pages, 1))
    out = HERE / args.out
    write_html(out, style, defs, fontlink, body)

    print(f"{len(pages)} pages -> {out.name}")
    by_section = {}
    for s, ds, _, _ in pages:
        by_section[s] = by_section.get(s, 0) + 1
    for s, n in by_section.items():
        print(f"  {s}: {n} page(s)")
    if unreviewed:
        print(f"\n  {unreviewed} dishes carry UNREVIEWED machine translations")
    if no_profile:
        print(f"\n  {len(no_profile)} dishes match no profile rule "
              f"(>350 kcal, <20 g protein, <4 boosts) — strip prints 4 cells:")
        for d in no_profile:
            print(f"    {d['name']}: {d.get('calories')} kcal, "
                  f"{d.get('protein')} g protein, {len(d['_boosts'])} boosts")
    report(warnings)

    # Allergen review table — so the determination can be checked by a human
    # even though the CEO chose to print without waiting for sign-off.
    lines = ["dish\tproduct_code\tcontains\tevidence"]
    for d in dishes:
        ev = allergen_evidence(d)
        lines.append("\t".join([
            d["name"], d["product_code"],
            ", ".join(d["_allergens"]) or "—",
            "; ".join(f"{a}: {'+'.join(sorted(set(v)))}" for a, v in sorted(ev.items())) or "—"]))
    (HERE / "allergen-review.tsv").write_text("\n".join(lines) + "\n")
    print(f"\n  allergen-review.tsv written ({len(dishes)} rows)")


if __name__ == "__main__":
    main()
