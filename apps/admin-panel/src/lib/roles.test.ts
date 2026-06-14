import { describe, it, expect } from 'vitest'
import { hasAccess, landingFor, ROLE_RANK, ROLE_LANDING } from './roles'

describe('roles — 3-tier RBAC', () => {
  it('owner outranks task_manager outranks cook', () => {
    expect(ROLE_RANK.owner).toBeGreaterThan(ROLE_RANK.task_manager)
    expect(ROLE_RANK.task_manager).toBeGreaterThan(ROLE_RANK.cook)
  })

  it('hasAccess is hierarchical (higher role sees lower-gated routes)', () => {
    // owner sees everything
    expect(hasAccess('owner', 'owner')).toBe(true)
    expect(hasAccess('owner', 'task_manager')).toBe(true)
    expect(hasAccess('owner', 'cook')).toBe(true)
    // task_manager sees its tier + cook, not owner
    expect(hasAccess('task_manager', 'owner')).toBe(false)
    expect(hasAccess('task_manager', 'task_manager')).toBe(true)
    expect(hasAccess('task_manager', 'cook')).toBe(true)
    // cook sees only cook tier
    expect(hasAccess('cook', 'owner')).toBe(false)
    expect(hasAccess('cook', 'task_manager')).toBe(false)
    expect(hasAccess('cook', 'cook')).toBe(true)
  })

  it('every role lands on a route it can actually reach', () => {
    // cook lands on a kitchen route, task_manager on its board, owner on root
    expect(landingFor('cook')).toBe('/kitchen/my-tasks')
    expect(landingFor('task_manager')).toBe('/staff-tasks')
    expect(landingFor('owner')).toBe('/')
    // landings are defined for all three roles
    expect(Object.keys(ROLE_LANDING).sort()).toEqual(
      ['cook', 'owner', 'task_manager'],
    )
  })
})
