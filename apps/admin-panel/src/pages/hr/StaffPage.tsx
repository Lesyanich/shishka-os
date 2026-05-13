import { useState } from 'react'
import {
  Shield,
  ChefHat,
  Pencil,
  X,
  Check,
  AlertTriangle,
  Mail,
  KeyRound,
  RotateCcw,
  Lock,
  CheckCircle2,
  Hash,
} from 'lucide-react'
import {
  useStaffCards,
  deriveAuthStatus,
  type StaffCard,
  type LeaveBalance,
  type StaffPatch,
  type AuthStatus,
  type AuthMutationResult,
} from '../../hooks/use-staff-cards'
import { useAppRole } from '../../contexts/AppRoleContext'

const ROLE_BADGE: Record<string, string> = {
  owner: 'bg-amber-500/15 text-amber-300',
  cook: 'bg-sky-500/15 text-sky-300',
}

const ROLE_ICON: Record<string, typeof Shield> = {
  owner: Shield,
  cook: ChefHat,
}

const AUTH_STATUS_BADGE: Record<AuthStatus, { label: string; cls: string; Icon: typeof Lock }> = {
  no_login: { label: 'No login', cls: 'bg-slate-700/40 text-slate-300', Icon: Lock },
  linked:   { label: 'Linked',   cls: 'bg-emerald-500/15 text-emerald-300', Icon: CheckCircle2 },
  pin_only: { label: 'PIN only', cls: 'bg-sky-500/15 text-sky-300', Icon: Hash },
}

function tenure(hireDate: string | null): string {
  if (!hireDate) return '—'
  const start = new Date(hireDate)
  const now = new Date()
  const months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth())
  if (months < 1) return '<1mo'
  const y = Math.floor(months / 12)
  const m = months % 12
  if (y === 0) return `${m}mo`
  if (m === 0) return `${y}yr`
  return `${y}yr ${m}mo`
}

function wpExpiryStyle(expiry: string | null): string {
  if (!expiry) return ''
  const days = Math.ceil((new Date(expiry).getTime() - Date.now()) / 86400000)
  if (days < 0) return 'bg-red-600/30 text-red-300 font-semibold'
  if (days < 30) return 'bg-red-500/15 text-red-400'
  if (days < 90) return 'bg-amber-500/15 text-amber-400'
  return 'bg-emerald-500/15 text-emerald-400'
}

function wpExpiryLabel(expiry: string | null): string {
  if (!expiry) return ''
  const days = Math.ceil((new Date(expiry).getTime() - Date.now()) / 86400000)
  if (days < 0) return `Expired ${Math.abs(days)}d ago`
  return `${days}d left`
}

function rotationLabel(pinSetAt: string | null): string {
  if (!pinSetAt) return ''
  const days = Math.floor((Date.now() - new Date(pinSetAt).getTime()) / 86400000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  return `${days}d ago`
}

const EMPLOYMENT_TYPES = ['full_time', 'part_time', 'contract', 'probation']

interface StaffActions {
  invite: (id: string, email: string) => Promise<AuthMutationResult>
  setPin: (id: string, pin: string) => Promise<AuthMutationResult>
  reset:  (id: string) => Promise<AuthMutationResult>
}

interface ActionModalState {
  kind: 'invite' | 'set_pin' | 'rotate_pin' | 'reset_password'
  card: StaffCard
}

function StaffCardView({
  card,
  leaves,
  onUpdate,
  onOpenModal,
}: {
  card: StaffCard
  leaves: LeaveBalance[]
  onUpdate: (id: string, patch: StaffPatch) => Promise<void>
  onOpenModal: (s: ActionModalState) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<StaffPatch>({})
  const RoleIcon = ROLE_ICON[card.app_role] ?? Shield
  const authStatus = deriveAuthStatus(card)
  const statusMeta = AUTH_STATUS_BADGE[authStatus]
  const StatusIcon = statusMeta.Icon

  function startEdit() {
    setDraft({
      monthly_salary: card.monthly_salary,
      employment_type: card.employment_type,
      nationality: card.nationality,
      work_permit_number: card.work_permit_number,
      work_permit_expiry: card.work_permit_expiry,
      sso_number: card.sso_number,
      tax_id: card.tax_id,
      probation_end_date: card.probation_end_date,
      hire_date: card.hire_date,
    })
    setEditing(true)
  }

  async function save() {
    await onUpdate(card.id, draft)
    setEditing(false)
  }

  return (
    <div
      className={[
        'rounded-xl ring-1 p-4 space-y-3 transition',
        card.is_active
          ? 'bg-slate-900/50 ring-slate-800'
          : 'bg-slate-950/50 ring-slate-800/50 opacity-60',
      ].join(' ')}
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2.5">
          <span
            className={`flex h-8 w-8 items-center justify-center rounded-lg ${ROLE_BADGE[card.app_role] ?? 'bg-slate-700 text-slate-400'}`}
          >
            <RoleIcon className="h-4 w-4" />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-slate-100">{card.name}</h3>
            <p className="text-[10px] text-slate-500">
              {card.role} · {card.is_active ? 'Active' : 'Inactive'}
              {card.fire_date && (
                <span className="text-red-400"> · Fired {card.fire_date}</span>
              )}
            </p>
          </div>
        </div>
        {card.is_active && !editing && (
          <button
            onClick={startEdit}
            className="rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-slate-300 transition"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
        {editing && (
          <div className="flex gap-1">
            <button
              onClick={save}
              className="rounded p-1 text-emerald-400 hover:bg-emerald-500/15 transition"
            >
              <Check className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setEditing(false)}
              className="rounded p-1 text-slate-500 hover:bg-slate-800 transition"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Access row */}
      {card.is_active && (
        <div className="space-y-1.5 rounded-lg bg-slate-950/50 p-2.5 ring-1 ring-slate-800/60">
          <div className="flex items-center justify-between">
            <span
              className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium ${statusMeta.cls}`}
            >
              <StatusIcon className="h-3 w-3" /> {statusMeta.label}
            </span>
            {card.app_role === 'cook' && card.pin_set_at && (
              <span className="text-[10px] text-slate-500">
                Rotated {rotationLabel(card.pin_set_at)}
              </span>
            )}
          </div>
          {card.app_role === 'owner' && card.email && (
            <p className="truncate text-[11px] text-slate-400">{card.email}</p>
          )}
          <div className="flex flex-wrap gap-1.5 pt-1">
            {card.app_role === 'owner' && authStatus === 'no_login' && (
              <ActionPill
                Icon={Mail}
                label="Invite"
                tone="emerald"
                onClick={() => onOpenModal({ kind: 'invite', card })}
              />
            )}
            {card.app_role === 'owner' && authStatus === 'linked' && (
              <ActionPill
                Icon={RotateCcw}
                label="Reset password"
                tone="amber"
                onClick={() => onOpenModal({ kind: 'reset_password', card })}
              />
            )}
            {card.app_role === 'cook' && authStatus === 'no_login' && (
              <ActionPill
                Icon={KeyRound}
                label="Set PIN"
                tone="emerald"
                onClick={() => onOpenModal({ kind: 'set_pin', card })}
              />
            )}
            {card.app_role === 'cook' && authStatus === 'pin_only' && (
              <ActionPill
                Icon={RotateCcw}
                label="Rotate PIN"
                tone="amber"
                onClick={() => onOpenModal({ kind: 'rotate_pin', card })}
              />
            )}
          </div>
        </div>
      )}

      {/* Details */}
      {!editing ? (
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
          <Field label="Salary" value={card.monthly_salary ? `฿${card.monthly_salary.toLocaleString()}` : '—'} />
          <Field label="Type" value={card.employment_type?.replace('_', ' ') ?? '—'} />
          <Field label="Nationality" value={card.nationality ?? '—'} />
          <Field label="Hired" value={card.hire_date ? `${card.hire_date} (${tenure(card.hire_date)})` : '—'} />
          {card.nationality && card.nationality !== 'thai' && (
            <>
              <Field label="WP #" value={card.work_permit_number ?? '—'} />
              <div>
                <span className="text-slate-500">WP Expiry</span>
                <div className="mt-0.5">
                  {card.work_permit_expiry ? (
                    <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${wpExpiryStyle(card.work_permit_expiry)}`}>
                      {card.work_permit_expiry} · {wpExpiryLabel(card.work_permit_expiry)}
                    </span>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </div>
              </div>
            </>
          )}
          <Field label="SSO #" value={card.sso_number ?? '—'} />
          <Field label="Tax ID" value={card.tax_id ?? '—'} />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
          <EditField
            label="Salary (THB)"
            type="number"
            value={draft.monthly_salary ?? ''}
            onChange={(v) => setDraft({ ...draft, monthly_salary: v ? Number(v) : null })}
          />
          <div>
            <label className="text-slate-500">Type</label>
            <select
              value={draft.employment_type ?? 'full_time'}
              onChange={(e) => setDraft({ ...draft, employment_type: e.target.value })}
              className="mt-0.5 w-full rounded bg-slate-800 px-2 py-1 text-xs text-slate-200 ring-1 ring-slate-700 focus:ring-emerald-500/50 focus:outline-none"
            >
              {EMPLOYMENT_TYPES.map((t) => (
                <option key={t} value={t}>{t.replace('_', ' ')}</option>
              ))}
            </select>
          </div>
          <EditField label="Nationality" value={draft.nationality ?? ''} onChange={(v) => setDraft({ ...draft, nationality: v || null })} />
          <EditField label="Hire Date" type="date" value={draft.hire_date ?? ''} onChange={(v) => setDraft({ ...draft, hire_date: v || null })} />
          <EditField label="WP #" value={draft.work_permit_number ?? ''} onChange={(v) => setDraft({ ...draft, work_permit_number: v || null })} />
          <EditField label="WP Expiry" type="date" value={draft.work_permit_expiry ?? ''} onChange={(v) => setDraft({ ...draft, work_permit_expiry: v || null })} />
          <EditField label="SSO #" value={draft.sso_number ?? ''} onChange={(v) => setDraft({ ...draft, sso_number: v || null })} />
          <EditField label="Tax ID" value={draft.tax_id ?? ''} onChange={(v) => setDraft({ ...draft, tax_id: v || null })} />
        </div>
      )}

      {/* Leave balances */}
      {leaves.length > 0 && (
        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Leave Balances {new Date().getFullYear()}
          </p>
          <div className="flex flex-wrap gap-2">
            {leaves.map((l) => (
              <span
                key={l.id}
                className="rounded bg-slate-800/60 px-2 py-0.5 text-[10px] text-slate-400"
              >
                {l.leave_type}: {l.used}/{l.entitlement}
                {l.remaining <= 0 && (
                  <AlertTriangle className="ml-1 inline h-2.5 w-2.5 text-amber-400" />
                )}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-slate-500">{label}</span>
      <p className="text-slate-300">{value}</p>
    </div>
  )
}

function EditField({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string
  value: string | number
  onChange: (v: string) => void
  type?: string
}) {
  return (
    <div>
      <label className="text-slate-500">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-0.5 w-full rounded bg-slate-800 px-2 py-1 text-xs text-slate-200 ring-1 ring-slate-700 focus:ring-emerald-500/50 focus:outline-none"
      />
    </div>
  )
}

const TONE_BUTTON: Record<'emerald' | 'amber', string> = {
  emerald: 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/30 hover:bg-emerald-500/20',
  amber:   'bg-amber-500/10 text-amber-300 ring-amber-500/30 hover:bg-amber-500/20',
}

function ActionPill({
  Icon,
  label,
  tone,
  onClick,
}: {
  Icon: typeof Mail
  label: string
  tone: 'emerald' | 'amber'
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium ring-1 transition ${TONE_BUTTON[tone]}`}
    >
      <Icon className="h-3 w-3" /> {label}
    </button>
  )
}

function ActionModal({
  state,
  onClose,
  actions,
}: {
  state: ActionModalState
  onClose: () => void
  actions: StaffActions
}) {
  const [email, setEmail] = useState(state.card.email ?? '')
  const [pin, setPin] = useState('')
  const [pinConfirm, setPinConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const title = {
    invite:         `Invite ${state.card.name}`,
    set_pin:        `Set PIN for ${state.card.name}`,
    rotate_pin:     `Rotate PIN for ${state.card.name}`,
    reset_password: `Reset password for ${state.card.name}`,
  }[state.kind]

  const irreversibleNote = {
    invite:         null,
    set_pin:        'PIN cannot be retrieved later — write it down for the cook.',
    rotate_pin:     'The current PIN will stop working immediately. Tell the cook the new PIN before saving.',
    reset_password: 'A password-reset email will be sent to the linked address.',
  }[state.kind]

  async function submit() {
    setSubmitting(true)
    setError(null)
    let res: AuthMutationResult

    if (state.kind === 'invite') {
      if (!email.trim()) {
        setError('Email required')
        setSubmitting(false)
        return
      }
      res = await actions.invite(state.card.id, email.trim())
    } else if (state.kind === 'set_pin' || state.kind === 'rotate_pin') {
      if (pin.length < 6) {
        setError('PIN must be at least 6 digits')
        setSubmitting(false)
        return
      }
      if (!/^\d+$/.test(pin)) {
        setError('PIN must be digits only')
        setSubmitting(false)
        return
      }
      if (pin !== pinConfirm) {
        setError('PINs do not match')
        setSubmitting(false)
        return
      }
      res = await actions.setPin(state.card.id, pin)
    } else {
      res = await actions.reset(state.card.id)
    }

    setSubmitting(false)
    if (res.ok) {
      onClose()
    } else {
      setError(res.error ?? 'request failed')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 py-8 backdrop-blur">
      <div className="w-full max-w-sm space-y-4 rounded-2xl bg-slate-900 p-5 ring-1 ring-slate-800">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-100">{title}</h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-slate-300"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {irreversibleNote && (
          <p className="rounded bg-amber-500/10 px-3 py-2 text-[11px] text-amber-300 ring-1 ring-amber-500/30">
            <AlertTriangle className="mr-1 inline h-3 w-3" /> {irreversibleNote}
          </p>
        )}

        {state.kind === 'invite' && (
          <div>
            <label className="text-[11px] text-slate-400">Email</label>
            <input
              type="email"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@shishka.health"
              className="mt-1 w-full rounded bg-slate-800 px-2.5 py-1.5 text-xs text-slate-100 ring-1 ring-slate-700 focus:outline-none focus:ring-emerald-500/50"
            />
          </div>
        )}

        {(state.kind === 'set_pin' || state.kind === 'rotate_pin') && (
          <div className="space-y-2">
            <div>
              <label className="text-[11px] text-slate-400">New PIN (≥6 digits)</label>
              <input
                type="password"
                inputMode="numeric"
                autoFocus
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                maxLength={12}
                className="mt-1 w-full rounded bg-slate-800 px-2.5 py-1.5 font-mono text-sm text-slate-100 ring-1 ring-slate-700 focus:outline-none focus:ring-emerald-500/50"
              />
            </div>
            <div>
              <label className="text-[11px] text-slate-400">Confirm PIN</label>
              <input
                type="password"
                inputMode="numeric"
                value={pinConfirm}
                onChange={(e) => setPinConfirm(e.target.value.replace(/\D/g, ''))}
                maxLength={12}
                className="mt-1 w-full rounded bg-slate-800 px-2.5 py-1.5 font-mono text-sm text-slate-100 ring-1 ring-slate-700 focus:outline-none focus:ring-emerald-500/50"
              />
            </div>
          </div>
        )}

        {state.kind === 'reset_password' && state.card.email && (
          <p className="rounded bg-slate-950/60 px-3 py-2 text-[11px] text-slate-400 ring-1 ring-slate-800">
            Reset link will be sent to <span className="text-slate-200">{state.card.email}</span>.
          </p>
        )}

        {error && (
          <p className="text-[11px] text-red-400">{error}</p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={onClose}
            className="rounded px-3 py-1.5 text-[11px] text-slate-400 hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={submitting}
            className="flex items-center gap-1.5 rounded bg-emerald-600 px-3 py-1.5 text-[11px] font-medium text-white transition hover:bg-emerald-500 disabled:opacity-50"
          >
            {submitting ? (
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <Check className="h-3 w-3" />
            )}
            Confirm
          </button>
        </div>
      </div>
    </div>
  )
}

export function StaffPage() {
  const {
    staff,
    leaveBalances,
    isLoading,
    updateStaff,
    inviteStaff,
    setStaffPin,
    resetStaffPassword,
  } = useStaffCards()
  const { role } = useAppRole()
  const [modal, setModal] = useState<ActionModalState | null>(null)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-500">
        Loading staff...
      </div>
    )
  }

  // Defense-in-depth: route guard already blocks cooks, but if anyone slips
  // past it, hide salary visibility instead of leaking data.
  if (role !== 'owner') {
    return (
      <div className="rounded-lg bg-slate-900/60 p-6 text-center text-sm text-slate-400 ring-1 ring-slate-800">
        Staff management is restricted to owners.
      </div>
    )
  }

  const actions: StaffActions = {
    invite: inviteStaff,
    setPin: setStaffPin,
    reset:  resetStaffPassword,
  }

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {staff.map((s) => (
          <StaffCardView
            key={s.id}
            card={s}
            leaves={leaveBalances.filter((l) => l.staff_id === s.id)}
            onUpdate={updateStaff}
            onOpenModal={setModal}
          />
        ))}
      </div>
      {modal && (
        <ActionModal
          state={modal}
          onClose={() => setModal(null)}
          actions={actions}
        />
      )}
    </>
  )
}

export default StaffPage
