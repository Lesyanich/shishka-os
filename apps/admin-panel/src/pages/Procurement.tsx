import { useState, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { SupplierManager } from '../components/procurement/SupplierManager'
import { PurchaseOrderForm } from '../components/procurement/PurchaseOrderForm'
import { POHistory } from '../components/procurement/POHistory'
import { PODetail } from '../components/procurement/PODetail'
import { ReconciliationPanel } from '../components/procurement/ReconciliationPanel'
import { StockRequestsPanel, type PrefillLine } from '../components/procurement/StockRequestsPanel'
import { PriceBook } from '../components/procurement/PriceBook'
import { usePurchaseOrders, loadSeenPOs, markPOSeen } from '../hooks/usePurchaseOrders'
import { useTabParam } from '../hooks/useTabParam'
import type { PurchaseOrder } from '../types/procurement'

/**
 * v2 tab set (spec §2.5). Stock / Sheet Items / Quick Purchase retired here —
 * superseded by the connected-stock epic and by the order → receipt → expense
 * chain; Shelf Life moves to /menu under its own task. Catalog and Catalog
 * Inbox land with Phases D and C.
 */
const TABS = ['orders', 'requests', 'suppliers', 'pricebook'] as const
type Tab = (typeof TABS)[number]
type Screen = 'list' | 'detail' | 'reconcile'

const TAB_LABELS: Record<Tab, string> = {
  orders: 'Orders',
  requests: 'Requests',
  suppliers: 'Suppliers',
  pricebook: 'Price Book',
}

export function Procurement() {
  const [activeTab, setActiveTab] = useTabParam(TABS, 'orders')
  const [screen, setScreen] = useState<Screen>('list')
  // Hold the ID, not the row. The detail screen must follow the live order —
  // if the other side confirms or ships it while it is open, the status,
  // totals and the edit gate have to move with it.
  const [selectedPOId, setSelectedPOId] = useState<string | null>(null)
  // Last known copy, so the screen survives the row dropping out of the list
  // (status filter, the 100-row window) instead of blanking mid-edit.
  const [selectedPOFallback, setSelectedPOFallback] = useState<PurchaseOrder | null>(null)
  const [poPrefill, setPoPrefill] = useState<{ lines: PrefillLine[]; notes: string } | null>(null)
  const [seenIds, setSeenIds] = useState<Set<string>>(() => loadSeenPOs())
  const [busyId, setBusyId] = useState<string | null>(null)
  /** Failure of a desk-level action (Submit) — the cards have no error surface. */
  const [actionError, setActionError] = useState<string | null>(null)
  const navigate = useNavigate()

  const handleAddToPO = useCallback(
    (lines: PrefillLine[], notes: string) => {
      setPoPrefill({ lines, notes })
      setActiveTab('orders')
      setScreen('list')
    },
    [setActiveTab],
  )

  const {
    orders,
    isLoading,
    createPO,
    isCreating,
    updateStatus,
    updatePO,
    fetchLines,
    fetchLinkedReceipts,
    parseLinkedReceipt,
    attachReceipt,
    fetchReceivedSummary,
    stations,
    myUserId,
    myName,
    refetch,
  } = usePurchaseOrders()

  /** The live row wins; the snapshot only covers it disappearing from the list. */
  const selectedPO = useMemo(
    () => orders.find((o) => o.id === selectedPOId) ?? selectedPOFallback,
    [orders, selectedPOId, selectedPOFallback],
  )

  const handlePOCreated = useCallback(() => {
    // Brand-new row with joined fields we cannot build locally — refetch, but
    // silently: the list is already on screen and a spinner over populated
    // data is the flicker RULE-REALTIME-LIST-HOOK exists to prevent.
    refetch({ silent: true })
  }, [refetch])

  const handleSelectPO = useCallback((po: PurchaseOrder) => {
    // Opening an order clears its NEW badge for this browser.
    setSeenIds(markPOSeen(po.id))
    setSelectedPOId(po.id)
    setSelectedPOFallback(po)
    setScreen('detail')
  }, [])

  const handleBackToList = useCallback(() => {
    setSelectedPOId(null)
    setSelectedPOFallback(null)
    setScreen('list')
    // The row was already patched by updatePO/updateStatus and the coalesced
    // realtime subscription reconciles the rest — this is a belt-and-braces
    // reconcile, so it must not flash a spinner.
    refetch({ silent: true })
  }, [refetch])

  const handleReconcile = useCallback((po: PurchaseOrder) => {
    setSelectedPOId(po.id)
    setSelectedPOFallback(po)
    setScreen('reconcile')
  }, [])

  const handleReconciled = useCallback(() => {
    setSelectedPOId(null)
    setSelectedPOFallback(null)
    setScreen('list')
    refetch({ silent: true })
  }, [refetch])

  /** Hand a draft over to the other side straight from the desk. */
  const handleSubmitDraft = useCallback(
    async (po: PurchaseOrder) => {
      setBusyId(po.id)
      setActionError(null)
      const ok = await updateStatus(po.id, 'submitted')
      setBusyId(null)
      // Without this the card just stayed in Draft with no explanation — the
      // handover silently never happened.
      if (!ok) setActionError(`Could not submit ${po.po_number}. Check the connection and retry.`)
    },
    [updateStatus],
  )

  const handleReceive = useCallback(
    (po: PurchaseOrder) => {
      navigate(`/receive?po=${po.id}`)
    },
    [navigate],
  )

  /** Supplier's digitized catalog = Price Book filtered to them (Phase C adds the filter UI). */
  const handleOpenSupplierCatalog = useCallback(
    (supplierId: string) => {
      setScreen('list')
      setActiveTab('pricebook')
      navigate(`/procurement?tab=pricebook&supplier=${supplierId}`)
    },
    [navigate, setActiveTab],
  )

  const handleOpenSupplierCard = useCallback(
    (supplierId: string) => {
      setScreen('list')
      setActiveTab('suppliers')
      navigate(`/procurement?tab=suppliers&supplier=${supplierId}`)
    },
    [navigate, setActiveTab],
  )

  return (
    <div className="menu-canvas -mx-4 space-y-6 px-4 pt-5 pb-10 sm:-mx-6 sm:px-6">
      <div className="flex items-start gap-3.5">
        <span className="shk-seal" aria-hidden>
          S
        </span>
        <div>
          <div className="shk-eyebrow">Procurement &middot; sourcing</div>
          <h1 className="mt-1 font-display text-4xl font-bold leading-none tracking-tight text-cream">
            Procurement
          </h1>
          <p className="mt-1.5 text-sm text-cream/45">
            Build an order, hand it over, receive it &mdash; with suppliers and prices in one place.
          </p>
        </div>
      </div>

      {/* Tab switcher — hidden during detail/reconcile views */}
      {screen === 'list' && (
        <div className="shk-seg flex flex-wrap" role="group" aria-label="Procurement section">
          {TABS.map((key) => (
            <button
              key={key}
              onClick={() => {
                setActiveTab(key)
                setSelectedPOId(null)
                setSelectedPOFallback(null)
              }}
              className="shk-seg-btn"
              aria-pressed={activeTab === key}
            >
              {TAB_LABELS[key]}
            </button>
          ))}
        </div>
      )}

      {/* === Orders Tab — Order Desk === */}
      {activeTab === 'orders' && screen === 'list' && actionError && (
        <div
          role="alert"
          className="rounded-xl border border-brick-soft/40 bg-brick-soft/10 px-3 py-2 text-[11px] text-brick-bright"
        >
          {actionError}
        </div>
      )}

      {activeTab === 'orders' && screen === 'list' && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,0.58fr)_minmax(0,0.42fr)]">
          <POHistory
            orders={orders}
            isLoading={isLoading}
            onSelect={handleSelectPO}
            myUserId={myUserId}
            seenIds={seenIds}
            onSubmitDraft={handleSubmitDraft}
            onReceive={handleReceive}
            busyId={busyId}
          />
          <PurchaseOrderForm
            createPO={createPO}
            isCreating={isCreating}
            onCreated={handlePOCreated}
            initialLines={poPrefill?.lines}
            initialNotes={poPrefill?.notes}
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
          updatePO={updatePO}
          fetchLinkedReceipts={fetchLinkedReceipts}
          parseLinkedReceipt={parseLinkedReceipt}
          attachReceipt={attachReceipt}
          fetchReceivedSummary={fetchReceivedSummary}
          stations={stations}
          myName={myName}
          onReconcile={handleReconcile}
          onReceive={handleReceive}
          onOpenSupplierCatalog={handleOpenSupplierCatalog}
          onOpenSupplierCard={handleOpenSupplierCard}
        />
      )}

      {/* === Reconciliation === */}
      {screen === 'reconcile' && selectedPO && (
        <ReconciliationPanel
          order={selectedPO}
          onBack={() => {
            setScreen('detail')
          }}
          onReconciled={handleReconciled}
          fetchLinkedReceipts={fetchLinkedReceipts}
        />
      )}

      {/* === Requests Tab === */}
      {activeTab === 'requests' && screen === 'list' && (
        <div className="mx-auto max-w-2xl">
          <StockRequestsPanel onAddToPO={handleAddToPO} />
        </div>
      )}

      {/* === Suppliers Tab === */}
      {activeTab === 'suppliers' && screen === 'list' && <SupplierManager />}

      {/* === Price Book Tab === */}
      {activeTab === 'pricebook' && screen === 'list' && <PriceBook />}
    </div>
  )
}
