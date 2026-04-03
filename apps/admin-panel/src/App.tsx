import { lazy, Suspense } from 'react'
import * as Sentry from '@sentry/react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import { AppShell } from './layouts/AppShell'
import { Loader2 } from 'lucide-react'

// Static — always in main bundle (login + first screen)
import { LoginPage } from './pages/LoginPage'
import { ControlCenter } from './pages/ControlCenter'

// Lazy — loaded on-demand per route
const BOMHub = lazy(() => import('./pages/BOMHub').then(m => ({ default: m.BOMHub })))
const KDSBoard = lazy(() => import('./pages/KDSBoard').then(m => ({ default: m.KDSBoard })))
const CookStation = lazy(() => import('./pages/CookStation').then(m => ({ default: m.CookStation })))
const WasteTracker = lazy(() => import('./pages/WasteTracker').then(m => ({ default: m.WasteTracker })))
const LogisticsScanner = lazy(() => import('./pages/LogisticsScanner').then(m => ({ default: m.LogisticsScanner })))
const Procurement = lazy(() => import('./pages/Procurement').then(m => ({ default: m.Procurement })))
const SkuManagerPage = lazy(() => import('./pages/SkuManagerPage').then(m => ({ default: m.SkuManagerPage })))
const OrderManager = lazy(() => import('./pages/OrderManager').then(m => ({ default: m.OrderManager })))
const MasterPlanner = lazy(() => import('./pages/MasterPlanner').then(m => ({ default: m.MasterPlanner })))
const FinanceLayout = lazy(() => import('./pages/FinanceLayout').then(m => ({ default: m.FinanceLayout })))
const FinanceLedger = lazy(() => import('./pages/FinanceLedger').then(m => ({ default: m.FinanceLedger })))
const FinanceEntry = lazy(() => import('./pages/FinanceEntry').then(m => ({ default: m.FinanceEntry })))
const FinanceAnalytics = lazy(() => import('./pages/FinanceAnalytics').then(m => ({ default: m.FinanceAnalytics })))
const ReceivingStation = lazy(() => import('./pages/ReceivingStation').then(m => ({ default: m.ReceivingStation })))
const Settings = lazy(() => import('./pages/Settings').then(m => ({ default: m.Settings })))
const KitchenDashboard = lazy(() => import('./pages/KitchenDashboard').then(m => ({ default: m.KitchenDashboard })))
const ScheduleManager = lazy(() => import('./pages/ScheduleManager').then(m => ({ default: m.ScheduleManager })))
const BatchPlanner = lazy(() => import('./pages/BatchPlanner').then(m => ({ default: m.BatchPlanner })))
const ProductionOrdersPage = lazy(() => import('./pages/ProductionOrdersPage').then(m => ({ default: m.ProductionOrdersPage })))
const ReceiptInbox = lazy(() => import('./pages/ReceiptInbox').then(m => ({ default: m.ReceiptInbox })))

function PageLoader() {
  return (
    <div className="flex items-center justify-center py-32 text-xs text-slate-500">
      <Loader2 className="mr-2 h-5 w-5 animate-spin text-emerald-500" />
      Loading...
    </div>
  )
}

function FallbackError() {
  return (
    <div className="flex h-screen items-center justify-center bg-zinc-950 text-white">
      <div className="text-center space-y-4">
        <h1 className="text-2xl font-bold">Something went wrong</h1>
        <p className="text-zinc-400">The error has been reported</p>
        <button
          onClick={() => window.location.assign('/')}
          className="px-4 py-2 bg-amber-600 rounded-lg hover:bg-amber-500 transition-colors"
        >
          Back to Dashboard
        </button>
      </div>
    </div>
  )
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Sentry.ErrorBoundary fallback={FallbackError}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/kitchen" element={<Suspense fallback={<PageLoader />}><KitchenDashboard /></Suspense>} />
            <Route element={<ProtectedRoute />}>
              <Route element={<AppShell />}>
                <Route path="/" element={<ControlCenter />} />
                <Route path="/bom" element={<Suspense fallback={<PageLoader />}><BOMHub /></Suspense>} />
                <Route path="/kds" element={<Suspense fallback={<PageLoader />}><KDSBoard /></Suspense>} />
                <Route path="/cook" element={<Suspense fallback={<PageLoader />}><CookStation /></Suspense>} />
                <Route path="/waste" element={<Suspense fallback={<PageLoader />}><WasteTracker /></Suspense>} />
                <Route path="/logistics" element={<Suspense fallback={<PageLoader />}><LogisticsScanner /></Suspense>} />
                <Route path="/procurement" element={<Suspense fallback={<PageLoader />}><Procurement /></Suspense>} />
                <Route path="/sku" element={<Suspense fallback={<PageLoader />}><SkuManagerPage /></Suspense>} />
                <Route path="/orders" element={<Suspense fallback={<PageLoader />}><OrderManager /></Suspense>} />
                <Route path="/planner" element={<Suspense fallback={<PageLoader />}><MasterPlanner /></Suspense>} />
                <Route path="/planner/batch" element={<Suspense fallback={<PageLoader />}><BatchPlanner /></Suspense>} />
                <Route path="/finance" element={<Suspense fallback={<PageLoader />}><FinanceLayout /></Suspense>}>
                  <Route index element={<Navigate to="ledger" replace />} />
                  <Route path="ledger" element={<FinanceLedger />} />
                  <Route path="entry" element={<FinanceEntry />} />
                  <Route path="analytics" element={<FinanceAnalytics />} />
                </Route>
                <Route path="/receipts" element={<Suspense fallback={<PageLoader />}><ReceiptInbox /></Suspense>} />
                <Route path="/receive" element={<Suspense fallback={<PageLoader />}><ReceivingStation /></Suspense>} />
                <Route path="/production" element={<Suspense fallback={<PageLoader />}><ProductionOrdersPage /></Suspense>} />
                <Route path="/schedule" element={<Suspense fallback={<PageLoader />}><ScheduleManager /></Suspense>} />
                <Route path="/settings" element={<Suspense fallback={<PageLoader />}><Settings /></Suspense>} />
              </Route>
            </Route>
            {/* Fallback: redirect unknown routes to Control Center */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Sentry.ErrorBoundary>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
