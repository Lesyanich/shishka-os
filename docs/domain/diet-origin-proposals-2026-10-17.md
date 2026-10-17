# Diet origin: offline pass over the 36 escalated ingredients (2026-10-17)

Part of the diet-tags build (spec `docs/plans/spec-diet-tags-derivation.md`, PR #634; mig 510 PR #637; mig 513 PR #639).
`fn_propose_ingredient_diets` (rules R1-R3) left **36 food leaves of the live menu** unresolved. This file is the
offline model pass over them. **Nothing here was written to production.** Every row below is a PROPOSAL; a person
confirms it in the admin (`Confirm` next to the ingredient), and until then the dishes above it carry no diet tag.

## How to read the evidence

| Grade | Meaning |
|---|---|
| **A** | Our own records: purchase history, `supplier_catalog` (brand, title, barcode), `nomenclature` notes / `customer_ingredients` / allergen tags |
| **B** | A public listing for the SAME product (retailer or manufacturer page), linked below |
| **C** | General knowledge of the product type. Not product-specific, **never enough on its own** to call something plant |

Confidence: **high** = A or B names the product and its nature leaves no real doubt · **medium** = the product type is
clear but no source read this exact product's label (regional recipes, additives) · **needs label** = no proposal; guessing
would be the failure this system exists to stop.

`origin` uses the closed vocabulary: `meat · fish · shellfish · dairy · egg · honey · other_animal`. `[]` = plant (no animal origin).

## Summary

| | Count |
|---|---|
| High confidence (14) | ALMOND_MILK, CHICKEN-BREAST, COCONUT-MILK, COCONUT-OIL, OLIVE-OIL, MATCHA, FLOUR-VENUS, TAHINI, TOFU-FIRM, TOMATO-PASTE, MAYONNAISE-HEALTHY, SYRUP_CARAMEL, NO_SHELL_COCONUT, COCOA-POWDER |
| Medium (17) | confirm after a glance at the packet |
| **Needs label, no proposal (5)** | PEPPER_PASTE_RED, WAKAME_SALAD, WRAP_DELISUN_CHIA_FLAX, CHOC_DARK_70, CHOC_DARK_70_ALMOND |

## High confidence (14)

| Ingredient | Proposed origin | Evidence | Note |
|---|---|---|---|
| `RAW-ALMOND_MILK` 137 DEGREES Almond Milk Unsweetened 1L | `[]` | A: Makro title + brand, bought 2026-06-07; tag allergen-nuts | A plant milk by definition |
| `RAW-CHICKEN-BREAST` Chicken Breast Fillet | `['meat']` | A: 7 supplier lines (Makro, Central Food), 13 purchases | Obvious; the rules missed it only because the category is named `F-PRO-PLT` |
| `RAW-COCONUT-MILK` AMPAWA Coconut Milk 1 l x 2 | `[]` | A: Makro receipt, existing `vegan` + `dairy-free` tags | Stabilisers not read |
| `RAW-COCONUT-OIL` NATUREL Coconut Oil 1 l | `[]` | A: Makro + Central Food receipts, existing `vegan` tag | |
| `RAW-OLIVE-OIL` Olive Oil (Extra Virgin) | `[]` | A: 3 purchases, brands Costa d'Oro / Fuente del Rey / Mueloliva | |
| `RAW-MATCHA-POWDER` ITO EN Japanese Matcha 100 g | `[]` | A: Makro purchase 2026-06-07 | Single-ingredient |
| `RAW-FLOUR-VENUS` NS-Venus Bread Flour | `[]` | A: gluten tag, flour | Escalated only because its name contains "bread" |
| `RAW-TAHINI` Tahini | `[]` | A: notes say 15 kg bought 2026-06-06, sesame tag | Sesame paste |
| `RAW-TOFU-FIRM` Firm Tofu | `[]` | A: soy tag, Makro research row | Generic row, no brand |
| `RAW-TOMATO-PASTE` Tomato Paste | `[]` | A: Makro receipt "Fine Tomato Puree 400g", barcode 3229755207976 | |
| `RAW-MAYONNAISE-HEALTHY` Mayonnaise (Avocado/Olive Oil) | `['egg']` | A: its own `allergens` column says egg | **Retired item that 5 live dishes still use** (see findings) |
| `RAW-SYRUP_CARAMEL` MONIN Caramel Syrup 700 ml | `[]` | A: Makro order 2026-06-07; B: [Tesco](https://www.tesco.com/shop/en-GB/products/280515429) lists sugar, water, flavouring, citric acid, E150a; "Vegan-Friendly, Allergen-Free"; MC 572c53b1 mig 393 reached the same | |
| `SALE-NO_SHELL_COCONUT` No Shell Coconut | `[]` | A: `customer_ingredients` = "Young coconut (water + jelly flesh)" | |
| `RAW-COCOA-POWDER` TULIP Cocoa Dark Red Brown 440 g | `[]` | A: Makro receipt, barcode 8850940014672 | Cocoa powder; alkalised ("red brown") with a mineral salt |

## Medium (17): plant by nature of the product, label not read

| Ingredient | Proposed origin | Evidence | What the packet should settle |
|---|---|---|---|
| `RAW-BAKING-POWDER` McGarrett 1 kg | `[]` | A: Makro receipt barcode 8850338372562; C | **Retired, still in 1 live BOM** |
| `RAW-CRESPO_BLACK_PITTED_OLIVE` CRESPO 425 g | `[]` | A: Makro, 5 purchases; C | Olives, brine, salt |
| `RAW-DRIED-CRANBERRIES` Sweetened 500 g | `[]` | A: 1 Makro purchase, brand unknown; C | Glazing agent (some are shellac or honey-glazed) |
| `RAW-MUSTARD-DIJON` ARO Mustard 1 kg | `[]` | A: Makro, barcode 8856995002121, mustard tag; C | Seeds, vinegar, salt; check for wine/egg clarifiers |
| `RAW-NOODLE_KONJAC` Konjac Shirataki | `[]` | A: no supplier, no purchase; C | Which product is it? |
| `RAW-PICKLED_GHERKIN` KUHNE Gherkins 670 g | `[]` | A: Makro scrape, mustard tag already confirmed from Kuhne in mig 393; C | Vinegar, sugar, spices |
| `RAW-PICKLED_JALAPENO` | `[]` | A: notes say 2 boxes in stock, brand and price unknown; C | Brand unknown |
| `RAW-POMEGRANATE_MOLASSES` (Bought) | `[]` | A: no supplier, no purchase; C | Reduced juice only? |
| `RAW-SOY-SAUCE` Soy Sauce | `[]` | A: existing `vegan` tag, Makro research row "(est.)"; C | Generic row |
| `RAW-SRIRACHA` Sriracha (No Sugar Added) | `[]` | A: no brand, **retired**; C | Some Thai brands add fish sauce |
| `RAW-TONIC_WATER` Schweppes 330 ml | `[]` | A: Makro purchase 2026-06-07; C | Local bottling |
| `RAW-TRUFFLE-SAUCE` GIULIANO TARTUFI 180 g | `[]` | A: Makro receipt, barcode 8025386004475; B: [Faire](https://www.faire.com/product/p_a6scq1ac) and [Bienmanger](https://www.bienmanger.com/2A11781_Salsa_Tartufata_Truffle_Sauce.html) list mushrooms, olive and sunflower oil, black olives, summer truffle 1%, flavour, salt | A 5% truffle variant exists as a separate product; confirm the jar is the 1% one. No cheese listed |
| `RAW-WRAP_WHOLEGRAIN` MISSION Wholegrain 8 x 45 g | `[]` | A: no purchase row; B: [IGA AU](https://www.igashop.com.au/product/mission-wraps-wholegrain-369213) and [Morrisons UK](https://groceries.morrisons.com/products/114269278) list Mission wholegrain/wholemeal wraps as suitable for vegans | **Regional recipes**: neither listing is the Thai pack |
| `RAW-ZAATAR` Khairat Alsham Green Zaatar 400 g | `[]` | A: Lazada purchase 2026-05-18; C | Thyme, sesame, sumac, salt |
| `SALE-CHOC_RECOVERY_SQ` After Workout Vegan Square | `[]` | A: `customer_ingredients` = dates, almonds, tahini, pumpkin seeds, peanuts, sunflower seeds, 100% dark chocolate. "Vegan." | Depends on the "100% dark chocolate" component: confirm with Barada |
| `SALE-CHOC_PREACTIVE_SQ` Before Workout Power Square | `['honey']` | A: `customer_ingredients` = oats, peanuts, **honey**, coconut, almonds, 70% dark chocolate | Honey is certain, so never plant-based. Vegetarian depends on the 70% chocolate: confirm with Barada |
| `SALE-CHOC_HIGH_COCOA_MILK` High Cocoa Milk Chocolate 100 g | `['dairy']` | A: it is a milk chocolate (name) and MC 572c53b1 already says it "certainly carries dairy" | **Name-derived**, Barada declaration still pending; other animal ingredients unknown |

## Needs label (5): no proposal

| Ingredient | Why no proposal | What to get |
|---|---|---|
| `RAW-PEPPER_PASTE_RED` Red Pepper Paste | No supplier row, no purchase, no brand. The name covers a plain Turkish pepper paste and recipes with additives. 5 live dishes use it | Who bought it? A photo of the jar |
| `RAW-WAKAME_SALAD` Seasoned Wakame (Chuka) | No supplier, no purchase. B: [commercial chuka listings](https://www.arcasiangrocer.com.au/products/uogashi-frozen-chuka-wakame-seawead-salad-1kg) name soy sauce, sesame oil, vinegar and none a fish extract, but the seasoning varies by maker | A photo of the pack |
| `RAW-WRAP_DELISUN_CHIA_FLAX` Deli Sun Chia & Flax 6 x 60 g | A: 3 purchases at Tops Rawayana (latest 2026-10-09). B: no ingredient list found for this item; only the plain Deli Sun wrap lists wheat flour, water, palm fat, additives ([Carrefour UAE](https://carrefouruae.com/mafuae/en/tortilla/deli-sun-plain-fl-wrap-torilla-360g/p/1729822)) | The packet is in the kitchen: a photo of the back |
| `SALE-CHOC_DARK_70` 70% Dark Chocolate 100 g | Barada's own product, no data anywhere. Dark chocolate often carries milk traces or milk fat | Ingredient declaration from Barada (already the open ask on MC 572c53b1) |
| `SALE-CHOC_DARK_70_ALMOND` with Roasted Almond | Same | Same |

## Findings that matter beyond these 36

1. **A retired mayonnaise still feeds 5 live dishes.** `RAW-MAYONNAISE-HEALTHY` is soft-deleted, declares egg, and sits in the BOM of 5
   live dishes (with `RAW-BAKING-POWDER` and `RAW-SRIRACHA`, retired and in live BOMs too). `fn_dish_diet_status` blocks those dishes
   (`soft_deleted > 0`) until someone re-points or restores them. That is a recipe decision for the chef, not a tagging one.
2. **Cheese and animal rennet.** The rules call every cheese just `dairy`, so a dish with cheese would be called **vegetarian**.
   Strict vegetarians avoid cheese set with animal rennet (Parmigiano Reggiano always uses it; we stock ARO Shredded Parmesan).
   The current definition (vegetarian = no meat, fish, shellfish, other_animal) has no way to say this. **Question for the CEO:**
   (a) accept lacto-ovo vegetarian as the site's meaning and say so in the filter copy, or (b) read the cheese labels and mark
   animal-rennet cheeses `other_animal`, which makes their dishes not vegetarian. Plant-based is unaffected either way.
3. **Rule proposals that are partial by nature** (R1 proves one origin, not the absence of others), worth a glance when confirming:
   `RAW-CRABSTICK` (fish + shellfish; surimi often contains egg white), `RAW-BREAD_CUBIC_19GRAIN` (dairy from its milk tag; egg wash or
   honey unknown), `SALE-CHOC_COCONUT_SQ` (dairy from its tag; rest unknown).
4. **What this unblocks.** The 36 are 24% of the 148 live-menu leaves. Once a person confirms the 31 proposals, the dishes still
   blocked are those that contain one of the 5 needs-label items or a retired ingredient. Those 5 need a photo of a packet or a
   declaration from Barada, not more analysis.

## Machine-readable proposals (31) for the later load

Not applied. Format: `product_code -> animal_origin | confidence`. The load must go through `fn_confirm_ingredient_diet` after a
person has looked, or write `diet_state='proposed'` first.

```json
{
  "RAW-ALMOND_MILK": {"origin": [], "confidence": "high"},
  "RAW-CHICKEN-BREAST": {"origin": ["meat"], "confidence": "high"},
  "RAW-COCONUT-MILK": {"origin": [], "confidence": "high"},
  "RAW-COCONUT-OIL": {"origin": [], "confidence": "high"},
  "RAW-OLIVE-OIL": {"origin": [], "confidence": "high"},
  "RAW-MATCHA-POWDER": {"origin": [], "confidence": "high"},
  "RAW-FLOUR-VENUS": {"origin": [], "confidence": "high"},
  "RAW-TAHINI": {"origin": [], "confidence": "high"},
  "RAW-TOFU-FIRM": {"origin": [], "confidence": "high"},
  "RAW-TOMATO-PASTE": {"origin": [], "confidence": "high"},
  "RAW-MAYONNAISE-HEALTHY": {"origin": ["egg"], "confidence": "high"},
  "RAW-SYRUP_CARAMEL": {"origin": [], "confidence": "high"},
  "SALE-NO_SHELL_COCONUT": {"origin": [], "confidence": "high"},
  "RAW-COCOA-POWDER": {"origin": [], "confidence": "high"},
  "RAW-BAKING-POWDER": {"origin": [], "confidence": "medium"},
  "RAW-CRESPO_BLACK_PITTED_OLIVE": {"origin": [], "confidence": "medium"},
  "RAW-DRIED-CRANBERRIES": {"origin": [], "confidence": "medium"},
  "RAW-MUSTARD-DIJON": {"origin": [], "confidence": "medium"},
  "RAW-NOODLE_KONJAC": {"origin": [], "confidence": "medium"},
  "RAW-PICKLED_GHERKIN": {"origin": [], "confidence": "medium"},
  "RAW-PICKLED_JALAPENO": {"origin": [], "confidence": "medium"},
  "RAW-POMEGRANATE_MOLASSES": {"origin": [], "confidence": "medium"},
  "RAW-SOY-SAUCE": {"origin": [], "confidence": "medium"},
  "RAW-SRIRACHA": {"origin": [], "confidence": "medium"},
  "RAW-TONIC_WATER": {"origin": [], "confidence": "medium"},
  "RAW-TRUFFLE-SAUCE": {"origin": [], "confidence": "medium"},
  "RAW-WRAP_WHOLEGRAIN": {"origin": [], "confidence": "medium"},
  "RAW-ZAATAR": {"origin": [], "confidence": "medium"},
  "SALE-CHOC_RECOVERY_SQ": {"origin": [], "confidence": "medium"},
  "SALE-CHOC_PREACTIVE_SQ": {"origin": ["honey"], "confidence": "medium"},
  "SALE-CHOC_HIGH_COCOA_MILK": {"origin": ["dairy"], "confidence": "medium"}
}
```

Sources used (web, retailer or manufacturer pages, not the physical labels):
[Faire](https://www.faire.com/product/p_a6scq1ac) · [Bienmanger](https://www.bienmanger.com/2A11781_Salsa_Tartufata_Truffle_Sauce.html) ·
[IGA](https://www.igashop.com.au/product/mission-wraps-wholegrain-369213) · [Morrisons](https://groceries.morrisons.com/products/114269278) ·
[Tesco MONIN](https://www.tesco.com/shop/en-GB/products/280515429) · [Carrefour UAE Deli Sun](https://carrefouruae.com/mafuae/en/tortilla/deli-sun-plain-fl-wrap-torilla-360g/p/1729822) ·
[Uogashi chuka](https://www.arcasiangrocer.com.au/products/uogashi-frozen-chuka-wakame-seawead-salad-1kg)
