# Shishka Co. — Company Documents Register

> Maintained by `/lawyer` agent.
> Last updated: 2026-07-06
> Physical files: Google Drive — `Shishka healthy kitchen/00_Legal/`
> Source of truth for "what doc exists, where, expiry, purpose"
> Phase 1 entries. Will grow with each document intake via `/lawyer`.

## Register

| ID | Type | Number | Owner | Issue | Expiry | Path (relative to 00_Legal/) | Purpose | Status |
|----|------|--------|-------|-------|--------|------------------------------|---------|--------|
| LEG-001 | registration | 0835568025951 | Shishka Healthy Food Co., Ltd. | 2025-12-16 | — | 01_Company_Registration/2025-12-16__Company_Registration__0835568025951.pdf | Corporate hygiene, bank KYC, supplier agreements, FDA application, BOI eligibility | active |
| LEG-002 | work_permit | 0769830000874 | Lesia Kostiukova | 2026-04-25 | 2027-04-24 | 02_Work_Permits/Lesia_Kostiukova/2026-04-25__Work_Permit__0769830000874__Lesia_Kostiukova.pdf | Signing authority for Shishka Co., visa basis, BOI eligibility, employment permission as General Manager | active |
| LEG-003 | employment | POL-ATT-001 | Shishka Healthy Food Co., Ltd. | 2026-07-06 | — | 08_Employment_Contracts/Policies/2026-07-06__Attendance_Sick_Leave_Discipline_Policy.pdf | Attendance, sick-leave & absence discipline (LPA §32/§34/§57/§119) — paid vs unpaid leave, medical-certificate rule, warning ladder, dismissal for cause. Source of truth: `docs/domain/labour-attendance-sick-leave-policy.md`. CEO-approved 2026-07-06; signed PDF to be filed. | active |

## Doc type taxonomy

| Type | Subfolder | Examples |
|---|---|---|
| `registration` | `01_Company_Registration/` | DBD certificate (พค.0401), MOA changes, capital changes |
| `work_permit` | `02_Work_Permits/<Person>/` | Initial WP, renewals, variations |
| `visa` | `03_Visas/<Person>/` | Non-immigrant B, LTR, extensions, re-entry permits |
| `fda_license` | `04_FDA_Licenses/` | อย. registrations for products, manufacturing site |
| `restaurant_permit` | `05_Restaurant_Permits/` | Tessaban permits, fire safety, hygiene |
| `lease` | `06_Leases/` | L1 Rawai, L2 future, any property |
| `tax_filing` | `07_Tax_VAT/` | PND 1/3/50/51/53, VAT (PP.30), withholding certs |
| `employment` | `08_Employment_Contracts/<Person>/` | Staff contracts, addenda |
| `supplier_contract` | `09_Supplier_Contracts/<Supplier>/` | Supplier T&Cs, distribution agreements |
| `court_paper` | `10_Court_Papers/` | Any judicial document (also triggers Mr. Ram escalation) |
| `other` | `_unsorted/` | Awaiting classification |

## Naming convention

```
YYYY-MM-DD__<DocType>__<Number>__<Person_or_Entity>.pdf
```

- Date = issue date (Gregorian; convert Buddhist Era by subtracting 543)
- DocType = `Title_Case` (e.g., `Company_Registration`, `Work_Permit`)
- Number = exact as on document
- Person/Entity = `Firstname_Lastname` or `Company_Name_Short`

Examples:
- `2025-12-16__Company_Registration__0835568025951.pdf`
- `2026-04-25__Work_Permit__0769830000874__Lesia_Kostiukova.pdf`
- `2026-08-15__Lease__L1_Rawai__Shishka_Co.pdf` (future)

## Status values

- `active` — current, in force
- `expired` — past expiry_date
- `superseded` — replaced by newer version (e.g., WP renewal supersedes prior WP)
- `under_review` — classification pending CEO confirmation
- `draft` — Sol-produced draft, not yet signed

## Maintenance protocol

- **Adding entries:** Sol does this automatically during document intake (push or pull pathway per `agents/lawyer/AGENT.md` §Workflow). Manual edits permitted by Tech-Lead in emergencies.
- **Updating Status:** when document is superseded, mark old row `superseded` and add new row with new ID. Never delete rows — historical record matters for audits.
- **Reviewing entries:** quarterly walkthrough by CEO + Sol; surface expiring docs, missing renewals.

## Cross-references

- Spec: `docs/superpowers/specs/2026-05-13-lawyer-agent-design.md`
- Plan: `docs/superpowers/plans/2026-05-13-lawyer-agent.md`
- Agent: `agents/lawyer/AGENT.md`
- Memory: `~/.claude/projects/.../memory/reference_company_documents.md`
