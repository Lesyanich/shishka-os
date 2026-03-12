import { useState } from 'react'
import { ScanLine } from 'lucide-react'
import { useBatches } from '../hooks/useBatches'
import { useStockTransfer } from '../hooks/useStockTransfer'
import { TransferTab } from '../components/logistics/TransferTab'
import { UnpackTab } from '../components/logistics/UnpackTab'

type Tab = 'transfer' | 'unpack'

export function LogisticsScanner() {
  const [activeTab, setActiveTab] = useState<Tab>('transfer')
  const { batches, isLoading, error, openBatch } = useBatches()
  const { transferBatch, isTransferring, lastTransfer } = useStockTransfer()

  return (
    <div className="mx-auto max-w-lg space-y-6">
      {/* Header */}
      <div className="text-center">
        <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-sky-500/10">
          <ScanLine className="h-6 w-6 text-sky-400" />
        </div>
        <h1 className="text-lg font-bold text-slate-100">Logistics Scanner</h1>
        <p className="text-xs text-slate-500">
          Transfer batches & open containers
        </p>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 rounded-xl bg-slate-800/60 p-1">
        {(['transfer', 'unpack'] as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={[
              'flex-1 rounded-lg py-2.5 text-xs font-semibold transition',
              activeTab === tab
                ? 'bg-slate-700 text-slate-100 shadow-sm'
                : 'text-slate-500 hover:text-slate-300',
            ].join(' ')}
          >
            {tab === 'transfer' ? 'Transfer' : 'Unpack'}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-4 text-center text-sm text-rose-300">
          {error}
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 2 }, (_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-slate-800/50" />
          ))}
        </div>
      )}

      {/* Tab content */}
      {!isLoading && activeTab === 'transfer' && (
        <TransferTab
          onTransfer={transferBatch}
          isTransferring={isTransferring}
          lastTransfer={lastTransfer}
        />
      )}

      {!isLoading && activeTab === 'unpack' && (
        <UnpackTab
          batches={batches}
          onOpenBatch={openBatch}
        />
      )}
    </div>
  )
}
