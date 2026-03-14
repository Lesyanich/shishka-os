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
const FinanceManager = lazy(() => import('./pages/FinanceManager').then(m => ({ default: m.FinanceManager })))

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
                <Route path="/finance" element={<Suspense fallback={<PageLoader />}><FinanceManager /></Suspense>} />
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
