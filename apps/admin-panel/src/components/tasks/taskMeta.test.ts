import { describe, it, expect } from 'vitest'
import {
  CATEGORY_LABEL,
  describeRecurrence,
  formatLocalDate,
  isOverdue,
  shortTime,
} from './taskMeta'
import type { StaffTask } from '../../hooks/useStaffTasks'

function makeTask(over: Partial<StaffTask> = {}): StaffTask {
  return {
    id: 't1', title: 'x', title_th: null, description: null, description_th: null,
    assigned_to: null, created_by: null, category: 'general', priority: 'medium',
    status: 'todo', station: 'general', due_date: null, due_time: null, reminder_offset_min: 30,
    recurrence: 'none', recurrence_days: null, is_template: false, template_id: null,
    dm_message_id: null, group_message_id: null, photo_urls: [], linked_route: null,
    linked_label: null, linked_label_th: null, comment: null, completed_at: null, completed_via: null,
    created_at: '', updated_at: '', staff: null, ...over,
  }
}

describe('taskMeta', () => {
  it('maps category labels', () => {
    expect(CATEGORY_LABEL.opening).toBe('Opening')
  })

  it('shortTime trims seconds', () => {
    expect(shortTime('08:30:00')).toBe('08:30')
    expect(shortTime(null)).toBe('')
  })

  it('formatLocalDate yields ISO date', () => {
    expect(formatLocalDate(new Date('2026-06-10T05:00:00Z'))).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('describeRecurrence summarizes weekly days', () => {
    expect(describeRecurrence({ recurrence: 'daily', recurrence_days: null })).toBe('Every day')
    expect(describeRecurrence({ recurrence: 'weekly', recurrence_days: [1, 5] })).toContain('Mon')
    expect(describeRecurrence({ recurrence: 'none', recurrence_days: null })).toBe('One-off')
  })

  it('isOverdue respects status and template flags', () => {
    const past = makeTask({ due_date: '2000-01-01', due_time: '08:00' })
    expect(isOverdue(past)).toBe(true)
    expect(isOverdue(makeTask({ due_date: '2000-01-01', status: 'done' }))).toBe(false)
    expect(isOverdue(makeTask({ is_template: true, due_date: '2000-01-01' }))).toBe(false)
  })
})
