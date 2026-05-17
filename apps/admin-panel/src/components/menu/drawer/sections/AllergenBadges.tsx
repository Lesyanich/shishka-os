import { AlertTriangle } from 'lucide-react'
import { allergenDisplayName } from '../../../../hooks/useAllergens'

interface AllergenBadgesProps {
  allergens: string[]
  isLoading: boolean
}

const ALLERGEN_COLORS: Record<string, string> = {
  'allergen-gluten': 'bg-amber-900/40 text-amber-300',
  'allergen-dairy': 'bg-sky-900/40 text-sky-300',
  'allergen-nuts': 'bg-orange-900/40 text-orange-300',
  'allergen-shellfish': 'bg-rose-900/40 text-rose-300',
  'allergen-soy': 'bg-lime-900/40 text-lime-300',
  'allergen-eggs': 'bg-yellow-900/40 text-yellow-300',
  'allergen-fish': 'bg-cyan-900/40 text-cyan-300',
  'allergen-sesame': 'bg-stone-800/60 text-stone-300',
}
const DEFAULT_ALLERGEN_COLOR = 'bg-slate-800 text-slate-300'

export function AllergenBadges({ allergens, isLoading }: AllergenBadgesProps) {
  if (isLoading)
    return <span className="text-xs text-cream/40">Loading allergens...</span>
  if (allergens.length === 0)
    return <span className="text-xs text-cream/40">No allergens detected</span>

  return (
    <div className="flex flex-wrap gap-1.5">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
      {allergens.map((slug) => (
        <span
          key={slug}
          className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${ALLERGEN_COLORS[slug] ?? DEFAULT_ALLERGEN_COLOR}`}
        >
          {allergenDisplayName(slug)}
        </span>
      ))}
    </div>
  )
}
