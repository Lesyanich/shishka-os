---
title: GDrive Receipt Archive
type: project
tags: [project, finance, receipts, gdrive]
date: 2026-04-04
status: active
domain: "[[Domains/Finance]]"
mc_task: null
spec: docs/plans/spec-gdrive-receipt-archive.md
branch: feature/shared/gdrive-receipt-archive
pr_numbers: []
start: 2026-04-04
end: null
related: []
aliases: [Receipt Archive, GDrive Backup]
---

# GDrive Receipt Archive

> [!info] Project
> Auto-archive approved receipt photos to Google Drive with human-readable filenames.

## Objective

After a receipt is approved in admin-panel, an MCP tool `archive_receipt_gdrive` downloads the photo from Supabase Storage, renames it `{Supplier}_{YYYY-MM-DD}_{InvoiceNo}_p{N}.{ext}`, and saves it under `01_Business/Receipts/processed/{YYYY-MM}/`. The path is written back to `receipt_inbox.gdrive_paths` so InboxReviewPanel can show a folder link. Archive failure must never block approval — the receipt is already in the DB.

## Current State

- **Phase:** spec approved, MCP tool implementation pending
- **Owner:** [[People/Lesia]]
- **Spec:** `docs/plans/spec-gdrive-receipt-archive.md`
- **Branch:** `feature/shared/gdrive-receipt-archive`

## Recent Outcomes

- 2026-04-04 — spec drafted, naming convention locked, Service Account chosen over OAuth2
- 2026-04-28 — still pending GDrive folder ID + Service Account provisioning

## Risks & Open Questions

- Service Account JSON must be in Keychain, never in repo
- `payloads/` JSON backup, bank-transfers, and tax-invoices folders are explicitly out of scope for v1

## See Also

- Spec: `docs/plans/spec-gdrive-receipt-archive.md`
- Related: [[Projects/Adaptive Receipt Learning]], [[Projects/Phase 7.1 DB Architecture]]
- Domain: [[Domains/Finance]]
