import type { PortionUnit } from './types'

const BAHT = '\u0E3F'

interface PriceLabelProps {
  price: number | null
  portionSize?: number | null
  portionUnit?: PortionUnit | null
  showPer100?: boolean
  align?: 'left' | 'right'
  tone?: 'default' | 'overlay'
}

function pricePer100(
  price: number | null,
  size: number | null | undefined,
  unit: PortionUnit | null | undefined,
): string | null {
  if (price == null || size == null || !unit || unit === 'pcs' || size <= 0) return null
  return `${BAHT}${((price / size) * 100).toFixed(0)}/100${unit}`
}

export function PriceLabel({
  price,
  portionSize,
  portionUnit,
  showPer100 = true,
  align = 'right',
  tone = 'default',
}: PriceLabelProps) {
  if (price == null) return null
  const per100 = showPer100 ? pricePer100(price, portionSize, portionUnit) : null
  const alignCls = align === 'right' ? 'items-end text-right' : 'items-start text-left'
  const wrapCls =
    tone === 'overlay'
      ? 'rounded-lg bg-slate-950/80 px-2.5 py-1 backdrop-blur'
      : ''
  return (
    <span className={`inline-flex flex-col ${alignCls} ${wrapCls}`}>
      <span className="font-mono text-xs font-bold tabular-nums text-emerald-300">
        {BAHT}
        {price.toLocaleString()}
      </span>
      {per100 && (
        <span className="font-mono text-[9px] font-medium tabular-nums text-slate-400">
          {per100}
        </span>
      )}
    </span>
  )
}
