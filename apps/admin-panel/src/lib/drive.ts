// Translate human-readable Drive paths from vault frontmatter `assets:` blocks
// into clickable URLs.
//
// Vault notes use paths like:
//   "Drive: 01_Business/Branding/Main Logo/Shishka-Kitchen-Logo-24-12-25.png"
//   "Drive: 01_Business/Finance/Receipts/2026-04/"
//
// We can't navigate straight to a folder/file by path (Drive needs the file
// ID for that). The next best thing is a Drive **search** URL — we extract
// the most specific component (filename or last folder name) and open Drive
// search for it. Clicking a card jumps to a Drive search results page where
// the user clicks the actual hit.
//
// If a vault note adds an explicit `url:` field in `assets:`, that overrides
// the search URL — use it directly.

const DRIVE_SEARCH_BASE = 'https://drive.google.com/drive/search?q='

/**
 * Strip the optional `Drive:` prefix and any leading/trailing slashes,
 * returning a clean path like `01_Business/Branding/Main Logo/Logo-25.png`.
 */
export function cleanDrivePath(raw: string): string {
  return raw.replace(/^Drive:\s*/i, '').replace(/^\/+|\/+$/g, '')
}

/**
 * Pick the most-specific term to search Drive for. For a folder path we
 * use the last folder name; for a file we use the filename without
 * extension (Drive search matches against display names, not extensions).
 */
export function driveSearchTerm(path: string): string {
  const clean = cleanDrivePath(path)
  if (!clean) return ''
  const segments = clean.split('/').filter(Boolean)
  const last = segments[segments.length - 1] ?? clean
  // For files like "Shishka-Logo-24-12-25.png" → strip .png to widen the search
  return last.replace(/\.[a-z0-9]{2,4}$/i, '')
}

/**
 * Build the link to open. If the path doesn't look like a Drive path
 * (e.g. a local repo path `apps/admin-panel/src/...`), return null —
 * caller renders as plain text.
 */
export function driveLinkFor(path: string | undefined): string | null {
  if (!path) return null
  const looksLikeDrive = /^Drive:\s*/i.test(path)
  if (!looksLikeDrive) return null
  const term = driveSearchTerm(path)
  if (!term) return null
  return `${DRIVE_SEARCH_BASE}${encodeURIComponent(term)}`
}
