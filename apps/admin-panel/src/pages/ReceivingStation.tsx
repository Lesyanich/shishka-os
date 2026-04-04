import { useState, useCallback } from 'react'
import { ClipboardCheck } from 'lucide-react'
import { useReceiving } from '../hooks/useReceiving'
import { PendingDeliveries } from '../components/receiving/PendingDeliveries'
import { ReceivingChecklist } from '../components/receiving/ReceivingChecklist'
import { ReceivingSummary } from '../components/receiving/ReceivingSummary'
import type {
  PendingDelivery,
  ReceivingLineInput,
  ReceiveGoodsResult,
} from '../types/procurement'

type Screen = 'list' | 'checklist' | 'summary'

export function ReceivingStation() {
  const { deliveries, isLoading, error, refetch, receiveGoods, isSubmitting } = useReceiving()
  const [screen, setScreen] = useState<Screen>('list')
  const [selectedPO, setSelectedPO] = useState<PendingDelivery | null>(null)
  const [lastResult, setLastResult] = useState<ReceiveGoodsResult | null>(null)

  const handleSelect = useCallback((delivery: PendingDelivery) => {
    setSelectedPO(delivery)
    setScreen('checklist')
  }, [])

  const handleBack = useCallback(() => {
    setSelectedPO(null)
    setScreen('list')
  }, [])

  const handleComplete = useCallback(
    async (lines: ReceivingLineInput[]) => {
      if (!selectedPO) return

      const result = await receiveGoods({
        po_id: selectedPO.po_id,
        notes: null,
        lines,
      })

      if (result.ok) {
        setLastResult(result)
        setScreen('summary')
        refetch()
      } else {
        alert(result.error ?? 'Receiving failed')
      }
    },
    [selectedPO, receiveGoods, refetch],
  )

  const handleDone = useCallback(() => {
    setScreen('list')
    setSelectedPO(null)
    setLastResult(null)
  }, [])

  return (
    <div className="mx-auto max-w-lg space-y-6">
      {/* Header (only on list screen) */}
      {screen === 'list' && (
        <div className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-sky-500/10">
            <ClipboardCheck className="h-6 w-6 text-sky-400" />
          </div>
          <h1 className="text-lg font-bold text-slate-100">Receiving Station</h1>
          <p className="text-xs text-slate-500">
            Check incoming deliveries against purchase orders
          </p>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-4 text-center text-sm text-rose-300">
          {error}
        </div>
      )}

      {/* Loading state */}
      {isLoading && screen === 'list' && (
        <div className="space-y-3">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-slate-800/50" />
          ))}
        </div>
      )}

      {/* Screen router */}
      {!isLoading && screen === 'list' && (
        <PendingDeliveries deliveries={deliveries} onSelect={handleSelect} />
      )}

      {screen === 'checklist' && selectedPO && (
        <ReceivingChecklist
          delivery={selectedPO}
          onBack={handleBack}
          onComplete={handleComplete}
          isSubmitting={isSubmitting}
        />
      )}

      {screen === 'summary' && lastResult && selectedPO && (
        <ReceivingSummary
          result={lastResult}
          poNumber={selectedPO.po_number}
          onDone={handleDone}
        />
      )}
    </div>
  )
}
