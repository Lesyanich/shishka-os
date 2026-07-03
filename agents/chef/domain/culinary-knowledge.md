# Culinary Thinking — Shishka Healthy Kitchen

> Принципы мышления AI-шефа. НЕ база данных ингредиентов.
> Источники: The Flavor Bible, McGee, Ruhlman, Nosrat, Noma, Modernist Cuisine + Shishka Bible.
> Фокус: healthy kitchen, Rawai (Phuket), Thai + Mediterranean + Arab-Russian fusion.

## Философия: думай как повар, не как справочник

Шеф Shishka не зубрит паринги — он РАССУЖДАЕТ. Каждое решение проходит через 7 принципов.
Если принципы не дают ответа → WebSearch. Галлюцинация о еде = потерянные деньги.

---

## 7 принципов мышления

### 1. Текстурный анализ

Перед рекомендацией любого ингредиента — оцени физическую текстуру:
- Волокнистый/жёсткий стебель? → термообработка обязательна (stir-fry, blanch, braise)
- Нежный лист? → сырой в салат, или быстрый blanch
- Хрупкий/хрустящий? → использовать как Finish (crunch element)
- Крахмалистый? → запекание или варка для раскрытия
- Водянистый/сочный? → сырой или быстрый wok, не тушить (развалится)

Пример: Morning Glory (ผักบุ้ง) — полый жёсткий стебель → ТОЛЬКО stir-fry или blanch, НИКОГДА сырой в салат.
Пример: Baby spinach — нежный лист → сырой ок, или wilted (30 сек).
Пример: Green papaya — плотная, хрустящая → шинковать тонко для som tum (салат), не варить.

**Правило:** если не знаешь текстуру ингредиента — WebSearch перед рекомендацией.

### 2. Культурный контекст

Как этот ингредиент используют в кухне региона, где мы работаем (Пхукет, Таиланд)?
- Тайские ингредиенты имеют устоявшиеся методы приготовления — уважай их
- Fusion допустим, но ТОЛЬКО после понимания традиционного использования
- Если не знаешь традицию → WebSearch "how to cook [ingredient] Thai cuisine"

Пример: Banana flower (หัวปลี) — в тайской кухне: салат yam hua plee, но нужна кислая вода от потемнения.
Пример: Kaffir lime leaves (ใบมะกรูด) — аромат, не едят целиком; тонко нашинковать или удалить перед подачей.
Пример: Galangal (ข่า) — жёстче имбиря, не натирают; режут слайсами для тон-яма, удаляют перед едой.

### 3. Баланс 5+1 вкусов

Каждое блюдо Shishka балансирует минимум 3 из 6 осей:

| Ось | Роль | Shishka-примеры |
|-----|------|----------------|
| Sweet | Глубина, баланс кислоты | Мёд, финики, карамелизация, кокосовый сахар |
| Sour | Яркость, свежесть | Лимон/лайм, уксус, ферменты, тамаринд |
| Salty | Усиление вкуса | Морская соль, тамари, мисо, fish sauce |
| Spicy | Тепло, метаболизм | Чили, имбирь, чёрный перец, галангал |
| Bitter | Сложность, контраст | Руккола, куркума, цедра, тёмная зелень |
| Umami | Глубина, "craveability" | Мисо, грибы, томат-паста, ферменты, nori |

Диагностика: "плоское" → добавь sour. "Скучное" → добавь umami. "Однотонное" → добавь bitter или spicy.

### 4. CBS Axis (Culinary Booster System)

Каждое блюдо Shishka строится по 3 осям бустеров:
- **Axis A: Foundation** (Acid / Fat / Salt) — несёт вкус, балансирует
- **Axis B: Accents** (Aroma / Umami) — глубина без MSG/сахара
- **Axis C: Finish** (Texture / Heat / Sweet) — эмоциональный отклик, crunch

Если блюдо "не работает" → проверь: какая ось отсутствует?
Подробности CBS → `docs/bible/menu-concept.md`

### 5. Research-First (исследуй, не галлюцинируй)

Незнакомый ингредиент → СТОП → WebSearch:
1. "How is [ingredient] traditionally prepared?"
2. "Is [ingredient] safe to eat raw?"
3. "Flavor pairings for [ingredient]"

Только после ответов — рекомендуй.
**Незнание — не ошибка. Галлюцинация — ошибка. Галлюцинация о еде — деньги на помойку.**

### 6. Waste-First (что есть → что из этого можно)

Перед тем как предложить новый ингредиент → проверь:
- Что есть в наличии? (`check_inventory`)
- Что есть в surplus / скоро истекает?
- Можно ли использовать обрезки/стебли/кожуру?

Обрезки → бустеры:
- Стебли кинзы/петрушки → Green Gold Oil
- Broccoli stems → ферментация → Shishka Dust
- Цедра цитрусов → сушка → finishing dust
- Кожура тыквы → запекание → чипсы или крем-суп

### 7. Сезонность Пхукета

80% меню = стабильное Core (круглый год). 20% = сезонная ротация.
Wet season (май-ноябрь) / Dry season (декабрь-апрель) влияют на cost и quality.
Если не знаешь сезонность конкретного продукта на Пхукете → WebSearch.
Подробности → `docs/bible/kitchen-philosophy.md` §7

---

## Applied reasoning principles (8–10) — derived from the science base

> These turn the mechanisms in [`knowledge/food-science.md`](knowledge/food-science.md) and [`knowledge/process-technology.md`](knowledge/process-technology.md) into hard design decisions. Written in English (Language Contract). **Each principle cites the mechanism that justifies it — reason from the mechanism, never from a memorized product rule.**

### 8. Heat-Cycle Budget

*Derives from: protein moisture-expulsion + cumulative water loss (`food-science.md` §1–2), regen≠cook (`food-science.md` §7).*

- Every **full cook cycle** permanently expels water from muscle fiber; losses stack and never come back.
- **Budget: ONE cook cycle per protein per L1→L2 chain. Maximum two only with written justification.**
- A **Merrychef regeneration** (≤60–90s reheat of already-cooked food to ~74°C) is a REGEN, not a cook cycle.
- The **lava-grill char** is a FINISH, not a cook cycle — but it must be laid down **at L1, where the grill is** (sear-first, "90% Cooked"). There is **no grill at L2**, so a char step can NEVER be scheduled at L2. (This is the equipment rule — see Principle 10 and `process-technology.md` §3.)
- **`cook → chill/freeze → cook again` is auto-rejected.** Any flow with two full cooks separated by chilling/freezing = wrong design (this is the triple-heat chicken failure: sous-vide + lava-grill at L1 + freeze + re-grill at L2 = 3 cycles = dry "sole leather").

### 9. Delicate-Protein Classification

*Derives from: denaturation ladder + albumin bleed (`food-science.md` §2), ice-crystal rupture + cook-then-freeze (`food-science.md` §9), carryover (`food-science.md` §7).*

| Class | Examples | Rule |
|---|---|---|
| **Delicate** | salmon, white fish, shrimp, seafood | **Cook-to-order** from raw (fresh or IQF-raw) portions. **Never cook-then-freeze-then-reheat** — albumin bleed + mushy texture. Portion raw, freeze raw, finish at service with color. |
| **Intermediate** | chicken breast (lean) | **L1 lava-grill flash-char (~45s, sear-first)** → sous-vide **62°C** at L1 → blast-chill/freeze → **L2 Merrychef regen only**. Never re-grill or char at L2 — there is no grill there. (Canonical flow: `process-technology.md` §4.) |
| **Robust** | chicken thigh, braises, stews, legumes, grains | Full cook-chill candidates; collagen/gelatin holds water through reheat. |

This is why expensive salmon (599฿/kg) is destroyed by a sous-vide-then-freeze-then-reheat plan, and why it must be cooked to order (52°C, sear for color).

### 10. L1 Unloads L2 + Equipment Reality (flavor is built where the equipment is)

*Derives from: cook-chill model + regen physics (`knowledge/process-technology.md` §0–4), heat transfer (`food-science.md` §7), and the physical [`operations.md`](../../../docs/bible/operations.md) equipment map.*

- L1 produces and preserves; **L2 assembles and regenerates only.**
- **Test:** if a proposed flow requires L2 to *cook or char* (not assemble/regen), the design is wrong — redo it. It duplicates work, slows the service line, and defeats the central-kitchen model.
- **Equipment Reality (the fix for "Infrastructural Blindness"):** for **every** heat / char / finish step, name the specific machine **and its zone**, then verify that machine physically lives in that zone (`operations.md` Equipment-by-Zone table). **The Lava Grill (`L1-LAVA-GRILL-650-33`) is L1-only. L2 has NO grill** — only a Merrychef (regen), a flat contact/breakfast griddle, and salad bars. So any char/smoke step is **L1**; a "sear at L2" is physically impossible and a hallucination.
- **The one L2 cooking exception** is a **delicate cook-to-order** protein (e.g. salmon, P9) finished to order on the L2 flat griddle / Merrychef — a gentle pan-sear, **never** a lava char (there is no lava grill at L2). All cook-chill items: L2 regenerates only; the char was already laid down at L1.

---

## Fat Decision Tree — pick the fat by chemistry and function, never by panic

*Derives from: refining chemistry + smoke points (`food-science.md` §3); brand policy in [`docs/bible/kitchen-philosophy.md`](../../../docs/bible/kitchen-philosophy.md) §2.*

Walk the steps in order; stop at the first that decides:

1. **Clean-label filter.** Is it an RBD / solvent-extracted seed or grain oil (soy, canola/rapeseed, sunflower, corn, **rice bran**)? → **BANNED, stop.** (The extraction process is the objection — see `food-science.md` §3.)
2. **Line-compatibility filter.** Vegan line, or a component shared into vegan dishes? → **plant fats only.** Animal fats (ghee, duck fat, butter, lard) are **GATED**: never proposed unprompted, non-vegan dishes only, and only with explicit CEO approval.
3. **Function filter.** Then choose by job:
   - High-heat grill/sear → **refined avocado oil** (~271°C smoke point).
   - Neutral marinade / freeze-stable base → **deodorized coconut oil** (approved refined exception).
   - Dressing / finishing / low heat → **Extra Virgin Olive Oil**.

Failure this prevents: recommending refined rice bran oil (fails step 1), then panicking into duck fat/ghee (fails step 2). The tree goes straight from "no seed oil" to "avocado / deodorized coconut."

---

## Grounding rule for ALL process recommendations

**When you recommend a process or handling step, name the chemical or physical mechanism that makes it correct** (cite the relevant `food-science.md` / `process-technology.md` section). If you cannot name the mechanism → WebSearch before recommending. Hand-waving is a hallucination; a hallucination about food is money in the bin.

---

## Справочник: физика еды (неизменные константы)

> Deep mechanisms now live in [`knowledge/food-science.md`](knowledge/food-science.md). The constants below are the quick bench reference.

### Реакция Майяра
- Начало от 140°C, пик вкуса 150-180°C
- Требует: белки + сахара + СУХАЯ поверхность
- Практика: промокнуть перед грилем, не перегружать сковороду

### Карамелизация
- Сахара без белков, от 160°C
- Практика: запечённая тыква (PF-BAKED_PUMPKIN) — 180-200°C, 30-40 мин

### Денатурация белков
- Курица: 65°C начало, 74°C безопасность, >80°C сухость
- Sous-vide оптимум: 63-65°C, 1.5-2ч (грудка)
- Лосось: 45°C rare, 52°C medium, 60°C well done

### Ферментация
- Лакто-ферментация: Lactobacillus + анаэробная среда + 2% соли + 18-22°C
- Результат: пробиотики, витамин K2, повышенная биодоступность
- Shishka: PF-FERMENTED_CABBAGE — ключевой элемент healthy kitchen

### Базовые Ratios (Ruhlman)

| Продукт | Ratio | Примечание |
|---------|-------|-----------|
| Дрессинг | 3 fat : 1 acid | Оливковое масло + лимон/уксус |
| Бульон (овощной) | 1 kg овощей : 1.5 L воды | 45-60 мин, не больше |
| Маринад | 3 oil : 1 acid : aromatics | Мясо 2-24ч, овощи 30 мин |
| Крем-суп | 1 основа : 0.3 жидкость : 0.1 fat | Проверить текстуру после блендера |
| Лакто-ферментация | 2% salt от веса | 5-14 дней, 18-22°C |

### Эмульсии
- Стабильные: масло-в-воде + эмульгатор (горчица, тахини, мисо)
- Без эмульгатора → расслаивание за 30 мин

---

## Food Safety & Shelf-Life Rules

> Hard limits that override culinary creativity. Loaded separately.
> → `agents/chef/domain/food-safety-rules.md`
