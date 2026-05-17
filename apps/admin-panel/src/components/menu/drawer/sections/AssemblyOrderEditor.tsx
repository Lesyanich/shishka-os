import { Plus, X, GripVertical } from 'lucide-react'

interface AssemblyStep {
  step: number
  text: string
}

interface AssemblyOrderEditorProps {
  steps: AssemblyStep[]
  onChange: (steps: AssemblyStep[]) => void
  readOnly?: boolean
}

export function AssemblyOrderEditor({
  steps,
  onChange,
  readOnly,
}: AssemblyOrderEditorProps) {
  const addStep = () => {
    const next = [...steps, { step: steps.length + 1, text: '' }]
    onChange(next)
  }

  const removeStep = (idx: number) => {
    const next = steps
      .filter((_, i) => i !== idx)
      .map((s, i) => ({ ...s, step: i + 1 }))
    onChange(next)
  }

  const updateText = (idx: number, text: string) => {
    const next = steps.map((s, i) => (i === idx ? { ...s, text } : s))
    onChange(next)
  }

  if (readOnly) {
    if (steps.length === 0)
      return (
        <span className="text-xs text-cream/40">
          No assembly steps defined
        </span>
      )
    return (
      <ol className="space-y-1.5">
        {steps.map((s) => (
          <li key={s.step} className="flex items-start gap-2 text-xs">
            <span className="shrink-0 rounded-full bg-surface-3 px-1.5 py-0.5 font-mono text-[10px] text-cream/50">
              {s.step}
            </span>
            <span className="text-cream/80">
              {s.text || (
                <span className="italic text-cream/40">empty</span>
              )}
            </span>
          </li>
        ))}
      </ol>
    )
  }

  return (
    <div className="space-y-2">
      {steps.map((s, idx) => (
        <div key={idx} className="flex items-center gap-2">
          <GripVertical className="h-3.5 w-3.5 shrink-0 text-cream/30" />
          <span className="w-4 shrink-0 text-right font-mono text-[10px] text-cream/50">
            {s.step}
          </span>
          <input
            value={s.text}
            onChange={(e) => updateText(idx, e.target.value)}
            placeholder={`Step ${s.step}...`}
            className="flex-1 rounded border border-surface-3 bg-surface-2 px-2 py-1 text-xs text-cream placeholder:text-cream/30 focus:border-forest-soft focus:outline-none"
          />
          <button
            type="button"
            onClick={() => removeStep(idx)}
            className="rounded p-0.5 text-cream/40 hover:bg-surface-3 hover:text-brick-soft"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={addStep}
        className="flex items-center gap-1 rounded-lg border border-dashed border-surface-3 px-2.5 py-1 text-[10px] text-cream/50 transition hover:border-forest-soft/50 hover:text-forest-soft"
      >
        <Plus className="h-3 w-3" />
        Add step
      </button>
    </div>
  )
}
