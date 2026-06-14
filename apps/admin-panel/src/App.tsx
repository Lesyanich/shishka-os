import { lazy, Suspense } from 'react'
import * as Sentry from '@sentry/react'
import { BrowserRouter, Navigate, Route, Routes, useParams } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { AppRoleProvider } from './contexts/AppRoleContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import { RoleGuard } from './components/RoleGuard'
import { AppShell } from './layouts/AppShell'
import { Loader2 } from 'lucide-react'

// Static — always in main bundle (login + first screen)
import { LoginPage } from './pages/LoginPage'
import { OpeningRoadmap } from './pages/OpeningRoadmap'

// Public, no-auth staff page (PIN-gated). Kept out of the lazy graph so the
// shared staff link loads fast and never touches the authenticated bundle.
import { StockSheetPage } from './pages/StockSheetPage'

// Lazy — loaded on-demand per route
const BOMHub = lazy(() => import('./pages/BOMHub').then(m => ({ default: m.BOMHub })))
const KDSBoard = lazy(() => import('./pages/KDSBoard').then(m => ({ default: m.KDSBoard })))
const CookStation = lazy(() => import('./pages/CookStation').then(m => ({ default: m.CookStation })))
const WasteTracker = lazy(() => import('./pages/WasteTracker').then(m => ({ default: m.WasteTracker })))
const Procurement = lazy(() => import('./pages/Procurement').then(m => ({ default: m.Procurement })))
const ShoppingList = lazy(() => import('./pages/ShoppingList').then(m => ({ default: m.ShoppingList })))
const SkuManagerPage = lazy(() => import('./pages/SkuManagerPage').then(m => ({ default: m.SkuManagerPage })))
const MasterPlanner = lazy(() => import('./pages/MasterPlanner').then(m => ({ default: m.MasterPlanner })))
const FinanceLayout = lazy(() => import('./pages/FinanceLayout').then(m => ({ default: m.FinanceLayout })))
const FinanceLedger = lazy(() => import('./pages/FinanceLedger').then(m => ({ default: m.FinanceLedger })))
const FinanceAnalytics = lazy(() => import('./pages/FinanceAnalytics').then(m => ({ default: m.FinanceAnalytics })))
const FinanceDashboard = lazy(() => import('./pages/FinanceDashboard').then(m => ({ default: m.FinanceDashboard })))
const ReceivingStation = lazy(() => import('./pages/ReceivingStation').then(m => ({ default: m.ReceivingStation })))
const Settings = lazy(() => import('./pages/Settings').then(m => ({ default: m.Settings })))
const ScheduleManager = lazy(() => import('./pages/ScheduleManager').then(m => ({ default: m.ScheduleManager })))
const BatchPlanner = lazy(() => import('./pages/BatchPlanner').then(m => ({ default: m.BatchPlanner })))
const ProductionOrdersPage = lazy(() => import('./pages/ProductionOrdersPage').then(m => ({ default: m.ProductionOrdersPage })))
const ReceiptInbox = lazy(() => import('./pages/ReceiptInbox').then(m => ({ default: m.ReceiptInbox })))
const MissionControl = lazy(() => import('./pages/MissionControl').then(m => ({ default: m.MissionControl })))
const MenuPage = lazy(() => import('./pages/menu/MenuPage').then(m => ({ default: m.MenuPage })))
const ModifiersPage = lazy(() => import('./pages/menu/ModifiersPage').then(m => ({ default: m.ModifiersPage })))
const SaladBarPage = lazy(() => import('./pages/SaladBarPage').then(m => ({ default: m.SaladBarPage })))
const BrainPage = lazy(() => import('./pages/brain').then(m => ({ default: m.BrainPage })))
const BrainWikiPage = lazy(() => import('./pages/brain').then(m => ({ default: m.BrainWikiPage })))
const BrainDriveMapPage = lazy(() => import('./pages/brain').then(m => ({ default: m.BrainDriveMapPage })))
const BrainExplorePage = lazy(() => import('./pages/brain').then(m => ({ default: m.BrainExplorePage })))
const BrainKnowledgePage = lazy(() => import('./pages/brain/BrainKnowledgePage').then(m => ({ default: m.BrainKnowledgePage })))
const ProductionTargets = lazy(() => import('./pages/ProductionTargets').then(m => ({ default: m.ProductionTargets })))
const ApiCostPage = lazy(() => import('./pages/ApiCostPage').then(m => ({ default: m.ApiCostPage })))
const HRLayout = lazy(() => import('./pages/hr/HRLayout').then(m => ({ default: m.HRLayout })))
const AttendancePage = lazy(() => import('./pages/hr/AttendancePage').then(m => ({ default: m.AttendancePage })))
const PayrollPage = lazy(() => import('./pages/hr/PayrollPage').then(m => ({ default: m.PayrollPage })))
const StaffPage = lazy(() => import('./pages/hr/StaffPage').then(m => ({ default: m.StaffPage })))
const SchedulePage = lazy(() => import('./pages/hr/SchedulePage').then(m => ({ default: m.SchedulePage })))
const StaffTasksPage = lazy(() => import('./pages/StaffTasksPage').then(m => ({ default: m.StaffTasksPage })))
const CookTasksPage = lazy(() => import('./pages/CookTasksPage').then(m => ({ default: m.CookTasksPage })))
const CashierPage = lazy(() => import('./pages/cashier/CashierPage').then(m => ({ default: m.CashierPage })))

function PageLoader() {
  return (
    <div className="flex items-center justify-center py-32 text-xs text-slate-500">
      <Loader2 className="mr-2 h-5 w-5 animate-spin text-emerald-500" />
      Loading...
    </div>
  )
}

// Alias for shareable nomenclature URLs. Covers SALE/PF/MOD (menu drawer
// handles those). RAW items will land on a drawer with empty BOM/nutrition
// until a dedicated edit surface exists — tracked separately.
function NomenclatureRedirect() {
  const { productCode } = useParams<{ productCode: string }>()
  if (!productCode) return <Navigate to="/menu" replace />
  return <Navigate to={`/menu/dish/${encodeURIComponent(productCode)}`} replace />
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
        <AppRoleProvider>
        <Sentry.ErrorBoundary fallback={FallbackError}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            {/* Public staff stock-order sheet — no auth, PIN-gated server-side */}
            <Route path="/stock" element={<StockSheetPage />} />
            <Route element={<ProtectedRoute />}>
              <Route element={<AppShell />}>
                {/* ── Owner-only routes ── */}
                <Route element={<RoleGuard minRole="owner" />}>
                  <Route path="/" element={<OpeningRoadmap />} />
                  <Route path="/mission" element={<Suspense fallback={<PageLoader />}><MissionControl /></Suspense>} />
                  <Route path="/brain" element={<Suspense fallback={<PageLoader />}><BrainPage /></Suspense>}>
                    <Route index element={<Suspense fallback={<PageLoader />}><BrainExplorePage /></Suspense>} />
                    <Route path="knowledge" element={<Suspense fallback={<PageLoader />}><BrainKnowledgePage /></Suspense>} />
                    <Route path="wiki/*" element={<Suspense fallback={<PageLoader />}><BrainWikiPage /></Suspense>} />
                    <Route path="drive" element={<Suspense fallback={<PageLoader />}><BrainDriveMapPage /></Suspense>} />
                  </Route>
                  <Route path="/menu/modifiers" element={<Suspense fallback={<PageLoader />}><ModifiersPage /></Suspense>} />
                  <Route path="/menu/*" element={<Suspense fallback={<PageLoader />}><MenuPage /></Suspense>} />
                  <Route path="/nomenclature/:productCode" element={<NomenclatureRedirect />} />
                  <Route path="/nomenclature" element={<Navigate to="/menu" replace />} />
                  <Route path="/bom" element={<Suspense fallback={<PageLoader />}><BOMHub /></Suspense>} />
                  <Route path="/sku" element={<Suspense fallback={<PageLoader />}><SkuManagerPage /></Suspense>} />
                  <Route path="/finance" element={<Suspense fallback={<PageLoader />}><FinanceLayout /></Suspense>}>
                    <Route index element={<Navigate to="dashboard" replace />} />
                    <Route path="dashboard" element={<FinanceDashboard />} />
                    <Route path="ledger" element={<FinanceLedger />} />
                    <Route path="analytics" element={<FinanceAnalytics />} />
                  </Route>
                  <Route path="/hr" element={<Suspense fallback={<PageLoader />}><HRLayout /></Suspense>}>
                    <Route index element={<Navigate to="attendance" replace />} />
                    <Route path="attendance" element={<AttendancePage />} />
                    <Route path="payroll" element={<PayrollPage />} />
                    <Route path="staff" element={<StaffPage />} />
                    <Route path="schedule" element={<Suspense fallback={<PageLoader />}><SchedulePage /></Suspense>} />
                  </Route>
                  <Route path="/receipts" element={<Suspense fallback={<PageLoader />}><ReceiptInbox /></Suspense>} />
                  <Route path="/api-costs" element={<Suspense fallback={<PageLoader />}><ApiCostPage /></Suspense>} />
                  <Route path="/salad-bar" element={<Suspense fallback={<PageLoader />}><SaladBarPage /></Suspense>} />
                </Route>

                {/* ── Staff Tasks — owner + task_manager (e.g. Mint distributes tasks) ── */}
                <Route element={<RoleGuard allow={['owner', 'task_manager']} />}>
                  <Route path="/staff-tasks" element={<Suspense fallback={<PageLoader />}><StaffTasksPage /></Suspense>} />
                </Route>

                {/* ── Kitchen + Production — accessible to all authenticated ── */}
                <Route path="/cashier" element={<Suspense fallback={<PageLoader />}><CashierPage /></Suspense>} />
                <Route path="/kitchen/my-tasks" element={<Suspense fallback={<PageLoader />}><CookTasksPage /></Suspense>} />
                <Route path="/kitchen/schedule" element={<Suspense fallback={<PageLoader />}><KDSBoard /></Suspense>} />
                <Route path="/kitchen/tasks" element={<Suspense fallback={<PageLoader />}><CookStation /></Suspense>} />
                <Route path="/kitchen/waste" element={<Suspense fallback={<PageLoader />}><WasteTracker /></Suspense>} />
                <Route path="/schedule" element={<Suspense fallback={<PageLoader />}><ScheduleManager /></Suspense>} />
                <Route path="/planner" element={<Suspense fallback={<PageLoader />}><MasterPlanner /></Suspense>} />
                <Route path="/planner/batch" element={<Suspense fallback={<PageLoader />}><BatchPlanner /></Suspense>} />
                <Route path="/production" element={<Suspense fallback={<PageLoader />}><ProductionOrdersPage /></Suspense>} />
                <Route path="/targets" element={<Suspense fallback={<PageLoader />}><ProductionTargets /></Suspense>} />
                <Route path="/receive" element={<Suspense fallback={<PageLoader />}><ReceivingStation /></Suspense>} />
                <Route path="/procurement" element={<Suspense fallback={<PageLoader />}><Procurement /></Suspense>} />
                <Route path="/shopping-list" element={<Suspense fallback={<PageLoader />}><ShoppingList /></Suspense>} />
                <Route path="/settings" element={<Suspense fallback={<PageLoader />}><Settings /></Suspense>} />
              </Route>
            </Route>
            {/* Fallback: redirect unknown routes to Control Center */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Sentry.ErrorBoundary>
        </AppRoleProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
