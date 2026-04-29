---
title: Menu Categories
type: page
tags: [menu, categories]
date: 2026-04-29
status: active
related:
  - "[[Menu/]]"
  - "[[Menu/Concept]]"
  - "[[Menu/Product Categorization]]"
---

# Menu Categories

Phase 1 menu structure (March 2026 launch). Source: [`docs/bible/menu-items.md`](../../docs/bible/menu-items.md). Database backing: `nomenclature.product_code LIKE 'SALE-%'` joined with `product_categories.name_l1`.

## 1. Breakfasts (AM / Circadian Nutrition)

Combi-oven for baking, lava grill for proteins.

### Healthy English breakfast variants
- **Shishka Classic** — poached/soft-boiled eggs, sous-vide chicken (Merrychef-regenerated for crispy crust), roasted cherry tomatoes, mixed greens, sourdough tartine
- **Nordic Morning** *(ref: Fire and Ice)* — eggs, lightly salted salmon (Makro), spinach, fermented radish, buckwheat bread
- **Levantine Start** *(ref: Boustany / Tahini & Turmeric)* — eggs, lava-grilled halloumi, hummus, fresh cucumber, gluten-free flatbread

### Functional porridges
- **Buckwheat Umami Bomb** — buckwheat (gas stove), fresh Lion's Mane, drop of truffle oil, poached egg, pumpkin seeds
- **Tropical Oatmeal** — oatmeal on coconut milk, fresh mango, freeze-dried berries, chia
- **Asian Comfort Rice** — brown/wild rice on coconut milk, dates, nuts

## 2. Sandwiches, rolls, burgers, manakish

Base for grab-and-go. Assembled at L2, reheated in contact grill or Merrychef (~60 sec).

### Fresh rolls (rice paper)
- **Shrimp & Mango** — shrimp, mango, carrots, spinach, cilantro + sugar-free sweet chili / peanut dip
- **Vegan Rainbow** — tofu, avocado, red cabbage, microgreens + tahini-miso

### Rice-nori buns *(ref: The Gaijin Cookbook)*
- **Salmon Tartare Rice-Burger** — pressed rice buns with nori, chopped red fish, avocado, light spicy yogurt mayo
- **Chicken Teriyaki Rice-Burger** — grilled chicken, marinated daikon, spinach

### Toasts (own sourdough, ref: Super Sourdough)
- Avocado toast — tomato, hemp seeds, microgreens
- Lightly salted salmon — labneh and dill

### Manakish (Arabian flatbread pizza)
- **Za'atar & Cheese** — za'atar, olive oil, halloumi/mozzarella
- **Lahmacun-style** — lean ground beef (Prime Food), tomatoes, onions, sumac

## 3. Soups (L2 bain-maries)

Cooked in kettles on gas stoves at L1 → blended → vacuum-sealed → delivered to L2.

- **Bio-Active Borscht** — vibrant red, no excess fat. Chicken or vegan (beans). Served with homemade sour cream/yogurt + garlic bread.
- **Functional Fungi Cream** — coconut milk or light cream, local mushrooms. Blended silky.
- **Pumpkin Fusion** — pumpkin roasted in combi-oven (concentrates sugars), blended with lemongrass, ginger, coconut milk. Garnish: fried corn, sesame.
- **Healthy Chicken Ramen** *(ref: Homemade Ramen)* — collagen broth (long-simmered at L1), noodles (buckwheat soba or rice), sous-vide chicken, marinated egg, nori.

## 4. Salads & Bowls (the Algorithm Bowl) — flagship

Two salad bars × 28 gastro-containers each = 56 slots. Principle: **Fiber Base + Sustain-Pro + Bio-Active + Crunch**. Vegetables sliced on auto-slicer (`L1-VEG-SLCR-CHINA-12`) for perfect standardization.

### Salad Bar 1: Base + Proteins (28 slots)
- **Greens (4)** — Romaine, Baby Spinach, Kale, Salad Mix
- **Grains/Complex Carbs (6)** — Quinoa, Brown Rice, Wild Rice, Buckwheat (al dente), Rice Noodles, Roasted Sweet Potato
- **Raw Vegetables (8)** — Cherry Tomatoes, Cucumbers, Bell Peppers, Carrots (julienne), Red Onion, Edamame, Radish, Broccoli (blanched)
- **Proteins (10)** — Sous-vide chicken, Lava-grilled chicken (ShishTaouk), Salmon flakes, Shrimp, Tofu, Boiled eggs, Beans/Chickpeas, Roast beef

### Salad Bar 2: Superfoods + Ferments + Crunch + Sauces (28 slots)
- **Roasted Veg/Fruits (6)** — Beets, Cauliflower, Mango, Pomegranate, Dragonfruit
- **Fermentation Live (4)** — Shishka Sauerkraut, Pineapple Kimchi, Marinated Red Onion, Kalamata Olives
- **Cheeses (3)** — Feta, Parmesan, Goat Cheese
- **Crunch / TextureMaxxing (6)** — Walnuts, Almond flakes, Pumpkin seeds, Freeze-dried berries, Crispy onions, Sesame seeds
- **Dressings (9)** — Golden Tahini-Turmeric, Berry Vinaigrette, Citrus-Olive Oil, Asian Sesame-Ginger, Green Goddess (herb + yogurt), Spicy Peanut, Classic Pesto, Balsamic

## 5. Main Courses (Medical-Grade Nutrition)

L1: 90% Cooked rule on lava grill, moisture-locked in Blast Chiller, vacuum-sealed. L2: Merrychef regenerates in ~60 seconds.

- **Lava-Grilled Chicken & Quinoa** — grilled chicken breast + tri-color quinoa + roasted broccoli + Chimichurri
- **Salmon "Tsar" Bowl** — sous-vide → Merrychef finish + buckwheat + roasted root vegetables + Tahini-Dill
- **Shrimp & Avocado Cauliflower Rice** — grilled tiger shrimp + cauliflower rice + avocado + salsa fresca (Mexican fusion)
- **Vegan Power Meatball** — lentil + mushroom patty + wild rice + Shishka sauerkraut + umami tomato

## 6. Future: Own Dairy (Fermentation)

CapEx pending — Yogurt Maker 10L (`L1-YOG-10L`) and high-power mixer (`L1-D-MIX-10KG`). Live yogurt and kefir for porridges + Green Goddess base + smoothies. Homemade tvorog. **Shishka Syrniki** (oven-baked, not fried) — combi-oven at L1 → vacuum → L2 Merrychef → berry vinaigrette + fresh sour cream.

## See Also

- [[Menu/Product Categorization]] — DB-side category structure backing this customer view
- [[Recipes/]] — BOMs and technique behind each dish
- [[Equipment/Inventory]] — physical units referenced above
