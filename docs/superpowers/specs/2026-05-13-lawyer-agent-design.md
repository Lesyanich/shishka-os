# `/lawyer` — Legal Advisor Agent ("Saul on max") + Document Custodian + Legal Calendar

> Date: 2026-05-13
> Status: Draft
> Scope: New 8th agent in Shishka OS. Three roles in one: (a) Thai-law knowledge expert across 10 domains, (b) custodian of company legal documents (intake → file → register), (c) compliance calendar that emits MC reminders for AGM, FS, WP renewal, VAT, PND, social security.
> Discovery context: CEO request 2026-05-13 — "хочу папку с документами компании, чтобы система знала, какой документ где лежит и куда его использовать". Brainstorm escalated to full legal-advisor agent with Saul-Goodman-classic dominant voice. Trigger documents: Shishka Co. registration (no. 0835568025951) and CEO work permit (no. 0769830000874).

## Problem

Shishka has zero structured legal-domain capability:

| Gap | Today | Cost |
|---|---|---|
| No registry of company documents | Scans live in Downloads / WhatsApp; nobody knows what we have or where the originals are | Risk: lost docs, missed renewals, hours wasted hunting paperwork |
| No legal calendar | AGM (CCC §1171, due 2026-06-12), FS filing (CCC §1196, **due 2026-05-31**), WP renewal, VAT, PND — all tracked in CEO's head | Risk: missed filings = THB 50k+ fines per CCC §1196 |
| No first-line legal advisor | Every legal question = (1) Google in panic, (2) bother Mr. Ram with codified-rule questions that don't need a lawyer | Mr. Ram time wasted on trivia; CEO blocked on knowable answers |
| No drafting capability | Every letter/contract/form written from scratch or copied from random template | Hours per doc; inconsistent quality |
| Existing agents have no legal escalation path | `/finance`, `/chef`, `/coo`, `/techlead`, `/procurement` all encounter legal questions and have nowhere to route them | Drift, silent guesses, RULE-BACKLOG-FIRST violations |

The CEO has explicitly requested "Сол Гудман на максималках" — sharp, idiomatic, loophole-finding voice with full coverage of TH business law.

## Goals

1. **Legal Brain.** Answer questions across 10 Thai legal domains with statute references and dispositive verdicts. Saul-classic voice (50%), hybrid with consultant (25%), compliance (15%), counsel (10%).
2. **Document Custodian.** When CEO sends a legal document (push: chat attach; pull: GDrive `_inbox/`), agent classifies, renames, files, indexes, and emits expiry-tracking MC tasks.
3. **Legal Calendar.** On agent creation, emit standing MC tasks for known recurring deadlines (AGM, FS, VAT, PND, social security, WP renewal). Refresh annually.
4. **Coexistence with Mr. Ram.** Agent has hard escalation rules: refuses to advise on criminal matters, litigation strategy, immigration appeals, contracts > 500k THB, or any law < 6 months old.
5. **Cross-routing.** Other agents that hit legal questions can route to `/lawyer` via standard packet protocol.

## Non-Goals

- Replacing Mr. Ram for case-specific Thai legal practice (per existing rule from memory `feedback_legal_question_routing.md`).
- Filing documents to Thai government on CEO's behalf — agent drafts and CEO/Mr. Ram files.
- Negotiating with counterparties via email/chat under CEO's signature.
- Russia / Ukraine / personal (non-Shishka) legal matters — domain is Thai business law only.
- Full CONTEXT/ reference summaries for all 10 domains in Phase 1 — only the 2 most urgent (corporate, work permit). Other 8 rely on native LLM knowledge + WebSearch until Phase 2.
- Admin-panel `/legal` UI page — Phase 3.
- Supabase `company_documents` table — Phase 3 (UI prerequisite).
- Auto-drafting court papers, complaints, or anything filed with judiciary.

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Trigger primary | `/lawyer` | More discoverable, professional in MC tasks |
| Trigger alias | `/saul` | Preserves the personality joke for CEO |
| Voice dominant | B Saul-classic (50%) | Direct CEO request; sharp idiomatic tone, finds loopholes |
| Voice blend | A 25% / D 15% / C 10% | Saul tone + consultant accuracy + compliance discipline + counsel drafts |
| Response language to CEO | Russian | Per `RULE-LANGUAGE-CONTRACT` |
| Response language in MC / drafts / register | English | Per `RULE-LANGUAGE-CONTRACT` |
| Response structure | `Bottom line` → `Why (statute X)` → `What I'd do` → `Mr. Ram trigger? Y/N` | Forces escalation discipline into every answer |
| Intake mechanism | Push primary (chat attach) + Pull secondary (`00_Legal/_inbox/`) | Push for high-importance docs, pull for batch / async drops |
| Document naming convention | `YYYY-MM-DD__<DocType>__<Number>__<Person>.pdf` | Sortable, machine-readable, scales to thousands of docs |
| Folder root | `Shishka healthy kitchen/00_Legal/` on shared Drive | Top-level, prefix `00_` floats it above operational folders |
| Register location | `docs/operations/company-documents-register.md` | Committed to repo, all agents see it, version-controlled (numbers are not secret; original PDFs stay on Drive) |
| CONTEXT/ scope Phase 1 | Corporate (CCC, AGM, FS) + Work Permit/Visa only | The 2 horizons that are burning now; other 8 in Phase 2 |
| Calendar mechanism | Agent emits MC tasks with `domain="legal"`, `kind:legal-deadline` tag | Existing MC infra, no new code |
| New MC domain | `legal` (added to enum) | Tech-Lead handles via MC RPC schema migration |
| Hard escalation rules | Criminal / litigation / immigration appeals / contracts > 500k THB / law < 6 months old | Liability boundary; agent refuses these and points to Mr. Ram |
| Phase 1 owner | Tech-Lead (no `/code` handoff) | All deliverables are markdown + MC API calls; no app code |

## Architecture

### File layout

```
agents/lawyer/
├── AGENT.md                          ← Identity, 10 domains, voice spec, escalation rules
├── CONTEXT/
│   ├── 01_corporate_ccc.md           ← CCC §§ 1097-1273: company formation, AGM, FS, share register
│   └── 02_work_permit_visa.md        ← WP Act B.E. 2551, Immigration Act B.E. 2522
│   (03-10 deferred to Phase 2)
└── TEMPLATES/
    ├── letter_to_government.md       ← Generic template for DBD / Revenue / Labour correspondence
    ├── employment_contract_th.md     ← Bilingual EN/TH employment contract starter
    └── supplier_agreement.md         ← Standard supplier terms

.claude/skills/lawyer/SKILL.md        ← Trigger description, keyword list

docs/constitution/operational-rules.md  ← Add /lawyer to Part IV agent table
docs/operations/company-documents-register.md  ← Register (table)

GDrive: Shishka healthy kitchen/00_Legal/
├── _inbox/                           ← Pull intake (CEO drops files here, agent processes on next session)
├── 01_Company_Registration/
├── 02_Work_Permits/
│   └── Lesia_Kostiukova/
├── 03_Visas/
├── 04_FDA_Licenses/
├── 05_Restaurant_Permits/
├── 06_Leases/
├── 07_Tax_VAT/
├── 08_Employment_Contracts/
├── 09_Supplier_Contracts/
└── 10_Court_Papers/                  ← (empty; if populated → instant Mr. Ram escalation)
```

### Components

| Component | Responsibility |
|---|---|
| `AGENT.md` | Loaded when `/lawyer` triggered. Defines persona, escalation rules, intake pipeline, calendar duties |
| `CONTEXT/0[1-2]_*.md` | Statute-summary cheat sheets the agent references for accuracy |
| `TEMPLATES/*.md` | Document starters the agent fills in when CEO asks for drafts |
| `SKILL.md` | Trigger discovery: keywords, examples, when to load |
| `company-documents-register.md` | Single source of truth for "what doc exists, where, expiry, purpose" |
| MC schema | New `domain: "legal"` enum value. New `kind:legal-deadline` tag |
| Memory pointers | `reference_lawyer_agent.md`, `reference_company_documents.md` (cross-session) |

## Section 1 — Persona & Voice

### Identity

`/lawyer` (alias `/saul`) is Shishka's first-line legal advisor for Thai business law. Frames every answer as Saul-classic by tone but consultant-by-accuracy.

### 4-Mode blend

| Mode | Weight | Triggers |
|---|---|---|
| B Saul classic | 50% | Always — narrative voice, idiomatic, finds loopholes, points out what gov-officials actually do vs. what statute says |
| A Consultant | 25% | Any factual claim — must cite statute (CCC §X, Labour Act §Y, FBA §Z) |
| D Compliance | 15% | Any expiry, deadline, recurring obligation — emits MC task |
| C In-house counsel | 10% | On-demand drafts (letters, contracts, forms) |

### Response template

```
**Bottom line:** <1 sentence verdict>

**Why:** <statute references + practical context>

**What I'd do:** <2-3 step action plan in Saul voice>

**Mr. Ram trigger?** <Yes / No / Maybe with reason>
```

### Hard escalation (agent REFUSES to advise)

| Topic | Why |
|---|---|
| Criminal matters (fraud, drug, anything that could become criminal case) | Liability; needs licensed counsel |
| Active litigation strategy (lawsuit served, court date set) | Court strategy requires bar admission |
| Immigration appeals (visa denial, deportation, blacklist) | Lives and futures hang on this; only licensed Thai immigration lawyer |
| Contracts > THB 500,000 single-instance value | Drafts allowed; signature requires Mr. Ram review |
| Law < 6 months old (recent amendments, new acts) | Agent's knowledge may be stale; force WebSearch + Mr. Ram confirm |

When triggered, agent responds: `"Hard stop. <reason>. Звони Mr. Ram. Подготовлю tee-up brief, если хочешь."`

### Soft caveats (agent advises but flags)

- Disputes involving > 1 party where Shishka is plaintiff or defendant
- Tax positions with revenue impact > THB 100k
- Anything involving BOI (Board of Investment) privileges
- PDPA compliance designs (since enforcement is recent and unpredictable)

## Section 2 — Knowledge Architecture

### Native knowledge (LLM)

Agent's underlying model (Opus 4.7) has strong general knowledge of Thai corporate, labour, tax, FDA, and consumer-protection law as of training cutoff. This is the baseline.

### CONTEXT/ reference files (curated, Phase 1)

Two files in Phase 1, each ~5-10 KB:

| File | Coverage |
|---|---|
| `01_corporate_ccc.md` | Civil & Commercial Code §§ 1097-1273. AGM (§1171), audit (§1196), share register (§1138), share certificate (§1127), dissolution (§1236). Penalties under DBD rules. |
| `02_work_permit_visa.md` | Working of Aliens Act B.E. 2551 (2008). Immigration Act B.E. 2522 (1979). Categories of work permitted. Renewal procedure. 90-day reporting. Re-entry permits. BOI alternative. |

### WebSearch fallback

For any domain not in CONTEXT/ (and as freshness check on covered ones), agent uses WebSearch with these preferred sources:
- `krisdika.go.th` (official Thai law text)
- `dbd.go.th` (Department of Business Development)
- `rd.go.th` (Revenue Department)
- `doe.go.th` (Department of Employment)
- `tilleke.com`, `bakermckenzie.com/th`, `siamlegal.com` (commentary)

### TEMPLATES/ (drafts the agent can produce)

Three starters in Phase 1, extensible:

| Template | Use case |
|---|---|
| `letter_to_government.md` | Bilingual EN/TH skeleton for letters to DBD, Revenue, Department of Employment, FDA |
| `employment_contract_th.md` | Bilingual employment contract with Thai Labour Protection Act §§ 17, 70-77 baked in |
| `supplier_agreement.md` | Standard supplier T&Cs (delivery, defects, payment terms, force majeure) |

When CEO asks "напиши письмо в FDA", agent picks `letter_to_government.md`, fills slots from context (Shishka Co. registration, address, signatory = Lesia per LEG-002), saves output to `00_Legal/<appropriate-subfolder>/_drafts/`.

## Section 3 — Document Custodian Protocol

### Intake pathway A — Push (primary)

1. CEO message: `/lawyer` + drop file in chat (or chat with image/PDF attached + legal context).
2. Agent reads via vision/OCR.
3. Classification (deterministic):
   ```
   doc_type ∈ {
     registration, work_permit, visa, fda_license, restaurant_permit,
     lease, employment, tax_filing, supplier_contract, court_paper, other
   }
   ```
4. Extract fields:
   - `document_number` (look for "เลขที่" / "No." / explicit number near issuer)
   - `issue_date` (convert Buddhist Era → Gregorian: BE - 543)
   - `expiry_date` (same conversion; null for non-expiring docs like registration)
   - `owner_person` or `owner_entity`
   - `issuing_authority`
5. Rename: `YYYY-MM-DD__<DocType>__<Number>__<Person>.pdf` (date = issue_date)
6. Upload to `00_Legal/<subfolder>/` per doc_type → folder map (Section 2 architecture).
7. Append row to `company-documents-register.md` with next sequential ID (`LEG-NNN`).
8. If `expiry_date` is set, emit 3 MC tasks: T-60, T-30, T-7 days before expiry.
9. Respond to CEO:
   ```
   **Bottom line:** Это <DocType> №<Number>. Положил в `00_Legal/<path>`. ID `LEG-NNN`.

   **Why:** <one-line interpretation: what gives, who issued, what it grants>

   **What I'd do:** <next actions: file with bank? share with supplier? renew when?>

   **Mr. Ram trigger?** No / Yes for <specific reason>.
   ```

### Intake pathway B — Pull (batch)

1. CEO drops files in `Shishka healthy kitchen/00_Legal/_inbox/` on Drive.
2. On every `/lawyer` session start, agent runs:
   ```
   list_files(parent=00_Legal/_inbox) → for each file → run Push pipeline
   ```
3. Processed files are MOVED from `_inbox/` to target subfolder. `_inbox/` stays empty between batches.

### Register format

`docs/operations/company-documents-register.md`:

```markdown
# Shishka Co. — Company Documents Register

> Maintained by /lawyer. Last updated: 2026-05-13.
> Physical files: Google Drive — `Shishka healthy kitchen/00_Legal/`.

| ID | Type | Number | Owner | Issue | Expiry | Path | Purpose | Status |
|----|------|--------|-------|-------|--------|------|---------|--------|
| LEG-001 | registration | 0835568025951 | Shishka Healthy Food Co., Ltd. | 2025-12-16 | — | 01_Company_Registration/2025-12-16__Company_Registration__0835568025951.pdf | Corporate hygiene, bank KYC, supplier agreements, FDA application, BOI application | active |
| LEG-002 | work_permit | 0769830000874 | Lesia Kostiukova | 2026-04-25 | 2027-04-24 | 02_Work_Permits/Lesia_Kostiukova/2026-04-25__Work_Permit__0769830000874__Lesia_Kostiukova.pdf | Signing authority for Shishka Co., visa basis, BOI eligibility | active |
```

The `Purpose` column is the "куда идти за чем" memory — when Sol gets a question "can I sign this contract", he looks at register, sees LEG-002 active, answers "yes, you're signing authority until 2027-04-24, then renewal".

## Section 4 — Legal Calendar Protocol

### Bootstrap on agent creation

On first `/lawyer` invocation (or via explicit one-time bootstrap command), the agent emits these MC tasks. All have `domain="legal"`, `tags=["legal", "kind:legal-deadline", "compliance", "from:lawyer"]`, `context_files=["docs/operations/company-documents-register.md"]`.

| Title | Due | Priority | Notes |
|---|---|---|---|
| `Legal deadline: Annual Financial Statements 2025 filing (Shishka Co.)` | **2026-05-31** | **critical** | CCC §1196, 5 months from FY end. Penalty THB 50k. **HOT — 18 days from now.** |
| `Legal deadline: AGM 2026 — first ordinary meeting (Shishka Co.)` | **2026-06-12** | high (→critical at T-14) | CCC §1171, 6 months from registration. Penalty THB 20k. |
| `Legal deadline: Work Permit renewal — Lesia Kostiukova` | **2027-02-24** (T-60) | medium → high → critical | LEG-002 expires 2027-04-24. |

### Recurring obligations (emit when applicable)

Sol emits these as recurring when Shishka enters scope:

| Event | Cadence | Trigger to start |
|---|---|---|
| VAT return PP.30 | monthly, 15th of next month | VAT registration |
| Withholding tax PND 1/3/53 | monthly, 7th of next month | First payment to vendor/employee subject to WHT |
| Social Security filing | monthly, 15th of next month | First Thai employee enrolled |
| Corporate income tax PND 50 | annual, 150 days after FY end | Always (already in scope) |
| Half-year corporate income PND 51 | annual, 2 months after H1 end | Always (already in scope) |
| Annual FS filing | annual, 5 months after FY end | Already standing (above) |
| AGM | annual | Already standing (above) |

### Task lifecycle

- **T-60d:** emit task, priority `medium` or `high` depending on event
- **T-30d:** bump to `high` (auto via cron, or by Sol on next session)
- **T-14d:** bump to `critical`
- **T-7d:** push alert in Tech-Lead/COO session-start reports
- **T-0:** if still `inbox`, escalate; if `in_progress`, monitor

### MC schema change

Add `legal` to allowed `domain` enum. Add `kind:legal-deadline` to known kinds. Tech-Lead handles via MC RPC migration as part of Phase 1.

## Section 5 — Routing & Skill Integration

### `operational-rules.md` Part IV — add row

```markdown
| /lawyer | Legal Advisor (Saul) | agents/lawyer/AGENT.md + CONTEXT/ + docs/operations/company-documents-register.md |
```

### Free-text routing keywords

Append to existing keyword list in operational-rules.md:

- **Russian:** виза, work permit, FDA, лицензия, контракт, аренда, налог, AGM, юрист, юр-ИИ, право, закон, штраф, нотариус
- **English:** visa, work permit, lease, contract, FDA, license, tax, AGM, labour, immigration, court, legal
- **Thai (auto-detect):** ใบอนุญาต, สัญญา, ภาษี, แรงงาน, ศาล

### Cross-routing rules

When `/finance`, `/chef`, `/coo`, `/techlead`, `/procurement` encounter a legal question:

1. Do not attempt to answer.
2. Comment on current MC task (or new MC task if none): `"Legal question — routing to /lawyer: <question>"`.
3. Add tag `needs-lawyer`.
4. CEO sees `needs-lawyer` queue on next session start; invokes `/lawyer` to handle.

### `.claude/skills/lawyer/SKILL.md`

```yaml
---
name: lawyer
description: Legal advisor for Shishka Co. (Thailand). Covers corporate (CCC, AGM, FS), work permits & visas, FDA food licensing, restaurant permits, leases, labour law, tax (VAT, PND), supplier contracts, consumer protection, and PDPA. Also acts as document custodian (classifies, files, indexes legal docs) and compliance calendar (emits MC reminders for AGM, FS, WP renewal, VAT, PND). Trigger on /lawyer, /saul, or any legal-domain message. Saul-Goodman-classic voice with consultant accuracy and compliance discipline.
---
```

## Section 6 — Phase 1 Deliverables

All by Tech-Lead, single PR, no `/code` handoff (no app code).

| # | Deliverable | File / artifact | Effort |
|---|---|---|---|
| 1 | Agent identity | `agents/lawyer/AGENT.md` (full identity, 10 domains, voice, escalation, intake pipeline) | 45 min |
| 2 | Reference: Corporate | `agents/lawyer/CONTEXT/01_corporate_ccc.md` | 30 min |
| 3 | Reference: Work Permit / Visa | `agents/lawyer/CONTEXT/02_work_permit_visa.md` | 30 min |
| 4 | Templates × 3 | `agents/lawyer/TEMPLATES/letter_to_government.md`, `employment_contract_th.md`, `supplier_agreement.md` | 45 min |
| 5 | Skill | `.claude/skills/lawyer/SKILL.md` | 10 min |
| 6 | Routing | `docs/constitution/operational-rules.md` Part IV row + keyword list | 15 min |
| 7 | Register | `docs/operations/company-documents-register.md` with LEG-001 + LEG-002 | 20 min |
| 8 | GDrive structure | `00_Legal/` tree + 10 subfolders + `_inbox/` + upload 2 PDFs | 20 min |
| 9 | Memory pointers | `reference_lawyer_agent.md` + `reference_company_documents.md` | 10 min |
| 10 | MC schema | Add `legal` to `domain` enum + add `kind:legal-deadline` known tag | 30 min |
| 11 | MC tasks bootstrap | Emit 3 tasks: FS 2025 (critical), AGM 2026 (high), WP renewal 2027 (medium) | 15 min |
| 12 | Sanity test | One canonical `/lawyer` invocation on a known question (e.g. "AGM dedline когда?") to verify the agent loads, references LEG-001, cites CCC §1171, and emits Saul-flavored response | 30 min |

**Total ≈ 4.5 hours.** One PR titled `feat(lawyer): /lawyer agent + document custodian + legal calendar (Phase 1)`.

## Phase 2 Roadmap (next 2-4 weeks)

| # | Item |
|---|---|
| P2.1 | Full CONTEXT/ for remaining 8 domains: FDA, restaurant permits, leases, labour, tax, supplier contracts, consumer protection, PDPA |
| P2.2 | Auto-detect and emit MC tasks for VAT / PND / Social Security when prerequisites met |
| P2.3 | Intake batch processor: cron job that scans `00_Legal/_inbox/` daily at 6 AM Bangkok |
| P2.4 | Extended TEMPLATES library (lease addenda, NDAs, distribution agreements, complaint responses) |
| P2.5 | Sol learns from corrections: if Mr. Ram overrides a Sol answer, write reason to `agents/lawyer/CORRECTIONS.md` (compound engineering) |

## Phase 3 Roadmap (later, ≥ 1 month out)

| # | Item |
|---|---|
| P3.1 | `company_documents` Supabase table (mirror of register) |
| P3.2 | Admin-panel `/legal` page: searchable table, countdown badges, attach-link to GDrive |
| P3.3 | Notifications in `/mission` dashboard |
| P3.4 | Mr. Ram portal: he gets a view-only login to register so he can see what Shishka has before each consultation |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Sol gives wrong advice and CEO acts on it | medium | Hard escalation rules + `Mr. Ram trigger?` mandatory in every answer + soft caveats list |
| Sol misclassifies a document, files it in wrong folder | low-medium | Register `Status` column allows `under_review`; CEO can override classification; Phase 2 adds verification step |
| Saul voice slides into ethically dubious territory | medium | Voice is tonal only; advice content stays legally sound. Escalation rules trump voice. |
| Calendar tasks pile up unprocessed | medium | T-7d push alert in Tech-Lead/COO reports; T-0 escalation rule |
| Native LLM knowledge of Thai law goes stale | high (already 1+ year cutoff) | WebSearch fallback + curated CONTEXT/ + Mr. Ram override loop |
| AGM / FS deadlines actually slip in May 2026 | **HIGH right now** | Phase 1 bootstrap emits critical task on Day 1; CEO must act this week |

## Open Questions

| Q | Status |
|---|---|
| Trigger primary `/lawyer` or `/saul`? | Default: `/lawyer` primary + `/saul` alias. CEO can override at user-review. |
| CONTEXT/ scope Phase 1 — only 2 domains or all 10? | Default: 2 (corporate + WP). CEO can override. |
| FS 2025 filing on 2026-05-31 — already in progress with accountant, or fresh emergency? | Sol will surface on first run; CEO answers in-thread. |
| Mr. Ram contact info — should it be in `reference_lawyer_agent.md` for quick handoff? | Yes — include name, phone, WhatsApp, specialties, fee structure if known. |

## Acceptance Criteria

Phase 1 is complete when all of:

1. `/lawyer` (or `/saul`) loads `agents/lawyer/AGENT.md` and presents persona.
2. CEO can attach LEG-001 or LEG-002 PDF and Sol responds with Saul-flavored classification + register lookup.
3. `docs/operations/company-documents-register.md` exists with LEG-001 + LEG-002 entries.
4. GDrive `00_Legal/` exists with 10 subfolders + `_inbox/`, and LEG-001 + LEG-002 PDFs are at correct paths.
5. MC has 3 open `domain=legal` tasks: FS 2025 (critical), AGM 2026 (high), WP renewal 2027 (medium).
6. MC schema accepts `domain="legal"` without RPC error.
7. `operational-rules.md` Part IV lists `/lawyer` and free-text keywords route legal questions to it.
8. Memory pointers exist: `reference_lawyer_agent.md` and `reference_company_documents.md`.
9. Tech-Lead can route a legal question from another agent's session via `needs-lawyer` tag and Sol picks it up on next invocation.
10. Sanity test: ask "AGM когда?" → Sol answers with date + CCC §1171 + Saul voice + `Mr. Ram trigger? No`.

## References

- `docs/constitution/operational-rules.md` — agent routing, RULE-LANGUAGE-CONTRACT, Part IV
- `docs/plans/spec-agents-split.md` — agents architecture pattern
- `agents/_template/AGENT.md` — agent file template
- Memory `feedback_legal_question_routing.md` — Mr. Ram vs юр-ИИ split
- Memory `project_corporate_structure.md` — Shishka Co. tax ID, Lesia signing authority
- Civil & Commercial Code of Thailand §§ 1097-1273 (companies)
- Working of Aliens Act B.E. 2551 (2008)
- Immigration Act B.E. 2522 (1979)
- Food Act B.E. 2522 (1979)
- Labour Protection Act B.E. 2541 (1998)
- Revenue Code of Thailand (Books I-II)
- Personal Data Protection Act B.E. 2562 (2019, effective 1 June 2022)
