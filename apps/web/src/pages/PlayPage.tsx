import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

/**
 * "Shishka Slice" — a Fruit-Ninja-style mini-game.
 * Objects are ONLY items Shishka actually serves (fruits, vegetables, herbs, drinks).
 * Reach the target score inside the timer to unlock a 15%-off code.
 * Self-contained: HTML5 Canvas + rAF, no dependencies.
 */

// Only ingredients & drinks we actually serve. { emoji, juice color }
const ITEMS: { e: string; c: string }[] = [
  { e: '🍅', c: '#E4572E' }, { e: '🥒', c: '#7CB342' }, { e: '🥕', c: '#FB8C00' },
  { e: '🫑', c: '#43A047' }, { e: '🥑', c: '#7CB342' }, { e: '🍋', c: '#E7C900' },
  { e: '🍊', c: '#F59E0B' }, { e: '🥭', c: '#F9A825' }, { e: '🍓', c: '#E53935' },
  { e: '🫐', c: '#5C6BC0' }, { e: '🍑', c: '#FFB74D' }, { e: '🥝', c: '#8BC34A' },
  { e: '🍍', c: '#FBC02D' }, { e: '🍌', c: '#FDD835' }, { e: '🌿', c: '#66BB6A' },
  { e: '🧋', c: '#C79A6B' }, { e: '🥤', c: '#EF6C9C' }, { e: '🍵', c: '#7CB342' },
  { e: '☕', c: '#795548' },
]

const GAME_SECONDS = 45
const TARGET = 250
const PROMO_CODE = 'SLICE15'

type Phase = 'intro' | 'playing' | 'won' | 'lost'

interface Obj {
  x: number; y: number; vx: number; vy: number
  rot: number; vr: number; r: number
  e: string; c: string; sliced: boolean
}
interface Particle {
  x: number; y: number; vx: number; vy: number
  life: number; maxLife: number; c: string; size: number
  e?: string; rot?: number; vr?: number
}
interface TrailPt { x: number; y: number; t: number }

const rand = (a: number, b: number) => a + Math.random() * (b - a)

export default function PlayPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [phase, setPhase] = useState<Phase>('intro')
  const [score, setScore] = useState(0)
  const [timeLeft, setTimeLeft] = useState(GAME_SECONDS)
  const [copied, setCopied] = useState(false)

  const reduced =
    typeof window !== 'undefined' &&
    !!window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches

  // Mutable game state (refs — avoid re-rendering every frame)
  const objs = useRef<Obj[]>([])
  const parts = useRef<Particle[]>([])
  const trail = useRef<TrailPt[]>([])
  const scoreRef = useRef(0)
  const combo = useRef({ n: 0, last: 0 })
  const down = useRef(false)
  const prev = useRef<{ x: number; y: number } | null>(null)
  const running = useRef(false)
  const startedAt = useRef(0)
  const lastSpawn = useRef(0)
  const shownSecond = useRef(GAME_SECONDS)

  const finish = useCallback((won: boolean) => {
    running.current = false
    setPhase(won ? 'won' : 'lost')
  }, [])

  const start = useCallback(() => {
    objs.current = []
    parts.current = []
    trail.current = []
    scoreRef.current = 0
    combo.current = { n: 0, last: 0 }
    prev.current = null
    setScore(0)
    setTimeLeft(GAME_SECONDS)
    setCopied(false)
    shownSecond.current = GAME_SECONDS
    startedAt.current = performance.now()
    lastSpawn.current = 0
    running.current = true
    setPhase('playing')
  }, [])

  // distance from point P to segment AB
  function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
    const dx = bx - ax, dy = by - ay
    const len = dx * dx + dy * dy
    let t = len ? ((px - ax) * dx + (py - ay) * dy) / len : 0
    t = Math.max(0, Math.min(1, t))
    const cx = ax + t * dx, cy = ay + t * dy
    return Math.hypot(px - cx, py - cy)
  }

  const slice = useCallback((o: Obj) => {
    o.sliced = true
    const now = performance.now()
    combo.current.n = now - combo.current.last < 380 ? combo.current.n + 1 : 1
    combo.current.last = now
    const mult = Math.min(combo.current.n, 5)
    scoreRef.current += 10 * mult
    setScore(scoreRef.current)

    // juice splash
    const drops = reduced ? 4 : 12
    for (let i = 0; i < drops; i++) {
      const a = rand(0, Math.PI * 2)
      const s = rand(60, 320)
      parts.current.push({
        x: o.x, y: o.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: 0.55, maxLife: 0.55, c: o.c, size: rand(3, 7),
      })
    }
    // two flying halves
    for (const dir of [-1, 1]) {
      parts.current.push({
        x: o.x, y: o.y, vx: dir * rand(120, 240), vy: rand(-320, -140),
        life: 0.9, maxLife: 0.9, c: o.c, size: o.r * 1.4,
        e: o.e, rot: o.rot, vr: dir * rand(4, 9),
      })
    }
  }, [reduced])

  // Main loop + input, active only while playing
  useEffect(() => {
    if (phase !== 'playing') return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let W = 0, H = 0
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const resize = () => {
      W = canvas.clientWidth
      H = canvas.clientHeight
      canvas.width = Math.round(W * dpr)
      canvas.height = Math.round(H * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    const pt = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect()
      return { x: e.clientX - r.left, y: e.clientY - r.top }
    }
    const onDown = (e: PointerEvent) => {
      down.current = true
      prev.current = pt(e)
      canvas.setPointerCapture?.(e.pointerId)
    }
    const onMove = (e: PointerEvent) => {
      if (!down.current) return
      const p = pt(e)
      const pr = prev.current ?? p
      trail.current.push({ x: p.x, y: p.y, t: performance.now() })
      for (const o of objs.current) {
        if (o.sliced) continue
        if (segDist(o.x, o.y, pr.x, pr.y, p.x, p.y) < o.r + 6) slice(o)
      }
      prev.current = p
    }
    const onUp = () => { down.current = false; prev.current = null }

    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)

    const G = 1500
    let last = performance.now()
    let raf = 0

    const frame = (now: number) => {
      if (!running.current) return
      const dt = Math.min((now - last) / 1000, 0.05)
      last = now
      const elapsed = (now - startedAt.current) / 1000

      // timer
      const sec = Math.max(0, Math.ceil(GAME_SECONDS - elapsed))
      if (sec !== shownSecond.current) { shownSecond.current = sec; setTimeLeft(sec) }
      if (elapsed >= GAME_SECONDS) { finish(scoreRef.current >= TARGET); return }

      // spawn (ramps up over time)
      const interval = Math.max(360, 780 - elapsed * 8)
      if (now - lastSpawn.current > interval) {
        lastSpawn.current = now
        const n = Math.random() < 0.35 ? 2 : 1
        for (let i = 0; i < n; i++) {
          const it = ITEMS[Math.floor(Math.random() * ITEMS.length)]
          objs.current.push({
            x: rand(W * 0.15, W * 0.85), y: H + 40,
            vx: rand(-160, 160), vy: -rand(880, 1180),
            rot: 0, vr: rand(-4, 4), r: 26,
            e: it.e, c: it.c, sliced: false,
          })
        }
      }

      // update objects
      for (const o of objs.current) {
        o.vy += G * dt
        o.x += o.vx * dt
        o.y += o.vy * dt
        o.rot += o.vr * dt
      }
      objs.current = objs.current.filter((o) => !(o.y > H + 70 && o.vy > 0) && !o.sliced)

      // update particles
      for (const p of parts.current) {
        p.vy += G * 0.6 * dt
        p.x += p.vx * dt
        p.y += p.vy * dt
        p.life -= dt
        if (p.vr != null) p.rot = (p.rot ?? 0) + p.vr * dt
      }
      parts.current = parts.current.filter((p) => p.life > 0)

      // trim trail
      const tnow = performance.now()
      trail.current = trail.current.filter((tp) => tnow - tp.t < 130)

      // ---- draw ----
      ctx.clearRect(0, 0, W, H)

      // particles first (behind objects)
      for (const p of parts.current) {
        const a = Math.max(0, p.life / p.maxLife)
        if (p.e) {
          ctx.save()
          ctx.globalAlpha = a
          ctx.translate(p.x, p.y)
          ctx.rotate(p.rot ?? 0)
          ctx.font = `${p.size}px serif`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText(p.e, 0, 0)
          ctx.restore()
        } else {
          ctx.globalAlpha = a
          ctx.fillStyle = p.c
          ctx.beginPath()
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
          ctx.fill()
        }
      }
      ctx.globalAlpha = 1

      // objects
      for (const o of objs.current) {
        ctx.save()
        ctx.translate(o.x, o.y)
        ctx.rotate(o.rot)
        ctx.font = `${o.r * 2}px serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(o.e, 0, 0)
        ctx.restore()
      }

      // blade trail
      if (trail.current.length > 1) {
        ctx.strokeStyle = 'rgba(240,234,214,0.85)'
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        for (let i = 1; i < trail.current.length; i++) {
          const a = trail.current[i - 1], b = trail.current[i]
          ctx.globalAlpha = i / trail.current.length
          ctx.lineWidth = (i / trail.current.length) * 6
          ctx.beginPath()
          ctx.moveTo(a.x, a.y)
          ctx.lineTo(b.x, b.y)
          ctx.stroke()
        }
        ctx.globalAlpha = 1
      }

      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [phase, slice, finish])

  const copy = () => {
    navigator.clipboard?.writeText(PROMO_CODE).then(
      () => { setCopied(true); setTimeout(() => setCopied(false), 1800) },
      () => {},
    )
  }

  const pct = Math.min(100, Math.round((score / TARGET) * 100))

  return (
    <div
      className="relative min-h-screen overflow-hidden"
      style={{ background: 'radial-gradient(120% 90% at 50% 0%, #17240E 0%, #0B0F0A 70%)' }}
    >
      {/* Canvas layer (only while playing) */}
      {phase === 'playing' && (
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full"
          style={{ touchAction: 'none' }}
        />
      )}

      {/* HUD */}
      {phase === 'playing' && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 px-5 pt-5">
          <div className="flex items-center justify-between text-cream">
            <span className="font-mono text-lg">⏱ {timeLeft}s</span>
            <span className="font-mono text-lg">{score} / {TARGET}</span>
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-surface-3">
            <div className="h-full rounded-full bg-amber-watch transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}

      {/* Intro */}
      {phase === 'intro' && (
        <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-8 text-center">
          <div className="text-6xl">🔪🥗</div>
          <h1 className="mt-4 font-display text-4xl text-cream">Shishka Slice</h1>
          <p className="mt-3 max-w-xs text-cream/70">
            Slice the fresh ingredients — hit <b className="text-amber-watch">{TARGET} points</b> in{' '}
            {GAME_SECONDS}s and unlock <b className="text-amber-watch">15% off</b> your first order.
          </p>
          <button
            type="button"
            onClick={start}
            className="mt-8 rounded-full bg-royal-red px-10 py-3 text-lg font-medium text-cream shadow-xl transition active:scale-95"
          >
            Play
          </button>
          {reduced && (
            <button
              type="button"
              onClick={() => finish(true)}
              className="mt-4 text-sm text-cream/60 underline"
            >
              I prefer no motion — just give me the code
            </button>
          )}
          <Link to="/" className="mt-6 text-sm text-cream/50 underline">
            Back to menu
          </Link>
        </div>
      )}

      {/* Won */}
      {phase === 'won' && (
        <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-8 text-center">
          <div className="text-6xl">🎉</div>
          <h1 className="mt-4 font-display text-3xl text-cream">Fresh cut!</h1>
          <p className="mt-2 text-cream/70">You scored {score}. Here's your reward:</p>
          <div className="mt-6 rounded-2xl border border-amber-watch/40 bg-surface-2 px-8 py-6">
            <p className="text-sm text-cream/60">15% OFF your first order</p>
            <p className="mt-1 font-mono text-3xl tracking-widest text-amber-watch">{PROMO_CODE}</p>
            <button
              type="button"
              onClick={copy}
              className="mt-3 rounded-full border border-cream/20 px-4 py-1.5 text-sm text-cream transition active:scale-95"
            >
              {copied ? 'Copied ✓' : 'Copy code'}
            </button>
          </div>
          <p className="mt-3 max-w-xs text-xs text-cream/40">Show this code at the counter.</p>
          <Link
            to="/"
            className="mt-6 rounded-full bg-forest-soft px-8 py-3 font-medium text-surface-1 transition active:scale-95"
          >
            Order now
          </Link>
        </div>
      )}

      {/* Lost */}
      {phase === 'lost' && (
        <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-8 text-center">
          <div className="text-6xl">🥲</div>
          <h1 className="mt-4 font-display text-3xl text-cream">So close!</h1>
          <p className="mt-2 text-cream/70">You scored {score} — you need {TARGET}. One more go?</p>
          <button
            type="button"
            onClick={start}
            className="mt-8 rounded-full bg-royal-red px-10 py-3 text-lg font-medium text-cream shadow-xl transition active:scale-95"
          >
            Try again
          </button>
          <Link to="/" className="mt-6 text-sm text-cream/50 underline">
            Back to menu
          </Link>
        </div>
      )}
    </div>
  )
}
