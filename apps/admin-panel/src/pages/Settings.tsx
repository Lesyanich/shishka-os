import { useEffect } from 'react'
import { SyrveConfigPanel } from '../components/settings/SyrveConfigPanel'
import { SyrvePocReport } from '../components/settings/SyrvePocReport'
import { LoyverseConfigPanel } from '../components/settings/LoyverseConfigPanel'
import { useSyrveIntegration } from '../hooks/useSyrveIntegration'
import { useLoyverseIntegration } from '../hooks/useLoyverseIntegration'

export function Settings() {
  const syrve = useSyrveIntegration()
  const loyverse = useLoyverseIntegration()

  useEffect(() => {
    syrve.loadConfig()
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

      {/* Syrve Integration */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,0.45fr)_minmax(0,0.55fr)]">
        <SyrveConfigPanel
          config={syrve.config}
          setConfig={syrve.setConfig}
          isLoading={syrve.isLoadingConfig}
          isSaving={syrve.isSaving}
          isRunningPoc={syrve.isRunningPoc}
          error={syrve.error}
          success={syrve.success}
          onSave={syrve.saveAllConfig}
          onRunPoc={syrve.runPoc}
        />
        <SyrvePocReport
          report={syrve.pocReport}
          isLoading={syrve.isRunningPoc}
          onApplyMapping={syrve.applyMapping}
        />
      </div>
    </div>
  )
}
