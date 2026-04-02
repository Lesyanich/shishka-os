-- 069_staff_schedule.sql

-- Сотрудники
CREATE TABLE staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,               -- "Повар Сомчай"
  name_th TEXT,                     -- имя на тайском
  role TEXT NOT NULL DEFAULT 'cook' CHECK (role IN ('cook', 'sous_chef', 'admin', 'dishwasher', 'prep')),
  phone TEXT,                       -- для будущих уведомлений
  pin_code TEXT,                    -- 4-значный PIN для мобильного доступа
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Смены
CREATE TABLE shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  location_id UUID REFERENCES locations(id),
  shift_date DATE NOT NULL,
  start_time TIME NOT NULL,         -- 08:00
  end_time TIME NOT NULL,           -- 16:00
  break_minutes INT DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'confirmed', 'in_progress', 'completed', 'no_show')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_shifts_date ON shifts(shift_date);
CREATE INDEX idx_shifts_staff ON shifts(staff_id);

-- Привязка смены к задачам/оборудованию
CREATE TABLE shift_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id UUID NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
  production_task_id UUID REFERENCES production_tasks(id),
  equipment_id UUID REFERENCES equipment(id),
  task_description TEXT,             -- свободное описание, если нет production_task
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  priority INT DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'done')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_shift_tasks_shift ON shift_tasks(shift_id);

-- Слот загрузки оборудования (расширение существующей логики Gantt)
CREATE TABLE equipment_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id UUID NOT NULL REFERENCES equipment(id),
  slot_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  shift_task_id UUID REFERENCES shift_tasks(id),
  production_task_id UUID REFERENCES production_tasks(id),
  label TEXT,                        -- "Запекание курицы", свободный текст
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_eq_slots_date_eq ON equipment_slots(slot_date, equipment_id);

-- RLS: анонимный доступ для чтения (координационный дашборд /kitchen), полный для authenticated
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE shift_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment_slots ENABLE ROW LEVEL SECURITY;

-- Чтение для всех (открытый дашборд кухни /kitchen)
CREATE POLICY "staff_read_anon" ON staff FOR SELECT USING (true);
CREATE POLICY "shifts_read_anon" ON shifts FOR SELECT USING (true);
CREATE POLICY "shift_tasks_read_anon" ON shift_tasks FOR SELECT USING (true);
CREATE POLICY "equipment_slots_read_anon" ON equipment_slots FOR SELECT USING (true);

-- Запись только для authenticated
CREATE POLICY "staff_write_auth" ON staff FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "shifts_write_auth" ON shifts FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "shift_tasks_write_auth" ON shift_tasks FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "equipment_slots_write_auth" ON equipment_slots FOR ALL USING (auth.role() = 'authenticated');

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE shifts;
ALTER PUBLICATION supabase_realtime ADD TABLE shift_tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE equipment_slots;
