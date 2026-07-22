<!-- DEPRECATED: agent memory now lives in Supabase agent_memory table. This file is archived.
    Use recall_memories(agent_id='chef') to query past decisions, tests, and ideas.
    Migration: services/supabase/migrations/215_seed_agent_memory_from_journal.sql -->

# Kitchen Journal — Shishka Healthy Kitchen (ARCHIVED)

> **⚠️ ARCHIVED** — All entries below have been migrated to Supabase `agent_memory` table.
> New memories are stored via `store_memory` MCP tool. Do not append to this file.
>
> Original format: дата → что делали → результат → выводы.
> Append-only. Каждый день — новый блок.

---

## 2026-04-03 — Старт дневника

- Запущен Chef Agent (AGENT.md спроектирован, MCP протестирован)
- Создан menu-development.md с полным списком позиций
- Активные тесты: тесто для манаишей, хлеб на закваске

### Тесты теста (выпечка)
- **Что тестируем:** TBD (Леся добавит детали)
- **Результат:** TBD
- **Ошибки:** TBD
- **Улучшения:** TBD

---

## 2026-04-05 — Хуммус: старт разработки рецепта

### Debate: пропорции тахини и чеснока

**Контекст:** Шеф настаивает на большом количестве тахини (200g/500g нута = 40%) и чеснока (10g), мотивируя лучшим хранением. Chef Agent предлагает стандартные пропорции (160g тахини = 32%, 6g чеснока).

**Позиция шефа:**
- Тахини 200g — много, потому что так он привык / "так правильно"
- Чеснок 10g — якобы улучшает срок хранения (антибактериальные свойства)

**Позиция Chef Agent (кулинарный стандарт):**
- Тахини 160g — классика, хорошая кремовость, лучший food cost (~−8 THB/batch)
- Чеснок 6g — сырой чеснок агрессивный, 10g перебивает нут
- Лимонный сок 80ml (не 60ml) — кислота важна для баланса с тахини

**Решение: В БД заносим пропорции Chef Agent как Версия A. Тест обязателен.**

### Тест-план: Hummus A/B
- **Версия A** (в БД): Тахини 160g, Чеснок 6g, Лимон 80ml
- **Версия B** (шеф): Тахини 200g, Чеснок 10g, Лимон 60ml
- **Что оцениваем:** вкус, текстура, кремовость, срок хранения (24h, 48h, 72h)
- **Слепой тест:** желательно без подсказок кто какую версию делал
- **Статус:** 🔲 запланирован

### Процесс варки нута (зафиксировано)
- Замачивание: 1-2 часа в холодильнике (максимум 6 часов)
- После варки: шоковое охлаждение в ледяной воде → снятие кожи → более кремовый хуммус
- Ледяная вода в блендере (3-4 ст.л.) — аэрация и шёлковая текстура

### Zero-Waste: Аквафаба (Future PF)
- Вода от варки нута = аквафаба
- Использование: замена яичного белка в выпечке/соусах, веганская меренга, эмульсификатор
- Пока не создаём PF, но фиксируем идею: `PF-AQUAFABA`
- **Статус:** 💡 идея на будущее

---

## 2026-04-05 — Shish Tawook: спайс-матрица получена

### The Fresh Edition Blueprint (от Леси)
Получена авторская спайс-матрица Shish Tawook v1 — "The Fresh Edition".

**Ключевые дизайн-решения:**
- **Без чесночного порошка** — свежий чеснок 50g/kg = структурный фундамент
- **Mahlab 40g** — SHiSHKA Signature (нетипичный ингредиент для таука)
- **Dried Mint 70g** — Vitality element, высокий для данного типа маринада
- **Deep Infusion** — 6 часов при 4°C обязательно, иначе чеснок не реагирует с кислотами
- **Double acid** — лимонный сок + ACV одновременно
- **Finishing oil** — чесночное масло из маринада → Texture Maxxing (crispy exterior)

**Batch:** 530g сухой смеси (10% scale от производственного объёма)

**Решение по Mahlab:**
- Шеф (сирийский) использует **Fenugreek (Hilba)** — в Сирии так называют "mahlab" в контексте маринадов.
- Это региональное решение шефа, принято и зафиксировано.
- Fenugreek есть в Макро (под названием Hilba или Fenugreek).
- В БД создаём: RAW-FENUGREEK, name: "Fenugreek (Hilba)", note: "Used as Syrian-style 'mahlab' in Tawook marinade"

**Следующий шаг:**
- Тест-план отправлен на кухню (MC task)
- Создать PF-YOGURT_HOMEMADE после тестов завтра

---

## 2026-04-05 — Йогурт: переход на домашнее производство

### Открытие: Yogurt Maker в работе
Йогурт больше не закупаем — делаем из молока на кухне. Используем Yogurt Maker (L-1-K-YOG-10L-17).

**Текущий процесс (зафиксирован):**
1. Молоко → Yogurt Maker → 85°C (пастеризация / денатурация белков)
2. Открыть крышку → охлаждение до 43-45°C
3. Опыт: Blast Chiller для охлаждения → **лучшая консистенция** (подтверждено тестом)
4. Добавить закваску → инкубация при 40-43°C → 6-8 часов
5. Охлаждение до 4°C (холодильник или Blast Chiller)

**Bottleneck: Blast Chiller**
- Капасити: 10 kg, 15 мин/цикл
- Используется для: охлаждения йогурта (шаг 2→3) + финального охлаждения
- Конкурирует с: другими PF которым нужен blast chiller (борщ-база, курица и др.)
- Нужно учитывать при планировании производственного расписания

**Решение по рецепту:**
- Сухое молоко — убрано. Технически не UPF (NOVA 3), но не соответствует философии Shishka "цельные ингредиенты". Шеф прав по духу.
- Молоко: Макро 3.5% — пока нет лучшего поставщика. Искать в будущем.
- 3 варианта для теста (детали в MC task bf596b7c): A=базовый 7ч / B=греческий 7ч+процедить / C=долгий 10ч

**Тест завтра (2026-04-06)** — MC task отправлен на кухню.

---

## 2026-05-18 — Porridge R&D: Coconut Rice + Overnight Oats

### Scope
Designed production approach for two porridge bases: PF-PORRIDGE_COCONUT_RICE and PF-PORRIDGE_OVERNIGHT_OATS.

### CEO Corrections (critical — food science gaps)
1. **Shelf life max 48h, not 5 days** — Bacillus cereus spores survive cooking, germinate at 4-55°C; starch retrogradation causes syneresis (texture collapse) by day 3-4
2. **Honey ONLY at L2 serving (<40°C)** — heating destroys enzymes, turns expensive honey into cheap invert sugar. Use coconut sugar at L1 (thermostable, low GI)
3. **Al dente at L1** — microwave reheat finishes cooking; ratio 1:2.06 (rice:liquid), cook 15 min not 20-25
4. **Raw oats carry wild microflora** — overnight oats without heat treatment = uncontrolled fermentation risk. Solution: 3 min boil → blast chill → add chia cold
5. **Puffed rice (Murmura)** — add ONLY at L2 serving, absorbs moisture instantly

### Final Recipes (v2)
- **Rice porridge:** 330g jasmine rice + 580ml coconut milk + 100ml water + 15g coconut sugar + 3g cinnamon + 2ml vanilla. Cook 15 min al dente → blast chill → 250g portions. Cost ~57 ฿/kg, portion 14.3 ฿ base.
- **Overnight oats:** 300g oats + 550ml coconut milk + 150ml water + 30g chia (post-chill) + 15g coconut sugar + 3g cinnamon + 2ml vanilla. Boil 3 min → blast chill → add chia → mature 6-12h cold. Cost ~99 ฿/kg, portion 24.8 ฿ base.

### Topping combos (L2 assembly)
- Tropical: mango purée 30g + toasted coconut 10g
- Crunch: PF-CRUNCH_PUMPKIN 15g + honey drizzle
- Plain: honey drizzle only
- NEW: Puffed rice (Murmura) 10-15g — crunch element, last step at serving

### Pricing target
- Rice porridge + topping: 89 ฿ (FC ~27%)
- Oats + topping: 119 ฿ (FC ~29%)

### Open decisions
- ~~Sweetener: coconut sugar vs Mitr Phol white~~ → **DECIDED: cane sugar** (coconut sugar rejected — strong aftertaste, CEO decision 2026-05-18)
- Puffed rice brand (Murmura from Lazada) — need clean label check on packaging
- Microwave purchase for L2 (~2,000 ฿)
- Buckwheat porridge deferred → separate savory dish (truffle + mushroom)

### MC task created
- 315e14f7: Chef Agent food science knowledge gap — architectural solution needed (tech, high priority)

### Pending
- ~~Check purchase_logs for sugar line items~~ → DONE (search_purchase_history tool live)
- First cane sugar purchase → establishes WAC
- Kitchen test batch before creating PF in Supabase

---

## 2026-05-18 — Manakeesh Recipe Flows + Porridge Pudding Concept

### Manakeesh — full recipe flow buildout
All 7 active GF manakeesh now have complete 6-step recipe flows:
1. Pressing (Gas Range) → 2. Pre-baking → 3. Assembly (unique per dish) → 4. Blast Freeze → 5. Storage → 6. Merrychef (260°C, Fan 100%, MW 10-15%, 1:40)

**Created:**
- PF-CHEESE_MIX_MANAKEESH — 3-cheese mix (Mozz+Cheddar 40%, Gouda 30%, Emmental 30%), ฿392/kg
- BOM for 5 manakeesh filled from scratch (Cheese, Cheese+Mushroom, Za'atar, Pumpkin+Goat)
- BOM for Pumpkin Cheese Mix extended (added cheese mix + sesame)

**Assembly details per dish:**
| Dish | Filling |
|------|---------|
| Cheese GF | cream cheese 10g + cheese mix 20g |
| Cheese & Mushroom GF | cream cheese 7g + shiitake 15g + cheese mix 13g |
| Za'atar GF | za'atar + olive oil mix |
| Pumpkin Cheese Mix GF | mashed pumpkin w/ salt + cheese mix 12g |
| Pumpkin & Goat GF | baked pumpkin 22g + goat cheese 10g |
| Beef/Lamb GF | unchanged (30g filling) |

**All use 50/50 black & white sesame mix (~3g) on the back.**

**Prices set:**
| Dish | Price | FC% |
|------|-------|-----|
| Cheese GF | ฿59 | 18% |
| Cheese & Mushroom GF | ฿69 | 22% |
| Za'atar GF | ฿45 | 16% |
| Pumpkin & Goat GF | ฿69 | 24% |

**KBJU filled** for 6 RAW ingredients (cream cheese, mozz+cheddar, gouda, emmental, black sesame, ricotta).
**Goat cheese** identified: Soignon from Villa Market, ฿1,245/kg.

### CEO decision: cane sugar for porridge
Coconut sugar rejected (strong aftertaste). Cane sugar approved for L1 production (15g per 5 portions = 3g/portion, ~12 kcal). Honey remains L2 drizzle only (<40°C).

### Porridge Pudding Concept (CEO idea — R&D)
**Pivot:** serve rice + oat porridge COLD as puddings, not hot.

**Health angle:** cooled rice = resistant starch RS3 (lower GI) — marketing writes itself.

**Lego model:**
- Base: rice pudding OR overnight oats (PF, portioned in bowls at L1)
- Toppings (L2): fruits, berries, sweet sauces, jams, crunch, honey drizzle
- New idea: **ricotta in overnight oats** (adds protein + creaminess)

**Two serving models:**
- **Grab & Go:** pre-assembled bowls in open fridge (L-2-S-OPEN-FRG-120-11), max 12h display
- **Build Your Own:** base from GN + customer picks toppings at sweet salad bar

**Packaging:** medium bowl + clear plastic lid + sticker (KBJU, price, production date, use-by date)

**Food safety constraints:**
- Rice base: 48h max at 0-4°C (B. cereus)
- Cut fruit toppings: 24h max
- Pre-assembled in open fridge: ~12h display life
- Fruit added at L2 morning, not at L1

### MC tasks created
- ba84ff3f: Parse Makro for seasonal fruits (prices + barcodes) — procurement
- b82c5e65: Add Soignon Goat Cheese (Villa Market) to supplier catalog
- af185481: Fix nutrition validator <500 kcal/kg threshold (code fix done, awaits MCP restart)
- 8e7770a4: Merge Bega Cream Cheese auto-products → RAW-CHEESE-CREAM
- 525bdb94: Fix RAW-ZAATAR unit from "portion" to "kg"

### Open decisions (porridge pudding)
- Bowl supplier + sticker printer for L2
- How many pre-assembled combos per day (operational planning needed)
- Pricing tiers depend on topping costs (awaiting Makro fruit parse)
- Ricotta source + cost (RAW-CHEESE-RICOTTA WAC=0, KBJU filled: 1740/110/130/30 per kg)
- Cane sugar brand from Makro (CEO sent link, page didn't load — need barcode)

---

<!-- Шаблон для нового дня:

## 2026-04-XX — [тема дня]

### [Название эксперимента]
- **Что тестировали:**
- **Параметры:** (температура, время, пропорции)
- **Результат:** (вкус, текстура, внешний вид)
- **Ошибки:**
- **Улучшения на следующий раз:**
- **Фото:** (если есть)

-->

---

## 2026-05-22 / 2026-05-23 — Smoothie Menu Development

### Summary
Designed and recorded 7 smoothies in Supabase with full BOM. Researched Makro frozen fruit catalog, calculated FC and margins, iterated recipes with CEO.

### Smoothie Menu (all 500ml, recorded in DB)

| Code | Name | Key Ingredients | FC* | Price | Margin |
|------|------|-----------------|-----|-------|--------|
| SALE-SMOOTHIE_CHOCO_AVO | Choco Avocado | avocado, banana, cocoa, dates, coconut milk, cashew butter | ฿36 | ฿199 | 82% |
| SALE-SMOOTHIE_STRAWBERRY_BANANA | Strawberry Banana | strawberry, banana, milk, chia | ฿27 | ฿149 | 82% |
| SALE-SMOOTHIE_ISLAND_GREEN | Island Green | pineapple, kiwi, spinach, water | ~฿22 | ฿149 | 85% |
| SALE-SMOOTHIE_PASSION_MANGO | Passion Mango | mango chunks, passion fruit (seedless), water | ~฿49 | ฿179 | 73% |
| SALE-SMOOTHIE_MIXED_BERRY | Mixed Berry | strawberry, blueberry, banana, milk, chia | ฿36 | ฿159 | 77% |
| SALE-SMOOTHIE_PEACH_APRICOT | Peach Apricot | peach, apricot, banana, yogurt+milk, almond | ~฿30 | ฿169 | 82% |
| SALE-SMOOTHIE_PROTEIN_PEACH | Protein Peach | peach, banana, milk, peanut butter, whey protein (MOD) | ~฿80/฿28 | TBD | TBD |

*FC marked ~ where WAC not yet available (new RAW items need first purchase)

### New Products Created
- **PF-CASHEW_BUTTER** — homemade cashew butter (RAW-CASHEWS, 5% yield loss)
- **PF-FROZEN_PINEAPPLE_CHUNKS** — fresh pineapple cut & frozen (RAW-PINEAPPLE, 30% yield loss)
- **MOD-WHEY_PROTEIN_ADD** — Add Whey Protein 30g (for protein smoothies)
- **MOD-CASHEW_BUTTER_ADD** — created but unused (MOD→PF not allowed)
- **RAW**: frozen kiwi, frozen spinach, frozen peach, frozen apricot, frozen mango chunks, almond sliced, whey protein

### Architecture Change
- Lego chain updated: SALE can now contain RAW/PF/MOD (was PF/MOD only)
- Code in validators.ts already had this change; docs updated in 10 files
- Motivation: smoothies are single-step L2 blending — wrapping RAW in PF just for Lego compliance adds no value

### Decisions by CEO
- Boosters: protein, creatine, lion's mane (ежовик) — not spirulina/matcha
- Toppings: chia seeds, almond slices (decoration, not boosters)
- Format: fixed menu + lego constructor (customer can customize)
- Bases: milk, coconut milk, yogurt (3 options)
- Portion: 500ml
- Pineapple: regular freezer OK for smoothies (no blast freezer needed)
- Mango: chunks > puree for smoothies without banana/milk (body & texture)

### Pending
- Set price for Protein Peach Smoothie
- First purchase of new RAW items to populate WAC
- Lion's mane supplier search (not available at Makro)
- Creatine supplier (ON Creatine at Makro ฿1,900/600g)
