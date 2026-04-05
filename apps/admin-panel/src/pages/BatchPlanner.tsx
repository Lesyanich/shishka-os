import { BackwardScheduler } from '../components/planner/BackwardScheduler'
import { KitchenNav } from '../components/KitchenNav'

export function BatchPlanner() {
  return (
    <div className="space-y-4">
      <KitchenNav />
      <BackwardScheduler />
    </div>
  )
}
