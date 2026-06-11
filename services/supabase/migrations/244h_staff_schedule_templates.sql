-- 244h_staff_schedule_templates.sql
-- Staff weekly schedule templates + closed-weekday config.
-- Powers the /hr/schedule "Generate Month" action and the /hr/attendance baseline.
--
-- Weekday encoding: JS getDay() 0..6 (0=Sun .. 6=Sat). ALL weekday logic lives in TypeScript;
-- never decode working_weekdays in SQL (PG DOW matches JS, but ISODOW does NOT — avoid both here).

CREATE TABLE IF NOT EXISTS staff_schedule_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  working_weekdays INT[] NOT NULL DEFAULT '{}',  -- JS getDay() 0..6; Tue-Sun (closed Mon) = {0,2,3,4,5,6}
  start_time TIME NOT NULL DEFAULT '08:00',
  end_time   TIME NOT NULL DEFAULT '17:00',
  break_minutes INT NOT NULL DEFAULT 60,
  location_id uuid REFERENCES locations(id),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- One active template per staff member (v1).
CREATE UNIQUE INDEX IF NOT EXISTS uq_template_active_per_staff
  ON staff_schedule_templates(staff_id) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_template_staff ON staff_schedule_templates(staff_id);

-- RLS mirrors the HR/shifts convention: anon read, authenticated write.
ALTER TABLE staff_schedule_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tmpl_read ON staff_schedule_templates;
DROP POLICY IF EXISTS tmpl_write ON staff_schedule_templates;
CREATE POLICY tmpl_read  ON staff_schedule_templates FOR SELECT USING (true);
CREATE POLICY tmpl_write ON staff_schedule_templates FOR ALL USING (auth.role() = 'authenticated');

-- Weekly closed day as a simple numeric config (JS getDay; 1 = Monday).
INSERT INTO payroll_config(key, value, description)
VALUES ('closed_weekday', 1, 'JS getDay() of the weekly closed day; 1=Monday')
ON CONFLICT (key) DO NOTHING;

INSERT INTO migration_log (filename, applied_by, checksum, notes)
VALUES (
  '244h_staff_schedule_templates.sql',
  'claude-code',
  NULL,
  'Staff weekly schedule templates + closed_weekday config; powers monthly schedule auto-generator and attendance baseline (MC 9d4da69d)'
)
ON CONFLICT DO NOTHING;
