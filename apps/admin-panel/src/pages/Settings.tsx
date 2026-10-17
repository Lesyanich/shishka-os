import { useEffect } from 'react'
import { LoyverseConfigPanel } from '../components/settings/LoyverseConfigPanel'
import { StockSheetSettings } from '../components/settings/StockSheetSettings'
import { useLoyverseIntegration } from '../hooks/useLoyverseIntegration'

export function Settings() {
  const loyverse = useLoyverseIntegration()

  useEffect(() => {
    loyverse.loadStatus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-100">Settings</h1>
        <p className="mt-1 text-sm text-slate-500">
          System configuration and integrations.
        </p>
      </div>

      {/* Staff stock-order sheet */}
      <StockSheetSettings />

      {/* Loyverse POS */}
      <LoyverseConfigPanel
        isLoading={loyverse.isLoading}
        syncLogs={loyverse.syncLogs}
        lastResult={loyverse.lastResult}
        error={loyverse.error}
        onSyncCategories={loyverse.syncCategories}
        onSyncItems={loyverse.syncItems}
        onFullSync={loyverse.fullSync}
      />
    </div>
  )
}
