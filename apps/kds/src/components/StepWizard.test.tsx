import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StepWizard } from './StepWizard'
import { CookProvider } from '../contexts/CookContext'
import type { RecipeStep } from '../hooks/useRecipeSteps'
import type { ProductionTask } from '../types/tasks'

// HACCP checkpoint writes hit supabase.rpc — stub it out so tests stay offline.
vi.mock('../lib/supabase', () => ({
  supabase: {
    rpc: vi.fn().mockResolvedValue({ data: { ok: true }, error: null }),
  },
}))

const baseTask: ProductionTask = {
  id: 'task-borsch-1',
  description: 'Borsch prep',
  status: 'in_progress',
  scheduled_start: null,
  duration_min: 85,
  equipment_id: null,
  actual_start: null,
  actual_end: null,
  actual_weight: null,
  gross_weight: null,
  theoretical_yield: null,
  target_nomenclature_id: 'nom-borsch',
  target_quantity: 1,
  assigned_to: null,
  schedule_run_id: null,
  parent_target_id: null,
  target_nomenclature: { name: 'Borsch Bioactive', product_code: 'SALE-BORSCH_BIOACTIVE' },
}

// Fixture mirrors SALE-BORSCH_BIOACTIVE recipe: 4 steps, 85 min total,
// step 3 is a temperature HACCP checkpoint.
const fourSteps: RecipeStep[] = [
  {
    id: 'step-1', step_order: 1, operation_name: 'PREP',
    description: 'Chop vegetables and weigh raw beef',
    duration_min: 15, equipment_id: null, equipment_name: null,
    temperature_c: null, internal_temp_c: null, is_passive: false, notes: null,
    haccp_checkpoint: false, haccp_type: null, haccp_target_value: null, haccp_tolerance: null,
    media_url: null, scaling_rule: null,
  },
  {
    id: 'step-2', step_order: 2, operation_name: 'SIMMER',
    description: 'Simmer broth on low heat',
    duration_min: 60, equipment_id: null, equipment_name: 'Stovetop',
    temperature_c: 95, internal_temp_c: null, is_passive: true, notes: null,
    haccp_checkpoint: false, haccp_type: null, haccp_target_value: null, haccp_tolerance: null,
    media_url: null, scaling_rule: null,
  },
  {
    id: 'step-3', step_order: 3, operation_name: 'TEMP CHECK',
    description: 'Verify internal temperature before service',
    duration_min: 1, equipment_id: null, equipment_name: null,
    temperature_c: null, internal_temp_c: 75, is_passive: false, notes: null,
    haccp_checkpoint: true, haccp_type: 'temperature', haccp_target_value: 75, haccp_tolerance: 2,
    media_url: null, scaling_rule: null,
  },
  {
    id: 'step-4', step_order: 4, operation_name: 'FINISH',
    description: 'Plate and garnish',
    duration_min: 9, equipment_id: null, equipment_name: null,
    temperature_c: null, internal_temp_c: null, is_passive: false, notes: null,
    haccp_checkpoint: false, haccp_type: null, haccp_target_value: null, haccp_tolerance: null,
    media_url: null, scaling_rule: null,
  },
]

type SaveGrossFn = (taskId: string, weight: number) => Promise<{ ok: boolean }>

interface RenderOverrides {
  task?: Partial<ProductionTask>
  steps?: RecipeStep[]
  onSetGrossWeight?: SaveGrossFn
}

function renderWizard(overrides: RenderOverrides = {}) {
  const task = { ...baseTask, ...overrides.task }
  const steps = overrides.steps ?? fourSteps
  const onSetGrossWeight: SaveGrossFn =
    overrides.onSetGrossWeight ?? (vi.fn().mockResolvedValue({ ok: true }) as unknown as SaveGrossFn)
  const onComplete = vi.fn()
  const utils = render(
    <CookProvider>
      <StepWizard
        task={task}
        steps={steps}
        onSetGrossWeight={onSetGrossWeight}
        onComplete={onComplete}
      />
    </CookProvider>,
  )
  return { ...utils, onSetGrossWeight, onComplete }
}

describe('StepWizard — SALE-BORSCH_BIOACTIVE smoke', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders a numeric gross-weight input on step 1', () => {
    renderWizard()

    expect(screen.getByText(/STEP 1 of 4/)).toBeInTheDocument()
    const grossInput = screen.getByPlaceholderText('0.00 kg')
    expect(grossInput).toBeInTheDocument()
    expect(grossInput).toHaveAttribute('type', 'number')
    // inputMode="decimal" surfaces the numeric keypad on touch devices (the KDS tablet).
    expect(grossInput).toHaveAttribute('inputmode', 'decimal')
    expect(screen.getByRole('button', { name: /save gross weight/i })).toBeInTheDocument()
  })

  it('keeps the NEXT button disabled on a HACCP step until the checkpoint is confirmed', async () => {
    const user = userEvent.setup()
    // Pre-saved gross weight lets us jump past step 1's gate.
    renderWizard({ task: { gross_weight: 2.5 } })

    // Step 1 → step 2
    await user.click(screen.getByRole('button', { name: /^next$/i }))
    // Step 2 → step 3 (HACCP)
    await user.click(screen.getByRole('button', { name: /^next$/i }))

    expect(screen.getByText(/STEP 3 of 4/)).toBeInTheDocument()
    expect(screen.getByText('HACCP CHECKPOINT')).toBeInTheDocument()

    // HACCP not yet confirmed → NEXT stays disabled, wizard cannot advance.
    expect(screen.getByRole('button', { name: /^next$/i })).toBeDisabled()
  })

  it('enables NEXT after the gross weight is saved on step 1', async () => {
    const user = userEvent.setup()
    const saveMock = vi.fn().mockResolvedValue({ ok: true })
    const onSetGrossWeight: SaveGrossFn = saveMock as unknown as SaveGrossFn
    renderWizard({ onSetGrossWeight })

    // Initially blocked: step 1 needs gross weight first.
    expect(screen.getByRole('button', { name: /^next$/i })).toBeDisabled()

    await user.type(screen.getByPlaceholderText('0.00 kg'), '3.5')
    await user.click(screen.getByRole('button', { name: /save gross weight/i }))

    expect(saveMock).toHaveBeenCalledWith('task-borsch-1', 3.5)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^next$/i })).toBeEnabled()
    })
  })
})
