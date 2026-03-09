interface BOMIngredient {
  ingredient_id: string
  ingredient_code: string
  ingredient_name: string
  quantity_per_unit: number
  yield_loss_pct: number | null
}

interface BOMSnapshotPanelProps {
  snapshot: BOMIngredient[] | null
  isOpen: boolean
  onClose: () => void
}

export function BOMSnapshotPanel({ snapshot, isOpen, onClose }: BOMSnapshotPanelProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center">
      <div className="w-full max-w-md rounded-t-2xl bg-slate-900 p-6 sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-100">
            BOM Snapshot (Frozen at Start)
          </h3>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
          >
            ✕
          </button>
        </div>

        {!snapshot || snapshot.length === 0 ? (
          <p className="text-center text-sm text-slate-500">No BOM data frozen</p>
        ) : (
          <div className="space-y-2">
            {snapshot.map((item) => (
              <div
                key={item.ingredient_id}
                className="flex items-center justify-between rounded-lg bg-slate-800/50 px-3 py-2"
              >
                <div>
                  <p className="text-xs font-medium text-slate-200">
                    {item.ingredient_name}
                  </p>
                  <p className="text-[10px] text-slate-500">{item.ingredient_code}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-medium text-slate-300">
                    {item.quantity_per_unit} kg
                  </p>
                  {item.yield_loss_pct != null && (
                    <p className="text-[10px] text-slate-500">
                      loss: {item.yield_loss_pct}%
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
