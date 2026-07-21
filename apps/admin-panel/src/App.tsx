import { Suspense } from 'react'
import * as Sentry from '@sentry/react'
import { isChunkLoadError, lazyWithReload, RELOAD_KEY } from './lib/lazyWithReload'
import { BrowserRouter, Navigate, Route, Routes, useParams } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { AppRoleProvider } from './contexts/AppRoleContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import { RoleGuard, RoleLanding } from './components/RoleGuard'
import { AppShell } from './layouts/AppShell'
import { Loader2 } from 'lucide-react'

// Static — always in main bundle (login + first screen)
import { LoginPage } from './pages/LoginPage'
import { OpeningRoadmap } from './pages/OpeningRoadmap'

// Public, no-auth staff page (PIN-gated). Kept out of the lazy graph so the
// shared staff link loads fast and never touches the authenticated bundle.
import { StockSheetPage } from './pages/StockSheetPage'

// Lazy — loaded on-demand per route
const BOMHub = lazyWithReload(() => import('./pages/BOMHub').then(m => ({ default: m.BOMHub })))
const KDSBoard = lazyWithReload(() => import('./pages/KDSBoard').then(m => ({ default: m.KDSBoard })))
const CookStation = lazyWithReload(() => import('./pages/CookStation').then(m => ({ default: m.CookStation })))
const WasteTracker = lazyWithReload(() => import('./pages/WasteTracker').then(m => ({ default: m.WasteTracker })))
const StockControlReport = lazyWithReload(() => import('./pages/StockControlReport').then(m => ({ default: m.StockControlReport })))
const Procurement = lazyWithReload(() => import('./pages/Procurement').then(m => ({ default: m.Procurement })))
const ShoppingList = lazyWithReload(() => import('./pages/ShoppingList').then(m => ({ default: m.ShoppingList })))
const StocktakeReviewPage = lazyWithReload(() => import('./pages/StocktakeReviewPage').then(m => ({ default: m.StocktakeReviewPage })))
const StationCountPage = lazyWithReload(() => import('./pages/StationCountPage').then(m => ({ default: m.StationCountPage })))
const ThawStation = lazyWithReload(() => import('./pages/ThawStation').then(m => ({ default: m.ThawStation })))
const SkuManagerPage = lazyWithReload(() => import('./pages/SkuManagerPage').then(m => ({ default: m.SkuManagerPage })))
const MasterPlanner = lazyWithReload(() => import('./pages/MasterPlanner').then(m => ({ default: m.MasterPlanner })))
const FinanceLayout = lazyWithReload(() => import('./pages/FinanceLayout').then(m => ({ default: m.FinanceLayout })))
const FinanceLedger = lazyWithReload(() => import('./pages/FinanceLedger').then(m => ({ default: m.FinanceLedger })))
const FinanceAnalytics = lazyWithReload(() => import('./pages/FinanceAnalytics').then(m => ({ default: m.FinanceAnalytics })))
const FinanceDashboard = lazyWithReload(() => import('./pages/FinanceDashboard').then(m => ({ default: m.FinanceDashboard })))
const ReceivingStation = lazyWithReload(() => import('./pages/ReceivingStation').then(m => ({ default: m.ReceivingStation })))
const Settings = lazyWithReload(() => import('./pages/Settings').then(m => ({ default: m.Settings })))
const BatchPlanner = lazyWithReload(() => import('./pages/BatchPlanner').then(m => ({ default: m.BatchPlanner })))
const ProductionOrdersPage = lazyWithReload(() => import('./pages/ProductionOrdersPage').then(m => ({ default: m.ProductionOrdersPage })))
const ReceiptInbox = lazyWithReload(() => import('./pages/ReceiptInbox').then(m => ({ default: m.ReceiptInbox })))
const MissionControl = lazyWithReload(() => import('./pages/MissionControl').then(m => ({ default: m.MissionControl })))
const MenuPage = lazyWithReload(() => import('./pages/menu/MenuPage').then(m => ({ default: m.MenuPage })))
const ModifiersPage = lazyWithReload(() => import('./pages/menu/ModifiersPage').then(m => ({ default: m.ModifiersPage })))
const SaladBarPage = lazyWithReload(() => import('./pages/SaladBarPage').then(m => ({ default: m.SaladBarPage })))
const BrainPage = lazyWithReload(() => import('./pages/brain').then(m => ({ default: m.BrainPage })))
const BrainWikiPage = lazyWithReload(() => import('./pages/brain').then(m => ({ default: m.BrainWikiPage })))
const BrainDriveMapPage = lazyWithReload(() => import('./pages/brain').then(m => ({ default: m.BrainDriveMapPage })))
const ProductionTargets = lazyWithReload(() => import('./pages/ProductionTargets').then(m => ({ default: m.ProductionTargets })))
const ApiCostPage = lazyWithReload(() => import('./pages/ApiCostPage').then(m => ({ default: m.ApiCostPage })))
const HRLayout = lazyWithReload(() => import('./pages/hr/HRLayout').then(m => ({ default: m.HRLayout })))
const AttendancePage = lazyWithReload(() => import('./pages/hr/AttendancePage').then(m => ({ default: m.AttendancePage })))
const PunctualityPage = lazyWithReload(() => import('./pages/hr/PunctualityPage').then(m => ({ default: m.PunctualityPage })))
const PayrollPage = lazyWithReload(() => import('./pages/hr/PayrollPage').then(m => ({ default: m.PayrollPage })))
const StaffPage = lazyWithReload(() => import('./pages/hr/StaffPage').then(m => ({ default: m.StaffPage })))
const SchedulePage = lazyWithReload(() => import('./pages/hr/SchedulePage').then(m => ({ default: m.SchedulePage })))
const StaffTasksPage = lazyWithReload(() => import('./pages/StaffTasksPage').then(m => ({ default: m.StaffTasksPage })))
const CashierPage = lazyWithReload(() => import('./pages/cashier/CashierPage').then(m => ({ default: m.CashierPage })))
const CookTasksPage = lazyWithReload(() => import('./pages/CookTasksPage').then(m => ({ default: m.CookTasksPage })))
const KitchenLabels = lazyWithReload(() => import('./pages/KitchenLabels').then(m => ({ default: m.KitchenLabels })))
const KitchenRecipesPage = lazyWithReload(() => import('./pages/KitchenRecipesPage').then(m => ({ default: m.KitchenRecipesPage })))
const StaffSchedulePage = lazyWithReload(() => import('./pages/staff/StaffSchedulePage').then(m => ({ default: m.StaffSchedulePage })))
const HandbookLayout = lazyWithReload(() => import('./pages/handbook/HandbookLayout').then(m => ({ default: m.HandbookLayout })))
const HandbookHome = lazyWithReload(() => import('./pages/handbook/HandbookHome').then(m => ({ default: m.HandbookHome })))
const HandbookPage = lazyWithReload(() => import('./pages/handbook/HandbookPage').then(m => ({ default: m.HandbookPage })))
const KbEditor = lazyWithReload(() => import('./pages/handbook/KbEditor').then(m => ({ default: m.KbEditor })))
const KbRegistry = lazyWithReload(() => import('./pages/handbook/KbRegistry').then(m => ({ default: m.KbRegistry })))

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

function FallbackError({ error }: { error: unknown }) {
  // Defense-in-depth: if a stale-chunk error bubbled past the lazyWithReload
  // catch (e.g. it surfaced during render rather than the import promise),
  // recover with a single guarded reload instead of showing the error card.
  if (isChunkLoadError(error) && !sessionStorage.getItem(RELOAD_KEY)) {
    sessionStorage.setItem(RELOAD_KEY, String(performance.now()))
    window.location.reload()
    return <PageLoader />
  }
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
        <Sentry.ErrorBoundary fallback={({ error }) => <FallbackError error={error} />}>
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
                    <Route index element={<Navigate to="/brain/wiki" replace />} />
                    <Route path="wiki/*" element={<Suspense fallback={<PageLoader />}><BrainWikiPage /></Suspense>} />
                    <Route path="drive" element={<Suspense fallback={<PageLoader />}><BrainDriveMapPage /></Suspense>} />
                  </Route>
                  <Route path="/menu/modifiers" element={<Suspense fallback={<PageLoader />}><ModifiersPage /></Suspense>} />
                  <Route path="/menu/*" element={<Suspense fallback={<PageLoader />}><MenuPage /></Suspense>} />
                  <Route path="/nomenclature/:productCode" element={<NomenclatureRedirect />} />
                  <Route path="/nomenclature" element={<Navigate to="/menu" replace />} />
                  <Route path="/bom" element={<Suspense fallback={<PageLoader />}><BOMHub /></Suspense>} />
                  <Route path="/sku" element={<Suspense fallback={<PageLoader />}><SkuManagerPage /></Suspense>} />
                  <Route path="/stock-control" element={<Suspense fallback={<PageLoader />}><StockControlReport /></Suspense>} />
                  <Route path="/finance" element={<Suspense fallback={<PageLoader />}><FinanceLayout /></Suspense>}>
                    <Route index element={<Navigate to="dashboard" replace />} />
                    <Route path="dashboard" element={<FinanceDashboard />} />
                    <Route path="ledger" element={<FinanceLedger />} />
                    <Route path="analytics" element={<FinanceAnalytics />} />
                  </Route>
                  <Route path="/hr" element={<Suspense fallback={<PageLoader />}><HRLayout /></Suspense>}>
                    <Route index element={<Navigate to="attendance" replace />} />
                    <Route path="attendance" element={<AttendancePage />} />
                    <Route path="punctuality" element={<PunctualityPage />} />
                    <Route path="payroll" element={<PayrollPage />} />
                    <Route path="staff" element={<StaffPage />} />
                  </Route>
                  <Route path="/api-costs" element={<Suspense fallback={<PageLoader />}><ApiCostPage /></Suspense>} />
                  <Route path="/settings" element={<Suspense fallback={<PageLoader />}><Settings /></Suspense>} />
                  {/* Inventory/waste + receiving — owner-only, pulled off the cook floor */}
                  <Route path="/kitchen/waste" element={<Suspense fallback={<PageLoader />}><WasteTracker /></Suspense>} />
                  <Route path="/receive" element={<Suspense fallback={<PageLoader />}><ReceivingStation /></Suspense>} />
                </Route>

                {/* ── Task-manager tier (Mint / L2 assembly admin) + owner ── */}
                <Route element={<RoleGuard minRole="task_manager" />}>
                  {/* Receipt inbox — managers upload receipts + verify OCR. Full finance views (dashboard/ledger/analytics) stay owner-only. */}
                  <Route path="/receipts" element={<Suspense fallback={<PageLoader />}><ReceiptInbox /></Suspense>} />
                  <Route path="/staff-tasks" element={<Suspense fallback={<PageLoader />}><StaffTasksPage /></Suspense>} />
                  <Route path="/salad-bar" element={<Suspense fallback={<PageLoader />}><SaladBarPage /></Suspense>} />
                  <Route path="/cashier" element={<Suspense fallback={<PageLoader />}><CashierPage /></Suspense>} />
                  {/* Schedule editor — Mint (task_manager) manages shifts directly, no owner approval; cooks read-only at /staff/schedule */}
                  <Route path="/schedule" element={<Suspense fallback={<PageLoader />}><SchedulePage /></Suspense>} />
                  <Route path="/planner" element={<Suspense fallback={<PageLoader />}><MasterPlanner /></Suspense>} />
                  <Route path="/planner/batch" element={<Suspense fallback={<PageLoader />}><BatchPlanner /></Suspense>} />
                  <Route path="/production" element={<Suspense fallback={<PageLoader />}><ProductionOrdersPage /></Suspense>} />
                  <Route path="/targets" element={<Suspense fallback={<PageLoader />}><ProductionTargets /></Suspense>} />
                  <Route path="/procurement" element={<Suspense fallback={<PageLoader />}><Procurement /></Suspense>} />
                  <Route path="/shopping-list" element={<Suspense fallback={<PageLoader />}><ShoppingList /></Suspense>} />
                  {/* Stocktake review → apply → route to Shopping/Production (S3) */}
                  <Route path="/count/session/:id" element={<Suspense fallback={<PageLoader />}><StocktakeReviewPage /></Suspense>} />
                  {/* Heavy KDS production tooling — managers only, off the cook floor */}
                  <Route path="/kitchen/schedule" element={<Suspense fallback={<PageLoader />}><KDSBoard /></Suspense>} />
                  <Route path="/kitchen/tasks" element={<Suspense fallback={<PageLoader />}><CookStation /></Suspense>} />
                </Route>

                {/* ── Staff floor (cook) — all authenticated roles ── */}
                <Route element={<RoleGuard minRole="cook" />}>
                  <Route path="/kitchen/my-tasks" element={<Suspense fallback={<PageLoader />}><CookTasksPage /></Suspense>} />
                  {/* Per-station count screen — deep-linked from stock_check tasks (S3) */}
                  <Route path="/count/:code" element={<Suspense fallback={<PageLoader />}><StationCountPage /></Suspense>} />
                  {/* Cold-chain scan station — put-away + thaw (S4) */}
                  <Route path="/thaw" element={<Suspense fallback={<PageLoader />}><ThawStation /></Suspense>} />
                  <Route path="/kitchen/labels" element={<Suspense fallback={<PageLoader />}><KitchenLabels /></Suspense>} />
                  <Route path="/kitchen/recipes" element={<Suspense fallback={<PageLoader />}><KitchenRecipesPage /></Suspense>} />
                  <Route path="/staff/schedule" element={<Suspense fallback={<PageLoader />}><StaffSchedulePage /></Suspense>} />
                  {/* Handbook (knowledge base) — read for all staff; create/edit owner-only */}
                  <Route path="/handbook" element={<Suspense fallback={<PageLoader />}><HandbookLayout /></Suspense>}>
                    <Route index element={<Suspense fallback={<PageLoader />}><HandbookHome /></Suspense>} />
                    <Route path=":slug" element={<Suspense fallback={<PageLoader />}><HandbookPage /></Suspense>} />
                    <Route element={<RoleGuard minRole="owner" />}>
                      <Route path="registry" element={<Suspense fallback={<PageLoader />}><KbRegistry /></Suspense>} />
                      <Route path="new" element={<Suspense fallback={<PageLoader />}><KbEditor /></Suspense>} />
                      <Route path=":slug/edit" element={<Suspense fallback={<PageLoader />}><KbEditor /></Suspense>} />
                    </Route>
                  </Route>
                </Route>
              </Route>
            </Route>
            {/* Fallback: send unknown routes to the user's role landing */}
            <Route path="*" element={<RoleLanding />} />
          </Routes>
        </Sentry.ErrorBoundary>
        </AppRoleProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
