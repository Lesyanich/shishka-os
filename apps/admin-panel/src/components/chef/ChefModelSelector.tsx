import { useState, useEffect, useRef } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import {
  AVAILABLE_MODELS,
  providerLabel,
  tierColor,
  type ModelOption,
  type Provider,
} from './modelCatalog'

interface ChefModelSelectorProps {
  value: ModelOption
  onChange: (m: ModelOption) => void
  disabled?: boolean
}

export function ChefModelSelector({ value, onChange, disabled }: ChefModelSelectorProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', handler)
    return () => window.removeEventListener('mousedown', handler)
  }, [open])

  const grouped: Record<Provider, ModelOption[]> = {
    anthropic: [],
    openai: [],
    google: [],
  }
  for (const m of AVAILABLE_MODELS) grouped[m.provider].push(m)

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        className="flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-800/60 px-2 py-1 text-[11px] text-slate-200 transition hover:border-slate-600 hover:bg-slate-800 disabled:opacity-50"
      >
        <span className={`rounded px-1 py-0.5 text-[9px] font-bold ${tierColor(value.tier)}`}>
          {providerLabel(value.provider)}
        </span>
        <span className="font-medium">{value.label}</span>
        <ChevronDown className="h-3 w-3 text-slate-400" />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-72 overflow-hidden rounded-lg border border-slate-700 bg-slate-900 shadow-xl">
          {(['anthropic', 'openai', 'google'] as Provider[]).map((p) => (
            <div key={p} className="border-b border-slate-800 last:border-b-0">
              <div className="bg-slate-950/50 px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider text-slate-500">
                {providerLabel(p)}
              </div>
              {grouped[p].map((m) => {
                const selected = m.provider === value.provider && m.id === value.id
                return (
                  <button
                    key={`${m.provider}-${m.id}`}
                    type="button"
                    onClick={() => {
                      onChange(m)
                      setOpen(false)
                    }}
                    className={`flex w-full items-start gap-2 px-3 py-2 text-left text-xs transition ${
                      selected ? 'bg-emerald-500/10' : 'hover:bg-slate-800'
                    }`}
                  >
                    <Check className={`mt-0.5 h-3 w-3 shrink-0 ${selected ? 'text-emerald-400' : 'text-transparent'}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium text-slate-100">{m.label}</span>
                        <span className={`rounded px-1 py-0.5 text-[8px] font-bold uppercase ${tierColor(m.tier)}`}>
                          {m.tier}
                        </span>
                      </div>
                      {m.notes && (
                        <div className="text-[10px] text-slate-500 mt-0.5">{m.notes}</div>
                      )}
                      <div className="text-[10px] text-slate-600 mt-0.5">
                        {m.context_window_k >= 1000
                          ? `${(m.context_window_k / 1000).toFixed(0)}M ctx`
                          : `${m.context_window_k}k ctx`}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
