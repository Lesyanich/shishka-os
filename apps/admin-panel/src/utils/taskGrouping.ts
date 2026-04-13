import type { BusinessTask, TaskStatus } from '../hooks/useBusinessTasks'

export type GroupBy = 'none' | 'topic' | 'agent' | 'project'

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

export interface ProjectGroup {
  parent: BusinessTask
  children: BusinessTask[]
}

/**
 * Group tasks by parent_task_id. Returns parent groups + orphan tasks.
 * @param tasks — the tasks to display (filtered by segment)
 * @param allTasks — optional full task list for parent lookup
 */
export function deriveProjectGroups(tasks: BusinessTask[], allTasks?: BusinessTask[]): {
  projects: ProjectGroup[]
  orphans: BusinessTask[]
} {
  const parentMap = new Map<string, BusinessTask>()
  const childrenMap = new Map<string, BusinessTask[]>()
  const orphans: BusinessTask[] = []

  const lookupSource = allTasks ?? tasks
  const displaySet = new Set(tasks.map(t => t.id))
  for (const task of lookupSource) {
    if (!task.parent_task_id && task.tags?.includes('umbrella')) {
      parentMap.set(task.id, task)
      if (!childrenMap.has(task.id)) childrenMap.set(task.id, [])
    }
  }

  // Assign displayed tasks to their parents or orphans
  for (const task of tasks) {
    if (parentMap.has(task.id)) continue // skip parents themselves
    if (task.parent_task_id && parentMap.has(task.parent_task_id)) {
      childrenMap.get(task.parent_task_id)!.push(task)
    } else if (task.parent_task_id) {
      // parent_task_id set but parent not in this task set — still group
      if (!childrenMap.has(task.parent_task_id)) {
        childrenMap.set(task.parent_task_id, [])
      }
      childrenMap.get(task.parent_task_id)!.push(task)
      // Create a synthetic parent if we haven't seen it
      if (!parentMap.has(task.parent_task_id)) {
        parentMap.set(task.parent_task_id, {
          id: task.parent_task_id,
          title: `Project ${task.parent_task_id.slice(0, 8)}`,
          description: null,
          domain: task.domain,
          status: 'in_progress',
          priority: 'medium',
          executor_type: task.executor_type,
          initiative_id: null,
          parent_task_id: null,
          source: null,
          created_by: null,
          assigned_to: null,
          due_date: null,
          created_at: task.created_at,
          updated_at: task.updated_at,
          completed_at: null,
          tags: ['umbrella'],
          related_ids: {},
          notes: null,
          sprint_id: null,
          story_points: null,
        })
      }
    } else {
      orphans.push(task)
    }
  }

  const projects: ProjectGroup[] = []
  for (const [parentId, parent] of parentMap) {
    const children = childrenMap.get(parentId) ?? []
    if (children.length > 0 || displaySet.has(parentId)) {
      projects.push({ parent, children })
    }
  }

  // Sort: projects with in_progress children first, then by child count
  projects.sort((a, b) => {
    const aHasActive = a.children.some(c => c.status === 'in_progress') ? 1 : 0
    const bHasActive = b.children.some(c => c.status === 'in_progress') ? 1 : 0
    if (bHasActive !== aHasActive) return bHasActive - aHasActive
    return b.children.length - a.children.length
  })

  return { projects, orphans }
}
