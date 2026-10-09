import { useState } from 'react'
import { Eye, EyeOff, KeyRound, Loader2, LogOut, ShieldCheck } from 'lucide-react'
import {
  ASSIGNABLE_ROLES,
  bangkokToday,
  loginFromEmail,
  loginStatusLabel,
  suggestLogin,
  type AccessResult,
  type LoginStatus,
} from '../../hooks/use-staff-access'
import type { AppRole } from '../../contexts/AppRoleContext'

/**
 * One employee's access: tier, login, firing. Rendered inside the owner-only
 * staff card, so there is no role check here — the DB refuses non-owners
 * anyway (fn_set_staff_pin, staff_write_owner_only).
 *
 * The owner invents the login and the 4-digit PIN and hands both over
 * (spec P6). The PIN is stored encrypted in Vault, never on the staff row;
 * "Show PIN" asks the owner-only fn_staff_pin_reveal for it on demand and
 * keeps it only in this component's state until hidden.
 */
export function StaffAccessPanel({
  staffId,
  staffName,
  appRole,
  isActive,
  fireDate,
  status,
  onSetRole,
  onSetLogin,
  onFire,
  onRevealPin,
  onChanged,
}: {
  staffId: string
  staffName: string
  appRole: string
  isActive: boolean
  fireDate: string | null
  status: LoginStatus | undefined
  onSetRole: (staffId: string, role: Exclude<AppRole, 'owner'>) => Promise<AccessResult>
  onSetLogin: (staffId: string, login: string, pin: string) => Promise<AccessResult>
  onFire: (staffId: string, lastDay: string) => Promise<AccessResult>
  onRevealPin: (staffId: string) => Promise<AccessResult & { pin?: string }>
  /** Refetch the card after a write that changes the row (role, fire). */
  onChanged: () => void
}) {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [loginOpen, setLoginOpen] = useState(false)
  const [login, setLogin] = useState(status ? loginFromEmail(status.login_email) : suggestLogin(staffName))
  const [pin, setPin] = useState('')
  const [issued, setIssued] = useState<string | null>(null)

  const [shownPin, setShownPin] = useState<string | null>(null)

  const [fireOpen, setFireOpen] = useState(false)
  const [lastDay, setLastDay] = useState(bangkokToday())

  const label = loginStatusLabel(status)
  const isOwner = appRole === 'owner'

  async function run(action: () => Promise<AccessResult>, after?: (r: AccessResult) => void) {
    setBusy(true)
    setError(null)
    const r = await action()
    setBusy(false)
    if (!r.ok) {
      setError(r.error ?? 'Something went wrong')
      return
    }
    after?.(r)
  }

  return (
    <div>
      <p className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        <ShieldCheck className="h-3 w-3" />
        Access
      </p>

      <div className="space-y-1.5 text-xs">
        {/* Tier — short option labels; the hint goes on its own line so the
            select never outgrows a narrow card. */}
        <div className="flex items-start gap-2">
          <span className="w-12 shrink-0 pt-0.5 text-slate-500">Level</span>
          {isOwner ? (
            <span className="text-amber-300">Owner</span>
          ) : !isActive ? (
            <span className="text-slate-400">{ASSIGNABLE_ROLES.find((r) => r.value === appRole)?.label ?? appRole}</span>
          ) : (
            <div className="min-w-0 flex-1">
              <select
                aria-label="Access level"
                value={appRole}
                disabled={busy}
                onChange={(e) =>
                  void run(
                    () => onSetRole(staffId, e.target.value as Exclude<AppRole, 'owner'>),
                    () => onChanged(),
                  )
                }
                className="max-w-full rounded bg-slate-800 px-2 py-1 text-xs text-slate-200 ring-1 ring-slate-700 focus:ring-emerald-500/50 focus:outline-none disabled:opacity-50"
              >
                {ASSIGNABLE_ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
              <p className="mt-0.5 text-[10px] text-slate-500">
                {ASSIGNABLE_ROLES.find((r) => r.value === appRole)?.hint}
              </p>
            </div>
          )}
        </div>

        {/* Login */}
        <div className="flex items-start gap-2">
          <span className="w-12 shrink-0 pt-0.5 text-slate-500">Login</span>
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              {status && <span className="font-mono text-slate-200">{loginFromEmail(status.login_email)}</span>}
              <span
                className={
                  label.kind === 'blocked'
                    ? 'text-red-400'
                    : label.kind === 'active'
                      ? 'text-emerald-400'
                      : 'text-slate-400'
                }
              >
                {label.text}
              </span>
              {isActive && !isOwner && !loginOpen && (
                <button
                  type="button"
                  onClick={() => {
                    setIssued(null)
                    setLoginOpen(true)
                  }}
                  className="flex items-center gap-1 rounded bg-slate-800 px-2 py-1 text-[11px] text-slate-300 ring-1 ring-slate-700 transition hover:bg-slate-700"
                >
                  <KeyRound className="h-3 w-3" />
                  {status ? 'Change PIN' : 'Create login'}
                </button>
              )}
              {isActive && !isOwner && status?.has_pin && !loginOpen && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    shownPin
                      ? setShownPin(null)
                      : void run(
                          () => onRevealPin(staffId),
                          (r) => setShownPin((r as AccessResult & { pin?: string }).pin ?? null),
                        )
                  }
                  className="flex items-center gap-1 rounded px-2 py-1 text-[11px] text-slate-400 transition hover:bg-slate-800 disabled:opacity-50"
                >
                  {shownPin ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                  {shownPin ? 'Hide PIN' : 'Show PIN'}
                </button>
              )}
              {shownPin && (
                <span aria-label="PIN" className="font-mono tracking-widest text-amber-300">
                  {shownPin}
                </span>
              )}
            </div>

            {loginOpen && (
              <form
                className="space-y-1.5 rounded-lg bg-slate-950/60 p-2 ring-1 ring-slate-800"
                onSubmit={(e) => {
                  e.preventDefault()
                  void run(
                    () => onSetLogin(staffId, login, pin),
                    (r) => {
                      setIssued(r.login ?? login)
                      setShownPin(null)
                      setPin('')
                      setLoginOpen(false)
                    },
                  )
                }}
              >
                <label className="block">
                  <span className="text-[10px] text-slate-500">Login (what they type on the login screen)</span>
                  <input
                    value={login}
                    onChange={(e) => setLogin(e.target.value.toLowerCase())}
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    className="mt-0.5 w-full rounded bg-slate-800 px-2 py-1 font-mono text-xs text-slate-200 ring-1 ring-slate-700 focus:ring-emerald-500/50 focus:outline-none"
                  />
                </label>
                <label className="block">
                  <span className="text-[10px] text-slate-500">PIN (4 digits)</span>
                  <input
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    inputMode="numeric"
                    autoComplete="off"
                    className="mt-0.5 w-24 rounded bg-slate-800 px-2 py-1 font-mono text-xs tracking-widest text-slate-200 ring-1 ring-slate-700 focus:ring-emerald-500/50 focus:outline-none"
                  />
                </label>
                {status && (
                  <p className="text-[9px] text-slate-600">
                    Changing the PIN signs this person out everywhere.
                  </p>
                )}
                <div className="flex gap-1.5">
                  <button
                    type="submit"
                    disabled={busy}
                    className="flex items-center gap-1 rounded bg-emerald-600 px-2 py-1 text-[11px] font-medium text-white transition hover:bg-emerald-500 disabled:opacity-50"
                  >
                    {busy && <Loader2 className="h-3 w-3 animate-spin" />}
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setLoginOpen(false)}
                    className="rounded px-2 py-1 text-[11px] text-slate-400 transition hover:bg-slate-800"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}

            {issued && (
              <p className="text-[10px] text-emerald-400">
                Give {staffName}: login <span className="font-mono">{issued}</span> + the PIN you chose.
              </p>
            )}
          </div>
        </div>

        {/* Fire */}
        {!isOwner && isActive && (
          <div className="flex items-start gap-2">
            <span className="w-12 shrink-0 pt-0.5 text-slate-500">Leave</span>
            <div className="min-w-0 flex-1">
              {fireDate ? (
                <span className="text-amber-300">Last working day {fireDate}</span>
              ) : !fireOpen ? (
                <button
                  type="button"
                  onClick={() => setFireOpen(true)}
                  className="flex items-center gap-1 rounded px-2 py-1 text-[11px] text-red-400 transition hover:bg-red-500/10"
                >
                  <LogOut className="h-3 w-3" />
                  Fire…
                </button>
              ) : (
                <form
                  className="space-y-1.5 rounded-lg bg-slate-950/60 p-2 ring-1 ring-red-900/50"
                  onSubmit={(e) => {
                    e.preventDefault()
                    void run(
                      () => onFire(staffId, lastDay),
                      () => {
                        setFireOpen(false)
                        onChanged()
                      },
                    )
                  }}
                >
                  <label className="block">
                    <span className="text-[10px] text-slate-500">Last working day</span>
                    <input
                      type="date"
                      value={lastDay}
                      onChange={(e) => setLastDay(e.target.value)}
                      className="mt-0.5 rounded bg-slate-800 px-2 py-1 text-xs text-slate-200 ring-1 ring-slate-700 focus:ring-emerald-500/50 focus:outline-none"
                    />
                  </label>
                  <p className="text-[9px] text-slate-500">
                    {lastDay < bangkokToday()
                      ? 'Every login is blocked now. This cannot be undone — a rehire gets a new record.'
                      : 'Access ends the morning after that day. This cannot be undone — a rehire gets a new record.'}
                  </p>
                  <div className="flex gap-1.5">
                    <button
                      type="submit"
                      disabled={busy || !lastDay}
                      className="flex items-center gap-1 rounded bg-red-600 px-2 py-1 text-[11px] font-medium text-white transition hover:bg-red-500 disabled:opacity-50"
                    >
                      {busy && <Loader2 className="h-3 w-3 animate-spin" />}
                      Confirm
                    </button>
                    <button
                      type="button"
                      onClick={() => setFireOpen(false)}
                      className="rounded px-2 py-1 text-[11px] text-slate-400 transition hover:bg-slate-800"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}

        {error && <p className="text-[10px] text-red-400">{error}</p>}
      </div>
    </div>
  )
}

export default StaffAccessPanel
