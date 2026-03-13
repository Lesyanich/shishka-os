import * as Sentry from '@sentry/react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './layouts/AppShell'
import { BOMHub } from './pages/BOMHub'
import { ControlCenter } from './pages/ControlCenter'
import { KDSBoard } from './pages/KDSBoard'
import { CookStation } from './pages/CookStation'
import { WasteTracker } from './pages/WasteTracker'
import { LogisticsScanner } from './pages/LogisticsScanner'
import { Procurement } from './pages/Procurement'
import { OrderManager } from './pages/OrderManager'
import { MasterPlanner } from './pages/MasterPlanner'
import { FinanceManager } from './pages/FinanceManager'

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
      <AppShell>
        <Sentry.ErrorBoundary fallback={FallbackError}>
          <Routes>
            <Route path="/" element={<ControlCenter />} />
            <Route path="/bom" element={<BOMHub />} />
            <Route path="/kds" element={<KDSBoard />} />
            <Route path="/cook" element={<CookStation />} />
            <Route path="/waste" element={<WasteTracker />} />
            <Route path="/logistics" element={<LogisticsScanner />} />
            <Route path="/procurement" element={<Procurement />} />
            <Route path="/orders" element={<OrderManager />} />
            <Route path="/planner" element={<MasterPlanner />} />
            <Route path="/finance" element={<FinanceManager />} />
            {/* Fallback: redirect unknown routes to Control Center */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Sentry.ErrorBoundary>
      </AppShell>
    </BrowserRouter>
  )
}

export default App
