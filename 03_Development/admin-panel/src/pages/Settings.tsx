import { useEffect } from 'react'
import { SyrveConfigPanel } from '../components/settings/SyrveConfigPanel'
import { SyrvePocReport } from '../components/settings/SyrvePocReport'
import { useSyrveIntegration } from '../hooks/useSyrveIntegration'

export function Settings() {
  const integration = useSyrveIntegration()

  useEffect(() => {
    integration.loadConfig()
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

      {/* Syrve Integration */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,0.45fr)_minmax(0,0.55fr)]">
        <SyrveConfigPanel
          config={integration.config}
          setConfig={integration.setConfig}
          isLoading={integration.isLoadingConfig}
          isSaving={integration.isSaving}
          isRunningPoc={integration.isRunningPoc}
          error={integration.error}
          success={integration.success}
          onSave={integration.saveAllConfig}
          onRunPoc={integration.runPoc}
        />
        <SyrvePocReport
          report={integration.pocReport}
          isLoading={integration.isRunningPoc}
          onApplyMapping={integration.applyMapping}
        />
      </div>
    </div>
  )
}
