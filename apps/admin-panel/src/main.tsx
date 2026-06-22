import './lib/sentry'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { RELOAD_KEY } from './lib/lazyWithReload'

// Recover from stale modulepreload failures after a deploy. Vite fires
// `vite:preloadError` when a <link rel="modulepreload"> for a dynamically
// imported dependency 404s/fails — this can bypass the lazyWithReload catch.
// A single sessionStorage-guarded reload pulls the fresh chunk manifest; the
// guard prevents an infinite loop on a genuinely broken deploy.
window.addEventListener('vite:preloadError', (e) => {
  if (!sessionStorage.getItem(RELOAD_KEY)) {
    sessionStorage.setItem(RELOAD_KEY, String(performance.now()))
    e.preventDefault()
    window.location.reload()
  }
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
