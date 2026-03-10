import { useState } from 'react'
import { SupplierManager } from '../components/procurement/SupplierManager'
import { PurchaseForm } from '../components/procurement/PurchaseForm'
import { PurchaseHistory } from '../components/procurement/PurchaseHistory'

export function Procurement() {
  // refreshKey increments to trigger PurchaseHistory reload after new purchase
  const [refreshKey, setRefreshKey] = useState(0)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-100">Procurement</h1>
        <p className="mt-1 text-sm text-slate-500">
          Log purchases, manage suppliers, and auto-update ingredient costs.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,0.45fr)_minmax(0,0.55fr)]">
        {/* Left column: Purchase Form + Supplier Manager */}
        <div className="space-y-6">
          <PurchaseForm
            onPurchaseCreated={() => setRefreshKey((k) => k + 1)}
          />
          <SupplierManager />
        </div>

        {/* Right column: Purchase History */}
        <PurchaseHistory refreshKey={refreshKey} />
      </div>
    </div>
  )
}
