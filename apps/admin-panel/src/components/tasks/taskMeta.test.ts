import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect, vi } from 'vitest'
import {
  CATEGORY_META,
  CATEGORY_OPTIONS,
  TASK_CATEGORIES,
  categoryIcon,
  categoryMeta,
  describeRecurrence,
  formatLocalDate,
  isOverdue,
  shortTime,
} from './taskMeta'
import type { StaffTask } from '../../hooks/useStaffTasks'

/**
 * The DB's allowed categories, parsed from the migration that most recently
 * (re)defined staff_tasks_category_check. This is what actually guards the
 * React #130 drift class: the constraint and CATEGORY_META can only diverge
 * with a failing test. (The column is CHECK-constrained text, not a Postgres
 * enum, so `supabase gen types` would type it as plain `string` — parsing the
 * migration is the lightweight SSoT check instead.)
 */
function dbCategoriesFromMigrations(): string[] {
  // import.meta.url is an http: URL under the jsdom environment, so resolve
  // from cwd instead (vitest runs from apps/admin-panel; tolerate repo root).
  const dir = ['../../services/supabase/migrations', 'services/supabase/migrations']
    .map((p) => resolve(process.cwd(), p))
    .find(existsSync)
  if (!dir) throw new Error('services/supabase/migrations not found from cwd')
  const defining = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .map((f) => ({ file: f, num: parseInt(f, 10), sql: readFileSync(`${dir}/${f}`, 'utf8') }))
    .filter(({ sql }) => /ADD CONSTRAINT staff_tasks_category_check/.test(sql))
    .sort((a, b) => a.num - b.num || a.file.localeCompare(b.file))
  const latest = defining.at(-1)
  if (!latest) throw new Error('No migration defines staff_tasks_category_check')
  const check = latest.sql.match(
    /ADD CONSTRAINT staff_tasks_category_check\s+CHECK \(category IN \(([\s\S]*?)\)\)/,
  )
  if (!check) throw new Error(`Could not parse category list from ${latest.file}`)
  return [...check[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1])
}

function makeTask(over: Partial<StaffTask> = {}): StaffTask {
  return {
    id: 't1', title: 'x', title_th: null, description: null, description_th: null,
    assigned_to: null, created_by: null, category: 'general', priority: 'medium',
    status: 'todo', station: 'general', due_date: null, due_time: null, reminder_offset_min: 30,
    recurrence: 'none', recurrence_days: null, is_template: false, template_id: null,
    dm_message_id: null, group_message_id: null, photo_urls: [], linked_route: null,
    linked_label: null, linked_label_th: null, kb_page_id: null, comment: null, completed_at: null, completed_via: null,
    created_at: '', updated_at: '', staff: null, ...over,
  }
}

describe('taskMeta', () => {
  it('maps category labels', () => {
    expect(CATEGORY_META.opening.label).toBe('Opening')
  })

  it('CATEGORY_META matches the DB check constraint exactly (guards React #130)', () => {
    expect(new Set(TASK_CATEGORIES)).toEqual(new Set(dbCategoriesFromMigrations()))
  })

  it('every category has a renderable icon, label, and option (guards React #130)', () => {
    // A lucide icon is a valid React element type: a function or a forwardRef
    // object. The invariant that prevents #130 is simply "never undefined/null".
    for (const c of TASK_CATEGORIES) {
      expect(CATEGORY_META[c].icon, `icon for "${c}"`).not.toBeUndefined()
      expect(CATEGORY_META[c].icon, `icon for "${c}"`).not.toBeNull()
      expect(CATEGORY_META[c].label, `label for "${c}"`).toBeTruthy()
      expect(CATEGORY_OPTIONS.some((o) => o.value === c), `option for "${c}"`).toBe(true)
    }
  })

  it('categoryMeta/categoryIcon degrade safely for unknown categories', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      expect(categoryIcon('equipment')).not.toBeUndefined()
      expect(categoryIcon('food_safety')).not.toBeUndefined()
      // A category the DB adds before the frontend catches up must not be
      // undefined (which would render `<undefined/>` and crash the board).
      expect(categoryIcon('some_future_category')).not.toBeUndefined()
      expect(categoryIcon('some_future_category')).not.toBeNull()
      // The fallback keeps the raw value visible and warns in DEV so drift
      // surfaces in logs instead of silently.
      expect(categoryMeta('some_future_category').label).toBe('some_future_category')
      expect(warn).toHaveBeenCalled()
    } finally {
      warn.mockRestore()
    }
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
