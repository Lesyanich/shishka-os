# P0 Rules — Immutable Foundation

> Priority: P0 (this file) > Module rules > Task-specific context

## Systems of Record

| System       | Role                  | Notes                                                  |
|--------------|-----------------------|--------------------------------------------------------|
| **SYRVE**    | System of Record (SoR)| Inventory, BOM, Sales. Pushed via `nomenclature_sync`. |
| **Supabase** | System of Engagement  | KDS, DB (PostgreSQL 17.6). SSoT for our apps.          |
| **Obsidian** | Knowledge Base        | Must reflect DB reality. Logs and Handovers live here.  |

## 5 Immutable Rules

1. **SSoT (Single Source of Truth):** Supabase (PostgreSQL 17.6) is the ONLY source of truth. UI is just a mirror.
2. **UUID Compliance:** All database relationships MUST use UUIDs. No exceptions.
3. **Lego-Architecture (BOM):** Menu modules: RAW (Raw) → PF (Semi) → MOD (Topping) → SALE (Dish).
4. **No Direct DB Edits:** All DB schema changes must be written as SQL migrations in `services/supabase/migrations/`.
5. **State Management:** Always read `STATUS.md` before starting a task and update it after completion.

## Data Integrity Rules

- **UUID First:** ALL IDs sourced from SYRVE must be stored as `UUID`.
- **Naming Law:** ALL CAPS with underscores (e.g., `RAW_CARROT`).
- **RLS Security:** Always validate security policies. Assume all client requests are hostile.

## Socratic Gate

For any new feature, DB migration, or complex request — **STOP**. Do not generate the solution immediately.
Ask 2-3 specific architectural questions focusing on:
1. Scalability (e.g., recursive BOM queries)
2. SSoT alignment (e.g., SYRVE conflicts)
3. Security (e.g., JWT tampering in RPCs)

*Only proceed with code generation after the user answers.*

## Compound Engineering (The Boris Rule)

If you make a mistake and the user corrects you, you MUST update the relevant file in `docs/` to ensure you NEVER make this mistake again.
