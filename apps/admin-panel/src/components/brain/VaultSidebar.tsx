import { useEffect, useMemo, useState, useCallback } from 'react'
import {
  ChevronRight,
  ChevronDown,
  FileText,
  Folder,
  FolderOpen,
} from 'lucide-react'
import { buildFolderNodes, type VaultJson } from '../../lib/vault'

interface Props {
  vault: VaultJson
  selectedPath: string
  onSelect: (path: string) => void
  /** When true, render a more compact sidebar (smaller fonts, narrower). Default: false. */
  compact?: boolean
}

export function VaultSidebar({ vault, selectedPath, onSelect, compact = false }: Props) {
  const folderNodes = useMemo(() => buildFolderNodes(vault.tree), [vault.tree])

  // Track expanded folders. Auto-expand the folder containing the selected page.
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    if (!selectedPath) return new Set()
    return new Set([selectedPath.split('/')[0]])
  })

  useEffect(() => {
    if (!selectedPath) return
    const folder = selectedPath.split('/')[0]
    setExpanded((prev) => (prev.has(folder) ? prev : new Set([...prev, folder])))
  }, [selectedPath])

  const toggleFolder = useCallback((folder: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(folder)) next.delete(folder)
      else next.add(folder)
      return next
    })
  }, [])

  const fontClass = compact ? 'text-[11px]' : 'text-xs'

  return (
    <div className="h-full overflow-y-auto p-2">
      <div
        className={[
          'mb-2 flex items-center justify-between px-2 py-1 uppercase tracking-wide text-slate-500',
          compact ? 'text-[9px]' : 'text-[10px]',
        ].join(' ')}
      >
        <span>Vault</span>
        <span>{vault.count} pages</span>
      </div>
      {folderNodes.map((node) => {
        const isExpanded = expanded.has(node.name)
        const indexActive = node.index?.path === selectedPath
        return (
          <div key={node.name} className="mb-1">
            <button
              type="button"
              onClick={() => toggleFolder(node.name)}
              className={[
                'group flex w-full items-center gap-1 rounded px-2 py-1 text-left text-slate-300 hover:bg-slate-800/50',
                fontClass,
              ].join(' ')}
            >
              {isExpanded ? (
                <ChevronDown className="h-3 w-3 shrink-0 text-slate-500" />
              ) : (
                <ChevronRight className="h-3 w-3 shrink-0 text-slate-500" />
              )}
              {isExpanded ? (
                <FolderOpen className="h-3.5 w-3.5 shrink-0 text-amber-400" />
              ) : (
                <Folder className="h-3.5 w-3.5 shrink-0 text-slate-500" />
              )}
              <span className="truncate font-medium">{node.name}</span>
              <span className="ml-auto text-[10px] text-slate-600">
                {node.pages.length + (node.index ? 1 : 0)}
              </span>
            </button>
            {isExpanded && (
              <div className="ml-5 border-l border-slate-800 pl-1">
                {node.index && (
                  <button
                    type="button"
                    onClick={() => onSelect(node.index!.path)}
                    className={pageBtnClass(indexActive, fontClass)}
                  >
                    <FileText className="h-3 w-3 shrink-0" />
                    <span className="truncate italic">overview</span>
                  </button>
                )}
                {node.pages.map((p) => {
                  const isActive = p.path === selectedPath
                  const label = p.path.split('/').slice(1).join('/').replace(/\.md$/, '')
                  return (
                    <button
                      key={p.path}
                      type="button"
                      onClick={() => onSelect(p.path)}
                      className={pageBtnClass(isActive, fontClass)}
                    >
                      <FileText className="h-3 w-3 shrink-0" />
                      <span className="truncate">{label || p.title}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function pageBtnClass(active: boolean, font: string): string {
  return [
    'flex w-full items-center gap-1.5 rounded px-2 py-1 text-left',
    font,
    active
      ? 'bg-fuchsia-500/10 text-fuchsia-300'
      : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200',
  ].join(' ')
}
