import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

// ── Types matching data_health_decisions schema + joined nomenclature ──

export type DecisionSource =
  | 'rule_auto'
  | 'ceo_review'
  | 'manual_edit'
  | 'skip'
  | 'rule_auto_conflict'
  | 'rule_auto_cost_pending'

export interface PendingDecision {
  id: string
  rule_id: string | null
  entity_id: string
  field: string
  old_value: string | null
  new_value: string | null
  decision_source: DecisionSource
  confidence_score: number | null
  source_payload: Record<string, unknown> | null
  decided_at: string
}

export interface PendingCard {
  entity_id: string
  product_code: string | null
  product_name: string
  current_base_unit: string | null
  decisions: PendingDecision[]
  latest_decided_at: string
  has_conflicts: boolean
  max_confidence: number | null
  source: string | null
}

export interface UsePackInfoPendingResult {
  cards: PendingCard[]
  isLoading: boolean
  error: string | null
  refetch: () => Promise<void>
  approve: (decisionId: string) => Promise<{ ok: boolean; error?: string }>
  reject: (decisionId: string) => Promise<{ ok: boolean; error?: string }>
}

const RULE_CODE = 'NOMENCLATURE_AUTO_PACK_FILL'

interface NomRow {
  id: string
  product_code: string | null
  name: string
  base_unit: string | null
}

/**
 * Reads pending Pack-Info decisions and groups them into cards (one per
 * nomenclature row). Approve/Reject call the SECURITY DEFINER RPC
 * `fn_approve_pack_decision` (migration 172) which enforces owner role
 * and writes back to nomenclature atomically.
 */
export function usePackInfoPending(): UsePackInfoPendingResult {
  const [decisions, setDecisions] = useState<PendingDecision[]>([])
  const [nomenclatureById, setNomenclatureById] = useState<Map<string, NomRow>>(new Map())
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    // Step 1: resolve rule_id for NOMENCLATURE_AUTO_PACK_FILL
    const { data: ruleRow, error: ruleErr } = await supabase
      .from('data_health_rules')
      .select('id')
      .eq('rule_code', RULE_CODE)
      .maybeSingle()

    if (ruleErr) {
      setError(`rule lookup failed: ${ruleErr.message}`)
      setDecisions([])
      setNomenclatureById(new Map())
      setIsLoading(false)
      return
    }
    if (!ruleRow) {
      // Rule not seeded — surface explicitly so we can tell empty-queue from missing-rule
      setError(`rule ${RULE_CODE} not found (migration 170 not applied?)`)
      setDecisions([])
      setNomenclatureById(new Map())
      setIsLoading(false)
      return
    }

    // Step 2: pending decisions for this rule
    const { data: rows, error: rowsErr } = await supabase
      .from('data_health_decisions')
      .select(
        'id, rule_id, entity_id, field, old_value, new_value, decision_source, confidence_score, source_payload, decided_at',
      )
      .eq('status', 'pending')
      .eq('rule_id', ruleRow.id)
      .eq('entity_kind', 'nomenclature')
      .order('decided_at', { ascending: false })

    if (rowsErr) {
      setError(`decisions fetch failed: ${rowsErr.message}`)
      setDecisions([])
      setNomenclatureById(new Map())
      setIsLoading(false)
      return
    }

    const pending = (rows ?? []) as PendingDecision[]
    setDecisions(pending)

    if (pending.length === 0) {
      setNomenclatureById(new Map())
      setIsLoading(false)
      return
    }

    // Step 3: batch-fetch nomenclature rows referenced by pending decisions
    const entityIds = Array.from(new Set(pending.map(d => d.entity_id)))
    const { data: nomRows, error: nomErr } = await supabase
      .from('nomenclature')
      .select('id, product_code, name, base_unit')
      .in('id', entityIds)

    if (nomErr) {
      // Partial failure: surface but keep decisions visible (with placeholder names)
      setError(`nomenclature fetch failed: ${nomErr.message}`)
      setNomenclatureById(new Map())
    } else {
      const map = new Map<string, NomRow>()
      for (const row of (nomRows ?? []) as NomRow[]) {
        map.set(row.id, row)
      }
      setNomenclatureById(map)
    }
    setIsLoading(false)
  }, [])

  useEffect(() => {
    void refetch()
  }, [refetch])

  const cards = useMemo<PendingCard[]>(() => {
    if (decisions.length === 0) return []

    const grouped = new Map<string, PendingDecision[]>()
    for (const d of decisions) {
      const list = grouped.get(d.entity_id) ?? []
      list.push(d)
      grouped.set(d.entity_id, list)
    }

    const result: PendingCard[] = []
    for (const [entityId, list] of grouped.entries()) {
      const nom = nomenclatureById.get(entityId) ?? null
      const latestDecidedAt = list.reduce(
        (max, d) => (d.decided_at > max ? d.decided_at : max),
        list[0].decided_at,
      )
      const hasConflicts = list.some(d => d.decision_source === 'rule_auto_conflict')
      const confidences = list
        .map(d => d.confidence_score)
        .filter((c): c is number => c != null)
      const maxConfidence = confidences.length > 0 ? Math.max(...confidences) : null
      // Source from the highest-confidence decision (best evidence)
      const bestDecision =
        confidences.length > 0
          ? list.reduce((best, d) =>
              (d.confidence_score ?? -1) > (best.confidence_score ?? -1) ? d : best,
            )
          : list[0]
      const source =
        bestDecision.source_payload && typeof bestDecision.source_payload === 'object'
          ? (bestDecision.source_payload as { source?: string }).source ?? null
          : null

      result.push({
        entity_id: entityId,
        product_code: nom?.product_code ?? null,
        product_name: nom?.name ?? '(unknown nomenclature)',
        current_base_unit: nom?.base_unit ?? null,
        decisions: list,
        latest_decided_at: latestDecidedAt,
        has_conflicts: hasConflicts,
        max_confidence: maxConfidence,
        source,
      })
    }

    // Most recent first
    result.sort((a, b) => (a.latest_decided_at < b.latest_decided_at ? 1 : -1))
    return result
  }, [decisions, nomenclatureById])

  const callRpc = useCallback(
    async (decisionId: string, action: 'apply' | 'reject') => {
      const { error: rpcErr } = await supabase.rpc('fn_approve_pack_decision', {
        p_decision_id: decisionId,
        p_action: action,
      })
      if (rpcErr) {
        return { ok: false as const, error: rpcErr.message }
      }
      await refetch()
      return { ok: true as const }
    },
    [refetch],
  )

  const approve = useCallback(
    (decisionId: string) => callRpc(decisionId, 'apply'),
    [callRpc],
  )
  const reject = useCallback(
    (decisionId: string) => callRpc(decisionId, 'reject'),
    [callRpc],
  )

  return { cards, isLoading, error, refetch, approve, reject }
}
