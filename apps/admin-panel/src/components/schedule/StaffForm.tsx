import { useState } from 'react'
import { X } from 'lucide-react'
import type { Staff, StaffInsert, StaffUpdate } from '../../hooks/useStaff'

const ROLES: { value: Staff['role']; label: string }[] = [
  { value: 'cook', label: 'Cook' },
  { value: 'sous_chef', label: 'Sous Chef' },
  { value: 'admin', label: 'Admin' },
  { value: 'dishwasher', label: 'Dishwasher' },
  { value: 'prep', label: 'Prep' },
]

function generatePin(): string {
  return String(Math.floor(1000 + Math.random() * 9000))
}

interface StaffFormProps {
  staff?: Staff | null
  onSave: (data: StaffInsert | StaffUpdate) => Promise<unknown>
  onClose: () => void
}

export function StaffForm({ staff, onSave, onClose }: StaffFormProps) {
  const isEdit = !!staff
  const [name, setName] = useState(staff?.name ?? '')
  const [nameTh, setNameTh] = useState(staff?.name_th ?? '')
  const [role, setRole] = useState<Staff['role']>(staff?.role ?? 'cook')
  const [phone, setPhone] = useState(staff?.phone ?? '')
  const [pinCode, setPinCode] = useState(staff?.pin_code ?? '')
  const [isActive, setIsActive] = useState(staff?.is_active ?? true)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return

    setSaving(true)
    const payload = {
      name: name.trim(),
      name_th: nameTh.trim() || null,
      role,
      phone: phone.trim() || null,
      pin_code: pinCode.trim() || null,
      is_active: isActive,
    }
    await onSave(payload)
    setSaving(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-100">
            {isEdit ? 'Edit Staff Member' : 'New Staff Member'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3">
          {/* Name */}
          <div>
            <label className="mb-1 block text-xs text-slate-400">Name *</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Chef Somchai"
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
            />
          </div>

          {/* Name Thai */}
          <div>
            <label className="mb-1 block text-xs text-slate-400">Thai Name</label>
            <input
              type="text"
              value={nameTh}
              onChange={(e) => setNameTh(e.target.value)}
              placeholder="สมชาย"
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
            />
          </div>

          {/* Role */}
          <div>
            <label className="mb-1 block text-xs text-slate-400">Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as Staff['role'])}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
            >
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>

          {/* Phone */}
          <div>
            <label className="mb-1 block text-xs text-slate-400">Phone</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+66..."
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
            />
          </div>

          {/* PIN */}
          <div>
            <label className="mb-1 block text-xs text-slate-400">PIN Code (4 digits)</label>
            <div className="flex gap-2">
              <input
                type="text"
                maxLength={4}
                value={pinCode}
                onChange={(e) => setPinCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="1234"
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setPinCode(generatePin())}
                className="shrink-0 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-300 hover:bg-slate-700"
              >
                Generate
              </button>
            </div>
          </div>

          {/* Active */}
          {isEdit && (
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="h-4 w-4 rounded border-slate-600 bg-slate-800 text-emerald-500"
              />
              Active
            </label>
          )}
        </div>

        {/* Actions */}
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-sm text-slate-300 hover:bg-slate-700"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || !name.trim()}
            className="flex-1 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            {saving ? 'Saving...' : isEdit ? 'Save' : 'Create'}
          </button>
        </div>
      </form>
    </div>
  )
}
