import type { AppRole } from '../contexts/AppRoleContext'

/**
 * Role-based access control — single source of truth for the 3-tier model.
 *
 * Two physical locations map onto three roles:
 *   - owner         → Lesia, Bas — full ERP (finance, HR, menu, settings)
 *   - task_manager  → Mint (L2 assembly / POS admin) — tasks, planning,
 *                     production, procurement, scheduling; NO finance/HR/settings
 *   - cook          → Hein (L1 prep) + assistants + assemblers — kitchen floor only
 *
 * Access is hierarchical: owner ⊃ task_manager ⊃ cook. A route gated at
 * `minRole` is reachable by any role whose rank is >= that minRole's rank.
 */

export const ROLE_RANK: Record<AppRole, number> = {
  owner: 3,
  task_manager: 2,
  cook: 1,
}

/**
 * Where each role lands after login, and where RoleGuard sends a user who hits
 * a route above their tier. Each landing must itself be reachable by that role.
 */
export const ROLE_LANDING: Record<AppRole, string> = {
  owner: '/',
  task_manager: '/staff-tasks',
  cook: '/kitchen/my-tasks',
}

/** True if `role` is allowed into a route/section gated at `minRole`. */
export function hasAccess(role: AppRole, minRole: AppRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minRole]
}

/** The post-login / fallback landing path for a role. */
export function landingFor(role: AppRole): string {
  return ROLE_LANDING[role]
}
