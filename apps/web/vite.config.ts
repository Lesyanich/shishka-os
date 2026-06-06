import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Customer showcase menu site (shishka.health). Reads the anon-safe
// v_public_menu view directly — no ordering, no shared contracts in v1.
export default defineConfig({
  plugins: [react(), tailwindcss()],
})
