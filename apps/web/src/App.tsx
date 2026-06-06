import { BrowserRouter, Routes, Route } from 'react-router-dom'
import MenuPage from './pages/MenuPage.tsx'

// v1 = showcase-only menu (read-only). The cart / checkout / order pipeline
// lives on branch feature/web/qr-menu-ordering-mvp (PR #279) and returns in the
// ordering phase — deliberately excluded here to keep the showcase self-contained.
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<MenuPage />} />
        <Route path="*" element={<MenuPage />} />
      </Routes>
    </BrowserRouter>
  )
}
