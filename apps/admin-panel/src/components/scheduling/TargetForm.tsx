import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { Channel } from '../../types/scheduling'
import type { UseProductionTargetsResult } from '../../hooks/useProductionTargets'
import { ChannelBadge } from './ChannelBadge'

interface NomenclatureOption {
  id: string
  name: string
  product_code: string
}

interface LocationOption {
  id: string
  name: string
}

const CHANNELS: Channel[] = ['dine_in', 'delivery', 'retail_L2', 'catering']

interface TargetFormProps {
  date: string
  onAdd: UseProductionTargetsResult['addTarget']
}

export function TargetForm({ date, onAdd }: TargetFormProps) {
  const [nomenclatureSearch, setNomenclatureSearch] = useState('')
  const [nomenclatureOptions, setNomenclatureOptions] = useState<NomenclatureOption[]>([])
  const [selectedNomenclature, setSelectedNomenclature] = useState<NomenclatureOption | null>(null)
  const [showDropdown, setShowDropdown] = useState(false)
  const [locations, setLocations] = useState<LocationOption[]>([])
  const [channel, setChannel] = useState<Channel>('dine_in')
  const [targetQty, setTargetQty] = useState('')
  const [deadlineTime, setDeadlineTime] = useState('12:00')
  const [locationId, setLocationId] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const searchRef = useRef<HTMLDivElement>(null)

  // Fetch locations once on mount
  useEffect(() => {
    supabase
      .from('locations')
      .select('id, name')
      .then(({ data }) => {
        if (data) setLocations(data as LocationOption[])
      })
  }, [])

  // Search nomenclature when query changes
  useEffect(() => {
    if (nomenclatureSearch.length < 2) {
      setNomenclatureOptions([])
      setShowDropdown(false)
      return
    }

    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from('nomenclature')
        .select('id, name, product_code')
        .in('type', ['PF', 'SALE'])
        .ilike('name', `%${nomenclatureSearch}%`)
        .limit(10)

      if (data) {
        setNomenclatureOptions(data as NomenclatureOption[])
        setShowDropdown(true)
      }
    }, 250)

    return () => clearTimeout(timer)
  }, [nomenclatureSearch])

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function handleSelectNomenclature(option: NomenclatureOption) {
    setSelectedNomenclature(option)
    setNomenclatureSearch(option.name)
    setShowDropdown(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedNomenclature) return
    if (!targetQty || Number(targetQty) <= 0) return

    setIsSubmitting(true)
    setSubmitError(null)

    const deadlineAt = `${date}T${deadlineTime}:00`

    const result = await onAdd({
      date,
      nomenclature_id: selectedNomenclature.id,
      channel,
      target_qty: Number(targetQty),
      deadline_at: deadlineAt,
      ...(locationId ? { location_id: locationId } : {}),
    })

    setIsSubmitting(false)

    if (result.ok) {
      setSelectedNomenclature(null)
      setNomenclatureSearch('')
      setTargetQty('')
      setDeadlineTime('12:00')
      setLocationId('')
      setChannel('dine_in')
    } else {
      setSubmitError(result.error ?? 'Failed to add target')
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 space-y-4"
    >
      <h2 className="text-sm font-semibold text-zinc-300">Add Production Target</h2>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Nomenclature search */}
        <div className="relative lg:col-span-1" ref={searchRef}>
          <label className="mb-1 block text-xs text-zinc-500">Product</label>
          <input
            type="text"
            value={nomenclatureSearch}
            onChange={(e) => {
              setNomenclatureSearch(e.target.value)
              if (selectedNomenclature && e.target.value !== selectedNomenclature.name) {
                setSelectedNomenclature(null)
              }
            }}
            placeholder="Search product name..."
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-emerald-500/50 focus:outline-none"
            required
          />
          {showDropdown && nomenclatureOptions.length > 0 && (
            <ul className="absolute z-10 mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-800 shadow-lg">
              {nomenclatureOptions.map((opt) => (
                <li
                  key={opt.id}
                  onMouseDown={() => handleSelectNomenclature(opt)}
                  className="cursor-pointer px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-700"
                >
                  <span className="font-medium">{opt.name}</span>
                  <span className="ml-2 text-xs text-zinc-500">{opt.product_code}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Channel */}
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Channel</label>
          <select
            value={channel}
            onChange={(e) => setChannel(e.target.value as Channel)}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white focus:border-emerald-500/50 focus:outline-none"
          >
            {CHANNELS.map((ch) => (
              <option key={ch} value={ch}>
                {ch === 'dine_in' ? 'Dine-in' :
                 ch === 'delivery' ? 'Delivery' :
                 ch === 'retail_L2' ? 'Retail L-2' :
                 'Catering'}
              </option>
            ))}
          </select>
          <div className="mt-1">
            <ChannelBadge channel={channel} />
          </div>
        </div>

        {/* Quantity */}
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Quantity</label>
          <input
            type="number"
            value={targetQty}
            onChange={(e) => setTargetQty(e.target.value)}
            min={1}
            placeholder="0"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-emerald-500/50 focus:outline-none"
            required
          />
        </div>

        {/* Deadline time */}
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Deadline (time)</label>
          <input
            type="time"
            value={deadlineTime}
            onChange={(e) => setDeadlineTime(e.target.value)}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white focus:border-emerald-500/50 focus:outline-none"
            required
          />
        </div>

        {/* Location (optional) */}
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Location (optional)</label>
          <select
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white focus:border-emerald-500/50 focus:outline-none"
          >
            <option value="">— any —</option>
            {locations.map((loc) => (
              <option key={loc.id} value={loc.id}>{loc.name}</option>
            ))}
          </select>
        </div>
      </div>

      {submitError && (
        <p className="text-xs text-red-400">{submitError}</p>
      )}

      <button
        type="submit"
        disabled={isSubmitting || !selectedNomenclature}
        className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-40 transition-colors"
      >
        {isSubmitting ? 'Adding…' : 'Add Target'}
      </button>
    </form>
  )
}
