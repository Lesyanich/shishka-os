import { AlertTriangle } from 'lucide-react'

interface ContaminationWarningProps {
  bufferReason: string
  bufferMin: number
}

export function ContaminationWarning({ bufferReason, bufferMin }: ContaminationWarningProps) {
  if (!bufferReason.includes('category_change')) return null

  // Parse "category_change: fish → bakery"
  const match = bufferReason.match(/category_change:\s*(\w+)\s*→\s*(\w+)/)
  const from = match?.[1] ?? '?'
  const to = match?.[2] ?? '?'

  return (
    <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
      <AlertTriangle className="h-4 w-4 shrink-0 text-red-400" />
      <span>Deep clean required: <strong>{from}</strong> → <strong>{to}</strong> ({bufferMin} min buffer)</span>
    </div>
  )
}
