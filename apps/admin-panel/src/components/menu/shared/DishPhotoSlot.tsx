interface DishPhotoSlotProps {
  imageUrl: string | null
  dishName: string
  aspect?: 'video' | 'square' | 'photo'
  className?: string
}

/** Presentation of a dish hero image — or, when missing, an Alegreya-italic
 * typographic fallback that echoes the hand-lettered editorial feel of the
 * Menu Page brand. No owner-specific props. */
export function DishPhotoSlot({
  imageUrl,
  dishName,
  aspect = 'video',
  className = '',
}: DishPhotoSlotProps) {
  const aspectCls =
    aspect === 'square' ? 'aspect-square' : aspect === 'photo' ? 'aspect-[4/3]' : 'aspect-video'

  if (imageUrl) {
    return (
      <div className={`relative w-full overflow-hidden bg-[var(--color-surface-2)] ${aspectCls} ${className}`}>
        <img
          src={imageUrl}
          alt={dishName}
          className="h-full w-full object-cover"
          loading="lazy"
        />
      </div>
    )
  }

  const initial = dishName.trim().charAt(0).toUpperCase() || '·'

  return (
    <div
      className={`relative flex w-full items-center justify-center overflow-hidden bg-[var(--color-surface-2)] ${aspectCls} ${className}`}
      aria-label={`${dishName} (no photo)`}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-[var(--color-surface-3)] via-[var(--color-surface-2)] to-[var(--color-surface-1)]" />
      <span
        className="relative italic text-[color:var(--color-cream)]/70 select-none"
        style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(2.25rem, 12vw, 4.5rem)', lineHeight: 1 }}
      >
        {initial}
      </span>
      <span
        className="absolute bottom-2 right-3 font-mono text-[9px] uppercase tracking-widest text-[color:var(--color-cream)]/30"
      >
        No photo
      </span>
    </div>
  )
}
