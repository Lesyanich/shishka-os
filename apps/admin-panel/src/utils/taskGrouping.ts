import type { BusinessTask, TaskStatus } from '../hooks/useBusinessTasks'

export type GroupBy = 'none' | 'topic' | 'agent'

const METADATA_TAG_PATTERNS = [
  /^kind:/,
  /^initiative$/,
  /^umbrella$/,
  /^phase-/,
  /^coo-autonomous$/,
  /^needs-tech-lead$/,
  /^needs-strategic-review$/,
  /^from:ceo$/,
  /^follow-up$/,
  /^audit-finding$/,
  /^tech-debt$/,
  /^hc-/,
  /^ai-tdd$/,
]

function isMetadataTag(tag: string): boolean {
  return METADATA_TAG_PATTERNS.some((p) => p.test(tag))
}

export function deriveTopicGroups(tasks: BusinessTask[]): Map<string, BusinessTask[]> {
  const groups = new Map<string, BusinessTask[]>()
  for (const task of tasks) {
    const qualifying = (task.tags ?? [])
      .filter((t) => !isMetadataTag(t))
      .sort()
    const key = qualifying[0] ?? 'Ungrouped'
    const list = groups.get(key)
    if (list) {
      list.push(task)
    } else {
      groups.set(key, [task])
    }
  }
  return groups
}

export function deriveAgentGroups(tasks: BusinessTask[]): Map<string, BusinessTask[]> {
  const groups = new Map<string, BusinessTask[]>()
  for (const task of tasks) {
    const key = task.created_by || 'Unknown'
    const list = groups.get(key)
    if (list) {
      list.push(task)
    } else {
      groups.set(key, [task])
    }
  }
  return groups
}

export function statusBreakdown(tasks: BusinessTask[]): Partial<Record<TaskStatus, number>> {
  const counts: Partial<Record<TaskStatus, number>> = {}
  for (const task of tasks) {
    counts[task.status] = (counts[task.status] ?? 0) + 1
  }
  return counts
}

/** Sort groups by task count descending, return as array of [key, tasks] */
export function sortedGroups(groups: Map<string, BusinessTask[]>): [string, BusinessTask[]][] {
  return [...groups.entries()].sort((a, b) => b[1].length - a[1].length)
}
