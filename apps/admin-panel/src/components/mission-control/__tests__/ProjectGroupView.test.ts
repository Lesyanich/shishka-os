import { describe, it, expect } from 'vitest'
import { deriveProjectGroups } from '../../../utils/taskGrouping'
import type { BusinessTask } from '../../../hooks/useBusinessTasks'

function makeTask(overrides: Partial<BusinessTask> = {}): BusinessTask {
  return {
    id: crypto.randomUUID(),
    title: 'Test task',
    description: null,
    domain: 'tech',
    status: 'inbox',
    priority: 'medium',
    executor_type: 'code',
    initiative_id: null,
    parent_task_id: null,
    source: null,
    created_by: null,
    assigned_to: null,
    due_date: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    completed_at: null,
    tags: [],
    related_ids: {},
    notes: null,
    sprint_id: null,
    story_points: null,
    ...overrides,
  }
}

describe('deriveProjectGroups', () => {
  it('groups children under umbrella parents', () => {
    const parent = makeTask({ title: 'KDS Phase 3', tags: ['umbrella'] })
    const child1 = makeTask({ title: 'Child 1', parent_task_id: parent.id })
    const child2 = makeTask({ title: 'Child 2', parent_task_id: parent.id })
    const orphan = makeTask({ title: 'Orphan' })

    const { projects, orphans } = deriveProjectGroups([parent, child1, child2, orphan])

    expect(projects).toHaveLength(1)
    expect(projects[0].parent.id).toBe(parent.id)
    expect(projects[0].children).toHaveLength(2)
    expect(orphans).toHaveLength(1)
    expect(orphans[0].title).toBe('Orphan')
  })

  it('sorts active projects first', () => {
    const p1 = makeTask({ title: 'Idle project', tags: ['umbrella'] })
    const p2 = makeTask({ title: 'Active project', tags: ['umbrella'] })
    const c1 = makeTask({ parent_task_id: p1.id, status: 'inbox' })
    const c2 = makeTask({ parent_task_id: p2.id, status: 'in_progress' })

    const { projects } = deriveProjectGroups([p1, p2, c1, c2])

    expect(projects[0].parent.title).toBe('Active project')
  })

  it('handles empty input', () => {
    const { projects, orphans } = deriveProjectGroups([])
    expect(projects).toHaveLength(0)
    expect(orphans).toHaveLength(0)
  })

  it('creates synthetic parent when parent_task_id references unknown task', () => {
    const fakeParentId = crypto.randomUUID()
    const child = makeTask({ title: 'Dangling child', parent_task_id: fakeParentId })

    const { projects } = deriveProjectGroups([child])

    expect(projects).toHaveLength(1)
    expect(projects[0].parent.id).toBe(fakeParentId)
    expect(projects[0].children).toHaveLength(1)
  })
})
