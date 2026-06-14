/**
 * Maps a staff nickname to the synthetic Supabase Auth email used as the login
 * identity. Staff never see this — they type just their name + PIN. The same
 * formula must be used when provisioning the account (see staff email column).
 *
 *   "Alex" → "alex@staff.shishka.local"
 *
 * Keep in sync with the email written to auth.users / staff.email on the server.
 */
export const STAFF_EMAIL_DOMAIN = 'staff.shishka.local'

export function staffNameToEmail(name: string): string {
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]/g, '')
  return `${slug}@${STAFF_EMAIL_DOMAIN}`
}
