import '@testing-library/jest-dom/vitest';

// API-side modules under api/ throw at import time if Supabase env vars are missing.
// Tests pass explicit fake clients, so harmless placeholders are enough.
process.env.SUPABASE_URL ??= 'http://localhost:54321';
process.env.SUPABASE_ANON_KEY ??= 'test-anon-key';

// Frontend src/lib/supabase.ts calls createClient(import.meta.env.VITE_*) at import
// time — an empty URL throws "Invalid supabase URL". Any hook test that imports the
// client needs valid placeholders (createClient validates the URL shape).
import.meta.env.VITE_SUPABASE_URL ??= 'http://localhost:54321';
import.meta.env.VITE_SUPABASE_ANON_KEY ??= 'test-anon-key';
