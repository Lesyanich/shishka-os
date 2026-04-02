import { useState } from 'react'
import { Plus, Pencil, Trash2, Loader2 } from 'lucide-react'
import { useStaff } from '../../hooks/useStaff'
import type { Staff, StaffInsert, StaffUpdate } from '../../hooks/useStaff'
import { StaffForm } from './StaffForm'
import { KitchenQR } from './KitchenQR'

const ROLE_LABELS: Record<string, string> = {
  cook: 'Cook',
  sous_chef: 'Sous Chef',
  admin: 'Admin',
  dishwasher: 'Dishwasher',
  prep: 'Prep',
}

const ROLE_COLORS: Record<string, string> = {
  cook: 'bg-emerald-500/20 text-emerald-300',
  sous_chef: 'bg-sky-500/20 text-sky-300',
  admin: 'bg-amber-500/20 text-amber-300',
  dishwasher: 'bg-slate-500/20 text-slate-300',
  prep: 'bg-violet-500/20 text-violet-300',
}

export function StaffList() {
  const { staff, isLoading, error, createStaff, updateStaff, deleteStaff } = useStaff()
  const [filterRole, setFilterRole] = useState<string>('all')
  const [formOpen, setFormOpen] = useState(false)
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null)

  const filtered = filterRole === 'all' ? staff : staff.filter((s) => s.role === filterRole)

  function handleEdit(s: Staff) {
    setEditingStaff(s)
    setFormOpen(true)
  }

  function handleNew() {
    setEditingStaff(null)
    setFormOpen(true)
  }

  async function handleSave(data: StaffInsert | StaffUpdate) {
    if (editingStaff) {
      await updateStaff(editingStaff.id, data as StaffUpdate)
    } else {
      await createStaff(data as StaffInsert)
    }
  }

  async function handleDelete(s: Staff) {
    if (!confirm(`Delete staff member "${s.name}"?`)) return
    await deleteStaff(s.id)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-slate-500">
        <Loader2 className="mr-2 h-5 w-5 animate-spin text-emerald-500" />
        Loading...
      </div>
    )
  }

  return (
    <div>
      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select
          value={filterRole}
          onChange={(e) => setFilterRole(e.target.value)}
          className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
        >
          <option value="all">All roles</option>
          <option value="cook">Cook</option>
          <option value="sous_chef">Sous Chef</option>
          <option value="admin">Admin</option>
          <option value="dishwasher">Dishwasher</option>
          <option value="prep">Prep</option>
        </select>
        <div className="flex-1" />
        <button
          onClick={handleNew}
          className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500"
        >
          <Plus className="h-4 w-4" />
          Add
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-rose-500/30 bg-rose-500/5 p-3 text-sm text-rose-300">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-900/50 text-left text-xs text-slate-400">
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Role</th>
              <th className="hidden px-4 py-3 sm:table-cell">Phone</th>
              <th className="hidden px-4 py-3 sm:table-cell">PIN</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  No staff members
                </td>
              </tr>
            ) : (
              filtered.map((s) => (
                <tr
                  key={s.id}
                  className="border-b border-slate-800/50 transition hover:bg-slate-800/30"
                >
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-100">{s.name}</p>
                    {s.name_th && (
                      <p className="text-xs text-slate-500">{s.name_th}</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${ROLE_COLORS[s.role] ?? ''}`}
                    >
                      {ROLE_LABELS[s.role] ?? s.role}
                    </span>
                  </td>
                  <td className="hidden px-4 py-3 text-slate-400 sm:table-cell">
                    {s.phone ?? '—'}
                  </td>
                  <td className="hidden px-4 py-3 font-mono text-slate-400 sm:table-cell">
                    {s.pin_code ?? '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block h-2 w-2 rounded-full ${s.is_active ? 'bg-emerald-500' : 'bg-slate-600'}`}
                    />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => handleEdit(s)}
                        className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                        title="Edit"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(s)}
                        className="rounded-lg p-2 text-slate-400 hover:bg-rose-500/10 hover:text-rose-400"
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Kitchen QR */}
      <KitchenQR />

      {/* Form modal */}
      {formOpen && (
        <StaffForm
          staff={editingStaff}
          onSave={handleSave}
          onClose={() => setFormOpen(false)}
        />
      )}
    </div>
  )
}
