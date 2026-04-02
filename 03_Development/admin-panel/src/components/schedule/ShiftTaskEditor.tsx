import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { Equipment } from '../../hooks/useEquipment'

export interface ShiftTaskDraft {
  id?: string
  task_description: string
  start_time: string
  end_time: string
  equipment_id: string | null
  priority: number
}

interface ShiftTaskEditorProps {
  tasks: ShiftTaskDraft[]
  onChange: (tasks: ShiftTaskDraft[]) => void
  equipment: Equipment[]
  shiftStart: string
  shiftEnd: string
}

export function ShiftTaskEditor({ tasks, onChange, equipment, shiftStart, shiftEnd }: ShiftTaskEditorProps) {
  const [collapsed, setCollapsed] = useState(false)

  function addTask() {
    onChange([
      ...tasks,
      {
        task_description: '',
        start_time: shiftStart,
        end_time: shiftEnd,
        equipment_id: null,
        priority: 0,
      },
    ])
  }

  function updateTask(index: number, field: keyof ShiftTaskDraft, value: string | number | null) {
    const updated = [...tasks]
    updated[index] = { ...updated[index], [field]: value }
    onChange(updated)
  }

  function removeTask(index: number) {
    onChange(tasks.filter((_, i) => i !== index))
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          className="text-xs font-medium text-slate-400 hover:text-slate-200"
        >
          Tasks ({tasks.length}) {collapsed ? '▸' : '▾'}
        </button>
        {!collapsed && (
          <button
            type="button"
            onClick={addTask}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-emerald-400 hover:bg-emerald-500/10"
          >
            <Plus className="h-3 w-3" /> Add
          </button>
        )}
      </div>

      {!collapsed && tasks.length > 0 && (
        <div className="space-y-2">
          {tasks.map((task, i) => (
            <div key={i} className="rounded-lg border border-slate-700/50 bg-slate-800/40 p-2 space-y-2">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={task.task_description}
                  onChange={(e) => updateTask(i, 'task_description', e.target.value)}
                  placeholder="Task description"
                  className="flex-1 rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => removeTask(i)}
                  className="rounded p-1.5 text-slate-500 hover:bg-rose-500/10 hover:text-rose-400"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="mb-0.5 block text-[10px] text-slate-500">Start</label>
                  <input
                    type="time"
                    value={task.start_time}
                    onChange={(e) => updateTask(i, 'start_time', e.target.value)}
                    className="w-full rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-slate-100 focus:border-emerald-500 focus:outline-none"
                  />
                </div>
                <div className="flex-1">
                  <label className="mb-0.5 block text-[10px] text-slate-500">End</label>
                  <input
                    type="time"
                    value={task.end_time}
                    onChange={(e) => updateTask(i, 'end_time', e.target.value)}
                    className="w-full rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-slate-100 focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="mb-0.5 block text-[10px] text-slate-500">Equipment</label>
                <select
                  value={task.equipment_id ?? ''}
                  onChange={(e) => updateTask(i, 'equipment_id', e.target.value || null)}
                  className="w-full rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-slate-100 focus:border-emerald-500 focus:outline-none"
                >
                  <option value="">— none —</option>
                  {equipment.map((eq) => (
                    <option key={eq.id} value={eq.id}>
                      {eq.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ))}
        </div>
      )}

      {!collapsed && tasks.length === 0 && (
        <p className="text-xs text-slate-600">No tasks. Click 'Add'.</p>
      )}
    </div>
  )
}
