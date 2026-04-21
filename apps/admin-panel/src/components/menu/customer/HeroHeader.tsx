interface HeroHeaderProps {
  title?: string
  tagline?: string
  heroImageUrl?: string | null
  /** Optional kicker (small label above title, Alegreya SC). */
  kicker?: string
}

/** Customer-facing menu hero. Editorial feel: Alegreya display title,
 * Geist tagline, dark surface with optional photographic backdrop.
 * Designed to lift unchanged to the future shishka.health/menu site. */
export function HeroHeader({
  title = 'The Menu',
  tagline = 'Cooked clean. Served warm. Priced honest.',
  heroImageUrl = null,
  kicker = 'Shishka Kitchen',
}: HeroHeaderProps) {
  return (
    <header
      className="relative overflow-hidden rounded-2xl border border-surface-3 bg-surface-2"
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
            className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--color-cream)]/60"
            style={{ fontFamily: 'var(--font-display-sc)' }}
          >
            {kicker}
          </span>
        )}
        <h1
          className="italic text-[color:var(--color-cream)]"
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(2rem, 6vw, 3.75rem)',
            lineHeight: 1.05,
            fontWeight: 500,
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
