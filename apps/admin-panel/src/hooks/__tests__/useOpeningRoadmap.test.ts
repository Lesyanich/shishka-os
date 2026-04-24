import { describe, expect, it } from 'vitest'
import {
  daysSince,
  deriveBlockers,
  deriveMustDo,
  inferOwner,
  type RoadmapTask,
} from '../useOpeningRoadmap.helpers'

function makeTask(overrides: Partial<RoadmapTask>): RoadmapTask {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    title: 'Task',
    description: null,
    status: 'inbox',
    priority: 'medium',
    isBlocker: false,
    phase: 0,
    owner: 'unassigned',
    assignedRaw: null,
    due_date: null,
    updated_at: null,
    ...overrides,
  }
}

// Pure-helper unit tests. A smoke test that imports the full hook module
// (with the Supabase client) lives in useOpeningRoadmap.helpers.test.ts
// siblings; pulling `../useOpeningRoadmap` here would hit
// `createClient()` at module load and fail without VITE_SUPABASE_URL.

describe('useOpeningRoadmap', () => {
  describe('inferOwner', () => {
    it('maps Lesya variants', () => {
      expect(inferOwner('lesia')).toBe('lesya')
      expect(inferOwner('Lesya Nikitina')).toBe('lesya')
      expect(inferOwner('Леся')).toBe('lesya')
    })

    it('maps Bas', () => {
      expect(inferOwner('Bas')).toBe('bas')
      expect(inferOwner('bas@shishka.health')).toBe('bas')
    })

    it('maps COO and kitchen', () => {
      expect(inferOwner('coo')).toBe('coo')
      expect(inferOwner('Kitchen Ops')).toBe('kw')
      expect(inferOwner('KW')).toBe('kw')
    })

    it('falls back to unassigned for unknowns, null, empty', () => {
      expect(inferOwner(null)).toBe('unassigned')
      expect(inferOwner('')).toBe('unassigned')
      expect(inferOwner('Someone Else')).toBe('unassigned')
    })
  })

  describe('daysSince', () => {
    it('returns 0 for null/invalid', () => {
      expect(daysSince(null)).toBe(0)
      expect(daysSince('not-a-date')).toBe(0)
    })

    it('floors to whole days', () => {
      const now = new Date('2026-04-24T12:00:00Z')
      const five = daysSince('2026-04-19T12:00:00Z', now)
      expect(five).toBe(5)
    })

    it('never returns negative (future dates clamp to 0)', () => {
      const now = new Date('2026-04-24T12:00:00Z')
      expect(daysSince('2026-05-01T12:00:00Z', now)).toBe(0)
    })
  })

  describe('deriveMustDo', () => {
    it('picks phase-0 not-done, sorted by due_date ASC, capped at 5, excludes done + other phases', () => {
      const tasks = [
        makeTask({ id: 't1', phase: 0, status: 'in_progress', due_date: '2026-04-26' }),
        makeTask({ id: 't2', phase: 0, status: 'inbox', due_date: '2026-04-24' }),
        makeTask({ id: 't3', phase: 0, status: 'done', due_date: '2026-04-20' }),
        makeTask({ id: 't4', phase: 1, status: 'inbox', due_date: '2026-04-22' }),
        makeTask({ id: 't6', phase: 0, status: 'inbox', due_date: '2026-04-25' }),
        makeTask({ id: 't7', phase: 0, status: 'inbox', due_date: '2026-04-27' }),
        makeTask({ id: 't8', phase: 0, status: 'inbox', due_date: '2026-04-28' }),
      ]
      const r = deriveMustDo(tasks)
      expect(r.items).toHaveLength(5)
      // By due_date ASC: t2(24) < t6(25) < t1(26) < t7(27) < t8(28)
      expect(r.items.map((t) => t.id)).toEqual(['t2', 't6', 't1', 't7', 't8'])
      expect(r.items.map((t) => t.id)).not.toContain('t3') // done excluded
      expect(r.items.map((t) => t.id)).not.toContain('t4') // phase-1 excluded
    })

    it('sorts tasks with null due_date to the end of the eligible set', () => {
      const tasks = [
        makeTask({ id: 'no-due', phase: 0, status: 'inbox', due_date: null }),
        makeTask({ id: 'soon', phase: 0, status: 'inbox', due_date: '2026-04-24' }),
        makeTask({ id: 'later', phase: 0, status: 'inbox', due_date: '2026-04-30' }),
      ]
      const r = deriveMustDo(tasks)
      expect(r.items.map((t) => t.id)).toEqual(['soon', 'later', 'no-due'])
    })

    it('tie-breaks by priority when dates match', () => {
      const tasks = [
        makeTask({ id: 'low', phase: 0, priority: 'low', due_date: '2026-04-28' }),
        makeTask({ id: 'high', phase: 0, priority: 'high', due_date: '2026-04-28' }),
        makeTask({ id: 'crit', phase: 0, priority: 'critical', due_date: '2026-04-28' }),
      ]
      const r = deriveMustDo(tasks)
      expect(r.items.map((t) => t.id)).toEqual(['crit', 'high', 'low'])
    })

    it('counts done / doing / todo from full phase-0 set', () => {
      const tasks = [
        makeTask({ phase: 0, status: 'done' }),
        makeTask({ phase: 0, status: 'in_progress' }),
        makeTask({ phase: 0, status: 'in_progress' }),
        makeTask({ phase: 0, status: 'inbox' }),
        makeTask({ phase: 0, status: 'blocked' }),
        makeTask({ phase: 1, status: 'done' }),
      ]
      const r = deriveMustDo(tasks)
      expect(r.done).toBe(1)
      expect(r.doing).toBe(2)
      expect(r.todo).toBe(2) // inbox + blocked on phase 0
    })
  })

  describe('deriveBlockers', () => {
    it('includes blocked tasks and opening-blocker tagged ones, excludes done', () => {
      const now = new Date('2026-04-24T12:00:00Z')
      const tasks = [
        makeTask({
          id: 'a',
          status: 'blocked',
          updated_at: '2026-04-20T12:00:00Z',
        }),
        makeTask({
          id: 'b',
          status: 'in_progress',
          isBlocker: true,
          updated_at: '2026-04-21T12:00:00Z',
        }),
        makeTask({
          id: 'c',
          status: 'done',
          isBlocker: true,
          updated_at: '2026-04-19T12:00:00Z',
        }),
        makeTask({ id: 'd', status: 'inbox' }),
      ]
      const r = deriveBlockers(tasks, now)
      expect(r.map((b) => b.id).sort()).toEqual(['a', 'b'])
    })

    it('sorts oldest first by ageDays', () => {
      const now = new Date('2026-04-24T12:00:00Z')
      const tasks = [
        makeTask({ id: 'new', status: 'blocked', updated_at: '2026-04-23T12:00:00Z' }),
        makeTask({ id: 'old', status: 'blocked', updated_at: '2026-04-18T12:00:00Z' }),
        makeTask({ id: 'mid', status: 'blocked', updated_at: '2026-04-21T12:00:00Z' }),
      ]
      const r = deriveBlockers(tasks, now)
      expect(r.map((b) => b.id)).toEqual(['old', 'mid', 'new'])
      expect(r[0].ageDays).toBe(6)
    })
  })
})
