import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './layouts/AppShell'
import { BOMHub } from './pages/BOMHub'
import { ControlCenter } from './pages/ControlCenter'
import { KDSBoard } from './pages/KDSBoard'
import { CookStation } from './pages/CookStation'
import { WasteTracker } from './pages/WasteTracker'
import { LogisticsScanner } from './pages/LogisticsScanner'

function App() {
  return (
    <BrowserRouter>
      <AppShell>
        <Routes>
          <Route path="/" element={<ControlCenter />} />
          <Route path="/bom" element={<BOMHub />} />
          <Route path="/kds" element={<KDSBoard />} />
          <Route path="/cook" element={<CookStation />} />
          <Route path="/waste" element={<WasteTracker />} />
          <Route path="/logistics" element={<LogisticsScanner />} />
          {/* Fallback: redirect unknown routes to Control Center */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppShell>
    </BrowserRouter>
  )
}

export default App
