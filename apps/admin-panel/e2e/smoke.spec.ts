import { test, expect } from '@playwright/test'

/**
 * Smoke test — verifies the dev server boots and serves the SPA shell.
 *
 * Kept env-independent on purpose: full React mount needs VITE_SUPABASE_*
 * (copy .env.example → .env). Console errors are logged as diagnostics,
 * not asserted, so this stays green without local secrets.
 *
 * Extend with real flows (e.g. the /menu control & preview page) once
 * a test .env is wired up.
 */
test('serves the SPA shell', async ({ page }) => {
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.log(`[browser error] ${msg.text()}`)
  })
  page.on('pageerror', (err) => console.log(`[page error] ${err.message}`))

  const response = await page.goto('/')
  expect(response?.ok(), 'dev server should serve index.html').toBeTruthy()

  // The React mount point is present in the served HTML.
  await expect(page.locator('#root')).toBeAttached()
})
