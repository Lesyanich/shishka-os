import { BOMHealthBar } from '../components/control-center/BOMHealthBar'
import { CapExMiniChart } from '../components/control-center/CapExMiniChart'
import { EquipmentAlerts } from '../components/control-center/EquipmentAlerts'
import { HeroKPIRow } from '../components/control-center/HeroKPIRow'
import { KitchenStatusKanban } from '../components/control-center/KitchenStatusKanban'
import { useBOMCoverage } from '../hooks/useBOMCoverage'
import { useCapEx } from '../hooks/useCapEx'
import { useEquipment } from '../hooks/useEquipment'
import { useKitchenTasks } from '../hooks/useKitchenTasks'

export function ControlCenter() {
  const tasks = useKitchenTasks()
  const capex = useCapEx()
  const equipment = useEquipment()
  const bom = useBOMCoverage()

  return (
    <div className="flex flex-col gap-6">
      {/* Page title */}
      <div>
        <h1 className="text-lg font-semibold text-slate-100">Control Center</h1>
        <p className="text-sm text-slate-500">CEO overview — real-time data from Supabase</p>
      </div>

      {/* Row 1: Hero KPIs */}
      <HeroKPIRow
        taskCounts={tasks.counts}
        monthlyCapEx={capex.monthlyTotal}
        equipmentTotal={equipment.totalCount}
        bomPercentage={bom.percentage}
        bomWithBOM={bom.withBOM}
        bomTotal={bom.total}
        equipmentAlerts={equipment.alertCount}
        isLoadingTasks={tasks.isLoading}
        isLoadingCapEx={capex.isLoading}
        isLoadingEquipment={equipment.isLoading}
        isLoadingBOM={bom.isLoading}
      />

      {/* Row 2: Kitchen Status Kanban — PRIMARY widget, full width */}
      <KitchenStatusKanban
        byStatus={tasks.byStatus}
        isLoading={tasks.isLoading}
        error={tasks.error}
        onRefresh={tasks.refetch}
      />

      {/* Row 3: CapEx chart + Equipment alerts */}
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <CapExMiniChart
          byCategory={capex.byCategory}
          isLoading={capex.isLoading}
          error={capex.error}
        />
        <EquipmentAlerts
          equipment={equipment.equipment}
          isLoading={equipment.isLoading}
          error={equipment.error}
        />
      </div>

      {/* Row 4: BOM Health full width */}
      <BOMHealthBar
        total={bom.total}
        withBOM={bom.withBOM}
        missing={bom.missing}
        percentage={bom.percentage}
        isLoading={bom.isLoading}
        error={bom.error}
      />
    </div>
  )
}
