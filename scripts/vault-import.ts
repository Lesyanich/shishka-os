/**
 * Knowledge Vault Bootstrap — Phase 2 import audit manifest.
 *
 * Documents the source-to-vault mapping for the 65 starter notes written
 * during the Phase 2 bulk import (2026-04-28). Spec: docs/plans/spec-knowledge-vault-bootstrap.md §5.
 *
 * Sign-off: MC task 1ad969ae-9d1f-4959-b8ab-4b02524da7a7, comment 8c726fcf.
 *
 * This is a one-time audit trail, not an executable importer. The actual
 * note bodies were written by 6 parallel writer agents. This manifest is
 * the structured record of which note came from which source — useful for:
 *   - regenerating notes if sources change materially
 *   - future Graphify analysis (god_node provenance)
 *   - audit when a vault note's claim is challenged
 *
 * Auto Memory base path:
 *   ~/.claude/projects/-Users-lesianich-Library-CloudStorage-GoogleDrive-lesia-shishka-health-------------Shishka-healthy-kitchen/memory/
 */

export type ImportSource =
  | { kind: 'auto-memory'; file: string }
  | { kind: 'spec'; file: string }
  | { kind: 'mc-task'; id: string; title?: string }
  | { kind: 'commit'; sha: string; pr?: number }
  | { kind: 'code'; path: string }
  | { kind: 'synthesised'; rationale: string };

export type VaultEntry = {
  type: 'decision' | 'project' | 'domain' | 'person' | 'milestone' | 'question';
  path: string;
  sources: ImportSource[];
};

export const VAULT_IMPORT_MANIFEST: VaultEntry[] = [
  // ── Decisions (26) ───────────────────────────────────────────────────
  { type: 'decision', path: 'vault/Decisions/D-001-migration-column-existence-check.md', sources: [{ kind: 'auto-memory', file: 'feedback_migration_safety.md' }] },
  { type: 'decision', path: 'vault/Decisions/D-002-migrations-path.md', sources: [{ kind: 'auto-memory', file: 'feedback_migrations_path.md' }] },
  { type: 'decision', path: 'vault/Decisions/D-003-commit-and-push-after-every-change.md', sources: [{ kind: 'auto-memory', file: 'feedback_commit_push.md' }] },
  { type: 'decision', path: 'vault/Decisions/D-004-update-task-done-before-reporting.md', sources: [{ kind: 'auto-memory', file: 'feedback_mc_task_closure.md' }, { kind: 'synthesised', rationale: 'Source memory file referenced in MEMORY.md index but missing from disk; distilled from index entry' }] },
  { type: 'decision', path: 'vault/Decisions/D-005-db-and-mc-english-only.md', sources: [{ kind: 'auto-memory', file: 'feedback_db_language.md' }] },
  { type: 'decision', path: 'vault/Decisions/D-006-coo-ends-with-routing.md', sources: [{ kind: 'auto-memory', file: 'feedback_coo_routing_advisory.md' }] },
  { type: 'decision', path: 'vault/Decisions/D-007-coo-handoff-format.md', sources: [{ kind: 'auto-memory', file: 'feedback_coo_handoff_short.md' }] },
  { type: 'decision', path: 'vault/Decisions/D-008-coo-no-chat-packets.md', sources: [{ kind: 'auto-memory', file: 'feedback_coo_no_chat_packets_ever.md' }] },
  { type: 'decision', path: 'vault/Decisions/D-009-coo-no-ceo-chores.md', sources: [{ kind: 'auto-memory', file: 'feedback_coo_no_ceo_chores.md' }] },
  { type: 'decision', path: 'vault/Decisions/D-010-verify-before-correcting.md', sources: [{ kind: 'auto-memory', file: 'feedback_verify_before_correcting.md' }] },
  { type: 'decision', path: 'vault/Decisions/D-011-vite-anon-key-public.md', sources: [{ kind: 'auto-memory', file: 'feedback_vite_anon_key_not_secret.md' }] },
  { type: 'decision', path: 'vault/Decisions/D-012-verify-explore-output.md', sources: [{ kind: 'auto-memory', file: 'feedback_verify_explore_assumptions.md' }] },
  { type: 'decision', path: 'vault/Decisions/D-013-never-pipe-secrets-through-sed.md', sources: [{ kind: 'auto-memory', file: 'feedback_never_sed_secrets.md' }] },
  { type: 'decision', path: 'vault/Decisions/D-014-never-tail-secret-stderr.md', sources: [{ kind: 'auto-memory', file: 'feedback_never_tail_stderr_secrets.md' }] },
  { type: 'decision', path: 'vault/Decisions/D-015-security-w-hex-decode.md', sources: [{ kind: 'auto-memory', file: 'feedback_security_w_hex.md' }] },
  { type: 'decision', path: 'vault/Decisions/D-016-hc3-write-smoke-stubs.md', sources: [{ kind: 'auto-memory', file: 'feedback_admin_panel_hc3_no_runner.md' }] },
  { type: 'decision', path: 'vault/Decisions/D-017-call-it-supabase-log-not-tokens.md', sources: [{ kind: 'auto-memory', file: 'feedback_tokenomics_language.md' }] },
  { type: 'decision', path: 'vault/Decisions/D-018-claim-task-first-action.md', sources: [{ kind: 'auto-memory', file: 'feedback_in_progress_gate.md' }] },
  { type: 'decision', path: 'vault/Decisions/D-019-verify-task-state-before-reporting.md', sources: [{ kind: 'auto-memory', file: 'feedback_verify_task_state.md' }] },
  { type: 'decision', path: 'vault/Decisions/D-020-equipment-routing-via-recipes-flow.md', sources: [{ kind: 'auto-memory', file: 'feedback_equipment_routing.md' }] },
  { type: 'decision', path: 'vault/Decisions/D-021-check-all-branches-before-claiming-missing.md', sources: [{ kind: 'auto-memory', file: 'feedback_planning_artifacts_branch.md' }] },
  { type: 'decision', path: 'vault/Decisions/D-022-skip-ui-spec-when-context-has-decisions.md', sources: [{ kind: 'auto-memory', file: 'feedback_skip_ui_spec_data_phases.md' }] },
  { type: 'decision', path: 'vault/Decisions/D-023-recheck-branch-before-staging.md', sources: [{ kind: 'auto-memory', file: 'feedback_parallel_session_branch_switch.md' }] },
  { type: 'decision', path: 'vault/Decisions/D-024-always-gh-pr-never-local-merge.md', sources: [{ kind: 'auto-memory', file: 'feedback_merge_via_gh_pr.md' }] },
  { type: 'decision', path: 'vault/Decisions/D-025-eslint-off-not-warn-with-max-warnings-0.md', sources: [{ kind: 'auto-memory', file: 'project_precommit_max_warnings.md' }] },
  { type: 'decision', path: 'vault/Decisions/D-026-nomenclature-prefix-base-unit-convention.md', sources: [{ kind: 'auto-memory', file: 'project_nomenclature_unit_conventions.md' }] },

  // ── Projects (12) ────────────────────────────────────────────────────
  { type: 'project', path: 'vault/Projects/Knowledge Vault Bootstrap.md', sources: [{ kind: 'spec', file: 'docs/plans/spec-knowledge-vault-bootstrap.md' }, { kind: 'mc-task', id: '1ad969ae-9d1f-4959-b8ab-4b02524da7a7' }] },
  { type: 'project', path: 'vault/Projects/Shishka Brain v2.md', sources: [{ kind: 'spec', file: 'docs/plans/spec-shishka-brain.md' }] },
  { type: 'project', path: 'vault/Projects/Graphify Pipeline.md', sources: [{ kind: 'spec', file: 'docs/plans/spec-graphify-phase3.md' }, { kind: 'auto-memory', file: 'project_lightrag_removed.md' }] },
  { type: 'project', path: 'vault/Projects/MemPalace.md', sources: [{ kind: 'spec', file: 'docs/plans/spec-mempalace-phase2.md' }] },
  { type: 'project', path: 'vault/Projects/Knowledge Hub Admin Page.md', sources: [{ kind: 'spec', file: 'docs/plans/spec-knowledge-hub.md' }] },
  { type: 'project', path: 'vault/Projects/Multi-Agent Coordination v2.md', sources: [{ kind: 'spec', file: 'docs/plans/spec-multi-agent-coordination.md' }, { kind: 'auto-memory', file: 'project_multi_agent_coordination_v2.md' }, { kind: 'commit', sha: 'unknown', pr: 147 }] },
  { type: 'project', path: 'vault/Projects/GDrive Receipt Archive.md', sources: [{ kind: 'spec', file: 'docs/plans/spec-gdrive-receipt-archive.md' }] },
  { type: 'project', path: 'vault/Projects/Phase 7.1 DB Architecture.md', sources: [{ kind: 'auto-memory', file: 'project_db_architecture.md' }] },
  { type: 'project', path: 'vault/Projects/ERP Consolidation.md', sources: [{ kind: 'auto-memory', file: 'project_erp_consolidation.md' }] },
  { type: 'project', path: 'vault/Projects/Adaptive Receipt Learning.md', sources: [{ kind: 'auto-memory', file: 'project_adaptive_receipt_learning.md' }] },
  { type: 'project', path: 'vault/Projects/Data Health Self-Learning Loop.md', sources: [{ kind: 'auto-memory', file: 'project_data_health_loop.md' }] },
  { type: 'project', path: 'vault/Projects/Menu Control Page.md', sources: [
    { kind: 'mc-task', id: 'c425fd5e-03f2-409a-8921-9b5b71340c6e', title: 'URL routing v2' },
    { kind: 'mc-task', id: 'cf1acf35-8eb6-469a-a9c1-2ade81abb438', title: 'visual redress' },
    { kind: 'mc-task', id: 'ba109556-b8e2-4af5-bde8-c505a2e6c451', title: 'redress sweep' },
    { kind: 'mc-task', id: '7bb02837-90ac-4193-bf5e-cf03bbdae824', title: 'customer preview' },
    { kind: 'mc-task', id: '72f27618-beed-4fb2-a234-54069b044b47', title: 'keyboard nav' },
    { kind: 'mc-task', id: '01906a40-7bc1-4e31-a18b-31dc3bc483de', title: 'preview detail drawer' },
    { kind: 'mc-task', id: 'a81c366c-744f-4558-ba2c-3671df16799f', title: 'gallery detail drawer' },
    { kind: 'code', path: 'apps/admin-panel/src/pages/menu/MenuPage.tsx' },
  ] },

  // ── Domains (9) ──────────────────────────────────────────────────────
  { type: 'domain', path: 'vault/Domains/Menu.md', sources: [{ kind: 'synthesised', rationale: 'menu-page MC tasks + brand tokens' }, { kind: 'code', path: 'apps/admin-panel/src/pages/menu/' }] },
  { type: 'domain', path: 'vault/Domains/Kitchen.md', sources: [{ kind: 'synthesised', rationale: 'recipes_flow architecture, equipment routing' }, { kind: 'code', path: 'vault/Architecture/Shishka OS Architecture.md' }] },
  { type: 'domain', path: 'vault/Domains/Finance.md', sources: [{ kind: 'code', path: 'vault/Architecture/Financial Ledger.md' }] },
  { type: 'domain', path: 'vault/Domains/Procurement.md', sources: [{ kind: 'code', path: 'vault/Architecture/Procurement & Receiving Architecture.md' }] },
  { type: 'domain', path: 'vault/Domains/KDS.md', sources: [{ kind: 'mc-task', id: 'f73da9fa-a6b7-4ca7-88bf-5266f653977b', title: 'KDS auth hardening' }] },
  { type: 'domain', path: 'vault/Domains/Staff.md', sources: [{ kind: 'auto-memory', file: 'project_staff_roster.md' }] },
  { type: 'domain', path: 'vault/Domains/Locations.md', sources: [{ kind: 'auto-memory', file: 'project_location.md' }] },
  { type: 'domain', path: 'vault/Domains/Admin Panel.md', sources: [{ kind: 'auto-memory', file: 'project_admin_panel_stack.md' }, { kind: 'code', path: 'apps/admin-panel/package.json' }] },
  { type: 'domain', path: 'vault/Domains/Secrets Management.md', sources: [{ kind: 'auto-memory', file: 'reference_keychain_secrets.md' }, { kind: 'auto-memory', file: 'reference_keychain_db_url.md' }] },

  // ── People (4) ───────────────────────────────────────────────────────
  { type: 'person', path: 'vault/People/Lesia.md', sources: [{ kind: 'auto-memory', file: 'user_lesia.md' }] },
  { type: 'person', path: 'vault/People/Bas.md', sources: [{ kind: 'auto-memory', file: 'project_staff_roster.md' }] },
  { type: 'person', path: 'vault/People/Alex.md', sources: [{ kind: 'auto-memory', file: 'project_staff_roster.md' }] },
  { type: 'person', path: 'vault/People/Hein.md', sources: [{ kind: 'auto-memory', file: 'project_staff_roster.md' }] },

  // ── Milestones (11) ──────────────────────────────────────────────────
  { type: 'milestone', path: 'vault/Milestones/2026-04-12-lightrag-decommissioned.md', sources: [{ kind: 'auto-memory', file: 'project_lightrag_removed.md' }, { kind: 'spec', file: 'docs/plans/spec-shishka-brain.md' }] },
  { type: 'milestone', path: 'vault/Milestones/2026-04-28-multi-agent-coordination-v2.md', sources: [{ kind: 'mc-task', id: '3f41841d-ce30-494c-9497-8f5f93e1ed7d' }, { kind: 'auto-memory', file: 'project_multi_agent_coordination_v2.md' }, { kind: 'commit', sha: 'unknown', pr: 147 }] },
  { type: 'milestone', path: 'vault/Milestones/2026-04-24-opening-roadmap-dashboard.md', sources: [{ kind: 'mc-task', id: '5e87c9b2-2626-411a-a376-51d64f267229' }, { kind: 'mc-task', id: '7710fe5a-5807-4b05-8df0-ca2aa64c8781' }] },
  { type: 'milestone', path: 'vault/Milestones/2026-04-22-menu-url-routing-v2.md', sources: [{ kind: 'mc-task', id: 'c425fd5e-03f2-409a-8921-9b5b71340c6e' }] },
  { type: 'milestone', path: 'vault/Milestones/2026-04-21-menu-page-brand-tokens.md', sources: [{ kind: 'mc-task', id: 'cf1acf35-8eb6-469a-a9c1-2ade81abb438' }, { kind: 'mc-task', id: 'ba109556-b8e2-4af5-bde8-c505a2e6c451' }] },
  { type: 'milestone', path: 'vault/Milestones/2026-04-24-procurement-agent-v1.md', sources: [{ kind: 'mc-task', id: '14b5bd82-38e4-4c3c-8dd2-90e888e7f927' }] },
  { type: 'milestone', path: 'vault/Milestones/2026-04-24-nomenclature-name-unification.md', sources: [{ kind: 'mc-task', id: '7d386835-7af4-458d-b0a9-a376f76c6ae2' }] },
  { type: 'milestone', path: 'vault/Milestones/2026-04-22-graphify-mcp-wired-to-agents.md', sources: [{ kind: 'mc-task', id: '600bd37a-abb9-42c7-b106-484317e616d5' }, { kind: 'spec', file: 'docs/plans/spec-graphify-phase3.md' }] },
  { type: 'milestone', path: 'vault/Milestones/2026-04-28-approve-receipt-capex-auto.md', sources: [{ kind: 'mc-task', id: 'fd6afc75-43e2-45b6-bb79-44608e274f60' }, { kind: 'commit', sha: '9ddb6c2', pr: 150 }] },
  { type: 'milestone', path: 'vault/Milestones/2026-04-24-roadmap-task-fields.md', sources: [{ kind: 'mc-task', id: '4b3adb59-298c-4eb9-8575-7e5d3c59b3d0' }, { kind: 'mc-task', id: '94721aa8-4d90-47f0-a079-82b6bb5ce0fb' }] },
  { type: 'milestone', path: 'vault/Milestones/2026-04-24-warmer-dark-tokens.md', sources: [{ kind: 'mc-task', id: 'deab9ec5-f1b8-4534-9cf5-94fea96076d3' }] },

  // ── Open Questions (3) ───────────────────────────────────────────────
  { type: 'question', path: 'vault/Open Questions/mempalace-fate.md', sources: [{ kind: 'spec', file: 'docs/plans/spec-knowledge-vault-bootstrap.md' }, { kind: 'auto-memory', file: 'project_shishka_brain.md' }] },
  { type: 'question', path: 'vault/Open Questions/ceo-vs-coo-role-split.md', sources: [{ kind: 'auto-memory', file: 'feedback_coo_no_ceo_chores.md' }] },
  { type: 'question', path: 'vault/Open Questions/lightrag-supabase-cleanup.md', sources: [{ kind: 'auto-memory', file: 'project_lightrag_removed.md' }, { kind: 'spec', file: 'docs/plans/spec-shishka-brain.md' }] },
];

/** Counts must match spec §5 sign-off (comment 8c726fcf): 26+12+9+4+11+3 = 65. */
export const EXPECTED_COUNTS = {
  decision: 26,
  project: 12,
  domain: 9,
  person: 4,
  milestone: 11,
  question: 3,
} as const;

export const TOTAL_NOTES = Object.values(EXPECTED_COUNTS).reduce((a, b) => a + b, 0);
