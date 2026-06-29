# Dead Services Audit — 2026-06-29

> Epic: Code Cleanup & Security Hardening (`2a8b06a4`) · Phase 1.1 (`70bf13c9`) + 1.2 (`f25392ba`)
> Verdict: **both directories are dead — safe to remove in Phase 2.1 (`7d56412c`).**

## `services/gas/` — VERDICT: DEAD ✅

GAS + Gemini receipt-parser pipeline. Self-declared deprecated.

- `services/gas/DEPRECATED.md` (2026-04-06): *"This entire directory is LEGACY code. DO NOT USE,
  DO NOT DEPLOY. Replaced by Finance Agent (Ollama/Gemma)."* (initiative `96f18092`, task `a35ff4e5`).
- Contents: `ReceiptParser.gs`, `appsscript.json`, `.clasp.json`, `package.json`, `DEPRECATED.md`
  — Google Apps Script project, deployed via `clasp` (external to this repo's build).

### Reference scan (whole monorepo, excl. node_modules/.git/the dir itself)

| Reference type | Result |
|---|---|
| Code imports (`import`/`require`/`from`) | **none** |
| CI / GitHub workflows | **none** |
| SQL migrations / edge functions | **none** |
| Plugin manifest / root `package.json` | **none** |
| `graphify-out/manifest.json` | lists the files only — auto-generated artifact, refreshes on next graph build |
| Docs/specs | historical mentions only (see clean-up list below) |

## `services/local-receipt-parser/` — VERDICT: DEAD ✅

Single `index.js` (~600 LOC) Ollama/`gemma4:e2b` CLI adapter + `package.json`. No npm scripts wire it
into any build; no HTTP server was ever added (the `server.js` in `spec-receipt-model-selector.md`
was never built).

### Reference scan

| Reference type | Result |
|---|---|
| Code imports | **none** |
| CI / workflows / migrations / edge functions | **none** |
| Only non-doc mention | `agents/finance/ollama-agent.js:48` — a **comment** (`// Adapted from … local-receipt-parser`), not an import. The live Ollama logic already lives in `agents/finance/`. |

## Doc cleanup performed alongside removal (Phase 2.1)

These **operational** docs gave live deploy instructions for the dead `services/gas/` and are corrected:

- `docs/keys-config.md:37` — `**Deploy:** cd services/gas && npm run deploy`
- `docs/tech-debt.md:14` — `GAS needs clasp push && npm run deploy from services/gas/`

Historical **spec/module** docs (`spec-receipt-model-selector.md`, `spec-ai-native-ops*.md`,
`sdd-mapping-engine.md`, `projects/admin/modules/{finance,receipts}.md`) are **left as-is** — they
are point-in-time design records, not live instructions.

## Conclusion

Removing `services/gas/` and `services/local-receipt-parser/` cannot break any build, CI job,
migration, edge function, or import. Proceed with `git rm -r` in Phase 2.1.
