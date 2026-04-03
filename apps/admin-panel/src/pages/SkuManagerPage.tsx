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
    <div className="rounded-lg border border-slate-800 bg-slate-900/50 px-4 py-3">
      <div className="flex items-center gap-2">
        <Icon className={`h-4 w-4 ${color}`} />
        <span className="text-[10px] uppercase tracking-wide text-slate-500">{label}</span>
      </div>
      <p className="mt-1 text-lg font-semibold tabular-nums text-slate-100">{value}</p>
    </div>
  )
}

export function SkuManagerPage() {
  const {
    skus,
    nomenclatureOptions,
    stats,
    isLoading,
    createSku,
    updateSku,
    deactivateSku,
  } = useSkuManager()

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-lg font-bold text-slate-100">SKU Manager</h1>
        <p className="text-xs text-slate-500">
          Physical product catalog — barcodes, brands, packaging
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          icon={Package}
          label="Total SKUs"
          value={stats.total}
          color="text-emerald-400"
        />
        <StatCard
          icon={Barcode}
          label="With barcode"
          value={`${stats.withBarcode} / ${stats.total}`}
          color="text-sky-400"
        />
        <StatCard
          icon={Truck}
          label="Linked to supplier"
          value={stats.withSupplier}
          color="text-amber-400"
        />
        <StatCard
          icon={Box}
          label="Inactive"
          value={stats.inactive}
          color="text-slate-500"
        />
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
