# HANDOVER — Architectural Cleanup & Dynamic BOM Ready
**Date:** 2026-03-07
**From Agent:** Backend Specialist (@backend-specialist)
**Status:** ✅ PHASE 0-4 COMPLETE (Supabase P0 Refactoring)

---

## Что выполнено (Architectural Refactoring)

1. **Единая Номенклатура (`nomenclature`)**:
   - Таблицы `products` и `nomenclature_sync` объединены.
   - Первичный ключ (PK) переведен на **UUID**.
   - `product_code` теперь является уникальным индексом.

2. **UUID Compliance (P0 Integrity)**:
   - `daily_plan.id` и `recipes_flow.id` переведены с INTEGER на **UUID**.
   - Все внешние ключи (FK) в `production_tasks` обновлены.

3. **Динамический BOM (Proportional Model)**:
   - Создана таблица `bom_structures` для хранения пропорций (на 1 ед. выхода).
   - Ингестированы рецепты: **Baked Pumpkin** и **Pumpkin Coconut Soup**.

4. **Генератор Заданий (RPC)**:
   - Внедрена функция `fn_generate_production_order(p_plan_id UUID)`.
   - Функция автоматически пересчитывает веса ингредиентов на основе `target_quantity` и записывает их в инструкции повара.

## Что сделано в Obsidian
- Создана папка `/02_Obsidian_Vault/01_Menu/`.
- Добавлены карточки рецептов: [[PF_BAKED_PUMPKIN]], [[PF_PUMPKIN_COCONUT_BASE]].
- Создан Мастер-индекс: [[MENU_MASTER_INDEX]].

## Что нужно сделать следующему агенту
1. **Frontend Specialist**: Обновить KDS Dashboard, чтобы выводить поле `description` из `production_tasks` (там теперь список ингредиентов с весами).
2. **Data Auditor**: Проверить точность `standard_output_qty` для всех существующих блюд в новой таблице `nomenclature`.
3. **Chef**: Продолжить ингестию ТТК для других блюд (Ancient Crunch, Green mix) в `bom_structures`.

## Блокеры
- Нет. Все миграции (005-011) успешно применены.

---

# HANDOVER — Phase 5: Control Center & BOM Hub (Frontend)
**Date:** 2026-03-08
**From Agent:** Claude Sonnet 4.6 (Lead Frontend Architect)
**Status:** ✅ PHASE 1 COMPLETE (CEO Dashboard + BOM Hub LIVE)

---

## Что выполнено (Phase 5, Stage 1)

### 1. CEO Control Center (`/`)
Создан полноценный дашборд с 5 виджетами, каждый из которых загружает данные напрямую из Supabase через кастомный React-хук:

- **HeroKPIRow** — 4 KPI-карточки: статус задач на кухне (из `production_tasks`), CapEx текущего месяца (из `capex_transactions`), количество оборудования (из `equipment`), % покрытия BOM (из `nomenclature` + `bom_structures`). Каждая карточка имеет skeleton-loader и цветовую индикацию.
- **KitchenStatusKanban** — 3-колоночная Kanban-доска (Pending / In Progress / Completed) с карточками задач из `production_tasks`. Включает описание задачи, временную метку, кнопку Refresh.
- **CapExMiniChart** — recharts BarChart, показывающий распределение расходов по категориям из `fin_categories`. Graceful degradation при пустых данных.
- **EquipmentAlerts** — список оборудования с приоритизацией по `last_service_date`. Логика: >90 дней = overdue (красный), >72 дня = warning (жёлтый), иначе ok (зелёный).
- **BOMHealthBar** — прогресс-бар покрытия BOM для SALE-блюд. Кликабельный список блюд без рецептуры → навигация в `/bom`.

### 2. BOM Hub (`/bom`)
Существующий `RecipeBuilder.tsx` обёрнут в страницу `BOMHub.tsx` и подключён к роуту `/bom`. Функционал CRUD для `nomenclature` и `bom_structures` сохранён.

### 3. AppShell (Navigation)
Создан layout `AppShell.tsx` с боковым сайдбаром (6 модулей ERP) и верхней панелью. Используются `NavLink` из `react-router-dom` для deep linking. Disabled-модули (KDS, Waste, Finance, Analytics) отображаются серыми с `cursor-not-allowed`.

## Стек (подтверждение)

| Технология | Версия | Роль |
|---|---|---|
| React | 19.2.0 | UI framework |
| Vite | 7.3.1 | Dev server + bundler |
| TailwindCSS | 4.2.1 | Styling (@tailwindcss/vite, no config file) |
| react-router-dom | latest | NEW — Deep Linking / BrowserRouter |
| recharts | latest | NEW — BarChart для CapEx аналитики |
| lucide-react | 0.577.0 | Icons |
| @supabase/supabase-js | 2.98.0 | SSoT database client |

## Бизнес-логика: Данные → UI

**production_tasks → KitchenStatusKanban + HeroKPIRow:**
Хук `useKitchenTasks` загружает все 69 задач, группирует по `status` (pending/in_progress/completed) и вычисляет counts. Kanban-доска отображает задачи по колонкам с time-ago вычислением на клиенте.

**capex_transactions + fin_categories → CapExMiniChart + HeroKPIRow:**
Хук `useCapEx` делает 2 параллельных запроса (transactions + categories) и объединяет в JavaScript. Месячный total вычисляется фильтрацией по `transaction_date` текущего месяца. Chart группирует по `category_name` (топ-8 для читабельности).

**equipment → EquipmentAlerts + HeroKPIRow:**
Хук `useEquipment` загружает 76 единиц, вычисляет `serviceStatus` для каждой на основе `last_service_date` (порог: 90 дней = overdue, 72 дня = warning). Алерты отсортированы по приоритету.

**nomenclature + bom_structures → BOMHealthBar + HeroKPIRow:**
Хук `useBOMCoverage` загружает все SALE-* блюда из `nomenclature`, затем проверяет наличие записей в `bom_structures` для каждого `parent_id`. Вычисляет % покрытия и список missing dishes.

## Технические "хвосты" (Technical Debt)

1. **Размер бандла (797KB):** recharts добавляет ~300KB. Решение: `React.lazy(() => import('./CapExMiniChart'))` + `<Suspense>`. Запланировано на Phase 2.
2. **Нет auto-refresh:** Данные загружаются один раз при монтировании компонента. Решение: Supabase Realtime (`supabase.channel().on('postgres_changes')`) — Phase 2.
3. **Нет date range picker:** CapExMiniChart показывает all-time данные. Глобальный DateRangePicker с фильтрацией по периоду — Phase 2.
4. **RLS:** Admin-panel использует `anon` key с full CRUD (migration 014). Для продакшна нужна аутентификация через `set_request_context()`.

## Что нужно сделать следующему агенту

1. **Phase 2 (KDS):** Добавить Gantt-диаграмму для планирования задач на оборудовании. Нужна миграция: добавить `equipment_id`, `start_time`, `duration_min` в `production_tasks`.
2. **Lazy Loading:** Обернуть recharts-виджеты в `React.lazy()` для оптимизации бандла.
3. **Supabase Realtime:** Подписка на изменения `production_tasks` для живого обновления Kanban-доски.
4. **Nutrition Fields:** Добавить `calories`, `protein`, `fat`, `carbs`, `allergens[]` в `nomenclature` для NutritionCascade.

## Блокеры
- Нет. TypeScript build проходит чисто (0 ошибок). `npm run dev` стартует без проблем.

---

# HANDOVER — Phase 2: Smart Kitchen & KDS
**Date:** 2026-03-09
**From Agent:** Claude Opus 4.6 (Lead Frontend Architect)
**Status:** ✅ PHASE 2 COMPLETE (KDS Gantt + Cook Station LIVE)

---

## Что выполнено (Phase 2)

### 1. Migration 016: KDS Scheduling
Добавлены 6 колонок в `production_tasks`: `scheduled_start`, `duration_min`, `equipment_id` (FK→equipment), `theoretical_yield`, `actual_weight`, `theoretical_bom_snapshot` (JSONB). Созданы индексы для быстрого Gantt-запроса. Включён Supabase Realtime для `production_tasks`.

### 2. RPC `fn_start_production_task(UUID)`
PostgreSQL функция: при вызове ставит `status='in_progress'`, записывает `actual_start=now()`, находит BOM через цепочку `flow_step_id→recipes_flow.product_code→nomenclature→bom_structures` и замораживает его в `theoretical_bom_snapshot` JSONB.

### 3. CEO Gantt (`/kds`)
24-часовая временная шкала. Y-axis = оборудование (фильтрация по категориям). Задачи позиционируются CSS-процентами: `left=(startMin/1440)*100%`, `width=(durationMin/1440)*100%`. Конфликты (overlap) обнаруживаются O(n²) per equipment group и подсвечиваются rose-кольцом + баннером.

### 4. Cook Station (`/cook`)
Mobile-first интерфейс для поваров (iPad-optimized). Start → вызывает RPC, запускает setInterval-таймер. Complete → открывает модал для ввода `actual_weight`. DeviationBadge показывает variance в реальном времени: ≤5% emerald, 5-10% amber, >10% rose. BOM Snapshot Panel показывает замороженные ингредиенты.

### 5. Supabase Realtime
`useGanttTasks` и `useCookTasks` подписываются на `postgres_changes` для таблицы `production_tasks`. Gantt и Cook Station обновляются без перезагрузки страницы.

## Бизнес-логика: Данные → UI (Phase 2)

**production_tasks + equipment → GanttTimeline:**
Хук `useGanttTasks` загружает задачи с `scheduled_start IS NOT NULL`, группирует по `equipment_id`. Conflict detection: задачи сортируются по start time внутри каждого equipment, overlap = `bStart < aEnd`. GanttRow рендерит TaskBar'ы с абсолютным CSS-позиционированием.

**production_tasks → TaskExecutionCard (Cook Station):**
Хук `useCookTasks` загружает задачи со статусом `pending` / `in_progress`. Start → `supabase.rpc('fn_start_production_task')`. Complete → `supabase.from('production_tasks').update({status:'completed', actual_end, actual_weight})`. Realtime обновляет список автоматически.

**Variance Calculation (DeviationBadge):**
`variance = ((actual / expected) - 1) * 100%`. Порог: ≤5% = OK, 5-10% = Warning, >10% = Alert. Применяется к времени (elapsed vs duration_min) и весу (actual_weight vs theoretical_yield).

## Технические "хвосты" (Technical Debt)

1. **Размер бандла (815KB):** Выросло с 797KB до 815KB. Решение: `React.lazy()` + code splitting.
2. **Нет drag & drop:** Gantt показывает задачи, но CEO не может перетаскивать их для rescheduling. Phase 3+.
3. **Нет group-by-date:** Gantt показывает только текущий день. Нужен date picker для навигации.
4. **Equipment assignment UI:** Сейчас `scheduled_start` и `equipment_id` устанавливаются только через SQL. Нужна UI-форма.

## Что нужно сделать следующему агенту

1. **Phase 3 (Waste):** Создать таблицу `waste_log`, UI для логирования отходов, Par Level калькулятор.
2. **Lazy Loading:** Обернуть recharts и KDS компоненты в `React.lazy()`.
3. **Gantt Drag & Drop:** Позволить CEO перемещать задачи на таймлайне.
4. **Task Assignment Form:** UI для назначения `scheduled_start`, `equipment_id`, `duration_min`.

## Блокеры
- Нет. TypeScript build проходит чисто (0 ошибок). Vite build 815KB (warning, not error).
