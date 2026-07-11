import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { CartProvider } from './state/cart.tsx'
import MenuPage from './pages/MenuPage.tsx'
import CheckoutPage from './pages/CheckoutPage.tsx'
import OrderConfirmationPage from './pages/OrderConfirmationPage.tsx'

export default function App() {
  return (
    <BrowserRouter>
      <CartProvider>
        <Routes>
          <Route path="/" element={<MenuPage />} />
          <Route path="/checkout" element={<CheckoutPage />} />
          <Route path="/order/:code" element={<OrderConfirmationPage />} />
        </Routes>
      </CartProvider>
    </BrowserRouter>
  )
}
