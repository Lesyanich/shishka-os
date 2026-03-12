import { useState } from 'react'
import { Mic, Send } from 'lucide-react'

export interface SmartTextInputProps {
  /** Called when user presses Enter or clicks Send — text is passed to ExpenseForm's details field */
  onSubmitText: (text: string) => void
}

export function SmartTextInput({ onSubmitText }: SmartTextInputProps) {
  const [text, setText] = useState('')

  const handleSubmit = () => {
    const trimmed = text.trim()
    if (!trimmed) return
    onSubmitText(trimmed)
    setText('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div className="relative">
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Quick log: Paid 1500 to Makro for vegetables yesterday..."
        className="h-11 w-full rounded-xl border border-slate-700 bg-slate-900/50 pl-4 pr-20 text-sm text-slate-100 placeholder:text-slate-600 outline-none transition focus:border-violet-500/60 focus:bg-slate-900"
      />
      <div className="absolute right-2 top-1/2 flex -translate-y-1/2 gap-1">
        {/* Mic button — UI stub for future Web Speech API */}
        <button
          type="button"
          title="Voice input (coming soon)"
          className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-800 hover:text-slate-300"
          onClick={() => {
            // Future: Web Speech API integration
          }}
        >
          <Mic className="h-4 w-4" />
        </button>
        {/* Send button */}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!text.trim()}
          title="Send to form"
          className="rounded-lg p-1.5 text-violet-400 transition hover:bg-violet-500/15 disabled:text-slate-600 disabled:hover:bg-transparent"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
