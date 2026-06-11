import { useEffect, useState } from 'react'
import { Check, ClipboardList, Copy, Loader2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'

/**
 * Owner settings for the public staff stock sheet (/stock): the shared passcode
 * and the shareable link. Reads/writes app_config (authenticated-only via RLS).
 */
export function StockSheetSettings() {
  const [passcode, setPasscode] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const link =
    typeof window !== 'undefined' ? `${window.location.origin}/stock` : '/stock'

  useEffect(() => {
    let active = true
    supabase
      .from('app_config')
      .select('value')
      .eq('key', 'stock_sheet_passcode')
      .maybeSingle()
      .then(({ data, error: err }) => {
        if (!active) return
        if (err) setError(err.message)
        else setPasscode(data?.value ?? '')
        setIsLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  async function handleSave() {
    setIsSaving(true)
    setSaved(false)
    setError(null)
    const { error: err } = await supabase
      .from('app_config')
      .upsert(
        { key: 'stock_sheet_passcode', value: passcode.trim(), updated_at: new Date().toISOString() },
        { onConflict: 'key' },
      )
    setIsSaving(false)
    if (err) {
      setError(err.message)
      return
    }
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  function handleCopy() {
    navigator.clipboard?.writeText(link).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="space-y-4 rounded-xl border border-slate-700/50 bg-slate-800/30 p-4">
      <div className="flex items-center gap-2">
        <ClipboardList className="h-4 w-4 text-emerald-400" />
        <h3 className="text-sm font-bold text-slate-100">Staff Stock Sheet</h3>
      </div>
      <p className="text-xs text-slate-500">
        Share the link with kitchen staff. They enter this code to mark what's running
        low — no login needed.
      </p>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {error}
        </div>
      )}

      {/* Shareable link */}
      <div>
        <label className="mb-1 block text-[11px] text-slate-500">Link</label>
        <div className="flex gap-2">
          <input
            readOnly
            value={link}
            className="h-9 flex-1 rounded-md border border-slate-700 bg-slate-900 px-3 text-xs text-slate-300 outline-none"
          />
          <button
            onClick={handleCopy}
            className="flex h-9 items-center gap-1.5 rounded-md border border-slate-700 px-3 text-xs text-slate-300 transition hover:bg-slate-800"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>

      {/* Passcode */}
      <div>
        <label className="mb-1 block text-[11px] text-slate-500">Passcode</label>
        <div className="flex gap-2">
          <input
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            disabled={isLoading}
            inputMode="numeric"
            placeholder={isLoading ? 'Loading...' : 'e.g. 2468'}
            className="h-9 w-32 rounded-md border border-slate-700 bg-slate-800 px-3 text-sm tracking-widest text-slate-100 outline-none focus:border-emerald-500"
          />
          <button
            onClick={handleSave}
            disabled={isSaving || isLoading || !passcode.trim()}
            className="flex h-9 items-center justify-center gap-1.5 rounded-md bg-emerald-600 px-4 text-xs font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"
          >
            {isSaving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : saved ? (
              <Check className="h-3.5 w-3.5" />
            ) : null}
            {saved ? 'Saved' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
