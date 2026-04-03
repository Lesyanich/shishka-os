import { useCallback, useEffect, useState } from 'react'
import {
  CalendarDays,
  Check,
  ChevronRight,
  Loader2,
  Package,
  Plus,
  RefreshCw,
  Send,
  ShoppingCart,
  Trash2,
  X,
  Zap,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

/* ─── Types ──────────────────────────────────────────────── */

type Plan = {
  id: string
  name: string
  target_date: string
  status: string
  mrp_result: MRPResult | null
  created_at: string
}

type MRPResult = {
  prep_schedule: PrepItem[]
  procurement_list: ProcItem[]
  calculated_at: string
}

type PrepItem = {
  nomenclature_id: string
  product_code: string
  name: string
  gross_qty: number
  on_hand: number
  net_qty: number
  base_unit: string
}

type ProcItem = PrepItem & {
  cost_per_unit: number
  estimated_cost: number
}

type SaleItem = { id: string; product_code: string; name: string }
type TargetRow = { nomId: string; qty: number }

/* ─── Status config ──────────────────────────────────────── */

const STATUS_CFG: Record<string, { label: string; color: string }> = {
  draft: { label: 'Draft', color: 'bg-slate-600 text-slate-200' },
  active: { label: 'Active', color: 'bg-emerald-500/20 text-emerald-300' },
  completed: { label: 'Completed', color: 'bg-blue-500/20 text-blue-300' },
}

/* ─── Component ──────────────────────────────────────────── */

export function MasterPlanner() {
  /* ─── Plans state ─── */
  const [plans, setPlans] = useState<Plan[]>([])
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null)
  const [isLoadingPlans, setIsLoadingPlans] = useState(true)

  /* ─── Create form ─── */
  const [isCreating, setIsCreating] = useState(false)
  const [planName, setPlanName] = useState('')
  const [targetDate, setTargetDate] = useState('')
  const [targets, setTargets] = useState<TargetRow[]>([])
  const [isSaving, setIsSaving] = useState(false)

  /* ─── SALE items for dropdown ─── */
  const [saleItems, setSaleItems] = useState<SaleItem[]>([])

  /* ─── MRP state ─── */
  const [isCalculating, setIsCalculating] = useState(false)
  const [isApproving, setIsApproving] = useState(false)
  const [approveResult, setApproveResult] = useState<string | null>(null)

  /* ─── MRP → PO state ─── */
  const [isCreatingPOs, setIsCreatingPOs] = useState(false)
  const [poResult, setPOResult] = useState<string | null>(null)
  const navigate = useNavigate()

  /* ─── Selected plan (derived) ─── */
  const selectedPlan = plans.find((p) => p.id === selectedPlanId) ?? null

  /* ─── Fetch plans ─── */
  const fetchPlans = useCallback(async () => {
    setIsLoadingPlans(true)
    const { data, error } = await supabase
      .from('production_plans')
      .select('id, name, target_date, status, mrp_result, created_at')
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) console.error('[MRP] fetch plans', error)
    else setPlans((data ?? []) as Plan[])
    setIsLoadingPlans(false)
  }, [])

  /* ─── Fetch SALE items ─── */
  const fetchSaleItems = useCallback(async () => {
    const { data } = await supabase
      .from('nomenclature')
      .select('id, product_code, name')
      .ilike('product_code', 'SALE-%')
      .eq('is_deleted', false)
      .order('name')
    setSaleItems(
      (data ?? []).map((n) => ({
        id: n.id as string,
        product_code: n.product_code as string,
        name: n.name as string,
      })),
    )
  }, [])

  useEffect(() => {
    fetchPlans()
    fetchSaleItems()
  }, [fetchPlans, fetchSaleItems])

  /* ─── Create plan helpers ─── */

  const startCreate = () => {
    setIsCreating(true)
    setSelectedPlanId(null)
    setPlanName('')
    setTargetDate(new Date().toISOString().slice(0, 10))
    setTargets([])
    setApproveResult(null)
  }

  const cancelCreate = () => {
    setIsCreating(false)
  }

  const addTarget = (nomId: string) => {
    if (!nomId || targets.some((t) => t.nomId === nomId)) return
    setTargets((prev) => [...prev, { nomId, qty: 1 }])
  }

  const removeTarget = (nomId: string) => {
    setTargets((prev) => prev.filter((t) => t.nomId !== nomId))
  }

  const updateTargetQty = (nomId: string, qty: number) => {
    if (qty < 1) return
    setTargets((prev) =>
      prev.map((t) => (t.nomId === nomId ? { ...t, qty } : t)),
    )
  }

  /* ─── Save plan to DB ─── */

  const savePlan = async () => {
    if (!planName.trim() || !targetDate || targets.length === 0) return
    setIsSaving(true)

    try {
      // Insert plan
      const { data: newPlan, error: planErr } = await supabase
        .from('production_plans')
        .insert({
          name: planName.trim(),
          target_date: targetDate,
          status: 'draft',
        })
        .select('id')
        .single()

      if (planErr || !newPlan) throw planErr ?? new Error('No plan returned')

      // Insert targets
      const items = targets.map((t) => ({
        plan_id: (newPlan as { id: string }).id,
        nomenclature_id: t.nomId,
        target_qty: t.qty,
      }))

      const { error: targetsErr } = await supabase
        .from('plan_targets')
        .insert(items)

      if (targetsErr) throw targetsErr

      // Refresh and select
      setIsCreating(false)
      await fetchPlans()
      setSelectedPlanId((newPlan as { id: string }).id)
      setApproveResult(null)
    } catch (err) {
      console.error('[MRP] save plan', err)
    } finally {
      setIsSaving(false)
    }
  }

  /* ─── Calculate MRP ─── */

  const calculateMRP = async () => {
    if (!selectedPlanId) return
    setIsCalculating(true)
    setApproveResult(null)

    try {
      const { data, error } = await supabase.rpc('fn_run_mrp', {
        p_plan_id: selectedPlanId,
      })

      if (error) throw error

      const result = data as { success: boolean; error?: string }
      if (!result.success) {
        console.error('[MRP] RPC error:', result.error)
      }

      // Refresh plans to get cached mrp_result
      await fetchPlans()
    } catch (err) {
      console.error('[MRP] calculate', err)
    } finally {
      setIsCalculating(false)
    }
  }

  /* ─── Approve plan → Send to Kitchen ─── */

  const approvePlan = async () => {
    if (!selectedPlanId) return
    setIsApproving(true)

    try {
      const { data, error } = await supabase.rpc('fn_approve_plan', {
        p_plan_id: selectedPlanId,
      })

      if (error) throw error

      const result = data as {
        success: boolean
        tasks_created?: number
        error?: string
      }
      if (result.success) {
        setApproveResult(
          `Sent to kitchen! ${result.tasks_created} tasks created.`,
        )
      } else {
        setApproveResult(`Error: ${result.error}`)
      }

      await fetchPlans()
    } catch (err) {
      console.error('[MRP] approve', err)
      setApproveResult('Failed to approve plan')
    } finally {
      setIsApproving(false)
    }
  }

  /* ─── Delete plan ─── */

  const deletePlan = async (planId: string) => {
    const { error } = await supabase
      .from('production_plans')
      .delete()
      .eq('id', planId)

    if (error) {
      console.error('[MRP] delete plan', error)
      return
    }

    if (selectedPlanId === planId) setSelectedPlanId(null)
    fetchPlans()
  }

  /* ─── Create POs from MRP procurement list ─── */

  const createPOsFromMRP = async () => {
    if (!selectedPlan || procurementList.length === 0) return
    const shortageItems = procurementList.filter((p) => p.net_qty > 0)
    if (shortageItems.length === 0) {
      setPOResult('No shortages — nothing to order!')
      return
    }

    setIsCreatingPOs(true)
    setPOResult(null)

    try {
      // 1. Find preferred supplier for each nomenclature via supplier_catalog
      const nomIds = shortageItems.map((p) => p.nomenclature_id)
      const { data: catalogData } = await supabase
        .from('supplier_catalog')
        .select('supplier_id, nomenclature_id')
        .in('nomenclature_id', nomIds)
        .order('match_count', { ascending: false })

      // Build map: nomenclature_id → preferred supplier_id
      const nomToSupplier = new Map<string, string>()
      for (const row of (catalogData ?? []) as { supplier_id: string; nomenclature_id: string }[]) {
        if (!nomToSupplier.has(row.nomenclature_id)) {
          nomToSupplier.set(row.nomenclature_id, row.supplier_id)
        }
      }

      // 2. Group items by supplier
      const supplierGroups = new Map<string, typeof shortageItems>()
      const unmatchedKey = '__unmatched__'

      for (const item of shortageItems) {
        const suppId = nomToSupplier.get(item.nomenclature_id) ?? unmatchedKey
        const group = supplierGroups.get(suppId) ?? []
        group.push(item)
        supplierGroups.set(suppId, group)
      }

      // 3. If all items are unmatched, get the first supplier as default
      let defaultSupplierId: string | null = null
      if (supplierGroups.has(unmatchedKey)) {
        const { data: firstSupplier } = await supabase
          .from('suppliers')
          .select('id')
          .eq('is_deleted', false)
          .order('name')
          .limit(1)
          .single()
        defaultSupplierId = (firstSupplier as { id: string } | null)?.id ?? null
      }

      // 4. Create POs
      let poCount = 0
      let totalItems = 0

      for (const [suppId, items] of supplierGroups) {
        const actualSuppId = suppId === unmatchedKey ? defaultSupplierId : suppId
        if (!actualSuppId) continue

        const payload = {
          supplier_id: actualSuppId,
          expected_date: selectedPlan.target_date,
          notes: `Auto-generated from MRP: ${selectedPlan.name}`,
          source_plan_id: selectedPlan.id,
          lines: items.map((item) => ({
            nomenclature_id: item.nomenclature_id,
            qty_ordered: item.net_qty,
          })),
        }

        const { data, error } = await supabase.rpc('fn_create_purchase_order', {
          p_payload: payload,
        })

        if (error) {
          console.error('[MRP→PO] RPC error:', error)
          continue
        }

        const result = data as { ok: boolean; po_number?: string; line_count?: number }
        if (result.ok) {
          poCount++
          totalItems += result.line_count ?? 0
        }
      }

      if (poCount > 0) {
        setPOResult(`Created ${poCount} PO${poCount > 1 ? 's' : ''} with ${totalItems} items total`)
      } else {
        setPOResult('No POs created — check supplier catalog mappings')
      }
    } catch (err) {
      console.error('[MRP→PO] error:', err)
      setPOResult('Error creating POs')
    } finally {
      setIsCreatingPOs(false)
    }
  }

  /* ─── Helpers ─── */

  const getNomName = (nomId: string) =>
    saleItems.find((s) => s.id === nomId)?.name ?? nomId.slice(0, 8)

  const getNomCode = (nomId: string) =>
    saleItems.find((s) => s.id === nomId)?.product_code ?? ''

  const mrp = selectedPlan?.mrp_result ?? null
  const prepSchedule = mrp?.prep_schedule ?? []
  const procurementList = mrp?.procurement_list ?? []
  const totalCost = procurementList.reduce(
    (sum, p) => sum + (p.estimated_cost ?? 0),
    0,
  )

  /* ─── Render ───────────────────────────────────────────── */

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-slate-100">Master Planner</h1>
          <p className="text-xs text-slate-500">
            MRP Engine — scenario planning, BOM explosion & procurement
            forecasting
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchPlans}
            className="inline-flex h-7 items-center rounded-md border border-slate-700 px-2.5 text-[11px] text-slate-400 hover:bg-slate-800 hover:text-slate-200"
          >
            <RefreshCw className="mr-1 h-3 w-3" />
            Refresh
          </button>
          <button
            type="button"
            onClick={startCreate}
            className="inline-flex h-7 items-center rounded-md border border-emerald-500/60 bg-emerald-500/10 px-2.5 text-[11px] font-medium text-emerald-200 hover:bg-emerald-500/20"
          >
            <Plus className="mr-1 h-3 w-3" />
            New Plan
          </button>
        </div>
      </div>

      {/* ─── Main grid: Plans list (left) + Detail (right) ─── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* ── Left: Plans list ── */}
        <div className="lg:col-span-4 xl:col-span-3">
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
            <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold text-slate-300">
              <CalendarDays className="h-3.5 w-3.5 text-emerald-400" />
              Scenarios
              <span className="ml-auto rounded-full bg-slate-800 px-2 py-0.5 text-[10px] text-slate-500">
                {plans.length}
              </span>
            </h2>

            {isLoadingPlans ? (
              <div className="flex items-center justify-center py-8 text-xs text-slate-500">
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                Loading...
              </div>
            ) : plans.length === 0 ? (
              <p className="py-8 text-center text-[11px] text-slate-600">
                No plans yet. Create your first scenario!
              </p>
            ) : (
              <div className="space-y-1.5">
                {plans.map((plan) => {
                  const cfg = STATUS_CFG[plan.status] ?? STATUS_CFG.draft
                  const isSelected = selectedPlanId === plan.id
                  return (
                    <div
                      key={plan.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        setSelectedPlanId(plan.id)
                        setIsCreating(false)
                        setApproveResult(null)
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          setSelectedPlanId(plan.id)
                          setIsCreating(false)
                          setApproveResult(null)
                        }
                      }}
                      className={`group w-full cursor-pointer rounded-lg border p-2.5 text-left transition ${
                        isSelected
                          ? 'border-emerald-500/40 bg-emerald-500/5'
                          : 'border-slate-800 bg-slate-900/40 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-slate-200 truncate max-w-[140px]">
                          {plan.name}
                        </span>
                        <span
                          className={`rounded-full px-1.5 py-0.5 text-[9px] font-medium ${cfg.color}`}
                        >
                          {cfg.label}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center justify-between">
                        <span className="text-[10px] text-slate-500">
                          {new Date(plan.target_date).toLocaleDateString(
                            'en-GB',
                            { day: 'numeric', month: 'short' },
                          )}
                        </span>
                        {plan.mrp_result && (
                          <span className="text-[9px] text-amber-400">
                            MRP calculated
                          </span>
                        )}
                      </div>
                      {/* Delete for drafts */}
                      {plan.status === 'draft' && (
                        <div className="mt-1 flex justify-end opacity-0 group-hover:opacity-100 transition">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              deletePlan(plan.id)
                            }}
                            className="rounded p-0.5 text-slate-600 hover:text-red-400"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Right: Detail / Create ── */}
        <div className="lg:col-span-8 xl:col-span-9 space-y-5">
          {/* ── Create form ── */}
          {isCreating && (
            <div className="rounded-xl border border-emerald-500/30 bg-slate-900/60 p-5">
              <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-100">
                <Plus className="h-4 w-4 text-emerald-400" />
                New Scenario
              </h3>

              {/* Name + Date */}
              <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-[10px] text-slate-500">
                    Scenario Name
                  </label>
                  <input
                    type="text"
                    value={planName}
                    onChange={(e) => setPlanName(e.target.value)}
                    placeholder="Monday Prep, Weekend Rush..."
                    className="h-8 w-full rounded-md border border-slate-700 bg-slate-800 px-3 text-xs text-slate-100 outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] text-slate-500">
                    Target Date
                  </label>
                  <input
                    type="date"
                    value={targetDate}
                    onChange={(e) => setTargetDate(e.target.value)}
                    className="h-8 w-full rounded-md border border-slate-700 bg-slate-800 px-3 text-xs text-slate-100 outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* Add dish */}
              <div className="mb-3">
                <label className="mb-1 block text-[10px] text-slate-500">
                  Add Dish (SALE items)
                </label>
                <select
                  value=""
                  onChange={(e) => addTarget(e.target.value)}
                  className="h-8 w-full rounded-md border border-slate-700 bg-slate-800 px-3 text-xs text-slate-100 outline-none focus:border-emerald-500"
                >
                  <option value="">Select a dish to add...</option>
                  {saleItems
                    .filter((s) => !targets.some((t) => t.nomId === s.id))
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.product_code} — {s.name}
                      </option>
                    ))}
                </select>
              </div>

              {/* Targets table */}
              {targets.length > 0 && (
                <div className="mb-4">
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="border-b border-slate-800 text-[10px] uppercase text-slate-500">
                        <th className="py-1 text-left">Dish</th>
                        <th className="w-20 py-1 text-center">Qty</th>
                        <th className="w-8 py-1" />
                      </tr>
                    </thead>
                    <tbody>
                      {targets.map((t) => (
                        <tr
                          key={t.nomId}
                          className="border-b border-slate-800/50"
                        >
                          <td className="py-1.5 text-slate-200">
                            <span className="font-mono text-[10px] text-slate-500 mr-1.5">
                              {getNomCode(t.nomId)}
                            </span>
                            {getNomName(t.nomId)}
                          </td>
                          <td className="py-1.5 text-center">
                            <input
                              type="number"
                              min={1}
                              value={t.qty}
                              onChange={(e) =>
                                updateTargetQty(
                                  t.nomId,
                                  parseInt(e.target.value, 10) || 1,
                                )
                              }
                              className="h-6 w-16 rounded border border-slate-700 bg-slate-800 text-center text-xs text-slate-100 outline-none"
                            />
                          </td>
                          <td className="py-1.5 text-right">
                            <button
                              type="button"
                              onClick={() => removeTarget(t.nomId)}
                              className="text-slate-500 hover:text-red-300"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={cancelCreate}
                  className="h-8 rounded-md border border-slate-700 bg-slate-800 px-4 text-xs text-slate-300 hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={savePlan}
                  disabled={
                    isSaving ||
                    !planName.trim() ||
                    !targetDate ||
                    targets.length === 0
                  }
                  className="inline-flex h-8 items-center rounded-md border border-emerald-500/60 bg-emerald-500/15 px-4 text-xs font-medium text-emerald-200 hover:bg-emerald-500/25 disabled:opacity-50"
                >
                  {isSaving && (
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  )}
                  Save Scenario
                </button>
              </div>
            </div>
          )}

          {/* ── Selected plan detail ── */}
          {selectedPlan && !isCreating && (
            <>
              {/* Plan header card */}
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-100">
                      {selectedPlan.name}
                    </h3>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      Target:{' '}
                      {new Date(selectedPlan.target_date).toLocaleDateString(
                        'en-GB',
                        {
                          weekday: 'long',
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric',
                        },
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${(STATUS_CFG[selectedPlan.status] ?? STATUS_CFG.draft).color}`}
                    >
                      {(STATUS_CFG[selectedPlan.status] ?? STATUS_CFG.draft)
                        .label}
                    </span>

                    {/* Calculate button (draft only) */}
                    {selectedPlan.status === 'draft' && (
                      <button
                        type="button"
                        onClick={calculateMRP}
                        disabled={isCalculating}
                        className="inline-flex h-7 items-center rounded-md border border-amber-500/60 bg-amber-500/10 px-3 text-[11px] font-medium text-amber-200 hover:bg-amber-500/20 disabled:opacity-50"
                      >
                        {isCalculating ? (
                          <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                        ) : (
                          <Zap className="mr-1.5 h-3 w-3" />
                        )}
                        Calculate Requirements
                      </button>
                    )}
                  </div>
                </div>

                {/* MRP calculated timestamp */}
                {mrp?.calculated_at && (
                  <p className="mt-2 text-[10px] text-slate-600">
                    MRP calculated:{' '}
                    {new Date(mrp.calculated_at).toLocaleString('en-GB')}
                  </p>
                )}
              </div>

              {/* ── MRP Results ── */}
              {mrp && (
                <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                  {/* 🔪 To Prep (PF/MOD) */}
                  <div className="rounded-xl border border-amber-500/20 bg-slate-900/60 p-4">
                    <h4 className="mb-3 flex items-center gap-2 text-xs font-semibold text-amber-300">
                      <Package className="h-3.5 w-3.5" />
                      To Prep (PF / MOD)
                      <span className="ml-auto rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-400">
                        {prepSchedule.length} items
                      </span>
                    </h4>

                    {prepSchedule.length === 0 ? (
                      <p className="py-6 text-center text-[11px] text-slate-600">
                        All prep items are in stock!
                      </p>
                    ) : (
                      <table className="w-full text-[11px]">
                        <thead>
                          <tr className="border-b border-slate-800 text-[10px] uppercase text-slate-500">
                            <th className="py-1 text-left">Item</th>
                            <th className="py-1 text-right">Need</th>
                            <th className="py-1 text-right">On Hand</th>
                            <th className="py-1 text-right font-bold">
                              To Make
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {prepSchedule.map((item) => (
                            <tr
                              key={item.nomenclature_id}
                              className="border-b border-slate-800/40"
                            >
                              <td className="py-1.5">
                                <span className="font-mono text-[9px] text-slate-600 mr-1">
                                  {item.product_code}
                                </span>
                                <span className="text-slate-200">
                                  {item.name}
                                </span>
                              </td>
                              <td className="py-1.5 text-right text-slate-400">
                                {item.gross_qty} {item.base_unit}
                              </td>
                              <td className="py-1.5 text-right text-slate-500">
                                {item.on_hand}
                              </td>
                              <td className="py-1.5 text-right font-semibold text-amber-300">
                                {item.net_qty} {item.base_unit}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>

                  {/* 🛒 To Buy (RAW) */}
                  <div className="rounded-xl border border-emerald-500/20 bg-slate-900/60 p-4">
                    <h4 className="mb-3 flex items-center gap-2 text-xs font-semibold text-emerald-300">
                      <ShoppingCart className="h-3.5 w-3.5" />
                      To Buy (RAW)
                      <span className="ml-auto rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-400">
                        {procurementList.length} items
                      </span>
                    </h4>

                    {procurementList.length === 0 ? (
                      <p className="py-6 text-center text-[11px] text-slate-600">
                        All raw materials are in stock!
                      </p>
                    ) : (
                      <>
                        <table className="w-full text-[11px]">
                          <thead>
                            <tr className="border-b border-slate-800 text-[10px] uppercase text-slate-500">
                              <th className="py-1 text-left">Item</th>
                              <th className="py-1 text-right">Need</th>
                              <th className="py-1 text-right">On Hand</th>
                              <th className="py-1 text-right">To Buy</th>
                              <th className="py-1 text-right">Est. Cost</th>
                            </tr>
                          </thead>
                          <tbody>
                            {procurementList.map((item) => (
                              <tr
                                key={item.nomenclature_id}
                                className="border-b border-slate-800/40"
                              >
                                <td className="py-1.5">
                                  <span className="font-mono text-[9px] text-slate-600 mr-1">
                                    {item.product_code}
                                  </span>
                                  <span className="text-slate-200">
                                    {item.name}
                                  </span>
                                </td>
                                <td className="py-1.5 text-right text-slate-400">
                                  {item.gross_qty}
                                </td>
                                <td className="py-1.5 text-right text-slate-500">
                                  {item.on_hand}
                                </td>
                                <td className="py-1.5 text-right font-semibold text-emerald-300">
                                  {item.net_qty} {item.base_unit}
                                </td>
                                <td className="py-1.5 text-right text-amber-300">
                                  {item.estimated_cost.toFixed(0)} THB
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>

                        {/* Total cost */}
                        <div className="mt-3 flex items-center justify-between border-t border-slate-800 pt-2">
                          <div>
                            <span className="text-[10px] text-slate-500 mr-2">
                              Estimated Total:
                            </span>
                            <span className="text-sm font-bold text-emerald-300">
                              {totalCost.toFixed(0)} THB
                            </span>
                          </div>

                          {/* Create POs button */}
                          {selectedPlan.status === 'draft' && (
                            <button
                              type="button"
                              onClick={createPOsFromMRP}
                              disabled={isCreatingPOs || procurementList.filter(p => p.net_qty > 0).length === 0}
                              className="inline-flex h-7 items-center rounded-md border border-sky-500/60 bg-sky-500/10 px-3 text-[11px] font-medium text-sky-200 hover:bg-sky-500/20 disabled:opacity-50"
                            >
                              {isCreatingPOs ? (
                                <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                              ) : (
                                <ShoppingCart className="mr-1.5 h-3 w-3" />
                              )}
                              Create Purchase Orders
                            </button>
                          )}
                        </div>

                        {/* PO creation result */}
                        {poResult && (
                          <div
                            className={`mt-2 rounded-lg px-3 py-2 text-xs ${
                              poResult.startsWith('Created')
                                ? 'bg-sky-500/10 text-sky-300'
                                : poResult.startsWith('No shortages')
                                  ? 'bg-emerald-500/10 text-emerald-300'
                                  : 'bg-red-500/10 text-red-300'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                {poResult.startsWith('Created') ? (
                                  <Check className="h-3.5 w-3.5" />
                                ) : poResult.startsWith('No shortages') ? (
                                  <Check className="h-3.5 w-3.5" />
                                ) : (
                                  <X className="h-3.5 w-3.5" />
                                )}
                                {poResult}
                              </div>
                              {poResult.startsWith('Created') && (
                                <button
                                  type="button"
                                  onClick={() => navigate('/procurement')}
                                  className="rounded border border-sky-500/30 px-2 py-0.5 text-[10px] text-sky-300 hover:bg-sky-500/10"
                                >
                                  View POs →
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* ── Step 3: Approve ── */}
              {selectedPlan.status === 'draft' && mrp && (
                <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ChevronRight className="h-4 w-4 text-slate-600" />
                      <span className="text-xs text-slate-400">
                        Step 3: Review the plan above, then send to kitchen
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={approvePlan}
                      disabled={
                        isApproving || prepSchedule.length === 0
                      }
                      className="inline-flex h-8 items-center rounded-md border border-emerald-500/60 bg-emerald-500/15 px-4 text-xs font-medium text-emerald-200 hover:bg-emerald-500/25 disabled:opacity-50"
                    >
                      {isApproving ? (
                        <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                      ) : (
                        <Send className="mr-1.5 h-3 w-3" />
                      )}
                      Approve & Send to Kitchen
                    </button>
                  </div>

                  {approveResult && (
                    <div
                      className={`mt-3 rounded-lg px-3 py-2 text-xs ${
                        approveResult.startsWith('Sent')
                          ? 'bg-emerald-500/10 text-emerald-300'
                          : 'bg-red-500/10 text-red-300'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {approveResult.startsWith('Sent') ? (
                          <Check className="h-3.5 w-3.5" />
                        ) : (
                          <X className="h-3.5 w-3.5" />
                        )}
                        {approveResult}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Active plan badge */}
              {selectedPlan.status === 'active' && (
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                  <div className="flex items-center gap-2 text-xs text-emerald-300">
                    <Check className="h-4 w-4" />
                    <span className="font-medium">
                      Plan approved — production tasks created in KDS
                    </span>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Empty state */}
          {!isCreating && !selectedPlan && (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-800 py-16">
              <CalendarDays className="mb-3 h-8 w-8 text-slate-700" />
              <p className="text-sm text-slate-500">
                Select a plan or create a new scenario
              </p>
              <p className="mt-1 text-[11px] text-slate-600">
                The MRP engine will calculate what to prep and what to buy
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
