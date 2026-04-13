import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChefHat, ArrowLeft, Globe } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useCook } from '../contexts/CookContext'
import { PinPad } from '../components/PinPad'
import type { StaffMember } from '../types/staff'

type Lang = 'en' | 'th'

export function LoginPage() {
  const navigate = useNavigate()
  const { login } = useCook()
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedStaff, setSelectedStaff] = useState<StaffMember | null>(null)
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [verifying, setVerifying] = useState(false)
  const [lang, setLang] = useState<Lang>(() => {
    const stored = localStorage.getItem('kds-lang')
    return stored === 'th' ? 'th' : 'en'
  })

  useEffect(() => {
    localStorage.setItem('kds-lang', lang)
  }, [lang])

  useEffect(() => {
    async function loadStaff() {
      const { data } = await supabase
        .from('staff')
        .select('id, name, name_th, role, preferred_language, skill_level, assigned_zone_id')
        .eq('is_active', true)
        .in('role', ['cook', 'sous_chef', 'prep'])
        .order('name')
      setStaff((data as StaffMember[]) ?? [])
      setIsLoading(false)
    }
    loadStaff()
  }, [])

  const handlePinDigit = useCallback((digit: string) => {
    setError(null)
    setPin(prev => prev.length >= 4 ? prev : prev + digit)
  }, [])

  const handleDelete = useCallback(() => {
    setPin(prev => prev.slice(0, -1))
    setError(null)
  }, [])

  // Auto-submit on 4 digits
  useEffect(() => {
    if (pin.length !== 4 || !selectedStaff) return

    async function verify() {
      setVerifying(true)
      setError(null)

      const { data, error: fetchErr } = await supabase
        .from('staff')
        .select('id, pin_code')
        .eq('id', selectedStaff!.id)
        .single()

      if (fetchErr || !data) {
        setError('Staff not found')
        setPin('')
        setVerifying(false)
        return
      }

      if (!data.pin_code) {
        setError('No PIN set. Ask manager.')
        setPin('')
        setVerifying(false)
        return
      }

      if (data.pin_code !== pin) {
        setError('Wrong PIN')
        setPin('')
        setVerifying(false)
        return
      }

      login(selectedStaff!)
      navigate('/dashboard')
    }
    verify()
  }, [pin, selectedStaff, navigate, login])

  // ─── Staff selection ─────────────────────────────────────────

  if (!selectedStaff) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center bg-slate-950 px-4">
        {/* Language toggle */}
        <div className="mb-6 flex items-center gap-2">
          <Globe className="h-4 w-4 text-slate-500" />
          {(['en', 'th'] as const).map(l => (
            <button
              key={l}
              type="button"
              onClick={() => setLang(l)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                lang === l
                  ? 'bg-emerald-500/20 text-emerald-300'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {l === 'en' ? 'EN' : 'TH'}
            </button>
          ))}
        </div>

        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/10">
            <ChefHat className="h-10 w-10 text-emerald-400" />
          </div>
          <h1 className="text-2xl font-bold text-slate-100">
            {lang === 'th' ? 'ใครทำอาหาร?' : "Who's cooking?"}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {lang === 'th' ? 'เลือกชื่อเพื่อเริ่ม' : 'Select your name to start'}
          </p>
        </div>

        {isLoading && (
          <div className="w-full max-w-md space-y-3">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="h-16 animate-pulse rounded-2xl bg-slate-800/50" />
            ))}
          </div>
        )}

        {!isLoading && (
          <div className="w-full max-w-md space-y-3">
            {staff.map(s => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSelectedStaff(s)}
                className="flex w-full items-center gap-4 rounded-2xl border border-slate-800 bg-slate-900/80 px-6 py-5 text-left transition hover:border-emerald-500/40 active:scale-[0.98]"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-xl font-bold text-emerald-400">
                  {s.name.charAt(0)}
                </div>
                <div>
                  <p className="text-lg font-semibold text-slate-100">{s.name}</p>
                  {s.name_th && <p className="text-sm text-slate-500">{s.name_th}</p>}
                </div>
              </button>
            ))}
            {staff.length === 0 && (
              <p className="text-center text-sm text-slate-500">No active cooks found</p>
            )}
          </div>
        )}
      </div>
    )
  }

  // ─── PIN entry ────────────────────────────────────────────────

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-slate-950 px-4">
      <button
        type="button"
        onClick={() => { setSelectedStaff(null); setPin(''); setError(null) }}
        className="mb-8 flex items-center gap-1 text-sm text-slate-500 hover:text-slate-300 transition"
      >
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      <div className="mb-8 text-center">
        <div className="mx-auto mb-3 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/10 text-3xl font-bold text-emerald-400">
          {selectedStaff.name.charAt(0)}
        </div>
        <h1 className="text-2xl font-bold text-slate-100">{selectedStaff.name}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {lang === 'th' ? 'ใส่ PIN 4 หลัก' : 'Enter your 4-digit PIN'}
        </p>
      </div>

      {/* PIN dots */}
      <div className="mb-8 flex gap-4">
        {[0, 1, 2, 3].map(i => (
          <div
            key={i}
            className={`h-5 w-5 rounded-full transition-all ${
              i < pin.length
                ? 'bg-emerald-400 scale-110'
                : 'bg-slate-700'
            }`}
          />
        ))}
      </div>

      {error && (
        <p className="mb-4 text-sm text-rose-400">{error}</p>
      )}

      {verifying && (
        <p className="mb-4 text-sm text-slate-400">Verifying...</p>
      )}

      <PinPad
        pin={pin}
        onDigit={handlePinDigit}
        onDelete={handleDelete}
        disabled={verifying}
      />
    </div>
  )
}
