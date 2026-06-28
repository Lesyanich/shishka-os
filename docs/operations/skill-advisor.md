# Skill Advisor — Tool Registry

**Purpose.** A single, scannable catalog of "task → tool" for Shishka OS. The CEO cannot
hold the whole arsenal in her head (dozens of skills, slash-commands, MCP servers). This
file is the source of truth the **Skill Advisor** uses to surface the right tool at the
right moment.

**Two jobs, one file:**
1. **Human cheat-sheet** — browse the domain sections below to find the tool for a job.
2. **Machine map** — the `ADVISOR-MAP` table at the bottom is parsed by
   `scripts/skill-advisor.sh` (a `UserPromptSubmit` hook). When the user's message matches
   a tool's trigger keywords, the hook injects a quiet `💡` hint. Each tool is suggested at
   most once per session (dedup via `.claude/.skill-advisor-seen`).

**Behavioral contract:** see `docs/constitution/operational-rules.md` § RULE-SKILL-ADVISOR.

**Maintenance (compound engineering):** found a tool that would have helped but wasn't
suggested? Add a row to the `ADVISOR-MAP` table. Keep keywords **bilingual (RU + EN)** and
specific enough to avoid false matches (the hook does plain substring matching). For code
tasks, the REQUIRED/RECOMMENDED/FORBIDDEN skill set per `kind:*` tag lives in
`docs/operations/skills-services-policy.md` § Task-Kind Taxonomy — this registry does not
duplicate it.

---

## Domains

### Kitchen / recipes / menu
- **`/chef`** (mcp `shishka-chef`) — recipes, BOM, cost rollup, КБЖУ/nutrition, dish pricing. _e.g. "посчитай себестоимость блюда", "calculate nutrition"._
- **`shishka-invoice-parser`** — parse a supplier invoice PDF/image → line items → BOM / purchase logs.

### Finance / receipts
- **`/finance`** (mcp `shishka-finance`) — receipts, invoices, expense classification (COGS/CAPEX/OPEX), supplier payments. _e.g. "обработай новый чек"._

### Procurement / sourcing
- **`/procurement`** — research equipment & suppliers, price comparison, sourcing recommendations.

### Legal / visas / contracts (Thailand)
- **`/lawyer`** (`/saul`) — work permits, visas, FDA licensing, leases, labour, tax (VAT/PND), supplier contracts, PDPA, compliance calendar.

### Code review / quality
- **`/code-review`** — review the current diff for correctness bugs (add `ultra` for deep cloud review).
- **`/simplify`** — reuse/simplify/refactor changed code (quality only, no bug hunt).
- **`security-review`** — AppSec audit: injections, XSS, secret leaks, RLS gaps.

### Data / Supabase
- **mcp `supabase`** — migrations (`apply_migration`), `execute_sql`, advisors, logs. Respect RULE-NO-DIRECT-DB-EDITS.

### Code navigation / knowledge graph
- **mcp `shishka-graphify`** (`graphify_query_topic`) — "what connects to / depends on / where does X live". GRAPH-BEFORE-GREP.
- **`Explore` agent** — broad read-only codebase search when scope is uncertain.

### Design / UI / Figma
- **`frontend-design`** / **`ui-ux-pro-max`** — build distinctive, production-grade UI; styles, palettes, font pairings.
- **mcp `figma`** — design ↔ code, mockups, design-system sync.
- **`emil-design-eng`** — UI polish, animation, microinteraction judgment.

### Browser / desktop automation
- **mcp `claude-in-chrome`** — web automation & scraping (Lazada, Loyverse Back Office, Tops).
- **mcp `computer-use`** — native macOS apps & cross-app workflows.

### Research / web
- **`deep-research`** — multi-source, fact-checked, cited research report.
- **`defuddle`** — extract clean markdown from a URL (cheaper than WebFetch).
- **WebSearch / WebFetch** — quick one-off lookups.

### Documents
- **`pdf`** — read/merge/split/fill PDFs. **`xlsx`** — spreadsheets (xlsx/csv). **`docx` / `pptx`** — Word / PowerPoint.

### Tasks / Mission Control / GSD
- **mcp `shishka-mission-control`** — business tasks, sprints, comments, backlog.
- **`/task-lifecycle`** — task → work → test → PR → MC closeout.
- **`gsd-*`** — structured plan / execute-phase / debug workflow.

### Sessions / memory / health
- **`/session-diary`** — save session summary to memory at session end.
- **`consolidate-memory`** — merge duplicate / stale memories.
- **`/health`** — Shishka OS health snapshot.

### Scheduling / automation
- **`/schedule`** — recurring cloud agent (cron) or one-time scheduled run.
- **`/loop`** — run a prompt/command on a recurring interval in-session.

### Meta / discovery
- **`skill-creator`** — create / edit / optimize a skill.
- **`find-skills`** — discover installable skills for a capability gap.
- **`polyclaude:council`** — stress-test an idea from multiple cognitive perspectives.
- **Routing agents:** `/coo`, `/strategy`, `/techlead`.

---

## ADVISOR-MAP (machine-readable — parsed by `scripts/skill-advisor.sh`)

Format: `| keywords (comma-separated, RU+EN) | tool | label |`. Keep keywords lowercase and
specific. The header and separator rows are skipped by the parser.

<!-- ADVISOR-MAP-START -->
| keywords | tool | label |
|---|---|---|
| чек,накладная,счёт,расход,invoice,receipt,expense,cogs,capex,opex | `/finance` | process receipts & classify expenses |
| рецепт,блюдо,себестоимост,калькуляц,кбжу,нутри,recipe,dish,nutrition,food cost,menu cost | `/chef` | recipes, BOM, cost & nutrition |
| распознай накладную,parse invoice,supplier bill,parse the pdf invoice | `shishka-invoice-parser` | parse supplier invoice → BOM/purchase logs |
| поставщик,закупк,оборудован,купить,sourcing,supplier,procurement,price comparison,equipment | `/procurement` | sourcing & price comparison |
| виза,work permit,fda,лиценз,контракт,аренд,налог,vat,pnd,юрист,закон,штраф,visa,contract,legal,immigration | `/lawyer` | Thai legal, visas, contracts, tax |
| миграц,migration,row-level security,execute_sql,supabase sql,db schema,схему бд | `mcp supabase` | DB migrations & SQL (apply_migration) |
| где находит,что зависит,что связан,depends on,what connects,where does | `mcp shishka-graphify` | code graph — what connects to X (GRAPH-BEFORE-GREP) |
| сделай ревью,проведи ревью,ревью кода,code review,review the diff,review changes,баги в коде | `/code-review` | review diff for correctness bugs |
| упрост,рефактор,simplify,refactor,dead code,cleanup the code | `/simplify` | simplify & refactor changed code |
| уязвим,инъекц,xss,sql injection,secret leak,security audit,безопасн | `security-review` | security audit (injections, secrets, RLS) |
| интерфейс,вёрстк,верстк,лендинг,дашборд,frontend,landing page,новый экран,react компонент | `frontend-design` | build distinctive UI |
| figma,макет,мокап,mockup,design file | `mcp figma` | Figma design ↔ code |
| скрейп,спарси сайт,открой сайт,браузер,lazada,scrape,browser automation,loyverse back office | `mcp claude-in-chrome` | browser automation & scraping |
| pdf,пдф | `pdf` | read/merge/split PDF |
| excel,эксель,xlsx,csv,spreadsheet,гугл-таблиц | `xlsx` | spreadsheets |
| исследован,глубок research,deep research,сравни рынок,market research | `deep-research` | multi-source cited research report |
| прочитай статью,прочитай страницу,документац,read this article,read this url,clean markdown | `defuddle` | extract clean markdown from a URL |
| спринт,backlog,бэклог,mission control,list_tasks,новая задач | `mcp shishka-mission-control` | tasks & sprints |
| создай pr,заверши задач,закончил задач,create pr,finish task,task done,закрой задач | `/task-lifecycle` | task → PR → MC closeout flow |
| план фаз,execute phase,plan phase,gsd workflow | `gsd-*` | structured plan/execute/debug workflow |
| заверши сесси,end session,session diary,сохрани сессию | `/session-diary` | save session summary to memory |
| здоровье систем,system health,статус os | `/health` | Shishka OS health snapshot |
| создай скилл,создать скилл,новый скилл,create skill,edit skill | `skill-creator` | create/edit skills |
| найди скилл,какой скилл,is there a skill,find a skill,какой инструмент,какие инструменты | `find-skills` | discover installable skills |
| по расписанию,каждый день,cron,scheduled agent,напомни мне | `/schedule` | recurring cloud agent / cron |
| на интервал,каждые,keep running,run on a loop | `/loop` | run a prompt on a recurring interval |
| несколько перспектив,red team,devil's advocate,стресс-тест иде,разнеси идею,poke holes | `polyclaude:council` | multi-perspective stress-test of an idea |
| obsidian,заметк в обсидиан,vault,канвас,obsidian base | `obsidian skills` | Obsidian vault notes / bases / canvas |
<!-- ADVISOR-MAP-END -->
