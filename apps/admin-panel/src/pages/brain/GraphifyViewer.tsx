import { useState } from 'react'
import { GitGraph, Maximize2, Minimize2 } from 'lucide-react'

const STATS = { nodes: 1_750, edges: 1_906, communities: 304 }

export function GraphifyViewer() {
  const [fullscreen, setFullscreen] = useState(false)

  return (
    <div className={fullscreen ? 'fixed inset-0 z-50 flex flex-col bg-slate-950' : 'flex h-full flex-col'}>
      {/* Stats bar */}
      <div className="flex items-center justify-between rounded-t-lg border border-slate-800 bg-slate-900/70 px-3 py-2 text-[11px]">
        <div className="flex items-center gap-4 text-slate-400">
          <span className="flex items-center gap-1.5">
            <GitGraph className="h-3 w-3 text-fuchsia-400" />
            <span className="text-slate-200">{STATS.nodes.toLocaleString()}</span> nodes
          </span>
          <span>
            <span className="text-slate-200">{STATS.edges.toLocaleString()}</span> edges
          </span>
          <span>
            <span className="text-slate-200">{STATS.communities}</span> communities
          </span>
        </div>
        <button
          onClick={() => setFullscreen((f) => !f)}
          className="rounded p-1 text-slate-500 hover:bg-slate-700 hover:text-slate-300"
          title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
        >
          {fullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
        </button>
      </div>

      {/* Graph iframe */}
      <iframe
        src="/graph.html"
        title="Graphify knowledge graph"
        className="flex-1 rounded-b-lg border border-t-0 border-slate-800"
        style={{ minHeight: fullscreen ? undefined : 500 }}
      />
    </div>
  )
}
