import { describe, it, expect } from 'vitest'

describe('StepWizard', () => {
  it('exports StepWizard component', async () => {
    const mod = await import('./StepWizard')
    expect(mod.StepWizard).toBeDefined()
  })
})
