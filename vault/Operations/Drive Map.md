---
title: Drive Map
type: page
tags: [operations, drive, navigation]
date: 2026-04-29
status: active
assets:
  - label: "Brand kit"
    path: "Drive: 01_Business/Branding/"
  - label: "Receipts archive"
    path: "Drive: 01_Business/Finance/Receipts/"
  - label: "Menu photos"
    path: "Drive: 01_Business/Menu/"
  - label: "Equipment manuals"
    path: "Drive: 01_Business/Equipment/"
  - label: "Contracts"
    path: "Drive: 01_Business/Legal/"
  - label: "Operations SOPs"
    path: "Drive: 01_Business/Operations/"
related:
  - "[[Operations/]]"
  - "[[Brand/]]"
  - "[[Finance/]]"
---

# Drive Map

The Confluence-style index of where every important file lives on Google Drive — for the moments when "I know we have a contract for X, where is it?" needs to be answered in 5 seconds, not 5 minutes of folder digging.

> [!info] How this page works
> - **Manually curated** — keep it organized, scannable, accurate
> - **`assets:` frontmatter** above auto-aggregates into the [`/brain/drive`](https://shishka-os.vercel.app/brain/drive) admin tab
> - When you add a new top-level folder on Drive, add an entry here AND mention it in the relevant entity page's `assets:` block

## Top-level — `01_Business/`

The root of all Shishka business-knowledge on Drive. Owned by Lesia + Bas.

```
Drive: 01_Business/
├── Branding/                Logos, photos, signboards, brand bible PDF
├── Finance/                 Receipts, bank, payroll, contracts (financial)
├── Menu/                    Customer-facing photography, menu PDFs
├── Equipment/               Manuals, warranty PDFs, supplier specs
├── Legal/                   Lease, work permits, FDA filings
├── Operations/              SOPs, HACCP archives, training materials
├── Marketing/               Campaign assets, social posts, partnerships
└── Phases/                  Phase planning archives, milestone records
```

## By topic

### Brand → see [[Brand/]]

| What | Drive path |
|---|---|
| Master horizontal logo | `01_Business/Branding/Main Logo/Shishka-Kitchen-Logo-24-12-25.png` |
| Logo on dark bg | `01_Business/Branding/Main Logo/Shishka-Kitchen-Logo-WG-24-12-25.jpg` |
| Vertical logo | `01_Business/Branding/Virtical Logo/Shishka-Kitchen-Logo-VIRTICAL-24-12-25.png` |
| Editable .ai source | `01_Business/Branding/Main Logo/Shishka Kitchen Logo 24-12-25.ai` |
| **SHISHKA BIBLE PDF** | `01_Business/Branding/SHISHKA BIBLE/SHISHKA BIBLE – The Future of Food 34.pdf` |
| 7X Guidelines PDF | `01_Business/Branding/SHISHKA BIBLE/7X_Guidelines_Final 13.3.2024.pdf` |
| Round stamp | `01_Business/Branding/STAMP/Shishka Stamp.pdf` |
| Storefront signboard | `01_Business/Branding/Signboard/Side Signboard shishka2 for print 140x100cm.pdf` |
| Pylon sign | `01_Business/Branding/Pylon Sign/Pylon-Sign-Shishka-2.jpg` |

### Finance → see [[Finance/]]

| What | Drive path |
|---|---|
| Receipt scans (auto-archive after approve) | `01_Business/Finance/Receipts/<YYYY-MM>/` |
| Bank statements (downloaded monthly) | `01_Business/Finance/Bank/<YYYY-MM>/` |
| Payroll records | `01_Business/Finance/Payroll/<YYYY-MM>/` |
| VAT / WHT filings | `01_Business/Finance/Tax/<YYYY-Q>/` |
| Annual P&L | `01_Business/Finance/Reports/<YYYY>/` |

### Menu → see [[Menu/]]

| What | Drive path |
|---|---|
| Customer-facing dish photography (originals) | `01_Business/Menu/Photos/Originals/` |
| Web-optimized dish photos | `01_Business/Menu/Photos/Web/` |
| Menu PDFs (printed for L2 take-away) | `01_Business/Menu/PDFs/<version>/` |
| Recipe development photos | `01_Business/Menu/R&D/<dish-name>/` |

### Equipment → see [[Equipment/]]

| What | Drive path |
|---|---|
| Equipment manuals (PDFs from manufacturers) | `01_Business/Equipment/Manuals/` |
| Warranty docs | `01_Business/Equipment/Warranty/` |
| Supplier spec sheets | `01_Business/Equipment/Specs/` |
| Maintenance log photos | `01_Business/Equipment/Maintenance/<YYYY-MM>/` |

### Legal

| What | Drive path |
|---|---|
| L1 lease agreement | `01_Business/Legal/Lease/L1-2026-2027.pdf` |
| L2 lease agreement | `01_Business/Legal/Lease/L2-2026-2026.pdf` |
| Work permits (Burmese prep staff) | `01_Business/Legal/Permits/<staff-name>/` |
| Thai FDA (อย.) filings | `01_Business/Legal/FDA/<filing-id>/` |
| Company registration | `01_Business/Legal/Company/` |

### Operations → see [[Operations/]]

| What | Drive path |
|---|---|
| HACCP daily sheets archive | `01_Business/Operations/HACCP/<YYYY-MM>/` |
| Cleaning checklists | `01_Business/Operations/Checklists/` |
| Staff training videos | `01_Business/Operations/Training/Videos/` |
| Staff training docs | `01_Business/Operations/Training/Docs/` |
| Photos of L1 / L2 sites | `01_Business/Operations/Sites/` |

### Phases / Project history

| What | Drive path |
|---|---|
| Phase 1 launch plan | `01_Business/Phases/Phase-1-Launch/` |
| Pre-launch milestone records | `01_Business/Phases/Milestones/` |

## How to access from agents

- **Local filesystem** — paths above resolve on any machine with the shared Drive mounted (Lesia's + Bas's laptops, agent workstations). Use `Read` tool with full path.
- **Google Drive MCP** — when local FS not available, `mcp__*__search_files` / `read_file_content` MCP tools work directly against Drive (search by filename, e.g. `Shishka-Kitchen-Logo-24-12-25`)
- **Don't commit binaries from `01_Business/`** — that folder is gitignored on purpose (see `.gitignore`)

## Adding a new top-level folder

If you create a new top-level folder under `01_Business/` on Drive:

1. Add an entry in this page's frontmatter `assets:` block
2. Add a row in the relevant section above
3. If it's a new entity (e.g., a new domain), consider whether a vault folder for it makes sense (currently 9 entity folders + 4 sidebar)

## See Also

- [[Brand/]] — full asset table (overlapping with §Brand here)
- [[Operations/]]
- [`docs/branding/assets-index.md`](../../docs/branding/assets-index.md) — auto-generated filesystem index for Branding
