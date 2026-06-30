import { RecipeBuilder } from '../components/RecipeBuilder'

export function BOMHub() {
  return (
    <div className="menu-canvas -mx-4 flex flex-col gap-6 px-4 pt-5 pb-10 sm:-mx-6 sm:px-6">
      {/* Page title */}
      <div className="flex items-start gap-3.5">
        <span className="shk-seal" aria-hidden>
          S
        </span>
        <div>
          <div className="shk-eyebrow">BOM &middot; builder</div>
          <h1 className="mt-1 font-display text-4xl font-bold leading-none tracking-tight text-cream">
            BOM Hub
          </h1>
          <p className="mt-1.5 text-sm text-cream/45">
            Lego-style builder for nomenclature &amp; BOM structures (RAW → PF → MOD → SALE)
          </p>
        </div>
      </div>

      <RecipeBuilder />
    </div>
  )
}
