// ═══════════════════════════════════════════════════════════
// NomenclatureLabel — Clean nomenclature display component
// Phase 4.6: Perfect OCR & Smart Mapping Engine
// ═══════════════════════════════════════════════════════════
// Shows clean `name` + colored type badge instead of
// technical product_code (RAW-Sugar → "Sugar" + [Raw] badge).
// ═══════════════════════════════════════════════════════════

interface NomenclatureLabelProps {
  productCode: string
  name: string
  showBadge?: boolean
  size?: 'sm' | 'md'
}

/** Derive human-readable type from product_code prefix */
function getTypeFromCode(code: string): string {
  if (code.startsWith('SALE-')) return 'Menu'
  if (code.startsWith('PF-')) return 'Prep'
  if (code.startsWith('MOD-')) return 'Topping'
  if (code.startsWith('RAW-AUTO-')) return 'Auto'
  if (code.startsWith('RAW-')) return 'Raw'
  return 'Other'
}

const TYPE_COLORS: Record<string, string> = {
  Raw: 'bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/20',
  Prep: 'bg-violet-500/15 text-violet-400 ring-1 ring-violet-500/20',
  Topping: 'bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/20',
  Menu: 'bg-indigo-500/15 text-indigo-400 ring-1 ring-indigo-500/20',
  Auto: 'bg-slate-500/15 text-slate-400 ring-1 ring-slate-500/20',
  Other: 'bg-slate-500/15 text-slate-400 ring-1 ring-slate-500/20',
}

export function NomenclatureLabel({
  productCode,
  name,
  showBadge = true,
  size = 'sm',
}: NomenclatureLabelProps) {
  const type = getTypeFromCode(productCode)
  const badgeColor = TYPE_COLORS[type] ?? TYPE_COLORS.Other

  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={
          size === 'sm'
            ? 'text-xs text-slate-200'
            : 'text-sm text-slate-100'
        }
      >
        {name}
      </span>
      {showBadge && (
        <span
          className={`rounded px-1 py-0.5 text-[9px] font-medium uppercase tracking-wider ${badgeColor}`}
        >
          {type}
        </span>
      )}
    </span>
  )
}

/** Helper for <option> elements (plain text, no JSX) */
export function nomenclatureOptionText(
  productCode: string,
  name: string,
): string {
  const type = getTypeFromCode(productCode)
  return `${name} (${type})`
}
