import { useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { HACCPCheckpointType } from '../types/haccp'

interface CheckpointResult {
  stepOrder: number
  passed: boolean
  actualValue: number | null
}

interface LogCheckpointParams {
  taskId: string
  flowId: string
  stepOrder: number
  type: HACCPCheckpointType
  expected: number | null
  tolerance: number | null
  actual: number | null
  passed: boolean
  staffId: string
  notes?: string
}

export function useHACCP() {
  const [completedCheckpoints, setCompletedCheckpoints] = useState<Map<number, CheckpointResult>>(new Map())

  const logCheckpoint = useCallback(async (params: LogCheckpointParams): Promise<{ ok: boolean; error?: string }> => {
    const { data, error } = await supabase.rpc('fn_log_haccp_checkpoint', {
      p_task_id: params.taskId,
      p_flow_id: params.flowId,
      p_step_order: params.stepOrder,
      p_type: params.type,
      p_expected: params.expected,
      p_tolerance: params.tolerance,
      p_actual: params.actual,
      p_passed: params.passed,
      p_staff_id: params.staffId,
      p_notes: params.notes ?? null,
    })

    if (error) return { ok: false, error: error.message }

    const result = data as { ok: boolean; error?: string }
    if (!result.ok) return { ok: false, error: result.error }

    setCompletedCheckpoints(prev => {
      const next = new Map(prev)
      next.set(params.stepOrder, {
        stepOrder: params.stepOrder,
        passed: params.passed,
        actualValue: params.actual,
      })
      return next
    })

    return { ok: true }
  }, [])

  const isCheckpointCompleted = useCallback((stepOrder: number): boolean => {
    return completedCheckpoints.has(stepOrder)
  }, [completedCheckpoints])

  const resetCheckpoints = useCallback(() => {
    setCompletedCheckpoints(new Map())
  }, [])

  return { completedCheckpoints, logCheckpoint, isCheckpointCompleted, resetCheckpoints }
}
