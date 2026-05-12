# Vendored: pack-info hook + resolver

These files are a copy of the MCP source-of-truth, adapted for Deno (Supabase Edge Functions).

| Vendored file | Source-of-truth |
|---|---|
| `pack-info-hook/*.ts` | `services/mcp-finance/src/lib/pack-info-hook/*.ts` |
| `pack-info-resolver/*.ts` (excl. `fixtures.ts`) | `services/mcp-finance/src/lib/pack-info-resolver/*.ts` |

**The only diffs from source-of-truth are import specifiers:**
- `from '@supabase/supabase-js'` → `from 'npm:@supabase/supabase-js@2'` (Deno npm: scheme)
- Relative imports `'./foo.js'` → `'./foo.ts'` (Deno requires literal extensions; source uses NodeNext `.js` convention)

## Why vendored (not workspace-packaged)
Supabase Edge Functions bundle the function directory + `_shared/` only; files outside that tree don't ship. A workspace package would need a build step we don't have yet. Vendoring keeps deploy simple.

## Sync protocol
When you touch any file under `services/mcp-finance/src/lib/pack-info-{hook,resolver}/`:

```bash
# from repo root
SRC=services/mcp-finance/src/lib
DST=services/supabase/functions/_shared/pack-info
for f in hook.ts cooldown.ts decisions-writer.ts index.ts shared-constants.ts; do
  cp "$SRC/pack-info-hook/$f" "$DST/pack-info-hook/$f"
done
for f in resolver.ts types.ts data-provider.ts parse-pack.ts index.ts; do
  cp "$SRC/pack-info-resolver/$f" "$DST/pack-info-resolver/$f"
done
find "$DST" -name "*.ts" -exec sed -i.bak \
  -e "s|from '@supabase/supabase-js'|from 'npm:@supabase/supabase-js@2'|g" {} \;
find "$DST" -name "*.ts" -exec sed -i.bak -E \
  -e "s|(from ['\"])(\\.+/[^'\"]+)\\.js(['\"])|\\1\\2.ts\\3|g" {} \;
find "$DST" -name "*.bak" -delete
supabase functions deploy pack-info-resolve --project-ref qcqgtcsjoacuktcewpvo
```

Then re-deploy the `pack-info-resolve` edge function.

## What is intentionally NOT vendored
- `*.test.ts` — tests stay with source-of-truth
- `pack-info-resolver/fixtures.ts` — test fixtures only

Originating task: 6b675b23 (wire pack-info hook into admin approve flow).
