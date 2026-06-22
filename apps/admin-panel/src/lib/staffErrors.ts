/**
 * Maps a Supabase/Postgres error from a staff write into a message that's safe
 * to show a non-technical user, instead of dumping raw constraint text like
 * `new row for relation "staff" violates check constraint "..."`.
 *
 * Pure (no React / no Supabase runtime) so it can be unit-tested directly.
 */
export interface DbErrorLike {
  message?: string | null
  code?: string | null
}

export function friendlyStaffError(error: DbErrorLike | null | undefined): string {
  const message = error?.message ?? ''
  const code = error?.code ?? ''

  // Credential rule: owners/managers need an email, cooks need a PIN.
  if (message.includes('staff_role_credential_check')) {
    return "Can't save: this person has a login but their credentials are incomplete — owners & managers need an email, cooks need a PIN. Finish setting up their account, then try again."
  }

  // Other CHECK / foreign-key / unique violations — a data rule rejected it.
  if (code === '23514' || code === '23503' || code === '23505') {
    return 'That change was rejected by a data rule. Reload the page and try again; the value may conflict with another record.'
  }

  // Expired session / RLS denial — the classic "page was open too long".
  if (code === '42501' || /jwt|token|expired|permission denied/i.test(message)) {
    return 'Your session looks out of date (the page may have been open a while). Reload the page and try again.'
  }

  return message ? `Couldn't save: ${message}` : 'Something went wrong while saving. Reload and try again.'
}
