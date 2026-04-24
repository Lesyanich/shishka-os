/**
 * Pure helpers + types for the Opening Roadmap.
 *
 * Split out of `useOpeningRoadmap.ts` so tests can exercise them without
 * transitively pulling in `lib/supabase.ts` — that module initialises a
 * Supabase client at import time and throws when `VITE_SUPABASE_URL` is
 * unset (e.g. in vitest, unless the env is plumbed through).
 */

import { OPENING_PHASES, type PhaseStatus, type TaskStatus } from '../components/roadmap/roadmap-config'

/* ─── Types ─── */

export type TaskOwner = 'lesya' | 'bas' | 'kw' | 'coo' | 'unassigned'

export interface RoadmapTask {
  id: string
  title: string
  description: string | null
  status: TaskStatus
  priority: 'critical' | 'high' | 'medium' | 'low'
  isBlocker: boolean
  phase: number // 0-5, derived from phase-N tag
  owner: TaskOwner
  assignedRaw: string | null
  due_date: string | null
  updated_at: string | null
}

export interface PhaseData {
  config: (typeof OPENING_PHASES)[number]
  tasks: RoadmapTask[]
  progress: number // 0-100
  blockerCount: number
  status: PhaseStatus
}

/** Aggregate for "Before Recipe Lock" must-do panel. */
export interface MustDoSummary {
  /** Phase-0 tasks trimmed for the panel (≤5, not-done, sorted by due_date). */
  items: RoadmapTask[]
  /** All phase-0 tasks — used for "done / doing / todo" counts. */
  done: number
  doing: number
  todo: number
}

/** Shape consumed by BlockersCard. Derived from blocked + opening-blocker tag. */
export interface RoadmapBlocker {
  id: string
  title: string
  description: string | null
  ownerRaw: string | null
  phase: number
  ageDays: number
}

/* ─── Constants ─── */

const PHASE_TAG_RE = /^phase-(\d)$/
export const MUSTDO_LIMIT = 5

/* ─── Helpers ─── */

export function parsePhaseTag(tags: string[] | null): number | null {
  if (!tags) return null
  for (const tag of tags) {
    const match = PHASE_TAG_RE.exec(tag)
    if (match) return Number(match[1])
  }
  return null
}

/**
 * Map `business_tasks.assigned_to` (free-text, set by humans or agents)
 * into one of the roadmap's owner lanes. Case-insensitive substring match;
 * unknown values fall back to 'unassigned'.
 *
 * Real `owner` enum column lands with task 94721aa8; until then this keeps
 * the UI usable on today's data.
 */
export function inferOwner(assignedTo: string | null | undefined): TaskOwner {
  if (!assignedTo) return 'unassigned'
  const s = assignedTo.toLowerCase()
  if (s.includes('lesya') || s.includes('lesia') || s.includes('леся')) return 'lesya'
  if (s.includes('bas') || s.includes('бас')) return 'bas'
  if (s.includes('coo') || s.includes('chief operating')) return 'coo'
  if (s.includes('kw') || s.includes('kitchen')) return 'kw'
  return 'unassigned'
}

export function derivePhaseStatus(tasks: RoadmapTask[]): PhaseStatus {
  if (tasks.length === 0) return 'not_started'
  const allDone = tasks.every((t) => t.status === 'done')
  if (allDone) return 'done'
  const hasBlocker = tasks.some((t) => t.isBlocker && t.status !== 'done')
  if (hasBlocker) return 'blocked'
  const hasActive = tasks.some(
    (t) => t.status === 'in_progress' || t.status === 'done',
  )
  return hasActive ? 'in_progress' : 'not_started'
}

/** Days since the given ISO timestamp (floored, >= 0). */
export function daysSince(iso: string | null, now: Date = new Date()): number {
  if (!iso) return 0
  const then = Date.parse(iso)
  if (!Number.isFinite(then)) return 0
  return Math.max(0, Math.floor((now.getTime() - then) / 86_400_000))
}

/**
 * Must-do derivation for "Before Recipe Lock":
 *   1. Phase-0 tasks only.
 *   2. Not-done items bubble to the top, sorted by due_date ASC
 *      (nulls last), tie-broken by priority (critical > high > medium > low).
 *   3. Cap at MUSTDO_LIMIT.
 *
 * Switch the selection input to `is_critical_path = true` when MC task
 * 4b3adb59 adds that column.
 */
export function deriveMustDo(allTasks: RoadmapTask[]): MustDoSummary {
  const phase0 = allTasks.filter((t) => t.phase === 0)
  const done = phase0.filter((t) => t.status === 'done').length
  const doing = phase0.filter((t) => t.status === 'in_progress').length
  const todo = phase0.filter(
    (t) => t.status !== 'done' && t.status !== 'in_progress',
  ).length

  const PRIORITY_RANK: Record<RoadmapTask['priority'], number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  }

  const items = phase0
    .filter((t) => t.status !== 'done')
    .sort((a, b) => {
      if (a.due_date && b.due_date) {
        const diff = a.due_date.localeCompare(b.due_date)
        if (diff !== 0) return diff
      } else if (a.due_date) {
        return -1
      } else if (b.due_date) {
        return 1
      }
      return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
    })
    .slice(0, MUSTDO_LIMIT)

  return { items, done, doing, todo }
}

/**
 * Blocker derivation for the focus-row Blockers card:
 *   - Task is `isBlocker` (tagged `opening-blocker`) OR `status='blocked'`.
 *   - Exclude done tasks.
 *   - Age in days proxied from `updated_at` (MC doesn't yet track
 *     `status_changed_at`). Sorted oldest-first.
 */
export function deriveBlockers(
  allTasks: RoadmapTask[],
  now: Date = new Date(),
): RoadmapBlocker[] {
  return allTasks
    .filter(
      (t) =>
        t.status !== 'done' && (t.isBlocker || t.status === 'blocked'),
    )
    .map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      ownerRaw: t.assignedRaw,
      phase: t.phase,
      ageDays: daysSince(t.updated_at, now),
    }))
    .sort((a, b) => b.ageDays - a.ageDays)
}
