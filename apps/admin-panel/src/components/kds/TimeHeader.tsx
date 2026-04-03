/** 24-hour time ruler for the Gantt chart */
export function TimeHeader() {
  const hours = Array.from({ length: 24 }, (_, i) => i)

  return (
    <div className="relative flex h-8 border-b border-slate-700">
      {hours.map((h) => (
        <div
          key={h}
          className="flex-1 border-r border-slate-800 text-center text-[10px] leading-8 text-slate-500"
        >
          {String(h).padStart(2, '0')}
        </div>
      ))}
    </div>
  )
}
