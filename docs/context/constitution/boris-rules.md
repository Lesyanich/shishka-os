# Boris Rules — Learned Constraints

Rules accumulated from real production bugs and architectural mistakes.

## Rule #8: BOM Hub Filtering
Nomenclature tabs MUST filter STRICTLY by `product_code` prefix: `SALE-%`, `PF-%`, `MOD-%`, `RAW-%`.
**NEVER** use `.or()` with `type.eq.dish` or any other type field — items can have ambiguous types that leak across tabs.
Always use `.ilike('product_code', 'PREFIX-%')` only.

## Rule #9: Obsidian Protocol
After every major development phase, the agent MUST:
1. Create or update an architecture note (`.md`) in `02_Obsidian_Vault/` using Obsidian Flavored Markdown (wikilinks, frontmatter tags, callouts).
2. The note MUST contain: YAML frontmatter with `tags` and `date`, description of what the phase built, `[[backlinks]]` to related modules, and a Mermaid diagram or table if applicable.
3. Never leave orphan notes — every new note must be linked from at least one existing note or from CURRENT.md.
4. Legacy/obsolete content lives in `02_Obsidian_Vault/_Archive/` — never delete, always archive.

## Rule #10: Database Documentation Protocol
When any migration creates or alters a table/function/trigger/enum, the agent MUST update `02_Obsidian_Vault/Database Schema.md`:
1. Keep the Mermaid erDiagram block in sync with all current tables and FK relationships.
2. Keep the Tables index table up to date (Table | PK | Key Columns | FKs | Migration).
3. Keep the RPCs & Triggers table up to date.

## Rule #11: SSoT Commit Gate
**NEVER** run `git push` until:
1. `docs/context/state/CURRENT.md` — updated to reflect changes
2. `02_Obsidian_Vault/Architecture/Database Schema.md` — updated if any migration touched tables, policies, RPCs, or ENUMs
3. **Architecture note updated** — if an Obsidian architecture note exists for the modified module, sync it with current state (see mapping below)
4. All files staged and included in the commit

### Module → Architecture Note Mapping
| Module worked on | Architecture note to sync |
|------------------|--------------------------|
| Receipts / OCR | `Architecture/Receipt Routing Architecture.md` |
| Finance | `Architecture/Financial Ledger.md` |
| Procurement | `Architecture/Procurement & Receiving Architecture.md` |
| Product categories | `Architecture/Product Categorization Architecture.md` |
| Overall system | `Architecture/Shishka OS Architecture.md` |

If no architecture note exists for a module — skip (creation only at phase completion per Rule #9).

## Rule #12: Transaction Date Integrity
**NEVER** overwrite historical `transaction_date` values. Dates come STRICTLY from source documents (receipt, invoice). `CURRENT_DATE` is only acceptable as an absolute last-resort fallback in the RPC when the frontend fails to provide a date. Migrations must NEVER set `transaction_date = CURRENT_DATE` to "fix" sorting — this violates ERP audit standards.

## Rule #13: Edge Function + LLM Latency
Long-running AI tasks (>30s), such as Vision OCR for long receipts, **MUST NOT** rely on synchronous HTTP responses. Supabase Edge Functions have a **150s request idle timeout** and **200ms CPU limit**. The architectural standard is the **Async Webhook/Polling pattern**: insert job row → Edge Function writes result → frontend subscribes via Supabase Realtime.
