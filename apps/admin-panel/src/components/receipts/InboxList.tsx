import { useState } from 'react'
import { ChevronRight, Loader2, RefreshCcw, Trash2 } from 'lucide-react'
import type { InboxRow } from '../../hooks/useReceiptInbox'
import { InboxReviewPanel } from './InboxReviewPanel'

/* ────────────────────────── Status config ────────────────────────── */

const STATUS_BADGE: Record<InboxRow['status'], { label: string; cls: string }> = {
  pending: { label: 'Ожидает', cls: 'bg-amber-500/15 text-amber-400' },
  processing: { label: 'Обработка', cls: 'bg-blue-500/15 text-blue-400' },
  parsed: { label: 'Ревью', cls: 'bg-indigo-500/15 text-indigo-400' },
  processed: { label: 'Готово', cls: 'bg-emerald-500/15 text-emerald-400' },
  error: { label: 'Ошибка', cls: 'bg-rose-500/15 text-rose-400' },
  skipped: { label: 'Пропущен', cls: 'bg-slate-500/15 text-slate-400' },
}

/* ────────────────────────── Props ────────────────────────── */

interface InboxListProps {
  rows: InboxRow[]
  isLoading: boolean
  error: string | null
  onRefetch: () => void
  onApprove: (inboxId: string, payload: Record<string, unknown>) => Promise<{ ok: boolean; error?: string }>
  onSkip: (inboxId: string) => Promise<string | null>
  onReopen: (inboxId: string) => Promise<string | null>
  onDelete: (inboxId: string) => Promise<string | null>
}

/* ────────────────────────── Component ────────────────────────── */

export function InboxList({ rows, isLoading, error, onRefetch, onApprove, onSkip, onReopen, onDelete }: InboxListProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    if (!window.confirm('Удалить этот чек из inbox?')) return
    setDeletingId(id)
    const err = await onDelete(id)
    setDeletingId(null)
    if (err) window.alert(err)
  }

  if (error) {
    return (
      <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-6">
        <p className="text-xs text-rose-400">{error}</p>
      </section>
    )
  }

  if (isLoading) {
    return (
      <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-6">
        <div className="flex items-center justify-center py-8 text-xs text-slate-500">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Loading...
        </div>
      </section>
    )
  }

  return (
    <section className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/60 shadow-sm">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-slate-100">Загруженные чеки</h2>
          <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] text-slate-400">
            {rows.length}
          </span>
        </div>
        <button
          type="button"
          onClick={onRefetch}
          className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-slate-300"
        >
          <RefreshCcw className="h-3 w-3" /> Refresh
        </button>
      </header>

      {rows.length === 0 ? (
        <div className="py-10 text-center text-xs text-slate-500">
          Пока нет загруженных чеков
        </div>
      ) : (
        <div className="max-h-[520px] overflow-y-auto">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 z-10 bg-slate-900 text-[10px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Дата загрузки</th>
                <th className="px-2 py-2">Кто</th>
                <th className="px-2 py-2">Поставщик</th>
                <th className="px-2 py-2 text-right">Сумма</th>
                <th className="px-2 py-2 text-center">Статус</th>
                <th className="px-2 py-2 text-center">Фото</th>
                <th className="w-10 px-1 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {rows.map((r) => {
                const badge = STATUS_BADGE[r.status]
                const isExpanded = expandedId === r.id
                const canExpand = r.parsed_payload && ['parsed', 'processed', 'skipped', 'error'].includes(r.status)
                const pp = r.parsed_payload as Record<string, any> | null

                // Use parsed data for supplier/amount if available
                const supplier = pp?.supplier_name || r.supplier_hint || '\u2014'
                const amount = pp?.amount_original ?? r.amount_hint

                const dateStr = new Date(r.created_at).toLocaleString('ru-RU', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })
                return (
                  <>
                    <tr
                      key={r.id}
                      className={`hover:bg-slate-800/30 ${canExpand ? 'cursor-pointer' : ''} ${isExpanded ? 'bg-slate-800/40' : ''}`}
                      onClick={() => canExpand && setExpandedId(isExpanded ? null : r.id)}
                    >
                      <td className="px-3 py-2.5 text-slate-300">
                        <span className="flex items-center gap-1">
                          {canExpand && (
                            <ChevronRight className={`h-3 w-3 text-slate-500 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                          )}
                          {dateStr}
                        </span>
                      </td>
                      <td className="px-2 py-2.5 text-slate-200 font-medium">{r.uploaded_by}</td>
                      <td className="px-2 py-2.5 text-slate-400">{supplier}</td>
                      <td className="px-2 py-2.5 text-right text-slate-300">
                        {amount != null
                          ? `\u0E3F${Number(amount).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
                          : '\u2014'}
                      </td>
                      <td className="px-2 py-2.5 text-center">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-[9px] font-medium ${badge.cls}`}>
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-2 py-2.5">
                        <div className="flex items-center justify-center gap-1">
                          {r.photo_urls.slice(0, 3).map((url, i) => (
                            <a
                              key={i}
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="block h-8 w-8 overflow-hidden rounded border border-slate-700 bg-slate-800 hover:border-slate-500"
                            >
                              {url.endsWith('.pdf') ? (
                                <span className="flex h-full w-full items-center justify-center text-[8px] text-slate-400">PDF</span>
                              ) : (
                                <img src={url} alt="" className="h-full w-full object-cover" />
                              )}
                            </a>
                          ))}
                          {r.photo_urls.length > 3 && (
                            <span className="text-[9px] text-slate-500">+{r.photo_urls.length - 3}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-1 py-2.5 text-center">
                        {r.expense_id ? (
                          <span className="text-[9px] text-emerald-500/50" title="Записан в систему">✓</span>
                        ) : (
                          <button
                            type="button"
                            onClick={(e) => handleDelete(e, r.id)}
                            disabled={deletingId === r.id}
                            className="rounded p-1 text-slate-600 hover:bg-slate-700 hover:text-rose-400 disabled:opacity-40"
                            title="Удалить чек"
                          >
                            {deletingId === r.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5" />
                            )}
                          </button>
                        )}
                      </td>
                    </tr>
                    {isExpanded && r.parsed_payload && (
                      <tr key={`${r.id}-review`}>
                        <td colSpan={7} className="border-t border-indigo-500/20 bg-slate-900/80 px-0 py-0">
                          <InboxReviewPanel row={r} onApprove={onApprove} onSkip={onSkip} onReopen={onReopen} />
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
