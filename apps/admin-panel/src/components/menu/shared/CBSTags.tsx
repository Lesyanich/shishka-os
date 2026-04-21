import type { MenuTagSummary } from './types'

interface CBSTagsProps {
  tags: MenuTagSummary[]
  max?: number
  size?: 'sm' | 'md'
}

export function CBSTags({ tags, max, size = 'sm' }: CBSTagsProps) {
  if (tags.length === 0) return null
  const shown = max != null ? tags.slice(0, max) : tags
  const overflow = max != null ? Math.max(0, tags.length - max) : 0
  const sizeCls =
    size === 'md' ? 'px-2.5 py-1 text-xs' : 'px-2 py-0.5 text-[10px]'

  return (
    <div className="flex flex-wrap gap-1">
      {shown.map((tag) => (
        <span
          key={tag.slug}
          className={`rounded-full font-medium ${sizeCls} bg-surface-3 text-muted`}
          style={
            tag.color
              ? { backgroundColor: `${tag.color}20`, color: tag.color }
              : undefined
          }
        >
          {tag.name}
        </span>
      ))}
      {overflow > 0 && (
        <span
          className={`rounded-full font-medium text-muted ${sizeCls} bg-surface-2`}
        >
          +{overflow}
        </span>
      )}
    </div>
  )
}
