// Tiny Web Audio chime for new-order alerts — no audio asset needed.
//
// Browsers start an AudioContext suspended until a user gesture. Call
// `unlockAudio()` from a click handler once (e.g. anywhere on the Orders page);
// after that `playNewOrderChime()` will sound. If audio is still locked (no
// gesture yet), playback is a silent no-op rather than throwing.

let ctx: AudioContext | null = null

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    const AC: typeof AudioContext | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return null
    ctx = new AC()
  }
  return ctx
}

/** Resume the audio context after a user gesture (call from a click handler). */
export function unlockAudio(): void {
  const c = getCtx()
  if (c && c.state === 'suspended') void c.resume()
}

/** A short, pleasant two-tone chime (A5 → E6) announcing a new order. */
export function playNewOrderChime(): void {
  const c = getCtx()
  if (!c) return
  if (c.state === 'suspended') void c.resume()

  const now = c.currentTime
  const notes = [
    { freq: 880, at: 0 }, // A5
    { freq: 1318.5, at: 0.13 }, // E6
  ]
  for (const n of notes) {
    const osc = c.createOscillator()
    const gain = c.createGain()
    osc.type = 'sine'
    osc.frequency.value = n.freq
    gain.gain.setValueAtTime(0.0001, now + n.at)
    gain.gain.exponentialRampToValueAtTime(0.25, now + n.at + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + n.at + 0.35)
    osc.connect(gain)
    gain.connect(c.destination)
    osc.start(now + n.at)
    osc.stop(now + n.at + 0.4)
  }
}
