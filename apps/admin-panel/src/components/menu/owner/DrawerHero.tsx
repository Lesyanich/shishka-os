import type { MenuItem } from '../../../hooks/useMenuData'
import { DishPhotoSlot } from '../shared/DishPhotoSlot'

interface DrawerHeroProps {
  item: MenuItem
}

export function DrawerHero({ item }: DrawerHeroProps) {
  return (
    <section className="space-y-3">
      <DishPhotoSlot imageUrl={item.image_url} dishName={item.name} aspect="photo" />

      {item.category_name && (
        <span
          className="block text-[10px] uppercase tracking-[0.18em] text-[color:var(--color-cream)]/55"
          style={{ fontFamily: 'var(--font-display-sc)' }}
        >
          {item.category_name}
        </span>
      )}

      <h2
        className="leading-tight text-[color:var(--color-cream)]"
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: '1.75rem',
          fontWeight: 500,
          fontStyle: 'italic',
        }}
      >
        {item.name}
      </h2>

      <div
        className="font-mono text-[10px] uppercase tracking-wider text-[color:var(--color-cream)]/40"
      >
        {item.product_code}
      </div>

      {item.description && (
        <p
          className="text-sm leading-relaxed text-[color:var(--color-cream)]/75"
          style={{ fontFamily: 'var(--font-sans)' }}
        >
          {item.description}
        </p>
      )}
    </section>
  )
}
