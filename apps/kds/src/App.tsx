import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { CookProvider } from './contexts/CookContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import { LoginPage } from './pages/LoginPage'
import { DashboardPage } from './pages/DashboardPage'
import { TaskPage } from './pages/TaskPage'

export default function App() {
  return (
    <BrowserRouter>
      <CookProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/task/:id" element={<TaskPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </CookProvider>
    </BrowserRouter>
  )
}
