import { useState } from 'react'
import { Settings, Zap, Save, Loader2 } from 'lucide-react'

interface SyrveConfig {
  api_login: string
  base_url: string
  organization_id: string
  store_id: string
  default_tax_category_id: string
  vat_rate: string
}

interface Props {
  config: SyrveConfig
  setConfig: React.Dispatch<React.SetStateAction<SyrveConfig>>
  isLoading: boolean
  isSaving: boolean
  isRunningPoc: boolean
  error: string | null
  success: string | null
  onSave: (updates: Partial<SyrveConfig>) => Promise<void>
  onRunPoc: () => Promise<void>
}

const FIELDS: { key: keyof SyrveConfig; label: string; placeholder: string; sensitive?: boolean }[] = [
  { key: 'api_login', label: 'API Login Key', placeholder: 'ecc029dc...', sensitive: true },
  { key: 'base_url', label: 'Base URL', placeholder: 'https://api-eu.syrve.live/api/1' },
  { key: 'organization_id', label: 'Organization ID', placeholder: 'Auto-discovered on first sync' },
  { key: 'store_id', label: 'Store ID', placeholder: 'Optional — for multi-store setups' },
  { key: 'default_tax_category_id', label: 'Default Tax Category ID', placeholder: 'Discovered from Syrve catalog' },
  { key: 'vat_rate', label: 'VAT Rate (%)', placeholder: '7' },
]

export function SyrveConfigPanel({
  config,
  setConfig,
  isLoading,
  isSaving,
  isRunningPoc,
  error,
  success,
  onSave,
  onRunPoc,
}: Props) {
  const [showSensitive, setShowSensitive] = useState(false)

  if (isLoading) {
    return <div className="h-64 animate-pulse rounded-xl bg-slate-800/50" />
  }

  return (
    <div className="space-y-4 rounded-xl border border-slate-700/50 bg-slate-800/30 p-4">
      <div className="flex items-center gap-2">
        <Settings className="h-4 w-4 text-sky-400" />
        <h3 className="text-sm font-bold text-slate-100">Syrve Integration</h3>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
          {success}
        </div>
      )}

      <div className="space-y-3">
        {FIELDS.map(({ key, label, placeholder, sensitive }) => (
          <div key={key}>
            <label className="mb-1 block text-[11px] text-slate-500">{label}</label>
            <input
              type={sensitive && !showSensitive ? 'password' : 'text'}
              value={config[key]}
              onChange={(e) => setConfig((prev) => ({ ...prev, [key]: e.target.value }))}
              placeholder={placeholder}
              className="h-9 w-full rounded-md border border-slate-700 bg-slate-800 px-3 text-xs text-slate-100 outline-none focus:border-sky-500"
            />
          </div>
        ))}

        <label className="flex items-center gap-2 text-[11px] text-slate-500">
          <input
            type="checkbox"
            checked={showSensitive}
            onChange={(e) => setShowSensitive(e.target.checked)}
            className="rounded border-slate-600"
          />
          Show API key
        </label>
      </div>

      <div className="space-y-2 pt-2">
        <button
          onClick={() => onSave(config)}
          disabled={isSaving}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-sky-600 py-2.5 text-xs font-semibold text-white transition hover:bg-sky-500 active:scale-[0.99] disabled:opacity-50"
        >
          {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          {isSaving ? 'Saving...' : 'Save Configuration'}
        </button>

        <button
          onClick={onRunPoc}
          disabled={isRunningPoc || !config.api_login}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 py-2.5 text-xs font-semibold text-white transition hover:bg-emerald-500 active:scale-[0.99] disabled:opacity-50"
        >
          {isRunningPoc ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
          {isRunningPoc ? 'Running PoC...' : 'Run Syrve PoC — Test Connection & Match'}
        </button>
      </div>
    </div>
  )
}
