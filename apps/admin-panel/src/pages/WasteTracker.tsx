import { Trash2 } from 'lucide-react'
import { useInventory } from '../hooks/useInventory'
import { useWasteLog } from '../hooks/useWasteLog'
import { usePredictivePO } from '../hooks/usePredictivePO'
import { ZeroDayStocktake } from '../components/waste/ZeroDayStocktake'
import { WasteLogForm } from '../components/waste/WasteLogForm'
import { PredictivePO } from '../components/waste/PredictivePO'

export function WasteTracker() {
  const inventory = useInventory()
  const waste = useWasteLog()
  const po = usePredictivePO()

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <Trash2 className="h-5 w-5 text-rose-400" />
          <h1 className="text-lg font-bold text-slate-100">
            Waste & Inventory
          </h1>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          Stocktake, write-off logging with financial liability, and predictive procurement
        </p>
      </div>

      {/* Grid: left = Stocktake, right = Waste + PO */}
      <div className="grid gap-6 xl:grid-cols-2">
        {/* Left column: Stocktake */}
        <ZeroDayStocktake
          items={inventory.items}
          isLoading={inventory.isLoading}
          error={inventory.error}
          onSave={inventory.upsertBalance}
          onRefetch={inventory.refetch}
        />

        {/* Right column: Waste Log + Predictive PO */}
        <div className="space-y-6">
          <WasteLogForm
            nomenclature={inventory.items}
            logs={waste.logs}
            isLoading={waste.isLoading}
            error={waste.error}
            onSubmit={waste.createWaste}
          />

          <PredictivePO po={po} />
        </div>
      </div>
    </div>
  )
}
