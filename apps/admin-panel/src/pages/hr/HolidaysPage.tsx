import { useState } from 'react'
import { AlertTriangle, CalendarDays, Check, Loader2, RefreshCw, Store } from 'lucide-react'
import { useHolidays, type HolidayCredit } from '../../hooks/useHolidays'

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

const KIND_BADGE: Record<string, string> = {
  fixed: 'bg-slate-700 text-slate-300',
  lunar: 'bg-violet-500/15 text-violet-300',
  substitute: 'bg-sky-500/15 text-sky-300',
  special: 'bg-amber-500/15 text-amber-300',
}

/** Spend one substitute day — pick the date actually taken off. */
function UseCreditRow({
  credit,
  onUse,
}: {
  credit: HolidayCredit
  onUse: (id: string, usedOn: string) => Promise<void>
}) {
  const [date, setDate] = useState('')
  const [saving, setSaving] = useState(false)

  return (
    <div className="flex flex-wrap items-center gap-2 py-1 text-xs">
      <span className="w-24 font-medium text-slate-300">{credit.staff_name}</span>
      <span className="w-32 text-slate-500">earned {formatDate(credit.earned_for)}</span>
      <input
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        className="rounded bg-slate-800 px-2 py-1 text-xs text-slate-200 ring-1 ring-slate-700 focus:outline-none"
      />
      <button
        disabled={!date || saving}
        onClick={async () => {
          setSaving(true)
          await onUse(credit.id, date)
          setSaving(false)
        }}
        className="rounded bg-emerald-600 px-2 py-1 text-[11px] font-medium text-white transition hover:bg-emerald-500 disabled:opacity-40"
      >
        {saving ? 'Saving…' : 'Mark taken'}
      </button>
    </div>
  )
}

export function HolidaysPage() {
  const year = new Date().getFullYear()
  const {
    holidays,
    balances,
    credits,
    isLoading,
    setCompanyClosed,
    syncCredits,
    markCreditUsed,
    reopenCredit,
  } = useHolidays(year)
  const [syncing, setSyncing] = useState(false)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-500">
        Loading holidays...
      </div>
    )
  }

  const owed = credits.filter((c) => c.status === 'owed')
  const settled = credits.filter((c) => c.status !== 'owed')
  const tradedThrough = holidays.filter((h) => !h.is_company_closed)
  const unconfirmed = holidays.filter((h) => !h.is_confirmed)
  const lunarCount = holidays.filter((h) => h.kind === 'lunar').length

  return (
    <div className="space-y-5">
      {/* Substitute days owed */}
      <section className="rounded-lg ring-1 ring-slate-800">
        <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900/50 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-200">Substitute days off</h2>
            <p className="text-[11px] text-slate-500">
              Earned by working a public holiday. Thai law lets a restaurant give a substitute
              day instead of holiday-rate pay (LPA §29) — this is that ledger.
            </p>
          </div>
          <button
            onClick={async () => {
              setSyncing(true)
              await syncCredits()
              setSyncing(false)
            }}
            disabled={syncing}
            className="flex items-center gap-1.5 rounded-md bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-300 ring-1 ring-slate-700 transition hover:bg-slate-700 disabled:opacity-50"
            title="Grant credits for every holiday actually worked. Safe to re-run."
          >
            {syncing ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}
            Sync from attendance
          </button>
        </div>

        <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
          {balances.map((b) => (
            <div
              key={b.staff_id}
              className={`rounded-lg p-3 ring-1 ${
                b.days_owed > 0
                  ? 'bg-emerald-500/10 ring-emerald-700/50'
                  : 'bg-slate-900/40 ring-slate-800'
              }`}
            >
              <p className="text-xs font-medium text-slate-300">{b.staff_name}</p>
              <p
                className={`mt-1 text-2xl font-bold ${
                  b.days_owed > 0 ? 'text-emerald-300' : 'text-slate-600'
                }`}
              >
                {b.days_owed}
              </p>
              <p className="text-[10px] text-slate-500">
                day(s) owed{b.days_used > 0 ? ` · ${b.days_used} taken` : ''}
              </p>
            </div>
          ))}
        </div>

        {owed.length > 0 && (
          <div className="border-t border-slate-800 px-4 py-3">
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
              Outstanding — mark the day when it is actually taken
            </p>
            {owed.map((c) => (
              <UseCreditRow
                key={c.id}
                credit={c}
                onUse={async (id, usedOn) => { await markCreditUsed(id, usedOn) }}
              />
            ))}
          </div>
        )}

        {settled.length > 0 && (
          <details className="border-t border-slate-800 px-4 py-2">
            <summary className="cursor-pointer text-[11px] text-slate-500">
              {settled.length} settled ({settled.filter((c) => c.status === 'paid_out').length} paid
              in cash, {settled.filter((c) => c.status === 'used').length} taken as days off)
            </summary>
            <div className="mt-2 space-y-1">
              {settled.map((c) => (
                <div key={c.id} className="flex items-center gap-2 text-[11px] text-slate-500">
                  <span className="w-24 text-slate-400">{c.staff_name}</span>
                  <span className="w-28">{formatDate(c.earned_for)}</span>
                  <span className="w-16">{c.status}</span>
                  <span className="flex-1 truncate">{c.used_on ? `taken ${c.used_on}` : c.note}</span>
                  {c.status === 'used' && (
                    <button
                      onClick={() => reopenCredit(c.id)}
                      className="text-slate-500 hover:text-slate-300"
                    >
                      undo
                    </button>
                  )}
                </div>
              ))}
            </div>
          </details>
        )}
      </section>

      {/* Gaps warning */}
      {(lunarCount < 4 || unconfirmed.length > 0) && (
        <div className="flex gap-2 rounded-lg bg-amber-500/10 px-4 py-3 ring-1 ring-amber-700/40">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <div className="text-xs text-amber-200/80">
            <p className="font-medium text-amber-300">The {year} calendar is incomplete</p>
            <p className="mt-0.5">
              Only {lunarCount} of the 4 lunar holidays are present. Asalha Bucha and Khao Phansa
              fall in July and are missing — if the shop traded on either, more substitute days are
              owed than shown above. Lunar dates move every year and must be copied from the
              official published list, never guessed.
            </p>
          </div>
        </div>
      )}

      {/* Calendar */}
      <section className="rounded-lg ring-1 ring-slate-800">
        <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900/50 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-200">
              Public holidays {year}
            </h2>
            <p className="text-[11px] text-slate-500">
              {holidays.length} in the calendar · {tradedThrough.length} traded through · the
              schedule generator skips every one of these dates
            </p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-900/60 text-slate-400">
                <th className="px-3 py-2 text-left font-medium">Date</th>
                <th className="px-3 py-2 text-left font-medium">Holiday</th>
                <th className="px-2 py-2 text-left font-medium">Type</th>
                <th className="px-2 py-2 text-center font-medium">Shop</th>
                <th className="px-3 py-2 text-left font-medium">Note</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {holidays.map((h) => {
                const past = new Date(h.holiday_date) < new Date()
                return (
                  <tr key={h.holiday_date} className={past ? 'opacity-60' : ''}>
                    <td className="whitespace-nowrap px-3 py-2 text-slate-300">
                      {formatDate(h.holiday_date)}
                    </td>
                    <td className="px-3 py-2 text-slate-300">
                      {h.name_en}
                      {h.name_th && (
                        <span className="ml-1.5 text-slate-600">{h.name_th}</span>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      <span className={`rounded px-1.5 py-0.5 text-[10px] ${KIND_BADGE[h.kind]}`}>
                        {h.kind}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-center">
                      <button
                        onClick={() => setCompanyClosed(h.holiday_date, !h.is_company_closed)}
                        className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-medium transition ${
                          h.is_company_closed
                            ? 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                            : 'bg-amber-500/15 text-amber-300 hover:bg-amber-500/25'
                        }`}
                        title={
                          h.is_company_closed
                            ? 'Closed. Click if we actually traded that day.'
                            : 'We traded through this holiday — staff who worked it earn a substitute day.'
                        }
                      >
                        {h.is_company_closed ? (
                          <>
                            <CalendarDays className="h-3 w-3" /> closed
                          </>
                        ) : (
                          <>
                            <Store className="h-3 w-3" /> open
                          </>
                        )}
                      </button>
                    </td>
                    <td className="px-3 py-2 text-[11px] text-slate-500">
                      {h.is_confirmed ? null : (
                        <span className="mr-1 text-amber-400">unconfirmed ·</span>
                      )}
                      {h.note ? (
                        <span title={h.note}>{h.note.slice(0, 70)}{h.note.length > 70 ? '…' : ''}</span>
                      ) : (
                        <span className="text-slate-700">
                          {h.is_confirmed ? <Check className="inline h-3 w-3" /> : null}
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

export default HolidaysPage
