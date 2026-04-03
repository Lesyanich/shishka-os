import { useState, useCallback } from 'react'
import { SupplierManager } from '../components/procurement/SupplierManager'
import { PurchaseForm } from '../components/procurement/PurchaseForm'
import { PurchaseHistory } from '../components/procurement/PurchaseHistory'
import { PurchaseOrderForm } from '../components/procurement/PurchaseOrderForm'
import { POHistory } from '../components/procurement/POHistory'
import { PODetail } from '../components/procurement/PODetail'
import { ReconciliationPanel } from '../components/procurement/ReconciliationPanel'
import { usePurchaseOrders } from '../hooks/usePurchaseOrders'
import type { PurchaseOrder } from '../types/procurement'

type Tab = 'purchases' | 'orders'
type Screen = 'list' | 'detail' | 'reconcile'

export function Procurement() {
  const [activeTab, setActiveTab] = useState<Tab>('orders')
  const [refreshKey, setRefreshKey] = useState(0)
  const [screen, setScreen] = useState<Screen>('list')
  const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null)

  const {
    orders, isLoading, statusFilter, setStatusFilter,
    createPO, isCreating, updateStatus, fetchLines, refetch,
  } = usePurchaseOrders()

  const handlePOCreated = useCallback(() => {
    refetch()
  }, [refetch])

  const handleSelectPO = useCallback((po: PurchaseOrder) => {
    setSelectedPO(po)
    setScreen('detail')
  }, [])

  const handleBackToList = useCallback(() => {
    setSelectedPO(null)
    setScreen('list')
    refetch()
  }, [refetch])

  const handleReconcile = useCallback((po: PurchaseOrder) => {
    setSelectedPO(po)
    setScreen('reconcile')
  }, [])

  const handleReconciled = useCallback(() => {
    setSelectedPO(null)
    setScreen('list')
    refetch()
  }, [refetch])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-100">Procurement</h1>
        <p className="mt-1 text-sm text-slate-500">
          Manage purchase orders, log purchases, and track suppliers.
        </p>
      </div>

      {/* Tab switcher — hidden during detail/reconcile views */}
      {screen === 'list' && (
        <div className="flex gap-1 rounded-xl bg-slate-800/60 p-1">
          {([
            { key: 'orders' as Tab, label: 'Purchase Orders' },
            { key: 'purchases' as Tab, label: 'Quick Purchase' },
          ]).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => { setActiveTab(key); setSelectedPO(null) }}
              className={[
                'flex-1 rounded-lg py-2.5 text-xs font-semibold transition',
                activeTab === key
                  ? 'bg-slate-700 text-slate-100 shadow-sm'
                  : 'text-slate-500 hover:text-slate-300',
              ].join(' ')}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* === Purchase Orders Tab — List === */}
      {activeTab === 'orders' && screen === 'list' && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,0.45fr)_minmax(0,0.55fr)]">
          <div className="space-y-6">
            <PurchaseOrderForm
              createPO={createPO}
              isCreating={isCreating}
              onCreated={handlePOCreated}
            />
            <SupplierManager />
          </div>
          <POHistory
            orders={orders}
            isLoading={isLoading}
            statusFilter={statusFilter}
            onFilterChange={setStatusFilter}
            onSelect={handleSelectPO}
          />
        </div>
      )}

      {/* === PO Detail === */}
      {screen === 'detail' && selectedPO && (
        <PODetail
          order={selectedPO}
          onBack={handleBackToList}
          fetchLines={fetchLines}
          updateStatus={updateStatus}
          onReconcile={handleReconcile}
        />
      )}

      {/* === Reconciliation === */}
      {screen === 'reconcile' && selectedPO && (
        <ReconciliationPanel
          order={selectedPO}
          onBack={() => { setScreen('detail') }}
          onReconciled={handleReconciled}
        />
      )}

      {/* === Quick Purchase Tab (legacy) === */}
      {activeTab === 'purchases' && screen === 'list' && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,0.45fr)_minmax(0,0.55fr)]">
          <div className="space-y-6">
            <PurchaseForm
              onPurchaseCreated={() => setRefreshKey((k) => k + 1)}
            />
            <SupplierManager />
          </div>
          <PurchaseHistory refreshKey={refreshKey} />
        </div>
      )}
    </div>
  )
}
