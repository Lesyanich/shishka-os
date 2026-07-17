# /lawyer agent — session log (Tier 2)

Technical / agent-side steps. Business outcomes go to `business_tasks` via MC, not here.

## 2026-05-13 — Phase 1 bootstrap

- Created `agents/lawyer/AGENT.md` (identity, 10 domains, voice, escalation rules)
- Created `agents/lawyer/CONTEXT/01_corporate_ccc.md` (CCC §§ 1097-1273 summary)
- Created `agents/lawyer/CONTEXT/02_work_permit_visa.md` (WP Act + Immigration Act summary)
- Created `agents/lawyer/TEMPLATES/{letter_to_government,employment_contract_th,supplier_agreement}.md`
- Created `.claude/skills/lawyer/SKILL.md` (trigger `/lawyer` or `/saul`)
- Added `/lawyer` row to `docs/constitution/operational-rules.md` Part IV table + free-text legal keywords
- Created `docs/operations/company-documents-register.md` with LEG-001 (registration) + LEG-002 (work permit)
- Created GDrive `00_Legal/` tree under `~/Library/CloudStorage/GoogleDrive-lesia@shishka.health/Общие диски/Shishka healthy kitchen/00_Legal/` with 10 type subfolders + `_inbox/` + `_drafts/` + `_unsorted/` + `Lesia_Kostiukova/` under work permits; uploaded 2 PDFs from `~/Downloads/` (byte sizes verified)
- Created memory pointers: `reference_lawyer_agent.md` + `reference_company_documents.md`; indexed in MEMORY.md
- Applied migration `173_add_legal_domain.sql` (DB CHECK now accepts `domain='legal'`); also added `'legal'` to MCP Zod enum in `services/mcp-mission-control/src/index.ts` for both `emit_business_task` and `list_tasks`. Build + lint green.
- Bootstrapped 3 legal MC tasks via SQL (current session's cached MCP schema still has old enum — direct INSERT was needed; future sessions will use `emit_business_task` once MCP restarts pick up enum update):
  - `8e08e2f0-605f-4e51-a253-d53da7ab4878` — FS 2025 (critical, 2026-05-31)
  - `5422d6cb-16a2-4d51-b69a-07be35069215` — AGM 2026 (high, 2026-06-12)
  - `af2b6166-a841-44b6-977f-c36b36264e48` — WP renewal (medium, 2027-02-24)

## 2026-07-17 — Punctuality policy LEG-004 + lateness control system

- CEO Q: systematic admin lateness, wants strict time control + sanctions. Advised: fixed fines illegal (LPA §76); lawful model = no-work-no-pay pro-rata (salary/30/9h) + written-warning ladder → §119(4) dismissal without severance. CEO approved model + full package.
- Created `docs/domain/working-hours-punctuality-policy.md` (LEG-004, POL-PUN-001): LPA §23 hours, clock-in duty, 10-min grace, pay rule, discipline ladder, acknowledgment gate (Appendix B), bilingual EN+TH lateness warning template (Appendix A).
- Drafted Written Warning #1 for administrator (LEG-005, WW1-2026-001, name TBC — Mint?) → GDrive `00_Legal/_drafts/2026-07-17__Written_Warning_Lateness__DRAFT__Administrator.md` (file id 121OhkkqMhSzoFycpsx1tmu8EVuRYBqiA). Facts table + name to be filled by CEO before issuing.
- Register: added LEG-004 (active) + LEG-005 (draft) rows. Vault: added LEG-004/LEG-005 assets rows + repaired missing LEG-003 row (drift — register had it, vault didn't).
- MC task 24ae6b0c (legal, high) claimed in_progress — also tracks tech part (migs 366-368, /hr/punctuality, TG alert) built in same session on branch claude/admin-attendance-control-system-c8888d.
