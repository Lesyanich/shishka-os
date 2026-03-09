# PLAN: Workspace Setup for Multi-Agent Environment
**Role:** Lead Backend Developer for Shishka Healthy Kitchen

## Goal
Organize the project root to support a multi-agent environment (Architect, Chef, Finance) without deleting any existing files.

## Task Breakdown
### Step 1 & 2: Folder Structure Creation ✅ (Completed)
The following directory structure has been created:
- `/01_Source_Data` (To hold operational Gsheets and CSVs)
- `/02_Obsidian_Vault`
  - `/02_Obsidian_Vault/Blueprints` (For DB schemas and Logic flows)
  - `/02_Obsidian_Vault/Handover` (For cross-agent communication)
  - `/02_Obsidian_Vault/Logs` (For decision logging)
- `/03_Development` (For Supabase migrations, Next.js code, and TWA assets)
- `/04_Financial_Control` (For Capex/Opex tracking)
- `/docs` (For AI plans and documentation)

### Step 3: Identification & Proposal ⏳ (Pending User Approval)
We scanned the root directory for all existing `.gsheet` and `.csv` files.

**Found in Root:**
1. `Benchmarks Menu .gsheet`
2. `Invest Plan.gsheet`
3. `Expenses and Capex Eqiupment .gsheet`

**Proposed Actions:**
- **Move to `/01_Source_Data`:** `Benchmarks Menu .gsheet` (Operational data for the menu)
- **Move to `/04_Financial_Control`:** `Invest Plan.gsheet` and `Expenses and Capex Eqiupment .gsheet` (These seem directly related to Capex/Opex and finance, which fits `/04_Financial_Control` better than `/01_Source_Data`. Alternatively, we can move all three to `/01_Source_Data` if you prefer all raw sheets together).

*Note: No files have been moved or deleted yet.*

## Next Steps
1. User reviews the proposed file moves.
2. Upon confirmation, the agent executes the `mv` commands to organize the files.
