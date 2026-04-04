# HR & Payroll Module — Technical Specification

> **MC Task:** 4c029fc0
> **Author:** COO (Cowork)
> **Date:** 2026-04-04
> **For:** Claude Code (terminal agent)

---

## 1. Контекст

Shishka Healthy Kitchen, Phuket (Rawai). 3 сотрудника (повара), фиксированная месячная ЗП (15K-18K THB).
Текущие проблемы:
- Нет учёта неявок, отгулов, полудней
- Нет учёта авансов (досрочных выплат части ЗП)
- Нет автоматического расчёта ЗП по факту отработанных дней
- Нет учёта соцстрахования

### Тайское трудовое законодательство (справочник для расчётов)

| Параметр | Значение |
|----------|---------|
| Рабочий день | max 8 часов |
| Рабочая неделя | max 48 часов (планируется снижение до 40) |
| Овертайм (будни) | ×1.5 от часовой ставки |
| Работа в выходной | ×2.0 от часовой ставки (стандарт), ×3.0 (сверх нормы) |
| Работа в праздник | ×2.0 (стандарт), ×3.0 (сверх нормы) |
| Макс овертайм | 36 часов/неделя |
| Минимальная ЗП (Koh Samui) | 400 THB/день |
| Больничные | до 30 дней/год с сохранением ЗП |
| Ежегодный отпуск | min 6 дней/год (после 1 года работы) |
| Личные дела | 3 дня/год |
| Social Security (SSF) | 5% employee + 5% employer, cap 17,500 THB/month → max 875 THB/month each (2026) |
| Тайские праздники | 13-16 дней/год (устанавливается ежегодно) |

---

## 2. Существующая схема (миграция 069)

Уже есть:
- `staff` — id, name, name_th, role, phone, pin_code, is_active
- `shifts` — staff_id, shift_date, start_time, end_time, break_minutes, status, notes
- `shift_tasks` — привязка смены к задачам/оборудованию
- `equipment_slots` — слоты загрузки оборудования

**Чего НЕТ:**
- Финансовые данные сотрудника (ставка, тип контракта)
- Типы отсутствий (больничный, отгул, полдня)
- Расчёт ЗП за период
- Авансы
- Social Security tracking

---

## 3. Миграция: Новые таблицы и изменения

### 3a. ALTER TABLE `staff` — добавить финансовые поля

```sql
ALTER TABLE staff
  ADD COLUMN IF NOT EXISTS monthly_salary NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hire_date DATE,
  ADD COLUMN IF NOT EXISTS contract_type TEXT NOT NULL DEFAULT 'monthly'
    CHECK (contract_type IN ('monthly', 'daily')),
  ADD COLUMN IF NOT EXISTS ssf_enrolled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS bank_account TEXT,
  ADD COLUMN IF NOT EXISTS notes TEXT;

COMMENT ON COLUMN staff.monthly_salary IS 'Fixed monthly salary in THB. For daily workers: daily_rate.';
COMMENT ON COLUMN staff.contract_type IS 'monthly = fixed salary, daily = paid per day worked.';
COMMENT ON COLUMN staff.ssf_enrolled IS 'Enrolled in Social Security Fund (5% employee + 5% employer).';
```

### 3b. CREATE TABLE `attendance_log` — учёт явки/неявки

```sql
CREATE TABLE attendance_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  log_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'present'
    CHECK (status IN (
      'present',       -- вышел на работу
      'absent_paid',   -- оплачиваемое отсутствие (больничный, отпуск)
      'absent_unpaid', -- за свой счёт
      'half_day',      -- полдня (0.5 рабочего дня)
      'day_off',       -- выходной (по графику)
      'holiday'        -- государственный праздник
    )),
  leave_type TEXT CHECK (leave_type IN (
    'sick',          -- больничный (до 30 дней/год оплачиваемый)
    'annual',        -- ежегодный отпуск (min 6 дней после 1 года)
    'personal',      -- личные дела (3 дня/год)
    'unpaid',        -- за свой счёт
    'maternity',     -- декрет
    'other'
  )),
  clock_in TIME,             -- фактическое время прихода
  clock_out TIME,            -- фактическое время ухода
  hours_worked NUMERIC GENERATED ALWAYS AS (
    CASE
      WHEN clock_in IS NOT NULL AND clock_out IS NOT NULL
      THEN EXTRACT(EPOCH FROM (clock_out - clock_in)) / 3600.0
      ELSE NULL
    END
  ) STORED,
  overtime_hours NUMERIC DEFAULT 0,   -- часы овертайма (заполняется вручную или RPC)
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(staff_id, log_date)  -- один лог на сотрудника в день
);

CREATE INDEX idx_attendance_staff_date ON attendance_log(staff_id, log_date);
CREATE INDEX idx_attendance_date ON attendance_log(log_date);
```

### 3c. CREATE TABLE `payroll_periods` — расчётные периоды

```sql
CREATE TABLE payroll_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start DATE NOT NULL,          -- 2026-04-01
  period_end DATE NOT NULL,            -- 2026-04-30
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'calculated', 'paid', 'closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ,
  notes TEXT,

  UNIQUE(period_start, period_end)
);
```

### 3d. CREATE TABLE `payroll_lines` — расчёт ЗП по сотруднику

```sql
CREATE TABLE payroll_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id UUID NOT NULL REFERENCES payroll_periods(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,

  -- Факт
  days_worked NUMERIC NOT NULL DEFAULT 0,        -- включая half_day как 0.5
  days_absent_unpaid NUMERIC NOT NULL DEFAULT 0,
  days_absent_paid NUMERIC NOT NULL DEFAULT 0,
  overtime_hours NUMERIC NOT NULL DEFAULT 0,

  -- Начисления
  base_salary NUMERIC NOT NULL DEFAULT 0,        -- monthly_salary из staff
  overtime_pay NUMERIC NOT NULL DEFAULT 0,       -- overtime_hours × rate × 1.5
  holiday_pay NUMERIC NOT NULL DEFAULT 0,        -- работа в праздники
  gross_salary NUMERIC NOT NULL DEFAULT 0,       -- base + overtime + holiday

  -- Удержания
  ssf_employee NUMERIC NOT NULL DEFAULT 0,       -- 5% от gross, max 875 THB
  advances_deducted NUMERIC NOT NULL DEFAULT 0,  -- сумма авансов за период
  other_deductions NUMERIC NOT NULL DEFAULT 0,

  -- Итого
  net_salary NUMERIC NOT NULL DEFAULT 0,         -- gross - deductions

  -- Мета
  calculated_at TIMESTAMPTZ,
  notes TEXT,

  UNIQUE(period_id, staff_id)
);

CREATE INDEX idx_payroll_lines_period ON payroll_lines(period_id);
```

### 3e. CREATE TABLE `salary_advances` — авансы

```sql
CREATE TABLE salary_advances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL,
  advance_date DATE NOT NULL,
  reason TEXT,
  deducted_in_period_id UUID REFERENCES payroll_periods(id),  -- NULL = ещё не вычтен
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_advances_staff ON salary_advances(staff_id);
```

### 3f. RLS для всех новых таблиц

```sql
ALTER TABLE attendance_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE salary_advances ENABLE ROW LEVEL SECURITY;

-- Read: authenticated only (финансовые данные — не анонимам)
CREATE POLICY "attendance_read" ON attendance_log FOR SELECT
  USING (auth.role() = 'authenticated');
CREATE POLICY "payroll_periods_read" ON payroll_periods FOR SELECT
  USING (auth.role() = 'authenticated');
CREATE POLICY "payroll_lines_read" ON payroll_lines FOR SELECT
  USING (auth.role() = 'authenticated');
CREATE POLICY "advances_read" ON salary_advances FOR SELECT
  USING (auth.role() = 'authenticated');

-- Write: authenticated only
CREATE POLICY "attendance_write" ON attendance_log FOR ALL
  USING (auth.role() = 'authenticated');
CREATE POLICY "payroll_periods_write" ON payroll_periods FOR ALL
  USING (auth.role() = 'authenticated');
CREATE POLICY "payroll_lines_write" ON payroll_lines FOR ALL
  USING (auth.role() = 'authenticated');
CREATE POLICY "advances_write" ON salary_advances FOR ALL
  USING (auth.role() = 'authenticated');
```

---

## 4. RPC: `fn_calculate_payroll`

Расчёт ЗП за период для одного сотрудника.

```sql
CREATE OR REPLACE FUNCTION fn_calculate_payroll(
  p_period_id UUID,
  p_staff_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_period payroll_periods%ROWTYPE;
  v_staff staff%ROWTYPE;
  v_total_days INTEGER;
  v_days_worked NUMERIC := 0;
  v_days_absent_unpaid NUMERIC := 0;
  v_days_absent_paid NUMERIC := 0;
  v_overtime_hours NUMERIC := 0;
  v_daily_rate NUMERIC;
  v_hourly_rate NUMERIC;
  v_base_salary NUMERIC;
  v_overtime_pay NUMERIC;
  v_gross NUMERIC;
  v_ssf_employee NUMERIC := 0;
  v_advances NUMERIC := 0;
  v_net NUMERIC;
BEGIN
  -- Load period and staff
  SELECT * INTO v_period FROM payroll_periods WHERE id = p_period_id;
  SELECT * INTO v_staff FROM staff WHERE id = p_staff_id;

  IF v_period IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Period not found');
  END IF;
  IF v_staff IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Staff not found');
  END IF;

  -- Total calendar days in period (for monthly rate proration)
  v_total_days := (v_period.period_end - v_period.period_start) + 1;

  -- Count attendance
  SELECT
    COALESCE(SUM(CASE
      WHEN status = 'present' THEN 1
      WHEN status = 'half_day' THEN 0.5
      ELSE 0
    END), 0),
    COALESCE(SUM(CASE WHEN status = 'absent_unpaid' THEN 1 ELSE 0 END), 0),
    COALESCE(SUM(CASE
      WHEN status = 'absent_paid' THEN 1
      WHEN status = 'holiday' THEN 1
      ELSE 0
    END), 0),
    COALESCE(SUM(overtime_hours), 0)
  INTO v_days_worked, v_days_absent_unpaid, v_days_absent_paid, v_overtime_hours
  FROM attendance_log
  WHERE staff_id = p_staff_id
    AND log_date BETWEEN v_period.period_start AND v_period.period_end;

  -- Calculate salary
  IF v_staff.contract_type = 'monthly' THEN
    -- Monthly: prorate by unpaid absences
    -- daily_rate = monthly_salary / total_days_in_month
    v_daily_rate := v_staff.monthly_salary / v_total_days;
    v_base_salary := v_staff.monthly_salary - (v_days_absent_unpaid * v_daily_rate);
  ELSE
    -- Daily: pay per day worked
    v_base_salary := v_days_worked * v_staff.monthly_salary; -- monthly_salary = daily_rate for daily workers
  END IF;

  -- Overtime: hourly_rate = monthly_salary / (total_days * 8), overtime at 1.5x
  v_hourly_rate := v_staff.monthly_salary / (v_total_days * 8);
  v_overtime_pay := v_overtime_hours * v_hourly_rate * 1.5;

  v_gross := v_base_salary + v_overtime_pay;

  -- Social Security Fund: 5% of gross, max 875 THB (2026 cap)
  IF v_staff.ssf_enrolled THEN
    v_ssf_employee := LEAST(v_gross * 0.05, 875);
  END IF;

  -- Advances: sum of non-deducted advances in this period
  SELECT COALESCE(SUM(amount), 0) INTO v_advances
  FROM salary_advances
  WHERE staff_id = p_staff_id
    AND advance_date BETWEEN v_period.period_start AND v_period.period_end
    AND deducted_in_period_id IS NULL;

  v_net := v_gross - v_ssf_employee - v_advances;

  -- Upsert payroll_line
  INSERT INTO payroll_lines (
    period_id, staff_id,
    days_worked, days_absent_unpaid, days_absent_paid, overtime_hours,
    base_salary, overtime_pay, holiday_pay, gross_salary,
    ssf_employee, advances_deducted, other_deductions,
    net_salary, calculated_at
  ) VALUES (
    p_period_id, p_staff_id,
    v_days_worked, v_days_absent_unpaid, v_days_absent_paid, v_overtime_hours,
    v_base_salary, v_overtime_pay, 0, v_gross,
    v_ssf_employee, v_advances, 0,
    v_net, now()
  )
  ON CONFLICT (period_id, staff_id) DO UPDATE SET
    days_worked = EXCLUDED.days_worked,
    days_absent_unpaid = EXCLUDED.days_absent_unpaid,
    days_absent_paid = EXCLUDED.days_absent_paid,
    overtime_hours = EXCLUDED.overtime_hours,
    base_salary = EXCLUDED.base_salary,
    overtime_pay = EXCLUDED.overtime_pay,
    gross_salary = EXCLUDED.gross_salary,
    ssf_employee = EXCLUDED.ssf_employee,
    advances_deducted = EXCLUDED.advances_deducted,
    net_salary = EXCLUDED.net_salary,
    calculated_at = now();

  -- Mark advances as deducted
  UPDATE salary_advances
  SET deducted_in_period_id = p_period_id
  WHERE staff_id = p_staff_id
    AND advance_date BETWEEN v_period.period_start AND v_period.period_end
    AND deducted_in_period_id IS NULL;

  RETURN jsonb_build_object(
    'ok', true,
    'staff_id', p_staff_id,
    'period', v_period.period_start || ' — ' || v_period.period_end,
    'days_worked', v_days_worked,
    'days_absent_unpaid', v_days_absent_unpaid,
    'overtime_hours', v_overtime_hours,
    'base_salary', v_base_salary,
    'overtime_pay', v_overtime_pay,
    'gross', v_gross,
    'ssf_employee', v_ssf_employee,
    'advances_deducted', v_advances,
    'net_salary', v_net
  );
END;
$$;
```

---

## 5. UI: Страница Staff & Payroll в admin-panel

### 5a. Вкладки

| Tab | Описание |
|-----|----------|
| **Staff** | Список сотрудников, карточка с ЗП/датой найма/SSF |
| **Attendance** | Календарь-таблица: дни × сотрудники, статусы цветом |
| **Payroll** | Расчёт ЗП за период: выбрать месяц → рассчитать → показать breakdown |
| **Advances** | Лог авансов: кому, сколько, когда, вычтен/нет |

### 5b. Attendance Calendar (основной рабочий инструмент)

```
         Пн  Вт  Ср  Чт  Пт  Сб  Вс
Сомчай   ✅  ✅  ✅  ❌  ✅  ✅  🔵
Нида     ✅  ✅  ½   ✅  ✅  🔵  ✅
Вин      ✅  ✅  ✅  ✅  ✅  ✅  🔵
```

Цвета/иконки:
- ✅ green = present
- ❌ red = absent_unpaid
- 🟡 yellow = absent_paid (sick/annual)
- ½ orange = half_day
- 🔵 blue = day_off
- 🟣 purple = holiday

**Клик по ячейке** → dropdown: выбрать статус + leave_type + notes.

### 5c. Payroll View

```
Период: Апрель 2026               [Рассчитать]

| Сотрудник | Ставка | Дни | Неявки | Овертайм | Gross   | SSF  | Аванс | NET     |
|-----------|--------|-----|--------|----------|---------|------|-------|---------|
| Сомчай    | 15,000 | 28  | 2      | 4h       | 14,000  | 700  | 3,000 | 10,300  |
| Нида      | 15,000 | 29.5| 0.5    | 0        | 14,750  | 738  | 0     | 14,012  |
| Вин       | 18,000 | 30  | 0      | 8h       | 18,900  | 875  | 5,000 | 13,025  |
```

---

## 6. Маршрут (route) и компоненты

| Путь | Компонент | Описание |
|------|-----------|----------|
| `/staff` | `StaffPage.tsx` | Shell с табами |
| — | `StaffList.tsx` | CRUD сотрудников |
| — | `AttendanceCalendar.tsx` | Календарь-таблица посещаемости |
| — | `PayrollView.tsx` | Расчёт и просмотр ЗП |
| — | `AdvancesLog.tsx` | Лог авансов |

Добавить в sidebar навигацию: иконка Users, label "Staff & Payroll".

---

## 7. Файлы для создания/изменения

| Файл | Действие |
|------|---------|
| `services/supabase/migrations/092_hr_payroll.sql` | CREATE — миграция (секции 3a-3f + RPC из секции 4) |
| `apps/admin-panel/src/pages/staff/StaffPage.tsx` | CREATE — shell с табами |
| `apps/admin-panel/src/pages/staff/StaffList.tsx` | CREATE — CRUD сотрудников |
| `apps/admin-panel/src/pages/staff/AttendanceCalendar.tsx` | CREATE — календарь |
| `apps/admin-panel/src/pages/staff/PayrollView.tsx` | CREATE — расчёт ЗП |
| `apps/admin-panel/src/pages/staff/AdvancesLog.tsx` | CREATE — авансы |
| `apps/admin-panel/src/App.tsx` (или router) | EDIT — добавить route `/staff` |
| `apps/admin-panel/src/components/Sidebar.tsx` (или nav) | EDIT — добавить пункт |
| `docs/domain/db-schema-summary.md` | EDIT — добавить HR Tables section |

---

## 8. Критические правила

1. **Миграция 092** — следующий номер после 091 (business_tasks).
2. **RLS** — финансовые данные ТОЛЬКО для authenticated. Не анонимам.
3. **SSF cap 2026** — max 875 THB/month (wage ceiling 17,500 THB). Hardcode с комментарием, обновлять ежегодно.
4. **Минимальная ЗП** — Koh Samui = 400 THB/день. Валидация при создании staff с contract_type=daily.
5. **Авансы** — при расчёте ЗП авансы за период автоматически вычитаются и помечаются `deducted_in_period_id`.
6. **Больничные** — до 30 дней/год оплачиваемые. Система должна считать использованные.
7. **Отпуск** — min 6 дней/год после 1 года работы. Проверять hire_date.
8. **Не пушить без:** обновления STATUS.md + db-schema-summary.md (Boris Rule #11).

---

## 9. Тестирование

1. Создать 3 сотрудников (15K, 15K, 18K monthly, SSF enrolled).
2. Заполнить attendance за апрель: один — 2 неявки unpaid, второй — полдня, третий — полный месяц + 8h overtime.
3. Создать аванс 3,000 THB для первого, 5,000 THB для третьего.
4. Вызвать `fn_calculate_payroll` для каждого.
5. Проверить: net = gross - ssf - advances, формулы соответствуют секции 4.
