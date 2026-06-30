// ═══════════════════════════════════════════════════════════
// Page: SkuManagerPage
// Phase 10.2: SKU management with stats dashboard
// ═══════════════════════════════════════════════════════════

import { Barcode, Box, Package, Truck } from 'lucide-react'
import { useSkuManager } from '../hooks/useSkuManager'
import { SkuManager } from '../components/inventory/SkuManager'

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: typeof Package
  label: string
  value: number | string
  color: string
}) {
  return (
    <div className="shk-kpi">
      <div className="flex items-center gap-2">
        <Icon className={`h-4 w-4 ${color}`} />
        <span className="text-[10px] uppercase tracking-[0.14em] text-cream/60">{label}</span>
      </div>
      <p className="mt-1.5 font-mono text-xl font-semibold tabular-nums text-cream">{value}</p>
    </div>
  )
}

export function SkuManagerPage() {
  const { skus, nomenclatureOptions, stats, isLoading, createSku, updateSku, deactivateSku } =
    useSkuManager()

  return (
    <div className="menu-canvas -mx-4 space-y-5 px-4 pt-5 pb-10 sm:-mx-6 sm:px-6">
      {/* Header */}
      <div className="flex items-start gap-3.5">
        <span className="shk-seal" aria-hidden>
          S
        </span>
        <div>
          <div className="shk-eyebrow">SKU &middot; catalog</div>
          <h1 className="mt-1 font-display text-4xl font-bold leading-none tracking-tight text-cream">
            SKU Manager
          </h1>
          <p className="mt-1.5 text-sm text-cream/45">
            Physical product catalog — barcodes, brands, packaging
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={Package} label="Total SKUs" value={stats.total} color="text-forest-soft" />
        <StatCard
          icon={Barcode}
          label="With barcode"
          value={`${stats.withBarcode} / ${stats.total}`}
          color="text-honey-300"
        />
        <StatCard
          icon={Truck}
          label="Linked to supplier"
          value={stats.withSupplier}
          color="text-amber-watch"
        />
        <StatCard icon={Box} label="Inactive" value={stats.inactive} color="text-cream/40" />
      </div>

      {/* Table */}
      <SkuManager
        skus={skus}
        nomenclatureOptions={nomenclatureOptions}
        isLoading={isLoading}
        onCreateSku={createSku}
        onUpdateSku={updateSku}
        onDeactivateSku={deactivateSku}
      />
    </div>
  )
}
