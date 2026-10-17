import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../../../lib/supabase'
import { useAuth } from '../../../../contexts/AuthContext'
import { DietCheckBadge } from '../../shared/DietCheckBadge'
import { DIET_CHECK_UNAVAILABLE, dietCheckPresentation } from '../../shared/dietCheck'
import type { DishDietCheck } from '../../shared/dietCheck'

/** One blocking ingredient, from fn_dish_diet_review (mig 513). */
export interface DietReviewItem {
  id: string
  code: string
  name: string
  state: 'unknown' | 'proposed' | 'confirmed'
  origin: string[] | null
  evidence: string | null
  soft_deleted: boolean
}

interface DietCheckPanelProps {
  dishId: string
  row: DishDietCheck | null | undefined
  /** The status view could not be read. */
  unavailable?: boolean
  /** Called after any confirm so the parent refetches the status view. */
  onChanged?: () => void
}

function originText(item: DietReviewItem): string {
  if (item.origin == null) return 'not classified'
  return item.origin.length === 0 ? 'plant (no animal origin)' : item.origin.join(' + ')
}

/** Owner-tab panel: why a dish has (or lacks) diet tags, and the two human actions.
 *  Confirming an ingredient asserts its animal origin; confirming a dish publishes the
 *  tags its ingredients prove and clears the "check tags" mark. */
export function DietCheckPanel({ dishId, row, unavailable = false, onChanged }: DietCheckPanelProps) {
  const { user } = useAuth()
  const reviewer = user?.email ?? 'staff'
  const [items, setItems] = useState<DietReviewItem[]>([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)

  const loadItems = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.rpc('fn_dish_diet_review', { p_dish_id: dishId })
    if (error) {
      setMessage({ type: 'error', text: error.message })
      setItems([])
    } else {
      setItems((data ?? []) as DietReviewItem[])
    }
    setLoading(false)
  }, [dishId])

  useEffect(() => {
    setMessage(null)
    void loadItems()
  }, [loadItems])

  const confirmIngredient = async (item: DietReviewItem) => {
    setBusy(item.id)
    setMessage(null)
    const { error } = await supabase.rpc('fn_confirm_ingredient_diet', {
      p_id: item.id,
      p_origin: null,
      p_evidence: null,
      p_reviewer: reviewer,
    })
    setBusy(null)
    if (error) {
      setMessage({ type: 'error', text: error.message })
      return
    }
    await loadItems()
    onChanged?.()
  }

  const confirmDish = async () => {
    setBusy('dish')
    setMessage(null)
    const { data, error } = await supabase.rpc('fn_confirm_dish_diets', {
      p_dish_id: dishId,
      p_reviewer: reviewer,
    })
    setBusy(null)
    if (error) {
      setMessage({ type: 'error', text: error.message })
      return
    }
    const diets = ((data as { diets?: string[] } | null)?.diets ?? []).join(' + ') || 'no diet tags'
    setMessage({ type: 'ok', text: `Confirmed: ${diets}.` })
    await loadItems()
    onChanged?.()
  }

  const p = dietCheckPresentation(row)

  return (
    <section className="space-y-1.5" data-testid="diet-check-panel">
      <div className="flex items-center gap-2">
        <h4 className="text-[10px] uppercase tracking-widest text-cream/50">Diet tags</h4>
        <DietCheckBadge row={row} />
      </div>

      {p && <p className="text-[10px] leading-relaxed text-cream/45">{p.detail}</p>}
      {!p && unavailable && (
        <p className="text-[10px] leading-relaxed text-amber-watch">{DIET_CHECK_UNAVAILABLE}</p>
      )}

      {loading && <p className="text-[10px] text-cream/40">Loading ingredients…</p>}

      {items.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-surface-3">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-surface-2/40 text-[10px] uppercase tracking-wide text-cream/40">
                <th className="px-2 py-1 text-left font-medium">Ingredient to confirm</th>
                <th className="px-2 py-1 text-left font-medium">Animal origin</th>
                <th className="px-2 py-1" />
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id} className="border-t border-surface-3/60">
                  <td className="px-2 py-1 text-cream/80">
                    {it.name}
                    {it.soft_deleted && (
                      <span className="ml-1 text-[9px] text-brick-soft">retired, still in recipe</span>
                    )}
                  </td>
                  <td className="px-2 py-1 text-cream/60">
                    {originText(it)}
                    {it.state === 'proposed' && <span className="ml-1 text-[9px] text-cream/40">(proposed)</span>}
                  </td>
                  <td className="px-2 py-1 text-right">
                    {it.state === 'proposed' ? (
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() => void confirmIngredient(it)}
                        className="rounded border border-surface-3 px-2 py-0.5 text-[10px] text-cream/80 hover:bg-surface-3 disabled:opacity-50"
                      >
                        {busy === it.id ? '…' : 'Confirm'}
                      </button>
                    ) : (
                      <span className="text-[9px] text-cream/35">needs classification</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {row?.needs_check && (
        <div className="space-y-1 pt-1">
          <button
            type="button"
            disabled={!row.ready || busy !== null}
            onClick={() => void confirmDish()}
            className="rounded bg-[var(--color-royal-green)]/30 px-3 py-1 text-xs font-medium text-[color:var(--color-forest-soft)] hover:bg-[var(--color-royal-green)]/45 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy === 'dish'
              ? 'Confirming…'
              : row.ready
                ? `Confirm diet tags: ${row.proposed_diets?.join(' + ') || 'none'}`
                : 'Confirm diet tags (resolve ingredients first)'}
          </button>
          {row.ready && (
            <p className="text-[10px] text-cream/40">
              You are confirming that every ingredient is classified correctly. The tags go to guests immediately.
            </p>
          )}
        </div>
      )}

      {message && (
        <p className={`text-[10px] ${message.type === 'ok' ? 'text-[color:var(--color-forest-soft)]' : 'text-brick-soft'}`}>
          {message.text}
        </p>
      )}
    </section>
  )
}
