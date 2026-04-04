# Spec: download_receipt — MCP Finance Tool

> Task: [f7964c5a](mission-control) | Priority: high | Domain: tech
> Created: 2026-04-04 | Author: COO

## Problem

Финансовый агент не может автономно обрабатывать чеки из `receipt_inbox`.
При попытке прочитать фото чека из Supabase Storage агент использует WebFetch,
который заблокирован egress-настройками Cowork. MCP `shishka-finance` — **write-only**
по отношению к Storage: есть `upload_receipt`, но нет обратного инструмента.

## Solution

Новый MCP-инструмент `download_receipt` в `services/mcp-finance/`.
Скачивает файл из Supabase Storage через серверный API (Service Role Key)
и возвращает содержимое в base64 — агент получает изображение без egress.

## API Design

```typescript
// Tool name: "download_receipt"
// Description: "Download receipt image from Supabase Storage by storage path or public URL.
//              Returns base64-encoded content for agent to read/parse.
//              Use after check_inbox to read receipt photos."

// Parameters:
{
  storage_path: z.string()
    .describe("Storage path (e.g. 'receipts/inbox/1775302732437_0_rrdarx.jpg' or 'img/17753..._0_abc.jpg'). Also accepts full public URL — path will be extracted automatically."),
}

// Returns:
{
  ok: boolean,
  storage_path: string,       // normalized path
  content_type: string,       // "image/jpeg", "image/png", etc.
  size_kb: number,
  base64: string,             // base64-encoded file content
  error?: string,             // only if ok=false
}
```

## Implementation

### File: `src/tools/download-receipt.ts`

```typescript
import { getSupabase } from "../lib/supabase.js";

const BUCKET = "receipts";
const MAX_DOWNLOAD_SIZE = 10 * 1024 * 1024; // 10MB safety limit

// Accept both storage_path and full public URL
function extractStoragePath(input: string): string {
  // If it's a full URL, extract path after /storage/v1/object/public/receipts/
  const urlPattern = /\/storage\/v1\/object\/public\/receipts\/(.+)$/;
  const match = input.match(urlPattern);
  if (match) return match[1];

  // If starts with bucket name, strip it
  if (input.startsWith("receipts/")) return input.slice("receipts/".length);

  // Otherwise use as-is (already a relative path within bucket)
  return input;
}

export async function downloadReceipt(args: { storage_path: string }) {
  const storagePath = extractStoragePath(args.storage_path);

  const sb = getSupabase();
  const { data, error } = await sb.storage
    .from(BUCKET)
    .download(storagePath);

  if (error) {
    return {
      ok: false,
      storage_path: storagePath,
      error: `Download failed: ${error.message}`,
    };
  }

  const buffer = Buffer.from(await data.arrayBuffer());

  if (buffer.length > MAX_DOWNLOAD_SIZE) {
    return {
      ok: false,
      storage_path: storagePath,
      error: `File too large: ${(buffer.length / 1024 / 1024).toFixed(1)}MB`,
    };
  }

  // Detect content type from extension or blob type
  const contentType = data.type || "application/octet-stream";

  return {
    ok: true,
    storage_path: storagePath,
    content_type: contentType,
    size_kb: Math.round(buffer.length / 1024),
    base64: buffer.toString("base64"),
  };
}
```

### Registration in `src/index.ts`

```typescript
// Add import
import { downloadReceipt } from "./tools/download-receipt.js";

// Register tool (after upload_receipt section)
server.tool(
  "download_receipt",
  "Download receipt image from Supabase Storage by storage path or public URL. Returns base64-encoded content for agent to read/parse. Use after check_inbox to read receipt photos.",
  {
    storage_path: z.string().describe(
      "Storage path (e.g. 'receipts/inbox/1775302732437_0_rrdarx.jpg' or 'img/...'). Also accepts full public URL — path will be extracted automatically."
    ),
  },
  async (args) => jsonResult(await downloadReceipt(args))
);

// Update tool count in main(): 17 → 18
```

## Key Decisions

1. **base64 return** — MCP передаёт данные через JSON/stdio, binary не поддерживается.
   Средний чек ~200-500KB в JPEG → ~300-700KB в base64 — укладывается в лимиты.
2. **Один файл за раз** — в отличие от upload (batch), download нужен для конкретного чека.
3. **Flexible input** — принимает и storage_path и full URL, потому что в `receipt_inbox.photo_urls`
   хранятся пути вида `receipts/inbox/...`, а в `expense_ledger` — полные URL.
4. **Supabase .download()** — использует Storage API с Service Role Key, минуя egress.

## Agent Workflow After Implementation

```
check_inbox(status="pending")
  → получает inbox record с photo_urls
  → download_receipt(storage_path=photo_urls[0])
  → получает base64 изображения
  → read_guideline("image-reading-protocol")
  → парсит чек из base64 (Claude видит изображение)
  → approve_receipt(...)
  → update_inbox(status="processed")
```

## MCP Schema Update

После деплоя обновить описание инструмента в Cowork-конфиге финансового агента
(Claude Desktop `claude_desktop_config.json` или MCP connector).

## Testing

1. Скачать существующий чек по known storage_path → проверить base64 валидный
2. Передать full public URL → проверить что path корректно извлекается
3. Несуществующий путь → graceful error
4. Интеграция: check_inbox → download_receipt → визуально подтвердить что Claude видит изображение

## Estimate

~30 минут на реализацию + тест. Один файл + 5 строк в index.ts.
