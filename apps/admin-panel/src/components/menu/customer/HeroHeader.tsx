interface HeroHeaderProps {
  title?: string
  tagline?: string
  heroImageUrl?: string | null
  /** Optional kicker (small label above title, Alegreya SC). */
  kicker?: string
}

/** Customer-facing menu hero. Editorial feel: Alegreya display title,
 * Geist tagline, dark surface with optional photographic backdrop.
 * Admin-side preview only. The live customer menu is the separate
 * `shishka-health` repo and does not import from here — do not "lift" this. */
export function HeroHeader({
  title = 'The Menu',
  tagline = 'Cooked clean. Served warm. Priced honest.',
  heroImageUrl = null,
  kicker = 'Shishka Kitchen',
}: HeroHeaderProps) {
  return (
    <header
      className="relative overflow-hidden rounded-2xl border border-[var(--line-strong)] bg-[var(--color-surface-2)]"
      role="banner"
    >
      {heroImageUrl ? (
        <>
          <img
            src={heroImageUrl}
            alt=""
            aria-hidden
            className="absolute inset-0 h-full w-full object-cover opacity-40"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-[var(--color-surface-1)]/60 via-[var(--color-surface-1)]/70 to-[var(--color-surface-1)]/90" />
        </>
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-[var(--color-surface-3)] via-[var(--color-surface-2)] to-[var(--color-surface-1)]" />
      )}

      <div className="relative flex flex-col gap-3 px-6 py-10 sm:px-10 sm:py-14">
        {kicker && (
          <span
            className="text-[11px] font-semibold uppercase tracking-[0.2em] text-honey-300"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            {kicker}
          </span>
        )}
        <h1
          className="text-[color:var(--color-cream)]"
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(2rem, 6vw, 3.75rem)',
            lineHeight: 1.02,
            fontWeight: 700,
            letterSpacing: '-0.02em',
          }}
        >
          {title}
        </h1>
        {tagline && (
          <p
            className="max-w-xl text-sm text-[color:var(--color-cream)]/75 sm:text-base"
            style={{ fontFamily: 'var(--font-sans)' }}
          >
            {tagline}
          </p>
        )}
      </div>
    </header>
  )
}
