---
domain: [kitchen, procurement, sales]
agents: [chef, procurement]
load_when: "specific dishes, ingredients, BOM planning, procurement, menu updates"
last_updated: 2026-07-19
updated_by: CEO (2026-04-05 concept) + code-agent shipped-menu reconcile (2026-07-19)
source: "Part 1 = live DB (nomenclature SALE / menu_public); Part 2 = Notion SHISHKA CORE HUB Section 2.2 (original concept)"
status: live-snapshot + roadmap
---

# Menu Items

> **This doc has two parts.**
> **Part 1 — Current Menu** is a human-readable **snapshot of the shipped menu as of 2026-07-19**.
> The canonical live source is `nomenclature` `SALE-*` items (public view `menu_public` /
> `v_public_menu`, surfaced on shishka.health). Prices/availability drift — trust the DB, not this list.
> **Part 2 — Roadmap / Original Concept** preserves the April-2026 design intent (breakfasts, big
> bowls, 56-container salad bar, own dairy) that has **not** shipped. Kept as roadmap, not current fact.

---

# PART 1 — Current Menu (shipped, snapshot 2026-07-19)

Fast-casual **manakish + salads + fresh spring rolls + dips**, with a large **drinks program**
(coffee, matcha, smoothies, juices, lemonades, shots) and retail chocolate. Prices in ฿.

## 🫓 Manakish (potato-taco / flatbread base)
| Tier | Items | Price |
|------|-------|-------|
| Classic | Za'atar Potato Tacos · Olive & Cheese · Pumpkin & Cheese Mix · 6 Cheese Potato Tacos | 59 |
| Signature | Beef · Lamb · Falafel · Chilli & Cheese · Za'atar & Cheese Potato Tacos | 69 |
| Premium | Truffle & Lamb Signature · Salami Potato Tacos · Sujuk · Pumpkin & Goat Cheese | 79 |

## 🥗 Salads
Tabbouleh (269) · Fattoush (249) · Chicken Caesar — avocado dressing, seed crackers, grana padano (249) · Chicken Mexican — chipotle honey (199) · Shrimp Caesar (349) · Smoked Salmon — eggs, avocado, lemon (299) · Beetroot Walnut (149).
*Several Caesar/Mexican/Salmon/Beetroot variants are marked `coming_soon` — check `stock_state`.*

## 🥟 Fresh Spring Rolls (rice paper)
Veggie (169) · Chicken (199) · Tuna & Corn (219) · Shrimp (239)

## 🥣 Dips
Hummus (111) · Beetroot Hummus (111) · Mutabal — smoked eggplant (195) · Muhammara — smoky pepper & walnut (199)

## 🥖 Bread & Crackers
Sourdough Mini Bun — 1 pc (35) / 2 pcs (60) · Seed Crackers — chia, sunflower & pumpkin (120)

## 🥤 Smoothies
Custom / Build-Your-Own (89) · Green Ice (100) · Strawberry Banana (100) · Peach Apricot (120) · Mixed Berry (120) · Passion Mango (120) · Mango Strawberry (120) · Choco Avocado (140) · Protein Peach (140)

## ☕ Coffee
Espresso (60) · Americano / Iced Americano (65) · Latte / Cappuccino (75) · Iced Latte / Iced Cappuccino (85) · Caramel Latte (105) · Espresso Tonic (110) · Iced Caramel Latte (115) · Orange Coffee (145) · Passion Fruit Coffee (145)

## 🍵 Matcha
Matcha Latte (90) · Iced Dirty Matcha (95) · Iced Matcha Latte (100) · Orange Matcha (135) · Passion Fruit Matcha (135) · Matcha Green Smoothie (140)

## 🧃 Juices
Fresh Carrot / Guava / Orange & Carrot / Pineapple (90) · Fresh Orange (100) · Glow — carrot, orange, ginger, turmeric (100)

## 🍋 Lemonades  (all 85)
Classic (lime, honey) · Ginger · Mint · Passionfruit

## ⚡ Shots  (all 60)
Ginger (ginger, lime, honey) · Beetroot Energy (beetroot, apple, lime, ginger) · Turmeric Immunity (orange, ginger, turmeric, lime)

## 🥫 Sauces & Dressings  (all 39)
Hummus · Mango · Tahini Tamarind · Yogurt Tahini

## 🍫 Chocolate  (100g bars, all 197)
70% Dark · 70% Dark with Roasted Almond · High Cocoa Milk

## In-store / POS-only (not yet web-published)
Available at the counter but not on shishka.health (`is_web_visible = false`):
- **🍗 Proteins & Grills** (add-ons, POS-priced): Grilled Chicken Breast · Grilled Salmon · Grilled Shrimp · Lamb Kebab · Cured Salmon (house-made) · Beef & Lamb Sausage (homemade)
- **🎁 Bundles**: Potato Tacos Bundle ×4 / ×8 / ×12 (POS-configured)
- **🥟 Sides**: Baked Potato — grilled half (80) · Mashed Potato Classic (80) · Mashed Potato Vegan (55)
- **🥖 Bread**: Potato Pita — grilled, GF (15) · Potato Pita Set ×3 (40)
- **🥤 Soft Drinks**: Coca-Cola / Coke Zero / Fanta / Sprite / Tonic (35) · Singha Soda (30) · Mont Fleur Mineral Water 500ml (20)
- **🧋 Thai Tea** (100): Caramel · Hazelnut · Honey · Mint · Vanilla
- **🧃 Juices**: Fresh Coconut (80) · Fresh Pomegranate
- **🥫 Sauces** (POS add-ons): Tahini · Cashew · Pesto · Lemon & Olive Oil · Peanut-Lime (39)
- **Premium manakish**: Lion's Mane Superfood (89)

---

# PART 2 — Roadmap / Original Concept (April 2026 — NOT yet shipped)

> Preserved from the original Notion concept. Manakish, salads, fresh spring rolls, smoothies and
> dips **shipped in evolved form** (see Part 1). The items below — full breakfasts, porridges,
> rice-nori burgers, big protein main-courses, the 56-container "Algorithm Bowl" salad bar, and
> the own-dairy line — remain **design intent / roadmap**, not on the current menu.

## Breakfasts (AM / Circadian Nutrition)
*Combi-oven for baking, lava grill for proteins.*
- **Shishka Classic**: poached eggs, sous-vide chicken breast (Merrychef-regenerated for crispy crust), roasted cherry tomatoes, mixed greens, sourdough tartine
- **Nordic Morning** *(Ref: Fire and Ice)*: eggs, lightly salted salmon, spinach, fermented radish, buckwheat bread
- **Levantine Start** *(Ref: Boustany/Tahini & Turmeric)*: eggs, lava-grilled halloumi, hummus, fresh cucumbers, GF flatbread
- **Porridges**: Buckwheat "Umami Bomb" (Lion's Mane, truffle oil, poached egg, pumpkin seeds) · Tropical Oatmeal (coconut milk, mango, freeze-dried berries, chia) · Rice Porridge (brown/wild rice, coconut milk, dates, nuts)

## Sandwiches / Burgers / Toasts (concept)
- **Rice-Nori Burgers** *(Ref: The Gaijin Cookbook)*: Salmon Tartare · Chicken Teriyaki
- **Toasts** *(own sourdough)*: Avocado + hemp seeds + microgreens · Salmon + Labneh + dill

## Soups (L2 bain-maries)
*Cooked in L1 kettles, blended, vacuum-sealed, delivered to L2.*
- **Bio-Active Borscht** (chicken or vegan) · **Mushroom Cream (Functional Fungi)** · **Asian Pumpkin Fusion** · **Healthy Chicken Ramen** *(Ref: Homemade Ramen)*

## Salads & Bowls — "The Algorithm Bowl"
*Concept: 2 salad bars, 56 gastro-containers, "Fiber Base + Sustain-Pro + Bio-Active + Crunch".*
- **Bar 1 (Base & Proteins, 28 slots)**: greens, complex carbs (quinoa/rice/buckwheat/sweet potato), raw vegetables, 10 proteins (sous-vide & lava-grilled chicken, salmon, shrimp, tofu, eggs, beans, roast beef)
- **Bar 2 (Superfoods, Ferments, Crunch, Sauces, 28 slots)**: roasted veg/fruits, wild ferments (own sauerkraut, pineapple kimchi), cheeses, TextureMaxxing crunch, 9 dressings (Golden Tahini-Turmeric, Berry Vinaigrette, Green Goddess, etc.)

## Main Courses (Medical-Grade Nutrition)
*"90% Cooked" at L1 → blast-chilled → vacuum-sealed → Merrychef-regenerated at L2 in ~60s.*
- **Lava-Grilled Chicken & Quinoa** · **Salmon "Tsar" Bowl** · **Shrimp & Avocado Cauliflower Rice** · **Vegan Power Meatball**

## Future: Own Dairy (Fermentation)
*CAPEX: Yogurt Maker 10L + high-power mixer.*
- **Live Yogurt & Kefir** · **Homemade Tvorog** · **Shishka Syrniki** (oven-baked, not fried)
