import { Loader2, RefreshCw, ShoppingCart, Tag, Zap } from 'lucide-react'

interface SyncLogEntry {
  id: string
  sync_type: string
  status: string
  records_total: number
  records_synced: number
  records_failed: number
  error_message: string | null
  started_at: string
  completed_at: string | null
}

interface SyncResult {
  ok: boolean
  error?: string
  total?: number
  synced?: number
  failed?: number
  message?: string
}

interface Props {
  isLoading: boolean
  syncLogs: SyncLogEntry[]
  lastResult: SyncResult | null
  error: string | null
  onSyncCategories: () => Promise<void>
  onSyncItems: () => Promise<void>
  onFullSync: () => Promise<void>
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    success: 'bg-emerald-500/20 text-emerald-300',
    error: 'bg-red-500/20 text-red-300',
    pending: 'bg-amber-500/20 text-amber-300',
  }
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${colors[status] ?? 'bg-slate-700 text-slate-400'}`}
    >
      {status}
    </span>
  )
}

function formatDate(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function LoyverseConfigPanel({
  isLoading,
  syncLogs,
  lastResult,
  error,
  onSyncCategories,
  onSyncItems,
  onFullSync,
}: Props) {
  const lastSuccess = syncLogs.find((l) => l.status === 'success')

  return (
    <div className="space-y-4 rounded-xl border border-slate-700/50 bg-slate-800/30 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShoppingCart className="h-4 w-4 text-emerald-400" />
          <h3 className="text-sm font-bold text-slate-100">Loyverse POS</h3>
        </div>
        <div className="flex items-center gap-1.5">
          <div
            className={`h-2 w-2 rounded-full ${lastSuccess ? 'bg-emerald-400' : 'bg-slate-600'}`}
          />
          <span className="text-[10px] text-slate-500">
            {lastSuccess ? `Synced ${formatDate(lastSuccess.started_at)}` : 'Not synced'}
          </span>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {error}
        </div>
      )}

      {/* Last result */}
      {lastResult && lastResult.ok && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
          {lastResult.message ?? `Synced ${lastResult.synced ?? 0} / ${lastResult.total ?? 0}`}
          {(lastResult.failed ?? 0) > 0 && (
            <span className="text-amber-300"> ({lastResult.failed} failed)</span>
          )}
        </div>
      )}

      {/* Sync buttons */}
      <div className="space-y-2">
        <button
          onClick={onSyncCategories}
          disabled={isLoading}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-700 py-2.5 text-xs font-semibold text-slate-100 transition hover:bg-slate-600 active:scale-[0.99] disabled:opacity-50"
        >
          {isLoading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Tag className="h-3.5 w-3.5" />
          )}
          Sync Categories
        </button>

        <button
          onClick={onSyncItems}
          disabled={isLoading}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-700 py-2.5 text-xs font-semibold text-slate-100 transition hover:bg-slate-600 active:scale-[0.99] disabled:opacity-50"
        >
          {isLoading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          Sync Menu Items
        </button>

        <button
          onClick={onFullSync}
          disabled={isLoading}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 py-2.5 text-xs font-semibold text-white transition hover:bg-emerald-500 active:scale-[0.99] disabled:opacity-50"
        >
          {isLoading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Zap className="h-3.5 w-3.5" />
          )}
          {isLoading ? 'Syncing...' : 'Full Sync — Categories + Items'}
        </button>
      </div>

      {/* Sync log */}
      {syncLogs.length > 0 && (
        <div className="space-y-1">
          <h4 className="text-[11px] font-medium text-slate-500">Recent syncs</h4>
          <div className="max-h-48 overflow-y-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-left text-slate-500">
                  <th className="pb-1 font-medium">Date</th>
                  <th className="pb-1 font-medium">Type</th>
                  <th className="pb-1 font-medium">Status</th>
                  <th className="pb-1 text-right font-medium">Result</th>
                </tr>
              </thead>
              <tbody className="text-slate-300">
                {syncLogs.map((log) => (
                  <tr key={log.id} className="border-t border-slate-800">
                    <td className="py-1">{formatDate(log.started_at)}</td>
                    <td className="py-1">{log.sync_type.replace('_push', '')}</td>
                    <td className="py-1">
                      <StatusBadge status={log.status} />
                    </td>
                    <td className="py-1 text-right">
                      {log.records_synced}/{log.records_total}
                      {log.records_failed > 0 && (
                        <span className="text-red-400"> ({log.records_failed}!)</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
