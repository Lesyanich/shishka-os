import { describe, it, expect } from 'vitest'
import {
  deriveTopicGroups,
  deriveAgentGroups,
  statusBreakdown,
  sortedGroups,
} from './taskGrouping'
import type { BusinessTask } from '../hooks/useBusinessTasks'

const mockTask = (overrides: Partial<BusinessTask> = {}): BusinessTask => ({
  id: '00000000-0000-0000-0000-000000000001',
  title: 'Test task',
  domain: 'tech',
  status: 'inbox',
  priority: 'medium',
  source: 'manual',
  created_by: 'lesia',
  assigned_to: null,
  due_date: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  completed_at: null,
  tags: [],
  related_ids: {},
  notes: null,
  sprint_id: null,
  story_points: null,
  executor_type: 'human',
  description: null,
  initiative_id: null,
  parent_task_id: null,
  ...overrides,
})

describe('deriveTopicGroups', () => {
  it('groups by first qualifying tag, skipping metadata', () => {
    const tasks = [
      mockTask({ id: '1', tags: ['kind:feature', 'admin-panel', 'mc-ui'] }),
      mockTask({ id: '2', tags: ['admin-panel', 'receipts'] }),
      mockTask({ id: '3', tags: ['kind:bug-fix'] }),
    ]
    const groups = deriveTopicGroups(tasks)
    expect(groups.get('admin-panel')?.length).toBe(2)
    expect(groups.get('Ungrouped')?.length).toBe(1)
  })

  it('returns Ungrouped for tasks with no qualifying tags', () => {
    const groups = deriveTopicGroups([mockTask({ tags: ['kind:feature', 'umbrella'] })])
    expect(groups.has('Ungrouped')).toBe(true)
  })
})

describe('deriveAgentGroups', () => {
  it('groups by created_by field', () => {
    const tasks = [
      mockTask({ id: '1', created_by: 'coo' }),
      mockTask({ id: '2', created_by: 'coo' }),
      mockTask({ id: '3', created_by: 'lesia' }),
    ]
    const groups = deriveAgentGroups(tasks)
    expect(groups.get('coo')?.length).toBe(2)
    expect(groups.get('lesia')?.length).toBe(1)
  })

  it('uses Unknown for empty created_by', () => {
    const groups = deriveAgentGroups([mockTask({ created_by: '' })])
    expect(groups.has('Unknown')).toBe(true)
  })
})

describe('statusBreakdown', () => {
  it('counts tasks per status', () => {
    const tasks = [
      mockTask({ status: 'inbox' }),
      mockTask({ status: 'inbox' }),
      mockTask({ status: 'blocked' }),
    ]
    const bd = statusBreakdown(tasks)
    expect(bd.inbox).toBe(2)
    expect(bd.blocked).toBe(1)
  })
})

describe('sortedGroups', () => {
  it('sorts groups by count descending', () => {
    const map = new Map<string, BusinessTask[]>([
      ['small', [mockTask()]],
      ['big', [mockTask(), mockTask(), mockTask()]],
    ])
    const result = sortedGroups(map)
    expect(result[0][0]).toBe('big')
    expect(result[1][0]).toBe('small')
  })
})
