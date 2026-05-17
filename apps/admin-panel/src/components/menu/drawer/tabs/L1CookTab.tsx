import { ChefHat, AlertTriangle, Package } from 'lucide-react'
import type { AssemblyComponent } from '../../../../hooks/useDishCard'
import type { MenuItem } from '../../../../hooks/useMenuData'

export interface RecipeStep {
  id: string
  step_number: number
  operation_name: string
  duration_min: number | null
  internal_temp_c: number | null
  equipment_name: string | null
  notes: string | null
  is_ccp: boolean
  ccp_check_text: string | null
}

interface L1CookTabProps {
  item: MenuItem
  components: AssemblyComponent[]
  componentsLoading: boolean
  recipeSteps: RecipeStep[]
  recipeStepsLoading: boolean
}

export function L1CookTab({
  item,
  components,
  componentsLoading,
  recipeSteps,
  recipeStepsLoading,
}: L1CookTabProps) {
  const pfComponents = components.filter((c) =>
    c.component_code.startsWith('PF-'),
  )

  return (
    <div className="space-y-6">
      {/* Kitchen note */}
      <section className="space-y-1">
        <h4 className="text-[10px] uppercase tracking-widest text-cream/50">
          Kitchen Note
        </h4>
        <p className="text-sm text-cream/75">
          {item.kitchen_note || (
            <span className="italic text-cream/40">No kitchen note</span>
          )}
        </p>
      </section>

      {/* Underlying PF components */}
      <section className="space-y-2">
        <h4 className="text-[10px] uppercase tracking-widest text-cream/50">
          <Package className="mr-1 inline h-3 w-3" />
          PF Components
        </h4>
        {componentsLoading ? (
          <span className="text-xs text-cream/40">Loading...</span>
        ) : pfComponents.length === 0 ? (
          <span className="text-xs text-cream/40">
            No PF underlying (RAW + MOD only)
          </span>
        ) : (
          <ul className="space-y-1.5">
            {pfComponents.map((c) => (
              <li
                key={c.component_id}
                className="flex items-center gap-2 text-xs"
              >
                <span className="rounded-full bg-[var(--color-amber-watch)]/20 px-1.5 py-0.5 text-[9px] font-semibold text-[color:var(--color-amber-watch)]">
                  PF
                </span>
                <span className="text-cream/80">{c.component_name}</span>
                <span className="font-mono text-[10px] text-cream/40">
                  {c.qty_per_portion} {c.base_unit ?? ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Recipe steps with CCP highlighting */}
      <section className="space-y-2">
        <h4 className="text-[10px] uppercase tracking-widest text-cream/50">
          <ChefHat className="mr-1 inline h-3 w-3" />
          Recipe Steps
          {recipeSteps.some((s) => s.is_ccp) && (
            <span className="ml-2 inline-flex items-center gap-0.5 text-amber-400">
              <AlertTriangle className="h-2.5 w-2.5" />
              HACCP
            </span>
          )}
        </h4>
        {recipeStepsLoading ? (
          <span className="text-xs text-cream/40">Loading...</span>
        ) : recipeSteps.length === 0 ? (
          <span className="text-xs text-cream/40">
            No recipe steps defined
          </span>
        ) : (
          <ol className="space-y-2">
            {recipeSteps.map((s) => (
              <li
                key={s.id}
                className={`rounded-lg border px-3 py-2 text-xs ${
                  s.is_ccp
                    ? 'border-amber-500/40 bg-amber-950/30'
                    : 'border-surface-3 bg-surface-2/30'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="shrink-0 rounded-full bg-surface-3 px-1.5 py-0.5 font-mono text-[10px] text-cream/50">
                    {s.step_number}
                  </span>
                  <span className="font-medium text-cream/90">
                    {s.operation_name}
                  </span>
                  {s.is_ccp && (
                    <span className="rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-bold text-amber-400">
                      CCP
                    </span>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap gap-3 text-[10px] text-cream/50">
                  {s.duration_min != null && <span>{s.duration_min} min</span>}
                  {s.internal_temp_c != null && (
                    <span>{s.internal_temp_c}&deg;C</span>
                  )}
                  {s.equipment_name && <span>{s.equipment_name}</span>}
                </div>
                {s.is_ccp && s.ccp_check_text && (
                  <p className="mt-1.5 text-[10px] font-medium text-amber-300/80">
                    {s.ccp_check_text}
                  </p>
                )}
                {s.notes && (
                  <p className="mt-1 text-[10px] text-cream/50">{s.notes}</p>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  )
}
