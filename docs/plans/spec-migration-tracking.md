# Spec: Migration Tracking System

**MC Task:** `2ec33de6-3ef9-40d9-80e1-3a5ae7e45cdc`
**Priority:** high
**Domain:** tech
**Effort:** ~2 часа (Claude Code)

---

## Проблема

Миграции применяются вручную через Supabase Dashboard SQL Editor. Нет реестра: что применено, что нет, что крашнулось. Claude Code не может проверить состояние базы. CEO тратит время на ручную координацию.

## Решение

### 1. Таблица `migration_log`

```sql
CREATE TABLE public.migration_log (
  id          SERIAL PRIMARY KEY,
  filename    TEXT NOT NULL UNIQUE,       -- '093_mc_agile.sql'
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  applied_by  TEXT NOT NULL DEFAULT 'manual', -- 'manual', 'cli', 'ci'
  status      TEXT NOT NULL DEFAULT 'success'
              CHECK (status IN ('success', 'failed', 'rolled_back')),
  error_msg   TEXT,                       -- NULL if success
  checksum    TEXT,                       -- MD5 of file content for drift detection
  notes       TEXT
);
```

### 2. Seed: регистрация всех существующих миграций

Все 83 файла из `services/supabase/migrations/` (014–093) регистрируются как `status: 'success', applied_by: 'manual'`. Это baseline.

Генерация seed-данных: Claude Code читает список файлов и генерирует INSERT-ы.

### 3. Конвенция для новых миграций

Каждая новая миграция ОБЯЗАНА заканчиваться строкой:

```sql
-- Self-register
INSERT INTO migration_log (filename, applied_by, checksum)
VALUES ('NNN_description.sql', 'manual', 'CHECKSUM_PLACEHOLDER');
```

Claude Code при создании миграции:
1. Генерирует SQL
2. Вычисляет MD5 содержимого (без последней строки self-register)
3. Подставляет checksum в INSERT

### 4. MCP tool: `check_migrations`

Добавить в `services/mcp-mission-control/` (это инфраструктурный tool):

```typescript
server.tool("check_migrations",
  "Compare migration files on disk vs migration_log in DB. Returns: applied, pending, failed, checksum mismatches.",
  { /* no args */ },
  async () => {
    // 1. List files in services/supabase/migrations/*.sql
    // 2. Query migration_log
    // 3. Diff:
    //    - pending = files not in log
    //    - failed = log entries with status='failed'
    //    - drift = log entries where checksum != file MD5
    //    - applied = log entries with status='success'
    return { applied, pending, failed, drift };
  }
);
```

**Зависимость:** tool читает файловую систему → нужен доступ к `services/supabase/migrations/` из MCP процесса. Если MCP запускается из корня репо — путь относительный. Если нет — нужен env `MIGRATIONS_DIR`.

### 5. Обновление конституции

Добавить в `docs/constitution/p0-rules.md`:

```markdown
## Migration Tracking (Boris Rule #16)
Every migration file MUST end with a self-register INSERT into migration_log.
Before applying a migration manually, run check_migrations() to see pending list.
After applying, verify the migration registered itself: check_migrations() should show it as 'applied'.
If migration crashed mid-way — INSERT manually with status='failed' and error_msg.
```

---

## Порядок выполнения (Claude Code)

1. **Migration 094**: создать таблицу `migration_log` + seed всех 83 существующих файлов
2. **MCP tool**: `check_migrations` в `services/mcp-mission-control/`
3. **Constitution**: Boris Rule #16 в `p0-rules.md`
4. **Build + verify**: `npm run build`, вызвать `check_migrations()` — должен показать 0 pending (после apply 094)

## Acceptance Criteria

- [ ] `migration_log` содержит записи для всех 83 миграций (014–093) + себя (094)
- [ ] `check_migrations()` возвращает `{ applied: 84, pending: 0, failed: 0, drift: 0 }`
- [ ] Новая миграция без self-register INSERT видна как `pending` в `check_migrations()`
- [ ] Boris Rule #16 в конституции
- [ ] MC task closed
