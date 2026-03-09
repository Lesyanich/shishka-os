-- Migration: 003_capex_analytics
-- Описание: Рефакторинг таблицы equipment (UUID PK), создание финансовой аналитики.
-- Автор: Lead Backend Developer
-- Дата: 2026-03-07

BEGIN;

-- 1. Рефакторинг таблицы equipment (TEXT PK -> UUID PK)
-- Шаг A: Переименовываем старый id (TEXT) в equipment_code
DO $$ 
BEGIN 
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='equipment' AND column_name='id' AND data_type='text') THEN
        ALTER TABLE equipment RENAME COLUMN id TO equipment_code;
        ALTER TABLE equipment ADD COLUMN id UUID PRIMARY KEY DEFAULT gen_random_uuid();
        -- Добавляем UNIQUE на equipment_code
        ALTER TABLE equipment ADD CONSTRAINT uq_equipment_code UNIQUE (equipment_code);
    END IF;
END $$;

-- Шаг B: Обновляем FK в maintenance_logs (если они были TEXT)
-- Поскольку мы изменили PK в equipment, нужно обновить ссылки
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='maintenance_logs' AND column_name='equipment_id' AND data_type='text') THEN
        -- Добавляем временную колонку
        ALTER TABLE maintenance_logs ADD COLUMN equipment_uuid UUID REFERENCES equipment(id);
        -- Маппим данные
        UPDATE maintenance_logs ml SET equipment_uuid = e.id FROM equipment e WHERE ml.equipment_id = e.equipment_code;
        -- Удаляем старую и переименовываем
        ALTER TABLE maintenance_logs DROP COLUMN equipment_id;
        ALTER TABLE maintenance_logs RENAME COLUMN equipment_uuid TO equipment_id;
        ALTER TABLE maintenance_logs ALTER COLUMN equipment_id SET NOT NULL;
    END IF;
END $$;

-- 2. Справочники финансов
CREATE TABLE IF NOT EXISTS fin_categories (
    code            INTEGER PRIMARY KEY,
    name            TEXT NOT NULL,
    type            TEXT NOT NULL CHECK (type IN ('Asset', 'Expense')),
    wht_percent     TEXT,
    comment         TEXT,
    created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fin_sub_categories (
    sub_code        INTEGER PRIMARY KEY,
    category_code   INTEGER REFERENCES fin_categories(code),
    name            TEXT NOT NULL,
    wht_percent     TEXT,
    created_at      TIMESTAMPTZ DEFAULT now()
);

-- 3. Активы (capex_assets)
CREATE TABLE IF NOT EXISTS capex_assets (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    equipment_id        UUID UNIQUE REFERENCES equipment(id), -- Ссылка на equipment (UUID)
    asset_name          TEXT NOT NULL,
    vendor              TEXT,
    initial_value       NUMERIC NOT NULL DEFAULT 0,
    residual_value      NUMERIC NOT NULL DEFAULT 0,
    useful_life_months  INTEGER NOT NULL DEFAULT 60,
    purchase_date       DATE,
    category_code       INTEGER REFERENCES fin_categories(code),
    created_at          TIMESTAMPTZ DEFAULT now()
);

-- 4. Транзакции (capex_transactions)
CREATE TABLE IF NOT EXISTS capex_transactions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id      TEXT UNIQUE NOT NULL,
    asset_id            UUID REFERENCES capex_assets(id),
    amount_thb          NUMERIC NOT NULL,
    transaction_date    DATE NOT NULL,
    transaction_type    TEXT NOT NULL CHECK (transaction_type IN ('purchase', 'repair', 'OpEx', 'upgrade')),
    category_code       INTEGER REFERENCES fin_categories(code),
    sub_category_code   INTEGER REFERENCES fin_sub_categories(sub_code),
    vendor              TEXT,
    details             TEXT,
    created_at          TIMESTAMPTZ DEFAULT now()
);

-- 5. Сид категорий
INSERT INTO fin_categories (code, name, type, wht_percent, comment) VALUES
(1000, 'Fixed Assets', 'Asset', '-', 'Depreciation 5-20% per year'),
(1100, 'Construction / Fit-out', 'Asset', '3%', 'L2 repair (windows, doors, ventilation hood).'),
(1200, 'Kitchen Equipment', 'Asset', '0%*', 'Ovens (L1-OVN-01), blast freezer (L1-BCH-01).'),
(1300, 'Furniture & Fixtures', 'Asset', '0%*', 'Salad bar counters L2, tables, decor.'),
(1400, 'IT Software License', 'Asset', '3%', 'AI system and POS.'),
(2000, 'Operating Expenses', 'Expense', '-', 'Expensed in current month'),
(2100, 'Rental (Space)', 'Expense', '5%', 'L1 and L2 rent.'),
(2200, 'Utilities', 'Expense', '0%', 'Electricity and Water.'),
(2300, 'Maintenance & Repair', 'Expense', '3%', 'Cleaning and regular service.'),
(2400, 'Marketing & Branding', 'Expense', '2%', 'Ads and branding.'),
(2500, 'Delivery / Logistics', 'Expense', '1%', 'Logistics.'),
(3000, 'Admin Expenses', 'Expense', '-', 'Legal integrity'),
(3100, 'Legal & Professional', 'Expense', '3%', 'Contracts, registration.'),
(3200, 'Visa & Work Permits', 'Expense', '0%', 'Gov fees.'),
(3300, 'Consulting Fees', 'Expense', '3%', 'Consultant payments.'),
(4000, 'Cost of Goods Sold', 'Expense', '-', 'Food cost'),
(4100, 'Raw Materials / Food', 'Expense', '0%', 'Produce, proteins.'),
(4200, 'Packaging / Takeaway', 'Expense', '0%', 'Containers.')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, type = EXCLUDED.type;

INSERT INTO fin_sub_categories (sub_code, category_code, name, wht_percent) VALUES
(1101, 1100, 'HVAC & Ventilation', '3 %'),
(1102, 1100, 'Electrical & Plumbing', '3 %'),
(1103, 1100, 'Interior Works', '3 %'),
(1201, 1200, 'Hot Line Equipment', '0%*'),
(1202, 1200, 'Cold Line Equipment', '0%*'),
(1203, 1200, 'Food Prep & Smallware', '0%*'),
(1301, 1300, 'Dining Furniture', '0%*'),
(1302, 1300, 'Custom Fixtures', '0%*'),
(1401, 1400, 'POS System', '3 %'),
(1402, 1400, 'AI & Analytics', '3 %'),
(2101, 2100, 'Monthly Rent', '5 %'),
(2102, 2100, 'CAM / Service Fees', '3 %'),
(2201, 2200, 'Electricity', '0 %'),
(2202, 2200, 'Water', '0 %'),
(2203, 2200, 'Internet', '0 %'),
(2301, 2300, 'AC Service', '3 %'),
(2302, 2300, 'Pest Control', '3 %'),
(2401, 2400, 'Digital Marketing', '2 %'),
(2402, 2400, 'Design & Print', '2 %'),
(2501, 2500, 'Fleet & Fuel', '0 %'),
(2502, 2500, 'Platform Commission', '1 %'),
(3101, 3100, 'Accounting & Tax', '3 %'),
(3102, 3100, 'Legal Fees', '3 %'),
(4101, 4100, 'Produce (Veg/Fruit)', '0 %'),
(4102, 4100, 'Proteins (Meat/Fish)', '0 %'),
(4103, 4100, 'Grains & Superfoods', '0 %'),
(4201, 4200, 'Bowls & Containers', '0 %'),
(4202, 4200, 'Cutlery & Napkins', '0 %')
ON CONFLICT (sub_code) DO UPDATE SET name = EXCLUDED.name;

-- 6. View для расчета почасовой амортизации
CREATE OR REPLACE VIEW v_equipment_hourly_cost AS
SELECT 
    e.id AS equipment_id,
    e.equipment_code,
    e.name AS equipment_name,
    ca.initial_value,
    ca.residual_value,
    ca.useful_life_months,
    e.daily_availability_min,
    ca.category_code,
    ROUND(
        (ca.initial_value - ca.residual_value) / 
        NULLIF(ca.useful_life_months * 30.0 * (e.daily_availability_min / 60.0), 0), 
        4
    ) AS operational_hourly_cost
FROM equipment e
JOIN capex_assets ca ON ca.equipment_id = e.id;

COMMIT;
