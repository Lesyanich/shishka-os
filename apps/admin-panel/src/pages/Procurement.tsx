import { useState, useCallback, useMemo, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
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
  const [searchParams, setSearchParams] = useSearchParams()
  // The open order lives in the URL (`?tab=orders&po=<uuid>`), not in state, so
  // an order can be bookmarked, shared with the other side and reopened by the
  // back button. It also stays reachable once archived, which is the whole
  // difference between "hidden" and "lost".
  // Still the ID and not the row: the detail screen must follow the live order,
  // so a confirm or ship by the other side moves the status, totals and edit
  // gate while it is open.
  const selectedPOId = searchParams.get('po')
  // Reconcile is a sub-screen of an open order, so it is the only screen state
  // left — 'list' vs 'detail' is now a function of the URL.
  const [reconciling, setReconciling] = useState(false)
  const screen: Screen = selectedPOId ? (reconciling ? 'reconcile' : 'detail') : 'list'
  // Last known copy, so the screen survives the row dropping out of the list
  // (status filter, the 100-row window) instead of blanking mid-edit.
  const [selectedPOFallback, setSelectedPOFallback] = useState<PurchaseOrder | null>(null)

  /** Open/close the detail screen by writing the id into the URL. */
  const setSelectedPOId = useCallback(
    (next: string | null) => {
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev)
          if (next) params.set('po', next)
          else params.delete('po')
          return params
        },
        { replace: false },
      )
    },
    [setSearchParams],
  )
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
      setSelectedPOId(null)
    },
    [setActiveTab, setSelectedPOId],
  )

  const {
    orders,
    isLoading,
    createPO,
    isCreating,
    updateStatus,
    updatePO,
    deletePO,
    archivePO,
    fetchOrderById,
    showArchived,
    setShowArchived,
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

  // Deep link: `?po=<uuid>` for an order the list does not carry — older than
  // the 100-row window, or archived. Without this the URL resolves to a blank
  // screen and a shared link is worthless.
  useEffect(() => {
    if (!selectedPOId || selectedPO || isLoading) return
    let cancelled = false
    fetchOrderById(selectedPOId).then((po) => {
      if (cancelled) return
      // Still nothing: the order was deleted, or the id is junk. Drop the param
      // rather than leaving the user on an empty detail screen.
      if (po) setSelectedPOFallback(po)
      else setSelectedPOId(null)
    })
    return () => {
      cancelled = true
    }
  }, [selectedPOId, selectedPO, isLoading, fetchOrderById, setSelectedPOId])

  const handlePOCreated = useCallback(() => {
    // Brand-new row with joined fields we cannot build locally — refetch, but
    // silently: the list is already on screen and a spinner over populated
    // data is the flicker RULE-REALTIME-LIST-HOOK exists to prevent.
    refetch({ silent: true })
  }, [refetch])

  const handleSelectPO = useCallback(
    (po: PurchaseOrder) => {
      // Opening an order clears its NEW badge for this browser.
      setSeenIds(markPOSeen(po.id))
      setReconciling(false)
      setSelectedPOFallback(po)
      setSelectedPOId(po.id)
    },
    [setSelectedPOId],
  )

  const handleBackToList = useCallback(() => {
    setReconciling(false)
    setSelectedPOFallback(null)
    setSelectedPOId(null)
    // The row was already patched by updatePO/updateStatus and the coalesced
    // realtime subscription reconciles the rest — this is a belt-and-braces
    // reconcile, so it must not flash a spinner.
    refetch({ silent: true })
  }, [refetch, setSelectedPOId])

  const handleReconcile = useCallback(
    (po: PurchaseOrder) => {
      setSelectedPOFallback(po)
      setSelectedPOId(po.id)
      setReconciling(true)
    },
    [setSelectedPOId],
  )

  const handleReconciled = useCallback(() => {
    setReconciling(false)
    setSelectedPOFallback(null)
    setSelectedPOId(null)
    refetch({ silent: true })
  }, [refetch, setSelectedPOId])

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

  /** Draft deleted → the order no longer exists, so leave the detail screen. */
  const handleDeletePO = useCallback(
    async (poId: string) => {
      const result = await deletePO(poId)
      if (!result.ok) return result
      setSelectedPOFallback(null)
      setSelectedPOId(null)
      return result
    },
    [deletePO, setSelectedPOId],
  )

  /** Archiving only hides the card; stay put so the result is visible. */
  const handleArchivePO = useCallback(
    async (poId: string, archived: boolean) => {
      const result = await archivePO(poId, archived)
      if (result.ok) setSelectedPOFallback((prev) =>
        prev && prev.id === poId
          ? { ...prev, archived_at: archived ? new Date().toISOString() : null }
          : prev,
      )
      return result
    },
    [archivePO],
  )

  /** Supplier's digitized catalog = Price Book filtered to them (Phase C adds the filter UI). */
  const handleOpenSupplierCatalog = useCallback(
    (supplierId: string) => {
      setReconciling(false)
      setActiveTab('pricebook')
      navigate(`/procurement?tab=pricebook&supplier=${supplierId}`)
    },
    [navigate, setActiveTab],
  )

  const handleOpenSupplierCard = useCallback(
    (supplierId: string) => {
      setReconciling(false)
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
        <label className="flex items-center gap-2 text-[11px] text-cream/45">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
            className="h-3.5 w-3.5 accent-gold"
          />
          Show archived orders
        </label>
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
          onDelete={handleDeletePO}
          onArchive={handleArchivePO}
        />
      )}

      {/* === Reconciliation === */}
      {screen === 'reconcile' && selectedPO && (
        <ReconciliationPanel
          order={selectedPO}
          onBack={() => {
            setReconciling(false)
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
