import { X, FileText, Tag } from 'lucide-react'
import type { LightragEdge, LightragNode } from '../../../api/lightrag'

interface NodeDetailPanelProps {
  node: LightragNode
  relatedEdges: LightragEdge[]
  onClose: () => void
  onSelectNode: (id: string) => void
}

export function NodeDetailPanel({ node, relatedEdges, onClose, onSelectNode }: NodeDetailPanelProps) {
  const props = node.properties
  const filePath = typeof props.file_path === 'string' ? props.file_path : null

  return (
    <div className="flex h-full w-80 shrink-0 flex-col border-l border-slate-800 bg-slate-950">
      <header className="flex items-start justify-between gap-2 border-b border-slate-800 px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-100">{node.id}</p>
          {props.entity_type && (
            <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-fuchsia-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-fuchsia-300">
              <Tag className="h-3 w-3" />
              {props.entity_type}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-slate-500 transition hover:bg-slate-800 hover:text-slate-200"
          aria-label="Close detail panel"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-3 text-xs text-slate-300">
        {props.description && (
          <section className="mb-4">
            <h3 className="mb-1 text-[10px] uppercase tracking-wider text-slate-500">Description</h3>
            <p className="leading-relaxed text-slate-300">{props.description}</p>
          </section>
        )}

        {filePath && (
          <section className="mb-4">
            <h3 className="mb-1 text-[10px] uppercase tracking-wider text-slate-500">Source</h3>
            <p className="flex items-start gap-1.5 text-slate-400">
              <FileText className="mt-0.5 h-3 w-3 shrink-0" />
              <span className="break-all font-mono text-[11px]">{filePath}</span>
            </p>
          </section>
        )}

        <section>
          <h3 className="mb-2 text-[10px] uppercase tracking-wider text-slate-500">
            Related ({relatedEdges.length})
          </h3>
          {relatedEdges.length === 0 ? (
            <p className="text-slate-600">No relations indexed.</p>
          ) : (
            <ul className="space-y-1.5">
              {relatedEdges.map((edge) => {
                const otherId = edge.source === node.id ? edge.target : edge.source
                const direction = edge.source === node.id ? '→' : '←'
                return (
                  <li key={edge.id}>
                    <button
                      type="button"
                      onClick={() => onSelectNode(otherId)}
                      className="flex w-full items-start gap-2 rounded px-2 py-1.5 text-left text-slate-300 transition hover:bg-slate-800/80"
                    >
                      <span className="mt-0.5 text-fuchsia-400">{direction}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{otherId}</span>
                        {edge.properties.description && (
                          <span className="block truncate text-[10px] text-slate-500">
                            {edge.properties.description}
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
