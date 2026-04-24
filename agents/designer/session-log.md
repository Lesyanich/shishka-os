# Designer Session Log

Append-only хронология. Каждая сессия: date, ask, decisions, deliverables, follow-ups.

---

## 2026-04-24 — Roadmap redesign v1

**Ask (Леся).** Текущая страница `/roadmap` в admin-panel (deployed на Vercel feature-adminopening-roadmap) выглядит дефолтно. Нужен Pinterest-уровень, бренд-цвета + шрифты, интерактивная карта с процессами / целями / блокерами / стоперами, deep-links к задачам / меню / финансам.

**Design direction (approved via AskUserQuestion).**
- Формат: HTML-прототип (live preview), чтобы итерировать без React.
- Метафора: кулинарная карта / recipe journal — Alegreya, крафт-бумага, печати-штампы, chapter markers.
- Охват: параллельные треки (Menu / Finance / Training), отдельный модуль блокеров/стоперов, countdown до Lock Day (2026-04-28 — 4 дня).

**Decisions.**
1. Папка `agents/designer/` создана по паттерну `agents/chef/` — AGENT.md, brand-tokens.md, design-principles.md, designs/.
2. Brand tokens извлечены из `apps/admin-panel/src/index.css` (palette уже определена — не изобретаем заново). Добавлены status-semantic и motion tokens.
3. Прототип живёт в `agents/designer/designs/roadmap-v1/index.html`. Self-contained, открывается двойным кликом.
4. Deep-links: `/menu`, `/finance`, `/tasks/:id` — через существующий React Router в admin-panel. В прототипе — hrefs-заглушки, документированы в SPEC.md.

**Deliverables.**
- `agents/designer/AGENT.md` — identity агента.
- `agents/designer/brand-tokens.md` — source of truth по палитре/шрифтам/motion.
- `agents/designer/design-principles.md` — 7 принципов.
- `agents/designer/designs/roadmap-v1/index.html` — prototype.
- `agents/designer/designs/roadmap-v1/SPEC.md` — handoff spec.

**Follow-ups.**
- [x] Леся ревьюит прототип → feedback round 1 **получен** (см. v1.1 ниже).
- [ ] После approve — MC task "Implement roadmap-v1 redesign in OpeningRoadmap.tsx" под tech-lead.
- [ ] MC task: migrate admin-panel surfaces from `zinc/slate` to warmer-dark `--s-0..3` (CEO approved global adoption).
- [ ] MC task: add `owner` enum to `business_tasks` if missing.
- [ ] Собрать реальные блокеры из Mission Control и подставить в прототип.
- [ ] Рассмотреть customer-facing "public roadmap" вариант (cream paper).

---

## 2026-04-24 (evening) — Roadmap v1.1 iteration

**CEO feedback (4 вопроса → 4 ответа).**
1. Warmer-dark: **global, не только roadmap.**
2. Hero voice: **общий**, но каждому нужно быстро видеть свои задачи и переходить.
3. Supply track: **не делаем**, чтоб не перегружать.
4. Preview блюд в Phase 0: **ок, если красиво.**

**Changes shipped to `designs/roadmap-v1/index.html`.**
- **Persona switcher** в topbar (Lesya · Bas · Team) с radiogroup-поведением. `data-viewing-as` на `<body>` меняет подсветку задач и фильтрует My Line.
- **"My Line" panel** в правой колонке над Blockers — 11 персональных jump-links (task + phase chip + MC id + due/overdue). Это главный ответ на "быстро видеть свои задачи".
- **Owner chips** (20px круглые с инициалами L/B/KW/CO) на всех 14 задачах. Цвет по персоне.
- **Dish preview** внутри Phase 0 expanded state — 12 керамических plate-карт с лок-статусом (Locked/Tuning/Open), легендой, ссылками на `/menu#dish-NN`.
- `--brick-bright: #E27A7F` токен добавлен для контраста AA 6.82:1 на мелком тексте (старый `--brick-soft` давал 4.21:1).
- SPEC.md обновлён: добавлены секции 4b (persona-aware UI) и 4c (dish preview), changelog v1.1 вверху, resolved-decisions в п.12, handoff-чеклист расширен (persona source, dish-to-nomenclature mapping, surface migration).

**What v1.1 validated.**
- Теги сбалансированы (div/article/section/aside/button/ol/ul/li).
- Контрасты WCAG AA на всех текстовых парах.
- Countdown + persona switcher + phase toggle работают без внешних зависимостей.
- File size 83 КБ (прибавка 23 КБ на 12 dish cards + My Line + persona infra — оправдано).

**Learning for future tasks.**
- "Общий voice, но личный доступ" — частый паттерн. Решаем двумя инструментами: неизменный shared narrative + фильтрующий overlay (persona switcher). Не переписываем текст под каждого.
- Любое "добавить ещё один трек/секцию" — сначала вопрос "мы что-то убираем взамен?". Если нет, по умолчанию нет.

---

## 2026-04-24 (late evening) — Roadmap v1.2 (noise-reduction pass)

**CEO feedback (round 2, 8 пунктов).**
1. Summary strip (4 плашки) = шум, убрать.
2. Раскрываемое меню по категориям вместо grid — с подсветкой готовности per item.
3. Calendar хорош.
4. Deep Dives — не нужно.
5. My Line не понятно, взгляд теряется.
6. Логотип не наш — взять `01_Business/Branding/Logo iCone/Shishka-Kitchen-Logo-Icone-WG-24-12-25.png`.
7. Hero ("Chapter IV", "The Opening Journal", lede, signature) — лишнее.
8. Countdown → главная плашка, переформулировать: не "эксперименты заканчиваются", а "что должно быть готово ДО".

**Interpretation → design moves.**
- Основной вектор — снять всё декоративное, оставить только то, что отвечает на конкретный вопрос пользователя.
- Countdown становится primary и меняет семантику — это не таймер тревоги, это список работы. "Before Recipe Lock" + 5 must-do items.
- Menu accordion заменяет 12-plate grid. Категория-уровень даёт "готовность группы" за 1 взгляд, expand — детали per dish.
- My Line и persona switcher убраны полностью. Owner chips остались — они самый лёгкий ответ на "чья задача".
- Логотип встроен как base64 data URI (33 КБ b64 из 25 КБ PNG с transparent bg, обрезан до 160px).

**Shipped.**
- `agents/designer/designs/roadmap-v1/index.html` — полностью переписан. 103 КБ, теги сбалансированы, все фичи проверены.
- `SPEC.md` — changelog v1.2, новые секции 4a (Before Recipe Lock), 4b (menu accordion), updated IA diagram с "one question per section" framework, resolved-decisions round 2.

**Learning for future.**
- Когда CEO говорит "шум" — это почти всегда сигнал удалить целую секцию, а не подкрасить её. Добавь, уменьши, удали — удаление почти всегда выигрывает.
- Countdown без действия = тревожность. Countdown + конкретный список = инструмент. Это тот же компонент с перевёрнутой семантикой.
- Accordion vs grid: grid выигрывает когда элементов мало (≤ 6) и они равнозначны. Accordion выигрывает когда элементов много, они группируются, и группа сама по себе несёт информацию (readiness). 12 блюд в 6 категориях — случай accordion.
- Логотип-как-base64 — 33 КБ оправдан (self-contained HTML, нет внешних зависимостей, работает в offline/emailed preview).

---

## 2026-04-24 (late night) — Roadmap v1.2.1 + v1.3

**v1.2.1 — Calendar to top.**
CEO: "поставь календарь в начало". Calendar переехал из PART TWO в PART ONE, сразу под topbar. Reading order теперь: *orient (calendar) → focus (Before Lock) → drill (chapters)*. PART-нумерация и reveal-delays сдвинуты.

**v1.3 — Focus row pairing.**
CEO: "плашку Parallel Tracks убираем вовсе; Blockers & Stoppers добавим рядом с PRIMARY FOCUS".
- Parallel Tracks удалена целиком.
- Blockers вытащен из правого rail и поставлен рядом с Primary — `focus-row grid: minmax(0,1fr) 360px`, сворачивается в одну колонку ниже 1120px.
- Blockers переработан с tier-1 визуальной тяжестью: 24px радиус, тёплый gradient фон с красным акцентом, 1px градиентный бордер, тень как у Primary, Alegreya 28–36px заголовок. Восковая печать в углу, красная левая полоска у каждой строки блокера.
- Body-grid сплющен — chapters теперь во всю ширину.

**Learning for future.**
- Paired focus row — Primary (push forward) + Blockers (what's pushing back) рядом — мощный паттерн: обе стороны одного вопроса, ни одна не прячется. Визуальный приоритет обеих равный.
- "Убрать совсем" — часто правильнее чем "улучшить". Parallel Tracks не зарабатывали место → удалены.

---

## 2026-04-24 — v1.3 APPROVED ✓

**CEO:** "согласовано!"

Opening Roadmap redesign closed as shipped. 3 review rounds (v1 → v1.1 → v1.2/v1.2.1 → v1.3). Final state:
- Topbar (real logo) → Calendar (orient) → Focus Row (Primary + Blockers paired) → Chapters full-width (drill) → Footer.
- Brand-consistent, Pinterest-level, WCAG AA, self-contained 107 KB HTML, no external deps.

**Handed off to persistent memory** (`spaces/.../memory/`):
- `user_lesya.md` — who she is, how she reviews.
- `feedback_design_review_style.md` — approved/rejected patterns with rationale.
- `project_roadmap_v1_approved.md` — status + 5 ready follow-ups for React port.
- `reference_designer_files.md` — where brand tokens/logos live.

**Follow-ups opened in Mission Control** (CEO asked to file them, 2026-04-24):
1. `7710fe5a-5807-4b05-8df0-ca2aa64c8781` — Port Opening Roadmap v1.3 prototype into `OpeningRoadmap.tsx` — tech / high / code.
2. `deab9ec5-f1b8-4534-9cf5-94fea96076d3` — Promote warmer-dark surface tokens into admin-panel global `@theme` — tech / medium / code.
3. `94721aa8-4d90-47f0-a079-82b6bb5ce0fb` — DB migration: add `owner` enum to `business_tasks` for roadmap owner chips — tech / medium / code.
4. `4b3adb59-298c-4eb9-8575-7e5d3c59b3d0` — DB: add `is_critical_path` to `business_tasks` — powers Before Recipe Lock must-do list — tech / medium / code.
5. `8962a50d-cd4b-4f62-92b4-6f8cb6c5e840` — Explore customer-facing cream/paper variant of Opening Roadmap for public opening page — marketing / low / human.

All five land in `inbox` for Lesya's triage. SPEC at `agents/designer/designs/roadmap-v1/SPEC.md` is linked via `related_ids.spec_file` on each task.
