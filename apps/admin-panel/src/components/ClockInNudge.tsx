import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlarmClock, Loader2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAppRole } from '../contexts/AppRoleContext'
import { useShiftClock } from '../hooks/useShiftClock'
import { toISODate, formatTime } from '../lib/staffSchedule'

interface TodayShift {
  id: string
  start_time: string
  end_time: string
}

/** Minutes since local midnight for a 'HH:MM:SS' time column. */
function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

function nowMinutes(): number {
  const d = new Date()
  return d.getHours() * 60 + d.getMinutes()
}

/** Show the clock-in prompt from 30 min before the shift starts. */
const LEAD_MIN = 30
/** Show the clock-out prompt from 30 min after the shift ends. */
const TRAIL_MIN = 30

/**
 * Sticky prompt to punch in/out, mounted on every authenticated page.
 *
 * The punch clock has existed since migration 310 and has never recorded a
 * single real punch — the button lives on one page nobody opens mid-shift.
 * Since the clock record is now the factual basis for pay and discipline
 * (LEG-004 §2), the prompt has to find the employee rather than the other way
 * round. Renders nothing when there's no shift today, when it's not near shift
 * time, or once the punch is in.
 */
export function ClockInNudge() {
  const { staffId } = useAppRole()
  const { isClockedIn, todayEvents, isSaving, clock } = useShiftClock(staffId)
  const [shift, setShift] = useState<TodayShift | null>(null)

  useEffect(() => {
    if (!staffId) {
      setShift(null)
      return
    }
    let cancelled = false

    supabase
      .from('shifts')
      .select('id, start_time, end_time')
      .eq('staff_id', staffId)
      .eq('shift_date', toISODate(new Date()))
      .neq('status', 'no_show')
      .order('start_time', { ascending: true })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setShift((data as TodayShift) ?? null)
      })

    return () => {
      cancelled = true
    }
  }, [staffId])

  if (!staffId || !shift) return null

  const now = nowMinutes()
  const start = timeToMinutes(shift.start_time)
  const end = timeToMinutes(shift.end_time)
  const hasClockedInToday = todayEvents.some((e) => e.event_type === 'clock_in')

  // Clock in: from 30 min before start until the punch lands.
  if (!hasClockedInToday && now >= start - LEAD_MIN) {
    const late = now > start
    return (
      <Banner
        tone={late ? 'urgent' : 'normal'}
        text={
          late
            ? `Your shift started at ${formatTime(shift.start_time)} — clock in now`
            : `Your shift starts at ${formatTime(shift.start_time)} — remember to clock in`
        }
        action="Start shift"
        isSaving={isSaving}
        onAction={() => clock('clock_in')}
      />
    )
  }

  // Clock out: 30 min past the shift end, still punched in.
  if (isClockedIn && now > end + TRAIL_MIN) {
    return (
      <Banner
        tone="normal"
        text={`Your shift ended at ${formatTime(shift.end_time)} — don't forget to clock out`}
        action="End shift"
        isSaving={isSaving}
        onAction={() => clock('clock_out')}
      />
    )
  }

  return null
}

function Banner({
  tone,
  text,
  action,
  isSaving,
  onAction,
}: {
  tone: 'normal' | 'urgent'
  text: string
  action: string
  isSaving: boolean
  onAction: () => void
}) {
  // Brand red is a tint/background only — never as text (3.1:1 on dark);
  // brick-soft carries the urgent wording. See src/index.css @theme header.
  const urgent = tone === 'urgent'
  return (
    <div
      className={[
        'mb-4 flex flex-wrap items-center gap-3 rounded-xl px-4 py-3 ring-1 ring-inset',
        urgent
          ? 'bg-[var(--color-royal-red)]/15 text-cream ring-[var(--color-brick-soft)]/40'
          : 'bg-[var(--color-royal-green)]/30 text-cream ring-[var(--color-forest-soft)]/30',
      ].join(' ')}
    >
      <AlarmClock
        className={['h-4 w-4 shrink-0', urgent ? 'text-brick-soft' : 'text-honey-300'].join(' ')}
      />
      <span className="min-w-0 flex-1 text-sm font-medium">{text}</span>
      <Link to="/staff/schedule" className="text-xs text-cream/50 underline-offset-2 hover:underline">
        My schedule
      </Link>
      <button
        onClick={onAction}
        disabled={isSaving}
        className={[
          'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50',
          urgent
            ? 'bg-[var(--color-royal-red)] text-cream hover:opacity-90'
            : 'bg-honey-300/20 text-honey-300 ring-1 ring-inset ring-honey-300/30 hover:bg-honey-300/30',
        ].join(' ')}
      >
        {isSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        {action}
      </button>
    </div>
  )
}

export default ClockInNudge
