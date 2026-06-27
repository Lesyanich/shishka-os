import { useState, useCallback } from 'react'
import { SupplierManager } from '../components/procurement/SupplierManager'
import { PurchaseForm } from '../components/procurement/PurchaseForm'
import { PurchaseHistory } from '../components/procurement/PurchaseHistory'
import { PurchaseOrderForm } from '../components/procurement/PurchaseOrderForm'
import { POHistory } from '../components/procurement/POHistory'
import { PODetail } from '../components/procurement/PODetail'
import { ReconciliationPanel } from '../components/procurement/ReconciliationPanel'
import { StockRequestsPanel, type PrefillLine } from '../components/procurement/StockRequestsPanel'
import { StockSheetCuration } from '../components/procurement/StockSheetCuration'
import { PriceBook } from '../components/procurement/PriceBook'
import { ShelfLifeEditor } from '../components/procurement/ShelfLifeEditor'
import { StockPanel } from '../components/procurement/StockPanel'
import { usePurchaseOrders } from '../hooks/usePurchaseOrders'
import { useTabParam } from '../hooks/useTabParam'
import type { PurchaseOrder } from '../types/procurement'

const TABS = ['orders', 'suppliers', 'pricebook', 'shelf', 'stock', 'requests', 'items', 'purchases'] as const
type Tab = (typeof TABS)[number]
type Screen = 'list' | 'detail' | 'reconcile'

const TAB_LABELS: Record<Tab, string> = {
  orders: 'Purchase Orders',
  suppliers: 'Suppliers',
  pricebook: 'Price Book',
  shelf: 'Shelf Life',
  stock: 'Stock',
  requests: 'Stock Requests',
  items: 'Sheet Items',
  purchases: 'Quick Purchase',
}

export function Procurement() {
  const [activeTab, setActiveTab] = useTabParam(TABS, 'orders')
  const [refreshKey, setRefreshKey] = useState(0)
  const [screen, setScreen] = useState<Screen>('list')
  const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null)
  const [poPrefill, setPoPrefill] = useState<{ lines: PrefillLine[]; notes: string } | null>(null)

  const handleAddToPO = useCallback((lines: PrefillLine[], notes: string) => {
    setPoPrefill({ lines, notes })
    setActiveTab('orders')
    setScreen('list')
  }, [setActiveTab])

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
          Suppliers, price comparison, shelf life, purchase orders &amp; stock — in one place.
        </p>
      </div>

      {/* Tab switcher — hidden during detail/reconcile views */}
      {screen === 'list' && (
        <div className="flex flex-wrap gap-1 rounded-xl bg-slate-800/60 p-1">
          {TABS.map((key) => (
            <button
              key={key}
              onClick={() => { setActiveTab(key); setSelectedPO(null) }}
              className={[
                'rounded-lg px-3 py-2 text-xs font-semibold transition',
                activeTab === key
                  ? 'bg-slate-700 text-slate-100 shadow-sm'
                  : 'text-slate-500 hover:text-slate-300',
              ].join(' ')}
            >
              {TAB_LABELS[key]}
            </button>
          ))}
        </div>
      )}

      {/* === Purchase Orders Tab — List === */}
      {activeTab === 'orders' && screen === 'list' && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,0.45fr)_minmax(0,0.55fr)]">
          <PurchaseOrderForm
            createPO={createPO}
            isCreating={isCreating}
            onCreated={handlePOCreated}
            initialLines={poPrefill?.lines}
            initialNotes={poPrefill?.notes}
          />
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

      {/* === Suppliers Tab === */}
      {activeTab === 'suppliers' && screen === 'list' && <SupplierManager />}

      {/* === Price Book Tab === */}
      {activeTab === 'pricebook' && screen === 'list' && <PriceBook />}

      {/* === Shelf Life Tab === */}
      {activeTab === 'shelf' && screen === 'list' && <ShelfLifeEditor />}

      {/* === Stock & Reorder Tab === */}
      {activeTab === 'stock' && screen === 'list' && <StockPanel onAddToPO={handleAddToPO} />}

      {/* === Stock Requests Tab === */}
      {activeTab === 'requests' && screen === 'list' && (
        <div className="mx-auto max-w-2xl">
          <StockRequestsPanel onAddToPO={handleAddToPO} />
        </div>
      )}

      {/* === Sheet Items (curation) Tab === */}
      {activeTab === 'items' && screen === 'list' && (
        <div className="mx-auto max-w-2xl">
          <StockSheetCuration />
        </div>
      )}

      {/* === Quick Purchase Tab (legacy) === */}
      {activeTab === 'purchases' && screen === 'list' && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,0.45fr)_minmax(0,0.55fr)]">
          <PurchaseForm
            onPurchaseCreated={() => setRefreshKey((k) => k + 1)}
          />
          <PurchaseHistory refreshKey={refreshKey} />
        </div>
      )}
    </div>
  )
}
