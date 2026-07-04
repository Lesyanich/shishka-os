import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { TaskRow } from './TaskRow'
import { TASK_CATEGORIES } from './taskMeta'
import type { StaffTask, TaskCategory } from '../../hooks/useStaffTasks'

function makeTask(over: Partial<StaffTask> = {}): StaffTask {
  return {
    id: 't1', title: 'Check fridge temperature', title_th: null, description: null,
    description_th: null, assigned_to: null, created_by: null, category: 'general',
    priority: 'medium', status: 'todo', station: 'general', due_date: null, due_time: null,
    reminder_offset_min: 30, recurrence: 'none', recurrence_days: null, is_template: false,
    template_id: null, dm_message_id: null, group_message_id: null, photo_urls: [],
    linked_route: null, linked_label: null, linked_label_th: null, kb_page_id: null,
    comment: null, completed_at: null, completed_via: null, created_at: '', updated_at: '',
    staff: null, ...over,
  }
}

// Regression for the board-wide crash: staff_tasks carries `equipment` and
// `food_safety` categories (from the SOP-task migration) that the frontend
// category maps didn't cover, so CATEGORY_ICON[category] was undefined and
// `<undefined/>` threw React #130, wiping out /kitchen/my-tasks and /staff-tasks.
describe('TaskRow renders every DB category without crashing', () => {
  // TASK_CATEGORIES is derived from CATEGORY_META, and taskMeta.test.ts pins
  // that set to the DB check constraint — so iterating it here covers exactly
  // the categories the DB can hand us.
  for (const category of TASK_CATEGORIES) {
    it(`renders a "${category}" task`, () => {
      const { getByText } = render(
        <MemoryRouter>
          <TaskRow task={makeTask({ category })} />
        </MemoryRouter>,
      )
      expect(getByText('Check fridge temperature')).toBeTruthy()
    })
  }

  it('renders a category the frontend does not know yet (DB-ahead drift)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const { getByText } = render(
        <MemoryRouter>
          <TaskRow task={makeTask({ category: 'some_future_category' as TaskCategory })} />
        </MemoryRouter>,
      )
      expect(getByText('Check fridge temperature')).toBeTruthy()
      // The raw value stays visible on the chip so the drift is noticeable.
      expect(getByText('some_future_category')).toBeTruthy()
    } finally {
      warn.mockRestore()
    }
  })
})
