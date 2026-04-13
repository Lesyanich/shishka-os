# CLAUDE.md — Shishka OS v6.0

## Identity
Shishka Healthy Kitchen ERP. Multiple projects, one Supabase backend.

## Language Contract
- Conversation: human's language (CEO → Russian, partner → their language)
- Storage (DB, MC, code, commits, specs): English only, no exceptions
- Full rule: `docs/constitution/core-rules.md` § RULE-LANGUAGE-CONTRACT

## Session Start (MANDATORY)
1. Read `docs/constitution/core-rules.md`
2. Pick up task: `list_tasks(status="in_progress")` → if empty → `list_tasks(status="inbox")`
3. Load task context: `get_task(id)` → read `spec_file` + `context_files`
4. If task has `context_files` → load ONLY those + `core-rules.md`. Skip everything else.
5. If no `context_files` → read `docs/constitution/context-routing.md` for L1/L2/LK
6. For code/DB tasks, also load `docs/constitution/engineering-rules.md`
7. For agent behavior questions, load `docs/constitution/agent-rules.md`

## Agent Routing
If user sends `/chef`, `/finance`, `/strategy`, `/techlead` → read `docs/constitution/agent-routing.md`
If user sends free text → infer domain from content, load the matching `agents/{name}/AGENT.md`.
When unsure → ask: "This sounds like [domain]. Should I load [agent]?"

## Core Principles
- **PLAN-BEFORE-BUILD:** 3+ steps → write plan first, get confirmation, then build
- **VERIFY-BEFORE-DONE:** never close a task without proving it works (build, test, diff)
- **MINIMAL-CORRECT-CHANGE:** touch only scope files, fix root cause, simple > abstract
- **COMPOUND-ENGINEERING:** CEO corrects you → update `docs/` so it never repeats
- **BACKLOG-FIRST:** found work outside current task → log to MC, don't start it
- **SOCRATIC-GATE:** new feature/migration → stop, ask 2-3 questions before code

## Rules (enforced)
- **Commit Gate:** never push until MC task + CURRENT.md updated
- **Git:** branches `feature/{project}/description`, never commit to `main`
- **Task lifecycle:** `.claude/skills/task-lifecycle/SKILL.md`
- **STATUS.md** is auto-generated — never edit manually

<!-- GSD:project-start source:PROJECT.md -->
## Project

**Menu Control & Preview Page**

A unified menu management page in the Shishka admin panel (`/menu`) that serves two purposes: an owner control dashboard showing dish costs, margins, and editability — and a customer-facing preview showing how the menu will look on the future website. Toggle between views on one page.

**Core Value:** The owner can see, control, and preview the entire menu in one place — understanding how it looks, sounds, and performs financially.

### Constraints

- **Tech stack**: Must use existing admin-panel stack (Vite + React 19 + RR7) — no new frameworks
- **Data model**: No new tables — build entirely on existing nomenclature + product_categories + bom_structures + tags
- **Theme**: Dark-only, consistent with existing admin panel design system
- **i18n-ready**: String literals should be externalizable, but no i18n framework in v1
<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->
## Technology Stack

## Existing Stack (Do Not Change)
| Layer | Technology | Version |
|-------|-----------|---------|
| Bundler | Vite | ^7.3.1 |
| UI framework | React | ^19.2.0 |
| Routing | React Router DOM | ^7.13.1 |
| Styling | Tailwind CSS | ^4.2.1 |
| Icons | lucide-react | ^0.577.0 |
| Charts | recharts | ^3.8.0 |
| Backend | Supabase JS | ^2.98.0 |
| Language | TypeScript | ~5.9.3 strict |
## Recommended Patterns
### 1. View Toggle (Owner / Customer)
### 2. Owner Dashboard Table (with cost metrics)
- `@tanstack/react-table` — not installed, v9 still alpha (alpha.20 as of March 2026), overkill for this use case
- `mantine-react-table` — requires Mantine, not in stack
- AG Grid — enterprise dependency, wrong for this scale
| Column | Source field | Format |
|--------|-------------|--------|
| Name | `name` | Text, inline editable |
| Category | `product_categories.name_l1` | Badge |
| Price | `price` | `฿ X,XXX` |
| Cost | `cost_per_unit` | `฿ X,XXX` |
| Food Cost % | computed | Color-coded badge (green <30%, amber 30–45%, red >45%) |
| Margin | computed | `฿ X,XXX` |
| Available | `is_available` | Toggle switch |
| Featured | `is_featured` | Toggle switch |
### 3. Inline Editing
- Clicking a cell in the owner table puts that row into edit mode
- The row renders `<input>` elements in place of static text for editable fields (`name`, `description`, `price`)
- Non-editable computed fields (`cost`, food cost %) remain static
- Save on blur or Enter key; cancel on Escape
- Use React 19 `useOptimistic` for instant UI feedback before the Supabase `.update()` resolves
### 4. is_available / is_featured Toggles
### 5. Customer Preview — Card Grid
### 6. Nutrition & Tag Badges
- Calories → `bg-amber-900/40 text-amber-300`
- Protein → `bg-sky-900/40 text-sky-300`
- Carbs → `bg-violet-900/40 text-violet-300`
- Fat → `bg-rose-900/40 text-rose-300`
- Use tag color from DB or fall back to `bg-slate-700 text-slate-300`
### 7. Category Sections / Tab Navigation
### 8. Photo Placeholder
### 9. Data Fetching
- Fetches `nomenclature` (type='dish', product_code LIKE 'SALE-%') joined with `product_categories`, `bom_structures` (for cost rollup), `nomenclature_tags` + `tags`
- Exposes `dishes`, `categories`, `isLoading`, `error`, `updateDish`
- `updateDish` calls `supabase.from('nomenclature').update(patch).eq('id', id)` and returns `{ ok, error }`
- Page uses `useOptimistic` wrapping the `dishes` array returned by the hook
## Alternatives Considered
| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Table | Hand-rolled `<table>` | TanStack Table v8 | Not installed; v9 still alpha; overkill for one page |
| Inline edit | Row-level state | Modal (current SkuManager pattern) | Slower UX; more clicks; owner wants fast price edits |
| Cards | Hand-built DishCard | shadcn Card | shadcn not actually installed as npm pkg; codebase copies primitives or hand-rolls |
| Toggle | Custom `<button>` | headlessui Switch | Not installed; adds dependency for trivial UI |
| Optimistic UI | `useOptimistic` (React 19) | Local `isSaving` state | Already available; eliminates revert flicker |
| Category nav | Tab strip | Sidebar accordion | Accordion breaks card grid; tabs are space-efficient |
## No New Dependencies Required
- **lucide-react** covers all icons needed (ChefHat, Eye, EyeOff, Star, Edit3, Check, X, LayoutGrid, Table2, Tag, Flame, Dumbbell)
- **Tailwind CSS v4** covers all layout and animation needs
- **React 19 useOptimistic** covers optimistic updates (stable, no package needed)
- **Supabase JS** covers all data operations
## Key Design Constraints
## Sources
- [shadcn/ui React 19 compatibility](https://ui.shadcn.com/docs/react-19) — confirmed React 19 support
- [TanStack Table releases](https://github.com/TanStack/table/releases) — v9 still alpha as of March 2026
- [React useOptimistic](https://react.dev/reference/react/useOptimistic) — stable in React 19
- [shadcn inline edit table pattern](https://www.shadcn.io/blocks/tables-inline-edit) — reference pattern (adapted to hand-rolled style)
- Codebase audit: `apps/admin-panel/package.json`, `SkuManager.tsx`, `ExpenseEditModal.tsx`, `DeviationBadge.tsx`
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

| Skill | Description | Path |
|-------|-------------|------|
| codereview |  | `.claude/skills/codereview/SKILL.md` |
| defuddle | Extract clean markdown content from web pages using Defuddle CLI, removing clutter and navigation to save tokens. Use instead of WebFetch when the user provides a URL to read or analyze, for online documentation, articles, blog posts, or any standard web page. | `.claude/skills/defuddle/SKILL.md` |
| frontend-design | Create distinctive, production-grade frontend interfaces with high design quality. Use this skill when the user asks to build web components, pages, artifacts, posters, or applications (examples include websites, landing pages, dashboards, React components, HTML/CSS layouts, or when styling/beautifying any web UI). Generates creative, polished code and UI design that avoids generic AI aesthetics. | `.claude/skills/frontend-design/SKILL.md` |
| json-canvas | Create and edit JSON Canvas files (.canvas) with nodes, edges, groups, and connections. Use when working with .canvas files, creating visual canvases, mind maps, flowcharts, or when the user mentions Canvas files in Obsidian. | `.claude/skills/json-canvas/SKILL.md` |
| obsidian-bases | Create and edit Obsidian Bases (.base files) with views, filters, formulas, and summaries. Use when working with .base files, creating database-like views of notes, or when the user mentions Bases, table views, card views, filters, or formulas in Obsidian. | `.claude/skills/obsidian-bases/SKILL.md` |
| obsidian-cli | Interact with Obsidian vaults using the Obsidian CLI to read, create, search, and manage notes, tasks, properties, and more. Also supports plugin and theme development with commands to reload plugins, run JavaScript, capture errors, take screenshots, and inspect the DOM. Use when the user asks to interact with their Obsidian vault, manage notes, search vault content, perform vault operations from the command line, or develop and debug Obsidian plugins and themes. | `.claude/skills/obsidian-cli/SKILL.md` |
| obsidian-markdown | Create and edit Obsidian Flavored Markdown with wikilinks, embeds, callouts, properties, and other Obsidian-specific syntax. Use when working with .md files in Obsidian, or when the user mentions wikilinks, callouts, frontmatter, tags, embeds, or Obsidian notes. | `.claude/skills/obsidian-markdown/SKILL.md` |
| pdf | Use this skill whenever the user wants to do anything with PDF files. This includes reading or extracting text/tables from PDFs, combining or merging multiple PDFs into one, splitting PDFs apart, rotating pages, adding watermarks, creating new PDFs, filling PDF forms, encrypting/decrypting PDFs, extracting images, and OCR on scanned PDFs to make them searchable. If the user mentions a .pdf file or asks to produce one, use this skill. | `.claude/skills/pdf/SKILL.md` |
| security-review |  | `.claude/skills/security-review/SKILL.md` |
| session-diary | "Auto-save session summary to MemPalace before ending. Triggers: session end, end session, завершить сессию, save diary, /session-diary." | `.claude/skills/session-diary/SKILL.md` |
| shishka-finance-agent | "Financial agent for Shishka Healthy Kitchen. Processes receipts from inbox: downloads photos from Supabase Storage, reads via vision, parses line items, classifies expenses (COGS/CAPEX/OPEX), saves structured payload for admin review. Triggers on: receipt, invoice, чек, накладная, счёт, expense, purchase, финансы, расход, обработать чеки, inbox, новый чек." | `.claude/skills/shishka-finance-agent/SKILL.md` |
| shishka-invoice-parser | Parse supplier invoices (PDF or image) for Shishka Healthy Kitchen. Use when the user asks to parse, read, or process a PDF or image invoice from a supplier, extract line items, match ingredients to the nomenclature database, and generate purchase_logs or expense_ledger INSERT statements. Also triggers on "invoice", "nakladnaya", "supplier bill", or Thai supplier document mentions. | `.claude/skills/shishka-invoice-parser/SKILL.md` |
| skill-creator | Create new skills, modify and improve existing skills, and measure skill performance. Use when users want to create a skill from scratch, edit, or optimize an existing skill, run evals to test a skill, benchmark skill performance with variance analysis, or optimize a skill's description for better triggering accuracy. | `.claude/skills/skill-creator/SKILL.md` |
| task-lifecycle | "Complete task workflow: pick up MC task → work → test → PR → MC update. Triggers: task done, finish task, create PR, закончил, готово, завершить задачу, what should I work on, start session, pick up task." | `.claude/skills/task-lifecycle/SKILL.md` |
| xlsx | "Use this skill any time a spreadsheet file is the primary input or output. This means any task where the user wants to: open, read, edit, or fix an existing .xlsx, .xlsm, .csv, or .tsv file (e.g., adding columns, computing formulas, formatting, charting, cleaning messy data); create a new spreadsheet from scratch or from other data sources; or convert between tabular file formats. Trigger especially when the user references a spreadsheet file by name or path — even casually (like \"the xlsx in my downloads\") — and wants something done to it or produced from it. Also trigger for cleaning or restructuring messy tabular data files (malformed rows, misplaced headers, junk data) into proper spreadsheets. The deliverable must be a spreadsheet file. Do NOT trigger when the primary deliverable is a Word document, HTML report, standalone Python script, database pipeline, or Google Sheets API integration, even if tabular data is involved." | `.claude/skills/xlsx/SKILL.md` |
| emil-design-eng | This skill encodes Emil Kowalski's philosophy on UI polish, component design, animation decisions, and the invisible details that make software feel great. | `.agents/skills/emil-design-eng/SKILL.md` |
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
