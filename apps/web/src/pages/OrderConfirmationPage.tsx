import { Link, useLocation, useParams } from 'react-router-dom'

// Static confirmation: shows the code the customer presents at the cashier.
// Live status tracking for the customer is a follow-up (needs a public
// status-by-code endpoint — anon cannot read the orders table directly).
export default function OrderConfirmationPage() {
  const { code } = useParams<{ code: string }>()
  const { state } = useLocation() as { state: { total?: number } | null }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
      <p className="text-cream/60">Your order is in</p>
      <p className="font-display text-cream text-6xl my-4 tracking-wide">{code}</p>
      {state?.total != null && (
        <p className="font-mono text-amber-watch mb-6">฿{state.total.toLocaleString()}</p>
      )}
      <div className="rounded-xl bg-surface-2 p-5 max-w-xs">
        <p className="text-cream">Show this code at the cashier to pay and collect your order.</p>
      </div>
      <Link to="/" className="mt-8 text-forest-soft underline">
        Back to menu
      </Link>
    </div>
  )
}
