import { useState } from 'react'
import {
  Shield,
  ChefHat,
  Pencil,
  X,
  Check,
  AlertTriangle,
  Plus,
  Loader2,
} from 'lucide-react'
import {
  useStaffCards,
  type StaffCard,
  type LeaveBalance,
  type StaffPatch,
  type NewStaff,
} from '../../hooks/use-staff-cards'

const ROLE_BADGE: Record<string, string> = {
  owner: 'bg-amber-500/15 text-amber-300',
  cook: 'bg-sky-500/15 text-sky-300',
}

const ROLE_ICON: Record<string, typeof Shield> = {
  owner: Shield,
  cook: ChefHat,
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

const EMPLOYMENT_TYPES = ['full_time', 'part_time', 'contract', 'probation']
const STAFF_ROLES = ['cook', 'helper', 'prep', 'dishwasher', 'sous_chef', 'admin', 'cashier']

function StaffCardView({
  card,
  leaves,
  onUpdate,
}: {
  card: StaffCard
  leaves: LeaveBalance[]
  onUpdate: (id: string, patch: StaffPatch) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<StaffPatch>({})

  const RoleIcon = ROLE_ICON[card.app_role] ?? Shield

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

function AddStaffForm({
  onCreate,
  onCancel,
}: {
  onCreate: (data: NewStaff) => Promise<{ ok: boolean }>
  onCancel: () => void
}) {
  const [draft, setDraft] = useState<NewStaff>({
    name: '',
    role: 'cook',
    employment_type: 'full_time',
  })
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!draft.name.trim()) return
    setSaving(true)
    const { ok } = await onCreate(draft)
    setSaving(false)
    if (ok) onCancel()
  }

  return (
    <div className="rounded-xl ring-1 ring-emerald-500/30 bg-slate-900/50 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-emerald-400">New Staff Member</h3>
        <div className="flex gap-1">
          <button
            onClick={handleSave}
            disabled={saving || !draft.name.trim()}
            className="rounded p-1 text-emerald-400 hover:bg-emerald-500/15 transition disabled:opacity-40"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          </button>
          <button
            onClick={onCancel}
            className="rounded p-1 text-slate-500 hover:bg-slate-800 transition"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
        <EditField
          label="Name *"
          value={draft.name}
          onChange={(v) => setDraft({ ...draft, name: v })}
        />
        <div>
          <label className="text-slate-500">Role *</label>
          <select
            value={draft.role}
            onChange={(e) => setDraft({ ...draft, role: e.target.value })}
            className="mt-0.5 w-full rounded bg-slate-800 px-2 py-1 text-xs text-slate-200 ring-1 ring-slate-700 focus:ring-emerald-500/50 focus:outline-none"
          >
            {STAFF_ROLES.map((r) => (
              <option key={r} value={r}>{r.replace('_', ' ')}</option>
            ))}
          </select>
        </div>
        <EditField
          label="Salary (THB)"
          type="number"
          value={draft.monthly_salary ?? ''}
          onChange={(v) => setDraft({ ...draft, monthly_salary: v ? Number(v) : null })}
        />
        <div>
          <label className="text-slate-500">Employment Type</label>
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
        <EditField
          label="Nationality"
          value={draft.nationality ?? ''}
          onChange={(v) => setDraft({ ...draft, nationality: v || null })}
        />
        <EditField
          label="Hire Date"
          type="date"
          value={draft.hire_date ?? ''}
          onChange={(v) => setDraft({ ...draft, hire_date: v || null })}
        />
        <EditField
          label="Phone"
          value={draft.phone ?? ''}
          onChange={(v) => setDraft({ ...draft, phone: v || null })}
        />
      </div>
    </div>
  )
}

export function StaffPage() {
  const { staff, leaveBalances, isLoading, updateStaff, createStaff } = useStaffCards()
  const [showAddForm, setShowAddForm] = useState(false)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-500">
        Loading staff...
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">{staff.length} staff member(s)</p>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-500"
        >
          <Plus className="h-3 w-3" />
          Add Staff
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {showAddForm && (
          <AddStaffForm
            onCreate={createStaff}
            onCancel={() => setShowAddForm(false)}
          />
        )}
        {staff.map((s) => (
          <StaffCardView
            key={s.id}
            card={s}
            leaves={leaveBalances.filter((l) => l.staff_id === s.id)}
            onUpdate={updateStaff}
          />
        ))}
      </div>
    </div>
  )
}

export default StaffPage
