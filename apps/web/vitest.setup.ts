import '@testing-library/jest-dom/vitest'

// src/lib/supabase.ts calls createClient(import.meta.env.VITE_*) at import time —
// an empty URL throws "Invalid supabase URL". Placeholders keep imports safe; the
// data-fetch tests mock the client instead of hitting the network.
import.meta.env.VITE_SUPABASE_URL ??= 'http://localhost:54321'
import.meta.env.VITE_SUPABASE_ANON_KEY ??= 'test-anon-key'
