import { useCallback, useEffect, useState } from 'react'
import { Edit3, Loader2, Plus, Save, Trash2, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'

type Supplier = {
  id: string
  name: string
  contact_info: string | null
  is_deleted: boolean
}

export function SupplierManager() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [isLoading, setIsLoading] = useState(false)

  // Modal state
  const [showModal, setShowModal] = useState(false)
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null)
  const [name, setName] = useState('')
  const [contactInfo, setContactInfo] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchSuppliers = useCallback(async () => {
    setIsLoading(true)
    const { data, error: fetchErr } = await supabase
      .from('suppliers')
      .select('id, name, contact_info, is_deleted')
      .eq('is_deleted', false)
      .order('name', { ascending: true })

    if (fetchErr) {
      console.error('[SupplierManager] Fetch error', fetchErr)
    } else {
      setSuppliers((data ?? []) as Supplier[])
    }
    setIsLoading(false)
  }, [])

  useEffect(() => {
    fetchSuppliers()
  }, [fetchSuppliers])

  const handleOpenCreate = () => {
    setEditingSupplier(null)
    setName('')
    setContactInfo('')
    setError(null)
    setShowModal(true)
  }

  const handleOpenEdit = (supplier: Supplier) => {
    setEditingSupplier(supplier)
    setName(supplier.name)
    setContactInfo(supplier.contact_info ?? '')
    setError(null)
    setShowModal(true)
  }

  const handleSoftDelete = async (id: string) => {
    const { error: delErr } = await supabase
      .from('suppliers')
      .update({ is_deleted: true })
      .eq('id', id)

    if (delErr) {
      console.error('[SupplierManager] Soft-delete error', delErr)
    } else {
      fetchSuppliers()
    }
  }

  const handleSave = async () => {
    if (!name.trim()) {
      setError('Supplier name is required')
      return
    }

    setIsSaving(true)
    setError(null)

    try {
      if (editingSupplier) {
        const { error: updateErr } = await supabase
          .from('suppliers')
          .update({
            name: name.trim(),
            contact_info: contactInfo.trim() || null,
          })
          .eq('id', editingSupplier.id)
        if (updateErr) throw updateErr
      } else {
        const { error: insertErr } = await supabase
          .from('suppliers')
          .insert({
            name: name.trim(),
            contact_info: contactInfo.trim() || null,
          })
        if (insertErr) throw insertErr
      }

      setShowModal(false)
      fetchSuppliers()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/50 shadow-sm">
      <header className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-100">Suppliers</h2>
          <p className="text-xs text-slate-500">
            Manage your ingredient suppliers
          </p>
        </div>
        <button
          type="button"
          onClick={handleOpenCreate}
          className="inline-flex h-8 items-center rounded-md border border-emerald-500/60 bg-emerald-500/10 px-3 text-[11px] font-medium text-emerald-200 hover:bg-emerald-500/20"
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          Add Supplier
        </button>
      </header>

      <div className="px-4 py-3">
        {isLoading ? (
          <div className="flex items-center justify-center py-8 text-xs text-slate-500">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading suppliers...
          </div>
        ) : suppliers.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-500">
            No suppliers yet. Add your first supplier to start logging
            purchases.
          </div>
        ) : (
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-[10px] uppercase tracking-wide text-slate-500">
                <th className="py-2 pr-3">Name</th>
                <th className="py-2 pr-3">Contact</th>
                <th className="py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {suppliers.map((s) => (
                <tr
                  key={s.id}
                  className="border-b border-slate-800/50 last:border-none"
                >
                  <td className="py-2.5 pr-3 font-medium text-slate-100">
                    {s.name}
                  </td>
                  <td className="py-2.5 pr-3 text-slate-400">
                    {s.contact_info || '--'}
                  </td>
                  <td className="py-2.5 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(s)}
                        className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-slate-700 text-slate-400 hover:border-emerald-500/50 hover:text-emerald-300"
                        aria-label="Edit supplier"
                      >
                        <Edit3 className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSoftDelete(s.id)}
                        className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-slate-700 text-slate-400 hover:border-red-500/50 hover:text-red-300"
                        aria-label="Delete supplier"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
              <h3 className="text-sm font-semibold text-slate-100">
                {editingSupplier ? 'Edit Supplier' : 'Add Supplier'}
              </h3>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 px-5 py-4">
              {error && (
                <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                  {error}
                </div>
              )}

              <div>
                <label className="mb-1 block text-xs text-slate-400">
                  Supplier Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Makro, Tops, Local Farm"
                  className="h-9 w-full rounded-md border border-slate-700 bg-slate-800 px-3 text-xs text-slate-100 outline-none focus:border-emerald-500"
                  autoFocus
                />
              </div>

              <div>
                <label className="mb-1 block text-xs text-slate-400">
                  Contact Info
                </label>
                <textarea
                  value={contactInfo}
                  onChange={(e) => setContactInfo(e.target.value)}
                  rows={2}
                  placeholder="Phone, email, address..."
                  className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-100 outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-800 px-5 py-3">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="h-8 rounded-md border border-slate-700 bg-slate-800 px-4 text-xs text-slate-300 hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className="inline-flex h-8 items-center rounded-md border border-emerald-500/60 bg-emerald-500/15 px-4 text-xs font-medium text-emerald-200 hover:bg-emerald-500/25 disabled:opacity-50"
              >
                {isSaving ? (
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                ) : (
                  <Save className="mr-1 h-3 w-3" />
                )}
                {editingSupplier ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
