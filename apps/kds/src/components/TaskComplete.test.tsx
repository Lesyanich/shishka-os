import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TaskComplete } from './TaskComplete'
import { CookProvider } from '../contexts/CookContext'
import type { ProductionTask } from '../types/tasks'

// fn_log_waste_entry + fn_complete_kds_task go through supabase.rpc — stub them.
vi.mock('../lib/supabase', () => ({
  supabase: {
    rpc: vi.fn().mockResolvedValue({ data: { ok: true }, error: null }),
  },
}))

const borschTask: ProductionTask = {
  id: 'task-borsch-1',
  description: 'Borsch prep',
  status: 'in_progress',
  scheduled_start: null,
  duration_min: 85,
  equipment_id: null,
  actual_start: null,
  actual_end: null,
  actual_weight: null,
  gross_weight: 10,
  theoretical_yield: null,
  target_nomenclature_id: 'nom-borsch',
  target_quantity: 1,
  assigned_to: null,
  schedule_run_id: null,
  parent_target_id: null,
  target_nomenclature: { name: 'Borsch Bioactive', product_code: 'SALE-BORSCH_BIOACTIVE' },
}

describe('TaskComplete — live waste %', () => {
  it('calculates and displays waste % from gross and net weights', async () => {
    const user = userEvent.setup()
    render(
      <CookProvider>
        <TaskComplete task={borschTask} onDone={vi.fn()} />
      </CookProvider>,
    )

    // Gross weight surfaced in header before any input.
    expect(screen.getByText(/10 kg/)).toBeInTheDocument()

    // Type a net weight of 9 kg → waste = (10-9)/10 * 100 = 10.0 %
    await user.type(screen.getByPlaceholderText('0.00 kg'), '9')

    expect(screen.getByText('10.0%')).toBeInTheDocument()
    // Norm label is rendered next to the live waste figure.
    expect(screen.getByText(/Norm:/)).toBeInTheDocument()
  })
})
