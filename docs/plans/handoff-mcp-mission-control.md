# Handoff: mcp-mission-control → Claude Code

> Скопируй этот промпт в Claude Code (Admin Panel Dev).
> Спека: `docs/plans/spec-mcp-mission-control.md`

---

## Промпт для Claude Code

```
Прочитай спеку docs/plans/spec-mcp-mission-control.md и реализуй её.

КРАТКО: нужно извлечь 4 Mission Control тула (emit_business_task, list_tasks, get_task, update_task) из services/mcp-chef/ в отдельный MCP-сервер services/mcp-mission-control/.

Порядок:
1. Создай services/mcp-mission-control/ — новый MCP-сервер (TypeScript, @modelcontextprotocol/sdk)
2. Скопируй 4 tool-файла из mcp-chef/src/tools/ (emit-business-task.ts, list-tasks.ts, get-task.ts, update-task.ts)
3. Скопируй lib/supabase.ts
4. Создай index.ts с регистрацией тулов
5. Создай package.json, tsconfig.json
6. npm install && npm run build — убедись что собирается
7. Удали 4 tool-файла и их импорты/регистрацию из mcp-chef
8. Удали lib/emit-task.ts из mcp-chef
9. npm run build в mcp-chef — убедись что собирается без MC tools
10. Протестируй: запусти mcp-mission-control, вызови list_tasks

ENV-переменные те же что у mcp-chef: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

После завершения:
- Используй emit_business_task через НОВЫЙ mcp-mission-control чтобы создать задачу:
  title: "Implement: Receipt Inbox Management UI"
  domain: "tech"
  status: "inbox"
  priority: "high"
  source: "owner"
  created_by: "coo"
  related_ids: { spec_file: "docs/projects/admin/plans/spec-inbox-management.md" }

- Обнови STATUS.md: добавь mcp-mission-control в Mission Control секцию
```
