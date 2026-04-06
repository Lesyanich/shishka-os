import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChefHat, ArrowLeft, Delete } from 'lucide-react'
import { supabase } from '../lib/supabase'

interface StaffMember {
  id: string
  name: string
  name_th: string | null
  role: string
}

export function CookLogin() {
  const navigate = useNavigate()
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedStaff, setSelectedStaff] = useState<StaffMember | null>(null)
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [verifying, setVerifying] = useState(false)

  useEffect(() => {
    async function loadStaff() {
      const { data } = await supabase
        .from('staff')
        .select('id, name, name_th, role')
        .eq('is_active', true)
        .in('role', ['cook', 'sous_chef', 'prep'])
        .order('name')
      setStaff(data ?? [])
      setIsLoading(false)
    }
    loadStaff()
  }, [])

  const handlePinDigit = useCallback((digit: string) => {
    setError(null)
    setPin(prev => {
      if (prev.length >= 4) return prev
      return prev + digit
    })
  }, [])

  const handleDelete = useCallback(() => {
    setPin(prev => prev.slice(0, -1))
    setError(null)
  }, [])

  // Auto-submit when 4 digits entered
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

      // Success — store cook session and navigate to tasks
      sessionStorage.setItem('cook_staff_id', selectedStaff!.id)
      sessionStorage.setItem('cook_staff_name', selectedStaff!.name)
      navigate('/tasks')
    }
    verify()
  }, [pin, selectedStaff, navigate])

  // Staff selection screen
  if (!selectedStaff) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-4">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10">
            <ChefHat className="h-8 w-8 text-emerald-400" />
          </div>
          <h1 className="text-xl font-bold text-slate-100">Who's cooking?</h1>
          <p className="mt-1 text-xs text-slate-500">Select your name to start</p>
        </div>

        {isLoading && (
          <div className="space-y-3 w-full max-w-sm">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="h-14 animate-pulse rounded-2xl bg-slate-800/50" />
            ))}
          </div>
        )}

        {!isLoading && (
          <div className="w-full max-w-sm space-y-3">
            {staff.map(s => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSelectedStaff(s)}
                className="flex w-full items-center gap-4 rounded-2xl border border-slate-800 bg-slate-900/80 px-5 py-4 text-left transition hover:border-emerald-500/40 active:scale-[0.98]"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/10 text-lg font-bold text-emerald-400">
                  {s.name.charAt(0)}
                </div>
                <div>
                  <p className="text-base font-semibold text-slate-100">{s.name}</p>
                  {s.name_th && <p className="text-xs text-slate-500">{s.name_th}</p>}
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

  // PIN entry screen
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-4">
      <button
        type="button"
        onClick={() => { setSelectedStaff(null); setPin(''); setError(null) }}
        className="mb-6 flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 transition"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back
      </button>

      <div className="mb-6 text-center">
        <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10 text-2xl font-bold text-emerald-400">
          {selectedStaff.name.charAt(0)}
        </div>
        <h1 className="text-xl font-bold text-slate-100">{selectedStaff.name}</h1>
        <p className="mt-1 text-xs text-slate-500">Enter your 4-digit PIN</p>
      </div>

      {/* PIN dots */}
      <div className="mb-6 flex gap-3">
        {[0, 1, 2, 3].map(i => (
          <div
            key={i}
            className={`h-4 w-4 rounded-full transition-all ${
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

      {/* Numpad */}
      <div className="grid w-64 grid-cols-3 gap-3">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'].map(key => {
          if (key === '') return <div key="empty" />
          if (key === 'del') {
            return (
              <button
                key="del"
                type="button"
                onClick={handleDelete}
                disabled={verifying}
                className="flex h-16 items-center justify-center rounded-2xl bg-slate-800 text-slate-400 transition active:bg-slate-700 disabled:opacity-50"
              >
                <Delete className="h-5 w-5" />
              </button>
            )
          }
          return (
            <button
              key={key}
              type="button"
              onClick={() => handlePinDigit(key)}
              disabled={verifying || pin.length >= 4}
              className="flex h-16 items-center justify-center rounded-2xl bg-slate-800 text-xl font-bold text-slate-100 transition active:bg-emerald-500/20 active:text-emerald-300 disabled:opacity-50"
            >
              {key}
            </button>
          )
        })}
      </div>
    </div>
  )
}
