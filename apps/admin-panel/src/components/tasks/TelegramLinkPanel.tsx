import { useState } from 'react'
import { Send, Copy, Check, Link2, RefreshCw } from 'lucide-react'
import type { Staff } from '../../hooks/useStaff'
import { useStaffTelegram, type GeneratedCode } from '../../hooks/useStaffTelegram'

interface TelegramLinkPanelProps {
  staff: Staff[]
}

export function TelegramLinkPanel({ staff }: TelegramLinkPanelProps) {
  const { links, isLoading, generateCode } = useStaffTelegram()
  const [generated, setGenerated] = useState<Record<string, GeneratedCode>>({})
  const [copied, setCopied] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const handleGenerate = async (staffId: string) => {
    setBusy(staffId)
    const code = await generateCode(staffId)
    setBusy(null)
    if (code) setGenerated((prev) => ({ ...prev, [staffId]: code }))
  }

  const handleCopy = async (staffId: string, link: string) => {
    await navigator.clipboard.writeText(link)
    setCopied(staffId)
    setTimeout(() => setCopied(null), 1500)
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 px-1 text-xs text-slate-400">
        <Send className="h-3.5 w-3.5" />
        <span className="font-medium">Telegram connections</span>
        <span className="text-slate-600">·</span>
        <span>Generate a link, send it to the staff member, they tap it to connect.</span>
      </div>

      {isLoading ? (
        <p className="text-xs text-slate-500">Loading…</p>
      ) : (
        staff.map((s) => {
          const link = links[s.id]
          const gen = generated[s.id]
          return (
            <div key={s.id} className="rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-slate-200">{s.name}</span>
                  {link ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] text-emerald-300">
                      <Check className="h-3 w-3" />
                      Connected{link.telegram_username ? ` · @${link.telegram_username}` : ''}
                    </span>
                  ) : (
                    <span className="rounded-full bg-slate-700/40 px-2 py-0.5 text-[10px] text-slate-400">
                      Not connected
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => handleGenerate(s.id)}
                  disabled={busy === s.id}
                  className="flex items-center gap-1.5 rounded-lg bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-slate-700 disabled:opacity-40"
                >
                  {link ? <RefreshCw className="h-3.5 w-3.5" /> : <Link2 className="h-3.5 w-3.5" />}
                  {link ? 'Re-link' : 'Generate link'}
                </button>
              </div>

              {gen && (
                <div className="mt-2 flex items-center gap-2 rounded-lg bg-slate-950/60 px-2.5 py-2">
                  <code className="flex-1 truncate text-[11px] text-emerald-300">{gen.deepLink}</code>
                  <button
                    type="button"
                    onClick={() => handleCopy(s.id, gen.deepLink)}
                    className="flex items-center gap-1 rounded-md bg-slate-800 px-2 py-1 text-[11px] text-slate-300 transition hover:bg-slate-700"
                  >
                    {copied === s.id ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                    {copied === s.id ? 'Copied' : 'Copy'}
                  </button>
                </div>
              )}
            </div>
          )
        })
      )}
    </div>
  )
}
