import { RecipeBuilder } from '../components/RecipeBuilder'

export function BOMHub() {
  return (
    <div className="flex flex-col gap-6">
      {/* Page title */}
      <div>
        <h1 className="text-lg font-semibold text-slate-100">BOM Hub</h1>
        <p className="text-sm text-slate-500">
          Lego-style builder for nomenclature & BOM structures (RAW → PF → MOD → SALE)
        </p>
      </div>

      <RecipeBuilder />
    </div>
  )
}
