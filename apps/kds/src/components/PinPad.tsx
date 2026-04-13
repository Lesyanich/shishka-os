import { Delete } from 'lucide-react'

interface PinPadProps {
  pin: string
  onDigit: (digit: string) => void
  onDelete: () => void
  disabled: boolean
}

export function PinPad({ pin, onDigit, onDelete, disabled }: PinPadProps) {
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del']

  return (
    <div className="grid w-72 grid-cols-3 gap-4">
      {keys.map((key) => {
        if (key === '') return <div key="empty" />

        if (key === 'del') {
          return (
            <button
              key="del"
              type="button"
              onClick={onDelete}
              disabled={disabled}
              className="flex h-20 items-center justify-center rounded-2xl bg-slate-800 text-slate-400 transition active:bg-slate-700 active:scale-95 disabled:opacity-50"
            >
              <Delete className="h-6 w-6" />
            </button>
          )
        }

        return (
          <button
            key={key}
            type="button"
            onClick={() => onDigit(key)}
            disabled={disabled || pin.length >= 4}
            className="flex h-20 items-center justify-center rounded-2xl bg-slate-800 text-2xl font-bold text-slate-100 transition active:bg-emerald-500/30 active:text-emerald-300 active:scale-95 disabled:opacity-50"
          >
            {key}
          </button>
        )
      })}
    </div>
  )
}
