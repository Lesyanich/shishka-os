import { useState } from 'react'
import { CalendarDays, Users, LayoutTemplate } from 'lucide-react'
import { StaffList } from '../components/schedule/StaffList'
import { WeekCalendar } from '../components/schedule/WeekCalendar'
import { BulkScheduleGenerator } from '../components/schedule/BulkScheduleGenerator'
import { KitchenNav } from '../components/KitchenNav'

type Tab = 'schedule' | 'staff' | 'templates'

const TABS: { id: Tab; label: string; icon: typeof CalendarDays }[] = [
  { id: 'schedule', label: 'Schedule', icon: CalendarDays },
  { id: 'staff', label: 'Staff', icon: Users },
  { id: 'templates', label: 'Templates', icon: LayoutTemplate },
]

export function ScheduleManager() {
  const [activeTab, setActiveTab] = useState<Tab>('schedule')

  return (
    <div className="space-y-4">
      <KitchenNav />
      <h1 className="text-lg font-bold text-slate-100">Schedule Manager</h1>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl bg-slate-900/50 p-1">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={[
              'flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition',
              activeTab === id
                ? 'bg-slate-800 text-emerald-300 shadow-sm'
                : 'text-slate-400 hover:text-slate-200',
            ].join(' ')}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'schedule' && <WeekCalendar />}
      {activeTab === 'staff' && <StaffList />}
      {activeTab === 'templates' && <BulkScheduleGenerator />}
    </div>
  )
}
