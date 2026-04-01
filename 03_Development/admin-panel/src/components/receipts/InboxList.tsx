import { Loader2, RefreshCcw } from 'lucide-react'
import type { InboxRow } from '../../hooks/useReceiptInbox'

/* ────────────────────────── Status config ────────────────────────── */

const STATUS_BADGE: Record<InboxRow['status'], { label: string; cls: string }> = {
  pending: { label: 'Ожидает', cls: 'bg-amber-500/15 text-amber-400' },
  processing: { label: 'Обработка', cls: 'bg-blue-500/15 text-blue-400' },
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
}

/* ────────────────────────── Component ────────────────────────── */

export function InboxList({ rows, isLoading, error, onRefetch }: InboxListProps) {
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
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {rows.map((r) => {
                const badge = STATUS_BADGE[r.status]
                const dateStr = new Date(r.created_at).toLocaleString('ru-RU', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })
                return (
                  <tr key={r.id} className="hover:bg-slate-800/30">
                    <td className="px-3 py-2.5 text-slate-300">{dateStr}</td>
                    <td className="px-2 py-2.5 text-slate-200 font-medium">{r.uploaded_by}</td>
                    <td className="px-2 py-2.5 text-slate-400">{r.supplier_hint || '\u2014'}</td>
                    <td className="px-2 py-2.5 text-right text-slate-300">
                      {r.amount_hint != null
                        ? `\u0E3F${r.amount_hint.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
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
                            className="block h-8 w-8 overflow-hidden rounded border border-slate-700 bg-slate-800 hover:border-slate-500"
                          >
                            {url.endsWith('.pdf') ? (
                              <span className="flex h-full w-full items-center justify-center text-[8px] text-slate-400">
                                PDF
                              </span>
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
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
