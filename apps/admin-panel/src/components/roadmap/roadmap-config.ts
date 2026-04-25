import type { LucideIcon } from 'lucide-react'
import {
  Lock,
  ClipboardList,
  Snowflake,
  Store,
  Users,
  Rocket,
} from 'lucide-react'

/* ─── Initiative ID ─── */

/** Parent task ID for the L2 Opening Roadmap initiative in business_tasks */
export const INITIATIVE_ID = '7d78f1c4-825b-4e2e-bf94-cbae3ba09172'

/* ─── Phase config ─── */

export interface PhaseConfig {
  id: number
  tag: string
  title: string
  subtitle: string
  icon: LucideIcon
  /** ISO date string — if present, UI shows a countdown badge */
  lockDay?: string
}

export const OPENING_PHASES: readonly PhaseConfig[] = [
  {
    id: 0,
    tag: 'phase-0',
    title: 'Recipe Lock',
    subtitle: 'Stop experiments, finalize Day 1 menu',
    icon: Lock,
    lockDay: '2026-04-28',
  },
  {
    id: 1,
    tag: 'phase-1',
    title: 'Recipe Cards',
    subtitle: 'BOM + SOPs for each Day 1 dish',
    icon: ClipboardList,
  },
  {
    id: 2,
    tag: 'phase-2',
    title: 'Prep & Freeze',
    subtitle: 'Frozen manaeesh pipeline, test batches',
    icon: Snowflake,
  },
  {
    id: 3,
    tag: 'phase-3',
    title: 'L2 Station',
    subtitle: 'WiFi, equipment, furniture, layout',
    icon: Store,
  },
  {
    id: 4,
    tag: 'phase-4',
    title: 'Training',
    subtitle: 'Team executes without Bas',
    icon: Users,
  },
  {
    id: 5,
    tag: 'phase-5',
    title: 'Soft Opening',
    subtitle: 'Limited launch, collect feedback',
    icon: Rocket,
  },
] as const

/* ─── Status helpers ─── */

export type TaskStatus =
  | 'inbox'
  | 'backlog'
  | 'in_progress'
  | 'blocked'
  | 'done'
  | 'cancelled'

export type PhaseStatus = 'not_started' | 'in_progress' | 'blocked' | 'done'

/** Auto-refresh interval in milliseconds */
export const POLL_INTERVAL_MS = 60_000
