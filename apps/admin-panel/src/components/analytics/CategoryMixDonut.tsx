import { useMemo, useState } from 'react'
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts'
import { formatTHBFull } from '../finance/helpers'
import { donutSlices, OTHER_SLICE_NAME, type CategorySlice } from '../../lib/analytics'

/* ═══════════════════════════════════════════════════════════
   CategoryMixDonut — revenue share per menu section for the
   selected period (spec §5).

   Shares the category → colour map with the top-10 chart so a
   section reads the same in both. Percentages are always
   written out: colour alone is never the message
   (design-system MASTER.md anti-patterns).
   ═══════════════════════════════════════════════════════════ */

export interface CategoryMixDonutProps {
  slices: CategorySlice[]
  categoryColor: (name: string) => string
  isLoading: boolean
}

export function CategoryMixDonut({ slices, categoryColor, isLoading }: CategoryMixDonutProps) {
  const [activeIndex, setActiveIndex] = useState<number | undefined>(undefined)

  // The donut groups the long tail; the legend below stays complete.
  const wedges = useMemo(() => donutSlices(slices), [slices])
  const total = slices.reduce((s, c) => s + c.revenue, 0)
  const active = activeIndex != null ? wedges[activeIndex] : undefined

  return (
    <div className="flex flex-col shk-panel">
      <div className="border-b border-[var(--line)] px-4 py-3">
        <h2 className="text-sm font-semibold text-cream">Category mix</h2>
        <p className="text-xs text-cream/60">
          Revenue share per menu section
          {wedges.length < slices.length &&
            ` · donut groups the smallest ${slices.length - wedges.length + 1} into one wedge; the list below is complete`}
        </p>
      </div>

      <div className="flex-1 px-2 py-4">
        {isLoading ? (
          <div className="flex h-64 items-center justify-center">
            <div className="h-40 w-40 animate-pulse rounded-full bg-[var(--s-2)]" />
          </div>
        ) : slices.length === 0 ? (
          <div className="flex h-64 items-center justify-center text-xs text-cream/60">
            No sales in this period
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-center">
            {/* Donut */}
            <div className="relative flex-shrink-0" style={{ width: 176, height: 176 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={wedges}
                    dataKey="revenue"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={54}
                    outerRadius={80}
                    // With ~18 menu sections, 2° of padding per slice eats the
                    // whole circle and the smallest category is dropped without
                    // a trace. minAngle guarantees every selling section draws.
                    paddingAngle={1}
                    minAngle={1}
                    onMouseEnter={(_, index) => setActiveIndex(index)}
                    onMouseLeave={() => setActiveIndex(undefined)}
                  >
                    {wedges.map((s) => (
                      <Cell
                        key={s.name}
                        fill={
                          s.name === OTHER_SLICE_NAME
                            ? 'var(--s-3, #1F2818)'
                            : categoryColor(s.name)
                        }
                        stroke="transparent"
                      />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>

              {/* Centre readout — hovered slice, else the period total */}
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
                {active ? (
                  <>
                    <span className="max-w-[92px] truncate text-[10px] font-medium text-cream">
                      {active.name}
                    </span>
                    <span className="font-mono text-sm font-semibold tabular-nums text-honey-300">
                      {active.pct.toFixed(1)}%
                    </span>
                    <span className="text-[9px] text-cream/60">
                      ฿{formatTHBFull(active.revenue)}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="text-[9px] uppercase tracking-[0.12em] text-cream/60">
                      Total
                    </span>
                    <span className="font-mono text-sm font-semibold tabular-nums text-honey-300">
                      ฿{formatTHBFull(total)}
                    </span>
                    <span className="text-[9px] text-cream/60">{slices.length} sections</span>
                  </>
                )}
              </div>
            </div>

            {/* Legend */}
            <ul className="flex-1 space-y-0.5 self-stretch overflow-y-auto" style={{ maxHeight: 176 }}>
              {slices.map((s, i) => (
                <li
                  key={s.name}
                  className="flex items-center gap-2 rounded px-1.5 py-0.5 transition hover:bg-[var(--s-2)]"
                  style={{ transitionTimingFunction: 'var(--e-out)' }}
                  onMouseEnter={() => setActiveIndex(i)}
                  onMouseLeave={() => setActiveIndex(undefined)}
                >
                  <span
                    className="h-2 w-2 flex-shrink-0 rounded-full"
                    style={{
                      backgroundColor:
                        i < wedges.length - 1 || wedges.length === slices.length
                          ? categoryColor(s.name)
                          : 'var(--s-3, #1F2818)',
                    }}
                  />
                  <span className="flex-1 truncate text-[10px] text-cream/60">{s.name}</span>
                  <span className="font-mono text-[10px] font-medium tabular-nums text-cream/80">
                    {s.pct.toFixed(1)}%
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
